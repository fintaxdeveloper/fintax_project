import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Language } from '../translations';
import {
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  X,
  Eye,
  EyeOff,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  FileCheck2,
  Landmark,
} from 'lucide-react';
import fintaxLogo from '../assets/fintax_logo.jpeg';

interface LoginModalProps {
  lang: Language;
  onClose?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ lang, onClose }) => {
  const { login, verifyOtp, resendOtp } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA State
  const [step, setStep] = useState<'CREDENTIALS' | 'OTP'>('CREDENTIALS');
  const [tempToken, setTempToken] = useState<string>('');
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [demoOtp, setDemoOtp] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [resending, setResending] = useState(false);

  // Carousel State
  const [activeSlide, setActiveSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const slides = [
    {
      id: 'ai-ocr',
      badge: lang === 'de' ? 'KI-Belegprüfung (SKR03)' : 'AI Accounting Engine',
      badgeColor: '#059669',
      badgeBg: '#ecfdf5',
      badgeBorder: '#a7f3d0',
      bgGradient: 'linear-gradient(145deg, #f0fdf4 0%, #ecfdf5 45%, #dcfce7 100%)',
      title: lang === 'de' ? 'Intelligente Belegprüfung' : 'Make your work easier & organized',
      subtext: lang === 'de'
        ? 'Belege hochladen, SKR03-Konten automatisch zuweisen und fehlerfrei nach DATEV exportieren.'
        : 'Simplify your accounting and boost productivity with FinTax Tax Advisory Cloud.',
      component: (
        <div style={{ position: 'relative', width: '100%', maxWidth: 330, margin: '0 auto' }}>
          {/* Floating Avatar Badge Top */}
          <div
            style={{
              position: 'absolute',
              top: -16,
              left: 20,
              background: '#ffffff',
              borderRadius: 999,
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 8px 20px -4px rgba(16, 185, 129, 0.25)',
              border: '1px solid #bbf7d0',
              zIndex: 3,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '0.7rem',
                fontWeight: 800,
              }}
            >
              ✓
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46' }}>
              99.8% KI-Genauigkeit
            </span>
          </div>

          {/* Main Visual Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 22,
              padding: '24px 20px 20px',
              boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(226, 232, 240, 0.8)',
              marginTop: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Landmark size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                    Kontoauszug 11/2024
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    Frankfurter Volksbank eG
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  background: '#f0fdf4',
                  color: '#15803d',
                  border: '1px solid #bbf7d0',
                  padding: '3px 8px',
                  borderRadius: 999,
                }}
              >
                GoBD Konform
              </span>
            </div>

            <div
              style={{
                background: '#f8fafc',
                borderRadius: 12,
                padding: '12px 14px',
                border: '1px solid #e2e8f0',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Saldo Gesamt:</span>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>313.934,80 €</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600, marginTop: 3 }}>
                ✓ SKR03: 1200 Bank • 77 Buchungen
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <span
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  padding: '6px 8px',
                  borderRadius: 8,
                }}
              >
                DATEV EXTF
              </span>
              <span
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: '#f1f5f9',
                  color: '#334155',
                  padding: '6px 8px',
                  borderRadius: 8,
                }}
              >
                Agenda Ready
              </span>
            </div>
          </div>

          {/* Floating Pill Bottom */}
          <div
            style={{
              position: 'absolute',
              bottom: -14,
              right: 16,
              background: '#ffffff',
              borderRadius: 999,
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 8px 20px -4px rgba(37, 99, 235, 0.25)',
              border: '1px solid #bfdbfe',
              zIndex: 3,
            }}
          >
            <Sparkles size={14} color="#2563eb" />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af' }}>
              84% Automatisiert
            </span>
          </div>
        </div>
      ),
    },


    {
      id: 'bank-rec',
      badge: lang === 'de' ? 'Saldenabstimmung' : 'Bank Reconciliation',
      badgeColor: '#2563eb',
      badgeBg: '#eff6ff',
      badgeBorder: '#bfdbfe',
      bgGradient: 'linear-gradient(145deg, #eff6ff 0%, #f0f9ff 45%, #dbeafe 100%)',
      title: lang === 'de' ? 'Automatischer Bankabgleich' : 'Instant Bank Reconciliation',
      subtext: lang === 'de'
        ? 'Tausende Kontobewegungen automatisch matchen und Differenzen auf Knopfdruck klären.'
        : 'Reconcile thousands of bank movements automatically with zero discrepancies.',
      component: (
        <div style={{ position: 'relative', width: '100%', maxWidth: 330, margin: '0 auto' }}>
          {/* Main Visual Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 22,
              padding: '24px 20px 20px',
              boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(226, 232, 240, 0.8)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: '#dbeafe',
                    color: '#1d4ed8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FileCheck2 size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                    Saldenprüfung
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    CAMT.053 & MT940
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  background: '#ecfdf5',
                  color: '#059669',
                  border: '1px solid #a7f3d0',
                  padding: '3px 8px',
                  borderRadius: 999,
                }}
              >
                100% Match
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  borderRadius: 10,
                  fontSize: '0.75rem',
                }}
              >
                <span style={{ color: '#64748b' }}>Einnahmen (Haben):</span>
                <strong style={{ color: '#059669' }}>+149.800,00 €</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#f8fafc',
                  borderRadius: 10,
                  fontSize: '0.75rem',
                }}
              >
                <span style={{ color: '#64748b' }}>Ausgaben (Soll):</span>
                <strong style={{ color: '#dc2626' }}>-159.338,24 €</strong>
              </div>
            </div>

            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: '#065f46', fontWeight: 600 }}>Differenz:</span>
              <strong style={{ fontSize: '0.85rem', color: '#047857' }}>0,00 € (Abgestimmt)</strong>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'vault-folders',
      badge: lang === 'de' ? 'GoBD 4-Ordner-Archiv' : 'GoBD Audit-Proof Vault',
      badgeColor: '#7c3aed',
      badgeBg: '#f5f3ff',
      badgeBorder: '#ddd6fe',
      bgGradient: 'linear-gradient(145deg, #f5f3ff 0%, #faf5ff 45%, #ede9fe 100%)',
      title: lang === 'de' ? 'Revisionssicheres Archiv' : 'Structured Digital Vault',
      subtext: lang === 'de'
        ? 'Revisionssichere Archivierung für Mandanten und Steuerberater nach deutschem Recht.'
        : 'Audit-proof German tax archive. Structured, indexed, and Steuerberater-ready.',
      component: (
        <div style={{ position: 'relative', width: '100%', maxWidth: 330, margin: '0 auto' }}>
          {/* Main Visual Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 22,
              padding: '24px 20px 20px',
              boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(226, 232, 240, 0.8)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: '#ede9fe',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FolderTree size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                    FinTax Kanzlei-Ordner
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    10-Jahre GoBD Speicherfrist
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  background: '#f5f3ff',
                  color: '#6d28d9',
                  border: '1px solid #ddd6fe',
                  padding: '3px 8px',
                  borderRadius: 999,
                }}
              >
                Revisionssicher
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
              <div style={{ background: '#f8fafc', padding: '10px 10px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a' }}>📁 00_Stammdaten</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>Gründung & Notar</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px 10px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a' }}>📁 01_FiBu</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>Bank & Belege</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px 10px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a' }}>📁 02_Lohn</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>Monatliche Abrechnung</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px 10px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a' }}>📁 03_Schriftverkehr</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>Finanzamt & KI</div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // Auto-advance carousel every 4.5 seconds
  useEffect(() => {
    if (isHovered) return;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isHovered, slides.length]);

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

  const currentSlide = slides[activeSlide];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1.5rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      {/* ── MAIN 2-COLUMN MODAL CARD ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 32,
          boxShadow: '0 30px 80px -15px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.9)',
          width: '100%',
          maxWidth: 960,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          minHeight: 560,
        }}
      >
        {/* Close Button Top-Right */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title={lang === 'de' ? 'Schließen' : 'Close'}
            style={{
              position: 'absolute',
              top: '1.25rem',
              right: '1.25rem',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              cursor: 'pointer',
              zIndex: 20,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.color = '#0f172a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            <X size={18} />
          </button>
        )}

        {/* ── LEFT COLUMN: LOGIN FORM ── */}
        <div
          style={{
            flex: '1 1 380px',
            padding: '3rem 3rem 2.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {/* Logo on Top (Centered & Prominent) */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.25rem' }}>
            <img
              src={fintaxLogo}
              alt="FinTax Consulting"
              style={{
                height: 62,
                width: 'auto',
                maxWidth: '270px',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* Heading & Subtitle */}
          <div style={{ marginBottom: '1.75rem' }}>
            <h1
              style={{
                margin: 0,
                fontSize: '2rem',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.03em',
              }}
            >
              {step === 'OTP'
                ? (lang === 'de' ? 'Sicherheitscode' : 'Security Code')
                : (lang === 'de' ? 'Welcome back!' : 'Welcome back!')}
            </h1>
            <p
              style={{
                margin: '0.5rem 0 0 0',
                fontSize: '0.875rem',
                color: '#64748b',
                lineHeight: 1.5,
              }}
            >
              {step === 'OTP'
                ? (lang === 'de' ? `6-stelligen Code an ${maskedEmail} gesendet` : `One-time code sent to ${maskedEmail}`)
                : (lang === 'de'
                  ? 'Verwalten Sie Ihre Buchhaltung und Steuerbelege mit FinTax.'
                  : "Simplify your tax workflow and boost your productivity with FinTax's Cloud.")}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                background: '#fef2f2',
                color: '#991b1b',
                padding: '0.75rem 1rem',
                borderRadius: 14,
                fontSize: '0.85rem',
                marginBottom: '1.25rem',
                border: '1px solid #fecaca',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: CREDENTIALS */}
          {step === 'CREDENTIALS' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Field 1: Email / Username */}
              <div>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={lang === 'de' ? 'Benutzername oder E-Mail' : 'Username or Email'}
                  required
                  style={{
                    width: '100%',
                    padding: '14px 22px',
                    borderRadius: 999,
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.92rem',
                    fontWeight: 500,
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0f172a';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15, 23, 42, 0.08)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Field 2: Password with Eye Button */}
              <div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={lang === 'de' ? 'Passwort' : 'Password'}
                    required
                    style={{
                      width: '100%',
                      padding: '14px 48px 14px 22px',
                      borderRadius: 999,
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.92rem',
                      fontWeight: 500,
                      color: '#0f172a',
                      backgroundColor: '#ffffff',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'all 0.15s ease',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#0f172a';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15, 23, 42, 0.08)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    title={showPassword ? (lang === 'de' ? 'Passwort verbergen' : 'Hide password') : (lang === 'de' ? 'Passwort anzeigen' : 'Show password')}
                    style={{
                      position: 'absolute',
                      right: 18,
                      background: 'none',
                      border: 'none',
                      padding: 4,
                      cursor: 'pointer',
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>

              {/* Forgot Password Link */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
                <a
                  href="#forgot"
                  onClick={(e) => { e.preventDefault(); alert(lang === 'de' ? 'Bitte kontaktieren Sie Ihren Kanzlei-Administrator.' : 'Please contact your accounting administrator.'); }}
                  style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
                >
                  {lang === 'de' ? 'Passwort vergessen?' : 'Forgot Password?'}
                </a>
              </div>

              {/* Bold Dark Pill Login Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  padding: '14px 24px',
                  borderRadius: 999,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 6,
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = '#1e293b';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.35)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#0f172a';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(15, 23, 42, 0.25)';
                }}
              >
                {loading ? (
                  lang === 'de' ? 'Wird angemeldet...' : 'Signing in...'
                ) : (
                  <span>{lang === 'de' ? 'Anmelden' : 'Login'}</span>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: 2FA EMAIL OTP VERIFICATION */}
          {step === 'OTP' && (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 16,
                  padding: '1rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>📧</div>
                <div style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 700 }}>
                  {lang === 'de' ? 'Einmalcode generiert' : 'Security Code Sent'}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#15803d' }}>
                  {demoOtp && (
                    <span style={{ fontWeight: 700 }}>
                      🔑 Demo OTP: <span style={{ letterSpacing: '0.2em' }}>{demoOtp}</span>
                    </span>
                  )}
                </p>
              </div>

              <div>
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
                    padding: '12px',
                    borderRadius: 999,
                    border: '2px solid #0f172a',
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    letterSpacing: '0.3em',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    color: '#0f172a',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  padding: '14px 24px',
                  borderRadius: 999,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {loading
                  ? (lang === 'de' ? 'Wird geprüft...' : 'Verifying...')
                  : (lang === 'de' ? 'Bestätigen & Weiter' : 'Verify & Continue')}
                <ArrowRight size={17} />
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                <button
                  type="button"
                  onClick={() => setStep('CREDENTIALS')}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  ← {lang === 'de' ? 'Zurück' : 'Back'}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                >
                  <RefreshCw size={12} className={resending ? 'animate-spin' : ''} style={{ display: 'inline', marginRight: 4 }} />
                  {lang === 'de' ? 'Code erneut senden' : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* Footer Security Badge */}
          <div
            style={{
              marginTop: '2rem',
              paddingTop: '1rem',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.75rem',
              color: '#94a3b8',
            }}
          >
            <ShieldCheck size={14} color="#10b981" />
            <span>GoBD & DSGVO zertifiziert • Serverstandort Frankfurt (DE)</span>
          </div>
        </div>

        {/* ── RIGHT COLUMN: POSTER CAROUSEL ── */}
        <div
          style={{
            flex: '1 1 420px',
            padding: '1.25rem',
            display: 'flex',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            style={{
              width: '100%',
              borderRadius: 24,
              background: currentSlide.bgGradient,
              padding: '2.5rem 2rem 2rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
              transition: 'background 0.5s ease',
            }}
          >
            {/* Top Carousel Badge */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span
                style={{
                  background: currentSlide.badgeBg,
                  color: currentSlide.badgeColor,
                  border: `1px solid ${currentSlide.badgeBorder}`,
                  borderRadius: 999,
                  padding: '4px 14px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: currentSlide.badgeColor }} />
                {currentSlide.badge}
              </span>
            </div>

            {/* Middle Feature Showcase Graphic */}
            <div style={{ margin: 'auto 0', padding: '1.5rem 0' }}>
              {currentSlide.component}
            </div>

            {/* Bottom Caption & Pagination Dots */}
            <div>
              {/* Pagination Dots */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                {slides.map((s, idx) => {
                  const isActive = idx === activeSlide;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSlide(idx)}
                      title={`Slide ${idx + 1}`}
                      style={{
                        height: 7,
                        width: isActive ? 26 : 7,
                        borderRadius: 999,
                        background: isActive ? '#0f172a' : '#cbd5e1',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  );
                })}
              </div>

              {/* Title & Subtext */}
              <div style={{ textAlign: 'center' }}>
                <h3
                  style={{
                    margin: '0 0 6px 0',
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {currentSlide.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.82rem',
                    color: '#475569',
                    lineHeight: 1.5,
                    maxWidth: 340,
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                >
                  {currentSlide.subtext}
                </p>
              </div>
            </div>

            {/* Quick Next/Prev Arrow Controls on Poster */}
            <button
              type="button"
              onClick={() => setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length)}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(4px)',
                border: 'none',
                borderRadius: '50%',
                width: 30,
                height: 30,
                display: isHovered ? 'flex' : 'none',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0f172a',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setActiveSlide((prev) => (prev + 1) % slides.length)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(4px)',
                border: 'none',
                borderRadius: '50%',
                width: 30,
                height: 30,
                display: isHovered ? 'flex' : 'none',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0f172a',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
