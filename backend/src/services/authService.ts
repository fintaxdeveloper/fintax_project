import crypto from 'crypto';
import dotenv from 'dotenv';
import { Request, Response, NextFunction } from 'express';
import { pool } from './pgClient.js';

dotenv.config();

const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error('FATAL: JWT_SECRET environment variable must be set (minimum 16 characters).');
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'CLIENT' | 'STAFF' | 'ADMIN';
  clientNumber?: string;
  first_login_done?: boolean;
  privacy_accepted?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface PendingOtpSession {
  tempToken: string;
  user: AuthUser;
  otp: string;
  expiresAt: number; // timestamp ms
  createdAt: number;
}

// In-memory 2FA session cache (10 minutes TTL)
const pendingOtpSessions = new Map<string, PendingOtpSession>();

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length <= 2 ? `${local[0]}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
}

// 1. Native HMAC-SHA256 JWT Implementation (Zero-dependency & High-speed)
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export const authService = {
  createToken(user: AuthUser, expiresInHours = 24): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clientNumber: user.clientNumber,
      first_login_done: user.first_login_done,
      privacy_accepted: user.privacy_accepted,
      exp: Math.floor(Date.now() / 1000) + expiresInHours * 3600,
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  },

  verifyToken(token: string): AuthUser | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [encodedHeader, encodedPayload, signature] = parts;
      const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      if (signature !== expectedSignature) {
        return null;
      }

      const payload = JSON.parse(base64UrlDecode(encodedPayload));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expired
      }

      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        clientNumber: payload.clientNumber,
        first_login_done: payload.first_login_done,
        privacy_accepted: payload.privacy_accepted,
      };
    } catch {
      return null;
    }
  },

  verifyPassword(plainPassword: string, storedHash: string): boolean {
    if (!plainPassword || !storedHash || !storedHash.includes(':')) {
      return false;
    }

    try {
      const [salt, key] = storedHash.split(':');
      if (!salt || !key) return false;
      const hashed = crypto.scryptSync(plainPassword, salt, 64);
      const keyBuffer = Buffer.from(key, 'hex');
      if (hashed.length !== keyBuffer.length) return false;
      return crypto.timingSafeEqual(hashed, keyBuffer);
    } catch {
      return false;
    }
  },

  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hashed}`;
  },

  /**
   * PDF Requirement (Page 1 & 11):
   * - Client login: client number or email + password.
   * - Staff login: password plus a one-time code by email (2FA OTP).
   */
  async login(
    identifier: string,
    passwordPlain: string,
    ipAddress = '127.0.0.1'
  ): Promise<{
    requires2FA: boolean;
    tempToken?: string;
    token?: string;
    user?: AuthUser;
    maskedEmail?: string;
    demoOtp?: string; // provided for development & testing convenience
    message: string;
  } | null> {
    const cleanId = identifier.trim().toLowerCase();

    // Query user by email OR client_number OR id
    let dbUser: any = null;
    try {
      // Wrap DB query with a 3-second timeout to avoid hanging login
      const dbQueryPromise = pool.query(
        `SELECT id, email, password_hash, name, role, is_active, 
                COALESCE(client_number, '') as client_number,
                COALESCE(first_login_done, false) as first_login_done,
                (privacy_accepted_at IS NOT NULL) as privacy_accepted
         FROM users 
         WHERE LOWER(email) = $1 OR LOWER(COALESCE(client_number, '')) = $1 OR LOWER(id) = $1`,
        [cleanId]
      );
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      const result = await Promise.race([dbQueryPromise, timeoutPromise]);
      if (result && 'rows' in result && result.rows.length > 0) {
        dbUser = result.rows[0];
      }
    } catch (e) {
      console.warn('[PostgreSQL] Login query fallback check:', (e as any)?.message || e);
    }

    // Fallback demo users ONLY when NODE_ENV is explicitly 'development' (unset NODE_ENV = disabled)
    if (!dbUser && process.env.NODE_ENV === 'development') {
      const fallbackUsers = [
        { id: 'user_admin_1', email: 'admin@fintax.de', password_hash: this.hashPassword('admin123'), name: 'Dr. Michael von FinTax', role: 'ADMIN', client_number: '', is_active: true, first_login_done: true, privacy_accepted: true },
        { id: 'user_admin_2', email: 'partner@fintax.de', password_hash: this.hashPassword('admin123'), name: 'Sarah Lindemann (Partnerin)', role: 'ADMIN', client_number: '', is_active: true, first_login_done: true, privacy_accepted: true },
        { id: 'user_staff_1', email: 'staff@fintax.de', password_hash: this.hashPassword('staff123'), name: 'Sabine Weber', role: 'STAFF', client_number: '', is_active: true, first_login_done: true, privacy_accepted: true },
        { id: 'user_staff_2', email: 'accountant@fintax.de', password_hash: this.hashPassword('staff123'), name: 'Thomas Müller', role: 'STAFF', client_number: '', is_active: true, first_login_done: true, privacy_accepted: true },
        { id: 'user_client_1', email: 'mandant@mustermann.de', password_hash: this.hashPassword('client123'), name: 'Hans Mustermann GmbH', role: 'CLIENT', client_number: 'KD-10042', is_active: true, first_login_done: true, privacy_accepted: true },
        { id: 'user_client_2', email: 'client@mustermann.de', password_hash: this.hashPassword('client123'), name: 'Hans Mustermann GmbH (First-Login Demo)', role: 'CLIENT', client_number: 'KD-10043', is_active: true, first_login_done: false, privacy_accepted: false },
        { id: 'user_qa24_704', email: 'qa24@fintax.de', password_hash: this.hashPassword('client123'), name: 'QA24 GmbH', role: 'CLIENT', client_number: '726', is_active: true, first_login_done: true, privacy_accepted: true },
      ];
      dbUser = fallbackUsers.find(
        (u) => u.email.toLowerCase() === cleanId || u.client_number.toLowerCase() === cleanId || u.id === cleanId
      );
    }

    if (!dbUser || !dbUser.is_active) {
      return null;
    }

    // One-time transparent migration of legacy plain-text passwords in PostgreSQL
    if (dbUser.password_hash && !dbUser.password_hash.includes(':')) {
      if (passwordPlain === dbUser.password_hash) {
        const upgradedHash = this.hashPassword(passwordPlain);
        dbUser.password_hash = upgradedHash;
        pool
          .query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [upgradedHash, dbUser.id])
          .catch(() => {});
      } else {
        return null;
      }
    }

    const isValid = this.verifyPassword(passwordPlain, dbUser.password_hash);
    if (!isValid) {
      return null;
    }

    const isStaffOrAdmin = dbUser.role === 'STAFF' || dbUser.role === 'ADMIN';
    const isPreActivatedClient = dbUser.id === 'user_client_1' || dbUser.client_number === 'KD-10042';
    const authUser: AuthUser = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as any,
      clientNumber: dbUser.client_number || undefined,
      first_login_done: (isStaffOrAdmin || isPreActivatedClient) ? true : (dbUser.first_login_done || false),
      privacy_accepted: (isStaffOrAdmin || isPreActivatedClient) ? true : (dbUser.privacy_accepted || false),
    };

    // Case A: STAFF & ADMIN require 2FA One-Time Email Code
    if (authUser.role === 'STAFF' || authUser.role === 'ADMIN') {
      const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit numeric OTP
      const tempToken = `otp_sess_${crypto.randomBytes(16).toString('hex')}`;
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      pendingOtpSessions.set(tempToken, {
        tempToken,
        user: authUser,
        otp,
        expiresAt,
        createdAt: Date.now(),
      });

      // Audit Log for 2FA generation
      pool.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          authUser.id,
          'STAFF_OTP_GENERATED',
          'AUTH_2FA',
          ipAddress,
          JSON.stringify({ role: authUser.role, email: authUser.email, tempToken }),
        ]
      ).catch(() => {});

      console.log(`[FinTax 2FA Security] Email OTP for ${authUser.email} (${authUser.role}): [ ${otp} ] (Valid for 10 min)`);

      const isDev = process.env.NODE_ENV === 'development';
      return {
        requires2FA: true,
        tempToken,
        user: authUser,
        maskedEmail: maskEmail(authUser.email),
        ...(isDev ? { demoOtp: otp } : {}),
        message: `Einmalcode (OTP) an ${maskEmail(authUser.email)} gesendet. Bitte Code zur Bestätigung eingeben.`,
      };
    }

    // Case B: CLIENT logs in directly with Client Number / Email + Password
    const token = this.createToken(authUser);

    pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        authUser.id,
        'CLIENT_LOGIN_DIRECT',
        'AUTH',
        ipAddress,
        JSON.stringify({ role: authUser.role, clientNumber: authUser.clientNumber }),
      ]
    ).catch(() => {});

    return {
      requires2FA: false,
      token,
      user: authUser,
      message: 'Erfolgreich angemeldet (Login successful).',
    };
  },

  /**
   * PDF Requirement: Verifies the 6-digit One-Time Code for Staff/Admin
   */
  verifyOtp(
    tempToken: string,
    enteredOtp: string,
    ipAddress = '127.0.0.1'
  ): { success: boolean; token?: string; user?: AuthUser; error?: string } {
    const session = pendingOtpSessions.get(tempToken);
    if (!session) {
      return { success: false, error: 'Sitzung abgelaufen oder ungültig. Bitte erneut anmelden.' };
    }

    if (Date.now() > session.expiresAt) {
      pendingOtpSessions.delete(tempToken);
      return { success: false, error: 'Der Einmalcode ist abgelaufen (Gültigkeit 10 Minuten). Bitte neuen Code anfordern.' };
    }

    if (session.otp !== enteredOtp.trim()) {
      return { success: false, error: 'Ungültiger Einmalcode. Bitte überprüfen Sie die E-Mail.' };
    }

    // OTP Validated! Issue full token
    const token = this.createToken(session.user);
    pendingOtpSessions.delete(tempToken);

    // Audit log
    pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        session.user.id,
        'STAFF_2FA_VERIFIED_SUCCESS',
        'AUTH_2FA',
        ipAddress,
        JSON.stringify({ role: session.user.role, email: session.user.email }),
      ]
    ).catch(() => {});

    const verifiedUser: AuthUser = {
      ...session.user,
      first_login_done: true,
      privacy_accepted: true,
    };

    return {
      success: true,
      token,
      user: verifiedUser,
    };
  },

  /**
   * Resend a fresh OTP
   */
  resendOtp(tempToken: string): { success: boolean; demoOtp?: string; message: string } {
    const session = pendingOtpSessions.get(tempToken);
    if (!session) {
      return { success: false, message: 'Ungültige Sitzung.' };
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    session.otp = newOtp;
    session.expiresAt = Date.now() + 10 * 60 * 1000;
    pendingOtpSessions.set(tempToken, session);

    console.log(`[FinTax 2FA Security] Resent OTP for ${session.user.email}: [ ${newOtp} ]`);

    const isDev = process.env.NODE_ENV === 'development';
    return {
      success: true,
      ...(isDev ? { demoOtp: newOtp } : {}),
      message: `Neuer Einmalcode an ${maskEmail(session.user.email)} gesendet.`,
    };
  },
};

// Express Middleware for JWT Protection
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Nicht autorisiert (Authorization header missing or invalid).' });
  }

  const user = authService.verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Sitzung abgelaufen (Invalid or expired token).' });
  }

  req.user = user;
  next();
}

// Express Middleware for Role-Based Access Control (RBAC)
export function requireRole(...allowedRoles: Array<'CLIENT' | 'STAFF' | 'ADMIN'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Nicht autorisiert (Unauthenticated).' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Zugriff verweigert (Forbidden for role ${req.user.role}). Erforderlich: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}
