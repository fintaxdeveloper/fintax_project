import fs from 'fs';
import path from 'path';
import { exportService } from '../src/services/exportService.js';
import { dbService } from '../src/services/dbService.js';

/** One booking line exactly as it appears in the DATEV EXTF file (the fields that matter for the golden compare). */
export interface GoldenLine {
  amount: string; // "12500,00"
  sh: 'S' | 'H';
  konto: string;
  gegenkonto: string;
  buCode: string; // "" = no BU key
  datum: string; // DDMM
}

export interface GoldenFile {
  client_id: string;
  year: number;
  month: number;
  note?: string;
  bookings: GoldenLine[];
}

export const GOLDEN_DIR = path.resolve(process.cwd(), '../testdata/golden');

export const goldenName = (year: number, month: number) => `${year}_${String(month).padStart(2, '0')}`;
export const goldenPath = (name: string) => path.join(GOLDEN_DIR, `${name}.json`);

export function listGoldenNames(): string[] {
  if (!fs.existsSync(GOLDEN_DIR)) return [];
  return fs
    .readdirSync(GOLDEN_DIR)
    .filter((f) => /^(?:[a-z0-9_]+_)?\d{4}_\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

const unquote = (v: string) => (v || '').replace(/^"|"$/g, '');
const fmtAmount = (v: string) => {
  const n = parseFloat(unquote(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : unquote(v);
};

export interface MonthResult {
  lines: GoldenLine[];
  rawBookings: Array<{
    amount: number;
    sh: 'S' | 'H';
    konto: string;
    gegenkonto: string;
    buCode: string;
    belegdatum: string;
    belegfeld1?: string;
    belegfeld2?: string;
    buchungstext: string;
    currency?: string;
  }>;
  openingBalance?: number;
  closingBalance?: number;
  blocked: boolean;
  openCritical: number;
  openWarnings: number;
  failedChecks: Array<{ id: string; value: string; expected: string }>;
  checks: Array<{ id: string; status: string; value: string; expected: string }>;
  bookingCount: number;
  accuracy?: {
    client_id: string;
    year: number;
    month: number;
    period: string;
    total_bookings: number;
    auto_correct: number;
    auto_correct_pct: number;
    current_accuracy_pct: number;
    first_run_correct: number;
    first_run_accuracy_pct: number;
    first_run_changed: number;
    resolved_by_question: number;
    questions_asked: number;
    questions_by_type: {
      beleg_fehlt: number;
      entscheidung: number;
      unreadable: number;
    };
    user_changed: number;
    goal_met: boolean;
    errors_by_category: Record<string, number>;
    error_list: Array<{
      category: string;
      cause: string;
      lineKey: string;
      date: string;
      amount: number;
      text: string;
      proposedAccount: string;
      finalAccount: string;
    }>;
  };
}

/** Re-processes one month completely (bank statement + Belege) with the CURRENT code and rules. */
export function computeMonth(clientId: string, year: number, month: number): MonthResult {
  const allDocs = dbService.getAll();
  const clientDocs = allDocs.filter((d) => d.client_id === clientId);
  const primary = clientDocs.find((d) => {
    const ed: any = d.extracted_data;
    if (!ed || ed.document_type !== 'BANK_STATEMENT') return false;
    const m = String(ed.invoice_date || '').match(/^(\d{4})-(\d{2})/);
    return !!m && Number(m[1]) === year && Number(m[2]) === month;
  });
  if (!primary) throw new Error(`No bank statement found for ${clientId} ${year}-${String(month).padStart(2, '0')}`);

  // Call EXACTLY the same export function as the website button (server.ts /api/documents/:id/skr03-csv)
  const result = exportService.generateDocumentAndMonthlySKR03Csv(primary, allDocs, year, month, {
    allowBlocked: true,
    writeFiles: false,
  });
  const rows = result.buchungenCsvContent.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0).slice(2);
  const lines: GoldenLine[] = rows.map((l) => {
    const c = l.split(';');
    return {
      amount: fmtAmount(c[0]),
      sh: unquote(c[1]) as 'S' | 'H',
      konto: unquote(c[6]),
      gegenkonto: unquote(c[7]),
      buCode: unquote(c[8]),
      datum: unquote(c[9]),
    };
  });
  const rawBookings = rows.map((l) => {
    const c = l.split(';');
    const n = parseFloat(unquote(c[0]).replace(/\./g, '').replace(',', '.'));
    return {
      amount: Number.isFinite(n) ? n : 0,
      sh: unquote(c[1]) as 'S' | 'H',
      konto: unquote(c[6]),
      gegenkonto: unquote(c[7]),
      buCode: unquote(c[8]),
      belegdatum: unquote(c[9]),
      belegfeld1: unquote(c[10]),
      belegfeld2: unquote(c[11]),
      buchungstext: unquote(c[13]),
      currency: 'EUR',
    };
  });
  const report: any = result.reviewReport;
  const checks = (report.checks || []).map((c: any) => ({ id: c.id, status: c.status, value: c.value, expected: c.expected }));
  return {
    lines,
    rawBookings,
    openingBalance: (primary.extracted_data as any)?.opening_balance,
    closingBalance: (primary.extracted_data as any)?.closing_balance,
    blocked: !!report.blocked,
    openCritical: report.open_critical ?? 0,
    openWarnings: report.open_warnings ?? 0,
    failedChecks: checks.filter((c: any) => c.status === 'FAIL'),
    checks,
    bookingCount: result.bookingCount,
    accuracy: report.accuracy,
  };
}

const keyOf = (l: GoldenLine) => `${l.datum}|${l.sh}|${l.konto}|${l.gegenkonto}|${l.buCode || '-'}|${l.amount}`;
const show = (l: GoldenLine) =>
  `${l.datum} ${l.sh} ${l.amount.padStart(10)} Konto ${l.konto} -> Gegenkonto ${l.gegenkonto} BU ${l.buCode || '(none)'}`;

/** Compares actual vs golden line by line (order independent). Any difference, missing or extra line = problem. */
export function compareLines(expected: GoldenLine[], actual: GoldenLine[]): string[] {
  const problems: string[] = [];
  const remaining = [...actual];
  for (const e of expected) {
    const idx = remaining.findIndex((a) => keyOf(a) === keyOf(e));
    if (idx >= 0) {
      remaining.splice(idx, 1);
      continue;
    }
    // Same date + amount + side but different account/BU → show as a changed line
    const near = remaining.findIndex((a) => a.datum === e.datum && a.amount === e.amount && a.sh === e.sh && a.konto === e.konto);
    if (near >= 0) {
      problems.push(`CHANGED  expected: ${show(e)}\n         actual:   ${show(remaining[near])}`);
      remaining.splice(near, 1);
    } else {
      problems.push(`MISSING  ${show(e)}`);
    }
  }
  for (const extra of remaining) problems.push(`EXTRA    ${show(extra)}`);
  return problems;
}
