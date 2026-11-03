import fs from 'fs';
import path from 'path';
import { DocumentRecord } from '../types/document.js';
import { pool } from './pgClient.js';

const DB_FILE = path.resolve(process.cwd(), '../storage/database.json');

// Ensure local file backup exists
function ensureDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

export const dbService = {
  getAll(): DocumentRecord[] {
    ensureDb();
    try {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  getById(id: string): DocumentRecord | undefined {
    const list = this.getAll();
    return list.find((doc) => doc.id === id);
  },

  create(record: DocumentRecord): DocumentRecord {
    // 1. Local storage update
    ensureDb();
    const list = this.getAll();
    list.unshift(record);
    fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf-8');

    // 2. Persist to PostgreSQL in background
    this.persistToPostgres(record).catch((err) => {
      console.error('[PostgreSQL] Error inserting document:', err);
    });

    return record;
  },

  update(id: string, updates: Partial<DocumentRecord>): DocumentRecord | null {
    ensureDb();
    const list = this.getAll();
    const index = list.findIndex((doc) => doc.id === id);
    if (index === -1) return null;

    list[index] = { ...list[index], ...updates };
    fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf-8');

    // Update in PostgreSQL
    this.updateInPostgres(id, list[index]).catch((err) => {
      console.error('[PostgreSQL] Error updating document:', err);
    });

    return list[index];
  },

  delete(id: string): boolean {
    ensureDb();
    const list = this.getAll();
    const filtered = list.filter((doc) => doc.id !== id);
    if (filtered.length === list.length) return false;
    fs.writeFileSync(DB_FILE, JSON.stringify(filtered, null, 2), 'utf-8');

    // Delete in PostgreSQL
    pool.query('DELETE FROM documents WHERE id = $1', [id]).catch((err: any) => {
      console.error('[PostgreSQL] Error deleting document:', err);
    });

    return true;
  },

  async persistToPostgres(doc: DocumentRecord) {
    const query = `
      INSERT INTO documents (id, client_id, original_filename, stored_path, mime_type, size, status, uploaded_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `;
    await pool.query(query, [
      doc.id,
      'user_client_1', // default linked client
      doc.original_filename,
      doc.file_path,
      doc.mime_type,
      doc.size_bytes,
      doc.status,
      doc.uploaded_at || new Date().toISOString(),
    ]);

    if (doc.extracted_data) {
      await this.saveExtractedData(doc.id, doc.extracted_data);
    }
  },

  async updateInPostgres(id: string, doc: DocumentRecord) {
    const query = `
      UPDATE documents 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
    await pool.query(query, [doc.status, id]);

    if (doc.extracted_data) {
      await this.saveExtractedData(id, doc.extracted_data);
    }

    if (doc.validation_issues && doc.validation_issues.length > 0) {
      // Clear old issues and insert new ones
      await pool.query('DELETE FROM validation_issues WHERE document_id = $1', [id]);
      for (const issue of doc.validation_issues) {
        await pool.query(
          `INSERT INTO validation_issues (id, document_id, field, message, severity) VALUES ($1, $2, $3, $4, $5)`,
          [`val_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, id, issue.field, issue.message, issue.severity]
        );
      }
    }
  },

  async saveExtractedData(docId: string, ext: any) {
    const query = `
      INSERT INTO extracted_data (
        id, document_id, document_type, supplier_name, invoice_number, 
        invoice_date, net_amount, vat_rate, vat_amount, total_amount, 
        currency, skr03_code, confidence_score, raw_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (document_id) DO UPDATE SET
        supplier_name = EXCLUDED.supplier_name,
        invoice_number = EXCLUDED.invoice_number,
        invoice_date = EXCLUDED.invoice_date,
        net_amount = EXCLUDED.net_amount,
        vat_rate = EXCLUDED.vat_rate,
        vat_amount = EXCLUDED.vat_amount,
        total_amount = EXCLUDED.total_amount,
        skr03_code = EXCLUDED.skr03_code,
        confidence_score = EXCLUDED.confidence_score,
        raw_json = EXCLUDED.raw_json
    `;
    await pool.query(query, [
      `ext_${docId}`,
      docId,
      ext.document_type || 'INVOICE',
      ext.supplier_name || null,
      ext.invoice_number || null,
      ext.invoice_date || null,
      ext.net_amount || null,
      ext.vat_rate_percent || null,
      ext.vat_amount || null,
      ext.total_amount || null,
      ext.currency || 'EUR',
      ext.skr03_account_code || null,
      ext.confidence_score || null,
      JSON.stringify(ext),
    ]);
  }
};
