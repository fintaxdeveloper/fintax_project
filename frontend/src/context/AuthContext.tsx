import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'CLIENT' | 'STAFF' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clientNumber?: string;
  first_login_done?: boolean;
  privacy_accepted?: boolean;
}

export interface LoginResult {
  success: boolean;
  requires2FA?: boolean;
  tempToken?: string;
  maskedEmail?: string;
  demoOtp?: string;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  activePortal: UserRole;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  verifyOtp: (tempToken: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  resendOtp: (tempToken: string) => Promise<{ success: boolean; demoOtp?: string; error?: string }>;
  quickLogin: (role: UserRole) => Promise<LoginResult>;
  logout: () => void;
  switchPortal: (portal: UserRole) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_CREDENTIALS: Record<UserRole, { identifier: string; pass: string }> = {
  CLIENT: { identifier: 'KD-10042', pass: 'client123' },
  STAFF: { identifier: 'accountant@fintax.de', pass: 'staff123' },
  ADMIN: { identifier: 'admin@fintax.de', pass: 'admin123' },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('fintax_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('fintax_token');
  });

  const [activePortal, setActivePortal] = useState<UserRole>(() => {
    return (user?.role as UserRole) || 'STAFF';
  });

  useEffect(() => {
    if (user?.role) {
      setActivePortal(user.role);
    }
  }, [user]);

  const login = async (identifier: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      // Check if Staff 2FA Email OTP is required
      if (data.requires2FA) {
        return {
          success: true,
          requires2FA: true,
          tempToken: data.tempToken,
          maskedEmail: data.maskedEmail,
          demoOtp: data.demoOtp,
        };
      }

      // Direct client login
      setUser(data.user);
      setToken(data.token);
      setActivePortal(data.user.role);
      localStorage.setItem('fintax_user', JSON.stringify(data.user));
      localStorage.setItem('fintax_token', data.token);

      return { success: true, requires2FA: false };
    } catch (err: any) {
      return { success: false, error: err.message || 'Server connection error' };
    }
  };

  const verifyOtp = async (tempToken: string, otp: string) => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, otp }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'OTP verification failed' };
      }

      setUser(data.user);
      setToken(data.token);
      setActivePortal(data.user.role);
      localStorage.setItem('fintax_user', JSON.stringify(data.user));
      localStorage.setItem('fintax_token', data.token);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Verbindung zum Server fehlgeschlagen' };
    }
  };

  const resendOtp = async (tempToken: string) => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Konnte Code nicht neu senden' };
      }

      return { success: true, demoOtp: data.demoOtp };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const quickLogin = async (role: UserRole) => {
    const cred = DEMO_CREDENTIALS[role];
    return await login(cred.identifier, cred.pass);
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/auth/profile?userId=${encodeURIComponent(user.id)}`);
      if (res.ok) {
        const data = await res.json();
        setUser((prev) => {
          if (!prev) return null;
          const updated: User = {
            ...prev,
            first_login_done: data.first_login_done,
            privacy_accepted: data.privacy_accepted,
          };
          localStorage.setItem('fintax_user', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (e) {
      console.warn('Could not refresh user profile:', e);
    }
  };

  useEffect(() => {
    if (user?.id) {
      refreshProfile();
    }
  }, [user?.id]);

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('fintax_user');
    localStorage.removeItem('fintax_token');
  };

  const switchPortal = (portal: UserRole) => {
    setActivePortal(portal);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activePortal,
        login,
        verifyOtp,
        resendOtp,
        quickLogin,
        logout,
        switchPortal,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
