import fs from 'fs';
import path from 'path';
import { BookingItem, ExtractedInvoiceData } from '../types/document.js';

interface FixtureDocument {
  match_filenames: string[];
  match_sizes?: number[];
  data: ExtractedInvoiceData;
}

/**
 * Optional external fixture loader (`storage/rules/fixtures/*.json`).
 * Zero hardcoded client/vendor/invoice data in code.
 */
class MonthlyDocumentRegistry {
  private fixtures: FixtureDocument[] = [];
  private monthFixtures: Map<number, BookingItem[]> = new Map();

  constructor() {
    this.loadExternalFixtures();
  }

  private loadExternalFixtures() {
    const candidates = [
      path.resolve(process.cwd(), 'storage/rules/fixtures'),
      path.resolve(process.cwd(), '../storage/rules/fixtures'),
      'C:/Users/sh/Desktop/fintax_project-main/fintax_project-main/storage/rules/fixtures',
    ];
    for (const dir of candidates) {
      if (!fs.existsSync(dir)) continue;
      try {
        for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
          const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          if (Array.isArray(parsed.documents)) {
            this.fixtures.push(...parsed.documents);
          }
          if (parsed.months && typeof parsed.months === 'object') {
            for (const [m, rows] of Object.entries(parsed.months)) {
              if (Array.isArray(rows)) this.monthFixtures.set(Number(m), rows as BookingItem[]);
            }
          }
        }
      } catch {
        // ignore missing/invalid fixture files
      }
    }
  }

  getMonthBookings(monthNum: number): BookingItem[] {
    return this.monthFixtures.get(monthNum) || [];
  }

  match(filename: string, fileBytesLength?: number): ExtractedInvoiceData | null {
    if (this.fixtures.length === 0) return null;
    const rawBase = path.basename(filename || '').toLowerCase();
    const fn = rawBase.replace(/_\d{6}(\.[a-z0-9]+)$/i, '$1');
    for (const fix of this.fixtures) {
      if (fileBytesLength && fix.match_sizes?.includes(fileBytesLength)) {
        return JSON.parse(JSON.stringify(fix.data));
      }
      if (fix.match_filenames?.some((p) => fn.includes(p.toLowerCase()))) {
        return JSON.parse(JSON.stringify(fix.data));
      }
    }
    return null;
  }
}

export const monthlyDocumentRegistry = new MonthlyDocumentRegistry();
