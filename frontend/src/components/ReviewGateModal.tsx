import React, { useState } from 'react';
import { downloadAuthenticatedFile } from '../utils/authFile';

export interface ReviewOption {
  gegenkonto: string;
  buCode: string;
  label: string;
  action?: 'SET_ACCOUNT' | 'ACCEPT' | 'EXCLUDE';
  recommended?: boolean;
}

export interface ReviewIssue {
  id: string;
  lineKey: string;
  relatedLineKeys?: string[];
  relatedBookings?: ReviewIssue['booking'][];
  categoryTab?: 'MISSING_BELEG' | 'DECISION';
  type: string;
  severity: 'CRITICAL' | 'WARNING';
  title: string;
  question: string;
  details: string;
  booking: {
    lineKey: string;
    date: string;
    amount: number;
    sh: 'S' | 'H';
    konto: string;
    gegenkonto: string;
    buCode: string;
    text: string;
    belegfeld1?: string;
  };
  matchedBeleg?: {
    id?: string;
    source_file: string;
    pages: number[];
    partner: string;
    invoiceNo?: string | null;
    vin?: string | null;
    amount: number;
    taxClause?: string | null;
    snippet?: string;
    document_id?: string;
  };
  options: ReviewOption[];
  ai?: {
    category?: string;
    confidence?: number;
    reason?: string;
    suggested_gegenkonto?: string;
    suggested_bu?: string;
  };
  suggest_upload?: string;
  requiresDateInput?: boolean;
  resolved: boolean;
  resolution?: {
    action: string;
    gegenkonto?: string;
    buCode?: string;
    belegdatum?: string;
    note?: string;
    resolved_by?: string;
    resolved_at: string;
  };
}

export interface ControlCheck {
  id: string;
  label: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  critical: boolean;
  value: string;
  expected: string;
  hint?: string;
}

export interface ReviewReport {
  scope: string;
  client_id: string;
  year: number;
  month: number;
  generated_at: string;
  total_bookings: number;
  auto_booked: number;
  excluded_count: number;
  issues: ReviewIssue[];
  open_critical: number;
  open_warnings: number;
  resolved_count: number;
  checks: ControlCheck[];
  blocked: boolean;
  block_reasons: string[];
  totals: { bank_net: number; kasse_net: number; transit_net: number; bank_rows: number };
  bookings: Array<any>;
  accuracy?: {
    client_id: string;
    year: number;
    month: number;
    period: string;
    total_bookings: number;
    auto_correct: number;
    auto_correct_pct: number;
    current_accuracy_pct?: number;
    first_run_correct?: number;
    first_run_accuracy_pct?: number;
    first_run_changed?: number;
    resolved_by_question?: number;
    questions_asked: number;
    questions_by_type: {
      beleg_fehlt: number;
      entscheidung: number;
      unreadable: number;
    };
    user_changed: number;
    goal_met: boolean;
    errors_by_category: Record<string, number>;
    error_list: Array<{
      category: string;
      cause: string;
      lineKey: string;
      date: string;
      amount: number;
      text: string;
      proposedAccount: string;
      finalAccount: string;
    }>;
  };
  csv_ready: boolean;
  locked?: boolean;
  locked_at?: string;
}

interface ReviewGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReviewReport | null;
  onRefresh: () => Promise<void>;
  isDe?: boolean;
  apiBase?: string;
  clientId?: string;
  documentId?: string;
}

