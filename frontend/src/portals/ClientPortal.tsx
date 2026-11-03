import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';
import type { Language } from '../translations';
import { translations } from '../translations';
import { FileExplorer } from '../components/FileExplorer';
import { maskIban, maskTaxId } from '../utils/maskingUtils';

const API_BASE = 'http://127.0.0.1:5000/api';

interface DocumentRecord {
  id: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  status: string;
  extracted_data?: {
    supplier_name: string;
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
  };
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
  staff_notes?: string;
}

interface PayslipRecord {
  id: string;
  submission_id?: string;
  client_id: string;
  employee_name: string;
  period: string;
  gross_salary: number;
  net_salary: number;
  tax_deduction: number;
  social_security: number;
  tax_class: string;
  visible_to_client: boolean;
  created_at: string;
}

interface ClientPortalProps {
  lang: Language;
  documents: DocumentRecord[];
  onUpload: (file: File, folder: string) => Promise<void>;
  uploading: boolean;
  externalTab?: 'DOCS' | 'PAYROLL' | 'VAULT';
  onTabChange?: (tab: 'DOCS' | 'PAYROLL' | 'VAULT') => void;
}

export const ClientPortal: React.FC<ClientPortalProps> = ({
  lang,
  documents,
  onUpload,
  uploading,
  externalTab,
  onTabChange,
}) => {
  const { user } = useAuth();
  const { success, info } = useSnackbar();
  const t = translations[lang];

  // Navigation tab inside Client Portal: Documents & Tasks vs. Payroll & Payslips vs. 4-Folder Vault
  const [internalSubTab, setInternalSubTab] = useState<'DOCS' | 'PAYROLL' | 'VAULT'>('DOCS');
  const clientSubTab = externalTab || internalSubTab;
  const setClientSubTab = (t: 'DOCS' | 'PAYROLL' | 'VAULT') => {
    setInternalSubTab(t);
    if (onTabChange) onTabChange(t);
  };
  const [maskSensitive, setMaskSensitive] = useState<boolean>(true);
  const [selectedFolder, setSelectedFolder] = useState('October 2026 Invoices');
  const [tasks, setTasks] = useState([
    { id: 1, title: lang === 'de' ? 'Eingangsrechnungen Oktober bis 10. Nov einreichen' : 'Upload all October invoices before Nov 10th', due: '10.11.2026', done: true },
    { id: 2, title: lang === 'de' ? 'Kontoauszug Deutsche Bank (Oktober) hochladen' : 'Upload Deutsche Bank statement (October)', due: '12.11.2026', done: false },
    { id: 3, title: lang === 'de' ? 'Lohndaten & Überstunden für Oktober freigeben' : 'Confirm payroll & overtime hours for October', due: '25.10.2026', done: true },
    { id: 4, title: lang === 'de' ? 'Fehlende Bewirtungsbelege ergänzen' : 'Add missing hospitality receipts', due: '15.11.2026', done: false },
  ]);

  // Payroll Data
  const [submissions, setSubmissions] = useState<PayrollSubmission[]>([]);
  const [payslips, setPayslips] = useState<PayslipRecord[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [modalType, setModalType] = useState<'NEW_HIRE' | 'HOURS_OVERTIME' | 'SICK_NOTE'>('NEW_HIRE');

  // New hire form state
  const [employeeName, setEmployeeName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [salary, setSalary] = useState('4200');
  const [taxClass, setTaxClass] = useState('I');
  const [startDate, setStartDate] = useState('2026-11-01');
  const [healthInsurance, setHealthInsurance] = useState('Techniker Krankenkasse (TK)');

  // Overtime / Variable form state
  const [hours, setHours] = useState('168');
  const [overtimeHours, setOvertimeHours] = useState('10');
  const [bonus, setBonus] = useState('0');

  // Sick note form state
  const [sickFrom, setSickFrom] = useState('2026-10-20');
  const [sickTo, setSickTo] = useState('2026-10-23');

  const fetchPayroll = async () => {
    setPayrollLoading(true);
    try {
      const [subRes, slipRes] = await Promise.all([
        fetch(`${API_BASE}/payroll/submissions?client_id=user_client_1`),
        fetch(`${API_BASE}/payroll/payslips?client_id=user_client_1`),
      ]);
      if (subRes.ok) {
        const subData = await subRes.json();
        setSubmissions(subData);
      }
      if (slipRes.ok) {
        const slipData = await slipRes.json();
        setPayslips(slipData);
      }
    } catch (err) {
      console.error('Error fetching payroll:', err);
    } finally {
      setPayrollLoading(false);
    }
  };

  useEffect(() => {
    if (clientSubTab === 'PAYROLL') {
      fetchPayroll();
    }
  }, [clientSubTab]);

  const handleSeedPayroll = async () => {
    try {
      const res = await fetch(`${API_BASE}/payroll/seed-demo`, { method: 'POST' });
      if (res.ok) {
        await fetchPayroll();
      }
    } catch (err) {
      console.error('Error seeding payroll:', err);
    }
  };

  const handleSubmitPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    let payloadData: any = {};
    if (modalType === 'NEW_HIRE') {
      payloadData = {
        job_title: jobTitle,
        start_date: startDate,
        gross_salary: parseFloat(salary),
        tax_class: taxClass,
        health_insurance: healthInsurance,
      };
    } else if (modalType === 'HOURS_OVERTIME') {
      payloadData = {
        regular_hours: parseFloat(hours),
        overtime_hours: parseFloat(overtimeHours),
        bonus: parseFloat(bonus),
        gross_salary: parseFloat(salary) + (parseFloat(overtimeHours) * 30),
      };
    } else if (modalType === 'SICK_NOTE') {
      payloadData = {
        sick_from: sickFrom,
        sick_to: sickTo,
        continued_pay: true,
        notes: 'Arbeitsunfähigkeitsbescheinigung (eAU) eingereicht',
      };
    }

    try {
      const res = await fetch(`${API_BASE}/payroll/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'user_client_1',
          employee_name: employeeName,
          submission_type: modalType,
          period: '2026-10',
          data: payloadData,
        }),
      });
      if (res.ok) {
        setShowSubmitModal(false);
        setEmployeeName('');
        success(lang === 'de' ? 'Lohnmeldung erfolgreich an Kanzlei eingereicht!' : 'Payroll submitted successfully!', 'Lohnbuchhaltung');
        await fetchPayroll();
      }
    } catch (err) {
      console.error('Failed to submit payroll:', err);
    }
  };

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t => {
      if (t.id === id) {
        const nextState = !t.done;
        info(nextState ? (lang === 'de' ? 'Aufgabe als erledigt markiert.' : 'Task marked as done.') : (lang === 'de' ? 'Aufgabe wiedereröffnet.' : 'Task reopened.'));
        return { ...t, done: nextState };
      }
      return t;
    }));
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0], selectedFolder);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0], selectedFolder);
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Client Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #0f172a 100%)',
        color: '#ffffff',
        padding: '2rem',
        borderRadius: '1.25rem',
        boxShadow: '0 10px 25px -5px rgba(29, 78, 216, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.2)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            🏢 {lang === 'de' ? 'Mandanten-Portal' : 'Client Document Hub'}
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
            {user?.name || 'Hans Mustermann GmbH'}
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9375rem' }}>
            {lang === 'de'
              ? 'Laden Sie Ihre monatlichen Rechnungen, Quittungen und Lohnmeldungen sicher hoch.'
              : 'Securely upload invoices, receipts, and submit monthly payroll data.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '0.75rem 1rem', borderRadius: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{documents.length}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>{lang === 'de' ? 'Belege gesamt' : 'Total Docs'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '0.75rem 1rem', borderRadius: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{tasks.filter(t => !t.done).length}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>{lang === 'de' ? 'Offene Aufgaben' : 'Pending Tasks'}</div>
            </div>
          </div>

          {/* GDPR Sensitive Data Card */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(4px)',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          }}>
            <div>
              <span style={{ opacity: 0.75 }}>IBAN: </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {maskSensitive ? maskIban('DE89370400440532013000') : 'DE89 3704 0044 0532 0130 00'}
              </span>
              <span style={{ opacity: 0.75, marginLeft: '0.5rem' }}>• USt-ID: </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {maskSensitive ? maskTaxId('DE301948201') : 'DE301948201'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMaskSensitive(!maskSensitive)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#ffffff',
                padding: '0.2rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.6875rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {maskSensitive ? (lang === 'de' ? '👁️ Anzeigen' : '👁️ Show') : (lang === 'de' ? '🔒 Maskieren' : '🔒 Mask')}
            </button>
          </div>
        </div>
      </div>

      {/* Sub Navigation within Client Portal */}
      <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setClientSubTab('DOCS')}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            border: 'none',
            cursor: 'pointer',
            background: clientSubTab === 'DOCS' ? '#2563eb' : '#eff6ff',
            color: clientSubTab === 'DOCS' ? '#ffffff' : '#1d4ed8',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>📁</span>
          {lang === 'de' ? 'Belege & Kanzlei-Aufgaben' : 'Documents & Tasks'}
        </button>

        <button
          type="button"
          onClick={() => setClientSubTab('PAYROLL')}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            border: 'none',
            cursor: 'pointer',
            background: clientSubTab === 'PAYROLL' ? '#2563eb' : '#eff6ff',
            color: clientSubTab === 'PAYROLL' ? '#ffffff' : '#1d4ed8',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>👥</span>
          {lang === 'de' ? 'Lohn & Gehalt' : 'Payroll & Payslips'}
          <span style={{
            background: clientSubTab === 'PAYROLL' ? 'rgba(255,255,255,0.25)' : '#dbeafe',
            color: clientSubTab === 'PAYROLL' ? '#ffffff' : '#1d4ed8',
            padding: '0.1rem 0.5rem',
            borderRadius: 9999,
            fontSize: '0.75rem',
          }}>
            {submissions.length + payslips.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setClientSubTab('VAULT')}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            border: 'none',
            cursor: 'pointer',
            background: clientSubTab === 'VAULT' ? '#2563eb' : '#eff6ff',
            color: clientSubTab === 'VAULT' ? '#ffffff' : '#1d4ed8',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>🗂️</span>
          {lang === 'de' ? 'Kanzlei-Ordner (00-03)' : 'Folder Vault (00-03)'}
        </button>
      </div>

      {/* VIEW 1: DOCUMENTS & TASKS */}
      {clientSubTab === 'DOCS' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
            {/* Upload Zone with Folder Selector */}
            <div style={{
              background: '#ffffff',
              borderRadius: '1rem',
              padding: '1.5rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
                📤 {lang === 'de' ? 'Neues Dokument hochladen' : 'Upload New Document'}
              </h2>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                  📁 {lang === 'de' ? 'Zielordner / Monat wählen' : 'Target Folder / Month'}
                </label>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    color: '#0f172a',
                    background: '#f8fafc',
                  }}
                >
                  <option value="October 2026 Invoices">October 2026 Invoices / Eingangsrechnungen</option>
                  <option value="November 2026 Invoices">November 2026 Invoices / Eingangsrechnungen</option>
                  <option value="Cash Receipts & Expenses">Cash Receipts / Kassenbelege</option>
                  <option value="Bank Statements">Bank Statements / Kontoauszüge</option>
                  <option value="Finanzamt Letters">Tax Office Letters / Finanzamt Post</option>
                </select>
              </div>

              {/* Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                style={{
                  border: '2px dashed #0284c7',
                  borderRadius: '0.75rem',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  background: '#f0f9ff',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {uploading ? (
                  <div>
                    <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⚙️</div>
                    <div style={{ fontWeight: 700, color: '#0284c7', marginTop: '0.5rem' }}>
                      {lang === 'de' ? 'AI liest und prüft Belegdaten...' : 'AI is reading & extracting data...'}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📄</div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>
                      {lang === 'de' ? 'Datei hier hineinziehen' : 'Drag & drop file here'}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.25rem' }}>
                      PDF, JPG, PNG (max. 25 MB)
                    </div>
                    <label
                      style={{
                        display: 'inline-block',
                        marginTop: '1rem',
                        background: '#0284c7',
                        color: '#ffffff',
                        padding: '0.5rem 1.25rem',
                        borderRadius: '0.5rem',
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                      }}
                    >
                      {lang === 'de' ? 'Datei auswählen' : 'Browse File'}
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        style={{ display: 'none' }}
                        onChange={handleFileInput}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Client Tasks & Requests (Checklist) */}
            <div style={{
              background: '#ffffff',
              borderRadius: '1rem',
              padding: '1.5rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  📋 {lang === 'de' ? 'Monatliche Aufgaben der Kanzlei' : 'Monthly Staff Requests'}
                </h2>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0284c7', background: '#e0f2fe', padding: '0.2rem 0.5rem', borderRadius: '9999px' }}>
                  Fällig / Due
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '0.5rem',
                      background: task.done ? '#f8fafc' : '#ffffff',
                      border: task.done ? '1px solid #e2e8f0' : '1px solid #cbd5e1',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={task.done}
                      readOnly
                      style={{ width: '18px', height: '18px', accentColor: '#0284c7' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: task.done ? '#94a3b8' : '#0f172a',
                        textDecoration: task.done ? 'line-through' : 'none',
                      }}>
                        {task.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {lang === 'de' ? 'Frist:' : 'Due:'} {task.due}
                      </div>
                    </div>
                    {task.done ? (
                      <span style={{ fontSize: '0.6875rem', color: '#16a34a', fontWeight: 700 }}>
                        ✓ {lang === 'de' ? 'Erledigt' : 'Completed'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.6875rem', color: '#ea580c', fontWeight: 700 }}>
                        ⏳ {lang === 'de' ? 'Offen' : 'Pending'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* "My Documents" Filterable Table */}
          <div style={{
            background: '#ffffff',
            borderRadius: '1rem',
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  📁 {lang === 'de' ? 'Meine eingereichten Belege' : 'My Uploaded Documents'}
                </h2>
                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  {lang === 'de' ? 'Nur für Hans Mustermann GmbH sichtbar (Client Isolation)' : 'Strict client isolation: Visible only to your account'}
                </div>
              </div>
            </div>

            {documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                {lang === 'de' ? 'Noch keine Dokumente hochgeladen.' : 'No documents uploaded yet.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Dokument' : 'Document'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Lieferant' : 'Supplier'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Datum' : 'Date'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Betrag' : 'Amount'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Bearbeitungsstatus' : 'Status'}</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>{lang === 'de' ? 'Original' : 'Original File'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.875rem 0.75rem', fontWeight: 600, color: '#0f172a' }}>
                          📄 {doc.original_filename}
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', color: '#475569' }}>
                          {doc.extracted_data?.supplier_name || '—'}
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', color: '#475569' }}>
                          {doc.extracted_data?.invoice_date || '—'}
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, color: '#0f172a' }}>
                          {doc.extracted_data?.total_amount ? `${Number(doc.extracted_data.total_amount).toFixed(2)} €` : '—'}
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem' }}>
                          <span style={{
                            padding: '0.25rem 0.625rem',
                            borderRadius: '9999px',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            background: doc.status === 'APPROVED' ? '#dcfce7' : (doc.status === 'EXPORTED' ? '#e0f2fe' : '#fef3c7'),
                            color: doc.status === 'APPROVED' ? '#16a34a' : (doc.status === 'EXPORTED' ? '#0284c7' : '#d97706'),
                          }}>
                            {doc.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', textAlign: 'right' }}>
                          <a
                            href={`http://127.0.0.1:5000/api/documents/${doc.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: '#0284c7',
                              textDecoration: 'none',
                              fontWeight: 600,
                              fontSize: '0.8125rem',
                            }}
                          >
                            ⬇️ {lang === 'de' ? 'Herunterladen' : 'Download'}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* VIEW 2: PAYROLL & PAYSLIPS (PDF PAGE 9) */}
      {clientSubTab === 'PAYROLL' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Payroll Banner & Quick Action Buttons */}
          <div style={{
            background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
            color: '#ffffff',
            padding: '1.5rem 2rem',
            borderRadius: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem 0' }}>
                👥 {t.payrollBannerTitle}
              </h2>
              <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.9 }}>
                {t.payrollBannerDesc}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSeedPayroll}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                ⚡ {t.payrollSeedDemoBtn}
              </button>

              <button
                type="button"
                onClick={() => { setModalType('NEW_HIRE'); setShowSubmitModal(true); }}
                style={{
                  background: '#ffffff',
                  color: '#0f766e',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                }}
              >
                + {t.payrollNewHireBtn}
              </button>

              <button
                type="button"
                onClick={() => { setModalType('HOURS_OVERTIME'); setShowSubmitModal(true); }}
                style={{
                  background: '#14b8a6',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                ⏱️ {t.payrollHoursBtn}
              </button>

              <button
                type="button"
                onClick={() => { setModalType('SICK_NOTE'); setShowSubmitModal(true); }}
                style={{
                  background: '#f97316',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                🏥 {t.payrollSickBtn}
              </button>
            </div>
          </div>

          {/* Submissions Table */}
          <div style={{
            background: '#ffffff',
            borderRadius: '1rem',
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
              📋 {t.payrollSubmissionsTitle}
            </h3>

            {payrollLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Laden...</div>
            ) : submissions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                {lang === 'de' ? 'Noch keine Lohndaten übermittelt. Klicken Sie oben auf „Demo-Lohndaten laden".' : 'No payroll submissions yet. Click "Load Demo Payroll Data" above.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Mitarbeiter' : 'Employee'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Typ' : 'Type'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Monat' : 'Period'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Details' : 'Details'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Status' : 'Status'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Kanzlei-Notiz' : 'Staff Feedback'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((sub) => {
                      const data = typeof sub.data_json === 'string' ? JSON.parse(sub.data_json) : sub.data_json;
                      return (
                        <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, color: '#0f172a' }}>
                            👤 {sub.employee_name}
                          </td>
                          <td style={{ padding: '0.875rem 0.75rem' }}>
                            <span style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: sub.submission_type === 'NEW_HIRE' ? '#dbeafe' : (sub.submission_type === 'SICK_NOTE' ? '#fee2e2' : '#fef3c7'),
                              color: sub.submission_type === 'NEW_HIRE' ? '#1d4ed8' : (sub.submission_type === 'SICK_NOTE' ? '#b91c1c' : '#b45309'),
                            }}>
                              {sub.submission_type}
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem 0.75rem', color: '#475569', fontWeight: 600 }}>
                            {sub.period}
                          </td>
                          <td style={{ padding: '0.875rem 0.75rem', fontSize: '0.8125rem', color: '#334155' }}>
                            {sub.submission_type === 'NEW_HIRE' && (
                              <span>{data.job_title} • Brutto: {data.gross_salary} € • StKl: {data.tax_class}</span>
                            )}
                            {sub.submission_type === 'HOURS_OVERTIME' && (
                              <span>{data.regular_hours} Std. + {data.overtime_hours} Überstunden {data.bonus ? `(+${data.bonus} € Bonus)` : ''}</span>
                            )}
                            {sub.submission_type === 'SICK_NOTE' && (
                              <span>Krank von {data.sick_from} bis {data.sick_to} (eAU vorliegend)</span>
                            )}
                          </td>
                          <td style={{ padding: '0.875rem 0.75rem' }}>
                            <span style={{
                              padding: '0.25rem 0.625rem',
                              borderRadius: '9999px',
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              background: sub.status === 'PROCESSED' ? '#dcfce7' : '#fef9c3',
                              color: sub.status === 'PROCESSED' ? '#15803d' : '#a16207',
                            }}>
                              {sub.status === 'PROCESSED' ? '✓ ' + t.payrollStatusProcessed : '⏳ ' + t.payrollStatusSubmitted}
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem 0.75rem', color: '#64748b', fontSize: '0.8125rem' }}>
                            {sub.staff_notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Issued Payslips Table */}
          <div style={{
            background: '#ffffff',
            borderRadius: '1rem',
            padding: '1.5rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#0f172a' }}>
              📑 {t.payrollPayslipsTitle}
            </h3>

            {payslips.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                {lang === 'de' ? 'Noch keine Gehaltsabrechnungen von der Kanzlei bereitgestellt.' : 'No payslips published by the tax consultant yet.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Mitarbeiter' : 'Employee'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Abrechnungsmonat' : 'Period'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Brutto (Gross)' : 'Gross'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Lohnsteuer' : 'Tax'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Sozialvers.' : 'Social Sec.'}</th>
                      <th style={{ padding: '0.75rem' }}>{lang === 'de' ? 'Auszahlung (Netto)' : 'Net Payout'}</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>{lang === 'de' ? 'Dokument' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslips.map((slip) => (
                      <tr key={slip.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700, color: '#0f172a' }}>
                          👤 {slip.employee_name}
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', color: '#475569' }}>
                          {slip.period}
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', fontWeight: 700 }}>
                          {Number(slip.gross_salary).toFixed(2)} €
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', color: '#dc2626' }}>
                          -{Number(slip.tax_deduction).toFixed(2)} €
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', color: '#dc2626' }}>
                          -{Number(slip.social_security).toFixed(2)} €
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', fontWeight: 800, color: '#16a34a', fontSize: '1rem' }}>
                          {Number(slip.net_salary).toFixed(2)} €
                        </td>
                        <td style={{ padding: '0.875rem 0.75rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => alert(`Lohnabrechnung ${slip.employee_name} (${slip.period}):\nBrutto: ${slip.gross_salary} €\nNetto: ${slip.net_salary} €\nLohnsteuer: ${slip.tax_deduction} €\nSozialversicherung: ${slip.social_security} €`)}
                            style={{
                              background: '#0284c7',
                              color: '#ffffff',
                              border: 'none',
                              padding: '0.375rem 0.75rem',
                              borderRadius: '0.375rem',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            📄 PDF {lang === 'de' ? 'Abrechnung anzeigen' : 'View Slip'}
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

      {/* VIEW 3: 4-FOLDER CLIENT VAULT (PDF REQUIREMENT) */}
      {clientSubTab === 'VAULT' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FileExplorer
            lang={lang}
            clientId={user?.clientNumber || 'KD-10042'}
            darkTheme={false}
          />
        </div>
      )}

      {/* Submission Modal for Employer */}
      {showSubmitModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '1rem',
            maxWidth: '520px',
            width: '100%',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                {modalType === 'NEW_HIRE' && `👤 ${t.payrollNewHireBtn}`}
                {modalType === 'HOURS_OVERTIME' && `⏱️ ${t.payrollHoursBtn}`}
                {modalType === 'SICK_NOTE' && `🏥 ${t.payrollSickBtn}`}
              </h3>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPayroll} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  {lang === 'de' ? 'Vollständiger Name des Mitarbeiters' : 'Employee Full Name'}
                </label>
                <input
                  type="text"
                  required
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="z.B. Lukas Becker"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                />
              </div>

              {modalType === 'NEW_HIRE' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                        {lang === 'de' ? 'Berufsbezeichnung' : 'Job Title'}
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="z.B. Marketing Manager"
                        style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                        {lang === 'de' ? 'Monatliches Brutto (€)' : 'Gross Salary (€)'}
                      </label>
                      <input
                        type="number"
                        value={salary}
                        onChange={(e) => setSalary(e.target.value)}
                        style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                        {lang === 'de' ? 'Steuerklasse' : 'Tax Class'}
                      </label>
                      <select
                        value={taxClass}
                        onChange={(e) => setTaxClass(e.target.value)}
                        style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                      >
                        <option value="I">Klasse I (Single / Alleinstehend)</option>
                        <option value="II">Klasse II (Alleinerziehend)</option>
                        <option value="III">Klasse III (Verheiratet / Höheres Einkommen)</option>
                        <option value="IV">Klasse IV (Verheiratet / Gleiches Einkommen)</option>
                        <option value="V">Klasse V (Verheiratet / Geringeres Einkommen)</option>
                        <option value="VI">Klasse VI (Zweitjob)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                        {lang === 'de' ? 'Eintrittsdatum' : 'Start Date'}
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {lang === 'de' ? 'Krankenkasse' : 'Health Insurance'}
                    </label>
                    <input
                      type="text"
                      value={healthInsurance}
                      onChange={(e) => setHealthInsurance(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                </>
              )}

              {modalType === 'HOURS_OVERTIME' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {lang === 'de' ? 'Geleistete Stunden' : 'Regular Hours'}
                    </label>
                    <input
                      type="number"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {lang === 'de' ? 'Überstunden' : 'Overtime Hours'}
                    </label>
                    <input
                      type="number"
                      value={overtimeHours}
                      onChange={(e) => setOvertimeHours(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {lang === 'de' ? 'Sonderzahlung / Bonus (€)' : 'Bonus (€)'}
                    </label>
                    <input
                      type="number"
                      value={bonus}
                      onChange={(e) => setBonus(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {lang === 'de' ? 'Grundgehalt (€)' : 'Base Salary (€)'}
                    </label>
                    <input
                      type="number"
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                </div>
              )}

              {modalType === 'SICK_NOTE' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {lang === 'de' ? 'Krank ab' : 'Sick From'}
                    </label>
                    <input
                      type="date"
                      value={sickFrom}
                      onChange={(e) => setSickFrom(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {lang === 'de' ? 'Voraussichtlich bis' : 'Sick To'}
                    </label>
                    <input
                      type="date"
                      value={sickTo}
                      onChange={(e) => setSickTo(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600, outline: 'none' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {lang === 'de' ? 'Abbrechen' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.625rem 1.25rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: '#0d9488',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {lang === 'de' ? 'An Kanzlei übermitteln' : 'Submit to Tax Firm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
