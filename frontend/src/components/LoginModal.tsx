import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../context/AuthContext';
import type { Language } from '../translations';
import { ShieldCheck, ArrowRight, RefreshCw, X } from 'lucide-react';

interface LoginModalProps {
  lang: Language;
  onClose?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ lang, onClose }) => {
  const { login, verifyOtp, resendOtp } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('CLIENT');
  const [identifier, setIdentifier] = useState('KD-10042');
  const [password, setPassword] = useState('client123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setError(null);
    if (role === 'CLIENT') {
      setIdentifier('KD-10042');
      setPassword('client123');
    } else if (role === 'STAFF') {
      setIdentifier('accountant@fintax.de');
      setPassword('staff123');
    } else if (role === 'ADMIN') {
      setIdentifier('admin@fintax.de');
      setPassword('admin123');
    }
  };

  // 2FA State
  const [step, setStep] = useState<'CREDENTIALS' | 'OTP'>('CREDENTIALS');
  const [tempToken, setTempToken] = useState<string>('');
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [demoOtp, setDemoOtp] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await login(identifier, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || (lang === 'de' ? 'Anmeldung fehlgeschlagen' : 'Login failed'));
      return;
    }

    if (res.requires2FA && res.tempToken) {
      setStep('OTP');
      setTempToken(res.tempToken);
      setMaskedEmail(res.maskedEmail || '');
      setDemoOtp(res.demoOtp || '');
      setOtpInput(res.demoOtp || ''); // prefill for easy test
    } else {
      if (onClose) onClose();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput.trim()) {
      setError(lang === 'de' ? 'Bitte geben Sie den 6-stelligen Code ein.' : 'Please enter the 6-digit code.');
      return;
    }

    setError(null);
    setLoading(true);

    const res = await verifyOtp(tempToken, otpInput.trim());
    setLoading(false);

    if (!res.success) {
      setError(res.error || (lang === 'de' ? 'Code ungültig' : 'Invalid code'));
      return;
    }

    if (onClose) onClose();
  };

  const handleResend = async () => {
    if (!tempToken) return;
    setResending(true);
    const res = await resendOtp(tempToken);
    setResending(false);
    if (res.success && res.demoOtp) {
      setDemoOtp(res.demoOtp);
      setOtpInput(res.demoOtp);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1.5rem',
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '1.25rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        width: '100%',
        maxWidth: '480px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        position: 'relative',
      }}>
        {/* Close Button if applicable */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '9999px',
              padding: '0.4rem',
              color: '#ffffff',
              cursor: 'pointer',
              zIndex: 10,
            }}
          >
            <X size={18} />
          </button>
        )}

        {/* Modal Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
          padding: '2rem 1.75rem',
          color: '#ffffff',
          textAlign: 'center',
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.75rem' }}>🏛️</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.05em' }}>FINTAX</span>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
            {step === 'OTP'
              ? (lang === 'de' ? 'Zwei-Faktor-Authentifizierung (2FA)' : 'Two-Factor Authentication (2FA)')
              : (lang === 'de' ? 'FinTax Anmeldeportal' : 'FinTax Access Portal')}
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>
            {step === 'OTP'
              ? (lang === 'de' ? `Einmalcode an ${maskedEmail} gesendet` : `One-time code sent to ${maskedEmail}`)
              : (lang === 'de' ? 'Mandantennummer oder E-Mail eingeben' : 'Enter client number or email')}
          </p>
        </div>

        <div style={{ padding: '1.75rem' }}>
          {error && (
            <div style={{
              background: '#fef2f2',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
              border: '1px solid #fecaca',
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* STEP 1: CREDENTIALS */}
          {step === 'CREDENTIALS' && (
            <>
              {/* Quick Demo Access Buttons with Clear Selected State */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#64748b',
                  marginBottom: '0.625rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>{lang === 'de' ? '⚡ Rolle auswählen (Demo-Zugänge):' : '⚡ Select Role (Demo Accounts):'}</span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#0284c7' }}>
                    {selectedRole === 'CLIENT' ? 'Client' : (selectedRole === 'STAFF' ? 'Staff' : 'Admin')}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem' }}>
                  {/* CLIENT ROLE BUTTON */}
                  <button
                    type="button"
                    onClick={() => handleSelectRole('CLIENT')}
                    disabled={loading}
                    style={{
                      background: selectedRole === 'CLIENT' ? '#e0f2fe' : '#f8fafc',
                      border: selectedRole === 'CLIENT' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      borderRadius: '0.625rem',
                      padding: '0.625rem 0.25rem',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: selectedRole === 'CLIENT' ? '#0369a1' : '#334155',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: selectedRole === 'CLIENT' ? '0 0 0 3px rgba(2, 132, 199, 0.25)' : 'none',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                      <span>👤</span>
                      <span>{lang === 'de' ? 'Mandant' : 'Client'}</span>
                    </div>
                    <div style={{
                      fontSize: '0.6875rem',
                      marginTop: '0.2rem',
                      color: selectedRole === 'CLIENT' ? '#0284c7' : '#64748b',
                      fontWeight: selectedRole === 'CLIENT' ? 800 : 500,
                    }}>
                      {selectedRole === 'CLIENT' ? (lang === 'de' ? '✓ Ausgewählt' : '✓ Selected') : 'KD-10042'}
                    </div>
                  </button>

                  {/* STAFF ROLE BUTTON */}
                  <button
                    type="button"
                    onClick={() => handleSelectRole('STAFF')}
                    disabled={loading}
                    style={{
                      background: selectedRole === 'STAFF' ? '#dbeafe' : '#f8fafc',
                      border: selectedRole === 'STAFF' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      borderRadius: '0.625rem',
                      padding: '0.625rem 0.25rem',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: selectedRole === 'STAFF' ? '#1d4ed8' : '#334155',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: selectedRole === 'STAFF' ? '0 0 0 3px rgba(37, 99, 235, 0.25)' : 'none',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                      <span>📑</span>
                      <span>{lang === 'de' ? 'Kanzlei' : 'Staff'}</span>
                    </div>
                    <div style={{
                      fontSize: '0.6875rem',
                      marginTop: '0.2rem',
                      color: selectedRole === 'STAFF' ? '#1d4ed8' : '#2563eb',
                      fontWeight: selectedRole === 'STAFF' ? 800 : 500,
                    }}>
                      {selectedRole === 'STAFF' ? (lang === 'de' ? '✓ Ausgewählt (2FA)' : '✓ Selected (2FA)') : '+ 2FA OTP'}
                    </div>
                  </button>

                  {/* ADMIN ROLE BUTTON */}
                  <button
                    type="button"
                    onClick={() => handleSelectRole('ADMIN')}
                    disabled={loading}
                    style={{
                      background: selectedRole === 'ADMIN' ? '#fce7f3' : '#f8fafc',
                      border: selectedRole === 'ADMIN' ? '2px solid #db2777' : '1px solid #cbd5e1',
                      borderRadius: '0.625rem',
                      padding: '0.625rem 0.25rem',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: selectedRole === 'ADMIN' ? '#9d174d' : '#334155',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: selectedRole === 'ADMIN' ? '0 0 0 3px rgba(219, 39, 119, 0.25)' : 'none',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                      <span>🛡️</span>
                      <span>{lang === 'de' ? 'Admin' : 'Admin'}</span>
                    </div>
                    <div style={{
                      fontSize: '0.6875rem',
                      marginTop: '0.2rem',
                      color: selectedRole === 'ADMIN' ? '#9d174d' : '#db2777',
                      fontWeight: selectedRole === 'ADMIN' ? 800 : 500,
                    }}>
                      {selectedRole === 'ADMIN' ? (lang === 'de' ? '✓ Ausgewählt' : '✓ Selected') : '+ 2FA OTP'}
                    </div>
                  </button>
                </div>

                {/* Selected Role Info Banner */}
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  lineHeight: 1.4,
                  background: selectedRole === 'CLIENT' ? '#f0f9ff' : (selectedRole === 'STAFF' ? '#eff6ff' : '#fdf2f8'),
                  border: selectedRole === 'CLIENT' ? '1px solid #bae6fd' : (selectedRole === 'STAFF' ? '1px solid #bfdbfe' : '1px solid #fbcfe8'),
                  color: selectedRole === 'CLIENT' ? '#0369a1' : (selectedRole === 'STAFF' ? '#1e40af' : '#9d174d'),
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <span>{selectedRole === 'CLIENT' ? '🏢' : (selectedRole === 'STAFF' ? '📊' : '🛡️')}</span>
                  <span>
                    {selectedRole === 'CLIENT' && (lang === 'de'
                      ? 'Mandant ausgewählt: Belege einreichen, Lohn verwalten & 4-Ordner-Struktur.'
                      : 'Client Role Selected: Upload documents, payroll & 4-folder vault.')}
                    {selectedRole === 'STAFF' && (lang === 'de'
                      ? 'Kanzlei ausgewählt: KI-Belegprüfung, Saldenabstimmung & 2FA E-Mail Code.'
                      : 'Staff Role Selected: AI document review, bank reconciliation & 2FA OTP.')}
                    {selectedRole === 'ADMIN' && (lang === 'de'
                      ? 'Administrator ausgewählt: Vollzugriff, 2-Admin Löschfreigaben & Audit-Logs.'
                      : 'Administrator Role Selected: Full system access & 2-Admin deletion approvals.')}
                  </span>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                    {lang === 'de' ? 'E-Mail oder Mandantennummer' : 'Email or Client Number'}
                  </label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={lang === 'de' ? 'z.B. KD-10042 oder staff@fintax.de' : 'e.g. KD-10042 or staff@fintax.de'}
                    required
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

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                    {lang === 'de' ? 'Passwort' : 'Password'}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
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

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    background: selectedRole === 'CLIENT' ? '#0284c7' : (selectedRole === 'STAFF' ? '#1d4ed8' : '#be185d'),
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s',
                  }}
                >
                  {loading ? (
                    lang === 'de' ? 'Wird geprüft...' : 'Authenticating...'
                  ) : (
                    <>
                      <span>
                        {lang === 'de'
                          ? (selectedRole === 'CLIENT' ? 'Als Mandant anmelden' : (selectedRole === 'STAFF' ? 'Als Kanzlei (2FA) anmelden' : 'Als Administrator anmelden'))
                          : (selectedRole === 'CLIENT' ? 'Log In as Client' : (selectedRole === 'STAFF' ? 'Log In as Staff (2FA)' : 'Log In as Administrator'))}
                      </span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* STEP 2: 2FA EMAIL OTP VERIFICATION */}
          {step === 'OTP' && (
            <form onSubmit={handleVerifyOtp}>
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '1.25rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>📧</div>
                <div style={{ fontSize: '0.875rem', color: '#166534', fontWeight: 600 }}>
                  {lang === 'de' ? 'Einmalcode (OTP) generiert' : 'One-Time Security Code Generated'}
                </div>
                <p style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '0.75rem', color: '#15803d' }}>
                  {lang === 'de'
                    ? `FinTax Sicherheitsstandard: Ein 6-stelliger Code wurde an ${maskedEmail} gesendet.`
                    : `FinTax Security Standard: A 6-digit code was sent to ${maskedEmail}.`}
                </p>

                {demoOtp && (
                  <div style={{
                    display: 'inline-block',
                    background: '#dcfce7',
                    border: '1px dashed #22c55e',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.8125rem',
                    color: '#15803d',
                    fontWeight: 700,
                  }}>
                    🔑 Demo OTP: <span style={{ letterSpacing: '0.2em' }}>{demoOtp}</span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem', textAlign: 'center' }}>
                  {lang === 'de' ? '6-Stelligen Einmalcode eingeben' : 'Enter 6-Digit Code'}
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="123456"
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '2px solid #2563eb',
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    letterSpacing: '0.3em',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                }}
              >
                {loading
                  ? (lang === 'de' ? 'Wird geprüft...' : 'Verifying...')
                  : (lang === 'de' ? 'Code bestätigen & Anmelden' : 'Verify Code & Access')}
                <ShieldCheck size={18} />
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setStep('CREDENTIALS')}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  ← {lang === 'de' ? 'Zurück zur Anmeldung' : 'Back to login'}
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontWeight: 600,
                  }}
                >
                  <RefreshCw size={12} className={resending ? 'animate-spin' : ''} />
                  {lang === 'de' ? 'Code erneut senden' : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* Privacy & GoBD Note */}
          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            fontSize: '0.75rem',
            color: '#94a3b8',
          }}>
            <ShieldCheck size={14} color="#10b981" />
            <span>{lang === 'de' ? 'DSGVO & GoBD-konforme Authentifizierung in Deutschland' : 'GDPR & GoBD-compliant security hosted in Germany'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
