import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';
import type { Language } from '../translations';
import {
  ShieldCheck,
  Users,
  FolderTree,
  FileText,
  CheckCircle2,
  Folder,
  RefreshCw,
  Link2,
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:5000/api';

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: 'CLIENT' | 'STAFF' | 'ADMIN';
  client_number?: string;
  is_active: boolean;
  created_at: string;
}

interface AuditItem {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  ip_address: string;
  details_json: string;
  timestamp: string;
}

interface StaffAssignment {
  id: string;
  staff_user_id: string;
  staff_name?: string;
  client_user_id: string;
  client_name?: string;
  assigned_at: string;
}

interface DeletionRequest {
  id: string;
  document_id: string;
  document_name: string;
  document_category: string;
  client_id: string;
  requested_by_user_id: string;
  requested_by_name: string;
  reason: string;
  retention_law: string;
  document_date: string;
  retention_expires_at: string;
  is_within_retention_period: boolean;
  retention_warning: string;
  status: 'PENDING_FIRST_APPROVAL' | 'FIRST_APPROVAL_GRANTED' | 'APPROVED_AND_DELETED' | 'REJECTED';
  approval_1_admin_id?: string;
  approval_1_admin_name?: string;
  approval_1_at?: string;
  approval_2_admin_id?: string;
  approval_2_admin_name?: string;
  approval_2_at?: string;
  rejection_notes?: string;
  created_at: string;
}

interface FolderNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  sizeBytes?: number;
  fileCount?: number;
  children?: FolderNode[];
}

