import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../context/AuthContext';
import type { Language } from '../translations';
import fintaxLogo from '../assets/fintax_logo.jpeg';
import { Menu } from 'lucide-react';

interface NavbarProps {
  lang: Language;
  onLanguageChange: (l: Language) => void;
  onOpenLogin: () => void;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  lang,
  onLanguageChange,
  onOpenLogin,
  onToggleMobileMenu,
}) => {
  const { user, activePortal, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return { label: 'Administrator', gradient: 'linear-gradient(135deg, #1d4ed8, #2563eb)', icon: '🛡️', glow: 'rgba(37,99,235,0.3)' };
      case 'STAFF':
        return { label: lang === 'de' ? 'Kanzlei / Prüfer' : 'Staff / Reviewer', gradient: 'linear-gradient(135deg, #1d4ed8, #2563eb)', icon: '📑', glow: 'rgba(37,99,235,0.3)' };
      case 'CLIENT':
        return { label: lang === 'de' ? 'Mandant' : 'Client', gradient: 'linear-gradient(135deg, #059669, #10b981)', icon: '👔', glow: 'rgba(16,185,129,0.3)' };
    }
  };

  return (
    <header
      className="fintax-navbar"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 80,
        padding: '0 1.25rem',
        height: '64px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}
    >
      <div style={{
        maxWidth: '100%',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '100%',
        gap: '0.75rem',
      }}>
        {/* ── Left Area: Hamburger / Brand / Breadcrumb ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
          {user && onToggleMobileMenu && (
            <button
              type="button"
              className="fintax-mobile-menu-btn"
              onClick={onToggleMobileMenu}
              title={lang === 'de' ? 'Menü öffnen' : 'Toggle menu'}
              aria-label="Toggle navigation menu"
            >
              <Menu size={20} />
            </button>
          )}

          {!user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <img
                src={fintaxLogo}
                alt="FinTax Consulting"
                style={{
                  height: '36px',
                  width: 'auto',
                  objectFit: 'contain',
                }}
              />
              <span style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: '1px solid #e2e8f0',
                padding: '2px 6px',
                borderRadius: '4px',
              }}>
                SKR03
              </span>
            </div>
          )}

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
              <img
                src={fintaxLogo}
                alt="FinTax Consulting"
                className="fintax-navbar-logo"
                style={{
                  height: '30px',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                  flexShrink: 0,
                }}
              />
              <span className="fintax-navbar-divider" style={{ color: '#cbd5e1' }}>/</span>
              <span
                className="fintax-navbar-title"
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#64748b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activePortal === 'ADMIN' ? 'Administrator Portal' : activePortal === 'STAFF' ? 'Kanzlei & Prüfer Portal' : 'Mandantenportal'}
              </span>
            </div>
          )}
        </div>

        {/* ── Right Controls ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {/* Compliance & Server Badge */}
          <div
            className="fintax-server-badge"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.3rem 0.65rem',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '9999px',
              fontSize: '0.6875rem',
              color: '#065f46',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
            }} />
            <span className="fintax-server-text">Server: Frankfurt (DSGVO)</span>
          </div>

          {/* ── Language Toggle (EN, DE, FA, AR) ── */}
          <div
            className="fintax-lang-switcher"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '9999px',
              border: '1px solid #e2e8f0',
              gap: '2px',
            }}
          >
            <span className="fintax-lang-globe" style={{ fontSize: '0.8rem', marginLeft: '6px', marginRight: '2px' }}>🌐</span>
            {(['en', 'de', 'fa', 'ar'] as const).map((l) => {
              const isActive = lang === l;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => onLanguageChange(l)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.75rem',
                    fontWeight: isActive ? 800 : 600,
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    background: isActive ? (activePortal === 'CLIENT' ? '#d4a359' : '#2563eb') : 'transparent',
                    color: isActive ? (activePortal === 'CLIENT' ? '#0b1a30' : '#ffffff') : '#64748b',
                    boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                    transition: 'all 0.15s',
                    textTransform: 'uppercase',
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>

          {/* ── User Profile / Login ── */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', position: 'relative' }}>
              {/* Avatar + Name */}
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '0.375rem 0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#f1f5f9';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#f8fafc';
                }}
              >
                {/* Avatar circle */}
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="fintax-user-profile-meta" style={{ textAlign: 'left' }}>
                  <div style={{
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    lineHeight: 1.2,
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {user.name.split(' ').slice(0, 2).join(' ')}
                  </div>
                  <div style={{
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    color: '#2563eb',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                  }}>
                    {getRoleBadge(user.role).label}
                  </div>
                </div>
                <svg className="fintax-user-profile-meta" width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: '0.25rem', opacity: 0.5, transition: 'transform 0.2s', transform: showProfileMenu ? 'rotate(180deg)' : 'rotate(0)' }}>
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showProfileMenu && (
                <>
                  <div
                    onClick={() => setShowProfileMenu(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '0.5rem',
                    minWidth: '220px',
                    boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.12), 0 4px 10px rgba(15, 23, 42, 0.04)',
                    zIndex: 100,
                    animation: 'fadeIn 0.15s ease-out',
                  }}>
                    <div style={{
                      padding: '0.75rem 0.875rem',
                      borderBottom: '1px solid #f1f5f9',
                      marginBottom: '0.375rem',
                    }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a' }}>{user.name}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '2px' }}>{user.email}</div>
                      {user.clientNumber && (
                        <div style={{ fontSize: '0.6875rem', color: '#2563eb', fontWeight: 600, marginTop: '2px' }}>
                          Mandant: {user.clientNumber}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { logout(); setShowProfileMenu(false); }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.625rem 0.875rem',
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderRadius: '8px',
                        transition: 'background 0.15s',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#fef2f2'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      {lang === 'de' ? 'Abmelden' : 'Sign Out'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#1d4ed8';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#2563eb';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              {lang === 'de' ? 'Anmelden' : 'Sign In'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
