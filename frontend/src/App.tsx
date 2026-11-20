import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Trash2,
  Eye,
  RefreshCw,
  Receipt,
  FileSpreadsheet,
  X,
  ExternalLink,
  ShieldCheck,
  Mail,
  CalendarClock,
  Plus,
  ArrowRight,
  Info,
} from 'lucide-react';
import { translations, type Language } from './translations';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SnackbarProvider, useSnackbar } from './context/SnackbarContext';
import { Sidebar, type ClientTabType } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { FirstLoginModal } from './components/FirstLoginModal';
import { FileExplorer } from './components/FileExplorer';
import { ClientPortal } from './portals/ClientPortal';
import { AdminPortal } from './portals/AdminPortal';
import { BankReconciliationModal } from './components/BankReconciliationModal';
import type { BankStatementItem } from './components/BankReconciliationModal';
import { openAuthenticatedFileInNewTab, fetchAuthenticatedBlobUrl } from './utils/authFile';

interface ExtractedInvoiceData {
  document_type: string;
  supplier_name: string;
  supplier_tax_id?: string;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  net_amount: number;
  vat_rate_percent: number;
  vat_amount: number;
  total_amount: number;
  confidence_score: number;
  skr03_account_code?: string;
}

interface ValidationIssue {
  field: string;
  message: string;
  severity: 'WARNING' | 'ERROR';
}

interface DocumentRecord {
  id: string;
  category?: string;
  sub_types?: string[];
  original_filename: string;
  stored_filename: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  status: 'UPLOADED' | 'PROCESSING' | 'READY_FOR_REVIEW' | 'NEEDS_ATTENTION' | 'APPROVED' | 'EXPORTED';
  extracted_data?: ExtractedInvoiceData;
  validation_issues?: ValidationIssue[];
  staff_notes?: string;
  reviewed_at?: string;
}

interface CorrespondenceItem {
  id: string;
  document_id: string;
  letter_type: string;
  sender: string;
  tax_number?: string;
  letter_date?: string;
  deadline?: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  ai_summary: string;
  action_proposed: string;
  task_id?: string;
  original_filename?: string;
}

const API_BASE = 'http://localhost:5000/api';

