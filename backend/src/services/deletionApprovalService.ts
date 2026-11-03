import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './pgClient.js';
import { dbService } from './dbService.js';

export interface DeletionRequest {
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
  rejected_by_admin_name?: string;
  rejected_at?: string;
  created_at: string;
}

const DELETIONS_STORAGE_FILE = path.resolve(process.cwd(), '../storage/deletion_requests.json');

function ensureStorage() {
  if (!fs.existsSync(DELETIONS_STORAGE_FILE)) {
    fs.writeFileSync(DELETIONS_STORAGE_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

export const deletionApprovalService = {
  getAll(): DeletionRequest[] {
    ensureStorage();
    try {
      const data = fs.readFileSync(DELETIONS_STORAGE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  getById(id: string): DeletionRequest | undefined {
    return this.getAll().find((r) => r.id === id);
  },

  getByDocumentId(docId: string): DeletionRequest | undefined {
    return this.getAll().find((r) => r.document_id === docId && r.status !== 'REJECTED');
  },

  saveAll(list: DeletionRequest[]) {
    ensureStorage();
    fs.writeFileSync(DELETIONS_STORAGE_FILE, JSON.stringify(list, null, 2), 'utf-8');
  },

  /**
   * PDF Requirement: Retention Check according to German Tax Law (§ 147 AO & § 257 HGB)
   */
  calculateRetention(docDateStr?: string, category = '01_FiBu'): {
    retentionLaw: string;
    retentionYears: number;
    expiresAt: string;
    isWithinRetention: boolean;
    warning: string;
  } {
    let docDate = new Date();
    if (docDateStr) {
      const parsed = new Date(docDateStr);
      if (!isNaN(parsed.getTime())) docDate = parsed;
    }

    const docYear = docDate.getFullYear();
    let retentionYears = 10;
    let retentionLaw = '§ 147 Abs. 1 Nr. 1, 4 AO (10 Jahre Aufbewahrungsfrist für Buchungsbelege & Rechnungen)';

    if (category === '00_Schriftverkehr') {
      retentionYears = 6;
      retentionLaw = '§ 257 Abs. 1 Nr. 2, 3 HGB (6 Jahre Aufbewahrungsfrist für Handels- & Geschäftsbriefe)';
    } else if (category === '02_LoBu') {
      retentionYears = 10;
      retentionLaw = '§ 147 AO & § 41 EStG (10 Jahre für Lohnkonten & Beitragsnachweise)';
    }

    // German retention period starts at the close of the calendar year in which the document was created
    const expiryYear = docYear + retentionYears;
    const expiryDate = new Date(`${expiryYear}-12-31T23:59:59Z`);
    const now = new Date();
    const isWithinRetention = now < expiryDate;

    const remainingYears = Math.max(0, expiryYear - now.getFullYear());
    let warning = '';
    if (isWithinRetention) {
      warning = `⚠️ Gesetzliche Aufbewahrungsfrist aktiv! Dokument unterliegt ${retentionLaw}. Frist endet am 31.12.${expiryYear} (noch ca. ${remainingYears} Jahre). Löschung erfordert zwingend die Freigabe von ZWEI Administratoren!`;
    } else {
      warning = `Gesetzliche Aufbewahrungsfrist ist am 31.12.${expiryYear} abgelaufen. Reguläre Löschung zulässig (erfordert weiterhin 2-Admin-Prüfung).`;
    }

    return {
      retentionLaw,
      retentionYears,
      expiresAt: expiryDate.toISOString().slice(0, 10),
      isWithinRetention,
      warning,
    };
  },

  /**
   * 1. Submit a Deletion Request
   */
  requestDeletion(params: {
    documentId: string;
    userId: string;
    userName: string;
    reason: string;
  }): DeletionRequest {
    const doc = dbService.getById(params.documentId);
    if (!doc) {
      throw new Error(`Dokument mit ID ${params.documentId} nicht gefunden.`);
    }

    // Check if an active request already exists
    const existing = this.getByDocumentId(params.documentId);
    if (existing && (existing.status === 'PENDING_FIRST_APPROVAL' || existing.status === 'FIRST_APPROVAL_GRANTED')) {
      throw new Error(`Für dieses Dokument liegt bereits ein aktiver Löschantrag vor (ID: ${existing.id}).`);
    }

    const docDate = doc.extracted_data?.invoice_date || doc.uploaded_at;
    const category = doc.category || '01_FiBu';
    const retention = this.calculateRetention(docDate, category);

    const newRequest: DeletionRequest = {
      id: `del_req_${uuidv4()}`,
      document_id: doc.id,
      document_name: doc.original_filename,
      document_category: category,
      client_id: doc.client_id || 'user_client_1',
      requested_by_user_id: params.userId,
      requested_by_name: params.userName,
      reason: params.reason || 'Manuell zur Löschung beantragt',
      retention_law: retention.retentionLaw,
      document_date: docDate.slice(0, 10),
      retention_expires_at: retention.expiresAt,
      is_within_retention_period: retention.isWithinRetention,
      retention_warning: retention.warning,
      status: 'PENDING_FIRST_APPROVAL',
      created_at: new Date().toISOString(),
    };

    const all = this.getAll();
    all.unshift(newRequest);
    this.saveAll(all);

    // Update document notes
    dbService.update(doc.id, {
      staff_notes: `[LÖSCHANTRAG GESTELLT] ${retention.warning} Grund: ${params.reason}`,
    });

    // Write to audit log
    pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        params.userId,
        'DELETION_REQUESTED',
        'DOCUMENT',
        '127.0.0.1',
        JSON.stringify({
          documentId: doc.id,
          filename: doc.original_filename,
          retentionExpiresAt: retention.expiresAt,
          isWithinRetention: retention.isWithinRetention,
        }),
      ]
    ).catch((e: any) => console.error('[Audit] Failed to log deletion request:', e));

    return newRequest;
  },

  /**
   * 2. Approve Deletion (Enforces 2 DIFFERENT Administrators)
   */
  approveDeletion(params: {
    requestId: string;
    adminId: string;
    adminName: string;
  }): { request: DeletionRequest; fullyDeleted: boolean; message: string } {
    const list = this.getAll();
    const index = list.findIndex((r) => r.id === params.requestId);
    if (index === -1) {
      throw new Error('Löschantrag nicht gefunden.');
    }

    const req = list[index];

    if (req.status === 'APPROVED_AND_DELETED') {
      throw new Error('Dokument wurde bereits durch 2 Administratoren freigegeben und gelöscht.');
    }

    if (req.status === 'REJECTED') {
      throw new Error('Dieser Löschantrag wurde bereits abgelehnt.');
    }

    // Step A: First Admin Approval
    if (req.status === 'PENDING_FIRST_APPROVAL') {
      req.status = 'FIRST_APPROVAL_GRANTED';
      req.approval_1_admin_id = params.adminId;
      req.approval_1_admin_name = params.adminName;
      req.approval_1_at = new Date().toISOString();

      list[index] = req;
      this.saveAll(list);

      pool.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          params.adminId,
          'DELETION_FIRST_APPROVAL',
          'DOCUMENT',
          '127.0.0.1',
          JSON.stringify({ requestId: req.id, documentId: req.document_id, adminName: params.adminName }),
        ]
      ).catch(() => {});

      return {
        request: req,
        fullyDeleted: false,
        message: `1. Administrator-Freigabe erteilt durch ${params.adminName}. Noch erforderlich: Freigabe durch einen ZWEITEN Administrator!`,
      };
    }

    // Step B: Second Admin Approval (CRITICAL: Must NOT be the same administrator)
    if (req.status === 'FIRST_APPROVAL_GRANTED') {
      if (req.approval_1_admin_id === params.adminId) {
        throw new Error(
          `Sicherheitsrichtlinie verletzt: Die zweite Freigabe muss durch einen ANDEREN Administrator erfolgen! Sie haben bereits die erste Freigabe erteilt.`
        );
      }

      req.status = 'APPROVED_AND_DELETED';
      req.approval_2_admin_id = params.adminId;
      req.approval_2_admin_name = params.adminName;
      req.approval_2_at = new Date().toISOString();

      list[index] = req;
      this.saveAll(list);

      // Now physically perform deletion
      const doc = dbService.getById(req.document_id);
      if (doc) {
        if (fs.existsSync(doc.file_path)) {
          try {
            fs.unlinkSync(doc.file_path);
          } catch (e) {
            console.warn('Could not remove file from disk:', e);
          }
        }
        dbService.delete(doc.id);
      }

      pool.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          params.adminId,
          'DELETION_FINAL_EXECUTED_2_ADMIN',
          'DOCUMENT',
          '127.0.0.1',
          JSON.stringify({
            requestId: req.id,
            documentId: req.document_id,
            admin1: req.approval_1_admin_name,
            admin2: req.approval_2_admin_name,
            filename: req.document_name,
          }),
        ]
      ).catch(() => {});

      return {
        request: req,
        fullyDeleted: true,
        message: `2-Admin-Freigabe vollständig! Dokument "${req.document_name}" wurde durch ${req.approval_1_admin_name} und ${params.adminName} freigegeben und datenschutzkonform gelöscht.`,
      };
    }

    return { request: req, fullyDeleted: false, message: 'Unbekannter Status.' };
  },

  /**
   * 3. Reject Deletion Request
   */
  rejectDeletion(params: {
    requestId: string;
    adminId: string;
    adminName: string;
    notes: string;
  }): DeletionRequest {
    const list = this.getAll();
    const index = list.findIndex((r) => r.id === params.requestId);
    if (index === -1) {
      throw new Error('Löschantrag nicht gefunden.');
    }

    const req = list[index];
    req.status = 'REJECTED';
    req.rejection_notes = params.notes || 'Abgelehnt durch Administrator';
    req.rejected_by_admin_name = params.adminName;
    req.rejected_at = new Date().toISOString();

    list[index] = req;
    this.saveAll(list);

    // Update document notes
    dbService.update(req.document_id, {
      staff_notes: `[LÖSCHANTRAG ABGELEHNT] Grund: ${params.notes} (durch ${params.adminName})`,
    });

    pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, ip_address, details_json) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        params.adminId,
        'DELETION_REJECTED',
        'DOCUMENT',
        '127.0.0.1',
        JSON.stringify({ requestId: req.id, documentId: req.document_id, rejectedBy: params.adminName, notes: params.notes }),
      ]
    ).catch(() => {});

    return req;
  },
};
