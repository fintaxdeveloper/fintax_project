import { pool } from './pgClient.js';
import { authService } from './authService.js';
import { googleDriveService } from './googleDriveService.js';
import { clientFolderService } from './clientFolderService.js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: 'CLIENT' | 'STAFF' | 'ADMIN';
  is_active: boolean;
  created_at: string;
}

export interface AuditRecord {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  ip_address: string;
  details_json: string;
  timestamp: string;
}

export interface StaffAssignment {
  id: string;
  staff_user_id: string;
  staff_name?: string;
  client_user_id: string;
  client_name?: string;
  assigned_at: string;
}

let adminTablesInitialized = false;

export const adminService = {
  async initTables() {
    if (adminTablesInitialized) return;
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL,
          name VARCHAR(255) NOT NULL,
          client_number VARCHAR(64),
          is_active BOOLEAN DEFAULT TRUE,
          first_login_done BOOLEAN DEFAULT FALSE,
          privacy_accepted_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Safe column additions if already exist
        DO $$ 
        BEGIN 
          BEGIN
            ALTER TABLE users ADD COLUMN client_number VARCHAR(64);
          EXCEPTION
            WHEN duplicate_column THEN NULL;
          END;
          BEGIN
            ALTER TABLE users ADD COLUMN first_login_done BOOLEAN DEFAULT FALSE;
          EXCEPTION
            WHEN duplicate_column THEN NULL;
          END;
          BEGIN
            ALTER TABLE users ADD COLUMN privacy_accepted_at TIMESTAMP WITH TIME ZONE;
          EXCEPTION
            WHEN duplicate_column THEN NULL;
          END;
        END $$;

        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          action VARCHAR(64) NOT NULL,
          resource_type VARCHAR(64) NOT NULL,
          ip_address VARCHAR(64),
          details_json TEXT,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS staff_assignments (
          id VARCHAR(64) PRIMARY KEY,
          staff_user_id VARCHAR(64) NOT NULL,
          client_user_id VARCHAR(64) NOT NULL,
          assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(staff_user_id, client_user_id)
        );

        CREATE TABLE IF NOT EXISTS deletion_requests (
          id VARCHAR(64) PRIMARY KEY,
          document_id VARCHAR(64) NOT NULL,
          document_name VARCHAR(255) NOT NULL,
          document_category VARCHAR(64) NOT NULL,
          client_id VARCHAR(64) NOT NULL,
          requested_by_user_id VARCHAR(64) NOT NULL,
          requested_by_name VARCHAR(255) NOT NULL,
          reason TEXT,
          retention_law TEXT,
          document_date VARCHAR(32),
          retention_expires_at VARCHAR(32),
          is_within_retention_period BOOLEAN,
          retention_warning TEXT,
          status VARCHAR(64) NOT NULL,
          approval_1_admin_id VARCHAR(64),
          approval_1_admin_name VARCHAR(255),
          approval_1_at TIMESTAMP WITH TIME ZONE,
          approval_2_admin_id VARCHAR(64),
          approval_2_admin_name VARCHAR(255),
          approval_2_at TIMESTAMP WITH TIME ZONE,
          rejection_notes TEXT,
          rejected_by_admin_name VARCHAR(255),
          rejected_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Ensure seed accounts exist
      await this.seedInitialAccounts();

      adminTablesInitialized = true;
      console.log('[PostgreSQL] Admin tables and audit trail initialized.');
    } catch (err) {
      console.error('[PostgreSQL] Admin table initialization error:', err);
    }
  },

  async seedInitialAccounts() {
    const defaultUsers = [
      {
        id: 'user_admin_1',
        email: 'admin@fintax.de',
        name: 'Dr. Michael von FinTax (Kanzleileitung)',
        role: 'ADMIN',
        pass: 'admin123',
        client_number: null,
      },
      {
        id: 'user_admin_2',
        email: 'partner@fintax.de',
        name: 'Sarah Lindemann (Partnerin / 2. Admin)',
        role: 'ADMIN',
        pass: 'admin123',
        client_number: null,
      },
      {
        id: 'user_staff_1',
        email: 'staff@fintax.de',
        name: 'Sabine Weber (Steuerfachangestellte)',
        role: 'STAFF',
        pass: 'staff123',
        client_number: null,
      },
      {
        id: 'user_staff_2',
        email: 'accountant@fintax.de',
        name: 'Thomas Müller (Steuerberater)',
        role: 'STAFF',
        pass: 'staff123',
        client_number: null,
      },
      {
        id: 'user_client_1',
        email: 'mandant@mustermann.de',
        name: 'Hans Mustermann GmbH (Mandant)',
        role: 'CLIENT',
        pass: 'client123',
        client_number: 'KD-10042',
      },
      {
        id: 'user_client_2',
        email: 'client@mustermann.de',
        name: 'Hans Mustermann GmbH (Mandant)',
        role: 'CLIENT',
        pass: 'client123',
        client_number: 'KD-10043',
      },
      {
        id: 'user_client_3',
        email: 'kontakt@alpen-logistik.de',
        name: 'Alpen Logistik Bayern KG (Mandant)',
        role: 'CLIENT',
        pass: 'client123',
        client_number: 'KD-10044',
      },
    ];

    for (const u of defaultUsers) {
      const isClient1 = u.id === 'user_client_1';
      await pool.query(
        `INSERT INTO users (id, email, password_hash, role, name, client_number, is_active, first_login_done, privacy_accepted_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)
         ON CONFLICT (id) DO UPDATE SET 
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           name = EXCLUDED.name,
           client_number = EXCLUDED.client_number,
           is_active = EXCLUDED.is_active;`,
        [u.id, u.email, u.pass, u.role, u.name, u.client_number, isClient1 ? true : false, isClient1 ? new Date() : null]
      );
    }
    // Ensure user_client_1 is pre-activated for instant test login
    await pool.query(`UPDATE users SET first_login_done = TRUE, privacy_accepted_at = CURRENT_TIMESTAMP WHERE id = 'user_client_1'`).catch(() => {});

    // Default assignment: Sabine Weber handles Hans Mustermann GmbH
    await pool.query(
      `INSERT INTO staff_assignments (id, staff_user_id, client_user_id)
       VALUES ('asgn_init_1', 'user_staff_1', 'user_client_1')
       ON CONFLICT (staff_user_id, client_user_id) DO NOTHING;`
    );

    // Initial audit logs
    const initialLogs = [
      {
        id: 'log_seed_1',
        user_id: 'user_admin_1',
        action: 'SYSTEM_BOOT',
        resource_type: 'SYSTEM',
        ip: '127.0.0.1',
        details: JSON.stringify({ event: 'FinTax Governance & DB Bootstrapped' }),
      },
      {
        id: 'log_seed_2',
        user_id: 'user_admin_1',
        action: 'STAFF_ASSIGNED',
        resource_type: 'STAFF_ASSIGNMENT',
        ip: '127.0.0.1',
        details: JSON.stringify({ staff: 'Sabine Weber', client: 'Hans Mustermann GmbH' }),
      },
      {
        id: 'log_seed_3',
        user_id: 'user_client_1',
        action: 'FILE_UPLOAD',
        resource_type: 'DOCUMENTS',
        ip: '192.168.1.45',
        details: JSON.stringify({ filename: 'Rechnung_Server_Hetzner.pdf', size_kb: 245 }),
      },
      {
        id: 'log_seed_4',
        user_id: 'user_staff_1',
        action: 'AGENDA_EXPORT',
        resource_type: 'EXPORTS',
        ip: '127.0.0.1',
        details: JSON.stringify({ batch: 'SKR03_October_2026.csv', approved_count: 3 }),
      },
    ];

    for (const l of initialLogs) {
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING;`,
        [l.id, l.user_id, l.action, l.resource_type, l.ip, l.details]
      );
    }

    // Ensure all existing CLIENT accounts have "Shared with me > _INBOX > 01_Clients" folder structure
    try {
      clientFolderService.ensureDemoReferenceClient();
      googleDriveService.createClientFolderTree('704_QA24 GbmH', 2024);
      const clientRows = await pool.query("SELECT id, name, client_number FROM users WHERE role = 'CLIENT'");
      for (const c of clientRows.rows) {
        if (c.name) {
          const folderName = clientFolderService.registerClientName(c.id, c.name, c.client_number);
          googleDriveService.createClientFolderTree(folderName);
          clientFolderService.ensureClientFolderTree(folderName);
        }
      }
    } catch (gdErr) {
      console.warn('[AdminService] Note: Initial Google Drive folder setup:', gdErr);
    }
  },

  // 1. List Users
  async listUsers(): Promise<UserRecord[]> {
    await this.initTables();
    const res = await pool.query(
      'SELECT id, email, name, role, is_active, first_login_done, privacy_accepted_at, created_at FROM users ORDER BY created_at DESC'
    );
    return res.rows;
  },

  // 1b. Get user profile (for first-login check)
  async getUserProfile(userId: string): Promise<any> {
    const res = await pool.query(
      'SELECT id, email, name, role, is_active, first_login_done, privacy_accepted_at, client_number, created_at FROM users WHERE id = $1',
      [userId]
    );
    return res.rows[0] || null;
  },

  // 1c. Change Password (PDF: first-login password change)
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip = '127.0.0.1'
  ): Promise<{ success: boolean; error?: string }> {
    const userRes = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return { success: false, error: 'Benutzer nicht gefunden (User not found).' };
    }

    const user = userRes.rows[0];
    const { authService: auth } = await import('./authService.js');
    const isValid = auth.verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return { success: false, error: 'Aktuelles Passwort ist ungültig (Current password is incorrect).' };
    }

    if (newPassword.length < 8) {
      return { success: false, error: 'Neues Passwort muss mindestens 8 Zeichen lang sein (Minimum 8 characters).' };
    }

    const hashedNew = auth.hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = $1, first_login_done = TRUE WHERE id = $2',
      [hashedNew, userId]
    );

    await this.recordAudit(userId, 'PASSWORD_CHANGED', 'AUTH', ip, { first_login: true });

    return { success: true };
  },

  // 1d. Accept Privacy Notice (PDF: GDPR privacy acceptance)
  async acceptPrivacy(userId: string, ip = '127.0.0.1'): Promise<{ success: boolean }> {
    await pool.query(
      'UPDATE users SET privacy_accepted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );

    await this.recordAudit(userId, 'PRIVACY_NOTICE_ACCEPTED', 'GDPR', ip, {
      accepted_at: new Date().toISOString(),
    });

    return { success: true };
  },

  // 2. Create User
  async createUser(
    email: string,
    name: string,
    role: 'CLIENT' | 'STAFF' | 'ADMIN',
    plainPass: string,
    adminId = 'user_admin_1',
    ip = '127.0.0.1',
    clientNumber?: string
  ): Promise<UserRecord> {
    await this.initTables();
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    // Store plain text password — verifyPassword does plain-text equality check first,
    // so this works for newly-created users just like the demo seed accounts.
    const passHash = plainPass.trim() || 'password123';
    const clientNum = clientNumber ? clientNumber.trim() : null;
    const res = await pool.query(
      `INSERT INTO users (id, email, password_hash, role, name, client_number, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, email, name, role, client_number, is_active, created_at`,
      [userId, email.trim().toLowerCase(), passHash, role, name.trim(), clientNum]
    );

    // Record audit log
    await this.recordAudit(adminId, 'USER_CREATED', 'USERS', ip, {
      new_user_id: userId,
      email,
      role,
      name,
    });

    // When a client is created, automatically generate the folder structure in:
    // Shared with me > _INBOX > 01_Clients > <Client Name>
    const normalizedRole = String(role || '').trim().toUpperCase();
    if (normalizedRole === 'CLIENT') {
      try {
        const folderName = clientFolderService.registerClientName(userId, name, clientNum);
        const driveResult = googleDriveService.createClientFolderTree(folderName, new Date().getFullYear(), clientNum);
        const vaultDir = clientFolderService.ensureClientFolderTree(folderName, new Date().getFullYear(), new Date().getMonth() + 1, name, clientNum);
        console.log(`[Client Creation] Client folder created successfully for "${folderName}":`, {
          storageVault: vaultDir,
          googleDrive: driveResult?.clientDir,
        });
      } catch (fErr) {
        console.warn('[AdminService] Note: Client folder tree setup on drive/storage:', fErr);
      }
    }

    return res.rows[0];
  },

  // 3. Update User
  async updateUser(
    id: string,
    updates: { name?: string; role?: 'CLIENT' | 'STAFF' | 'ADMIN'; is_active?: boolean; password?: string },
    adminId = 'user_admin_1',
    ip = '127.0.0.1'
  ): Promise<UserRecord | null> {
    await this.initTables();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(updates.role);
    }
    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(updates.is_active);
    }
    if (updates.password) {
      fields.push(`password_hash = $${idx++}`);
      values.push(updates.password);
    }

    if (fields.length === 0) return null;

    values.push(id);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, name, role, is_active, created_at`;
    const res = await pool.query(query, values);
    if (res.rows.length === 0) return null;

    await this.recordAudit(adminId, 'USER_UPDATED', 'USERS', ip, {
      updated_user_id: id,
      changed_fields: Object.keys(updates),
    });

    return res.rows[0];
  },

  // 4. Delete User
  async deleteUser(id: string, adminId = 'user_admin_1', ip = '127.0.0.1'): Promise<boolean> {
    await this.initTables();
    // Do not allow deleting main admin
    if (id === 'user_admin_1') {
      throw new Error('Hauptadministrator kann nicht gelöscht werden (Primary admin cannot be deleted).');
    }

    const res = await pool.query('DELETE FROM users WHERE id = $1 RETURNING email', [id]);
    if (res.rows.length > 0) {
      await this.recordAudit(adminId, 'USER_DELETED', 'USERS', ip, { deleted_user_id: id, email: res.rows[0].email });
      return true;
    }
    return false;
  },

  // 5. Staff to Client Assignment Matrix
  async listStaffAssignments(): Promise<StaffAssignment[]> {
    await this.initTables();
    const query = `
      SELECT 
        sa.id, 
        sa.staff_user_id, 
        u_staff.name as staff_name,
        sa.client_user_id, 
        u_client.name as client_name,
        sa.assigned_at
      FROM staff_assignments sa
      LEFT JOIN users u_staff ON sa.staff_user_id = u_staff.id
      LEFT JOIN users u_client ON sa.client_user_id = u_client.id
      ORDER BY sa.assigned_at DESC
    `;
    const res = await pool.query(query);
    return res.rows;
  },

  async assignStaff(staffUserId: string, clientUserId: string, adminId = 'user_admin_1', ip = '127.0.0.1'): Promise<StaffAssignment> {
    await this.initTables();
    const id = `asgn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const query = `
      INSERT INTO staff_assignments (id, staff_user_id, client_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (staff_user_id, client_user_id) DO UPDATE SET assigned_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const res = await pool.query(query, [id, staffUserId, clientUserId]);

    await this.recordAudit(adminId, 'STAFF_ASSIGNED', 'STAFF_ASSIGNMENT', ip, {
      staff_user_id: staffUserId,
      client_user_id: clientUserId,
    });

    return res.rows[0];
  },

  async removeStaffAssignment(staffUserId: string, clientUserId: string, adminId = 'user_admin_1', ip = '127.0.0.1'): Promise<boolean> {
    await this.initTables();
    const res = await pool.query(
      'DELETE FROM staff_assignments WHERE staff_user_id = $1 AND client_user_id = $2',
      [staffUserId, clientUserId]
    );

    await this.recordAudit(adminId, 'STAFF_UNASSIGNED', 'STAFF_ASSIGNMENT', ip, {
      staff_user_id: staffUserId,
      client_user_id: clientUserId,
    });

    return (res.rowCount || 0) > 0;
  },

  // 6. Audit Trail
  async listAuditLogs(limit = 100): Promise<AuditRecord[]> {
    await this.initTables();
    const res = await pool.query(
      'SELECT id, user_id, action, resource_type, ip_address, details_json, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return res.rows;
  },

  async recordAudit(userId: string, action: string, resourceType: string, ip = '127.0.0.1', details: any = {}) {
    try {
      const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [id, userId, action, resourceType, ip, typeof details === 'string' ? details : JSON.stringify(details)]
      );
    } catch (err) {
      console.error('[Audit] Failed to record audit log:', err);
    }
  },
};
