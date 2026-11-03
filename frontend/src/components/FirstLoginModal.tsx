import React, { useState } from 'react';
import type { Language } from '../translations';
import { useAuth } from '../context/AuthContext';

const API_BASE = 'http://127.0.0.1:5000/api';

interface FirstLoginModalProps {
  lang: Language;
  onComplete: () => void;
}

export const FirstLoginModal: React.FC<FirstLoginModalProps> = ({ lang, onComplete }) => {
  const { user, refreshProfile, logout } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  // Step 2: Privacy Notice State
  const [acceptedConsent, setAcceptedConsent] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = getPasswordStrength(newPassword);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);

    if (newPassword.length < 8) {
      setPwError(
        lang === 'de'
          ? 'Das neue Passwort muss mindestens 8 Zeichen lang sein.'
          : 'New password must be at least 8 characters long.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwError(
        lang === 'de'
          ? 'Die Passwörter stimmen nicht überein.'
          : 'The new passwords do not match.'
      );
      return;
    }

    if (!user?.id) {
      setPwError(lang === 'de' ? 'Benutzer-ID fehlt.' : 'Missing user ID.');
      return;
    }

    setPwLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || (lang === 'de' ? 'Passwortänderung fehlgeschlagen.' : 'Password change failed.'));
        setPwLoading(false);
        return;
      }

      // Password changed successfully -> advance to privacy consent step
      setStep(2);
    } catch (err: any) {
      setPwError(err.message || 'Verbindungsfehler zum Server.');
    } finally {
      setPwLoading(false);
    }
  };

  const handlePrivacySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrivacyError(null);

    if (!acceptedConsent) {
      setPrivacyError(
        lang === 'de'
          ? 'Bitte bestätigen Sie die Datenschutzerklärung, um fortzufahren.'
          : 'Please accept the privacy policy to proceed.'
      );
      return;
    }

    if (!user?.id) return;

    setPrivacyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/accept-privacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPrivacyError(data.error || 'Fehler beim Bestätigen der Datenschutzerklärung.');
        setPrivacyLoading(false);
        return;
      }

      // Refresh profile so state updates in AuthContext and close modal
      await refreshProfile();
      onComplete();
    } catch (err: any) {
      setPrivacyError(err.message || 'Verbindungsfehler zum Server.');
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleSkipDemo = async () => {
    if (user) {
      const updated = { ...user, first_login_done: true, privacy_accepted: true };
      localStorage.setItem('fintax_user', JSON.stringify(updated));
    }
    // Attempt backend save silently if possible
    if (user?.id) {
      fetch(`${API_BASE}/auth/accept-privacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      }).catch(() => {});
    }
    onComplete();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: '#ffffff',
          borderRadius: '1.25rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Header Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: '#ffffff',
            padding: '1.75rem 2rem',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🔐</span>
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  opacity: 0.85,
                }}
              >
                FinTax Compliance Onboarding
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                {step === 1
                  ? (lang === 'de' ? 'Erst-Anmeldung: Passwort ändern' : 'First Login: Change Temporary Password')
                  : (lang === 'de' ? 'Datenschutz & DSGVO-Zustimmung' : 'Privacy Notice & GoBD Consent')}
              </h2>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.9 }}>
            {step === 1
              ? (lang === 'de'
                  ? 'Aus Sicherheitsgründen müssen Sie bei der ersten Anmeldung ein persönliches Kennwort festlegen.'
                  : 'For security reasons, German tax compliance requires setting a personal password on first login.')
              : (lang === 'de'
                  ? 'Bitte bestätigen Sie die Richtlinien zur revisionssicheren Belegarchivierung (GoBD & DSGVO).'
                  : 'Please review and accept our data protection & audit-proof tax retention policies.')}
          </p>

          {/* Stepper Dots */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                height: '5px',
                borderRadius: '9999px',
                background: '#ffffff',
                transition: 'all 0.3s ease',
              }}
            />
            <div
              style={{
                flex: 1,
                height: '5px',
                borderRadius: '9999px',
                background: step === 2 ? '#ffffff' : 'rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s ease',
              }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, marginLeft: '0.5rem', opacity: 0.9 }}>
              {lang === 'de'
                ? (step === 1 ? 'Schritt 1 / 2' : 'Schritt 2 / 2')
                : (step === 1 ? 'Step 1 / 2' : 'Step 2 / 2')}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '2rem' }}>
          {step === 1 ? (
            /* STEP 1: Change Password */
            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {pwError && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#fee2e2',
                    border: '1px solid #f87171',
                    borderRadius: '0.5rem',
                    color: '#991b1b',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span>⚠️</span>
                  <span>{pwError}</span>
                </div>
              )}

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: '#334155',
                    marginBottom: '0.375rem',
                  }}
                >
                  {lang === 'de' ? 'Aktuelles (Initiales) Kennwort' : 'Current (Temporary) Password'}
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={lang === 'de' ? 'Bspw. client123' : 'e.g. client123'}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <label
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: '#334155',
                    }}
                  >
                    {lang === 'de' ? 'Neues Kennwort (mind. 8 Zeichen)' : 'New Password (min. 8 characters)'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0284c7',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showPass
                      ? (lang === 'de' ? 'Ausblenden' : 'Hide')
                      : (lang === 'de' ? 'Anzeigen' : 'Show')}
                  </button>
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={lang === 'de' ? 'Sicheres Passwort eingeben' : 'Enter secure password'}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />

                {/* Password Strength Bar */}
                {newPassword.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', height: '4px' }}>
                      {[1, 2, 3, 4].map((bar) => (
                        <div
                          key={bar}
                          style={{
                            flex: 1,
                            borderRadius: '2px',
                            background:
                              strength >= bar
                                ? strength <= 1
                                  ? '#ef4444'
                                  : strength === 2
                                  ? '#f59e0b'
                                  : strength === 3
                                  ? '#3b82f6'
                                  : '#10b981'
                                : '#e2e8f0',
                            transition: 'all 0.2s',
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {strength <= 1 && (lang === 'de' ? 'Schwach' : 'Weak')}
                      {strength === 2 && (lang === 'de' ? 'Mittel' : 'Fair')}
                      {strength === 3 && (lang === 'de' ? 'Gut' : 'Good')}
                      {strength >= 4 && (lang === 'de' ? 'Sehr sicher ✓' : 'Strong ✓')}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: '#334155',
                    marginBottom: '0.375rem',
                  }}
                >
                  {lang === 'de' ? 'Neues Kennwort wiederholen' : 'Confirm New Password'}
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={lang === 'de' ? 'Passwort erneut eingeben' : 'Re-enter password'}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={logout}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    {lang === 'de' ? 'Abbrechen' : 'Cancel & Logout'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipDemo}
                    title="Skip password change and enter portal directly"
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      color: '#0284c7',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      padding: '0.375rem 0.625rem',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    ⚡ {lang === 'de' ? 'Direkt weiter (Demo)' : 'Skip & Enter Directly'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={pwLoading}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.75rem 1.75rem',
                    borderRadius: '0.5rem',
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    cursor: pwLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.3)',
                    opacity: pwLoading ? 0.7 : 1,
                  }}
                >
                  {pwLoading
                    ? (lang === 'de' ? 'Wird gespeichert...' : 'Saving...')
                    : (lang === 'de' ? 'Weiter zum Datenschutz →' : 'Continue to Privacy Policy →')}
                </button>
              </div>
            </form>
          ) : (
            /* STEP 2: Privacy Notice Acceptance */
            <form onSubmit={handlePrivacySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {privacyError && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#fee2e2',
                    border: '1px solid #f87171',
                    borderRadius: '0.5rem',
                    color: '#991b1b',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span>⚠️</span>
                  <span>{privacyError}</span>
                </div>
              )}

              {/* Scrollable Privacy Policy Summary Box */}
              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  padding: '1rem',
                  background: '#f8fafc',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.8125rem',
                  lineHeight: 1.6,
                  color: '#334155',
                }}
              >
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
                  {lang === 'de'
                    ? '1. Grundsätze der ordnungsmäßigen Buchführung (GoBD § 147 AO)'
                    : '1. Principles of proper accounting (GoBD § 147 AO)'}
                </div>
                <p style={{ margin: '0 0 0.75rem 0' }}>
                  {lang === 'de'
                    ? 'Alle von Ihnen hochgeladenen Rechnungen, Quittungen und Lohnunterlagen werden unveränderbar, revisionssicher und mit lückenlosem Prüfprotokoll für die gesetzliche Frist von 10 Jahren in zertifizierten Rechenzentren in Frankfurt am Main (Deutschland) archiviert.'
                    : 'All invoices, receipts, and payroll documents uploaded by you are stored immutably and audit-proof for the statutory 10-year period in certified data centers located in Frankfurt, Germany.'}
                </p>

                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
                  {lang === 'de'
                    ? '2. EU-Datenschutz-Grundverordnung (DSGVO Art. 6 & 13)'
                    : '2. EU General Data Protection Regulation (GDPR Art. 6 & 13)'}
                </div>
                <p style={{ margin: '0 0 0.75rem 0' }}>
                  {lang === 'de'
                    ? 'Ihre personenbezogenen Daten und Mitarbeiter-Stammdaten werden ausschließlich zur steuerlichen Beratung und Buchhaltung verarbeitet. Zugriff haben ausschließlich Sie als Mandant sowie die beauftragten Mitarbeiter der FinTax Steuerberatung.'
                    : 'Your personal data and employee master data are processed exclusively for tax accounting and consulting. Access is strictly isolated between clients.'}
                </p>

                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
                  {lang === 'de'
                    ? '3. Löschschutz & 2-Augen-Prinzip (Dual-Admin Approval)'
                    : '3. Deletion Protection & Dual-Admin Approval'}
                </div>
                <p style={{ margin: 0 }}>
                  {lang === 'de'
                    ? 'Zur Vermeidung von versehentlichem Datenverlust erfordert jede endgültige Beleglöschung die Freigabe von zwei unabhängigen Administratoren der Kanzlei.'
                    : 'To avoid accidental loss of tax documents, final document deletion strictly requires approval from two independent administrators.'}
                </p>
              </div>

              {/* Consent Checkbox */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  fontSize: '0.85rem',
                  color: '#1e293b',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  background: acceptedConsent ? '#f0fdf4' : 'transparent',
                  border: acceptedConsent ? '1px solid #bbf7d0' : '1px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={acceptedConsent}
                  onChange={(e) => setAcceptedConsent(e.target.checked)}
                  style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#0284c7' }}
                />
                <span style={{ lineHeight: 1.5 }}>
                  {lang === 'de' ? (
                    <>
                      Ich bestätige hiermit, dass ich die <strong>Datenschutzerklärung</strong> und die{' '}
                      <strong>GoBD-Aufbewahrungsrichtlinien</strong> zur Kenntnis genommen habe und der Verarbeitung
                      gemäß DSGVO zustimme.
                    </>
                  ) : (
                    <>
                      I hereby confirm that I have reviewed the <strong>Privacy Policy</strong> and{' '}
                      <strong>GoBD Tax Retention Guidelines</strong> and consent to data processing under EU GDPR.
                    </>
                  )}
                </span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    ← {lang === 'de' ? 'Zurück' : 'Back'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipDemo}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      color: '#0284c7',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      padding: '0.375rem 0.625rem',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    ⚡ {lang === 'de' ? 'Direkt weiter (Demo)' : 'Skip & Enter Directly'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!acceptedConsent || privacyLoading}
                  style={{
                    background: acceptedConsent ? '#16a34a' : '#94a3b8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.75rem 1.75rem',
                    borderRadius: '0.5rem',
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    cursor: acceptedConsent && !privacyLoading ? 'pointer' : 'not-allowed',
                    boxShadow: acceptedConsent ? '0 4px 6px -1px rgba(22, 163, 74, 0.3)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  {privacyLoading
                    ? (lang === 'de' ? 'Wird gespeichert...' : 'Saving...')
                    : (lang === 'de' ? 'Zustimmen & Portal betreten ✓' : 'Accept & Enter Portal ✓')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
