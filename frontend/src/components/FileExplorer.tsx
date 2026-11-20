import React, { useState, useEffect } from 'react';
import type { Language } from '../translations';

const API_BASE =
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
    ? '/api'
    : 'http://127.0.0.1:5000/api';

export interface FolderNode {
  name: string;
  path: string;
  relativePath?: string;
  type: 'directory' | 'file';
  sizeBytes?: number;
  fileCount?: number;
  children?: FolderNode[];
}

const MONTH_LABELS: Record<string, { de: string; en: string }> = {
  '01': { de: '01 (Januar)', en: '01 (January)' },
  '02': { de: '02 (Februar)', en: '02 (February)' },
  '03': { de: '03 (März)', en: '03 (March)' },
  '04': { de: '04 (April)', en: '04 (April)' },
  '05': { de: '05 (Mai)', en: '05 (May)' },
  '06': { de: '06 (Juni)', en: '06 (June)' },
  '07': { de: '07 (Juli)', en: '07 (July)' },
  '08': { de: '08 (August)', en: '08 (August)' },
  '09': { de: '09 (September)', en: '09 (September)' },
  '10': { de: '10 (Oktober)', en: '10 (October)' },
  '11': { de: '11 (November)', en: '11 (November)' },
  '12': { de: '12 (Dezember)', en: '12 (December)' },
};