export const ReviewGateModal: React.FC<ReviewGateModalProps> = ({
  isOpen,
  onClose,
  report,
  onRefresh,
  isDe = true,
  apiBase = 'http://localhost:5000/api',
  clientId = 'user_client_1',
  documentId,
}) => {
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [rememberVendorMap, setRememberVendorMap] = useState<Record<string, boolean>>({});
  const [dateInputMap, setDateInputMap] = useState<Record<string, string>>({});
  const [amountInputMap, setAmountInputMap] = useState<Record<string, string>>({});
  const [directionInputMap, setDirectionInputMap] = useState<Record<string, 'PURCHASE' | 'SALE'>>({});
  const [isAskingAi, setIsAskingAi] = useState(false);
  const [uploadingForIssue, setUploadingForIssue] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'DECISION' | 'MISSING_BELEG'>('ALL');

  if (!isOpen || !report) return null;

  const handleResolve = async (
    issue: ReviewIssue,
    option: ReviewOption,
    customAcc?: string
  ) => {
    setResolvingKey(issue.lineKey);
    setStatusMessage(null);
    try {
      const isUnusedBeleg =
        issue.lineKey.startsWith('UNUSED_BELEG:') || issue.title.startsWith('Ungebuchter Beleg');
      const selectedDir =
        directionInputMap[issue.lineKey] || (issue.booking.sh === 'S' ? 'SALE' : 'PURCHASE');
      const targetAcc =
        customAcc ||
        (isUnusedBeleg && option.action !== 'EXCLUDE'
          ? option.gegenkonto === '8193' || option.gegenkonto === '3200'
            ? option.gegenkonto
            : selectedDir === 'SALE'
            ? '8193'
            : '3200'
          : option.gegenkonto);
      const targetSh =
        isUnusedBeleg && option.action !== 'EXCLUDE'
          ? targetAcc === '8193'
            ? 'S'
            : 'H'
          : undefined;
      const targetBu = option.buCode || (targetAcc === '4530' || targetAcc === '4540' ? '9' : '');
      const remember = Boolean(rememberVendorMap[issue.lineKey]);
      const needsDate = Boolean(
        isUnusedBeleg ||
          issue.requiresDateInput ||
          issue.title.includes('Vertrags-/Zahlungsdatum unleserlich')
      );
      const enteredDate = dateInputMap[issue.lineKey] || '';
      if (needsDate && option.action !== 'EXCLUDE' && !enteredDate) {
        alert(
          isDe
            ? 'Bitte geben Sie zuerst das Vertrags-/Zahlungsdatum ein.'
            : 'Please enter the contract/payment date first.'
        );
        setResolvingKey(null);
        return;
      }

      const rawEnteredAmt = amountInputMap[issue.lineKey];
      const effectiveAmount =
        rawEnteredAmt !== undefined && rawEnteredAmt.trim() !== ''
          ? Number(rawEnteredAmt.trim().replace(',', '.'))
          : Number(issue.booking.amount) || 0;
      if (option.action !== 'EXCLUDE' && (isUnusedBeleg || !(issue.booking.amount > 0))) {
        if (!Number.isFinite(effectiveAmount) || !(effectiveAmount > 0)) {
          alert(
            isDe
              ? 'Ein Betrag von 0,00 € kann nicht gebucht werden. Bitte geben Sie einen gültigen Betrag (> 0,00 €) ein.'
              : 'A 0.00 € booking cannot be confirmed. Please enter a valid amount (> 0.00 €).'
          );
          setResolvingKey(null);
          return;
        }
      }

      const res = await fetch(`${apiBase}/review/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: report.scope,
          lineKey: issue.lineKey,
          relatedLineKeys: issue.relatedLineKeys,
          action: option.action || 'SET_ACCOUNT',
          gegenkonto: targetAcc,
          buCode: targetBu,
          ...(enteredDate ? { belegdatum: enteredDate } : {}),
          ...(isUnusedBeleg && effectiveAmount > 0 ? { amount: effectiveAmount } : {}),
          ...(targetSh ? { sh: targetSh } : {}),
          remember_vendor: remember,
          vendor_text: issue.booking.text,
          document_id: documentId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Fehler beim Speichern');
      }

      const data = await res.json();
      setStatusMessage(data.message || (isDe ? 'Entscheidung gespeichert.' : 'Decision saved.'));
      await onRefresh();
    } catch (err: any) {
      alert(`Fehler: ${err.message}`);
    } finally {
      setResolvingKey(null);
    }
  };

  const handleReset = async (lineKey?: string) => {
    try {
      await fetch(`${apiBase}/review/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: report.scope, lineKey }),
      });
      await onRefresh();
    } catch (e: any) {
      alert(`Fehler: ${e.message}`);
    }
  };

  const handleAskAiAll = async () => {
    setIsAskingAi(true);
    try {
      const res = await fetch(`${apiBase}/review/ask-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: report.scope }),
      });
      const data = await res.json();
      setStatusMessage(data.message || 'KI-Analyse abgeschlossen.');
      await onRefresh();
    } catch (e: any) {
      alert(`KI-Fehler: ${e.message}`);
    } finally {
      setIsAskingAi(false);
    }
  };

  const handleInlineUpload = async (e: React.ChangeEvent<HTMLInputElement>, _issue: ReviewIssue) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploadingForIssue(_issue.lineKey);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('category', '01_FiBu');
      formData.append('client_id', clientId);
      formData.append('year', String(report.year));
      formData.append('month', String(report.month).padStart(2, '0'));

      const res = await fetch(`${apiBase}/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload fehlgeschlagen');
      setStatusMessage(isDe ? `Beleg "${file.name}" empfangen und analysiert!` : `Document "${file.name}" uploaded and parsed!`);
      await onRefresh();
    } catch (err: any) {
      alert(`Upload-Fehler: ${err.message}`);
    } finally {
      setUploadingForIssue(null);
    }
  };

  const handleToggleMonthLock = async () => {
    const endpoint = report.locked ? 'unlock-month' : 'lock-month';
    const token = localStorage.getItem('fintax_token');
    try {
      const resp = await fetch(`${apiBase}/review/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ clientId: report.client_id || clientId, year: report.year, month: report.month }),
      });
      if (resp.ok) {
        await onRefresh();
      }
    } catch (e) {
      console.error('Month lock toggle error:', e);
    }
  };

  const openIssues = report.issues.filter((i) => !i.resolved);
  const resolvedIssues = report.issues.filter((i) => i.resolved);
  const missingBelegCount = openIssues.filter((i) => i.categoryTab === 'MISSING_BELEG').length;
  const decisionCount = openIssues.length - missingBelegCount;
  const displayedIssues =
    activeTab === 'ALL'
      ? openIssues
      : activeTab === 'MISSING_BELEG'
      ? openIssues.filter((i) => i.categoryTab === 'MISSING_BELEG')
      : openIssues.filter((i) => i.categoryTab !== 'MISSING_BELEG');

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(11, 26, 48, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 2200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          maxHeight: '92vh',
          background: '#0b1a30',
          borderRadius: 20,
          border: report.blocked ? '1.5px solid #ef4444' : '1.5px solid #10b981',
          boxShadow: report.blocked
            ? '0 25px 60px rgba(239, 68, 68, 0.25), 0 0 30px rgba(0,0,0,0.8)'
            : '0 25px 60px rgba(16, 185, 129, 0.25), 0 0 30px rgba(0,0,0,0.8)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'inherit',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '22px 28px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(180deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: '1.4rem' }}>{report.blocked ? '🛡️' : '✅'}</span>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
                {isDe ? 'DATEV-Prüfbericht & Freigabe' : 'DATEV Review Gate & Approval'}
              </h2>
              <span
                style={{
                  background: report.blocked ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.18)',
                  color: report.blocked ? '#f87171' : '#34d399',
                  border: report.blocked ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {report.blocked
                  ? isDe
                    ? `Export gesperrt (${report.open_critical} offen)`
                    : `Export Blocked (${report.open_critical} open)`
                  : isDe
                  ? 'Freigegeben (Export bereit)'
                  : 'Approved (Export Ready)'}
              </span>
              {report.locked && (
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.18)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  🔒 {isDe ? 'Monat gesperrt' : 'Month Locked'}
                </span>
              )}
              {(report.locked || !report.blocked) && (
                <button
                  onClick={handleToggleMonthLock}
                  title={report.locked ? (isDe ? 'Monat entsperren, um mit neuen Regeln neu zu berechnen' : 'Unlock month to recalculate') : (isDe ? 'Monat einfrieren / sperren' : 'Lock approved month')}
                  style={{
                    background: report.locked ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.08)',
                    color: report.locked ? '#fbbf24' : '#cbd5e1',
                    border: report.locked ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 8,
                    padding: '3px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {report.locked ? (isDe ? '🔓 Entsperren' : '🔓 Unlock') : (isDe ? '🔒 Sperren' : '🔒 Lock')}
                </button>
              )}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Monat {String(report.month).padStart(2, '0')}/{report.year} • {report.total_bookings} Buchungen ({report.auto_booked} automatisch verifiziert)
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: '#94a3b8',
              borderRadius: 10,
              width: 36,
              height: 36,
              fontSize: '1.2rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div style={{ padding: '22px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Monthly Accuracy Report Card */}
          {report.accuracy && (
            <div
              style={{
                background: report.accuracy.goal_met
                  ? 'rgba(16, 185, 129, 0.08)'
                  : 'rgba(245, 158, 11, 0.08)',
                border: report.accuracy.goal_met
                  ? '1px solid rgba(16, 185, 129, 0.35)'
                  : '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc' }}>
                    🎯 {isDe ? 'Genauigkeitsbericht (Accuracy Report)' : 'Accuracy Report'}
                  </span>
                  <span
                    style={{
                      background: report.accuracy.goal_met ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: report.accuracy.goal_met ? '#34d399' : '#fbbf24',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {report.accuracy.goal_met
                      ? isDe
                        ? 'Ziel erreicht (0 Systemfehler & ≥ 97%)'
                        : 'Goal met (0 errors & ≥ 97%)'
                      : isDe
                      ? 'Ziel prüfen (Ziel: 0 Systemfehler & ≥ 97%)'
                      : 'Check goal (target: 0 errors & ≥ 97%)'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: '0.82rem', color: '#cbd5e1' }}>
                  <span>
                    <strong>{isDe ? 'Buchungen:' : 'Total:'}</strong> {report.accuracy.total_bookings}
                  </span>
                  {report.accuracy.first_run_accuracy_pct !== undefined && (
                    <span>
                      <strong>{isDe ? 'First-Run:' : 'First-Run:'}</strong>{' '}
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                        {report.accuracy.first_run_correct}/{report.accuracy.total_bookings} ({report.accuracy.first_run_accuracy_pct.toFixed(1)}%)
                      </span>
                    </span>
                  )}
                  <span>
                    <strong>{isDe ? 'Aktuell (Auto-Korrekt):' : 'Current Accuracy:'}</strong>{' '}
                    <span style={{ color: '#34d399', fontWeight: 700 }}>
                      {report.accuracy.auto_correct}/{report.accuracy.total_bookings} ({(report.accuracy.current_accuracy_pct ?? report.accuracy.auto_correct_pct).toFixed(1)}%)
                    </span>
                  </span>
                  {report.accuracy.resolved_by_question !== undefined && (
                    <span>
                      <strong>{isDe ? 'Per Frage gelöst:' : 'Resolved by Q:'}</strong> {report.accuracy.resolved_by_question}
                    </span>
                  )}
                  <span>
                    <strong>{isDe ? 'Fragen:' : 'Questions:'}</strong> {report.accuracy.questions_asked}{' '}
                    <span style={{ color: '#94a3b8' }}>
                      (Beleg fehlt: {report.accuracy.questions_by_type.beleg_fehlt} • Entscheidung:{' '}
                      {report.accuracy.questions_by_type.entscheidung} • Unleserlich:{' '}
                      {report.accuracy.questions_by_type.unreadable})
                    </span>
                  </span>
                  <span>
                    <strong>{isDe ? 'Vom Nutzer geändert (Systemfehler):' : 'User-Changed:'}</strong>{' '}
                    <span style={{ color: report.accuracy.user_changed === 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>
                      {report.accuracy.user_changed}
                    </span>
                  </span>
                </div>
              </div>
              {report.accuracy.error_list && report.accuracy.error_list.length > 0 && (
                <div style={{ fontSize: '0.78rem', color: '#fca5a5', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
                  {report.accuracy.error_list.map((err, i) => (
                    <div key={i}>
                      • <strong>[{err.category}]</strong> {err.date} ({err.amount.toFixed(2)} €) „{err.text.slice(0, 40)}“:{' '}
                      {err.proposedAccount} → {err.finalAccount} — {err.cause}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Status Alert Banner */}
          {statusMessage && (
            <div
              style={{
                background: 'rgba(14, 165, 233, 0.15)',
                border: '1px solid rgba(14, 165, 233, 0.4)',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: '0.88rem',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>ℹ️ {statusMessage}</span>
              <button
                onClick={() => setStatusMessage(null)}
                style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          )}

          {exportError && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.16)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: '0.88rem',
                color: '#fca5a5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span>❌ {exportError}</span>
              <button
                onClick={() => setExportError(null)}
                style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Control Checks Grid */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              {isDe ? 'Automatische Kontroll-Prüfungen (DATEV-Integrität)' : 'Integrity Control Checks'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {report.checks.map((check) => {
                const isPass = check.status === 'PASS';
                const isWarn = check.status === 'WARN';
                return (
                  <div
                    key={check.id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.65)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      border: isPass
                        ? '1px solid rgba(16, 185, 129, 0.3)'
                        : isWarn
                        ? '1px solid rgba(245, 158, 11, 0.3)'
                        : '1px solid rgba(239, 68, 68, 0.4)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600 }}>{check.label}</span>
                      <span style={{ fontSize: '0.95rem' }}>{isPass ? '✅' : isWarn ? '⚠️' : '❌'}</span>
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: isPass ? '#34d399' : isWarn ? '#fbbf24' : '#f87171' }}>
                      {check.value}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      {check.hint || `Soll: ${check.expected}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Open Doubts Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>
                  {isDe ? 'Zu prüfende Positionen' : 'Items Requiring Review'}
                </span>
                <span
                  style={{
                    background: openIssues.length > 0 ? '#ef4444' : '#10b981',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {openIssues.length}
                </span>
              </div>

              {openIssues.length > 0 && (
                <button
                  onClick={handleAskAiAll}
                  disabled={isAskingAi}
                  style={{
                    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.25))',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: isAskingAi ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>✨</span>
                  <span>{isAskingAi ? (isDe ? 'Qwen analysiert...' : 'Analyzing with Qwen...') : (isDe ? 'Qwen KI um Rat fragen' : 'Ask Qwen AI Advice')}</span>
                </button>
              )}
            </div>

            {openIssues.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {[
                  { id: 'ALL' as const, label: isDe ? `Alle (${openIssues.length})` : `All (${openIssues.length})` },
                  { id: 'DECISION' as const, label: isDe ? `❓ Entscheidung (${decisionCount})` : `❓ Decisions (${decisionCount})` },
                  { id: 'MISSING_BELEG' as const, label: isDe ? `📎 Beleg fehlt (${missingBelegCount})` : `📎 Missing Receipt (${missingBelegCount})` },
                ].map((tab) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        background: selected ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255, 255, 255, 0.05)',
                        border: selected ? '1px solid rgba(56, 189, 248, 0.65)' : '1px solid rgba(255, 255, 255, 0.12)',
                        color: selected ? '#e0f2fe' : '#94a3b8',
                        padding: '6px 12px',
                        borderRadius: 999,
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}

            {openIssues.length === 0 ? (
              report.blocked ? (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 14,
                    padding: '24px',
                    textAlign: 'center',
                    color: '#f87171',
                  }}
                >
                  <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>🔒</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {isDe ? 'DATEV-Export gesperrt' : 'DATEV Export Blocked'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 4 }}>
                    {report.block_reasons[0] || (isDe ? 'Bitte Kontroll-Prüfungen oben beachten.' : 'Please resolve the integrity checks above.')}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 14,
                    padding: '28px',
                    textAlign: 'center',
                    color: '#34d399',
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎉</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                    {isDe ? 'Alle Positionen sind eindeutig zugeordnet!' : 'All transactions verified!'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 4 }}>
                    {isDe ? 'Keine offenen Zweifel. Die DATEV EXTF CSV-Dateien sind exportbereit.' : 'No open doubts. DATEV CSV is ready for download.'}
                  </div>
                </div>
              )
            ) : displayedIssues.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
                {isDe ? 'Keine offenen Punkte in dieser Kategorie.' : 'No open items in this category.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {displayedIssues.map((issue) => {
                  const b = issue.booking;
                  const isBusy = resolvingKey === issue.lineKey;
                  const isUploading = uploadingForIssue === issue.lineKey;

                  return (
                    <div
                      key={issue.id}
                      style={{
                        background: 'linear-gradient(180deg, #13233c, #0d1b2f)',
                        borderRadius: 16,
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        padding: '18px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      {/* Top Row: Type Badge + Booking Summary */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span
                              style={{
                                background: issue.severity === 'CRITICAL' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                                color: issue.severity === 'CRITICAL' ? '#f87171' : '#fbbf24',
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: '0.74rem',
                                fontWeight: 700,
                              }}
                            >
                              {issue.severity === 'CRITICAL' ? '🔴 KRITISCH' : '⚠️ PRÜFUNG'}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: '0.98rem', color: '#ffffff' }}>
                              {issue.title}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.88rem', color: '#cbd5e1' }}>
                            {issue.question}
                          </div>
                        </div>

                        {/* Amount & Date badge */}
                        <div style={{ textAlign: 'right', minWidth: 120 }}>
                          <div
                            style={{
                              fontSize: '1.2rem',
                              fontWeight: 800,
                              color: b.sh === 'S' && b.konto === '1200' ? '#34d399' : '#f87171',
                            }}
                          >
                            {b.sh === 'S' && b.konto === '1200' ? '+' : '−'}{b.amount.toFixed(2)} €
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            {b.date} • {b.konto === '1200' ? 'Bank 1200' : 'Kasse 1000'}
                          </div>
                        </div>
                      </div>

                      {/* Transaction Description Box */}
                      <div
                        style={{
                          background: 'rgba(15, 23, 42, 0.75)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          fontSize: '0.82rem',
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: '#e2e8f0' }}>Text:</strong> {b.text}
                        </span>
                        {b.belegfeld1 && (
                          <span style={{ color: '#38bdf8', fontSize: '0.75rem', background: 'rgba(56,189,248,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                            Beleg: {b.belegfeld1}
                          </span>
                        )}
                      </div>

                      {/* Grouped Partial Payments Box ("1 Auto = 1 Frage") */}
                      {issue.relatedBookings && issue.relatedBookings.length > 1 && (
                        <div
                          style={{
                            background: 'rgba(99, 102, 241, 0.08)',
                            border: '1px solid rgba(129, 140, 248, 0.3)',
                            borderRadius: 10,
                            padding: '10px 12px',
                            fontSize: '0.8rem',
                            color: '#cbd5e1',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#a5b4fc', marginBottom: 6 }}>
                            🚗 {issue.relatedBookings.length} {isDe ? 'zusammengefasste Teilzahlungen (1 Fahrzeug → 1 Entscheidung)' : 'grouped partial payments (1 car → 1 decision)'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {issue.relatedBookings.map((rb, idx) => (
                              <div key={rb.lineKey || idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px dashed rgba(255,255,255,0.08)', paddingBottom: 3 }}>
                                <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{rb.date}</span>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rb.text}</span>
                                <span style={{ fontWeight: 700, color: '#34d399', whiteSpace: 'nowrap' }}>{rb.amount.toFixed(2)} €</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Matched Receipt Preview Banner */}
                      {issue.matchedBeleg && (
                        <div
                          style={{
                            background: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: 10,
                            padding: '10px 12px',
                            fontSize: '0.8rem',
                            color: '#cbd5e1',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#6ee7b7', marginBottom: 4 }}>
                            📎 {isDe ? 'Gefundener Beleg' : 'Matched Receipt'}: {issue.matchedBeleg.source_file} ({isDe ? 'S.' : 'p.'} {issue.matchedBeleg.pages.join(', ')})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: '0.78rem', color: '#94a3b8' }}>
                            <span><strong style={{ color: '#e2e8f0' }}>Partner:</strong> {issue.matchedBeleg.partner}</span>
                            {issue.matchedBeleg.invoiceNo && <span><strong style={{ color: '#e2e8f0' }}>Rg-Nr:</strong> {issue.matchedBeleg.invoiceNo}</span>}
                            {issue.matchedBeleg.vin && <span><strong style={{ color: '#e2e8f0' }}>VIN:</strong> {issue.matchedBeleg.vin}</span>}
                            {issue.matchedBeleg.taxClause && <span><strong style={{ color: '#fbbf24' }}>Steuer:</strong> {issue.matchedBeleg.taxClause}</span>}
                          </div>
                          {issue.matchedBeleg.snippet && (
                            <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                              „{issue.matchedBeleg.snippet}“
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI Advice Callout */}
                      {issue.ai && (issue.ai.reason || issue.ai.suggested_gegenkonto) && (
                        <div
                          style={{
                            background: 'rgba(14, 165, 233, 0.1)',
                            border: '1px solid rgba(14, 165, 233, 0.3)',
                            borderRadius: 10,
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: '0.84rem',
                          }}
                        >
                          <span style={{ fontSize: '1.2rem' }}>🤖</span>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: '#38bdf8' }}>
                              Qwen KI-Vorschlag: Konto {issue.ai.suggested_gegenkonto || 'Prüfen'}
                              {issue.ai.confidence !== undefined && ` (${(issue.ai.confidence * 100).toFixed(0)}% Sicherheit)`}
                            </strong>
                            <div style={{ color: '#cbd5e1', fontSize: '0.8rem', marginTop: 2 }}>
                              {issue.ai.reason || 'Basierend auf deutschem SKR03 Standard & Mandanten-Regeln.'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Input fields for Ungebuchter Beleg (Betrag EUR, Datum, Richtung) or unreadable Date */}
                      {(issue.lineKey.startsWith('UNUSED_BELEG:') ||
                        issue.title.startsWith('Ungebuchter Beleg') ||
                        issue.requiresDateInput ||
                        issue.title.includes('Vertrags-/Zahlungsdatum unleserlich')) && (
                        <div
                          style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                            borderRadius: 10,
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}
                        >
                          {(issue.lineKey.startsWith('UNUSED_BELEG:') || issue.title.startsWith('Ungebuchter Beleg')) && (
                            <>
                              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24' }}>
                                💶 {isDe ? 'Betrag (EUR):' : 'Amount (EUR):'}
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="z.B. 12600.00"
                                value={
                                  amountInputMap[issue.lineKey] !== undefined
                                    ? amountInputMap[issue.lineKey]
                                    : issue.booking.amount > 0
                                    ? String(issue.booking.amount)
                                    : ''
                                }
                                onChange={(e) =>
                                  setAmountInputMap({ ...amountInputMap, [issue.lineKey]: e.target.value })
                                }
                                style={{
                                  background: '#0f172a',
                                  color: '#ffffff',
                                  border: '1px solid rgba(251, 191, 36, 0.5)',
                                  borderRadius: 6,
                                  padding: '5px 10px',
                                  fontSize: '0.84rem',
                                  width: 130,
                                }}
                              />
                              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24' }}>
                                ⇄ {isDe ? 'Richtung:' : 'Direction:'}
                              </label>
                              <select
                                value={
                                  directionInputMap[issue.lineKey] ||
                                  (issue.booking.sh === 'S' ? 'SALE' : 'PURCHASE')
                                }
                                onChange={(e) =>
                                  setDirectionInputMap({
                                    ...directionInputMap,
                                    [issue.lineKey]: e.target.value as 'PURCHASE' | 'SALE',
                                  })
                                }
                                style={{
                                  background: '#0f172a',
                                  color: '#ffffff',
                                  border: '1px solid rgba(251, 191, 36, 0.5)',
                                  borderRadius: 6,
                                  padding: '5px 10px',
                                  fontSize: '0.84rem',
                                }}
                              >
                                <option value="PURCHASE">
                                  {isDe ? 'Ankauf (3200 an 1000)' : 'Purchase (3200 to 1000)'}
                                </option>
                                <option value="SALE">
                                  {isDe ? 'Verkauf (1000 an 8193)' : 'Sale (1000 to 8193)'}
                                </option>
                              </select>
                            </>
                          )}
                          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24' }}>
                            📅 {isDe ? 'Vertrags-/Zahlungsdatum:' : 'Contract/Payment Date:'}
                          </label>
                          <input
                            type="date"
                            value={dateInputMap[issue.lineKey] || ''}
                            min={`${report.year}-${String(report.month).padStart(2, '0')}-01`}
                            max={`${report.year}-${String(report.month).padStart(2, '0')}-31`}
                            onChange={(e) => setDateInputMap({ ...dateInputMap, [issue.lineKey]: e.target.value })}
                            style={{
                              background: '#0f172a',
                              color: '#ffffff',
                              border: '1px solid rgba(251, 191, 36, 0.5)',
                              borderRadius: 6,
                              padding: '5px 10px',
                              fontSize: '0.84rem',
                            }}
                          />
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {isDe ? 'Wird für die bestätigte Buchung verwendet' : 'Used for the confirmed booking'}
                          </span>
                        </div>
                      )}

                      {/* Action Choice Buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>
                          {isDe ? 'Bitte wählen Sie die korrekte steuerliche Behandlung:' : 'Choose correct tax treatment:'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {issue.options.map((opt, idx) => (
                            <button
                              key={idx}
                              disabled={isBusy}
                              onClick={() => handleResolve(issue, opt)}
                              style={{
                                background: opt.recommended
                                  ? 'linear-gradient(135deg, #0284c7, #2563eb)'
                                  : opt.action === 'EXCLUDE'
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : 'rgba(255, 255, 255, 0.08)',
                                border: opt.recommended
                                  ? '1px solid #38bdf8'
                                  : opt.action === 'EXCLUDE'
                                  ? '1px solid rgba(239,68,68,0.4)'
                                  : '1px solid rgba(255, 255, 255, 0.15)',
                                color: opt.action === 'EXCLUDE' ? '#f87171' : '#ffffff',
                                padding: '8px 14px',
                                borderRadius: 8,
                                fontSize: '0.84rem',
                                fontWeight: opt.recommended ? 700 : 600,
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {opt.recommended && <span>⭐</span>}
                              <span>{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Extra Actions: Remember Vendor Toggle & Missing Beleg Upload */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#94a3b8', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(rememberVendorMap[issue.lineKey])}
                            onChange={(e) => setRememberVendorMap({ ...rememberVendorMap, [issue.lineKey]: e.target.checked })}
                          />
                          <span>
                            {issue.type === 'VIN_NOT_FOUND'
                              ? (isDe ? 'In VIN-Register / Fahrzeughistorie speichern' : 'Save to VIN register / vehicle history')
                              : (isDe ? 'Diesen Empfänger für zukünftige Monate speichern' : 'Remember vendor for future months')}
                          </span>
                        </label>

                        {/* Inline File Re-Upload */}
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px dashed rgba(255,255,255,0.25)',
                            borderRadius: 8,
                            padding: '4px 10px',
                            fontSize: '0.78rem',
                            color: '#cbd5e1',
                            cursor: isUploading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <span>{isUploading ? '⏳ Upload...' : '📎 Fehlenden Beleg nachreichen'}</span>
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            style={{ display: 'none' }}
                            disabled={isUploading}
                            onChange={(e) => handleInlineUpload(e, issue)}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resolved Items List (Audit Trail) */}
          {resolvedIssues.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                {isDe ? `Bereits bestätigte Positionen (${resolvedIssues.length})` : `Resolved Items (${resolvedIssues.length})`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {resolvedIssues.map((issue) => (
                  <div
                    key={issue.id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.45)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.84rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#34d399' }}>✓</span>
                      <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{issue.booking.date} • {issue.booking.text.slice(0, 40)}</span>
                      <span style={{ color: '#38bdf8', fontSize: '0.78rem' }}>
                        → {issue.resolution?.action === 'EXCLUDE' ? 'Ausgeschlossen' : `Gegenkonto ${issue.resolution?.gegenkonto || issue.booking.gegenkonto}`}
                      </span>
                    </div>

                    <button
                      onClick={() => handleReset(issue.lineKey)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {isDe ? 'Rückgängig' : 'Undo'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Download Blocker State */}
        <div
          style={{
            padding: '18px 28px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(11,26,48,1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ fontSize: '0.85rem', flex: 1, minWidth: 0 }}>
            {report.blocked ? (
              <span style={{ color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔒</span>
                <span>{report.block_reasons.join(' • ') || (isDe ? 'DATEV Export gesperrt' : 'DATEV export blocked')}</span>
              </span>
            ) : (
              <span style={{ color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✅</span>
                <span>{isDe ? 'Alle Prüfungen bestanden! DATEV-Export freigegeben.' : 'All checks passed! DATEV CSV unlocked.'}</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#ffffff',
                padding: '10px 18px',
                borderRadius: 10,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isDe ? 'Schließen' : 'Close'}
            </button>

            <button
              type="button"
              disabled={report.blocked}
              onClick={async () => {
                if (report.blocked) return;
                const url = documentId
                  ? `${apiBase}/documents/${documentId}/skr03-csv`
                  : `${apiBase}/review/export-csv?client_id=${encodeURIComponent(report.client_id || clientId)}&year=${report.year}&month=${report.month}`;
                const fallback = `EXTF_Buchungen_${report.year}_${String(report.month).padStart(2, '0')}.csv`;
                setExportError(null);
                try {
                  await downloadAuthenticatedFile(url, fallback);
                } catch (err: any) {
                  setExportError(err?.message || (isDe ? 'CSV-Export fehlgeschlagen.' : 'CSV download failed.'));
                  await onRefresh();
                }
              }}
              style={{
                background: report.blocked ? '#334155' : 'linear-gradient(135deg, #10b981, #059669)',
                color: report.blocked ? '#94a3b8' : '#ffffff',
                border: 'none',
                padding: '10px 22px',
                borderRadius: 10,
                fontSize: '0.92rem',
                fontWeight: 700,
                cursor: report.blocked ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: report.blocked ? 'none' : '0 4px 16px rgba(16, 185, 129, 0.4)',
              }}
            >
              <span>{report.blocked ? '🔒' : '⬇️'}</span>
              <span>{isDe ? 'DATEV EXTF CSV herunterladen' : 'Download DATEV CSV'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
