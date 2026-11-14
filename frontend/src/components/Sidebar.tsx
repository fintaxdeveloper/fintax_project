import React from 'react';
import { useAuth } from '../context/AuthContext';
import type { Language } from '../translations';
import fintaxLogo from '../assets/fintax_logo.jpeg';
import {
  Users,
  FolderTree,
  ShieldAlert,
  FileCheck2,
  Receipt,
  Landmark,
  Mail,
  UserCog,
  LogOut,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Building2,
} from 'lucide-react';

export type ClientTabType = 'OVERVIEW' | 'FORMATION' | 'ACCOUNTING' | 'PAYROLL' | 'CORRESPONDENCE' | 'VAULT';

interface SidebarProps {
  lang: Language;
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Admin navigation state
  adminTab?: 'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT';
  onAdminTabChange?: (tab: 'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT') => void;
  // Staff navigation state
  staffTab?: 'INVOICES' | 'BANK' | 'CORR' | 'PAYROLL' | 'VAULT';
  onStaffTabChange?: (tab: 'INVOICES' | 'BANK' | 'CORR' | 'PAYROLL' | 'VAULT') => void;
  // Client navigation state
  clientTab?: ClientTabType | 'DOCS';
  onClientTabChange?: (tab: ClientTabType) => void;
  // Stats for badge counts
  pendingReviewCount?: number;
  pendingApprovalsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  lang,
  collapsed,
  onToggleCollapse,
  adminTab = 'USERS',
  onAdminTabChange,
  staffTab = 'INVOICES',
  onStaffTabChange,
  clientTab = 'DOCS',
  onClientTabChange,
  pendingReviewCount = 0,
  pendingApprovalsCount = 0,
}) => {
  const { user, activePortal, switchPortal, logout } = useAuth();

  if (!user) return null;

  const roleBadgeInfo = {
    ADMIN: { label: 'Administrator', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    STAFF: { label: lang === 'de' ? 'Kanzlei / Prüfer' : 'Staff / Auditor', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    CLIENT: { label: lang === 'de' ? 'Mandant' : 'Client', bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  }[user.role];

  return (
    <aside
      style={{
        width: collapsed ? '80px' : '260px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 90,
        boxShadow: '2px 0 12px rgba(15, 23, 42, 0.03)',
        flexShrink: 0,
      }}
    >
      {/* ── Top Header / Brand Logo ── */}
      <div
        style={{
          padding: collapsed ? '1.25rem 0.5rem' : '1.25rem 1.25rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          backgroundColor: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          {!collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <img
                src={fintaxLogo}
                alt="FinTax Consulting"
                style={{
                  height: '38px',
                  width: 'auto',
                  maxWidth: '175px',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
              <span
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                  padding: '2px 5px',
                  borderRadius: '4px',
                  letterSpacing: '0.04em',
                }}
              >
                SKR03
              </span>
            </div>
          ) : (
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              }}
            >
              <img
                src={fintaxLogo}
                alt="FinTax"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '6px',
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            title={lang === 'de' ? 'Seitenleiste einklappen' : 'Collapse sidebar'}
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* ── Role & Portal Switcher ── */}
      {!collapsed && (user.role === 'ADMIN' || user.role === 'STAFF') && (
        <div style={{ padding: '0.75rem 1rem 0.25rem 1rem' }}>
          <div
            style={{
              backgroundColor: '#f1f5f9',
              borderRadius: '8px',
              padding: '3px',
              display: 'flex',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => switchPortal('CLIENT')}
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: '0.75rem',
                fontWeight: activePortal === 'CLIENT' ? 700 : 500,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activePortal === 'CLIENT' ? '#ffffff' : 'transparent',
                color: activePortal === 'CLIENT' ? '#2563eb' : '#64748b',
                boxShadow: activePortal === 'CLIENT' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              Mandant
            </button>
            <button
              type="button"
              onClick={() => switchPortal('STAFF')}
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: '0.75rem',
                fontWeight: activePortal === 'STAFF' ? 700 : 500,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activePortal === 'STAFF' ? '#ffffff' : 'transparent',
                color: activePortal === 'STAFF' ? '#2563eb' : '#64748b',
                boxShadow: activePortal === 'STAFF' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              Kanzlei
            </button>
            {user.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => switchPortal('ADMIN')}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  fontSize: '0.75rem',
                  fontWeight: activePortal === 'ADMIN' ? 700 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: activePortal === 'ADMIN' ? '#ffffff' : 'transparent',
                  color: activePortal === 'ADMIN' ? '#2563eb' : '#64748b',
                  boxShadow: activePortal === 'ADMIN' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                Admin
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Navigation Menu Section ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {!collapsed && (
          <div
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '0.5rem 0.75rem 0.25rem 0.75rem',
            }}
          >
            {activePortal === 'ADMIN'
              ? (lang === 'de' ? 'Administration' : 'Administration')
              : activePortal === 'STAFF'
              ? (lang === 'de' ? 'Kanzlei Module' : 'Staff Modules')
              : (lang === 'de' ? 'Mein Mandant' : 'Client Modules')}
          </div>
        )}

        {/* ── ADMIN NAV ITEMS ── */}
        {activePortal === 'ADMIN' && (
          <>
            <NavItem
              icon={<Users size={18} />}
              label={lang === 'de' ? 'Benutzerverwaltung' : 'User Management'}
              active={adminTab === 'USERS'}
              collapsed={collapsed}
              onClick={() => onAdminTabChange && onAdminTabChange('USERS')}
            />
            <NavItem
              icon={<UserCog size={18} />}
              label={lang === 'de' ? 'Zuweisungen' : 'Assignments'}
              active={adminTab === 'ASSIGNMENTS'}
              collapsed={collapsed}
              onClick={() => onAdminTabChange && onAdminTabChange('ASSIGNMENTS')}
            />
            <NavItem
              icon={<FolderTree size={18} />}
              label={lang === 'de' ? 'Ordner-Struktur' : 'Folder Templates'}
              active={adminTab === 'FOLDERS'}
              collapsed={collapsed}
              onClick={() => onAdminTabChange && onAdminTabChange('FOLDERS')}
            />
            <NavItem
              icon={<ShieldAlert size={18} />}
              label={lang === 'de' ? '2-Admin Freigaben' : 'Deletion Approvals'}
              active={adminTab === 'DELETIONS'}
              badge={pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined}
              badgeColor="#ef4444"
              collapsed={collapsed}
              onClick={() => onAdminTabChange && onAdminTabChange('DELETIONS')}
            />
            <NavItem
              icon={<FileCheck2 size={18} />}
              label={lang === 'de' ? 'DSGVO Audit-Log' : 'Audit Trail'}
              active={adminTab === 'AUDIT'}
              collapsed={collapsed}
              onClick={() => onAdminTabChange && onAdminTabChange('AUDIT')}
            />
          </>
        )}

        {/* ── STAFF NAV ITEMS ── */}
        {activePortal === 'STAFF' && (
          <>
            <NavItem
              icon={<Receipt size={18} />}
              label={lang === 'de' ? 'Belegprüfung & AI' : 'Invoices & AI'}
              active={staffTab === 'INVOICES'}
              badge={pendingReviewCount > 0 ? pendingReviewCount : undefined}
              badgeColor="#f59e0b"
              collapsed={collapsed}
              onClick={() => onStaffTabChange && onStaffTabChange('INVOICES')}
            />
            <NavItem
              icon={<Landmark size={18} />}
              label={lang === 'de' ? 'Kontoauszüge' : 'Bank Statements'}
              active={staffTab === 'BANK'}
              collapsed={collapsed}
              onClick={() => onStaffTabChange && onStaffTabChange('BANK')}
            />
            <NavItem
              icon={<Mail size={18} />}
              label={lang === 'de' ? 'Finanzamt-Briefe' : 'Tax Correspondence'}
              active={staffTab === 'CORR'}
              collapsed={collapsed}
              onClick={() => onStaffTabChange && onStaffTabChange('CORR')}
            />
            <NavItem
              icon={<Users size={18} />}
              label={lang === 'de' ? 'Lohnbuchhaltung' : 'Payroll (LoBu)'}
              active={staffTab === 'PAYROLL'}
              collapsed={collapsed}
              onClick={() => onStaffTabChange && onStaffTabChange('PAYROLL')}
            />
            <NavItem
              icon={<FolderTree size={18} />}
              label={lang === 'de' ? 'Mandanten-Vault' : 'Client Vault'}
              active={staffTab === 'VAULT'}
              collapsed={collapsed}
              onClick={() => onStaffTabChange && onStaffTabChange('VAULT')}
            />
          </>
        )}

        {/* ── CLIENT NAV ITEMS ── */}
        {activePortal === 'CLIENT' && (
          <>
            <NavItem
              icon={<LayoutDashboard size={18} />}
              label={lang === 'de' ? 'Übersicht & Dashboard' : 'Overview & Dashboard'}
              active={clientTab === 'OVERVIEW' || clientTab === 'DOCS' || !clientTab}
              collapsed={collapsed}
              onClick={() => onClientTabChange && onClientTabChange('OVERVIEW')}
            />
            <NavItem
              icon={<Building2 size={18} />}
              label={lang === 'de' ? 'Gründungsunterlagen' : 'Formation Documents'}
              active={clientTab === 'FORMATION'}
              collapsed={collapsed}
              onClick={() => onClientTabChange && onClientTabChange('FORMATION')}
            />
            <NavItem
              icon={<Receipt size={18} />}
              label={lang === 'de' ? 'Finanzbuchhaltung' : 'Financial Accounting'}
              active={clientTab === 'ACCOUNTING'}
              collapsed={collapsed}
              onClick={() => onClientTabChange && onClientTabChange('ACCOUNTING')}
            />
            <NavItem
              icon={<Users size={18} />}
              label={lang === 'de' ? 'Lohn & Personal' : 'Payroll Documents'}
              active={clientTab === 'PAYROLL'}
              collapsed={collapsed}
              onClick={() => onClientTabChange && onClientTabChange('PAYROLL')}
            />
            <NavItem
              icon={<Mail size={18} />}
              label={lang === 'de' ? 'Schriftverkehr' : 'Correspondence'}
              active={clientTab === 'CORRESPONDENCE'}
              collapsed={collapsed}
              badge={lang === 'de' ? 'Neu' : 'New'}
              badgeColor="#d4a359"
              onClick={() => onClientTabChange && onClientTabChange('CORRESPONDENCE')}
            />
            <NavItem
              icon={<FolderTree size={18} />}
              label={lang === 'de' ? 'Mandanten-Archiv (00-03)' : 'My Vault Folders'}
              active={clientTab === 'VAULT'}
              collapsed={collapsed}
              onClick={() => onClientTabChange && onClientTabChange('VAULT')}
            />
          </>
        )}
      </div>

      {/* ── Collapsed Toggle Button when collapsed ── */}
      {collapsed && (
        <div style={{ padding: '0.75rem', display: 'flex', justifyContent: 'center', borderTop: '1px solid #f1f5f9' }}>
          <button
            type="button"
            onClick={onToggleCollapse}
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '6px',
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={lang === 'de' ? 'Seitenleiste ausklappen' : 'Expand sidebar'}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── Bottom User Profile Card ── */}
      <div
        style={{
          borderTop: '1px solid #e2e8f0',
          padding: collapsed ? '1rem 0.5rem' : '1.15rem 1.25rem',
          backgroundColor: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: user.role === 'CLIENT'
                ? 'linear-gradient(135deg, #0b1a30 0%, #1e3a68 100%)'
                : 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
              color: user.role === 'CLIENT' ? '#dfb772' : '#ffffff',
              fontWeight: 800,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '2px solid #ffffff',
              boxShadow: '0 2px 8px rgba(11,26,48,0.18)',
              position: 'relative',
            }}
          >
            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            <span
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                border: '2px solid #ffffff',
              }}
              title="Aktiv / Online"
            />
          </div>

          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  color: '#0b1a30',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '-0.01em',
                }}
                title={user.name}
              >
                {user.name || 'Test von Webapp'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    backgroundColor: user.role === 'CLIENT' ? '#fef3c7' : roleBadgeInfo.bg,
                    color: user.role === 'CLIENT' ? '#92400e' : roleBadgeInfo.text,
                    border: `1px solid ${user.role === 'CLIENT' ? '#fde68a' : roleBadgeInfo.border}`,
                    padding: '1.5px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                  }}
                >
                  {roleBadgeInfo.label}
                </span>
                {(user.clientNumber || user.role === 'CLIENT') && (
                  <span style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 600 }}>
                    {user.clientNumber || 'KD-10042'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button
          type="button"
          onClick={logout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fef2f2';
            e.currentTarget.style.borderColor = '#fecaca';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
            e.currentTarget.style.borderColor = '#e2e8f0';
          }}
        >
          <LogOut size={16} />
          {!collapsed && <span>{lang === 'de' ? 'Abmelden' : 'Sign Out'}</span>}
        </button>
      </div>
    </aside>
  );
};

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number | string;
  badgeColor?: string;
  collapsed: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({
  icon,
  label,
  active,
  badge,
  badgeColor = '#ef4444',
  collapsed,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        width: '100%',
        padding: collapsed ? '10px 0' : '9px 12px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: active ? '#eff6ff' : 'transparent',
        color: active ? '#1d4ed8' : '#475569',
        fontWeight: active ? 700 : 500,
        fontSize: '0.875rem',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
        borderLeft: active ? '3px solid #2563eb' : '3px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = '#f8fafc';
          e.currentTarget.style.color = '#0f172a';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = '#475569';
        }
      }}
      title={collapsed ? label : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: active ? '#2563eb' : '#64748b', display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
        {!collapsed && <span>{label}</span>}
      </div>

      {!collapsed && badge !== undefined && (typeof badge === 'string' ? badge.length > 0 : badge > 0) && (
        <span
          style={{
            backgroundColor: badgeColor,
            color: '#ffffff',
            fontSize: '0.6875rem',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '9999px',
            minWidth: '18px',
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
};