interface FileExplorerProps {
  lang: Language;
  clientId: string;
  /** If true, uses the dark theme (staff/admin view) */
  darkTheme?: boolean;
  /** If true, starts at _INBOX / 01_Clients level (for Admin view) */
  startAtInbox?: boolean;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  lang,
  clientId,
  darkTheme = false,
  startAtInbox = false,
}) => {
  const [rootTree, setRootTree] = useState<FolderNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'drive' | 'tree'>('drive');
  const [breadcrumbNodes, setBreadcrumbNodes] = useState<FolderNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/storage/inbox-tree?client_id=${encodeURIComponent(clientId || '')}`);
      if (res.ok) {
        const data: FolderNode = await res.json();
        setRootTree(data);

        // Build initial breadcrumb path:
        // Shared with me -> _INBOX -> 01_Clients (-> <Client> if clientId is specified and not 'ALL')
        const trail: FolderNode[] = [data];
        const inboxNode = data.children?.find((c) => c.name === '_INBOX');
        if (inboxNode) {
          trail.push(inboxNode);
          const clientsNode = inboxNode.children?.find((c) => c.name === '01_Clients');
          if (clientsNode) {
            trail.push(clientsNode);
            // If a specific client is selected (not 'ALL' and not empty), drill down to that client
            if (clientId && clientId !== 'ALL') {
              const needle = clientId.toLowerCase();
              const matchedClient = clientsNode.children?.find(
                (c) =>
                  c.name.toLowerCase() === needle ||
                  c.name.toLowerCase().includes(needle) ||
                  needle.includes(c.name.toLowerCase())
              );
              if (matchedClient) {
                trail.push(matchedClient);
              }
            }
          }
        }
        setBreadcrumbNodes(trail);

        // Also auto-expand top nodes for tree view
        const exp = new Set<string>();
        trail.forEach((n) => exp.add(n.path));
        setExpandedPaths(exp);
      } else {
        setError(lang === 'de' ? 'Ordnerstruktur konnte nicht geladen werden.' : 'Failed to load folder structure.');
      }
    } catch (err) {
      console.error('Error fetching folder tree:', err);
      setError(lang === 'de' ? 'Verbindungsfehler beim Laden der Ordner.' : 'Connection error loading folders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
    const handleUpdate = () => fetchTree();
    window.addEventListener('fintax_doc_updated', handleUpdate);
    window.addEventListener('fintax_client_created', handleUpdate);
    return () => {
      window.removeEventListener('fintax_doc_updated', handleUpdate);
      window.removeEventListener('fintax_client_created', handleUpdate);
    };
  }, [clientId, startAtInbox]);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileDownloadUrl = (node: FolderNode) => {
    if (!node.relativePath) return '#';
    return `${API_BASE}/storage/download?relPath=${encodeURIComponent(node.relativePath)}`;
  };

  const openFolderInDriveView = (node: FolderNode) => {
    if (node.type !== 'directory') return;
    setBreadcrumbNodes((prev) => [...prev, node]);

    if (node.name.includes('Financial Accounting') || node.name.includes('FiBu')) {
      fetch(`${API_BASE}/google-drive/ensure-financial-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          year: new Date().getFullYear(),
        }),
      }).catch(() => { });
    }
  };

  const jumpToBreadcrumbIndex = (idx: number) => {
    setBreadcrumbNodes((prev) => prev.slice(0, idx + 1));
  };

  const toggleExpand = (nodePath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(nodePath)) {
        next.delete(nodePath);
      } else {
        next.add(nodePath);
      }
      return next;
    });
  };

  // Dynamic theming
  const bg = darkTheme ? '#0f172a' : '#ffffff';
  const bgHover = darkTheme ? 'rgba(255,255,255,0.05)' : '#f8fafc';
  const border = darkTheme ? '#1e293b' : '#e2e8f0';
  const textMain = darkTheme ? '#f1f5f9' : '#1e293b';
  const textMuted = darkTheme ? '#94a3b8' : '#64748b';
  const textDim = darkTheme ? '#64748b' : '#94a3b8';

  const currentDriveNode =
    breadcrumbNodes.length > 0 ? breadcrumbNodes[breadcrumbNodes.length - 1] : rootTree;

  const getFileIcon = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 4,
            background: '#ef4444',
            color: '#fff',
            fontSize: '0.625rem',
            fontWeight: 800,
          }}
        >
          PDF
        </span>
      );
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 4,
            background: '#16a34a',
            color: '#fff',
            fontSize: '0.625rem',
            fontWeight: 800,
          }}
        >
          XLS
        </span>
      );
    }
    if (lower.endsWith('.csv')) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 4,
            background: '#0284c7',
            color: '#fff',
            fontSize: '0.625rem',
            fontWeight: 800,
          }}
        >
          CSV
        </span>
      );
    }
    return <span style={{ fontSize: '1.125rem' }}>📄</span>;
  };

  const renderTreeNode = (node: FolderNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedPaths.has(node.path);

    if (node.type === 'file') {
      return (
        <a
          key={node.path}
          href={getFileDownloadUrl(node)}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.5rem 0.75rem',
            paddingLeft: `${depth * 1.25 + 1.75}rem`,
            fontSize: '0.8125rem',
            color: textMain,
            textDecoration: 'none',
            borderBottom: `1px solid ${border}`,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = bgHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {getFileIcon(node.name)}
          <span style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.78rem', wordBreak: 'break-all' }}>
            {node.name}
          </span>
          <span style={{ fontSize: '0.72rem', color: textDim, whiteSpace: 'nowrap' }}>
            {formatSize(node.sizeBytes)}
          </span>
        </a>
      );
    }

    const monthHint = MONTH_LABELS[node.name];

    return (
      <div key={node.path}>
        <div
          onClick={() => toggleExpand(node.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.55rem 0.75rem',
            paddingLeft: `${depth * 1.25 + 1}rem`,
            fontSize: '0.84rem',
            fontWeight: 600,
            color: textMain,
            borderBottom: `1px solid ${border}`,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = bgHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span
            style={{
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              display: 'inline-block',
              fontSize: '0.625rem',
              color: textMuted,
            }}
          >
            ▶
          </span>
          <span style={{ fontSize: '1rem' }}>{node.name === '00_CSV' ? '📊' : '📁'}</span>
          <span style={{ flex: 1 }}>
            {node.name}
            {monthHint ? (
              <span style={{ marginLeft: 8, fontSize: '0.75rem', fontWeight: 400, color: textMuted }}>
                — {lang === 'de' ? monthHint.de : monthHint.en}
              </span>
            ) : null}
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              color: textDim,
              background: darkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              padding: '0.125rem 0.5rem',
              borderRadius: '9999px',
            }}
          >
            {node.fileCount || 0} {lang === 'de' ? 'Dateien' : 'files'}
          </span>
        </div>

        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
            {node.children.length === 0 && (
              <div
                style={{
                  padding: '0.5rem 1rem',
                  paddingLeft: `${(depth + 1) * 1.25 + 1.75}rem`,
                  fontSize: '0.75rem',
                  color: textDim,
                  fontStyle: 'italic',
                }}
              >
                {lang === 'de' ? 'Ordner ist leer' : 'Empty folder'}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        background: bg,
        borderRadius: '1rem',
        border: `1px solid ${border}`,
        overflow: 'hidden',
        boxShadow: darkTheme ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          background: darkTheme
            ? 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)'
            : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          padding: '0.9rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🗂️</span>
            {lang === 'de'
              ? 'Google Drive Ordnerstruktur (Shared with me > _INBOX > 01_Clients)'
              : 'Google Drive Folder Hierarchy (Shared with me > _INBOX > 01_Clients)'}
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.82)' }}>
            {lang === 'de'
              ? '01_Financial Accounting – FiBu ➔ Jahr ➔ Monat (01–12) ➔ PDF & 00_CSV (SKR03)'
              : '01_Financial Accounting – FiBu ➔ Year ➔ Month (01–12) ➔ PDF & 00_CSV (SKR03)'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setViewMode(viewMode === 'drive' ? 'tree' : 'drive')}
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              padding: '0.375rem 0.75rem',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {viewMode === 'drive'
              ? lang === 'de'
                ? '🌳 Baumansicht'
                : '🌳 Tree View'
              : lang === 'de'
                ? '📁 Drive-Ansicht'
                : '📁 Drive View'}
          </button>

          <button
            onClick={fetchTree}
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              padding: '0.375rem 0.75rem',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↻ {lang === 'de' ? 'Aktualisieren' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Google Drive Style Breadcrumb Bar */}
      {viewMode === 'drive' && breadcrumbNodes.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.35rem',
            padding: '0.75rem 1.25rem',
            background: darkTheme ? '#1e293b' : '#f8fafc',
            borderBottom: `1px solid ${border}`,
            fontSize: '0.9rem',

          }}
        >
          {breadcrumbNodes.map((bNode, index) => {
            const isLast = index === breadcrumbNodes.length - 1;
            return (
              <React.Fragment key={bNode.path}>
                <button
                  onClick={() => jumpToBreadcrumbIndex(index)}
                  style={{
                    background: isLast ? (darkTheme ? '#334155' : '#e0f2fe') : 'transparent',
                    color: isLast ? (darkTheme ? '#38bdf8' : '#0369a1') : textMain,
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.25rem 0.55rem',
                    fontWeight: isLast ? 700 : 500,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  {index === 0 ? '👥 ' : ''}
                  {bNode.name}
                </button>
                {!isLast && (
                  <span style={{ color: textDim, fontWeight: 600, fontSize: '0.85rem' }}>›</span>
                )}
              </React.Fragment>
            );
          })}

          {breadcrumbNodes.length > 1 && (
            <button
              onClick={() => jumpToBreadcrumbIndex(breadcrumbNodes.length - 2)}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: `1px solid ${border}`,
                color: textMuted,
                borderRadius: '0.375rem',
                padding: '0.2rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⬅ {lang === 'de' ? 'Zurück' : 'Back'}
            </button>
          )}
        </div>
      )}

      {/* Body Content */}
      <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: textMuted, fontSize: '0.875rem' }}>
            ⏳ {lang === 'de' ? 'Ordnerstruktur wird geladen...' : 'Loading folder hierarchy...'}
          </div>
        )}

        {error && (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.875rem' }}>
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && viewMode === 'drive' && currentDriveNode && (
          <div>
            {/* Table Column Header like Google Drive */}
            <div
              className="fintax-drive-header"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 140px 120px 130px',
                padding: '0.6rem 1.25rem',
                borderBottom: `1px solid ${border}`,
                fontSize: '0.75rem',
                fontWeight: 700,
                color: textMuted,
                background: darkTheme ? 'rgba(255,255,255,0.02)' : '#fcfcfd',
              }}
            >
              <div>{lang === 'de' ? 'Name ↑' : 'Name ↑'}</div>
              <div>{lang === 'de' ? 'Eigentümer' : 'Owner'}</div>
              <div>{lang === 'de' ? 'Elemente / Größe' : 'Items / Size'}</div>
              <div style={{ textAlign: 'right' }}>{lang === 'de' ? 'Aktion' : 'Action'}</div>
            </div>

            {currentDriveNode.children && currentDriveNode.children.length > 0 ? (
              currentDriveNode.children.map((item) => {
                const isDir = item.type === 'directory';
                const monthHint = MONTH_LABELS[item.name];

                return (
                  <div
                    key={item.path}
                    className="fintax-drive-row"
                    onClick={() => {
                      if (isDir) openFolderInDriveView(item);
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 140px 120px 130px',
                      alignItems: 'center',
                      padding: '0.7rem 1.25rem',
                      borderBottom: `1px solid ${border}`,
                      fontSize: '0.85rem',
                      color: textMain,
                      cursor: isDir ? 'pointer' : 'default',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = bgHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: isDir ? 600 : 500 }}>
                      {isDir ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            background: item.name === '00_CSV' ? '#dcfce7' : '#f1f5f9',
                            color: item.name === '00_CSV' ? '#166534' : '#334155',
                            fontSize: '1rem',
                          }}
                        >
                          {item.name === '00_CSV' ? '📊' : '📁'}
                        </span>
                      ) : (
                        getFileIcon(item.name)
                      )}

                      <div>
                        <span>{item.name}</span>
                        {monthHint && (
                          <span style={{ marginLeft: 8, fontSize: '0.75rem', fontWeight: 400, color: textMuted }}>
                            — {lang === 'de' ? monthHint.de : monthHint.en}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: textMuted }}>
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#15803d',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                        }}
                      >
                        F
                      </span>
                      <span>fintax.de</span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: textMuted }}>
                      {isDir
                        ? `${item.fileCount || 0} ${lang === 'de' ? 'Dateien' : 'files'}`
                        : formatSize(item.sizeBytes)}

                    </div>

                    <div style={{ textAlign: 'right' }}>
                      {isDir ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openFolderInDriveView(item);
                          }}
                          style={{
                            background: darkTheme ? '#1e293b' : '#ffffffff',
                            color: textMain,
                            border: `1px solid ${border}`,
                            borderRadius: '0.375rem',
                            padding: '0.25rem 0.65rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {lang === 'de' ? 'Öffnen →' : 'Open →'}
                        </button>
                      ) : (
                        <a
                          href={getFileDownloadUrl(item)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'inline-block',
                            background: '#0284c7',
                            color: '#ffffff',
                            textDecoration: 'none',
                            borderRadius: '0.375rem',
                            padding: '0.28rem 0.65rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          {item.name.toLowerCase().endsWith('.pdf')
                            ? lang === 'de'
                              ? '📄 PDF öffnen'
                              : '📄 Open PDF'
                            : lang === 'de'
                              ? '⬇ Download'
                              : '⬇ Download'}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: textDim, fontSize: '0.85rem', fontStyle: 'italic' }}>
                {lang === 'de' ? 'Dieser Ordner ist noch leer.' : 'This folder is currently empty.'}
              </div>
            )}
          </div>
        )}

        {!loading && !error && viewMode === 'tree' && rootTree && (
          <div>{renderTreeNode(rootTree, 0)}</div>
        )}
      </div>
    </div>
  );
};