export const AdminPortal: React.FC<{
  lang: Language;
  externalTab?: 'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT';
  onTabChange?: (tab: 'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT') => void;
}> = ({ lang, externalTab, onTabChange }) => {
  const { user: currentAdmin, token } = useAuth();
  const { success, error, info } = useSnackbar();
  const [internalTab, setInternalTab] = useState<'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT'>('USERS');
  const activeTab = externalTab || internalTab;
  const setActiveTab = (t: 'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT') => {
    setInternalTab(t);
    if (onTabChange) onTabChange(t);
  };

  const [users, setUsers] = useState<UserItem[]>([]);
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [clientFolderList, setClientFolderList] = useState<string[]>([]);
  const [selectedClientForTree, setSelectedClientForTree] = useState<string>('user_client_1');
  const [clientTree, setClientTree] = useState<FolderNode | null>(null);

  const [loading, setLoading] = useState(true);
  const [auditFilter, setAuditFilter] = useState('ALL');

  // Modal State for adding a new user
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'CLIENT' | 'STAFF' | 'ADMIN'>('CLIENT');
  const [newUserClientNum, setNewUserClientNum] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('client123');

  // Assignment Form State
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [uRes, lRes, aRes, dRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/admin/users`, { headers }),
        fetch(`${API_BASE}/admin/audit-logs`, { headers }),
        fetch(`${API_BASE}/admin/assignments`, { headers }),
        fetch(`${API_BASE}/admin/deletion-requests`, { headers }),
        fetch(`${API_BASE}/storage/clients`, { headers }),
      ]);

      if (uRes.ok) setUsers(await uRes.json());
      if (lRes.ok) setLogs(await lRes.json());
      if (aRes.ok) setAssignments(await aRes.json());
      if (dRes.ok) setDeletionRequests(await dRes.json());
      if (cRes.ok) {
        const clients = await cRes.json();
        setClientFolderList(clients);
        if (clients.length > 0 && !selectedClientForTree) {
          setSelectedClientForTree(clients[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolderTree = async (clientId: string) => {
    try {
      const res = await fetch(`${API_BASE}/storage/clients/${clientId}/tree`);
      if (res.ok) {
        setClientTree(await res.json());
      }
    } catch (e) {
      console.error('Failed to load folder tree:', e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  useEffect(() => {
    if (selectedClientForTree) {
      fetchFolderTree(selectedClientForTree);
    }
  }, [selectedClientForTree]);

  // Set default selection when users load
  useEffect(() => {
    const staffList = users.filter((u) => u.role === 'STAFF');
    const clientList = users.filter((u) => u.role === 'CLIENT');
    if (staffList.length > 0 && !selectedStaffId) setSelectedStaffId(staffList[0].id);
    if (clientList.length > 0 && !selectedClientId) setSelectedClientId(clientList[0].id);
  }, [users]);

  // Create User Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          role: newUserRole,
          password: newUserPassword,
          client_number: newUserClientNum || undefined,
        }),
      });

      if (res.ok) {
        setShowAddUserModal(false);
        setNewUserName('');
        setNewUserEmail('');
        setNewUserClientNum('');
        success(lang === 'de' ? 'Benutzerkonto erfolgreich angelegt!' : 'User created successfully!', 'Benutzerverwaltung');
        await fetchData();
      } else {
        const data = await res.json();
        error(data.error || 'Fehler beim Erstellen des Benutzers');
      }
    } catch (err: any) {
      error(`Serverfehler: ${err?.message}`);
    }
  };

  // Toggle User Active Status
  const handleToggleUserStatus = async (userItem: UserItem) => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !userItem.is_active }),
      });
      if (res.ok) {
        info(lang === 'de' ? `Status für ${userItem.name} geändert.` : `Status updated for ${userItem.name}.`);
        await fetchData();
      }
    } catch (err) {
      console.error('Toggle status error:', err);
    }
  };

  // Assignment Handlers
  const handleAssignClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !selectedClientId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: selectedStaffId,
          client_user_id: selectedClientId,
        }),
      });
      if (res.ok) {
        success(lang === 'de' ? 'Mandantenzuweisung erfolgreich gespeichert.' : 'Assignment saved successfully.');
        await fetchData();
      }
    } catch (err: any) {
      error(err?.message || 'Zuweisung fehlgeschlagen');
    }
  };

  const handleRemoveAssignment = async (staffId: string, clientId: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/assignments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: staffId,
          client_user_id: clientId,
        }),
      });
      if (res.ok) {
        info(lang === 'de' ? 'Zuweisung aufgehoben.' : 'Assignment removed.');
        await fetchData();
      }
    } catch (err) {
      console.error('Remove assignment error:', err);
    }
  };

  // 2-Admin Approval Handlers
  const handleApproveDeletion = async (requestId: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/deletion-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: currentAdmin?.id || 'admin_1',
          adminName: currentAdmin?.name || 'Dr. Michael von FinTax',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        success(data.message, '2-Admin Löschfreigabe');
        await fetchData();
      } else {
        error(data.error || 'Fehler bei der Freigabe');
      }
    } catch (err: any) {
      error(err?.message || 'Löschfreigabe fehlgeschlagen');
    }
  };

  const handleRejectDeletion = async (requestId: string) => {
    const notes = prompt(lang === 'de' ? 'Begründung für die Ablehnung:' : 'Reason for rejection:');
    if (!notes) return;

    try {
      const res = await fetch(`${API_BASE}/admin/deletion-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: currentAdmin?.id || 'admin_1',
          adminName: currentAdmin?.name || 'Dr. Michael von FinTax',
          notes,
        }),
      });

      if (res.ok) {
        info(lang === 'de' ? 'Löschantrag abgelehnt.' : 'Deletion request rejected.');
        await fetchData();
      }
    } catch (err: any) {
      alert(`Fehler: ${err?.message}`);
    }
  };

  // Render Folder Tree Recursive Component
  const renderTreeNode = (node: FolderNode, depth = 0) => {
    const isDir = node.type === 'directory';
    return (
      <div key={node.path} style={{ marginLeft: `${depth * 1.25}rem`, marginTop: '0.25rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.5rem',
          borderRadius: '0.375rem',
          background: isDir ? 'rgba(241, 245, 249, 0.7)' : 'transparent',
          borderLeft: isDir ? '3px solid #3b82f6' : 'none',
          fontSize: '0.8125rem',
        }}>
          {isDir ? (
            <Folder size={16} color="#2563eb" />
          ) : (
            <FileText size={16} color="#64748b" />
          )}
          <span style={{ fontWeight: isDir ? 700 : 400, color: isDir ? '#1e3a8a' : '#334155' }}>
            {node.name}
          </span>
          {isDir && node.fileCount !== undefined && (
            <span style={{ fontSize: '0.6875rem', background: '#e2e8f0', color: '#475569', padding: '0.1rem 0.4rem', borderRadius: '9999px', marginLeft: 'auto' }}>
              {node.fileCount} Dateien
            </span>
          )}
          {!isDir && node.sizeBytes && (
            <span style={{ fontSize: '0.6875rem', color: '#94a3b8', marginLeft: 'auto' }}>
              {(node.sizeBytes / 1024).toFixed(1)} KB
            </span>
          )}
        </div>
        {node.children && node.children.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
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
            🛡️ {lang === 'de' ? 'Administrator-Konsole' : 'Admin & Governance Console'}
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
            {lang === 'de' ? 'Systemsteuerung & DSGVO Governance' : 'System Control & GDPR Governance'}
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9375rem' }}>
            {lang === 'de'
              ? '2-Admin Löschfreigaben (§ 147 AO), automatische Ordnerbäume (00-03) und revisionssichere Logs.'
              : 'Two-Administrator deletion approvals (§ 147 AO), structured folder hierarchy (00-03), and immutable logs.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.3)',
              padding: '0.625rem 1.25rem',
              borderRadius: '0.625rem',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? '...' : (lang === 'de' ? 'Aktualisieren' : 'Refresh')}
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {lang === 'de' ? 'Datenbank-Status' : 'Database Status'}
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} />
            PostgreSQL 17 LIVE
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            fintax_db • Encrypted Vault (Germany)
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {lang === 'de' ? '🛡️ 2-Admin Löschanträge' : '🛡️ 2-Admin Deletions'}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', marginTop: '0.25rem' }}>
            {deletionRequests.filter(d => d.status !== 'APPROVED_AND_DELETED' && d.status !== 'REJECTED').length} Offen
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            § 147 AO / GoBD Aufbewahrungsprüfung
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {lang === 'de' ? '🗂️ Mandanten-Ordner' : '🗂️ Client Folders'}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>
            {clientFolderList.length} Mandanten
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            00_ bis 03_ Struktur aktiv
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {lang === 'de' ? 'DSGVO Revisionsprotokolle' : 'Audit Trail Entries'}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.25rem' }}>
            {logs.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {lang === 'de' ? 'Unveränderliche Historie' : 'Immutable audit trail'}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('USERS')}
          style={{
            background: activeTab === 'USERS' ? '#2563eb' : '#eff6ff',
            color: activeTab === 'USERS' ? '#ffffff' : '#1d4ed8',
            border: 'none',
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Users size={16} />
          {lang === 'de' ? 'Benutzer & Rollen' : 'Users & Roles'}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ASSIGNMENTS')}
          style={{
            background: activeTab === 'ASSIGNMENTS' ? '#2563eb' : '#eff6ff',
            color: activeTab === 'ASSIGNMENTS' ? '#ffffff' : '#1d4ed8',
            border: 'none',
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Link2 size={16} />
          {lang === 'de' ? 'Zuweisungen' : 'Assignments'}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DELETIONS')}
          style={{
            background: activeTab === 'DELETIONS' ? '#b91c1c' : '#fef2f2',
            color: activeTab === 'DELETIONS' ? '#ffffff' : '#b91c1c',
            border: '1px solid #fecaca',
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ShieldCheck size={16} />
          {lang === 'de' ? '🛡️ 2-Admin Löschanträge' : '🛡️ 2-Admin Deletions'}
          {deletionRequests.filter(d => d.status !== 'APPROVED_AND_DELETED' && d.status !== 'REJECTED').length > 0 && (
            <span style={{ background: '#ffffff', color: '#b91c1c', padding: '0.1rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 800 }}>
              {deletionRequests.filter(d => d.status !== 'APPROVED_AND_DELETED' && d.status !== 'REJECTED').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('FOLDERS')}
          style={{
            background: activeTab === 'FOLDERS' ? '#1d4ed8' : '#eff6ff',
            color: activeTab === 'FOLDERS' ? '#ffffff' : '#1d4ed8',
            border: '1px solid #bfdbfe',
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <FolderTree size={16} />
          {lang === 'de' ? '🗂️ Mandanten-Ordnerbaum (00-03)' : '🗂️ Client Folder Tree'}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('AUDIT')}
          style={{
            background: activeTab === 'AUDIT' ? '#2563eb' : '#eff6ff',
            color: activeTab === 'AUDIT' ? '#ffffff' : '#1d4ed8',
            border: 'none',
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <FileText size={16} />
          {lang === 'de' ? 'DSGVO Audit-Logs' : 'Compliance Audit Logs'}
        </button>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'USERS' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                👥 {lang === 'de' ? 'Benutzerverwaltung (RBAC Rollen)' : 'User Management (RBAC Roles)'}
              </h2>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                {lang === 'de' ? 'Konten anlegen, Mandantennummern zuweisen und 2FA Status einsehen' : 'Manage accounts, assign client numbers, and view 2FA status'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAddUserModal(true)}
              style={{
                background: '#4c1d95',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              + {lang === 'de' ? 'Benutzer hinzufügen' : 'Add User'}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Name / Mandant</th>
                  <th style={{ padding: '0.75rem 1rem' }}>E-Mail / Login</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Mandantennummer</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Rolle & 2FA</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>{u.name}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>{u.email}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#0284c7', fontWeight: 600 }}>
                      {u.client_number || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: u.role === 'ADMIN' ? '#fdf2f8' : u.role === 'STAFF' ? '#eff6ff' : '#f0fdf4',
                        color: u.role === 'ADMIN' ? '#be185d' : u.role === 'STAFF' ? '#1d4ed8' : '#15803d',
                      }}>
                        {u.role} {u.role !== 'CLIENT' && '🔒 (2FA aktiv)'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: u.is_active ? '#dcfce7' : '#fee2e2',
                        color: u.is_active ? '#15803d' : '#b91c1c',
                      }}>
                        {u.is_active ? 'Aktiv' : 'Gesperrt'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleToggleUserStatus(u)}
                        style={{
                          background: 'none',
                          border: '1px solid #cbd5e1',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {u.is_active ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: ASSIGNMENTS */}
      {activeTab === 'ASSIGNMENTS' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
            🔗 {lang === 'de' ? 'Kanzlei-Zuweisungen (Mandant zu Sachbearbeiter)' : 'Staff Client Assignments'}
          </h2>
          <form onSubmit={handleAssignClient} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600 }}
            >
              {users.filter((u) => u.role === 'STAFF').map((s) => (
                <option key={s.id} value={s.id} style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>{s.name}</option>
              ))}
            </select>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600 }}
            >
              {users.filter((u) => u.role === 'CLIENT').map((c) => (
                <option key={c.id} value={c.id} style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>{c.name} ({c.client_number || c.email})</option>
              ))}
            </select>
            <button
              type="submit"
              style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 700, cursor: 'pointer' }}
            >
              + Zuweisen
            </button>
          </form>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '0.75rem' }}>Sachbearbeiter</th>
                  <th style={{ padding: '0.75rem' }}>Mandant</th>
                  <th style={{ padding: '0.75rem' }}>Zuweisungsdatum</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{a.staff_name || a.staff_user_id}</td>
                    <td style={{ padding: '0.75rem' }}>{a.client_name || a.client_user_id}</td>
                    <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(a.assigned_at).toLocaleDateString('de-DE')}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleRemoveAssignment(a.staff_user_id, a.client_user_id)}
                        style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: 2-ADMIN DELETION APPROVALS */}
      {activeTab === 'DELETIONS' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={22} />
              {lang === 'de' ? '2-Administrator-Löschprüfung (§ 147 AO / GoBD)' : '2-Admin Deletion Approvals'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
              {lang === 'de'
                ? 'Gemäß FinTax-Sicherheitsarchitektur kann kein Beleg eigenmächtig gelöscht werden. Jede Löschung erfordert die Prüfung der gesetzlichen Aufbewahrungsfrist (10 Jahre für FiBu) und die Freigabe durch ZWEI verschiedene Administratoren.'
                : 'Under FinTax security policy, no document can be deleted unilaterally. Two independent administrators must approve.'}
            </p>
          </div>

          {deletionRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
              <ShieldCheck size={48} color="#10b981" style={{ margin: '0 auto 1rem auto' }} />
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Keine offenen Löschanträge</div>
              <div style={{ fontSize: '0.875rem' }}>Alle Mandantenbelege sind revisionssicher gespeichert.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {deletionRequests.map((req) => (
                <div key={req.id} style={{
                  border: req.status === 'APPROVED_AND_DELETED' ? '1px solid #e2e8f0' : '1px solid #fecaca',
                  background: req.status === 'APPROVED_AND_DELETED' ? '#f8fafc' : '#ffffff',
                  borderRadius: '0.75rem',
                  padding: '1.25rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>📄 {req.document_name}</span>
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontWeight: 700,
                          background: req.status === 'APPROVED_AND_DELETED' ? '#dcfce7' : req.status === 'FIRST_APPROVAL_GRANTED' ? '#fef3c7' : '#fee2e2',
                          color: req.status === 'APPROVED_AND_DELETED' ? '#15803d' : req.status === 'FIRST_APPROVAL_GRANTED' ? '#b45309' : '#b91c1c',
                        }}>
                          {req.status === 'PENDING_FIRST_APPROVAL' && '⏳ WARTET AUF 1. ADMIN-FREIGABE'}
                          {req.status === 'FIRST_APPROVAL_GRANTED' && '⏳ 1/2 FREIGABE ERTEILT (ZWEITER ADMIN BENÖTIGT)'}
                          {req.status === 'APPROVED_AND_DELETED' && '✓ VOLLSTÄNDIG GELÖSCHT DURCH 2 ADMINS'}
                          {req.status === 'REJECTED' && '❌ ABGELEHNT'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                        Mandant: <strong>{req.client_id}</strong> • Beantragt von: <strong>{req.requested_by_name}</strong> • Grund: "{req.reason}"
                      </div>
                    </div>

                    {/* Action Buttons for Admins */}
                    {req.status !== 'APPROVED_AND_DELETED' && req.status !== 'REJECTED' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleApproveDeletion(req.id)}
                          style={{
                            background: '#16a34a',
                            color: '#ffffff',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            fontWeight: 700,
                            fontSize: '0.8125rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <CheckCircle2 size={16} />
                          {req.status === 'PENDING_FIRST_APPROVAL' ? '1. Admin-Freigabe erteilen' : '2. Admin-Freigabe erteilen (Löschen)'}
                        </button>

                        <button
                          onClick={() => handleRejectDeletion(req.id)}
                          style={{
                            background: '#ffffff',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            padding: '0.5rem 0.875rem',
                            borderRadius: '0.5rem',
                            fontWeight: 600,
                            fontSize: '0.8125rem',
                            cursor: 'pointer',
                          }}
                        >
                          Ablehnen
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Retention Warning Box */}
                  <div style={{
                    marginTop: '0.75rem',
                    background: req.is_within_retention_period ? '#fffbeb' : '#f0fdf4',
                    border: req.is_within_retention_period ? '1px solid #fde68a' : '1px solid #bbf7d0',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.8125rem',
                    color: req.is_within_retention_period ? '#92400e' : '#166534',
                  }}>
                    {req.retention_warning}
                  </div>

                  {/* Approver History */}
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '1.5rem' }}>
                    <div>
                      1. Freigabe: {req.approval_1_admin_name ? `✓ ${req.approval_1_admin_name} (${new Date(req.approval_1_at!).toLocaleDateString('de-DE')})` : '— Noch offen'}
                    </div>
                    <div>
                      2. Freigabe: {req.approval_2_admin_name ? `✓ ${req.approval_2_admin_name} (${new Date(req.approval_2_at!).toLocaleDateString('de-DE')})` : '— Noch offen'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CLIENT FOLDER TREE */}
      {activeTab === 'FOLDERS' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                🗂️ {lang === 'de' ? 'Mandanten-Ordnerstruktur (00_ bis 03_)' : 'Client Folder Structure'}
              </h2>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                {lang === 'de' ? 'Automatische Jahresscheiben & Monatshierarchie auf dem Server in Deutschland' : 'Automated year & month folder hierarchy'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>Mandant auswählen:</label>
              <select
                value={selectedClientForTree}
                onChange={(e) => setSelectedClientForTree(e.target.value)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontWeight: 600, color: '#0f172a', backgroundColor: '#ffffff' }}
              >
                {clientFolderList.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Folder Hierarchy Legend */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 700, color: '#1e40af' }}>00_Schriftverkehr</div>
              <div style={{ color: '#3b82f6', fontSize: '0.75rem' }}>Finanzamt, IHK, Krankenkassen</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 700, color: '#166534' }}>01_FiBu</div>
              <div style={{ color: '#15803d', fontSize: '0.75rem' }}>Rechnungen, Belege, Kassenbücher</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#faf5ff', border: '1px solid #e9d5ff', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 700, color: '#6b21a8' }}>02_LoBu</div>
              <div style={{ color: '#7e22ce', fontSize: '0.75rem' }}>Personalfragebögen, Lohnabrechnungen</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#fdf2f8', border: '1px solid #fbcfe8', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 700, color: '#9d174d' }}>03_Agenda</div>
              <div style={{ color: '#be185d', fontSize: '0.75rem' }}>Agenda SKR03 Exportdateien</div>
            </div>
          </div>

          {/* Tree View Display */}
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', minHeight: '200px' }}>
            {clientTree ? (
              renderTreeNode(clientTree)
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                Ordnerstruktur wird geladen...
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {activeTab === 'AUDIT' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                📜 {lang === 'de' ? 'Unveränderliches DSGVO-Auditprotokoll' : 'Immutable GDPR Audit Log'}
              </h2>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                {lang === 'de' ? 'Logins, 2FA-Validierungen, Uploads, Exporte und 2-Admin Freigaben' : 'Every critical action recorded'}
              </div>
            </div>

            <select
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.8125rem', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600 }}
            >
              <option value="ALL">Alle Aktionen</option>
              <option value="STAFF_OTP_GENERATED">2FA OTP Generiert</option>
              <option value="STAFF_2FA_VERIFIED_SUCCESS">2FA Bestätigt</option>
              <option value="DELETION_REQUESTED">Löschantrag gestellt</option>
              <option value="DELETION_FIRST_APPROVAL">1. Admin-Freigabe</option>
              <option value="DELETION_FINAL_EXECUTED_2_ADMIN">2. Admin-Freigabe (Endgültig)</option>
              <option value="USER_LOGIN">Standard Login</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.625rem 0.75rem' }}>Zeitpunkt</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>Benutzer-ID</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>Aktion</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>Bereich</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>IP-Adresse</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {(auditFilter === 'ALL' ? logs : logs.filter(l => l.action === auditFilter)).map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#64748b' }}>
                      {new Date(log.timestamp).toLocaleString('de-DE')}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#1e3a8a' }}>{log.user_id}</td>
                    <td style={{ padding: '0.625rem 0.75rem' }}>
                      <span style={{
                        padding: '0.2rem 0.4rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        background: log.action.includes('DELETION') ? '#fee2e2' : log.action.includes('2FA') ? '#f0fdf4' : '#eff6ff',
                        color: log.action.includes('DELETION') ? '#b91c1c' : log.action.includes('2FA') ? '#15803d' : '#1d4ed8',
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#475569' }}>{log.resource_type}</td>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#64748b' }}>{log.ip_address || '127.0.0.1'}</td>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#334155', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.details_json}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1.5rem',
        }}>
          <div style={{ background: '#ffffff', borderRadius: '1rem', width: '100%', maxWidth: '450px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
              + {lang === 'de' ? 'Neues Benutzerkonto anlegen' : 'Create User Account'}
            </h3>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Name</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="z.B. Dr. Michael Bergmann"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>E-Mail</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="z.B. bergmann@fintax.de"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Mandantennummer (Optional)</label>
                <input
                  type="text"
                  value={newUserClientNum}
                  onChange={(e) => setNewUserClientNum(e.target.value)}
                  placeholder="z.B. KD-10045"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Rolle</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as any)}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="CLIENT" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>CLIENT — Mandant (Direkt-Login mit Mandantennr.)</option>
                  <option value="STAFF" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>STAFF — Kanzlei / Fachangestellter (🔒 2FA E-Mail OTP)</option>
                  <option value="ADMIN" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>ADMIN — Administrator (🔒 2FA E-Mail OTP + 2-Admin Freigabe)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Passwort</label>
                <input
                  type="text"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Initialpasswort eingeben..."
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#4c1d95', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
                >
                  Konto erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
