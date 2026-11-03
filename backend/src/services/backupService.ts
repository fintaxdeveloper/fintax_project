import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from './pgClient.js';

export interface BackupRecord {
  id: string;
  backup_type: 'DAILY' | 'MONTHLY';
  filename: string;
  file_path: string;
  size_bytes: number;
  sha256_checksum: string;
  created_at: string;
  created_by_admin: string;
  retention_days: number;
  retention_expires_at: string;
  is_expired: boolean;
}

const BACKUP_DIR = path.resolve(process.cwd(), '../storage/backups');
const BACKUP_META_FILE = path.join(BACKUP_DIR, 'backup_index.json');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_META_FILE)) {
    fs.writeFileSync(BACKUP_META_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

export const backupService = {
  getAll(): BackupRecord[] {
    ensureBackupDir();
    try {
      const data = fs.readFileSync(BACKUP_META_FILE, 'utf-8');
      const list: BackupRecord[] = JSON.parse(data);
      const now = new Date();
      return list.map((b) => ({
        ...b,
        is_expired: new Date(b.retention_expires_at) < now,
      }));
    } catch {
      return [];
    }
  },

  saveAll(list: BackupRecord[]) {
    ensureBackupDir();
    fs.writeFileSync(BACKUP_META_FILE, JSON.stringify(list, null, 2), 'utf-8');
  },

  /**
   * PDF Page 3: Creates Daily (30 days retention) or Monthly (12 months retention) Backup
   */
  async createBackup(type: 'DAILY' | 'MONTHLY' = 'DAILY', adminName = 'FinTax Administrator'): Promise<BackupRecord> {
    ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `fintax_backup_${type.toLowerCase()}_${timestamp}.json`;
    const targetPath = path.join(BACKUP_DIR, filename);

    // Snapshot database & document records
    const dbSource = path.resolve(process.cwd(), '../storage/database.json');
    let snapshotData: any = { timestamp: new Date().toISOString(), type, version: '1.0.0' };

    if (fs.existsSync(dbSource)) {
      try {
        snapshotData.documents = JSON.parse(fs.readFileSync(dbSource, 'utf-8'));
      } catch {
        snapshotData.documents = [];
      }
    }

    // Include PostgreSQL tables snapshot if connected
    try {
      const usersRes = await pool.query('SELECT id, email, name, role, client_number, is_active, created_at FROM users');
      snapshotData.users = usersRes.rows;
    } catch (_) {
      snapshotData.users = [];
    }

    const jsonContent = JSON.stringify(snapshotData, null, 2);
    fs.writeFileSync(targetPath, jsonContent, 'utf-8');

    const stats = fs.statSync(targetPath);
    const checksum = crypto.createHash('sha256').update(jsonContent).digest('hex');

    // Calculate retention according to PDF Page 3:
    // Daily backups: 30 days
    // Monthly backups: 12 months (365 days)
    const retentionDays = type === 'DAILY' ? 30 : 365;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    const record: BackupRecord = {
      id: `bk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      backup_type: type,
      filename,
      file_path: targetPath,
      size_bytes: stats.size,
      sha256_checksum: checksum,
      created_at: new Date().toISOString(),
      created_by_admin: adminName,
      retention_days: retentionDays,
      retention_expires_at: expiresAt.toISOString(),
      is_expired: false,
    };

    const all = this.getAll();
    all.unshift(record);
    this.saveAll(all);

    // Audit log
    pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        'admin',
        'BACKUP_CREATED',
        'SYSTEM_BACKUP',
        '127.0.0.1',
        JSON.stringify({ backupId: record.id, type, filename, retentionDays }),
      ]
    ).catch(() => {});

    return record;
  },

  /**
   * Restores data from a backup snapshot (Admin-only restriction per PDF Page 3)
   */
  async restoreBackup(backupId: string, adminName = 'FinTax Administrator'): Promise<{ success: boolean; message: string }> {
    const backup = this.getAll().find((b) => b.id === backupId);
    if (!backup || !fs.existsSync(backup.file_path)) {
      throw new Error('Sicherungsdatei nicht gefunden.');
    }

    const content = fs.readFileSync(backup.file_path, 'utf-8');
    const parsed = JSON.parse(content);

    // Restore documents to database.json
    if (parsed.documents && Array.isArray(parsed.documents)) {
      const dbPath = path.resolve(process.cwd(), '../storage/database.json');
      fs.writeFileSync(dbPath, JSON.stringify(parsed.documents, null, 2), 'utf-8');
    }

    pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        'admin',
        'BACKUP_RESTORED_BY_ADMIN',
        'SYSTEM_BACKUP',
        '127.0.0.1',
        JSON.stringify({ backupId: backup.id, filename: backup.filename, restoredBy: adminName }),
      ]
    ).catch(() => {});

    return {
      success: true,
      message: `System erfolgreich aus Sicherung "${backup.filename}" wiederhergestellt (Autorisiert durch: ${adminName}).`,
    };
  },
};
