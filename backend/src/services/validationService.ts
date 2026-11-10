import crypto from 'crypto';
import fs from 'fs';
import { ExtractedInvoiceData, ValidationIssue, DocumentStatus, DocumentRecord } from '../types/document.js';

export const validationService = {
  /**
   * Calculates SHA-256 checksum of a file on disk
   */
  calculateChecksum(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) return '';
      const fileBuffer = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (e) {
      console.warn('[Validation] Checksum calculation error:', e);
      return '';
    }
  },

  /**
   * Validates extracted fields for accounting consistency (GoBD / UStG)
   */
  validate(data: ExtractedInvoiceData): {
    issues: ValidationIssue[];
    status: DocumentStatus;
  } {
    const issues: ValidationIssue[] = [];

    // 1. Math check: Net + VAT == Total
    const calculatedTotal = data.net_amount + data.vat_amount;
    const diff = Math.abs(calculatedTotal - data.total_amount);

    if (diff > 0.05 && (!data.bookings || data.bookings.length === 0)) {
      issues.push({
        field: 'total_amount',
        message: `Hinweis: Netto (${data.net_amount.toFixed(2)} €) + USt (${data.vat_amount.toFixed(2)} €) = ${calculatedTotal.toFixed(2)} €, Brutto beträgt ${data.total_amount.toFixed(2)} €.`,
        severity: 'WARNING',
      });
    }

    // 2. Required fields
    if (!data.supplier_name || data.supplier_name.trim() === '' || data.supplier_name === 'Unbekannter Lieferant') {
      issues.push({
        field: 'supplier_name',
        message: 'Lieferantenname fehlt oder ist unklar.',
        severity: 'WARNING',
      });
    }

    if (!data.invoice_number || data.invoice_number === 'N/A') {
      issues.push({
        field: 'invoice_number',
        message: 'Rechnungsnummer konnte nicht sicher erkannt werden.',
        severity: 'WARNING',
      });
    }

    if (data.total_amount <= 0) {
      issues.push({
        field: 'total_amount',
        message: 'Rechnungsbetrag muss größer als 0 sein.',
        severity: 'ERROR',
      });
    }

    // 3. Date sanity check
    const docDate = new Date(data.invoice_date);
    const now = new Date();
    if (isNaN(docDate.getTime())) {
      issues.push({
        field: 'invoice_date',
        message: 'Ungültiges Datumsformat.',
        severity: 'ERROR',
      });
    } else if (docDate > now) {
      issues.push({
        field: 'invoice_date',
        message: 'Rechnungsdatum liegt in der Zukunft.',
        severity: 'WARNING',
      });
    }

    // Determine status
    const hasErrors = issues.some((i) => i.severity === 'ERROR');
    const status: DocumentStatus = hasErrors ? 'NEEDS_ATTENTION' : 'READY_FOR_REVIEW';

    return { issues, status };
  },

  /**
   * PDF Requirement (Page 5, 6, 8):
   * Comprehensive Duplicate Detection Rule
   * Checks file checksum, invoice number + supplier, and date + amount matches
   */
  checkDuplicates(
    extracted: ExtractedInvoiceData,
    currentDocId: string,
    existingDocs: DocumentRecord[],
    currentChecksum?: string
  ): { duplicateIssues: ValidationIssue[]; duplicateOfId?: string; isDuplicate: boolean } {
    const duplicateIssues: ValidationIssue[] = [];
    let duplicateOfId: string | undefined;

    const normSupplier = (extracted.supplier_name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const normInvNumber = (extracted.invoice_number || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const currentTotal = Number(extracted.total_amount) || 0;
    const currentDate = (extracted.invoice_date || '').trim();

    for (const other of existingDocs) {
      if (other.id === currentDocId) continue;

      // 1. Exact file checksum match
      if (currentChecksum && other.file_checksum && currentChecksum === other.file_checksum) {
        duplicateIssues.push({
          field: 'duplicate_file',
          message: `Identische Datei bereits vorhanden: Diese Datei wurde bereits hochgeladen (Dokument-ID: ${other.id}, Datei: "${other.original_filename}").`,
          severity: 'ERROR',
        });
        duplicateOfId = other.id;
        break; // exact file duplicate
      }

      const otherExt = other.extracted_data;
      if (!otherExt) continue;

      const otherSupplier = (otherExt.supplier_name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const otherInvNumber = (otherExt.invoice_number || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const otherTotal = Number(otherExt.total_amount) || 0;
      const otherDate = (otherExt.invoice_date || '').trim();

      // 2. Invoice number & Supplier match
      const hasValidInvoiceNum = normInvNumber && normInvNumber !== 'na' && normInvNumber.length > 2;
      const hasValidSupplier = normSupplier && normSupplier !== 'unbekannterlieferant' && normSupplier.length > 2;

      if (hasValidInvoiceNum && hasValidSupplier && normInvNumber === otherInvNumber && (normSupplier.includes(otherSupplier) || otherSupplier.includes(normSupplier))) {
        duplicateIssues.push({
          field: 'invoice_number',
          message: `Möglicher Belegdoppelgänger: Rechnung "${extracted.invoice_number}" von "${extracted.supplier_name}" (${extracted.total_amount.toFixed(2)} €) existiert bereits (Dokument-ID: ${other.id}).`,
          severity: 'ERROR',
        });
        duplicateOfId = other.id;
        break;
      }

      // 3. Same supplier + same date + same exact amount
      if (
        hasValidSupplier &&
        (normSupplier === otherSupplier || normSupplier.includes(otherSupplier) || otherSupplier.includes(normSupplier)) &&
        currentDate &&
        currentDate === otherDate &&
        Math.abs(currentTotal - otherTotal) < 0.01 &&
        currentTotal > 0
      ) {
        duplicateIssues.push({
          field: 'total_amount',
          message: `Doppelgänger-Verdacht: Gleicher Lieferant (${extracted.supplier_name}), gleiches Datum (${currentDate}) und identischer Betrag (${currentTotal.toFixed(2)} €) wie Dokument-ID ${other.id}.`,
          severity: 'WARNING',
        });
        duplicateOfId = other.id;
        break;
      }
    }

    return {
      duplicateIssues,
      duplicateOfId,
      isDuplicate: duplicateIssues.length > 0,
    };
  },
};
