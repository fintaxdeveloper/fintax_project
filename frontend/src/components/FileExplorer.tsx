import React, { useState, useEffect } from 'react';
import type { Language } from '../translations';

const API_BASE = 'http://127.0.0.1:5000/api';

interface FolderNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  sizeBytes?: number;
  fileCount?: number;
  children?: FolderNode[];
}

const CATEGORY_META: Record<string, { icon: string; colorBg: string; colorBorder: string; colorText: string }> = {
  '00_Schriftverkehr': {
    icon: '📬',
    colorBg: 'rgba(168, 85, 247, 0.1)',
    colorBorder: 'rgba(168, 85, 247, 0.35)',
    colorText: '#c084fc',
  },
  '01_FiBu': {
    icon: '📊',
    colorBg: 'rgba(59, 130, 246, 0.1)',
    colorBorder: 'rgba(59, 130, 246, 0.35)',
    colorText: '#60a5fa',
  },
  '02_LoBu': {
    icon: '👥',
    colorBg: 'rgba(16, 185, 129, 0.1)',
    colorBorder: 'rgba(16, 185, 129, 0.35)',
    colorText: '#34d399',
  },
  '03_Agenda': {
    icon: '📋',
    colorBg: 'rgba(245, 158, 11, 0.1)',
    colorBorder: 'rgba(245, 158, 11, 0.35)',
    colorText: '#fbbf24',
  },
};

const CATEGORY_LABELS: Record<string, { de: string; en: string }> = {
  '00_Schriftverkehr': { de: 'Schriftverkehr & Behörden', en: 'Correspondence & Authorities' },
  '01_FiBu': { de: 'Finanzbuchhaltung (FiBu)', en: 'Financial Accounting (FiBu)' },
  '02_LoBu': { de: 'Lohnbuchhaltung (LoBu)', en: 'Payroll Accounting (LoBu)' },
  '03_Agenda': { de: 'Agenda SKR03 Übergabe', en: 'Agenda SKR03 Exports' },
};