function MainAppContent() {
  const { user, activePortal } = useAuth();
  const { success, error } = useSnackbar();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [adminNavTab, setAdminNavTab] = useState<'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT'>('USERS');
  const [clientNavTab, setClientNavTab] = useState<ClientTabType>('OVERVIEW');
  const [lang, setLang] = useState<Language>(() => {
    const userSelected = localStorage.getItem('fintax_lang_user_selected');
    if (userSelected === 'de') return 'de';
    // By default language is English
    localStorage.setItem('fintax_lang', 'en');
    return 'en';
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [firstLoginDismissed, setFirstLoginDismissed] = useState<boolean>(() => {
    return localStorage.getItem('fintax_first_login_dismissed') === 'true';
  });

  const t = translations[lang];

  const handleLangChange = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('fintax_lang', newLang);
    localStorage.setItem('fintax_lang_user_selected', newLang);
  };

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [selectedDocBlobUrl, setSelectedDocBlobUrl] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState<ExtractedInvoiceData | null>(null);

  useEffect(() => {
    if (!selectedDoc) {
      setSelectedDocBlobUrl(null);
      return;
    }
    const controller = new AbortController();
    let createdUrl: string | null = null;
    fetchAuthenticatedBlobUrl(`${API_BASE}/documents/${selectedDoc.id}/file`, controller.signal)
      .then((blobUrl) => {
        createdUrl = blobUrl;
        setSelectedDocBlobUrl(blobUrl);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error('Document preview fetch error:', err);
          setSelectedDocBlobUrl(null);
        }
      });
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [selectedDoc]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'NEEDS_ATTENTION' | 'APPROVED'>('ALL');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bank Statement State (PDF Page 8) & Vault Explorer
  const [staffTab, setStaffTab] = useState<'INVOICES' | 'BANK' | 'CORR' | 'PAYROLL' | 'VAULT'>('INVOICES');
  const [bankStatements, setBankStatements] = useState<BankStatementItem[]>([]);
  const [selectedStatement, setSelectedStatement] = useState<BankStatementItem | null>(null);

  // Correspondence & Deadline State (PDF Page 10)
  const [corrLetters, setCorrLetters] = useState<CorrespondenceItem[]>([]);
  const [selectedCorr, setSelectedCorr] = useState<CorrespondenceItem | null>(null);
  const [corrUploading, setCorrUploading] = useState(false);
  const corrFileRef = useRef<HTMLInputElement>(null);

  // Payroll State (PDF Page 9)
  const [staffPayroll, setStaffPayroll] = useState<any[]>([]);
  const [staffPayslips, setStaffPayslips] = useState<any[]>([]);
  const [approvingPayrollId, setApprovingPayrollId] = useState<string | null>(null);

  const fetchStaffPayroll = async () => {
    try {
      const [subRes, slipRes] = await Promise.all([
        fetch(`${API_BASE}/payroll/submissions`),
        fetch(`${API_BASE}/payroll/payslips`),
      ]);
      if (subRes.ok) setStaffPayroll(await subRes.json());
      if (slipRes.ok) setStaffPayslips(await slipRes.json());
    } catch (e) {
      console.error('Error fetching staff payroll:', e);
    }
  };

  const handleSeedStaffPayroll = async () => {
    try {
      const res = await fetch(`${API_BASE}/payroll/seed-demo`, { method: 'POST' });
      if (res.ok) await fetchStaffPayroll();
    } catch (e) {
      console.error('Error seeding demo payroll:', e);
    }
  };

  const handleApprovePayroll = async (id: string) => {
    setApprovingPayrollId(id);
    try {
      const res = await fetch(`${API_BASE}/payroll/submissions/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_notes: 'Geprüft und Lohnabrechnung für Mandanten freigegeben.' }),
      });
      if (res.ok) {
        await fetchStaffPayroll();
      }
    } catch (e) {
      console.error('Error approving payroll:', e);
    } finally {
      setApprovingPayrollId(null);
    }
  };

  // Fetch documents from backend (client isolated or all for staff/admin)
  const fetchDocuments = async (overrideClientId?: unknown) => {
    setLoading(true);
    try {
      const activeClientId = typeof overrideClientId === 'string'
        ? overrideClientId 
        : (user?.role === 'CLIENT' ? user.id : undefined);
      const url = activeClientId ? `${API_BASE}/documents?client_id=${encodeURIComponent(activeClientId)}` : `${API_BASE}/documents`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBankStatements = async () => {
    try {
      const res = await fetch(`${API_BASE}/bank-statements`);
      if (res.ok) {
        const data = await res.json();
        setBankStatements(data);
      }
    } catch (err) {
      console.error('Error fetching bank statements:', err);
    }
  };

  const openStatementDetails = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/bank-statements/${id}`);
      if (res.ok) {
        const fullStatement = await res.json();
        setSelectedStatement(fullStatement);
      }
    } catch (err) {
      console.error('Error opening statement details:', err);
    }
  };

  const handleSeedDemoStatement = async () => {
    try {
      const res = await fetch(`${API_BASE}/bank-statements/sample-demo`, { method: 'POST' });
      if (res.ok) {
        await fetchBankStatements();
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Error seeding demo statement:', err);
    }
  };

  // Correspondence fetchers (PDF Page 10)
  const fetchCorrespondence = async () => {
    try {
      const res = await fetch(`${API_BASE}/correspondence`);
      if (res.ok) {
        const data = await res.json();
        setCorrLetters(data);
      }
    } catch (err) {
      console.error('Error fetching correspondence:', err);
    }
  };

  const handleSeedDemoLetter = async () => {
    try {
      const res = await fetch(`${API_BASE}/correspondence/seed-demo`, { method: 'POST' });
      if (res.ok) {
        await fetchCorrespondence();
      }
    } catch (err) {
      console.error('Error seeding demo letter:', err);
    }
  };

  const handleCorrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCorrUploading(true);
    const formData = new FormData();
    formData.append('letter', file);
    try {
      const res = await fetch(`${API_BASE}/correspondence/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        success(lang === 'de' ? 'Finanzamt-Schreiben hochgeladen und von KI analysiert.' : 'Tax correspondence uploaded and analyzed.', 'Finanzamt-Brief');
        await fetchCorrespondence();
      } else {
        const err = await res.json();
        error(`Upload-Fehler: ${err.error || 'Server error'}`);
      }
    } catch (err: any) {
      error(`Netzwerkfehler: ${err?.message}`);
    } finally {
      setCorrUploading(false);
      if (corrFileRef.current) corrFileRef.current.value = '';
    }
  };

  const handleCreateTaskFromLetter = async (corrId: string) => {
    try {
      const res = await fetch(`${API_BASE}/correspondence/${corrId}/create-task`, { method: 'POST' });
      if (res.ok) {
        await fetchCorrespondence();
      }
    } catch (err) {
      console.error('Error creating task:', err);
    }
  };

  const getDeadlineInfo = (deadline?: string) => {
    if (!deadline) return { label: t.corrNoDeadline, color: '#64748b', daysLeft: null };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dl = new Date(deadline);
    dl.setHours(0, 0, 0, 0);
    const diffMs = dl.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: t.corrOverdue, color: '#ef4444', daysLeft: diffDays };
    if (diffDays === 0) return { label: t.corrToday, color: '#f59e0b', daysLeft: 0 };
    return { label: `${diffDays} ${t.corrDaysLeft}`, color: diffDays <= 7 ? '#f59e0b' : '#10b981', daysLeft: diffDays };
  };

  useEffect(() => {
    fetchDocuments();
    fetchBankStatements();
    fetchCorrespondence();
    const handleDocUpdated = () => {
      fetchDocuments();
    };
    window.addEventListener('fintax_doc_updated', handleDocUpdated);
    const interval = setInterval(() => {
      fetchDocuments();
      fetchBankStatements();
      fetchCorrespondence();
    }, 8000);
    return () => {
      window.removeEventListener('fintax_doc_updated', handleDocUpdated);
      clearInterval(interval);
    };
  }, [user?.id, user?.role]);

  // Handle direct file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFileToServer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFileToServer = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('document', file);
    if (user?.id) {
      formData.append('client_id', user.id);
    }

    try {
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        success(lang === 'de' ? 'Beleg erfolgreich hochgeladen und von KI erfasst.' : 'Document uploaded and processed by AI.', 'Beleg-Upload');
        await fetchDocuments();
        if (result.document && (activePortal === 'STAFF' || user?.role === 'STAFF')) {
          openReviewModal(result.document);
        }
      } else {
        const err = await res.json();
        error(`Upload-Fehler: ${err.error || 'Server error'}`);
      }
    } catch (err: any) {
      error(`Netzwerkfehler beim Upload: ${err?.message}`);
    } finally {
      setUploading(false);
    }
  };

  const openReviewModal = (doc: DocumentRecord) => {
    setSelectedDoc(doc);
    if (doc.extracted_data) {
      setReviewForm({ ...doc.extracted_data });
    } else {
      setReviewForm({
        document_type: 'PURCHASE_INVOICE',
        supplier_name: '',
        invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0],
        currency: 'EUR',
        net_amount: 0,
        vat_rate_percent: 19,
        vat_amount: 0,
        total_amount: 0,
        confidence_score: 0.5,
        skr03_account_code: '4930',
      });
    }
  };

  const handleReviewSave = async (approved: boolean) => {
    if (!selectedDoc || !reviewForm) return;

    try {
      const res = await fetch(`${API_BASE}/documents/${selectedDoc.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extracted_data: reviewForm,
          status: approved ? 'APPROVED' : selectedDoc.status,
          staff_notes: approved ? 'Approved by staff review' : 'Draft updated',
        }),
      });

      if (res.ok) {
        await fetchDocuments();
        setSelectedDoc(null);
      }
    } catch (err: any) {
      alert(`Error saving review: ${err?.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    const reason = prompt(
      lang === 'de'
        ? '⚠️ DSGVO & GoBD-Hinweis (§ 147 AO):\nBelege unterliegen gesetzlichen Aufbewahrungsfristen (10 Jahre) und dürfen nicht direkt gelöscht werden.\n\nEin formaler Löschantrag erfordert die Freigabe von ZWEI Administratoren.\n\nBitte geben Sie den Grund für den Löschantrag ein:'
        : '⚠️ GDPR & GoBD Compliance (§ 147 AO):\nInvoices are subject to mandatory retention periods (10 years) and cannot be directly deleted.\n\nA formal deletion request requires TWO Administrator approvals.\n\nPlease enter the reason for deletion:'
    );

    if (!reason) return;

    try {
      const res = await fetch(`${API_BASE}/documents/${id}/request-deletion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          userId: user?.id || 'staff',
          userName: user?.name || 'FinTax Sachbearbeiter',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        success(
          lang === 'de'
            ? `Löschantrag eingereicht! Liegt nun zur 2-Admin Freigabe vor.`
            : `Deletion request submitted for 2-Admin approval.`,
          '2-Admin Löschfreigabe'
        );
        fetchDocuments();
      } else {
        error(`Fehler: ${data.error || 'Löschantrag fehlgeschlagen'}`);
      }
    } catch (err: any) {
      error(`Fehler beim Einreichen des Löschantrags: ${err?.message}`);
    }
  };

  const handleExportAgenda = () => {
    window.open(`${API_BASE}/export/agenda-skr03`, '_blank');
    success(
      lang === 'de'
        ? 'Agenda SKR03 CSV erfolgreich generiert und direkt in Google Drive (fintax/CSVs) gespeichert!'
        : 'Agenda SKR03 CSV generated and automatically synced to Google Drive (fintax/CSVs)!',
      'Google Drive Sync'
    );
  };

  const stats = {
    total: documents.length,
    needsReview: documents.filter((d) => d.status === 'READY_FOR_REVIEW' || d.status === 'NEEDS_ATTENTION').length,
    approved: documents.filter((d) => d.status === 'APPROVED').length,
    exported: documents.filter((d) => d.status === 'EXPORTED').length,
  };

  const filteredDocs = documents.filter((d) => {
    if (activeTab === 'NEEDS_ATTENTION') return d.status === 'NEEDS_ATTENTION';
    if (activeTab === 'APPROVED') return d.status === 'APPROVED' || d.status === 'EXPORTED';
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f8fafc', color: '#0f172a' }}>
      {/* ── Left Sidebar Navigation (Admin, Staff & Client) ── */}
      {user && (
        <Sidebar
          lang={lang}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          adminTab={adminNavTab}
          onAdminTabChange={setAdminNavTab}
          staffTab={staffTab}
          onStaffTabChange={setStaffTab}
          clientTab={clientNavTab}
          onClientTabChange={setClientNavTab}
          pendingReviewCount={stats.needsReview}
        />
      )}

      {/* ── Right Content Area ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
        {/* Top Navbar */}
        <Navbar
          lang={lang}
          onLanguageChange={handleLangChange}
          onOpenLogin={() => setShowLoginModal(true)}
        />

        {/* Login Modal (if requested or not logged in) */}
        {(showLoginModal || !user) && (
          <LoginModal lang={lang} onClose={() => setShowLoginModal(false)} />
        )}

        {/* First-Login Password Change & Privacy Policy Consent Flow (PDF Page 1 & 11) - STRICTLY CLIENT ONLY */}
        {user && user.role === 'CLIENT' && !firstLoginDismissed && user.first_login_done === false && (
          <FirstLoginModal
            lang={lang}
            onComplete={() => {
              setFirstLoginDismissed(true);
              localStorage.setItem('fintax_first_login_dismissed', 'true');
            }}
          />
        )}

        {/* PORTAL VIEW 1: CLIENT PORTAL */}
        {user && activePortal === 'CLIENT' && (
          <ClientPortal
            lang={lang}
            documents={documents}
            onUpload={async (file) => uploadFileToServer(file)}
            uploading={uploading}
            externalTab={clientNavTab}
            onTabChange={setClientNavTab}
            onLanguageChange={handleLangChange}
          />
        )}

        {/* PORTAL VIEW 2: ADMIN PORTAL */}
        {user && activePortal === 'ADMIN' && (
          <AdminPortal
            lang={lang}
            externalTab={adminNavTab}
            onTabChange={setAdminNavTab}
          />
        )}

        {/* PORTAL VIEW 3: STAFF / ACCOUNTANT REVIEW PORTAL */}
        {user && activePortal === 'STAFF' && (
          <main style={{ maxWidth: 1440, margin: '0 auto', width: '100%', padding: '24px 20px', flex: 1 }}>
            {/* Header Banner */}
            <div style={{
              background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #0f172a 100%)',
              padding: '1.5rem 2rem',
              borderRadius: '1rem',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              boxShadow: '0 10px 25px -5px rgba(29, 78, 216, 0.25)',
            }}>
              <div>
                <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
                  📑 {lang === 'de' ? 'Kanzlei & Prüfer Dashboard' : 'Staff Review & Accounting Console'}
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  {lang === 'de' ? 'Belegprüfung & Agenda SKR03 Übergabe' : 'Document Review & Agenda SKR03 Handoff'}
                </h1>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#e0e7ff' }}>
                  {lang === 'de' ? 'KI-Vorschläge prüfen, korrigieren und freigeben.' : 'Verify, correct, and approve AI-extracted invoices.'}
                </p>
              </div>

              <button
                onClick={handleExportAgenda}
                disabled={stats.approved === 0}
                style={{
                  background: stats.approved > 0 ? '#10b981' : '#cbd5e1',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.625rem',
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  cursor: stats.approved > 0 ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: stats.approved > 0 ? '0 8px 16px -2px rgba(16, 185, 129, 0.35)' : 'none',
                }}
              >
                <FileSpreadsheet size={18} />
                <span>{t.exportAgendaBtn} ({stats.approved})</span>
              </button>
            </div>

            {/* Sub Navigation: Invoices vs Bank Statements */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStaffTab('INVOICES')}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: staffTab === 'INVOICES' ? '#2563eb' : '#eff6ff',
                  color: staffTab === 'INVOICES' ? '#ffffff' : '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>📑</span>
                {lang === 'de' ? 'Belege & Rechnungen' : 'Invoices & Receipts'}
                <span style={{ background: staffTab === 'INVOICES' ? 'rgba(255,255,255,0.25)' : '#dbeafe', color: staffTab === 'INVOICES' ? '#ffffff' : '#1d4ed8', padding: '0.1rem 0.5rem', borderRadius: 9999, fontSize: '0.75rem' }}>
                  {documents.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStaffTab('BANK')}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: staffTab === 'BANK' ? '#2563eb' : '#eff6ff',
                  color: staffTab === 'BANK' ? '#ffffff' : '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>🏦</span>
                {lang === 'de' ? 'Kontoauszüge & Saldenabstimmung' : 'Bank Statements & Reconciliation'}
                <span style={{ background: staffTab === 'BANK' ? 'rgba(255,255,255,0.25)' : '#dbeafe', color: staffTab === 'BANK' ? '#ffffff' : '#1d4ed8', padding: '0.1rem 0.5rem', borderRadius: 9999, fontSize: '0.75rem' }}>
                  {bankStatements.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStaffTab('CORR')}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: staffTab === 'CORR' ? '#2563eb' : '#eff6ff',
                  color: staffTab === 'CORR' ? '#ffffff' : '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>📬</span>
                {t.corrTabLabel}
                <span style={{ background: staffTab === 'CORR' ? 'rgba(255,255,255,0.25)' : '#dbeafe', color: staffTab === 'CORR' ? '#ffffff' : '#1d4ed8', padding: '0.1rem 0.5rem', borderRadius: 9999, fontSize: '0.75rem' }}>
                  {corrLetters.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setStaffTab('PAYROLL'); fetchStaffPayroll(); }}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: staffTab === 'PAYROLL' ? '#2563eb' : '#eff6ff',
                  color: staffTab === 'PAYROLL' ? '#ffffff' : '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>👥</span>
                {t.payrollTabLabel}
                <span style={{ background: staffTab === 'PAYROLL' ? 'rgba(255,255,255,0.25)' : '#dbeafe', color: staffTab === 'PAYROLL' ? '#ffffff' : '#1d4ed8', padding: '0.1rem 0.5rem', borderRadius: 9999, fontSize: '0.75rem' }}>
                  {staffPayroll.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStaffTab('VAULT')}
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: staffTab === 'VAULT' ? '#2563eb' : '#eff6ff',
                  color: staffTab === 'VAULT' ? '#ffffff' : '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>🗂️</span>
                {lang === 'de' ? 'Mandanten-Ordner (00-03)' : 'Client Vault (00-03)'}
              </button>
            </div>

          {/* VIEW A: INVOICES & RECEIPTS */}
          {staffTab === 'INVOICES' && (
            <>
              {/* Statistics Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="glass-panel" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>{t.totalDocs}</span>
                    <FileText size={20} color="#3b82f6" />
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 8 }}>{stats.total}</div>
                </div>

            <div className="glass-panel" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>{t.pendingReview}</span>
                <Clock size={20} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 8, color: '#fbbf24' }}>{stats.needsReview}</div>
            </div>

            <div className="glass-panel" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>{t.approved}</span>
                <CheckCircle2 size={20} color="#10b981" />
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 8, color: '#34d399' }}>{stats.approved}</div>
            </div>

            <div className="glass-panel" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>{t.exported}</span>
                <Download size={20} color="#a855f7" />
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 8, color: '#c084fc' }}>{stats.exported}</div>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            className="glass-panel"
            style={{
              padding: 24,
              textAlign: 'center',
              marginBottom: 24,
              borderStyle: 'dashed',
              borderColor: uploading ? '#3b82f6' : 'var(--border-strong)',
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
            />
            {uploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div className="animate-spin" style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #3b82f6', borderTopColor: 'transparent' }} />
                <div>
                  <p style={{ fontWeight: 700, fontSize: '1rem', color: '#60a5fa' }}>{t.uploadAnalyzing}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.uploadAnalyzingSubtitle}</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <div style={{ background: 'rgba(59,130,246,0.15)', padding: 12, borderRadius: 50 }}>
                  <UploadCloud size={24} color="#3b82f6" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{t.uploadTitle}</h3>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{t.uploadSubtitle}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: '0.8125rem' }}
                >
                  {t.selectFileBtn}
                </button>
              </div>
            )}
          </div>

          {/* Filter Tabs & Refresh */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setActiveTab('ALL')}
                className={`btn ${activeTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
              >
                {t.tabAll} ({documents.length})
              </button>
              <button
                onClick={() => setActiveTab('NEEDS_ATTENTION')}
                className={`btn ${activeTab === 'NEEDS_ATTENTION' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
              >
                {t.tabAttention} ({documents.filter((d) => d.status === 'NEEDS_ATTENTION').length})
              </button>
              <button
                onClick={() => setActiveTab('APPROVED')}
                className={`btn ${activeTab === 'APPROVED' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
              >
                {t.tabApproved} ({stats.approved + stats.exported})
              </button>
            </div>

            <button onClick={fetchDocuments} className="btn btn-secondary" style={{ padding: '6px 12px' }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Document Queue Table */}
          <div className="glass-panel" style={{ overflow: 'hidden' }}>
            {filteredDocs.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Receipt size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                <p>{t.noDocs}</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{t.thDocument}</th>
                      <th style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{t.thSupplier}</th>
                      <th style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{t.thInvoiceNo}</th>
                      <th style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{t.thDate}</th>
                      <th style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{t.thGrossTotal}</th>
                      <th style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{t.thSkr03Account}</th>
                      <th style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{t.thStatus}</th>
                      <th style={{ padding: '14px 18px', color: 'var(--text-muted)', textAlign: 'right' }}>{t.thActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((doc) => {
                      const data = doc.extracted_data;
                      return (
                        <tr
                          key={doc.id}
                          style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <FileText size={18} color="#3b82f6" />
                              <div>
                                <div style={{ fontWeight: 600 }}>{doc.original_filename}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                  {(doc.size_bytes / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '14px 18px', fontWeight: 600 }}>
                            {data?.supplier_name || '—'}
                          </td>

                          <td style={{ padding: '14px 18px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                            {data?.invoice_number || '—'}
                          </td>

                          <td style={{ padding: '14px 18px' }}>
                            {data?.invoice_date || '—'}
                          </td>

                          <td style={{ padding: '14px 18px', fontWeight: 700, color: '#f9fafb' }}>
                            {data?.total_amount ? `${Number(data.total_amount).toFixed(2)} €` : '—'}
                          </td>

                          <td style={{ padding: '14px 18px' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem' }}>
                              {data?.skr03_account_code || '4930'}
                            </span>
                          </td>

                          <td style={{ padding: '14px 18px' }}>
                            {doc.status === 'READY_FOR_REVIEW' && <span className="badge badge-ready">{t.badgeReady}</span>}
                            {doc.status === 'NEEDS_ATTENTION' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span className="badge badge-attention">{t.badgeAttention}</span>
                                {(doc as any).is_duplicate && (
                                  <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '2px 6px', borderRadius: 4, fontSize: '0.6875rem', fontWeight: 700 }}>
                                    ⚠️ Doppelgänger
                                  </span>
                                )}
                              </div>
                            )}
                            {doc.status === 'APPROVED' && <span className="badge badge-approved">{t.badgeApproved}</span>}
                            {doc.status === 'EXPORTED' && <span className="badge badge-exported">{t.badgeExported}</span>}
                            {doc.status === 'PROCESSING' && <span className="badge badge-processing">{t.badgeProcessing}</span>}
                          </td>

                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                              <button
                                onClick={() => openReviewModal(doc)}
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                              >
                                <Eye size={14} />
                                <span>{t.btnReview}</span>
                              </button>
                              <button
                                onClick={() => handleDelete(doc.id)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 8px', color: '#ef4444' }}
                              >
                                <Trash2 size={14} />
                              </button>
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
            </>
          )}

          {/* VIEW B: BANK STATEMENTS & RECONCILIATION (PDF PAGE 8) */}
          {staffTab === 'BANK' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Explanatory Banner */}
              <div style={{
                background: 'rgba(6, 95, 70, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '1.25rem 1.5rem',
                borderRadius: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}>
                <div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0, color: '#34d399' }}>
                    🏦 {lang === 'de' ? 'Kontoauszug-Abstimmung (Laufender Saldenabgleich)' : 'Bank Statement Tracking & Running Balance Verification'}
                  </h2>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#cbd5e1' }}>
                    {lang === 'de'
                      ? 'Rechnet automatisch: Anfangssaldo - Soll (Ausgaben) + Haben (Einnahmen) = Endsaldo. Erkennt fehlende Monate und Abweichungen.'
                      : 'Automatically verifies: Opening Balance - Debits + Credits = Closing Balance. Detects missing statement months and mismatches.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSeedDemoStatement}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.625rem 1.25rem',
                    borderRadius: '0.5rem',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  ⚡ {lang === 'de' ? 'Demo Deutsche Bank (PDF S. 8) laden' : 'Load Demo Deutsche Bank (PDF Page 8)'}
                </button>
              </div>

              {/* Bank Statements Table */}
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                {bankStatements.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏦</div>
                    <p style={{ fontSize: '1rem', fontWeight: 600 }}>
                      {lang === 'de' ? 'Noch keine Kontoauszüge vorhanden' : 'No bank statements loaded yet'}
                    </p>
                    <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      {lang === 'de' ? 'Klicken Sie oben auf "Demo Deutsche Bank laden" um den Abgleich nach PDF Seite 8 sofort zu testen.' : 'Click "Load Demo Deutsche Bank" above to test running balance reconciliation.'}
                    </p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Konto / IBAN' : 'Account / IBAN'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Zeitraum' : 'Period'}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'right' }}>{lang === 'de' ? 'Anfangssaldo' : 'Opening'}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'right' }}>{lang === 'de' ? 'Endsaldo' : 'Closing'}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'center' }}>{lang === 'de' ? 'Buchungen' : 'Transactions'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Status' : 'Status'}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'right' }}>{lang === 'de' ? 'Aktion' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bankStatements.map((s) => (
                          <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '14px 18px', fontWeight: 700, color: '#f8fafc' }}>
                              🏦 {s.account_number}
                            </td>
                            <td style={{ padding: '14px 18px', color: '#cbd5e1' }}>
                              {s.statement_period}
                            </td>
                            <td style={{ padding: '14px 18px', textAlign: 'right', color: '#f8fafc', fontWeight: 600 }}>
                              {Number(s.opening_balance).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 18px', textAlign: 'right', color: '#38bdf8', fontWeight: 800 }}>
                              {Number(s.closing_balance).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                              <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 700 }}>
                                {(s as any).transaction_count || (s.transactions ? s.transactions.length : 3)} Zeilen
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: 9999,
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#4ade80',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                              }}>
                                ✓ RECONCILED
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => openStatementDetails(s.id)}
                                className="btn btn-primary"
                                style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
                              >
                                🔍 {lang === 'de' ? 'Abstimmung prüfen' : 'View Reconciliation'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW C: CORRESPONDENCE & TAX OFFICE LETTERS (PDF PAGE 10) */}
          {staffTab === 'CORR' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Explanatory Banner */}
              <div style={{
                background: 'rgba(124, 45, 18, 0.15)',
                border: '1px solid rgba(251, 146, 60, 0.3)',
                padding: '1.25rem 1.5rem',
                borderRadius: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}>
                <div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0, color: '#fb923c' }}>
                    📬 {t.corrBannerTitle}
                  </h2>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#cbd5e1' }}>
                    {t.corrBannerDesc}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Upload Tax Office Letter */}
                  <input
                    type="file"
                    ref={corrFileRef}
                    onChange={handleCorrUpload}
                    accept=".pdf,.png,.jpg,.jpeg"
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => corrFileRef.current?.click()}
                    disabled={corrUploading}
                    style={{
                      background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.625rem 1.25rem',
                      borderRadius: '0.5rem',
                      fontWeight: 700,
                      fontSize: '0.8125rem',
                      cursor: corrUploading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)',
                    }}
                  >
                    <UploadCloud size={16} />
                    {corrUploading ? (lang === 'de' ? 'KI analysiert...' : 'AI analyzing...') : t.corrUploadBtn}
                  </button>

                  {/* Seed Demo */}
                  <button
                    type="button"
                    onClick={handleSeedDemoLetter}
                    style={{
                      background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.625rem 1.25rem',
                      borderRadius: '0.5rem',
                      fontWeight: 700,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)',
                    }}
                  >
                    ⚡ {t.corrSeedDemoBtn}
                  </button>
                </div>
              </div>

              {/* Correspondence Letters Table */}
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                {corrLetters.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📬</div>
                    <p style={{ fontSize: '1rem', fontWeight: 600 }}>
                      {t.corrEmptyTitle}
                    </p>
                    <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      {t.corrEmptyDesc}
                    </p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '14px 18px' }}>{t.corrThSender}</th>
                          <th style={{ padding: '14px 18px' }}>{t.corrThLetterType}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'center' }}>{t.corrThDeadline}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'center' }}>{t.corrThUrgency}</th>
                          <th style={{ padding: '14px 18px' }}>{t.corrThSummary}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'right' }}>{t.corrThTask}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {corrLetters.map((letter) => {
                          const dlInfo = getDeadlineInfo(letter.deadline);
                          const urgencyColors: Record<string, {bg: string; color: string}> = {
                            HIGH:   { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171' },
                            MEDIUM: { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' },
                            LOW:    { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' },
                          };
                          const uc = urgencyColors[letter.urgency] || urgencyColors.MEDIUM;
                          const urgencyLabel = letter.urgency === 'HIGH' ? t.corrUrgencyHigh : letter.urgency === 'LOW' ? t.corrUrgencyLow : t.corrUrgencyMedium;

                          return (
                            <tr
                              key={letter.id}
                              style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s', cursor: 'pointer' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              onClick={() => setSelectedCorr(letter)}
                            >
                              {/* Sender / Authority */}
                              <td style={{ padding: '14px 18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{
                                    background: 'rgba(251, 146, 60, 0.15)',
                                    padding: 8,
                                    borderRadius: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}>
                                    <Mail size={18} color="#fb923c" />
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 700, color: '#f8fafc' }}>{letter.sender}</div>
                                    {letter.original_filename && (
                                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{letter.original_filename}</div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Letter Type */}
                              <td style={{ padding: '14px 18px' }}>
                                <span style={{
                                  background: 'rgba(148, 163, 184, 0.1)',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  color: '#e2e8f0',
                                  border: '1px solid rgba(148, 163, 184, 0.15)',
                                }}>
                                  {letter.letter_type}
                                </span>
                              </td>

                              {/* Deadline Countdown */}
                              <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                  <span style={{
                                    padding: '4px 12px',
                                    borderRadius: 9999,
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    background: `${dlInfo.color}18`,
                                    color: dlInfo.color,
                                    border: `1px solid ${dlInfo.color}40`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}>
                                    <CalendarClock size={12} />
                                    {dlInfo.label}
                                  </span>
                                  {letter.deadline && (
                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                      {new Date(letter.deadline).toLocaleDateString('de-DE')}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Urgency */}
                              <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: 9999,
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  background: uc.bg,
                                  color: uc.color,
                                  border: `1px solid ${uc.color}30`,
                                }}>
                                  {letter.urgency === 'HIGH' && '🔴 '}
                                  {letter.urgency === 'MEDIUM' && '🟡 '}
                                  {letter.urgency === 'LOW' && '🟢 '}
                                  {urgencyLabel}
                                </span>
                              </td>

                              {/* AI Summary */}
                              <td style={{ padding: '14px 18px', maxWidth: 300 }}>
                                <p style={{
                                  fontSize: '0.8rem',
                                  color: '#cbd5e1',
                                  margin: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  lineHeight: '1.4',
                                }}>
                                  {letter.ai_summary}
                                </p>
                              </td>

                              {/* Task Action */}
                              <td style={{ padding: '14px 18px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                {letter.task_id ? (
                                  <span style={{
                                    padding: '6px 14px',
                                    borderRadius: 8,
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    background: 'rgba(34, 197, 94, 0.15)',
                                    color: '#4ade80',
                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}>
                                    <CheckCircle2 size={14} />
                                    {t.corrTaskCreated}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleCreateTaskFromLetter(letter.id)}
                                    style={{
                                      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                      color: '#ffffff',
                                      border: 'none',
                                      padding: '6px 14px',
                                      borderRadius: 8,
                                      fontWeight: 700,
                                      fontSize: '0.8rem',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                                      transition: 'transform 0.15s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                  >
                                    <Plus size={14} />
                                    {t.corrCreateTask}
                                    <ArrowRight size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW D: PAYROLL & LOHNABRECHNUNG (PDF PAGE 9) */}
          {staffTab === 'PAYROLL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Explanatory Banner */}
              <div style={{
                background: 'rgba(15, 118, 110, 0.15)',
                border: '1px solid rgba(20, 184, 166, 0.3)',
                padding: '1.25rem 1.5rem',
                borderRadius: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}>
                <div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0, color: '#2dd4bf' }}>
                    👥 {t.payrollBannerTitle}
                  </h2>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#cbd5e1' }}>
                    {t.payrollBannerDesc}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleSeedStaffPayroll}
                    style={{
                      background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.625rem 1.25rem',
                      borderRadius: '0.5rem',
                      fontWeight: 700,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
                    }}
                  >
                    ⚡ {t.payrollSeedDemoBtn}
                  </button>
                </div>
              </div>

              {/* Employer Submissions Review Table */}
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                    📋 {t.payrollSubmissionsTitle}
                  </h3>
                </div>

                {staffPayroll.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                    {lang === 'de' ? 'Noch keine Lohnmeldungen vorhanden. Klicken Sie oben auf „Demo-Lohndaten laden".' : 'No payroll submissions yet. Click "Load Demo Payroll Data" above.'}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Mitarbeiter' : 'Employee'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Typ' : 'Type'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Abrechnungsmonat' : 'Period'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Meldungsdaten' : 'Submitted Details'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Status' : 'Status'}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'right' }}>{lang === 'de' ? 'Aktion' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffPayroll.map((sub: any) => {
                          const data = typeof sub.data_json === 'string' ? JSON.parse(sub.data_json) : sub.data_json;
                          return (
                            <tr key={sub.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '14px 18px', fontWeight: 700, color: '#f8fafc' }}>
                                👤 {sub.employee_name}
                              </td>
                              <td style={{ padding: '14px 18px' }}>
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: 9999,
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background: sub.submission_type === 'NEW_HIRE' ? 'rgba(59, 130, 246, 0.2)' : (sub.submission_type === 'SICK_NOTE' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)'),
                                  color: sub.submission_type === 'NEW_HIRE' ? '#60a5fa' : (sub.submission_type === 'SICK_NOTE' ? '#f87171' : '#facc15'),
                                }}>
                                  {sub.submission_type}
                                </span>
                              </td>
                              <td style={{ padding: '14px 18px', color: '#cbd5e1', fontWeight: 600 }}>
                                {sub.period}
                              </td>
                              <td style={{ padding: '14px 18px', fontSize: '0.8125rem', color: '#cbd5e1' }}>
                                {sub.submission_type === 'NEW_HIRE' && (
                                  <span>{data.job_title} • Brutto: {data.gross_salary} € • StKl: {data.tax_class} ({data.health_insurance})</span>
                                )}
                                {sub.submission_type === 'HOURS_OVERTIME' && (
                                  <span>{data.regular_hours} Std. + {data.overtime_hours} Überstunden {data.bonus ? `(+${data.bonus} € Bonus)` : ''}</span>
                                )}
                                {sub.submission_type === 'SICK_NOTE' && (
                                  <span>Krank von {data.sick_from} bis {data.sick_to} (eAU bestätigt)</span>
                                )}
                              </td>
                              <td style={{ padding: '14px 18px' }}>
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: 9999,
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background: sub.status === 'PROCESSED' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                  color: sub.status === 'PROCESSED' ? '#4ade80' : '#facc15',
                                  border: `1px solid ${sub.status === 'PROCESSED' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
                                }}>
                                  {sub.status === 'PROCESSED' ? '✓ ' + t.payrollStatusProcessed : '⏳ ' + t.payrollStatusSubmitted}
                                </span>
                              </td>
                              <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                                {sub.status !== 'PROCESSED' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleApprovePayroll(sub.id)}
                                    disabled={approvingPayrollId === sub.id}
                                    style={{
                                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                      color: '#ffffff',
                                      border: 'none',
                                      padding: '6px 14px',
                                      borderRadius: '0.5rem',
                                      fontWeight: 700,
                                      fontSize: '0.8125rem',
                                      cursor: 'pointer',
                                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                                    }}
                                  >
                                    {approvingPayrollId === sub.id ? 'Abrechnung läuft...' : `✓ ${t.payrollApproveBtn}`}
                                  </button>
                                ) : (
                                  <span style={{ color: '#4ade80', fontSize: '0.8125rem', fontWeight: 600 }}>
                                    ✓ Abgerechnet
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Published Payslips Archive */}
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                    📑 {t.payrollPayslipsTitle}
                  </h3>
                </div>

                {staffPayslips.length === 0 ? (
                  <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                    {lang === 'de' ? 'Noch keine abgerechneten Lohnabrechnungen erfasst.' : 'No issued payslips found.'}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Mitarbeiter' : 'Employee'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Monat' : 'Period'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Bruttogehalt' : 'Gross Salary'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Lohnsteuer' : 'Income Tax'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Sozialvers.' : 'Social Sec.'}</th>
                          <th style={{ padding: '14px 18px' }}>{lang === 'de' ? 'Netto-Auszahlung' : 'Net Payout'}</th>
                          <th style={{ padding: '14px 18px', textAlign: 'right' }}>{lang === 'de' ? 'Freigabe' : 'Visibility'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffPayslips.map((slip: any) => (
                          <tr key={slip.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '14px 18px', fontWeight: 700, color: '#f8fafc' }}>
                              👤 {slip.employee_name}
                            </td>
                            <td style={{ padding: '14px 18px', color: '#cbd5e1' }}>
                              {slip.period}
                            </td>
                            <td style={{ padding: '14px 18px', fontWeight: 700, color: '#f8fafc' }}>
                              {Number(slip.gross_salary).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 18px', color: '#f87171' }}>
                              -{Number(slip.tax_deduction).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 18px', color: '#f87171' }}>
                              -{Number(slip.social_security).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 18px', fontWeight: 800, color: '#4ade80', fontSize: '1rem' }}>
                              {Number(slip.net_salary).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: 9999,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#4ade80',
                              }}>
                                ✓ Mandant sichtbar
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW E: 4-FOLDER CLIENT VAULT (PDF REQUIREMENT) */}
          {staffTab === 'VAULT' && (
            <div style={{ marginTop: '1.5rem' }}>
              <FileExplorer lang={lang} clientId="KD-10042" darkTheme={true} />
            </div>
          )}
        </main>
      )}

      {/* Split-Screen Review Modal (Human-in-the-Loop) */}
      {selectedDoc && reviewForm && (
        <div className="modal-overlay">
          <div
            className="glass-panel animate-fade-in"
            style={{
              width: '95vw',
              maxWidth: 1500,
              height: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: '#0d1322',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ShieldCheck size={22} color="#3b82f6" />
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                    {t.modalTitle}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                    {t.modalSubtitle
                      .replace('{filename}', selectedDoc.original_filename)
                      .replace('{status}', selectedDoc.status)}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await openAuthenticatedFileInNewTab(`${API_BASE}/documents/${selectedDoc.id}/file`);
                    } catch (err: any) {
                      error(err?.message || 'Dokument konnte nicht geöffnet werden.');
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  <ExternalLink size={14} />
                  {t.openOriginalNewTab}
                </button>
                <button
                  onClick={() => setSelectedDoc(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Modal Body: Split Screen */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left Pane: Original Document Preview */}
              <div
                style={{
                  flex: 1.2,
                  borderRight: '1px solid var(--border-subtle)',
                  background: '#050811',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'auto',
                  padding: 16,
                }}
              >
                {!selectedDocBlobUrl ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                    {lang === 'de' ? 'Vorschau wird geladen…' : 'Loading preview…'}
                  </div>
                ) : selectedDoc.mime_type === 'application/pdf' ? (
                  <iframe
                    src={selectedDocBlobUrl}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
                    title="PDF Viewer"
                  />
                ) : (
                  <img
                    src={selectedDocBlobUrl}
                    alt="Original Receipt"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: 8,
                      boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                    }}
                  />
                )}
              </div>

              {/* Right Pane: AI-Extracted Editable Form */}
              <div
                style={{
                  flex: 1,
                  padding: '24px 28px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                {/* Validation Banner */}
                {(() => {
                  const calculated = (Number(reviewForm.net_amount) || 0) + (Number(reviewForm.vat_amount) || 0);
                  const isMathValid = Math.abs(calculated - (Number(reviewForm.total_amount) || 0)) < 0.05;
                  return (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        background: isMathValid ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${isMathValid ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      {isMathValid ? (
                        <>
                          <CheckCircle2 size={18} color="#10b981" />
                          <span style={{ fontSize: '0.8125rem', color: '#34d399', fontWeight: 600 }}>
                            {t.mathPassed}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={18} color="#ef4444" />
                          <span style={{ fontSize: '0.8125rem', color: '#f87171', fontWeight: 600 }}>
                            {t.mathFailed
                              .replace('{calc}', calculated.toFixed(2))
                              .replace('{total}', Number(reviewForm.total_amount).toFixed(2))
                              .replace('{diff}', Math.abs(calculated - Number(reviewForm.total_amount)).toFixed(2))}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Form Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">{t.fieldSupplier}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={reviewForm.supplier_name}
                      onChange={(e) => setReviewForm({ ...reviewForm, supplier_name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">{t.fieldInvoiceNo}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={reviewForm.invoice_number}
                      onChange={(e) => setReviewForm({ ...reviewForm, invoice_number: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">{t.fieldDate}</label>
                    <input
                      type="date"
                      className="form-input"
                      value={reviewForm.invoice_date}
                      onChange={(e) => setReviewForm({ ...reviewForm, invoice_date: e.target.value })}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">{t.fieldSkr03Account}</label>
                    <select
                      className="form-input"
                      value={reviewForm.skr03_account_code}
                      onChange={(e) => setReviewForm({ ...reviewForm, skr03_account_code: e.target.value })}
                    >
                      <option value="4930">{t.acc4930}</option>
                      <option value="4980">{t.acc4980}</option>
                      <option value="4964">{t.acc4964}</option>
                      <option value="4660">{t.acc4660}</option>
                      <option value="4910">{t.acc4910}</option>
                      <option value="4900">{t.acc4900}</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label">{t.fieldVatRate}</label>
                    <select
                      className="form-input"
                      value={reviewForm.vat_rate_percent}
                      onChange={(e) => {
                        const rate = parseFloat(e.target.value) || 0;
                        const net = reviewForm.net_amount || 0;
                        const vat = Math.round(net * (rate / 100) * 100) / 100;
                        setReviewForm({
                          ...reviewForm,
                          vat_rate_percent: rate,
                          vat_amount: vat,
                          total_amount: Math.round((net + vat) * 100) / 100,
                        });
                      }}
                    >
                      <option value="19">{t.vat19}</option>
                      <option value="7">{t.vat7}</option>
                      <option value="0">{t.vat0}</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label">{t.fieldNetAmount}</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={reviewForm.net_amount}
                      onChange={(e) => {
                        const net = parseFloat(e.target.value) || 0;
                        const vat = Math.round(net * ((reviewForm.vat_rate_percent || 0) / 100) * 100) / 100;
                        setReviewForm({
                          ...reviewForm,
                          net_amount: net,
                          vat_amount: vat,
                          total_amount: Math.round((net + vat) * 100) / 100,
                        });
                      }}
                    />
                  </div>

                  <div>
                    <label className="form-label">{t.fieldVatAmount}</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={reviewForm.vat_amount}
                      onChange={(e) => {
                        const vat = parseFloat(e.target.value) || 0;
                        setReviewForm({
                          ...reviewForm,
                          vat_amount: vat,
                          total_amount: Math.round(((reviewForm.net_amount || 0) + vat) * 100) / 100,
                        });
                      }}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ color: '#60a5fa' }}>{t.fieldGrossTotal}</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      style={{ fontWeight: 800, borderColor: '#3b82f6', fontSize: '1rem' }}
                      value={reviewForm.total_amount}
                      onChange={(e) => setReviewForm({ ...reviewForm, total_amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                {/* Modal Action Buttons */}
                <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleReviewSave(false)}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '12px' }}
                  >
                    {t.btnSaveDraft}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewSave(true)}
                    className="btn btn-primary"
                    style={{ flex: 1.2, padding: '12px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                  >
                    <CheckCircle2 size={18} />
                    <span>{t.btnApprove}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bank Statement Reconciliation Modal (PDF Page 8) */}
      {selectedStatement && (
        <BankReconciliationModal
          lang={lang}
          statement={selectedStatement}
          onClose={() => setSelectedStatement(null)}
        />
      )}

      {/* Correspondence Detail Modal (PDF Page 10) */}
      {selectedCorr && (
        <div className="modal-overlay">
          <div
            className="glass-panel animate-fade-in"
            style={{
              width: '95vw',
              maxWidth: 700,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: '#0d1322',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'linear-gradient(135deg, rgba(124, 45, 18, 0.2) 0%, rgba(13, 19, 34, 0.9) 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  background: 'rgba(251, 146, 60, 0.2)',
                  padding: 10,
                  borderRadius: 10,
                }}>
                  <Mail size={22} color="#fb923c" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                    {t.corrDetailTitle}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                    {selectedCorr.sender}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCorr(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              {/* Deadline Banner */}
              {(() => {
                const dlInfo = getDeadlineInfo(selectedCorr.deadline);
                return (
                  <div style={{
                    padding: '14px 20px',
                    borderRadius: 10,
                    background: `${dlInfo.color}12`,
                    border: `1px solid ${dlInfo.color}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CalendarClock size={20} color={dlInfo.color} />
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: dlInfo.color }}>{dlInfo.label}</div>
                        {selectedCorr.deadline && (
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {new Date(selectedCorr.deadline).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </div>
                        )}
                      </div>
                    </div>
                    {!selectedCorr.task_id && (
                      <button
                        type="button"
                        onClick={() => {
                          handleCreateTaskFromLetter(selectedCorr.id);
                          setSelectedCorr(null);
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: '0.8125rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Plus size={14} /> {t.corrCreateTask}
                      </button>
                    )}
                    {selectedCorr.task_id && (
                      <span style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                        background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <CheckCircle2 size={14} /> {t.corrTaskCreated}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Detail Fields Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <DetailField label={t.corrDetailSender} value={selectedCorr.sender} icon={<Mail size={14} color="#fb923c" />} />
                <DetailField label={t.corrDetailType} value={selectedCorr.letter_type} icon={<FileText size={14} color="#60a5fa" />} />
                <DetailField label={t.corrDetailTaxNo} value={selectedCorr.tax_number || '—'} icon={<Info size={14} color="#94a3b8" />} />
                <DetailField label={t.corrDetailLetterDate} value={selectedCorr.letter_date || '—'} icon={<Clock size={14} color="#94a3b8" />} />
              </div>

              {/* AI Summary */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  {t.corrDetailSummary}
                </label>
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: '0.875rem',
                  lineHeight: '1.6',
                  color: '#e2e8f0',
                }}>
                  {selectedCorr.ai_summary}
                </div>
              </div>

              {/* Recommended Action */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  {t.corrDetailAction}
                </label>
                <div style={{
                  background: 'rgba(59, 130, 246, 0.06)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: '0.875rem',
                  lineHeight: '1.6',
                  color: '#93c5fd',
                }}>
                  {selectedCorr.action_proposed}
                </div>
              </div>

              {/* Source Document */}
              {selectedCorr.original_filename && (
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <FileText size={16} color="#64748b" />
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{t.corrDetailFile}</div>
                    <div style={{ fontSize: '0.8125rem', color: '#cbd5e1', fontWeight: 600 }}>{selectedCorr.original_filename}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// Helper component for correspondence detail fields
function DetailField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: '0.875rem', color: '#e2e8f0', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SnackbarProvider>
        <MainAppContent />
      </SnackbarProvider>
    </AuthProvider>
  );
}
