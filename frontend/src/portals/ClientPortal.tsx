import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';
import type { Language } from '../translations';
import type { ClientTabType } from '../components/Sidebar';
import { FileExplorer } from '../components/FileExplorer';
import {
  Users,
  FolderTree,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Search,
  ExternalLink,
  Calendar,
  Sparkles,
  ShieldCheck,
  Plus,
  BarChart3,
  Send,
  ArrowUp,
  Building2,
  Pencil,
  Trash2,
  Eye,
  X,
  Check,
  Upload,
  FileImage,
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:5000/api';

interface DocumentRecord {
  id: string;
  client_id?: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  status: string;
  category?: string;
  sub_types?: string[];
  staff_notes?: string;
  expiry_date?: string;
  expiry_info?: {
    has_expiry: boolean;
    expiry_date?: string;
    formatted_date?: string;
    issue_date?: string;
    total_validity_days?: number;
    percentage_remaining?: number;
    is_expired?: boolean;
    days_until_expiry?: number;
    status?: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_EXPIRY';
    doc_title?: string;
    warning_message?: string;
  };
  extracted_data?: {
    supplier_name: string;
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
    skr03_account_code?: string;
    payment_method?: string;
    bookings?: any[];
    skr03_csv_file?: string;
    monthly_csv_file?: string;
    target_year?: string;
    target_month?: string;
    target_folder?: string;
  };
  relative_path?: string;
}

interface PayrollSubmission {
  id: string;
  client_id: string;
  employee_name: string;
  submission_type: 'NEW_HIRE' | 'HOURS_OVERTIME' | 'SICK_NOTE' | 'BONUS';
  period: string;
  data_json: any;
  status: 'SUBMITTED' | 'VERIFIED' | 'PROCESSED';
  created_at: string;
}

interface PayslipRecord {
  id: string;
  client_id: string;
  employee_name: string;
  period: string;
  gross_salary: number;
  net_salary: number;
  tax_deduction: number;
  social_security: number;
  created_at: string;
}

interface ClientPortalProps {
  lang: Language;
  documents: DocumentRecord[];
  onUpload: (file: File, folder?: string) => Promise<void>;
  uploading: boolean;
  externalTab?: ClientTabType | 'DOCS';
  onTabChange?: (tab: ClientTabType) => void;
  onLanguageChange?: (l: Language) => void;
}

type ModalCategory = 'FORMATION' | 'PAYROLL' | 'ACCOUNTING' | 'CORRESPONDENCE' | null;

export const ClientPortal: React.FC<ClientPortalProps> = ({
  lang,
  documents,
  onUpload: _onUpload,
  uploading: _uploading,
  externalTab = 'OVERVIEW',
  onTabChange,
  onLanguageChange,
}) => {
  const { user } = useAuth();
  const { success, error } = useSnackbar();

  // Active Submission Modal
  const [activeModal, setActiveModal] = useState<ModalCategory>(null);

  // Modal Form State
  const isDe = lang === 'de';
  const [selectedMonth, setSelectedMonth] = useState(isDe ? 'Januar' : 'January');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [modalFiles, setModalFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submissions search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ATTENTION' | 'APPROVED'>('ALL');

  // Active Internal Tab inside Client Portal
  const [activeInternalTab, setActiveInternalTab] = useState<'SUBMISSIONS' | 'TASKS' | 'PAYROLL' | 'VAULT' | 'FORMATION'>('SUBMISSIONS');

  // Formation Documents state & Actions
  const [editingDoc, setEditingDoc] = useState<DocumentRecord | null>(null);
  const [editFilename, setEditFilename] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSubTypes, setEditSubTypes] = useState<string[]>([]);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [formationSearch, setFormationSearch] = useState('');
  const [formationFilter, setFormationFilter] = useState<'ALL' | 'VALID' | 'EXPIRING' | 'EXPIRED'>('ALL');

  // Strict Client-Isolation: only show documents belonging to the logged-in client account
  const userDocs = React.useMemo(() => {
    if (!user?.id) return [];
    return documents.filter((doc) => {
      if (doc.client_id) {
        return doc.client_id === user.id;
      }
      return user.id === 'user_client_1';
    });
  }, [documents, user?.id]);

  const allFormationDocs = userDocs.filter((doc) => {
    const isFormation =
      doc.category === '00_Stammdaten' ||
      (doc.category as any) === 'FORMATION' ||
      (doc.sub_types && doc.sub_types.length > 0 && doc.category === '00_Stammdaten') ||
      (doc.original_filename || '').toLowerCase().includes('gründung') ||
      (doc.original_filename || '').toLowerCase().includes('formation') ||
      (doc.original_filename || '').toLowerCase().includes('gewerbe') ||
      (doc.original_filename || '').toLowerCase().includes('handelsregister') ||
      (doc.original_filename || '').toLowerCase().includes('gesellschafter') ||
      (doc.original_filename || '').toLowerCase().includes('ausweis') ||
      (doc.original_filename || '').toLowerCase().includes('pass') ||
      (doc.staff_notes || '').toLowerCase().includes('gründung') ||
      (doc.staff_notes || '').toLowerCase().includes('formation');

    return isFormation;
  });

  const getDocExpiryInfo = (doc: DocumentRecord) => {
    if (doc.expiry_info && doc.expiry_info.has_expiry) {
      return doc.expiry_info;
    }
    if (doc.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(doc.expiry_date)) {
      const [ey, em, ed] = doc.expiry_date.split('-').map(Number);
      const formatted_date = `${String(ed).padStart(2, '0')}.${String(em).padStart(2, '0')}.${ey}`;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const expDate = new Date(ey, em - 1, ed);
      const days = Math.round((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const is_expired = days < 0;
      return {
        has_expiry: true,
        expiry_date: doc.expiry_date,
        formatted_date,
        is_expired,
        days_until_expiry: days,
        status: (is_expired ? 'EXPIRED' : days <= 90 ? 'EXPIRING_SOON' : 'VALID') as 'EXPIRED' | 'EXPIRING_SOON' | 'VALID',
        warning_message: is_expired
          ? `Dokument ist am ${formatted_date} abgelaufen`
          : `Gültig bis ${formatted_date}`,
      };
    }
    const textToCheck = `${doc.staff_notes || ''} ${doc.original_filename || ''}`;
    const m = textToCheck.match(/(?:g[üu]ltig\s+bis|ablaufdatum|abgelaufen\s+am)[^\d]*([0-3]?[0-9]\.[0-1]?[0-9]\.20\d{2})/i);
    if (m) {
      const formatted_date = m[1];
      const [dd, mm, yyyy] = formatted_date.split('.').map(Number);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const expDate = new Date(yyyy, mm - 1, dd);
      const days = Math.round((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const is_expired = days < 0;
      return {
        has_expiry: true,
        expiry_date: `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
        formatted_date,
        is_expired,
        days_until_expiry: days,
        status: (is_expired ? 'EXPIRED' : days <= 90 ? 'EXPIRING_SOON' : 'VALID') as 'EXPIRED' | 'EXPIRING_SOON' | 'VALID',
        warning_message: is_expired
          ? `Dokument ist am ${formatted_date} abgelaufen`
          : `Gültig bis ${formatted_date}`,
      };
    }
    return null;
  };

  const formationDocs = allFormationDocs.filter((doc) => {
    if (formationSearch.trim()) {
      const q = formationSearch.toLowerCase();
      const n = (doc.original_filename || '').toLowerCase();
      const st = (doc.sub_types || []).join(' ').toLowerCase();
      const nt = (doc.staff_notes || '').toLowerCase();
      if (!n.includes(q) && !st.includes(q) && !nt.includes(q)) return false;
    }
    if (formationFilter === 'VALID') {
      const st = getDocExpiryInfo(doc)?.status;
      return st === 'VALID' || st === 'NO_EXPIRY' || !st;
    }
    if (formationFilter === 'EXPIRING') {
      return getDocExpiryInfo(doc)?.status === 'EXPIRING_SOON';
    }
    if (formationFilter === 'EXPIRED') {
      return getDocExpiryInfo(doc)?.status === 'EXPIRED';
    }
    return true;
  });


  const expiredFormationDocs = allFormationDocs.filter((d) => getDocExpiryInfo(d)?.status === 'EXPIRED');
  const expiringSoonFormationDocs = allFormationDocs.filter((d) => getDocExpiryInfo(d)?.status === 'EXPIRING_SOON');
  const validFormationDocs = allFormationDocs.filter((d) => {
    const st = getDocExpiryInfo(d)?.status;
    return st === 'VALID' || st === 'NO_EXPIRY' || !st;
  });

  // Returns ring data for documents that have an expiry date: remaining validity
  // from today until the expiry date, calculated proportionally against the document's total validity span.
  const getExpiryRing = (doc: DocumentRecord) => {
    const info = getDocExpiryInfo(doc);
    if (!info || !info.has_expiry || !info.expiry_date) return null;
    const [y, m, d] = info.expiry_date.split('-').map(Number);
    if (!y || !m || !d) return null;
    const msDay = 1000 * 60 * 60 * 24;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const exp = new Date(y, m - 1, d);
    const daysLeft = Math.round((exp.getTime() - today.getTime()) / msDay);
    if (daysLeft < 0) {
      // Expired: no days left → empty ring (red track)
      const daysPast = Math.abs(daysLeft);
      return {
        percent: 0,
        color: '#ef4444',
        track: '#fee2e2',
        daysLeft,
        label: isDe ? `Abgelaufen (${daysPast} T.)` : `Expired ${daysPast}d ago`,
      };
    }

    // Dynamic lifespan / total validity calculation
    let totalDays = info.total_validity_days || 0;
    if (!totalDays && info.issue_date) {
      const [iy, im, id] = info.issue_date.split('-').map(Number);
      if (iy && im && id) {
        const issueDate = new Date(iy, im - 1, id);
        totalDays = Math.max(30, Math.round((exp.getTime() - issueDate.getTime()) / msDay));
      }
    }
    if (!totalDays) {
      if (daysLeft > 1825) totalDays = 3650; // 10 years (e.g. Passport)
      else if (daysLeft > 1095) totalDays = 1825; // 5 years (e.g. National ID)
      else if (daysLeft > 548) totalDays = 1095; // 3 years (e.g. 3-Year Visa, covers 713 days)
      else if (daysLeft > 365) totalDays = 730; // 2 years
      else totalDays = 365; // 1 year
    }

    // Calculate percentage remaining from days left
    const rawPercent = (daysLeft / totalDays) * 100;
    const percent = Math.max(daysLeft > 0 ? 5 : 0, Math.min(98, Math.round(rawPercent)));

    const color = daysLeft <= 30 ? '#ef4444' : daysLeft <= 90 ? '#f59e0b' : '#10b981';
    const track = daysLeft <= 30 ? '#fee2e2' : daysLeft <= 90 ? '#fef3c7' : '#e2e8f0';

    return {
      percent,
      color,
      track,
      daysLeft,
      totalDays,
      label: isDe ? `${daysLeft} Tage übrig (${percent}%)` : `${daysLeft} days left (${percent}%)`,
    };
  };

  const handleOpenEdit = (doc: DocumentRecord) => {
    setEditingDoc(doc);
    setEditFilename(doc.original_filename || '');
    setEditNotes(doc.staff_notes || '');
    setEditSubTypes(doc.sub_types || []);
    setEditFile(null);
  };

  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    setIsSavingEdit(true);
    try {
      let res: Response;
      if (editFile) {
        const formData = new FormData();
        formData.append('document', editFile);
        formData.append('original_filename', editFilename.trim() || editFile.name);
        formData.append('notes', editNotes.trim());
        formData.append('sub_types', JSON.stringify(editSubTypes));
        formData.append('category', '00_Stammdaten');

        res = await fetch(`${API_BASE}/documents/${editingDoc.id}`, {
          method: 'PATCH',
          body: formData,
        });
      } else {
        res = await fetch(`${API_BASE}/documents/${editingDoc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original_filename: editFilename.trim() || editingDoc.original_filename,
            notes: editNotes.trim(),
            sub_types: editSubTypes,
          }),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update document');
      }

      const editData = await res.json();
      if (editData?.document?.expiry_info?.has_expiry) {
        const exp = editData.document.expiry_info;
        if (exp.is_expired) {
          error(
            isDe
              ? `Dokument aktualisiert! ⚠️ Achtung: Dieses Dokument ist am ${exp.formatted_date} abgelaufen.`
              : `Document updated! ⚠️ Warning: This document expired on ${exp.formatted_date}.`,
            isDe ? 'Ablaufdatum überschritten' : 'Document Expired'
          );
        } else {
          success(
            isDe
              ? `Dokument aktualisiert! AI-Erkennung: Gültig bis ${exp.formatted_date}.`
              : `Document updated! AI verified: Valid until ${exp.formatted_date}.`,
            isDe ? 'Gültigkeitsdatum' : 'Expiry Date'
          );
        }
      } else {
        success(
          isDe
            ? (editFile ? 'Dokumentendatei und Angaben erfolgreich aktualisiert.' : 'Gründungsunterlage erfolgreich aktualisiert.')
            : (editFile ? 'Document file and details updated successfully in database.' : 'Formation document updated successfully in database.'),
          isDe ? 'Gespeichert' : 'Updated'
        );
      }
      setEditingDoc(null);
      setEditFile(null);
      window.dispatchEvent(new CustomEvent('fintax_doc_updated'));
    } catch (err: any) {
      error(err.message || 'Error updating document');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteDocument = async (id: string, name: string) => {
    const confirmMsg = isDe
      ? `Möchten Sie das Dokument "${name}" wirklich aus der Datenbank und dem Archiv löschen?`
      : `Are you sure you want to delete "${name}" from the database and storage?`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingDocId(id);
    try {
      const res = await fetch(`${API_BASE}/documents/${id}?force=true`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete document');
      }

      success(
        isDe ? `Dokument "${name}" erfolgreich gelöscht.` : `Document "${name}" deleted successfully.`,
        isDe ? 'Gelöscht' : 'Deleted'
      );
      window.dispatchEvent(new CustomEvent('fintax_doc_updated'));
    } catch (err: any) {
      error(err.message || 'Error deleting document');
    } finally {
      setDeletingDocId(null);
    }
  };

  // Payroll Data
  const [submissions, setSubmissions] = useState<PayrollSubmission[]>([]);
  const [payslips, setPayslips] = useState<PayslipRecord[]>([]);

  // Advisor Tasks checklist state
  const [tasks, setTasks] = useState([
    { id: 1, title: isDe ? 'Oktober Kontoauszüge hochladen' : 'Upload all October bank statements', due: '10.11.2026', done: false, category: '01_FiBu' },
    { id: 2, title: isDe ? 'Stundennachweise & Überstunden bestätigen' : 'Confirm payroll & overtime hours for October', due: '25.10.2026', done: true, category: '02_LoBu' },
    { id: 3, title: isDe ? 'Fehlende Bewirtungsbelege nachreichen' : 'Add missing hospitality receipts', due: '15.11.2026', done: false, category: '01_FiBu' },
    { id: 4, title: isDe ? 'Gewerbeanmeldung / HR-Auszug vervollständigen' : 'Submit business registration & HR extract', due: '30.11.2026', done: false, category: '00_Stammdaten' },
  ]);

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const monthsEn = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthsDe = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];
  const displayMonths = isDe ? monthsDe : monthsEn;
  const years = ['2026', '2025', '2024'];

  // Modal configurations
  const modalConfigs = {
    FORMATION: {
      title: isDe ? 'Gründungsunterlagen einreichen' : 'Submit Company Formation Documents',
      hasMonthYear: false,
      folderCategory: '00_Stammdaten',
      notePlaceholder: isDe ? 'z.B. Beglaubigter Handelsregisterauszug vom Notar beigefügt...' : 'e.g. Certified commercial register extract from notary attached...',
      col1: isDe ? [
        'Personalausweis / Reisepass',
        'Handelsregisterauszug',
        'Steuernummer',
        'Sozialversicherungsnachweise',
      ] : [
        'Personal ID / Passport',
        'Business Registration',
        'Commercial Register Extract',
        'Articles of Association',
      ],
      col2: isDe ? [
        'Gewerbeanmeldung',
        'Gesellschaftsvertrag',
        'Bankverbindung (IBAN)',
        'Sonstiges',
      ] : [
        'Tax Number',
        'Bank Details (IBAN)',
        'Social Security Registration Documents',
        'Other',
      ],
    },
    PAYROLL: {
      title: isDe ? 'Lohnunterlagen einreichen' : 'Submit Payroll Documents',
      hasMonthYear: true,
      folderCategory: '02_LoBu',
      notePlaceholder: isDe ? 'z.B. Urlaubsantrag liegt bei, bitte 12 Überstunden berücksichtigen...' : 'e.g. Leave request attached, please include 12 overtime hours...',
      col1: isDe ? [
        'Lohnunterlagen',
        'Stundennachweise',
        'Austritte',
        'Sonstiges',
      ] : [
        'Payroll Documents',
        'Timesheets',
        'New Employees',
        'Employee Resignations / Terminations',
      ],
      col2: isDe ? [
        'Krankmeldungen',
        'Neueinstellungen',
        'Urlaub / Freistellung',
      ] : [
        'Sick Leave Certificates',
        'Leave / Time Off',
        'Other',
      ],
    },
    ACCOUNTING: {
      title: isDe ? 'Finanzbuchhaltung einreichen' : 'Submit Financial Accounting Documents',
      hasMonthYear: false,
      folderCategory: '01_FiBu',
      notePlaceholder: isDe ? 'z.B. Eingangsrechnungen und Deutsche Bank Auszug für aktuellen Monat...' : 'e.g. Incoming vendor invoices and bank statement for current month...',
      col1: isDe ? [
        'Kontoauszüge',
        'Ausgangsrechnungen',
        'Bewirtungsbelege',
        'Sonstiges',
      ] : [
        'Bank Statements',
        'Incoming Invoices (Purchase Invoices)',
        'Outgoing Invoices (Sales Invoices)',
        'Cash Receipts',
      ],
      col2: isDe ? [
        'Eingangsrechnungen',
        'Kassenbelege',
        'Tankbelege',
      ] : [
        'Entertainment Expenses Receipts',
        'Fuel Receipts',
        'Other',
      ],
    },
    CORRESPONDENCE: {
      title: isDe ? 'Schriftverkehr einreichen' : 'Submit Correspondence Documents',
      hasMonthYear: true,
      folderCategory: '00_Schriftverkehr',
      notePlaceholder: isDe ? 'z.B. Neuer Steuerbescheid vom Finanzamt mit Frist bis zum 25. des Monats...' : 'e.g. Tax assessment letter from the tax office with deadline...',
      col1: isDe ? [
        'Behördenschreiben',
        'Sonstige Unterlagen',
      ] : [
        'Official Letters from Authorities',
        'Contracts',
      ],
      col2: isDe ? [
        'Verträge',
      ] : [
        'Other Documents',
      ],
    },
  };

  const openModal = (cat: ModalCategory) => {
    setActiveModal(cat);
    setSelectedTypes([]);
    setNote('');
    setModalFiles([]);

    if (cat === 'ACCOUNTING') {
      // Whenever user opens/tabs on Financial Accounting: ensure current year folder is created in Google Drive & Vault
      fetch(`${API_BASE}/google-drive/ensure-financial-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: user?.id || 'user_client_1',
          client_name: user?.name,
          year: new Date().getFullYear(),
        }),
      }).catch((e) => console.warn('Drive ensure-year notice:', e));
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedTypes([]);
    setNote('');
    setModalFiles([]);
  };

  const toggleType = (t: string) => {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((item) => item !== t) : [...prev, t]
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setModalFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      setModalFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const removeFile = (index: number) => {
    setModalFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitModal = async () => {
    if (modalFiles.length === 0) {
      error(isDe ? 'Bitte wählen Sie mindestens eine Datei aus.' : 'Please select at least one document to submit.');
      return;
    }

    if (!activeModal) return;
    const config = modalConfigs[activeModal];

    setIsSubmitting(true);
    try {
      let lastPipelineSummary: any = null;
      let lastExpiryInfo: any = null;

      for (const file of modalFiles) {
        const formData = new FormData();
        formData.append('document', file);
        formData.append('category', config.folderCategory);
        formData.append('client_id', user?.id || 'user_client_1');
        formData.append('notes', note);
        formData.append('sub_types', JSON.stringify(selectedTypes));
        if (config.hasMonthYear) {
          formData.append('month', selectedMonth);
          formData.append('year', selectedYear);
        }

        const res = await fetch(`${API_BASE}/documents/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Upload failed');
        }

        const resData = await res.json();
        if (resData?.pipeline_summary) {
          lastPipelineSummary = resData.pipeline_summary;
        }
        if (resData?.expiry_info) {
          lastExpiryInfo = resData.expiry_info;
        }
      }

      const wasFormation = activeModal === 'FORMATION';
      const wasAccounting = activeModal === 'ACCOUNTING';

      if (wasFormation && lastExpiryInfo && lastExpiryInfo.has_expiry) {
        if (lastExpiryInfo.is_expired) {
          error(
            isDe
              ? `Dokument erfolgreich gespeichert! ⚠️ Achtung: Dieses Dokument ist am ${lastExpiryInfo.formatted_date} abgelaufen.`
              : `Document stored successfully! ⚠️ Warning: This document expired on ${lastExpiryInfo.formatted_date}.`,
            isDe ? 'Ablaufdatum überschritten' : 'Document Expired'
          );
        } else if (lastExpiryInfo.status === 'EXPIRING_SOON') {
          success(
            isDe
              ? `Dokument erfolgreich gespeichert! ⚠️ Hinweis: Dieses Dokument läuft am ${lastExpiryInfo.formatted_date} ab (in ${lastExpiryInfo.days_until_expiry} Tagen).`
              : `Document stored successfully! ⚠️ Notice: This document will expire on ${lastExpiryInfo.formatted_date} (in ${lastExpiryInfo.days_until_expiry} days).`,
            isDe ? 'Gültigkeitsfrist beachten' : 'Expiring Soon'
          );
        } else {
          success(
            isDe
              ? `Dokument erfolgreich gespeichert! AI-Erkennung: Gültig bis ${lastExpiryInfo.formatted_date}.`
              : `Document stored successfully! AI verified: Valid until ${lastExpiryInfo.formatted_date}.`,
            isDe ? 'Gültigkeitsdatum erfasst' : 'Expiry Date Verified'
          );
        }
      } else if (wasAccounting && lastPipelineSummary?.split_bills && lastPipelineSummary.split_bills.length > 1) {
        const bills = lastPipelineSummary.split_bills;
        const targetMonths = lastPipelineSummary.step6_skr03_and_csv?.target_month || '';
        success(
          isDe
            ? `${bills.length} Belege in verschiedenen Monaten erkannt! Automatisch in ${bills.length} Monatsordner aufgeteilt (${targetMonths}) mit SKR03-Buchungen.`
            : `AI detected ${bills.length} separate bills across different months! Automatically created ${bills.length} month folders (${targetMonths}) with SKR03 bookings & CSVs.`,
          isDe ? 'Mehrfach-Belege aufgeteilt' : 'Multi-Month Bills Auto-Split'
        );
      } else if (wasAccounting && lastPipelineSummary?.step6_skr03_and_csv) {
        const s6 = lastPipelineSummary.step6_skr03_and_csv;
        const s4 = lastPipelineSummary.step4_ollama_extraction;
        success(
          `OCR & AI extracted (${s4?.supplier_name || 'Document'} • ${s4?.invoice_date || ''}) → Saved in 01_Financial Accounting – FiBu / ${s6.target_year} / ${s6.target_month} (+ 00_CSV/${s6.skr03_csv_file})`,
          'SKR03 CSV & Year/Month Routed'
        );
      } else {
        success(
          isDe
            ? `Unterlagen für ${config.title} erfolgreich übermittelt! In der Datenbank gespeichert.`
            : `Documents successfully submitted for ${config.title}! Stored in database.`,
          isDe ? 'Erfolgreich eingereicht' : 'Submission Received'
        );
      }

      closeModal();
      window.dispatchEvent(new CustomEvent('fintax_doc_updated'));
      if (wasFormation) {
        setActiveInternalTab('FORMATION');
      }
    } catch (err: any) {
      error(isDe ? `Fehler beim Einreichen: ${err.message}` : `Error submitting documents: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchPayrollData = async () => {
    try {
      const clientIdParam = user?.id || 'user_client_1';
      const [subRes, slipRes] = await Promise.all([
        fetch(`${API_BASE}/payroll/submissions?client_id=${encodeURIComponent(clientIdParam)}`),
        fetch(`${API_BASE}/payroll/payslips?client_id=${encodeURIComponent(clientIdParam)}`),
      ]);
      if (subRes.ok) setSubmissions(await subRes.json());
      if (slipRes.ok) setPayslips(await slipRes.json());
    } catch (e) {
      console.warn('Failed to fetch payroll data:', e);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [user?.id]);

  // React to sidebar navigation tabs
  useEffect(() => {
    if (externalTab === 'FORMATION') {
      setActiveInternalTab('FORMATION');
    } else if (externalTab === 'ACCOUNTING') {
      openModal('ACCOUNTING');
    } else if (externalTab === 'PAYROLL') {
      setActiveInternalTab('PAYROLL');
    } else if (externalTab === 'CORRESPONDENCE') {
      openModal('CORRESPONDENCE');
    } else if (externalTab === 'VAULT') {
      setActiveInternalTab('VAULT');
    } else if (externalTab === 'OVERVIEW' || externalTab === 'DOCS') {
      setActiveInternalTab('SUBMISSIONS');
    }
  }, [externalTab]);

  const currentConfig = activeModal ? modalConfigs[activeModal] : null;

  // Filter documents for current client
  const filteredDocuments = userDocs.filter((doc) => {
    if (statusFilter === 'ATTENTION') {
      if (doc.status !== 'NEEDS_ATTENTION' && doc.status !== 'READY_FOR_REVIEW') return false;
    } else if (statusFilter === 'APPROVED') {
      if (doc.status !== 'APPROVED' && doc.status !== 'EXPORTED') return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = doc.original_filename.toLowerCase().includes(q);
      const catMatch = (doc.category || '').toLowerCase().includes(q);
      const suppMatch = (doc.extracted_data?.supplier_name || '').toLowerCase().includes(q);
      return nameMatch || catMatch || suppMatch;
    }
    return true;
  });

  const stats = {
    total: userDocs.length,
    needsReview: userDocs.filter((d) => d.status === 'READY_FOR_REVIEW' || d.status === 'NEEDS_ATTENTION').length,
    approved: userDocs.filter((d) => d.status === 'APPROVED' || d.status === 'EXPORTED').length,
  };

  return (
    <div style={{ minHeight: '100%', background: '#f8fafc', color: '#0f172a' }}>
      
      {/* ── TOP LUXURY CONTEXT BAR (MATCHING SCREENSHOT 3) ── */}
      <div style={{
        background: '#0b1a30',
        color: '#ffffff',
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        fontSize: '0.85rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', fontSize: '1.05rem' }}>
            FinTax
          </span>
          <span style={{ fontFamily: 'Georgia, "Playfair Display", serif', fontStyle: 'italic', color: '#dfb772', fontSize: '1.05rem' }}>
            Consulting
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {/* Language Toggle Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem', marginRight: 4, opacity: 0.8 }}>🌐</span>
            {(['EN', 'DE', 'FA', 'AR'] as const).map((lCode) => {
              const currentUpper = (lang || 'en').toUpperCase();
              const isSelected = currentUpper === lCode;
              return (
                <button
                  key={lCode}
                  type="button"
                  onClick={() => onLanguageChange && onLanguageChange(lCode.toLowerCase() as Language)}
                  style={{
                    background: isSelected ? '#dfb772' : 'transparent',
                    color: isSelected ? '#0b1a30' : '#ffffff',
                    border: 'none',
                    borderRadius: 999,
                    padding: '2px 8px',
                    fontWeight: isSelected ? 800 : 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {lCode}
                </button>
              );
            })}
          </div>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
            Platform provided by FinTax Consulting
          </span>
        </div>
      </div>

      {/* ── MAIN WORKSPACE ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 28px 60px' }}>

        {/* ── TOP BREADCRUMB BAR (SHOWN WHEN IN FORMATION VIEW) ── */}
        {activeInternalTab === 'FORMATION' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setActiveInternalTab('SUBMISSIONS');
                  if (onTabChange) onTabChange('OVERVIEW');
                }}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#0b1a30',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease',
                }}
              >
                ← {isDe ? 'Zurück zum Dashboard / Übersicht' : 'Back to Dashboard / Overview'}
              </button>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>/</span>
              <span style={{ color: '#0b1a30', fontWeight: 700, fontSize: '0.9rem' }}>
                {isDe ? 'Gründungsunterlagen (00_Stammdaten)' : 'Formation Documents (00_Stammdaten)'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                {isDe ? 'Mandant' : 'Client'}: <strong>{user?.clientNumber || (user?.id ? user.id.slice(-8) : 'KD-NEU')}</strong>
              </span>
              <span
                style={{
                  background: '#dcfce7',
                  color: '#15803d',
                  border: '1px solid #bbf7d0',
                  borderRadius: 999,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                }}
              >
                ✓ {formationDocs.length} {isDe ? 'Dokumente hochgeladen' : 'documents uploaded'}
              </span>
            </div>
          </div>
        )}

        {/* ── OVERVIEW HERO & 4 CORE ACTION CARDS (SHOWN ON DASHBOARD/OVERVIEW) ── */}
        {activeInternalTab !== 'FORMATION' && (
          <>
            {/* ── 1. GORGEOUS WELCOME HERO BANNER ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0b1a30 0%, #15294a 55%, #1d3964 100%)',
          borderRadius: 20,
          padding: '32px 38px',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 12px 30px -8px rgba(11,26,48,0.3)',
          border: '1px solid rgba(212, 163, 89, 0.35)',
          marginBottom: 28,
        }}>
          {/* Subtle background glow effect */}
          <div style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,163,89,0.18) 0%, rgba(11,26,48,0) 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, position: 'relative', zIndex: 1 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: '1.1rem' }}>👋</span>
                <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {isDe ? 'Mandantenportal' : 'Client Workspace'}
                </span>
              </div>

              {/* USER'S NAME RENDERED PROMINENTLY & ELEGANTLY */}
              <h1 style={{
                margin: 0,
                fontSize: '2.1rem',
                fontWeight: 700,
                fontFamily: 'Georgia, "Playfair Display", -apple-system, serif',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                color: '#ffffff',
              }}>
                {isDe ? 'Willkommen,' : 'Welcome,'}{' '}
                <span style={{
                  color: '#ffffff',
                  borderBottom: '2.5px solid #d4a359',
                  paddingBottom: 2,
                }}>
                  {user?.name || 'Test von Webapp'}
                </span>
              </h1>

              <p style={{
                margin: '10px 0 0 0',
                fontSize: '1.05rem',
                color: '#dfb772',
                fontFamily: 'Georgia, "Playfair Display", serif',
                fontWeight: 400,
              }}>
                {isDe ? 'im Mandantenportal der FinTax Consulting' : 'to the client portal of FinTax Consulting'}
              </p>

              {/* Client metadata badge pill row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <span style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '4px 12px',
                  borderRadius: 999,
                  fontSize: '0.78rem',
                  color: '#f1f5f9',
                  fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>
                  Mandant: <strong>{user?.clientNumber || (user?.id ? user.id.slice(-8) : 'KD-NEU')}</strong>
                </span>
                <span style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  padding: '4px 12px',
                  borderRadius: 999,
                  fontSize: '0.78rem',
                  color: '#34d399',
                  fontWeight: 600,
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                  {isDe ? 'GoBD-Archiv Aktiv' : 'GoBD Vault Active'}
                </span>
              </div>
            </div>

            {/* Right Side: Active Client Gold Pill & Quick Submit Button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
              <div style={{
                background: 'linear-gradient(135deg, #dfb772 0%, #d4a359 100%)',
                color: '#0b1a30',
                fontWeight: 800,
                padding: '10px 24px',
                borderRadius: 999,
                fontSize: '0.92rem',
                letterSpacing: '0.02em',
                boxShadow: '0 4px 16px rgba(212,163,89,0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <Sparkles size={16} />
                {isDe ? 'Aktiver Mandant' : 'Active client'}
              </div>

              <button
                onClick={() => openModal('ACCOUNTING')}
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.25)',
                  padding: '8px 18px',
                  borderRadius: 10,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                }}
              >
                <Plus size={16} />
                {isDe ? 'Beleg schnell einreichen' : 'Quick Submit Receipt'}
              </button>
            </div>
          </div>

          {/* ── METRIC STAT COUNTERS ROW INSIDE HERO ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginTop: 26,
            paddingTop: 22,
            borderTop: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}>
                <FileText size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
                  {stats.total}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: 4 }}>
                  {isDe ? 'Eingereichte Belege' : 'Total Documents'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fbbf24',
              }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fbbf24', lineHeight: 1 }}>
                  {stats.needsReview}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: 4 }}>
                  {isDe ? 'In Prüfung durch Kanzlei' : 'Pending Review'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399',
              }}>
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', lineHeight: 1 }}>
                  {stats.approved}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: 4 }}>
                  {isDe ? 'Freigegeben für Agenda' : 'Approved & Exported'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(212, 163, 89, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dfb772',
              }}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#dfb772', lineHeight: 1 }}>
                  100%
                </div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: 4 }}>
                  {isDe ? 'GoBD Revisionssicher' : 'Tax-Audit Proof'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. THE 4 CORE ACTION CARDS (2x2 GRID MATCHING SCREENSHOT) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 18,
          marginBottom: 32,
        }}>

          {/* CARD 1: FORMATION DOCUMENTS */}
          <div
            onClick={() => {
              setActiveInternalTab('FORMATION');
              if (onTabChange) onTabChange('FORMATION');
            }}
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '24px 26px',
              border: '1.5px solid #e5e7eb',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#d4a359';
              e.currentTarget.style.boxShadow = '0 8px 18px -4px rgba(11,26,48,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ color: '#b4833e' }}>
                <Building2 size={26} strokeWidth={1.8} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#0b1a30',
                    padding: '3px 10px',
                  }}
                >
                  {allFormationDocs.length} {isDe ? 'hochgeladen' : 'uploaded'}
                </span>
              </div>
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 700, color: '#0b1a30' }}>
              {isDe ? 'Gründungsunterlagen' : 'Formation documents'}
            </h3>
            <p style={{ margin: '0 0 14px 0', fontSize: '0.92rem', color: '#64748b' }}>
              {isDe ? 'Einmalig · vor Freischaltung erforderlich' : 'One-time · required before activation'}
            </p>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#b4833e' }}>
                {isDe ? 'Dokumentenliste anzeigen & verwalten →' : 'View uploaded documents & manage →'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openModal('FORMATION');
                }}
                style={{
                  background: 'rgba(212,163,89,0.15)',
                  border: '1px solid #dfb772',
                  borderRadius: 6,
                  color: '#0b1a30',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                + {isDe ? 'Neu hochladen' : 'Upload'}
              </button>
            </div>
          </div>

          {/* CARD 2: PAYROLL DOCUMENTS */}
          <div
            onClick={() => openModal('PAYROLL')}
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '24px 26px',
              border: '1.5px solid #e5e7eb',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#d4a359';
              e.currentTarget.style.boxShadow = '0 8px 18px -4px rgba(11,26,48,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
            }}
          >
            <div style={{ color: '#b4833e', marginBottom: 14 }}>
              <Users size={26} strokeWidth={1.8} />
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 700, color: '#0b1a30' }}>
              {isDe ? 'Lohnunterlagen' : 'Payroll documents'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.92rem', color: '#64748b' }}>
              {isDe ? 'Monatlich einreichen' : 'Submit monthly'}
            </p>
          </div>

          {/* CARD 3: FINANCIAL ACCOUNTING */}
          <div
            onClick={() => openModal('ACCOUNTING')}
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '24px 26px',
              border: '1.5px solid #e5e7eb',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#d4a359';
              e.currentTarget.style.boxShadow = '0 8px 18px -4px rgba(11,26,48,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
            }}
          >
            <div style={{ color: '#b4833e', marginBottom: 14 }}>
              <BarChart3 size={26} strokeWidth={1.8} />
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 700, color: '#0b1a30' }}>
              {isDe ? 'Finanzbuchhaltung' : 'Financial accounting'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.92rem', color: '#64748b' }}>
              {isDe ? 'Belege, Kontoauszüge, Rechnungen' : 'Receipts, bank statements, invoices'}
            </p>
          </div>

          {/* CARD 4: CORRESPONDENCE */}
          <div
            onClick={() => openModal('CORRESPONDENCE')}
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '24px 26px',
              border: '1.8px solid #d4a359',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: '0 4px 12px rgba(212,163,89,0.12)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 8px 24px -2px rgba(212,163,89,0.22)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(212,163,89,0.12)';
            }}
          >
            <div style={{ color: '#b4833e', marginBottom: 14 }}>
              <Send size={26} strokeWidth={1.8} />
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 700, color: '#0b1a30' }}>
              {isDe ? 'Schriftverkehr' : 'Correspondence'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.92rem', color: '#64748b' }}>
              {isDe ? 'Neu, ersetzt "Sonstiges"' : 'New, replaces "Other"'}
            </p>
          </div>

        </div>
        </>
      )}

        {/* ── 3. BOTTOM SECTION: TABS & SUBMISSIONS / VAULT / PAYROLL ── */}
        <div style={{
          background: '#ffffff',
          borderRadius: 18,
          border: '1px solid #e2e8f0',
          padding: '24px 28px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
        }}>
          {/* Sub Navigation Tabs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: 16,
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveInternalTab('SUBMISSIONS')}
                style={{
                  background: activeInternalTab === 'SUBMISSIONS' ? '#0b1a30' : '#f8fafc',
                  color: activeInternalTab === 'SUBMISSIONS' ? '#ffffff' : '#475569',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 18px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s ease',
                }}
              >
                <FileText size={16} />
                {isDe ? 'Meine Einreichungen' : 'My Submissions & Status'} ({userDocs.length})
              </button>

              <button
                onClick={() => setActiveInternalTab('FORMATION')}
                style={{
                  background: activeInternalTab === 'FORMATION' ? '#0b1a30' : '#f8fafc',
                  color: activeInternalTab === 'FORMATION' ? '#ffffff' : '#475569',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 18px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s ease',
                }}
              >
                <Building2 size={16} />
                {isDe ? 'Gründungsunterlagen' : 'Formation Documents'} ({formationDocs.length})
              </button>

              <button
                onClick={() => setActiveInternalTab('TASKS')}
                style={{
                  background: activeInternalTab === 'TASKS' ? '#0b1a30' : '#f8fafc',
                  color: activeInternalTab === 'TASKS' ? '#ffffff' : '#475569',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 18px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s ease',
                }}
              >
                <Calendar size={16} />
                {isDe ? 'Monatliche Aufgaben' : 'Monthly Tasks'} ({tasks.filter((t) => !t.done).length})
              </button>

              <button
                onClick={() => setActiveInternalTab('PAYROLL')}
                style={{
                  background: activeInternalTab === 'PAYROLL' ? '#0b1a30' : '#f8fafc',
                  color: activeInternalTab === 'PAYROLL' ? '#ffffff' : '#475569',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 18px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s ease',
                }}
              >
                <Users size={16} />
                {isDe ? 'Lohn & Gehalt' : 'Payroll & Team'} ({submissions.length + payslips.length})
              </button>

              <button
                onClick={() => setActiveInternalTab('VAULT')}
                style={{
                  background: activeInternalTab === 'VAULT' ? '#0b1a30' : '#f8fafc',
                  color: activeInternalTab === 'VAULT' ? '#ffffff' : '#475569',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 18px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s ease',
                }}
              >
                <FolderTree size={16} />
                {isDe ? 'Kanzlei-Archiv (00-03)' : 'Folder Vault (00-03)'}
              </button>
            </div>

            {/* Quick Upload action */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => openModal('ACCOUNTING')}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <UploadCloud size={16} />
                {isDe ? 'Datei hochladen' : 'Upload Document'}
              </button>
            </div>
          </div>

          {/* ── TAB CONTENT 1: SUBMISSIONS TABLE WITH SEARCH & STATUS FILTER ── */}
          {activeInternalTab === 'SUBMISSIONS' && (
            <div>
              {/* Search & Filter Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 18,
                flexWrap: 'wrap',
                gap: 12,
              }}>
                {/* Search input */}
                <div style={{
                  position: 'relative',
                  width: 320,
                  maxWidth: '100%',
                }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder={isDe ? 'Belege durchsuchen (z.B. Dateiname, Lieferant)...' : 'Search documents by filename, vendor...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Status Filter Buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['ALL', 'ATTENTION', 'APPROVED'] as const).map((filter) => {
                    const label =
                      filter === 'ALL'
                        ? (isDe ? 'Alle Belege' : 'All')
                        : filter === 'ATTENTION'
                        ? (isDe ? 'In Prüfung' : 'Needs Attention')
                        : (isDe ? 'Freigegeben' : 'Approved');
                    const isActive = statusFilter === filter;
                    return (
                      <button
                        key={filter}
                        onClick={() => setStatusFilter(filter)}
                        style={{
                          background: isActive ? '#0b1a30' : '#f8fafc',
                          color: isActive ? '#ffffff' : '#475569',
                          border: '1px solid',
                          borderColor: isActive ? '#0b1a30' : '#e2e8f0',
                          borderRadius: 8,
                          padding: '6px 14px',
                          fontSize: '0.8rem',
                          fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {filteredDocuments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: '#f1f5f9',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    marginBottom: 12,
                  }}>
                    <FileText size={28} />
                  </div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#0f172a' }}>
                    {isDe ? 'Keine Dokumente gefunden' : 'No documents found'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>
                    {isDe ? 'Klicken Sie auf eine der 4 Kacheln oben, um Dokumente einzureichen.' : 'Click any of the 4 cards above to submit your documents.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{
                        borderBottom: '1.5px solid #e2e8f0',
                        color: '#64748b',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        <th style={{ padding: '12px 14px' }}>{isDe ? 'Dokument' : 'Document'}</th>
                        <th style={{ padding: '12px 14px' }}>{isDe ? 'Bereich / Ordner' : 'Category'}</th>
                        <th style={{ padding: '12px 14px' }}>{isDe ? 'Lieferant / Partner' : 'Supplier'}</th>
                        <th style={{ padding: '12px 14px' }}>{isDe ? 'Datum' : 'Date'}</th>
                        <th style={{ padding: '12px 14px' }}>{isDe ? 'Betrag' : 'Amount'}</th>
                        <th style={{ padding: '12px 14px' }}>{isDe ? 'Status' : 'AI Status'}</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>{isDe ? 'Aktionen' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocuments.map((doc) => {
                        const isApproved = doc.status === 'APPROVED' || doc.status === 'EXPORTED';
                        const isAttention = doc.status === 'NEEDS_ATTENTION' || doc.status === 'READY_FOR_REVIEW';
                        return (
                          <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  background: '#f1f5f9',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#0284c7',
                                }}>
                                  <FileText size={16} />
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                    {doc.original_filename}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {(doc.size_bytes / 1024).toFixed(1)} KB
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                                <span style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                }}>
                                  {doc.category || '01_FiBu'}
                                </span>
                                {(doc.extracted_data?.target_folder || doc.extracted_data?.invoice_date) && (doc.category === '01_FiBu' || !doc.category) && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: '#0369a1',
                                    background: '#e0f2fe',
                                    padding: '2px 7px',
                                    borderRadius: 5,
                                  }}>
                                    📁 {doc.extracted_data?.target_folder || (() => {
                                      const [y, m] = (doc.extracted_data?.invoice_date || '').split('-');
                                      const mNames = ['01_January','02_February','03_March','04_April','05_May','06_June','07_July','08_August','09_September','10_October','11_November','12_December'];
                                      const mFolder = mNames[(parseInt(m, 10) || 1) - 1] || '01_January';
                                      return `Financial Accounting/${y || '2026'}/${mFolder}`;
                                    })()}
                                  </span>
                                )}
                                {doc.extracted_data?.skr03_account_code && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: '#15803d',
                                    background: '#dcfce7',
                                    border: '1px solid #bbf7d0',
                                    padding: '2px 7px',
                                    borderRadius: 5,
                                  }}>
                                    ✓ SKR03: {doc.extracted_data.skr03_account_code} • {doc.extracted_data.bookings?.length || 1} {isDe ? 'Buchung(en)' : 'Booking(s)'}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 500 }}>
                              {doc.extracted_data?.supplier_name || '—'}
                            </td>

                            <td style={{ padding: '12px 14px', color: '#64748b' }}>
                              {doc.extracted_data?.invoice_date ? (
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                    {doc.extracted_data.invoice_date.split('-').reverse().join('.')}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                    {isDe ? 'Belegdatum (KI)' : 'Doc Date (AI)'}
                                  </div>
                                </div>
                              ) : (
                                doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Today'
                              )}
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                              {doc.extracted_data?.total_amount ? `${doc.extracted_data.total_amount.toFixed(2)} €` : '—'}
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              <span style={{
                                padding: '3px 10px',
                                borderRadius: 999,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: isApproved ? '#dcfce7' : isAttention ? '#fef3c7' : '#eff6ff',
                                color: isApproved ? '#15803d' : isAttention ? '#b45309' : '#1d4ed8',
                              }}>
                                {isApproved && <CheckCircle2 size={12} />}
                                {isAttention && <AlertCircle size={12} />}
                                {!isApproved && !isAttention && <Clock size={12} />}
                                {isApproved
                                  ? (isDe ? 'Freigegeben' : 'Approved')
                                  : isAttention
                                  ? (isDe ? 'In Prüfung' : 'Needs Attention')
                                  : (isDe ? 'Verarbeitet' : 'Processing')}
                              </span>
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {(doc.category === '01_FiBu' || doc.extracted_data?.skr03_account_code) && (
                                  <>
                                    <a
                                      href={`${API_BASE}/documents/${doc.id}/skr03-xlsx`}
                                      download
                                      title={isDe ? 'Konvertierte SKR03 Excel herunterladen' : 'Download converted SKR03 Excel (.xlsx)'}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        color: '#166534',
                                        textDecoration: 'none',
                                        fontWeight: 700,
                                        fontSize: '0.78rem',
                                        background: '#dcfce7',
                                        padding: '5px 10px',
                                        borderRadius: 6,
                                        border: '1px solid #86efac',
                                      }}
                                    >
                                      <span>📊 SKR03 Excel</span>
                                    </a>
                                    <a
                                      href={`${API_BASE}/documents/${doc.id}/skr03-csv`}
                                      download
                                      title={isDe ? 'Konvertierte SKR03 CSV herunterladen' : 'Download converted SKR03 CSV'}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        color: '#15803d',
                                        textDecoration: 'none',
                                        fontWeight: 700,
                                        fontSize: '0.78rem',
                                        background: '#f0fdf4',
                                        padding: '5px 10px',
                                        borderRadius: 6,
                                        border: '1px solid #bbf7d0',
                                      }}
                                    >
                                      <span>SKR03 CSV</span>
                                    </a>
                                  </>
                                )}
                                <a
                                  href={`${API_BASE}/documents/${doc.id}/file`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={isDe ? 'Originaldokument ansehen' : 'View original file'}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: '#0284c7',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    background: '#f0f9ff',
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #bae6fd',
                                  }}
                                >
                                  <ExternalLink size={13} />
                                  <span>{isDe ? 'Öffnen' : 'View'}</span>
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB CONTENT 2: MONTHLY TASKS CHECKLIST ── */}
          {activeInternalTab === 'TASKS' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700, color: '#0b1a30' }}>
                  {isDe ? 'Monatliche Kanzlei-Anforderungen' : 'Monthly Advisor Requests & Deadlines'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  {isDe ? 'Bitte erledigen Sie diese offenen Punkte rechtzeitig vor dem Monatsabschluss.' : 'Please resolve pending items before monthly book closing.'}
                </p>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      borderRadius: 10,
                      border: '1px solid',
                      borderColor: task.done ? '#e2e8f0' : '#fed7aa',
                      background: task.done ? '#f8fafc' : '#fffaf5',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => {}}
                        style={{ width: 18, height: 18, accentColor: '#2563eb', cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          color: task.done ? '#94a3b8' : '#0f172a',
                          textDecoration: task.done ? 'line-through' : 'none',
                        }}>
                          {task.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                          {isDe ? 'Fällig bis:' : 'Due date:'} {task.due} · {task.category}
                        </div>
                      </div>
                    </div>

                    <div>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: task.done ? '#dcfce7' : '#fef3c7',
                        color: task.done ? '#15803d' : '#b45309',
                      }}>
                        {task.done ? (isDe ? '✓ Erledigt' : '✓ Completed') : (isDe ? 'Ausstehend' : 'Pending')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TAB CONTENT 3: PAYROLL & PAYSLIPS ── */}
          {activeInternalTab === 'PAYROLL' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700, color: '#0b1a30' }}>
                    {isDe ? 'Lohnabrechnungen & Mitarbeiter-Daten' : 'Monthly Payslips & Team Submissions'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                    {isDe ? 'Verwalten Sie Stundennachweise, Krankmeldungen und fertige Gehaltsabrechnungen.' : 'Access payroll submissions, timesheets, and issued payslips archive.'}
                  </p>
                </div>
                <button
                  onClick={() => openModal('PAYROLL')}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + {isDe ? 'Lohnunterlagen einreichen' : 'Submit Payroll Docs'}
                </button>
              </div>

              {payslips.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b', background: '#f8fafc', borderRadius: 10 }}>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>
                    {isDe ? 'Noch keine Gehaltsabrechnungen für diesen Zeitraum vorhanden.' : 'No issued payslips published yet for this period.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {payslips.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        background: '#f8fafc',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>
                          {p.employee_name} — {p.period}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 3 }}>
                          {isDe ? 'Nettogehalt' : 'Net Salary'}: <strong style={{ color: '#0f172a' }}>{p.net_salary} €</strong> ({isDe ? 'Brutto' : 'Gross'}: {p.gross_salary} €)
                        </div>
                      </div>
                      <span style={{
                        background: '#dcfce7',
                        color: '#15803d',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: 999,
                      }}>
                        ✓ {isDe ? 'Bereitgestellt' : 'Published'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB CONTENT 4: FILE EXPLORER ── */}
          {activeInternalTab === 'VAULT' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700, color: '#0b1a30' }}>
                  {isDe ? 'Shared with me > _INBOX > 01_Clients' : 'Shared with me > _INBOX > 01_Clients'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  {isDe
                    ? '00_Correspondence - Schriftverkehr • 01_Financial Accounting – FiBu (Jahr / Monat / PDF & 00_CSV) • 02_Payrol - Lohn'
                    : '00_Correspondence - Schriftverkehr • 01_Financial Accounting – FiBu (Year / Month / PDF & 00_CSV) • 02_Payrol - Lohn'}
                </p>
              </div>
              <FileExplorer clientId={user?.name || user?.id || 'user_client_1'} lang={lang} />
            </div>
          )}

          {/* ── TAB CONTENT 5: FORMATION DOCUMENTS MANAGEMENT ── */}
          {activeInternalTab === 'FORMATION' && (
            <div>
              {/* Header Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #0b1a30 0%, #1e293b 100%)',
                  borderRadius: 14,
                  padding: '24px 28px',
                  color: '#ffffff',
                  marginBottom: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 20px rgba(11,26,48,0.15)',
                  border: '1px solid rgba(212,163,89,0.3)',
                  flexWrap: 'wrap',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, maxWidth: 680 }}>
                  <div
                    style={{
                      background: 'rgba(212,163,89,0.15)',
                      border: '1px solid #dfb772',
                      borderRadius: 12,
                      padding: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Building2 size={28} color="#dfb772" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
                        {isDe ? 'Gründungsunterlagen & Stammdaten' : 'Formation Documents & Master Data'}
                      </h3>
                      <span
                        style={{
                          background: 'rgba(223,183,114,0.2)',
                          color: '#dfb772',
                          border: '1px solid #dfb772',
                          borderRadius: 999,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                        }}
                      >
                        00_Stammdaten
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
                      {isDe
                        ? 'Einmalige Erfassung aller rechtlichen Gründungsdokumente vor Kanzleiaufnahme. Sie können hier jederzeit Ihre Unterlagen einsehen, umbenennen oder löschen.'
                        : 'One-time onboarding documents required prior to account activation. Upload, review, edit names or delete documents anytime.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openModal('FORMATION')}
                  style={{
                    background: 'linear-gradient(135deg, #dfb772 0%, #c99846 100%)',
                    color: '#0b1a30',
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px 20px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(223,183,114,0.3)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Upload size={16} />
                  <span>{isDe ? '+ Unterlagen hochladen' : '+ Upload Formation Doc'}</span>
                </button>
              </div>

              {/* Status & Pillars Overview */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {[
                  { key: 'hr', name: isDe ? 'Handelsregisterauszug' : 'Commercial Register', desc: isDe ? 'Notarielle Eintragung' : 'Certified register extract' },
                  { key: 'gewerbe', name: isDe ? 'Gewerbeanmeldung' : 'Trade Registration', desc: isDe ? 'Gewerbeamt Formular GewA1' : 'Official GewA1 filing' },
                  { key: 'vertrag', name: isDe ? 'Gesellschaftsvertrag' : 'Articles of Association', desc: isDe ? 'Satzung / Gründungsvertrag' : 'Company bylaws / agreement' },
                  { key: 'id', name: isDe ? 'Personalausweis / Pass' : 'Founder ID / Passport', desc: isDe ? 'Geschäftsführer Legitimation' : 'Managing Director ID' },
                  { key: 'steuernummer', name: isDe ? 'Steuernummer-Bescheid' : 'Tax ID Notice', desc: isDe ? 'Finanzamt Erfassungsbogen' : 'Tax authority letter' },
                ].map((pillar) => {
                  const hasDoc = formationDocs.some((d) => {
                    const text = `${d.original_filename} ${(d.sub_types || []).join(' ')} ${d.staff_notes || ''}`.toLowerCase();
                    return text.includes(pillar.key);
                  });
                  return (
                    <div
                      key={pillar.key}
                      style={{
                        background: '#ffffff',
                        border: hasDoc ? '1px solid #86efac' : '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{pillar.name}</span>
                          {hasDoc ? (
                            <span style={{ color: '#15803d', fontSize: '0.75rem', fontWeight: 700, background: '#dcfce7', padding: '2px 6px', borderRadius: 6 }}>
                              ✓ {isDe ? 'Vorhanden' : 'Uploaded'}
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, background: '#f1f5f9', padding: '2px 6px', borderRadius: 6 }}>
                              {isDe ? 'Offen' : 'Pending'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{pillar.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Documents List Card */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  padding: 26,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                }}
              >
                {/* Header Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 20,
                    paddingBottom: 16,
                    borderBottom: '1px solid #f1f5f9',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
                      {isDe ? 'Hochgeladene Gründungsakten' : 'Uploaded Formation Files'} ({allFormationDocs.length})
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                      {isDe
                        ? 'Gespeichert in PostgreSQL und Google Drive unter „Correspondence / Company Formation“.'
                        : 'Saved to PostgreSQL database and Google Drive under "Correspondence / Company Formation".'}
                    </p>
                  </div>

                  <span
                    style={{
                      background: '#f8fafc',
                      color: '#475569',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <ShieldCheck size={14} color="#15803d" />
                    {isDe ? 'Revisionssicher archiviert' : 'Vault Synchronized'}
                  </span>
                </div>

                {/* AI Expiry Status Banner */}
                {(() => {
                  const expiredList = allFormationDocs.filter((d) => getDocExpiryInfo(d)?.status === 'EXPIRED');
                  const expiringSoonList = allFormationDocs.filter((d) => getDocExpiryInfo(d)?.status === 'EXPIRING_SOON');

                  if (expiredList.length === 0 && expiringSoonList.length === 0) return null;

                  return (
                    <div style={{ marginBottom: 20, display: 'grid', gap: 10 }}>
                      {expiredList.length > 0 && (
                        <div
                          style={{
                            background: '#fef2f2',
                            border: '1.5px solid #f87171',
                            borderRadius: 12,
                            padding: '14px 18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            color: '#991b1b',
                            boxShadow: '0 2px 6px rgba(239,68,68,0.06)',
                          }}
                        >
                          <AlertCircle size={24} color="#dc2626" style={{ flexShrink: 0 }} />
                          <div style={{ fontSize: '0.88rem' }}>
                            <strong>{isDe ? '⚠️ Achtung: Abgelaufene Unterlagen erfordern Erneuerung!' : '⚠️ Attention: Expired Documents Detected!'}</strong>
                            <div style={{ marginTop: 3, color: '#7f1d1d', fontSize: '0.82rem', lineHeight: 1.45 }}>
                              {isDe
                                ? `${expiredList.map((d) => `„${d.original_filename}“ (abgelaufen am ${getDocExpiryInfo(d)?.formatted_date})`).join(', ')} — Bitte aktualisieren Sie diese Unterlagen zeitnah über „Ersetzen“.`
                                : `${expiredList.map((d) => `"${d.original_filename}" (expired on ${getDocExpiryInfo(d)?.formatted_date})`).join(', ')} — Please upload an updated replacement via "Edit".`}
                            </div>
                          </div>
                        </div>
                      )}

                      {expiringSoonList.length > 0 && (
                        <div
                          style={{
                            background: '#fffbeb',
                            border: '1.5px solid #fbbf24',
                            borderRadius: 12,
                            padding: '14px 18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            color: '#92400e',
                          }}
                        >
                          <Clock size={24} color="#d97706" style={{ flexShrink: 0 }} />
                          <div style={{ fontSize: '0.88rem' }}>
                            <strong>{isDe ? 'Gültigkeitsfrist beachten:' : 'Upcoming Expiration Notice:'}</strong>
                            <div style={{ marginTop: 3, color: '#78350f', fontSize: '0.82rem' }}>
                              {isDe
                                ? `${expiringSoonList.map((d) => `„${d.original_filename}“ läuft am ${getDocExpiryInfo(d)?.formatted_date} ab (noch ${getDocExpiryInfo(d)?.days_until_expiry} Tage)`).join(', ')}`
                                : `${expiringSoonList.map((d) => `"${d.original_filename}" expires on ${getDocExpiryInfo(d)?.formatted_date} (${getDocExpiryInfo(d)?.days_until_expiry} days remaining)`).join(', ')}`}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Search Bar & Filter Chips */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
                  {/* Search Input */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      padding: '9px 14px',
                      maxWidth: 380,
                      flex: 1,
                      minWidth: 240,
                    }}
                  >
                    <Search size={16} color="#64748b" />
                    <input
                      type="text"
                      placeholder={isDe ? 'Dokumente oder Notizen durchsuchen...' : 'Search documents or notes...'}
                      value={formationSearch}
                      onChange={(e) => setFormationSearch(e.target.value)}
                      style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '0.86rem',
                        width: '100%',
                        color: '#0f172a',
                      }}
                    />
                    {formationSearch && (
                      <button
                        type="button"
                        onClick={() => setFormationSearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setFormationFilter('ALL')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        border: '1px solid',
                        borderColor: formationFilter === 'ALL' ? '#0b1a30' : '#e2e8f0',
                        background: formationFilter === 'ALL' ? '#0b1a30' : '#ffffff',
                        color: formationFilter === 'ALL' ? '#ffffff' : '#475569',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isDe ? 'Alle' : 'All'} ({allFormationDocs.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormationFilter('VALID')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        border: '1px solid',
                        borderColor: formationFilter === 'VALID' ? '#10b981' : '#bbf7d0',
                        background: formationFilter === 'VALID' ? '#ecfdf5' : '#ffffff',
                        color: '#065f46',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      🟢 {isDe ? 'Gültig' : 'Valid'} ({validFormationDocs.length})
                    </button>

                    {expiringSoonFormationDocs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFormationFilter('EXPIRING')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          border: '1px solid',
                          borderColor: formationFilter === 'EXPIRING' ? '#f59e0b' : '#fde68a',
                          background: formationFilter === 'EXPIRING' ? '#fffbeb' : '#ffffff',
                          color: '#92400e',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        🟡 {isDe ? 'Läuft bald ab' : 'Expiring'} ({expiringSoonFormationDocs.length})
                      </button>
                    )}

                    {expiredFormationDocs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFormationFilter('EXPIRED')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          border: '1px solid',
                          borderColor: formationFilter === 'EXPIRED' ? '#ef4444' : '#fecaca',
                          background: formationFilter === 'EXPIRED' ? '#fef2f2' : '#ffffff',
                          color: '#991b1b',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        🔴 {isDe ? 'Abgelaufen' : 'Expired'} ({expiredFormationDocs.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Empty State */}
                {formationDocs.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '48px 20px',
                      background: '#f8fafc',
                      borderRadius: 14,
                      border: '2px dashed #cbd5e1',
                    }}
                  >
                    <Building2 size={42} color="#94a3b8" style={{ marginBottom: 12 }} />
                    <h5 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700, color: '#334155' }}>
                      {allFormationDocs.length === 0
                        ? (isDe ? 'Noch keine Gründungsunterlagen hinterlegt' : 'No formation documents uploaded yet')
                        : (isDe ? 'Keine Dokumente für diesen Filter gefunden' : 'No documents match the current filter')}
                    </h5>
                    <p style={{ margin: '0 auto 18px auto', maxWidth: 440, fontSize: '0.85rem', color: '#64748b' }}>
                      {allFormationDocs.length === 0
                        ? (isDe
                            ? 'Laden Sie Ausweis, Handelsregisterauszug, Gewerbeanmeldung oder Gesellschaftsvertrag hoch, um Ihr Mandantenprofil zu vervollständigen.'
                            : 'Upload your founder ID, trade register extract, trade permit, or company agreement to complete onboarding.')
                        : (isDe ? 'Bitte wählen Sie „Alle“ oder passen Sie Ihre Suche an.' : 'Please select "All" or adjust your search filter.')}
                    </p>
                    {allFormationDocs.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => openModal('FORMATION')}
                        style={{
                          background: '#0b1a30',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 10,
                          padding: '11px 20px',
                          fontSize: '0.86rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <Upload size={15} />
                        <span>{isDe ? 'Jetzt Unterlagen einreichen' : 'Submit Formation Documents Now'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setFormationFilter('ALL'); setFormationSearch(''); }}
                        style={{
                          background: '#ffffff',
                          color: '#0b1a30',
                          border: '1px solid #cbd5e1',
                          borderRadius: 8,
                          padding: '8px 16px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {isDe ? 'Filter zurücksetzen' : 'Reset Filter'}
                      </button>
                    )}
                  </div>
                ) : (
                  /* Redesigned Document List Cards */
                  <div style={{ display: 'grid', gap: 14 }}>
                    {formationDocs.map((doc) => {
                      const dateVal = doc.uploaded_at || (doc as any).created_at;
                      const uploadDate = dateVal ? new Date(dateVal).toLocaleDateString(isDe ? 'de-DE' : 'en-US') : '—';
                      const sizeVal = doc.size_bytes || (doc as any).file_size;
                      const fileSizeKb = sizeVal ? `${Math.round(sizeVal / 1024)} KB` : '';
                      const isDeleting = deletingDocId === doc.id;
                      const expInfo = getDocExpiryInfo(doc);

                      const ext = (doc.original_filename || '').split('.').pop()?.toUpperCase() || 'FILE';
                      const isPdf = ext === 'PDF';
                      const isImg = ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'BMP'].includes(ext);

                      const isExpired = expInfo?.status === 'EXPIRED';
                      const isExpiringSoon = expInfo?.status === 'EXPIRING_SOON';
                      const isValid = expInfo?.status === 'VALID';

                      const accentColor = isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : isValid ? '#10b981' : '#3b82f6';
                      const cardBg = isExpired ? '#fffbfa' : '#ffffff';

                      return (
                        <div
                          key={doc.id}
                          style={{
                            background: cardBg,
                            borderRadius: 14,
                            border: '1px solid',
                            borderColor: isExpired ? '#fca5a5' : isExpiringSoon ? '#fcd34d' : '#e2e8f0',
                            borderLeft: `5px solid ${accentColor}`,
                            boxShadow: isExpired
                              ? '0 4px 14px rgba(239, 68, 68, 0.08)'
                              : '0 2px 8px rgba(15, 23, 42, 0.04)',
                            padding: '20px 24px',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = isExpired
                              ? '0 8px 22px rgba(239, 68, 68, 0.12)'
                              : '0 8px 20px rgba(15, 23, 42, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = isExpired
                              ? '0 4px 14px rgba(239, 68, 68, 0.08)'
                              : '0 2px 8px rgba(15, 23, 42, 0.04)';
                          }}
                        >
                          {/* Top Row: File icon, details, and actions */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                            {/* Left: Icon + File Details */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flex: 1, minWidth: 280 }}>
                              {/* File Type Icon Badge (wrapped by expiry ring if the doc has an expiry date) */}
                              {(() => {
                                const ring = getExpiryRing(doc);
                                const iconBox = (
                                  <div
                                    style={{
                                      width: 48,
                                      height: 48,
                                      borderRadius: ring ? '50%' : 12,
                                      background: isPdf ? '#fee2e2' : isImg ? '#eff6ff' : '#f1f5f9',
                                      border: ring ? 'none' : `1.5px solid ${isPdf ? '#fca5a5' : isImg ? '#bfdbfe' : '#cbd5e1'}`,
                                      color: isPdf ? '#dc2626' : isImg ? '#2563eb' : '#475569',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {isImg ? <FileImage size={20} /> : <FileText size={20} />}
                                    <span style={{ fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 1 }}>
                                      {ext}
                                    </span>
                                  </div>
                                );
                                if (!ring) return iconBox;
                                const size = 64;
                                const sw = 5;
                                const r = (size - sw) / 2;
                                const c = 2 * Math.PI * r;
                                return (
                                  <div
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}
                                    title={
                                      expInfo?.formatted_date
                                        ? `${isDe ? 'Ablaufdatum' : 'Expiry date'}: ${expInfo.formatted_date}${
                                            ring.daysLeft > 0 ? ` • ${ring.daysLeft} ${isDe ? 'Tage übrig' : 'days left'} (${ring.percent}%)` : ` • ${isDe ? 'Abgelaufen' : 'Expired'}`
                                          }`
                                        : undefined
                                    }
                                  >
                                    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                                        <circle cx={size / 2} cy={size / 2} r={r} stroke={ring.track} strokeWidth={sw} fill="none" />
                                        <circle
                                          cx={size / 2}
                                          cy={size / 2}
                                          r={r}
                                          stroke={ring.color}
                                          strokeWidth={sw}
                                          fill="none"
                                          strokeLinecap="round"
                                          strokeDasharray={c}
                                          strokeDashoffset={c - (ring.percent / 100) * c}
                                          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                                        />
                                      </svg>
                                      {iconBox}
                                    </div>
                                    <span style={{ fontSize: '0.66rem', fontWeight: 800, color: ring.color, whiteSpace: 'nowrap' }}>
                                      {ring.label}
                                    </span>
                                  </div>
                                );
                              })()}

                              {/* Title & Metadata */}
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                                  <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', letterSpacing: '-0.2px' }}>
                                    {doc.original_filename}
                                  </span>

                                  {/* Status Pill: Active in Vault */}
                                  <span
                                    style={{
                                      background: '#f0fdf4',
                                      color: '#15803d',
                                      border: '1px solid #bbf7d0',
                                      borderRadius: 999,
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      padding: '3px 9px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <CheckCircle2 size={12} />
                                    {isDe ? 'Im Tresor archiviert' : 'Archived in Vault'}
                                  </span>

                                  {/* AI Expiry Status Pill */}
                                  {expInfo && (
                                    isExpired ? (
                                      <span
                                        style={{
                                          background: '#fee2e2',
                                          color: '#991b1b',
                                          border: '1px solid #f87171',
                                          borderRadius: 999,
                                          fontSize: '0.72rem',
                                          fontWeight: 800,
                                          padding: '3px 10px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          boxShadow: '0 2px 4px rgba(239, 68, 68, 0.15)',
                                        }}
                                      >
                                        <AlertCircle size={13} color="#dc2626" />
                                        {isDe ? `Abgelaufen am ${expInfo.formatted_date}` : `Expired on ${expInfo.formatted_date}`}
                                      </span>
                                    ) : isExpiringSoon ? (
                                      <span
                                        style={{
                                          background: '#fef3c7',
                                          color: '#92400e',
                                          border: '1px solid #fbbf24',
                                          borderRadius: 999,
                                          fontSize: '0.72rem',
                                          fontWeight: 800,
                                          padding: '3px 10px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                        }}
                                      >
                                        <Clock size={13} color="#d97706" />
                                        {isDe ? `Läuft am ${expInfo.formatted_date} ab (${expInfo.days_until_expiry} Tage)` : `Expires on ${expInfo.formatted_date} (${expInfo.days_until_expiry}d left)`}
                                      </span>
                                    ) : isValid ? (
                                      <span
                                        style={{
                                          background: '#ecfdf5',
                                          color: '#065f46',
                                          border: '1px solid #a7f3d0',
                                          borderRadius: 999,
                                          fontSize: '0.72rem',
                                          fontWeight: 700,
                                          padding: '3px 10px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                        }}
                                      >
                                        <ShieldCheck size={13} color="#059669" />
                                        {isDe ? `Gültig bis ${expInfo.formatted_date}` : `Valid until ${expInfo.formatted_date}`}
                                      </span>
                                    ) : (
                                      <span
                                        style={{
                                          background: '#f1f5f9',
                                          color: '#334155',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: 999,
                                          fontSize: '0.72rem',
                                          fontWeight: 700,
                                          padding: '3px 10px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                        }}
                                      >
                                        <FileText size={13} color="#64748b" />
                                        {isDe ? 'Dauergültiges Dokument' : 'Permanent Legal Document'}
                                      </span>
                                    )
                                  )}
                                </div>

                                {/* Technical Metadata Row */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.8rem', color: '#64748b', flexWrap: 'wrap' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Calendar size={13} color="#94a3b8" />
                                    {isDe ? 'Hochgeladen:' : 'Uploaded:'} <strong style={{ color: '#334155' }}>{uploadDate}</strong>
                                  </span>

                                  {fileSizeKb && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      • <span>{fileSizeKb}</span>
                                    </span>
                                  )}

                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0369a1' }}>
                                    • 📁 Correspondence / Company Formation
                                  </span>
                                </div>

                                {/* Document Subtype Chips */}
                                {doc.sub_types && doc.sub_types.length > 0 && (
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    {doc.sub_types.map((st, i) => (
                                      <span
                                        key={i}
                                        style={{
                                          background: '#f8fafc',
                                          color: '#334155',
                                          borderRadius: 6,
                                          fontSize: '0.72rem',
                                          fontWeight: 600,
                                          padding: '3px 8px',
                                          border: '1px solid #e2e8f0',
                                        }}
                                      >
                                        {st}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Modern Action Buttons Group */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              {/* View / Download */}
                              <a
                                href={`${API_BASE}/documents/${doc.id}/file`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '8px 14px',
                                  borderRadius: 8,
                                  background: '#ffffff',
                                  border: '1.5px solid #cbd5e1',
                                  color: '#1e293b',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#f8fafc';
                                  e.currentTarget.style.borderColor = '#94a3b8';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                              >
                                <Eye size={14} />
                                <span>{isDe ? 'Ansehen' : 'View'}</span>
                              </a>

                              {/* Edit / Replace */}
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(doc)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '8px 14px',
                                  borderRadius: 8,
                                  background: '#eff6ff',
                                  border: '1.5px solid #bfdbfe',
                                  color: '#1d4ed8',
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#dbeafe';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#eff6ff';
                                }}
                              >
                                <Pencil size={14} />
                                <span>{isDe ? 'Ersetzen' : 'Edit'}</span>
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleDeleteDocument(doc.id, doc.original_filename)}
                                disabled={isDeleting}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '8px 14px',
                                  borderRadius: 8,
                                  background: '#fff1f2',
                                  border: '1.5px solid #fecdd3',
                                  color: '#dc2626',
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                                  opacity: isDeleting ? 0.6 : 1,
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isDeleting) e.currentTarget.style.background = '#fee2e2';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isDeleting) e.currentTarget.style.background = '#fff1f2';
                                }}
                              >
                                <Trash2 size={14} />
                                <span>{isDeleting ? (isDe ? 'Löschen...' : 'Deleting...') : (isDe ? 'Löschen' : 'Delete')}</span>
                              </button>
                            </div>
                          </div>

                          {/* Bottom Block: AI Verification Insight Callout */}
                          {(doc.staff_notes || expInfo?.warning_message) && (
                            <div
                              style={{
                                marginTop: 4,
                                padding: '12px 16px',
                                borderRadius: 10,
                                background: isExpired ? '#fff1f2' : isExpiringSoon ? '#fffbeb' : '#f0fdf4',
                                border: '1px solid',
                                borderColor: isExpired ? '#fecdd3' : isExpiringSoon ? '#fef08a' : '#bbf7d0',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 12,
                              }}
                            >
                              <div style={{ marginTop: 2, flexShrink: 0 }}>
                                {isExpired ? (
                                  <AlertCircle size={17} color="#e11d48" />
                                ) : isExpiringSoon ? (
                                  <Clock size={17} color="#d97706" />
                                ) : (
                                  <Sparkles size={17} color="#16a34a" />
                                )}
                              </div>
                              <div style={{ flex: 1, fontSize: '0.84rem', lineHeight: 1.5 }}>
                                <div style={{ fontWeight: 800, color: isExpired ? '#9f1239' : isExpiringSoon ? '#92400e' : '#166534', marginBottom: 2 }}>
                                  {isDe ? 'KI-Dokumentenanalyse & Gültigkeitsprüfung:' : 'AI Document Inspection & Validity:'}
                                </div>
                                <div style={{ color: isExpired ? '#881337' : isExpiringSoon ? '#78350f' : '#14532d' }}>
                                  {(doc.staff_notes || expInfo?.warning_message || '').replace(/^"|"$/g, '')}
                                </div>
                                {isExpired && (
                                  <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 700, color: '#be123c' }}>
                                    ➔ {isDe ? 'Handlungsempfehlung: Bitte laden Sie ein aktuelles Dokument über „Ersetzen“ hoch, um Kanzleianforderungen zu erfüllen.' : 'Recommendation: Please upload an updated document via "Edit" to meet compliance requirements.'}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* ── 4. SUBMISSION MODALS (MATCHING CONCEPT SCREENSHOTS EXACTLY) ── */}
      {activeModal && currentConfig && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(11, 26, 48, 0.72)',
          backdropFilter: 'blur(5px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            maxWidth: 780,
            width: '100%',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '28px 34px',
            boxShadow: '0 24px 48px rgba(11,26,48,0.3)',
            animation: 'fadeIn 0.2s ease-out',
          }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.32rem', fontWeight: 700, color: '#0b1a30', fontFamily: 'Georgia, "Playfair Display", serif' }}>
                {currentConfig.title}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 8,
                }}
              >
                ✕ {isDe ? 'Schließen' : 'Close'}
              </button>
            </div>

            {/* 6-Step Automatic OCR + Ollama + SKR03 CSV Pipeline Banner for Financial Accounting */}
            {activeModal === 'ACCOUNTING' && (
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 18,
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🤖 Automatic AI Accounting Pipeline (OCR ➔ Ollama ➔ SKR03 CSV ➔ Year/Month Folder)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: '0.74rem', color: '#334155' }}>
                  <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #dbeafe' }}>
                    <strong>1.</strong> PDF / Image Upload
                  </div>
                  <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #dbeafe' }}>
                    <strong>2.</strong> Document Type Detect
                  </div>
                  <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #dbeafe' }}>
                    <strong>3.</strong> OCR Text & Layout Scan
                  </div>
                  <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                    <strong>4.</strong> Ollama Data Extraction
                  </div>
                  <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                    <strong>5.</strong> Invoice & Date (Year/Month) Identify
                  </div>
                  <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                    <strong>6.</strong> SKR03 Account & CSV in Year/Month Folder
                  </div>
                </div>
              </div>
            )}

            {/* Month & Year Selectors (For Payroll, Accounting, Correspondence) */}
            {currentConfig.hasMonthYear && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 6, letterSpacing: '0.04em' }}>
                    {isDe ? 'MONAT' : 'MONTH'}
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1.5px solid #e2e8f0',
                      background: '#f8fafc',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  >
                    {displayMonths.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 6, letterSpacing: '0.04em' }}>
                    {isDe ? 'JAHR' : 'YEAR'}
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1.5px solid #e2e8f0',
                      background: '#f8fafc',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Document Types Checklist (2-Column Checkboxes Matching Concept Screenshot) */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 8, letterSpacing: '0.04em' }}>
                {isDe ? 'ART DER UNTERLAGEN' : 'DOCUMENT TYPES'}
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Column 1 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {currentConfig.col1.map((item) => {
                    const isChecked = selectedTypes.includes(item);
                    return (
                      <label
                        key={item}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 14px',
                          borderRadius: 8,
                          border: '1px solid',
                          borderColor: isChecked ? '#d4a359' : '#e8e4dc',
                          background: isChecked ? '#fffdfa' : '#ffffff',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          color: '#1e293b',
                          transition: 'all 0.1s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleType(item)}
                          style={{ width: 16, height: 16, accentColor: '#0b1a30', cursor: 'pointer' }}
                        />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Column 2 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {currentConfig.col2.map((item) => {
                    const isChecked = selectedTypes.includes(item);
                    return (
                      <label
                        key={item}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 14px',
                          borderRadius: 8,
                          border: '1px solid',
                          borderColor: isChecked ? '#d4a359' : '#e8e4dc',
                          background: isChecked ? '#fffdfa' : '#ffffff',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          color: '#1e293b',
                          transition: 'all 0.1s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleType(item)}
                          style={{ width: 16, height: 16, accentColor: '#0b1a30', cursor: 'pointer' }}
                        />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Drag & Drop File Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '1.5px dashed #cbd5e1',
                borderRadius: 14,
                padding: '28px 20px',
                textAlign: 'center',
                background: '#fafbfc',
                cursor: 'pointer',
                marginBottom: 20,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0b1a30';
                e.currentTarget.style.background = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = '#fafbfc';
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />

              <div style={{
                width: 42,
                height: 42,
                background: '#3b82f6',
                color: '#ffffff',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
                boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)',
              }}>
                <ArrowUp size={22} strokeWidth={2.8} />
              </div>

              <div style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 600 }}>
                {isDe ? (
                  <><strong>Dateien auswählen</strong> oder hier ablegen</>
                ) : (
                  <><strong>Select files</strong> or drag and drop files here</>
                )}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                PDF, Photos, Word, Excel · Maximum 20 MB per file
              </div>
            </div>

            {/* Selected Files List Preview */}
            {modalFiles.length > 0 && (
              <div style={{ marginBottom: 18, background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                  {isDe ? 'Ausgewählte Dateien:' : 'Selected Files:'} ({modalFiles.length})
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {modalFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 8px', background: '#ffffff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{f.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Note Input (Context specific placeholder as requested in Concept PDF) */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 6, letterSpacing: '0.04em' }}>
                {isDe ? 'NOTIZ (OPTIONAL)' : 'NOTE (OPTIONAL)'}
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={currentConfig.notePlaceholder}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1.5px solid #e8e4dc',
                  background: '#fdfcf9',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Submit Action Button */}
            <button
              onClick={handleSubmitModal}
              disabled={isSubmitting}
              style={{
                width: '100%',
                background: '#0b1a30',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '14px 20px',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(11,26,48,0.25)',
                transition: 'all 0.15s ease',
              }}
            >
              {isSubmitting ? (
                <span>{isDe ? 'Wird übermittelt & KI verarbeitet...' : 'Submitting & Processing with AI...'}</span>
              ) : (
                <>
                  <span>{isDe ? 'Unterlagen absenden →' : 'Submit Documents →'}</span>
                </>
              )}
            </button>

          </div>
        </div>
      )}

      {/* ── 5. FORMATION DOCUMENT EDIT MODAL ── */}
      {editingDoc && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(11, 26, 48, 0.72)',
            backdropFilter: 'blur(5px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: 540,
              width: '100%',
              padding: 28,
              boxShadow: '0 24px 48px -12px rgba(11, 26, 48, 0.35)',
              border: '1px solid #e2e8f0',
              position: 'relative',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: 8, borderRadius: 8 }}>
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0b1a30' }}>
                    {isDe ? 'Gründungsunterlage bearbeiten' : 'Edit Formation Document'}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                    ID: {editingDoc.id} • 00_Stammdaten
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Fields */}
            <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
              {/* Filename */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  {isDe ? 'Dateiname / Bezeichnung' : 'Filename / Document Name'}
                </label>
                <input
                  type="text"
                  value={editFilename}
                  onChange={(e) => setEditFilename(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Replace Document File (PDF or Image) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  {isDe ? 'Dokumentendatei austauschen (PDF oder Bild)' : 'Replace Document File (PDF or Image)'}
                </label>

                {editFile ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f0fdf4',
                      border: '1.5px solid #86efac',
                      borderRadius: 10,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileText size={20} color="#16a34a" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#166534' }}>
                          {editFile.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#15803d' }}>
                          {Math.round(editFile.size / 1024)} KB • {isDe ? 'Wird als neue Datei gespeichert' : 'Will replace current file'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditFile(null);
                        setEditFilename(editingDoc.original_filename || '');
                      }}
                      style={{
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isDe ? 'Entfernen' : 'Remove'}
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '16px 20px',
                      background: '#f8fafc',
                      borderRadius: 10,
                      border: '2px dashed #cbd5e1',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#0284c7';
                      e.currentTarget.style.background = '#f0f9ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                  >
                    <input
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const f = e.target.files[0];
                          setEditFile(f);
                          setEditFilename(f.name);
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                    <Upload size={22} color="#0284c7" style={{ marginBottom: 6 }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                      {isDe ? 'Neue Datei auswählen (PDF oder Bild)' : 'Choose replacement file (PDF or Image)'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      {isDe ? 'PDF, PNG, JPG, WEBP bis zu 20 MB' : 'PDF, PNG, JPG, WEBP up to 20 MB'}
                    </div>
                  </label>
                )}
              </div>

              {/* Sub-types Tag Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  {isDe ? 'Dokumententyp(en) / Klassifikation' : 'Document Classification Tags'}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(isDe ? [
                    'Handelsregisterauszug',
                    'Gewerbeanmeldung',
                    'Gesellschaftsvertrag',
                    'Personalausweis / Reisepass',
                    'Steuernummer',
                    'Bankverbindung (IBAN)',
                    'Sonstiges',
                  ] : [
                    'Commercial Register Extract',
                    'Business Registration',
                    'Articles of Association',
                    'Personal ID / Passport',
                    'Tax Number',
                    'Bank Details (IBAN)',
                    'Other',
                  ]).map((tag) => {
                    const isSelected = editSubTypes.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setEditSubTypes((prev) =>
                            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                          );
                        }}
                        style={{
                          background: isSelected ? '#0b1a30' : '#f8fafc',
                          color: isSelected ? '#ffffff' : '#475569',
                          border: isSelected ? '1px solid #0b1a30' : '1px solid #cbd5e1',
                          borderRadius: 999,
                          padding: '5px 12px',
                          fontSize: '0.78rem',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected ? '✓ ' : '+ '}{tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  {isDe ? 'Notizen / Bemerkung' : 'Notes / Remarks'}
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder={isDe ? 'z.B. Vom Notar beglaubigt, aktualisierte Fassung...' : 'e.g. Certified by notary, updated version...'}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                style={{
                  background: '#0b1a30',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: isSavingEdit ? 'not-allowed' : 'pointer',
                  opacity: isSavingEdit ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isSavingEdit ? (
                  <span>{isDe ? 'Wird gespeichert...' : 'Saving...'}</span>
                ) : (
                  <>
                    <Check size={16} />
                    <span>{isDe ? 'Änderungen speichern' : 'Save Changes'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
