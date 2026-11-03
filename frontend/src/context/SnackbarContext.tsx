import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type SnackbarType = 'success' | 'error' | 'info' | 'warning';

export interface SnackbarItem {
  id: string;
  message: string;
  title?: string;
  type: SnackbarType;
  duration?: number;
}

interface SnackbarContextType {
  showSnackbar: (message: string, type?: SnackbarType, title?: string, duration?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snackbars, setSnackbars] = useState<SnackbarItem[]>([]);

  const removeSnackbar = useCallback((id: string) => {
    setSnackbars((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showSnackbar = useCallback((message: string, type: SnackbarType = 'info', title?: string, duration = 4000) => {
    const id = `snack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newItem: SnackbarItem = { id, message, title, type, duration };

    setSnackbars((prev) => [...prev.slice(-3), newItem]); // Keep at most 4 active

    if (duration > 0) {
      setTimeout(() => {
        removeSnackbar(id);
      }, duration);
    }
  }, [removeSnackbar]);

  const success = useCallback((msg: string, title?: string) => showSnackbar(msg, 'success', title || 'Erfolg'), [showSnackbar]);
  const error = useCallback((msg: string, title?: string) => showSnackbar(msg, 'error', title || 'Fehler'), [showSnackbar]);
  const info = useCallback((msg: string, title?: string) => showSnackbar(msg, 'info', title || 'Hinweis'), [showSnackbar]);
  const warning = useCallback((msg: string, title?: string) => showSnackbar(msg, 'warning', title || 'Achtung'), [showSnackbar]);

  const getTheme = (type: SnackbarType) => {
    switch (type) {
      case 'success':
        return {
          border: '#10b981',
          bg: '#ffffff',
          iconColor: '#10b981',
          icon: <CheckCircle2 size={20} color="#10b981" />,
          title: '#065f46',
          badgeBg: '#ecfdf5',
        };
      case 'error':
        return {
          border: '#ef4444',
          bg: '#ffffff',
          iconColor: '#ef4444',
          icon: <AlertCircle size={20} color="#ef4444" />,
          title: '#991b1b',
          badgeBg: '#fef2f2',
        };
      case 'warning':
        return {
          border: '#f59e0b',
          bg: '#ffffff',
          iconColor: '#f59e0b',
          icon: <AlertTriangle size={20} color="#f59e0b" />,
          title: '#92400e',
          badgeBg: '#fffbeb',
        };
      case 'info':
      default:
        return {
          border: '#2563eb',
          bg: '#ffffff',
          iconColor: '#2563eb',
          icon: <Info size={20} color="#2563eb" />,
          title: '#1e40af',
          badgeBg: '#eff6ff',
        };
    }
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar, success, error, info, warning }}>
      {children}

      {/* Floating Snackbar Stack - Bottom Right */}
      <aside aria-label="Notifications" style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '420px',
        width: 'calc(100% - 48px)',
        pointerEvents: 'none',
      }}>
        {snackbars.map((item) => {
          const theme = getTheme(item.type);
          return (
            <div
              key={item.id}
              style={{
                pointerEvents: 'auto',
                background: theme.bg,
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                borderLeft: `5px solid ${theme.border}`,
                boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.15), 0 4px 10px rgba(15, 23, 42, 0.05)',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                animation: 'slideInRight 0.25s ease-out',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{
                background: theme.badgeBg,
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {theme.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {item.title && (
                  <div style={{
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    color: '#0f172a',
                    marginBottom: '2px',
                  }}>
                    {item.title}
                  </div>
                )}
                <div style={{
                  fontSize: '0.8125rem',
                  color: '#334155',
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                  fontWeight: 500,
                }}>
                  {item.message}
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeSnackbar(item.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </aside>
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
};