interface FileExplorerProps {
  lang: Language;
  clientId: string;
  /** If true, uses the dark theme (staff/admin view) */
  darkTheme?: boolean;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ lang, clientId, darkTheme = false }) => {
  const [tree, setTree] = useState<FolderNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/storage/clients/${clientId}/tree`);
      if (res.ok) {
        const data = await res.json();
        setTree(data);
        // Auto-expand top-level category folders
        if (data?.children) {
          const paths = new Set<string>();
          data.children.forEach((child: FolderNode) => {
            paths.add(child.path);
          });
          setExpandedPaths(paths);
        }
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
    if (clientId) fetchTree();
  }, [clientId]);

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

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Dynamic theming
  const bg = darkTheme ? '#0f172a' : '#ffffff';
  const bgHover = darkTheme ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const border = darkTheme ? '#1e293b' : '#e2e8f0';
  const textMain = darkTheme ? '#f1f5f9' : '#0f172a';
  const textMuted = darkTheme ? '#94a3b8' : '#64748b';
  const textDim = darkTheme ? '#475569' : '#94a3b8';

  const renderNode = (node: FolderNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedPaths.has(node.path);
    const isCategory = Object.keys(CATEGORY_META).includes(node.name);
    const meta = CATEGORY_META[node.name];
    const label = CATEGORY_LABELS[node.name];

    if (node.type === 'file') {
      return (
        <div
          key={node.path}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            paddingLeft: `${depth * 1.25 + 1.75}rem`,
            fontSize: '0.8125rem',
            color: textMain,
            borderBottom: `1px solid ${border}`,
            transition: 'background 0.15s',
            cursor: 'default',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = bgHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: '0.875rem' }}>📄</span>
          <span style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', wordBreak: 'break-all' }}>
            {node.name}
          </span>
          <span style={{ fontSize: '0.6875rem', color: textDim, whiteSpace: 'nowrap' }}>
            {formatSize(node.sizeBytes)}
          </span>
        </div>
      );
    }

    return (
      <div key={node.path}>
        <div
          onClick={() => toggleExpand(node.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: isCategory ? '0.75rem 1rem' : '0.5rem 0.75rem',
            paddingLeft: isCategory ? '1rem' : `${depth * 1.25 + 1}rem`,
            fontSize: isCategory ? '0.9375rem' : '0.8125rem',
            fontWeight: isCategory ? 700 : 600,
            color: isCategory && meta ? meta.colorText : textMain,
            background: isCategory && meta ? meta.colorBg : 'transparent',
            borderBottom: `1px solid ${border}`,
            borderLeft: isCategory && meta ? `3px solid ${meta.colorBorder}` : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            if (!isCategory) e.currentTarget.style.background = bgHover;
          }}
          onMouseLeave={(e) => {
            if (!isCategory) e.currentTarget.style.background = isCategory && meta ? meta.colorBg : 'transparent';
          }}
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
          <span style={{ fontSize: isCategory ? '1.125rem' : '0.875rem' }}>
            {isCategory && meta ? meta.icon : '📁'}
          </span>
          <span style={{ flex: 1 }}>
            {isCategory && label ? (lang === 'de' ? label.de : label.en) : node.name}
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              color: textDim,
              background: darkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              padding: '0.125rem 0.5rem',
              borderRadius: '9999px',
              whiteSpace: 'nowrap',
            }}
          >
            {node.fileCount || 0} {lang === 'de' ? 'Dateien' : 'files'}
          </span>
        </div>

        {/* Children */}
        {isExpanded && node.children && (
          <div
            style={{
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            {node.children.map((child) => renderNode(child, depth + 1))}
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
                {lang === 'de' ? 'Keine Dateien vorhanden' : 'No files yet'}
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
      {/* Header */}
      <div
        style={{
          background: darkTheme
            ? 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)'
            : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🗂️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#ffffff' }}>
              {lang === 'de' ? 'Mandanten-Dateiablage' : 'Client File Vault'}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.7)', marginTop: '0.125rem' }}>
              {lang === 'de'
                ? '4-Ordner-Struktur (GoBD-konform)'
                : '4-Folder Structure (GoBD Compliant)'}
            </div>
          </div>
        </div>

        <button
          onClick={fetchTree}
          disabled={loading}
          style={{
            background: 'rgba(255,255,255,0.15)',
            color: '#ffffff',
            border: 'none',
            padding: '0.375rem 0.75rem',
            borderRadius: '0.5rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          <span style={{ animation: loading ? 'spin 1s linear infinite' : 'none', display: 'inline-block' }}>🔄</span>
          {lang === 'de' ? 'Aktualisieren' : 'Refresh'}
        </button>
      </div>

      {/* Loading / Error / Tree */}
      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: textMuted }}>
          <div style={{ fontSize: '1.5rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
            {lang === 'de' ? 'Ordnerstruktur wird geladen...' : 'Loading folder tree...'}
          </p>
        </div>
      )}

      {error && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.875rem' }}>
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && tree && (
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {tree.children && tree.children.length > 0 ? (
            tree.children.map((node) => renderNode(node, 0))
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: textMuted, fontSize: '0.875rem' }}>
              {lang === 'de' ? 'Keine Ordner gefunden.' : 'No folders found.'}
            </div>
          )}
        </div>
      )}

      {/* Footer with category legend */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderTop: `1px solid ${border}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.625rem',
          background: darkTheme ? 'rgba(255,255,255,0.02)' : '#f8fafc',
        }}
      >
        {Object.entries(CATEGORY_META).map(([key, meta]) => {
          const label = CATEGORY_LABELS[key];
          return (
            <span
              key={key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.6875rem',
                color: meta.colorText,
                background: meta.colorBg,
                padding: '0.125rem 0.5rem',
                borderRadius: '9999px',
                border: `1px solid ${meta.colorBorder}`,
                fontWeight: 600,
              }}
            >
              {meta.icon} {label ? (lang === 'de' ? label.de : label.en) : key}
            </span>
          );
        })}
      </div>
    </div>
  );
};
