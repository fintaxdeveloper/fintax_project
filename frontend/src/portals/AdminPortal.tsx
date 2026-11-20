import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';
import type { Language } from '../translations';
import { FileExplorer } from '../components/FileExplorer';
import { openAuthenticatedFileInNewTab, downloadAuthenticatedFile, fetchAuthenticatedBlobUrl } from '../utils/authFile';
import {
  ShieldCheck,
  Users,
  FolderTree,
  FileText,
  CheckCircle2,
  RefreshCw,
  Link2,
  Eye,
  Download,
  Search,
  Filter,
  ArrowLeft,
  X,
  ExternalLink,
  FileSpreadsheet,
  FileCode,
  File,
  ChevronRight,
  FolderOpen,
  HardDrive,
  FileCheck,
  Clock,
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

interface ClientDocItem {
  id: string;
  client_id: string;
  category: string;
  sub_types?: string[];
  original_filename: string;
  stored_filename?: string;
  file_path: string;
  relative_path?: string;
  file_checksum?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at: string;
  status: string;
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

export const AdminPortal: React.FC<{
  lang: Language;
  externalTab?: 'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT';
  onTabChange?: (tab: 'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT') => void;
}> = ({ lang, externalTab, onTabChange }) => {
  const isDe = lang === 'de';
  const { user: currentAdmin, token } = useAuth();
  const { success, error, info } = useSnackbar();
  const [internalTab, setInternalTab] = useState<'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT'>('USERS');
  const activeTab = externalTab || internalTab;
  const setActiveTab = (t: 'USERS' | 'ASSIGNMENTS' | 'DELETIONS' | 'FOLDERS' | 'AUDIT') => {
    setInternalTab(t);
    if (onTabChange) onTabChange(t);
  };

  const [users, setUsers] = useState<UserItem[]>([]);
  const [allDocuments, setAllDocuments] = useState<ClientDocItem[]>([]);
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [clientFolderList, setClientFolderList] = useState<string[]>([]);
  const [selectedClientForTree, setSelectedClientForTree] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [auditFilter, setAuditFilter] = useState('ALL');

  // Client Document Inspection State
  const [selectedClientForDocs, setSelectedClientForDocs] = useState<UserItem | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docYearFilter, setDocYearFilter] = useState('ALL');
  const [docMonthFilter, setDocMonthFilter] = useState('ALL');
  const [docCategoryFilter, setDocCategoryFilter] = useState('ALL');
  const [docTypeFilter, setDocTypeFilter] = useState('ALL');
  const [docStatusFilter, setDocStatusFilter] = useState('ALL');
  const [previewDoc, setPreviewDoc] = useState<ClientDocItem | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewDoc) {
      setPreviewBlobUrl(null);
      return;
    }
    const controller = new AbortController();
    let createdUrl: string | null = null;
    fetchAuthenticatedBlobUrl(`${API_BASE}/documents/${previewDoc.id}/view`, controller.signal)
      .then((blobUrl) => {
        createdUrl = blobUrl;
        setPreviewBlobUrl(blobUrl);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error('Preview fetch error:', err);
          setPreviewBlobUrl(null);
        }
      });
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewDoc]);

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

      const [uRes, lRes, aRes, dRes, cRes, docRes] = await Promise.all([
        fetch(`${API_BASE}/admin/users`, { headers }),
        fetch(`${API_BASE}/admin/audit-logs`, { headers }),
        fetch(`${API_BASE}/admin/assignments`, { headers }),
        fetch(`${API_BASE}/admin/deletion-requests`, { headers }),
        fetch(`${API_BASE}/storage/clients`, { headers }),
        fetch(`${API_BASE}/documents`, { headers }),
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
      if (docRes.ok) {
        const docs = await docRes.json();
        setAllDocuments(Array.isArray(docs) ? docs : []);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Set default selection when users load
  useEffect(() => {
    const staffList = users.filter((u) => u.role === 'STAFF');
    const clientList = users.filter((u) => u.role === 'CLIENT');
    if (staffList.length > 0 && !selectedStaffId) setSelectedStaffId(staffList[0].id);
    if (clientList.length > 0 && !selectedClientId) setSelectedClientId(clientList[0].id);
  }, [users]);

  // Helper to match documents to a specific user
  const getClientDocs = (userItem: UserItem): ClientDocItem[] => {
    const cNum = (userItem.client_number || '').trim().toLowerCase();
    const cName = (userItem.name || '').trim().toLowerCase();
    const cId = (userItem.id || '').trim().toLowerCase();

    return allDocuments.filter((d) => {
      const dClientId = (d.client_id || '').trim().toLowerCase();
      const dPath = (d.file_path || d.relative_path || '').toLowerCase();

      // 1. Exact client_id match
      if (dClientId && (dClientId === cId || (cNum && dClientId === cNum))) return true;

      // 2. Client number in folder / filename path
      if (cNum && dPath.includes(cNum)) return true;

      // 3. Client name in folder / filename path
      if (cName && dPath.includes(cName)) return true;

      // 4. Client id in path
      if (cId && dPath.includes(cId)) return true;

      return false;
    });
  };

  // Helper to resolve client number (even if null in users table, extracts from folder name like "JJ-50012_Mansoor")
  const getClientNumber = (u: UserItem): string => {
    if (u.client_number && u.client_number.trim() !== '') return u.client_number;
    const folder = clientFolderList.find((f) => f.toLowerCase().includes(u.name.toLowerCase()));
    if (folder) {
      const parts = folder.split('_');
      if (parts.length > 1 && parts[0].includes('-')) return parts[0];
    }
    const cDocs = getClientDocs(u);
    for (const doc of cDocs) {
      const p = doc.relative_path || doc.file_path || '';
      const match = p.match(/([A-Z0-9]{2,5}-[0-9]{3,6})/i);
      if (match) return match[1].toUpperCase();
    }
    return '—';
  };

  // Documents belonging to currently selected client
  const currentClientDocs = useMemo(() => {
    if (!selectedClientForDocs) return [];
    return getClientDocs(selectedClientForDocs);
  }, [selectedClientForDocs, allDocuments]);

  // Available years detected in current client docs
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    currentClientDocs.forEach((d) => {
      const match = (d.file_path || d.relative_path || '').match(/202[0-9]/);
      if (match) years.add(match[0]);
      if (d.uploaded_at) {
        const y = new Date(d.uploaded_at).getFullYear();
        if (!isNaN(y) && y >= 2020 && y <= 2030) years.add(y.toString());
      }
    });
    return Array.from(years).sort().reverse();
  }, [currentClientDocs]);

  // Filtered documents for selected client
  const filteredClientDocs = useMemo(() => {
    return currentClientDocs.filter((d) => {
      const path = (d.file_path || d.relative_path || '').toLowerCase();
      const name = (d.original_filename || '').toLowerCase();
      const status = (d.status || '').toUpperCase();
      const category = (d.category || '').toLowerCase();
      const subTypes = (d.sub_types || []).join(' ').toLowerCase();

      // Year Filter
      if (docYearFilter !== 'ALL') {
        const hasYear = path.includes(docYearFilter) || 
          (d.uploaded_at && new Date(d.uploaded_at).getFullYear().toString() === docYearFilter);
        if (!hasYear) return false;
      }

      // Month Filter (01..12)
      if (docMonthFilter !== 'ALL') {
        const mPadded = docMonthFilter.padStart(2, '0');
        const hasMonth = path.includes(`\\${mPadded}\\`) ||
          path.includes(`/${mPadded}/`) ||
          name.startsWith(mPadded) ||
          (d.uploaded_at && (new Date(d.uploaded_at).getMonth() + 1).toString().padStart(2, '0') === mPadded);
        if (!hasMonth) return false;
      }

      // Category Filter
      if (docCategoryFilter !== 'ALL') {
        if (!category.includes(docCategoryFilter.toLowerCase())) return false;
      }

      // Document Type Filter
      if (docTypeFilter !== 'ALL') {
        if (docTypeFilter === 'BANK') {
          const isBank = name.includes('bank') || name.includes('kontoauszug') || subTypes.includes('bank');
          if (!isBank) return false;
        } else if (docTypeFilter === 'INVOICE') {
          const isInvoice = name.includes('rechnung') || name.includes('invoice') || subTypes.includes('invoice');
          if (!isInvoice) return false;
        } else if (docTypeFilter === 'CASH') {
          const isCash = name.includes('kasse') || name.includes('cash') || subTypes.includes('cash');
          if (!isCash) return false;
        } else if (docTypeFilter === 'OTHER') {
          const isOther = !name.includes('bank') && !name.includes('kontoauszug') && !name.includes('rechnung') && !name.includes('kasse');
          if (!isOther) return false;
        }
      }

      // Status Filter
      if (docStatusFilter !== 'ALL') {
        if (docStatusFilter === 'VERIFIED' && status !== 'VERIFIED' && status !== 'APPROVED') return false;
        if (docStatusFilter === 'EXPORTED' && status !== 'EXPORTED') return false;
        if (docStatusFilter === 'PROCESSING' && status !== 'PROCESSING') return false;
        if (docStatusFilter === 'READY' && status !== 'READY') return false;
      }

      // Search Filter
      if (docSearchQuery.trim()) {
        const q = docSearchQuery.trim().toLowerCase();
        const matches = name.includes(q) || path.includes(q) || subTypes.includes(q) || (d.id || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [currentClientDocs, docYearFilter, docMonthFilter, docCategoryFilter, docTypeFilter, docStatusFilter, docSearchQuery]);

  const resetDocFilters = () => {
    setDocSearchQuery('');
    setDocYearFilter('ALL');
    setDocMonthFilter('ALL');
    setDocCategoryFilter('ALL');
    setDocTypeFilter('ALL');
    setDocStatusFilter('ALL');
  };

  const isDocFilterActive = docSearchQuery.trim() !== '' || docYearFilter !== 'ALL' || docMonthFilter !== 'ALL' || docCategoryFilter !== 'ALL' || docTypeFilter !== 'ALL' || docStatusFilter !== 'ALL';

  // Format bytes helper
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Month names helper
  const monthNames: Record<string, { de: string; en: string }> = {
    '01': { de: '01 - Januar', en: '01 - January' },
    '02': { de: '02 - Februar', en: '02 - February' },
    '03': { de: '03 - März', en: '03 - March' },
    '04': { de: '04 - April', en: '04 - April' },
    '05': { de: '05 - Mai', en: '05 - May' },
    '06': { de: '06 - Juni', en: '06 - June' },
    '07': { de: '07 - Juli', en: '07 - July' },
    '08': { de: '08 - August', en: '08 - August' },
    '09': { de: '09 - September', en: '09 - September' },
    '10': { de: '10 - Oktober', en: '10 - October' },
    '11': { de: '11 - November', en: '11 - November' },
    '12': { de: '12 - Dezember', en: '12 - December' },
  };

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
        const createdName = newUserName;
        const createdNum = newUserClientNum;
        const wasClient = newUserRole === 'CLIENT';
        setNewUserName('');
        setNewUserEmail('');
        setNewUserClientNum('');
        success(isDe ? 'Benutzerkonto erfolgreich angelegt!' : 'User created successfully!', isDe ? 'Benutzerverwaltung' : 'User Management');
        await fetchData();
        window.dispatchEvent(new CustomEvent('fintax_doc_updated'));
        window.dispatchEvent(new CustomEvent('fintax_client_created'));
        if (wasClient) {
          const folderName = createdNum ? `${createdNum}_${createdName}` : createdName;
          setSelectedClientForTree(folderName);
        }
      } else {
        const data = await res.json();
        error(data.error || (isDe ? 'Fehler beim Erstellen des Benutzers' : 'Error creating user account'));
      }
    } catch (err: any) {
      error(`${isDe ? 'Serverfehler' : 'Server error'}: ${err?.message}`);
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
        info(isDe ? `Status für ${userItem.name} geändert.` : `Status updated for ${userItem.name}.`);
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
        success(isDe ? 'Mandantenzuweisung erfolgreich gespeichert.' : 'Assignment saved successfully.');
        await fetchData();
      }
    } catch (err: any) {
      error(err?.message || (isDe ? 'Zuweisung fehlgeschlagen' : 'Assignment failed'));
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
        info(isDe ? 'Zuweisung aufgehoben.' : 'Assignment removed.');
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
        success(data.message, isDe ? '2-Admin Löschfreigabe' : '2-Admin Deletion Approval');
        await fetchData();
      } else {
        error(data.error || (isDe ? 'Fehler bei der Freigabe' : 'Approval error'));
      }
    } catch (err: any) {
      error(err?.message || (isDe ? 'Löschfreigabe fehlgeschlagen' : 'Deletion approval failed'));
    }
  };

  const handleRejectDeletion = async (requestId: string) => {
    const notes = prompt(isDe ? 'Begründung für die Ablehnung:' : 'Reason for rejection:');
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
        info(isDe ? 'Löschantrag abgelehnt.' : 'Deletion request rejected.');
        await fetchData();
      }
    } catch (err: any) {
      alert(`${isDe ? 'Fehler' : 'Error'}: ${err?.message}`);
    }
  };

  const pendingDeletionsCount = deletionRequests.filter(d => d.status !== 'APPROVED_AND_DELETED' && d.status !== 'REJECTED').length;

  // =========================================================================
  // VIEW MODE A: DEDICATED FULL-PAGE CLIENT DOCUMENTS EXPLORER
  // Triggered when a user clicks any client row or "View Docs" button
  // =========================================================================
  if (selectedClientForDocs) {
    const resolvedClientNum = getClientNumber(selectedClientForDocs);
    const totalStorageBytes = currentClientDocs.reduce((acc, d) => acc + (d.size_bytes || 0), 0);
    const verifiedDocsCount = currentClientDocs.filter((d) => d.status === 'VERIFIED' || d.status === 'APPROVED' || d.status === 'EXPORTED').length;
    const processingDocsCount = currentClientDocs.filter((d) => d.status === 'PROCESSING').length;

    return (
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Navigation Breadcrumb Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1.5px solid #e2e8f0',
          paddingBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { setSelectedClientForDocs(null); resetDocFilters(); }}
              style={{
                background: '#ffffff',
                color: '#1e293b',
                border: '1.5px solid #cbd5e1',
                padding: '0.625rem 1.25rem',
                borderRadius: '0.625rem',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
            >
              <ArrowLeft size={16} />
              {isDe ? '← Zurück zur Benutzerverwaltung' : '← Back to Users'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
              <span>{isDe ? 'Administrator Portal' : 'Admin Portal'}</span>
              <span>/</span>
              <span>{isDe ? 'Mandanten' : 'Users'}</span>
              <span>/</span>
              <strong style={{ color: '#0f172a' }}>{selectedClientForDocs.name}</strong>
            </div>
          </div>

          {/* Quick Client Switcher Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#475569' }}>
              {isDe ? 'Mandant wechseln:' : 'Switch Client:'}
            </label>
            <select
              value={selectedClientForDocs.id}
              onChange={(e) => {
                const nextUser = users.find(u => u.id === e.target.value);
                if (nextUser) {
                  setSelectedClientForDocs(nextUser);
                  resetDocFilters();
                }
              }}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '0.5rem',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: '#0f172a',
                backgroundColor: '#ffffff',
                cursor: 'pointer',
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {getClientNumber(u) !== '—' ? `(${getClientNumber(u)})` : `(${u.role})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dedicated Client Hero Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #1d4ed8 100%)',
          color: '#ffffff',
          borderRadius: '1.25rem',
          padding: '2rem',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.35)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}>
          {/* Client Avatar & Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              fontWeight: 800,
              boxShadow: '0 0 0 4px rgba(255, 255, 255, 0.2)',
            }}>
              {selectedClientForDocs.name ? selectedClientForDocs.name.charAt(0).toUpperCase() : 'C'}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <h1 style={{ fontSize: '1.625rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                  {selectedClientForDocs.name}
                </h1>
                {resolvedClientNum !== '—' && (
                  <span style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    fontSize: '0.8125rem',
                    fontWeight: 800,
                    padding: '0.2rem 0.65rem',
                    borderRadius: '0.375rem',
                    letterSpacing: '0.05em',
                  }}>
                    {resolvedClientNum}
                  </span>
                )}
                <span style={{
                  background: selectedClientForDocs.is_active ? '#22c55e' : '#ef4444',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                }}>
                  {selectedClientForDocs.is_active ? (isDe ? 'Aktiv' : 'Active') : (isDe ? 'Gesperrt' : 'Disabled')}
                </span>
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.85 }}>
                {selectedClientForDocs.email} • {selectedClientForDocs.role}
              </div>
            </div>
          </div>

          {/* 4 Summary Metric Tiles */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(8px)', padding: '0.75rem 1.125rem', borderRadius: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.15)', minWidth: '110px' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <FileText size={12} />
                {isDe ? 'Belege gesamt' : 'Total Docs'}
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: 800, marginTop: '0.25rem' }}>
                {currentClientDocs.length}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(8px)', padding: '0.75rem 1.125rem', borderRadius: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.15)', minWidth: '110px' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <HardDrive size={12} />
                {isDe ? 'Speicherplatz' : 'Storage'}
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: 800, marginTop: '0.25rem' }}>
                {formatBytes(totalStorageBytes)}
              </div>
            </div>

            <div style={{ background: 'rgba(34, 197, 94, 0.2)', backdropFilter: 'blur(8px)', padding: '0.75rem 1.125rem', borderRadius: '0.75rem', border: '1px solid rgba(34, 197, 94, 0.35)', minWidth: '110px' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: '#86efac', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <FileCheck size={12} />
                {isDe ? 'Verifiziert' : 'Verified'}
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: 800, marginTop: '0.25rem', color: '#86efac' }}>
                {verifiedDocsCount}
              </div>
            </div>

            <div style={{ background: 'rgba(234, 179, 8, 0.2)', backdropFilter: 'blur(8px)', padding: '0.75rem 1.125rem', borderRadius: '0.75rem', border: '1px solid rgba(234, 179, 8, 0.35)', minWidth: '110px' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: '#fde047', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={12} />
                {isDe ? 'In Prüfung' : 'Processing'}
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: 800, marginTop: '0.25rem', color: '#fde047' }}>
                {processingDocsCount}
              </div>
            </div>
          </div>
        </div>

        {/* Filter Toolbar Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: '1rem',
          padding: '1.25rem 1.5rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9375rem', fontWeight: 800, color: '#0f172a' }}>
              <Filter size={18} color="#2563eb" />
              {isDe ? 'Belege filtern & durchsuchen' : 'Filter & Search Client Documents'}
              <span style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
              }}>
                {filteredClientDocs.length} / {currentClientDocs.length} {isDe ? 'Belege angezeigt' : 'documents shown'}
              </span>
            </div>

            {isDocFilterActive && (
              <button
                type="button"
                onClick={resetDocFilters}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  padding: '0.35rem 0.85rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <X size={13} />
                {isDe ? 'Filter zurücksetzen' : 'Reset Filters'}
              </button>
            )}
          </div>

          {/* Filter Inputs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', gridColumn: 'span 2' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={docSearchQuery}
                onChange={(e) => setDocSearchQuery(e.target.value)}
                placeholder={isDe ? 'Dateiname, Belegnr., Pfad suchen...' : 'Search filename, document #, path...'}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem 0.625rem 2.35rem',
                  borderRadius: '0.5rem',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.875rem',
                  color: '#0f172a',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {docSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDocSearchQuery('')}
                  style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Year Filter */}
            <div>
              <select
                value={docYearFilter}
                onChange={(e) => setDocYearFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="ALL">📅 {isDe ? 'Alle Jahre' : 'All Years'}</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            {/* Month Filter */}
            <div>
              <select
                value={docMonthFilter}
                onChange={(e) => setDocMonthFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="ALL">🗓️ {isDe ? 'Alle Monate' : 'All Months'}</option>
                {Object.entries(monthNames).map(([num, nameObj]) => (
                  <option key={num} value={num}>
                    {isDe ? nameObj.de : nameObj.en}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <select
                value={docCategoryFilter}
                onChange={(e) => setDocCategoryFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="ALL">🗂️ {isDe ? 'Alle Kategorien' : 'All Categories'}</option>
                <option value="01_FiBu">01_FiBu (Financial Accounting)</option>
                <option value="00_Schriftverkehr">00_Schriftverkehr (Correspondence)</option>
                <option value="02_LoBu">02_LoBu (Payroll)</option>
                <option value="03_Agenda">03_Agenda / 00_CSV</option>
              </select>
            </div>

            {/* Document Type Filter */}
            <div>
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="ALL">📄 {isDe ? 'Alle Belegarten' : 'All Document Types'}</option>
                <option value="BANK">{isDe ? 'Kontoauszug (Bank)' : 'Bank Statement'}</option>
                <option value="INVOICE">{isDe ? 'Rechnung (Ein-/Verkauf)' : 'Invoice (Purchase/Sale)'}</option>
                <option value="CASH">{isDe ? 'Kassenbeleg (Bargeld)' : 'Cash Receipt'}</option>
                <option value="OTHER">{isDe ? 'Sonstige Dokumente' : 'Other Documents'}</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={docStatusFilter}
                onChange={(e) => setDocStatusFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="ALL">🏷️ {isDe ? 'Alle Status' : 'All Statuses'}</option>
                <option value="VERIFIED">{isDe ? 'Verifiziert / Freigegeben' : 'Verified / Approved'}</option>
                <option value="EXPORTED">{isDe ? 'Exportiert (DATEV)' : 'Exported (DATEV)'}</option>
                <option value="PROCESSING">{isDe ? 'In Verarbeitung' : 'Processing'}</option>
                <option value="READY">{isDe ? 'Bereit' : 'Ready'}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Documents Table Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: '1rem',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          {filteredClientDocs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1.5rem', color: '#64748b' }}>
              <FolderOpen size={48} color="#94a3b8" style={{ margin: '0 auto 1rem auto' }} />
              <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a' }}>
                {currentClientDocs.length === 0
                  ? (isDe ? 'Keine Belege für diesen Mandanten gefunden.' : 'No documents uploaded for this client yet.')
                  : (isDe ? 'Keine Belege entsprechen den aktuellen Filtern.' : 'No documents match the current filter criteria.')}
              </div>
              <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {currentClientDocs.length > 0 && (
                  <button
                    type="button"
                    onClick={resetDocFilters}
                    style={{ background: '#2563eb', color: '#ffffff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {isDe ? 'Filter zurücksetzen' : 'Reset Filters'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.875rem 1.25rem' }}>{isDe ? 'Dokument / Dateiname' : 'Document / Filename'}</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>{isDe ? 'Kategorie & Typ' : 'Category & Type'}</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>{isDe ? 'Upload-Datum' : 'Upload Date'}</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>{isDe ? 'Dateigröße' : 'File Size'}</th>
                    <th style={{ padding: '0.875rem 1.25rem' }}>{isDe ? 'Status' : 'Status'}</th>
                    <th style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>{isDe ? 'Aktionen' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClientDocs.map((doc) => {
                    const isPdf = (doc.original_filename || '').toLowerCase().endsWith('.pdf');
                    const isCsv = (doc.original_filename || '').toLowerCase().endsWith('.csv');
                    const isXlsx = (doc.original_filename || '').toLowerCase().endsWith('.xlsx') || (doc.original_filename || '').toLowerCase().endsWith('.xls');

                    return (
                      <tr
                        key={doc.id}
                        style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <td style={{ padding: '0.875rem 1.25rem', maxWidth: '340px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                            <div style={{
                              marginTop: '2px',
                              padding: '0.4rem',
                              borderRadius: '0.375rem',
                              background: isPdf ? '#fee2e2' : isCsv ? '#e0f2fe' : isXlsx ? '#dcfce7' : '#f1f5f9',
                              color: isPdf ? '#dc2626' : isCsv ? '#0284c7' : isXlsx ? '#16a34a' : '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              {isPdf ? <FileText size={18} /> : isCsv ? <FileCode size={18} /> : isXlsx ? <FileSpreadsheet size={18} /> : <File size={18} />}
                            </div>
                            <div style={{ overflow: 'hidden' }}>
                              <div
                                title={doc.original_filename}
                                onClick={() => setPreviewDoc(doc)}
                                style={{
                                  fontWeight: 700,
                                  color: '#0f172a',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  cursor: 'pointer',
                                }}
                              >
                                {doc.original_filename}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                                {doc.relative_path || doc.file_path || '—'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '0.875rem 1.25rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{
                                background: doc.category.includes('01_FiBu') ? '#eff6ff' : doc.category.includes('02_LoBu') ? '#faf5ff' : '#fef3c7',
                                color: doc.category.includes('01_FiBu') ? '#1d4ed8' : doc.category.includes('02_LoBu') ? '#7e22ce' : '#b45309',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '0.375rem',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                              }}>
                                {doc.category}
                              </span>
                              {(() => {
                                const rawCh = (doc as any).paymentChannel || (
                                  (doc as any).uploadSlot === 'Kontoauszug' ? 'statement' :
                                  (doc as any).uploadSlot === 'Bankbelege' ? 'bank' :
                                  (doc as any).uploadSlot === 'Kassebelege' ? 'kasse' :
                                  /kontoauszug|1200[-_ ]?bank/i.test(doc.original_filename || '') ? 'statement' :
                                  /kasse/i.test(doc.original_filename || '') ? 'kasse' :
                                  /bankbeleg/i.test(doc.original_filename || '') ? 'bank' :
                                  'unknown'
                                );
                                const badgeMap: Record<string, { label: string; bg: string; color: string; border: string; icon: string }> = {
                                  statement: { label: 'Kontoauszug', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: '🏛️' },
                                  bank: { label: 'Bank', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: '💳' },
                                  kasse: { label: 'Kasse', bg: '#fffbeb', color: '#b45309', border: '#fde68a', icon: '🪙' },
                                  unknown: { label: 'Sonstiges', bg: '#f8fafc', color: '#475569', border: '#cbd5e1', icon: '📄' },
                                };
                                const cfg = badgeMap[rawCh] || badgeMap.unknown;
                                return (
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      color: cfg.color,
                                      background: cfg.bg,
                                      border: `1px solid ${cfg.border}`,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3,
                                    }}
                                  >
                                    <span>{cfg.icon}</span>
                                    <span>{cfg.label}</span>
                                  </span>
                                );
                              })()}
                            </div>
                            {doc.sub_types && doc.sub_types.length > 0 && (
                              <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                                {doc.sub_types.slice(0, 2).join(', ')}
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '0.875rem 1.25rem', color: '#475569' }}>
                          {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString(isDe ? 'de-DE' : 'en-US', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          }) : '—'}
                        </td>

                        <td style={{ padding: '0.875rem 1.25rem', color: '#64748b', fontWeight: 600 }}>
                          {formatBytes(doc.size_bytes)}
                        </td>

                        <td style={{ padding: '0.875rem 1.25rem' }}>
                          <span style={{
                            padding: '0.25rem 0.625rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background: doc.status === 'VERIFIED' || doc.status === 'APPROVED' ? '#dcfce7' : doc.status === 'EXPORTED' ? '#e0f2fe' : doc.status === 'PROCESSING' ? '#fef3c7' : '#f1f5f9',
                            color: doc.status === 'VERIFIED' || doc.status === 'APPROVED' ? '#15803d' : doc.status === 'EXPORTED' ? '#0369a1' : doc.status === 'PROCESSING' ? '#b45309' : '#475569',
                          }}>
                            {doc.status === 'VERIFIED' || doc.status === 'APPROVED' ? (isDe ? '✓ Verifiziert' : '✓ Verified') :
                             doc.status === 'EXPORTED' ? (isDe ? '✓ Exportiert' : '✓ Exported') :
                             doc.status === 'PROCESSING' ? (isDe ? '⏳ In Prüfung' : '⏳ Processing') :
                             doc.status}
                          </span>
                        </td>

                        <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {/* Preview Button */}
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              title={isDe ? 'Beleg-Vorschau öffnen' : 'Open document preview'}
                              style={{
                                background: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                padding: '0.4rem 0.75rem',
                                borderRadius: '0.5rem',
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                              }}
                            >
                              <Eye size={14} />
                              {isDe ? 'Vorschau' : 'Preview'}
                            </button>

                            {/* Excel Preview Export */}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const base = (doc.original_filename || 'SKR03').replace(/\.[^.]+$/, '');
                                  await downloadAuthenticatedFile(
                                    `${API_BASE}/documents/${doc.id}/skr03-xlsx`,
                                    `${base}_VORSCHAU.xlsx`
                                  );
                                } catch (err: any) {
                                  error(err?.message || (isDe ? 'Excel-Vorschau fehlgeschlagen.' : 'Excel preview download failed.'));
                                }
                              }}
                              title={isDe ? 'Nur Lese-Vorschau (_VORSCHAU) – kein DATEV-Import' : 'Read-only preview (_VORSCHAU) – not for DATEV import'}
                              style={{
                                background: '#faf5ff',
                                color: '#7e22ce',
                                border: '1px solid #e9d5ff',
                                padding: '0.4rem 0.65rem',
                                borderRadius: '0.5rem',
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <Download size={14} />
                              {isDe ? 'XLSX (Vorschau)' : 'Excel Preview'}
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

        {/* Inline Document Preview Modal */}
        {previewDoc && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            padding: '1.5rem',
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '1rem',
              width: '100%',
              maxWidth: '1050px',
              height: '88vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '1rem 1.5rem',
                borderBottom: '1.5px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                  <FileText size={20} color="#2563eb" />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '650px' }}>
                      {previewDoc.original_filename}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {previewDoc.category} • {formatBytes(previewDoc.size_bytes)} • {previewDoc.status}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await openAuthenticatedFileInNewTab(`${API_BASE}/documents/${previewDoc.id}/view`);
                      } catch (err: any) {
                        error(err?.message || (isDe ? 'Dokument konnte nicht geöffnet werden.' : 'Could not open document.'));
                      }
                    }}
                    style={{
                      background: '#eff6ff',
                      color: '#2563eb',
                      border: '1px solid #bfdbfe',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <ExternalLink size={13} />
                    {isDe ? 'In neuem Tab öffnen' : 'Open in New Tab'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      padding: '0.4rem',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{ flex: 1, backgroundColor: '#0f172a', position: 'relative' }}>
                {previewBlobUrl ? (
                  <iframe
                    src={previewBlobUrl}
                    title={previewDoc.original_filename}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      backgroundColor: '#ffffff',
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '0.9rem' }}>
                    {isDe ? 'Vorschau wird geladen…' : 'Loading preview…'}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '0.75rem 1.5rem',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                color: '#64748b',
              }}>
                <div>
                  ID: <span style={{ fontFamily: 'monospace', color: '#1e293b' }}>{previewDoc.id}</span>
                  {previewDoc.file_checksum && (
                    <span style={{ marginLeft: '1rem' }}>
                      SHA-256: <span style={{ fontFamily: 'monospace' }}>{previewDoc.file_checksum.slice(0, 16)}...</span>
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const base = (previewDoc.original_filename || 'SKR03').replace(/\.[^.]+$/, '');
                        await downloadAuthenticatedFile(
                          `${API_BASE}/documents/${previewDoc.id}/skr03-xlsx`,
                          `${base}_VORSCHAU.xlsx`
                        );
                      } catch (err: any) {
                        error(err?.message || (isDe ? 'Excel-Vorschau fehlgeschlagen.' : 'Excel preview download failed.'));
                      }
                    }}
                    style={{
                      background: '#faf5ff',
                      color: '#7e22ce',
                      border: '1px solid #e9d5ff',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    📊 {isDe ? 'Excel (Vorschau)' : 'Excel Preview'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    style={{
                      background: '#ffffff',
                      color: '#0f172a',
                      border: '1px solid #cbd5e1',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isDe ? 'Schließen' : 'Close'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW MODE B: MAIN ADMIN PORTAL DASHBOARD (Users list, Tabs, Deletions, Folders, Audit)
  // =========================================================================
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
            🛡️ {isDe ? 'Administrator-Konsole' : 'Admin & Governance Console'}
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
            {isDe ? 'Systemsteuerung & DSGVO Governance' : 'System Control & GDPR Governance'}
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9375rem' }}>
            {isDe
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
            {loading ? '...' : (isDe ? 'Aktualisieren' : 'Refresh')}
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {isDe ? 'Datenbank-Status' : 'Database Status'}
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
            {isDe ? '🛡️ 2-Admin Löschanträge' : '🛡️ 2-Admin Deletions'}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', marginTop: '0.25rem' }}>
            {pendingDeletionsCount} {isDe ? 'Offen' : 'Pending'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {isDe ? '§ 147 AO / GoBD Aufbewahrungsprüfung' : '§ 147 AO / GoBD Retention Check'}
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {isDe ? '🗂️ Mandanten-Ordner' : '🗂️ Client Folders'}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>
            {clientFolderList.length} {isDe ? 'Mandanten' : 'Clients'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {isDe ? '00_ bis 03_ Struktur aktiv' : '00_ to 03_ Structure active'}
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {isDe ? 'DSGVO Revisionsprotokolle' : 'Audit Trail Entries'}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.25rem' }}>
            {logs.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {isDe ? 'Unveränderliche Historie' : 'Immutable audit trail'}
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
          {isDe ? 'Benutzer & Rollen' : 'Users & Roles'}
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
          {isDe ? 'Zuweisungen' : 'Assignments'}
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
          {isDe ? '🛡️ 2-Admin Löschanträge' : '🛡️ 2-Admin Deletions'}
          {pendingDeletionsCount > 0 && (
            <span style={{ background: '#ffffff', color: '#b91c1c', padding: '0.1rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 800 }}>
              {pendingDeletionsCount}
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
          {isDe ? '🗂️ Mandanten-Ordnerbaum (00-03)' : '🗂️ Client Folder Tree (00-03)'}
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
          {isDe ? 'DSGVO Audit-Logs' : 'Compliance Audit Logs'}
        </button>
      </div>

      {/* TAB 1: USERS & ROLES */}
      {activeTab === 'USERS' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                👥 {isDe ? 'Benutzerverwaltung (RBAC Rollen)' : 'User Management (RBAC Roles)'}
              </h2>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                {isDe
                  ? 'Klicken Sie auf einen Mandanten, um dessen Belege auf einer eigenen Seite anzuzeigen'
                  : 'Click on any client to open their dedicated documents page'}
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
              + {isDe ? 'Benutzer hinzufügen' : 'Add User'}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>{isDe ? 'Name / Mandant' : 'Name / Client'}</th>
                  <th style={{ padding: '0.75rem 1rem' }}>{isDe ? 'E-Mail / Login' : 'Email / Login'}</th>
                  <th style={{ padding: '0.75rem 1rem' }}>{isDe ? 'Mandantennummer' : 'Client Number'}</th>
                  <th style={{ padding: '0.75rem 1rem' }}>{isDe ? 'Rolle & 2FA' : 'Role & 2FA'}</th>
                  <th style={{ padding: '0.75rem 1rem' }}>{isDe ? 'Belege' : 'Documents'}</th>
                  <th style={{ padding: '0.75rem 1rem' }}>{isDe ? 'Status' : 'Status'}</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{isDe ? 'Aktionen' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const clientDocs = getClientDocs(u);
                  const docCount = clientDocs.length;
                  const resolvedNum = getClientNumber(u);

                  return (
                    <tr
                      key={u.id}
                      onClick={() => {
                        setSelectedClientForDocs(u);
                        resetDocFilters();
                      }}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: '#0f172a',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                          title={isDe ? 'Klicken, um Belege dieses Mandanten anzuzeigen' : 'Click to open client documents page'}
                        >
                          <span style={{ color: '#1d4ed8' }}>{u.name}</span>
                          <ChevronRight size={14} color="#94a3b8" />
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>{u.email}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#0284c7', fontWeight: 700 }}>
                        {resolvedNum}
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
                          {u.role} {u.role !== 'CLIENT' && (isDe ? '🔒 (2FA aktiv)' : '🔒 (2FA active)')}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            background: docCount > 0 ? '#eff6ff' : '#f8fafc',
                            color: docCount > 0 ? '#1d4ed8' : '#64748b',
                            border: docCount > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <FileText size={13} />
                          {docCount} {isDe ? (docCount === 1 ? 'Beleg' : 'Belege') : (docCount === 1 ? 'Doc' : 'Docs')}
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
                          {u.is_active ? (isDe ? 'Aktiv' : 'Active') : (isDe ? 'Gesperrt' : 'Disabled')}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedClientForDocs(u);
                              resetDocFilters();
                            }}
                            style={{
                              background: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '0.375rem',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                            }}
                          >
                            <Eye size={13} />
                            {isDe ? 'Belege einsehen' : 'View Docs'}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleUserStatus(u);
                            }}
                            style={{
                              background: 'none',
                              border: '1px solid #cbd5e1',
                              padding: '0.35rem 0.6rem',
                              borderRadius: '0.375rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              color: u.is_active ? '#b91c1c' : '#15803d',
                              fontWeight: 600,
                            }}
                          >
                            {u.is_active ? (isDe ? 'Deaktivieren' : 'Deactivate') : (isDe ? 'Aktivieren' : 'Activate')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ASSIGNMENTS */}
      {activeTab === 'ASSIGNMENTS' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
            🔗 {isDe ? 'Kanzlei-Zuweisungen (Mandant zu Sachbearbeiter)' : 'Firm Assignments (Client to Staff)'}
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
                <option key={c.id} value={c.id} style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>{c.name} ({getClientNumber(c) !== '—' ? getClientNumber(c) : c.email})</option>
              ))}
            </select>
            <button
              type="submit"
              style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontWeight: 700, cursor: 'pointer' }}
            >
              + {isDe ? 'Zuweisen' : 'Assign'}
            </button>
          </form>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem' }}>{isDe ? 'Sachbearbeiter' : 'Staff Member'}</th>
                  <th style={{ padding: '0.75rem' }}>{isDe ? 'Mandant' : 'Client'}</th>
                  <th style={{ padding: '0.75rem' }}>{isDe ? 'Zuweisungsdatum' : 'Assignment Date'}</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>{isDe ? 'Aktion' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      {isDe ? 'Keine Zuweisungen hinterlegt.' : 'No staff-client assignments created yet.'}
                    </td>
                  </tr>
                ) : (
                  assignments.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{a.staff_name || a.staff_user_id}</td>
                      <td style={{ padding: '0.75rem' }}>{a.client_name || a.client_user_id}</td>
                      <td style={{ padding: '0.75rem', color: '#64748b' }}>
                        {new Date(a.assigned_at).toLocaleDateString(isDe ? 'de-DE' : 'en-US')}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleRemoveAssignment(a.staff_user_id, a.client_user_id)}
                          style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                          {isDe ? 'Entfernen' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: 2-ADMIN DELETION APPROVALS */}
      {activeTab === 'DELETIONS' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={22} />
              {isDe ? '2-Administrator-Löschprüfung (§ 147 AO / GoBD)' : '2-Admin Deletion Approvals (§ 147 AO / GoBD)'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
              {isDe
                ? 'Gemäß FinTax-Sicherheitsarchitektur kann kein Beleg eigenmächtig gelöscht werden. Jede Löschung erfordert die Prüfung der gesetzlichen Aufbewahrungsfrist (10 Jahre für FiBu) und die Freigabe durch ZWEI verschiedene Administratoren.'
                : 'Under FinTax security policy, no document can be deleted unilaterally. Two independent administrators must approve after checking the 10-year statutory retention period.'}
            </p>
          </div>

          {deletionRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
              <ShieldCheck size={48} color="#10b981" style={{ margin: '0 auto 1rem auto' }} />
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                {isDe ? 'Keine offenen Löschanträge' : 'No open deletion requests'}
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                {isDe ? 'Alle Mandantenbelege sind revisionssicher gespeichert.' : 'All client documents are securely archived in compliance with regulations.'}
              </div>
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
                          {req.status === 'PENDING_FIRST_APPROVAL' && (isDe ? '⏳ WARTET AUF 1. ADMIN-FREIGABE' : '⏳ AWAITING 1ST ADMIN APPROVAL')}
                          {req.status === 'FIRST_APPROVAL_GRANTED' && (isDe ? '⏳ 1/2 FREIGABE ERTEILT (ZWEITER ADMIN BENÖTIGT)' : '⏳ 1/2 APPROVED (2ND ADMIN NEEDED)')}
                          {req.status === 'APPROVED_AND_DELETED' && (isDe ? '✓ VOLLSTÄNDIG GELÖSCHT DURCH 2 ADMINS' : '✓ FULLY DELETED BY 2 ADMINS')}
                          {req.status === 'REJECTED' && (isDe ? '❌ ABGELEHNT' : '❌ REJECTED')}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                        {isDe ? 'Mandant' : 'Client'}: <strong>{req.client_id}</strong> • {isDe ? 'Beantragt von' : 'Requested by'}: <strong>{req.requested_by_name}</strong> • {isDe ? 'Grund' : 'Reason'}: "{req.reason}"
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
                          {req.status === 'PENDING_FIRST_APPROVAL'
                            ? (isDe ? '1. Admin-Freigabe erteilen' : 'Grant 1st Admin Approval')
                            : (isDe ? '2. Admin-Freigabe erteilen (Löschen)' : 'Grant 2nd Admin Approval (Delete)')}
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
                          {isDe ? 'Ablehnen' : 'Reject'}
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
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                      {isDe ? '1. Freigabe' : '1st Approval'}: {req.approval_1_admin_name ? `✓ ${req.approval_1_admin_name} (${new Date(req.approval_1_at!).toLocaleDateString(isDe ? 'de-DE' : 'en-US')})` : `— ${isDe ? 'Noch offen' : 'Pending'}`}
                    </div>
                    <div>
                      {isDe ? '2. Freigabe' : '2nd Approval'}: {req.approval_2_admin_name ? `✓ ${req.approval_2_admin_name} (${new Date(req.approval_2_at!).toLocaleDateString(isDe ? 'de-DE' : 'en-US')})` : `— ${isDe ? 'Noch offen' : 'Pending'}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CLIENT FOLDER TREE */}
      {activeTab === 'FOLDERS' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                🗂️ Shared with me &gt; _INBOX &gt; 01_Clients
              </h2>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                {isDe
                  ? 'Mandanten-Ordnerstruktur: 00_Correspondence, 01_Financial Accounting – FiBu (Jahr/Monat/00_CSV), 02_Payroll - Lohn'
                  : 'Client folder structure: 00_Correspondence, 01_Financial Accounting – FiBu (Year/Month/00_CSV), 02_Payroll - Lohn'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                {isDe ? 'Ansicht / Mandant:' : 'View / Client:'}
              </label>
              <select
                value={selectedClientForTree || 'ALL'}
                onChange={(e) => setSelectedClientForTree(e.target.value)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontWeight: 600, color: '#0f172a', backgroundColor: '#ffffff' }}
              >
                <option value="ALL">📁 _INBOX ({isDe ? 'Alle Mandanten / 01_Clients' : 'All Clients / 01_Clients'})</option>
                {clientFolderList.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Folder Hierarchy Legend */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 700, color: '#1e40af' }}>00_Correspondence - {isDe ? 'Schriftverkehr' : 'Correspondence'}</div>
              <div style={{ color: '#3b82f6', fontSize: '0.75rem' }}>{isDe ? 'FinTax, Gründung, Finanzamt' : 'FinTax, Formation, Tax Office'}</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 700, color: '#166534' }}>01_Financial Accounting – FiBu</div>
              <div style={{ color: '#15803d', fontSize: '0.75rem' }}>{isDe ? 'Jahr ➔ Monat (01–12) ➔ PDFs & 00_CSV' : 'Year ➔ Month (01–12) ➔ PDFs & 00_CSV'}</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#faf5ff', border: '1px solid #e9d5ff', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 700, color: '#6b21a8' }}>02_Payroll - {isDe ? 'Lohn' : 'Payroll'}</div>
              <div style={{ color: '#7e22ce', fontSize: '0.75rem' }}>{isDe ? 'Lohnabrechnungen, Krankenkasse, SOKA' : 'Payroll Statements, Health Insurance, SOKA'}</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#fdf2f8', border: '1px solid #fbcfe8', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 700, color: '#9d174d' }}>00_CSV ({isDe ? 'im Monatsordner' : 'in month folder'})</div>
              <div style={{ color: '#be185d', fontSize: '0.75rem' }}>{isDe ? 'SKR03 CSV & Excel Exportdateien' : 'SKR03 CSV & Excel export files'}</div>
            </div>
          </div>

          <FileExplorer
            clientId={selectedClientForTree || 'ALL'}
            lang={lang}
            startAtInbox={!selectedClientForTree || selectedClientForTree === 'ALL'}
          />
        </div>
      )}

      {/* TAB 5: COMPLIANCE AUDIT LOGS */}
      {activeTab === 'AUDIT' && (
        <div style={{ background: '#ffffff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                📜 {isDe ? 'Unveränderliches DSGVO-Auditprotokoll' : 'Immutable GDPR Audit Log'}
              </h2>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                {isDe
                  ? 'Logins, 2FA-Validierungen, Uploads, Exporte und 2-Admin Freigaben'
                  : 'Logins, 2FA validations, uploads, exports, and 2-admin approvals'}
              </div>
            </div>

            <select
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.8125rem', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 600 }}
            >
              <option value="ALL">{isDe ? 'Alle Aktionen' : 'All Actions'}</option>
              <option value="STAFF_OTP_GENERATED">{isDe ? '2FA OTP Generiert' : '2FA OTP Generated'}</option>
              <option value="STAFF_2FA_VERIFIED_SUCCESS">{isDe ? '2FA Bestätigt' : '2FA Verified'}</option>
              <option value="DELETION_REQUESTED">{isDe ? 'Löschantrag gestellt' : 'Deletion Requested'}</option>
              <option value="DELETION_FIRST_APPROVAL">{isDe ? '1. Admin-Freigabe' : '1st Admin Approval'}</option>
              <option value="DELETION_FINAL_EXECUTED_2_ADMIN">{isDe ? '2. Admin-Freigabe (Endgültig)' : '2nd Admin Approval (Final)'}</option>
              <option value="USER_LOGIN">{isDe ? 'Standard Login' : 'Standard Login'}</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.625rem 0.75rem' }}>{isDe ? 'Zeitpunkt' : 'Timestamp'}</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>{isDe ? 'Benutzer-ID' : 'User ID'}</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>{isDe ? 'Aktion' : 'Action'}</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>{isDe ? 'Bereich' : 'Resource'}</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>{isDe ? 'IP-Adresse' : 'IP Address'}</th>
                  <th style={{ padding: '0.625rem 0.75rem' }}>{isDe ? 'Details' : 'Details'}</th>
                </tr>
              </thead>
              <tbody>
                {(auditFilter === 'ALL' ? logs : logs.filter(l => l.action === auditFilter)).map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.625rem 0.75rem', color: '#64748b' }}>
                      {new Date(log.timestamp).toLocaleString(isDe ? 'de-DE' : 'en-US')}
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
              + {isDe ? 'Neues Benutzerkonto anlegen' : 'Create User Account'}
            </h3>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  {isDe ? 'Name' : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder={isDe ? 'z.B. Dr. Michael Bergmann' : 'e.g. Dr. Michael Bergmann'}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  {isDe ? 'E-Mail' : 'Email Address'}
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder={isDe ? 'z.B. bergmann@fintax.de' : 'e.g. bergmann@fintax.de'}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  {isDe ? 'Mandantennummer (Optional)' : 'Client Number (Optional)'}
                </label>
                <input
                  type="text"
                  value={newUserClientNum}
                  onChange={(e) => setNewUserClientNum(e.target.value)}
                  placeholder={isDe ? 'z.B. KD-10045' : 'e.g. CL-10045'}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  {isDe ? 'Rolle' : 'Role'}
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as any)}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="CLIENT" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>
                    CLIENT — {isDe ? 'Mandant (Direkt-Login mit Mandantennr.)' : 'Client (Direct login with Client ID)'}
                  </option>
                  <option value="STAFF" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>
                    STAFF — {isDe ? 'Kanzlei / Fachangestellter (🔒 2FA E-Mail OTP)' : 'Firm Staff / Accountant (🔒 2FA Email OTP)'}
                  </option>
                  <option value="ADMIN" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>
                    ADMIN — {isDe ? 'Administrator (🔒 2FA E-Mail OTP + 2-Admin Freigabe)' : 'Administrator (🔒 2FA Email OTP + 2-Admin Approval)'}
                  </option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  {isDe ? 'Passwort' : 'Password'}
                </label>
                <input
                  type="text"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder={isDe ? 'Initialpasswort eingeben...' : 'Enter initial password...'}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #cbd5e1', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
                >
                  {isDe ? 'Abbrechen' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#4c1d95', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
                >
                  {isDe ? 'Konto erstellen' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
