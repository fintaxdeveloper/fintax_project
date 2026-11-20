import fs from 'fs';
import path from 'path';
import { BookingItem } from '../types/document.js';
import { ollamaClient } from './ollamaClient.js';
import { clientRulesService } from './clientRulesService.js';
import { extractVinFromText, areVinsFuzzyEqual } from './belegIndexService.js';

/**
 * FinTax Review Gate (Hard Export Blocker + Review List)
 * ------------------------------------------------------
 * Rules decide bookings. Whenever the engine is NOT sure (VIN not in purchase history,
 * refund without origin, unknown vendor / low AI confidence, cash without evidence,
 * failed control check) the line is NOT silently guessed — it is placed on the Review List
 * and the DATEV CSV export stays BLOCKED until every critical item is confirmed.
 */

export type ReviewIssueType =
  | 'VIN_NOT_FOUND'
  | 'MISSING_BELEG_INCOMING'
  | 'REFUND_UNCLEAR'
  | 'UNKNOWN_ACCOUNT'
  | 'CASH_WITHOUT_WITHDRAWAL'
  | 'LARGE_CASH'
  | 'PLACEHOLDER_TEXT'
  | 'INVALID_AMOUNT'
  | 'STAMMKAPITAL_UNCLEAR';

export type ReviewAction = 'SET_ACCOUNT' | 'ACCEPT' | 'EXCLUDE';

export interface ReviewOption {
  gegenkonto: string;
  buCode: string;
  label: string;
  action?: ReviewAction;
  recommended?: boolean;
}

export interface ReviewResolution {
  action: ReviewAction;
  gegenkonto?: string;
  buCode?: string;
  belegdatum?: string;
  amount?: number;
  sh?: 'S' | 'H';
  note?: string;
  resolved_by?: string;
  resolved_at: string;
  /** Snapshot of the line at resolution time (for audit trail) */
  original?: { gegenkonto: string; buCode: string; amount: number; text: string };
}

export interface ReviewBookingView {
  lineKey: string;
  date: string;
  amount: number;
  sh: 'S' | 'H';
  konto: string;
  gegenkonto: string;
  buCode: string;
  text: string;
  belegfeld1?: string;
}

export interface ReviewIssue {
  id: string;
  lineKey: string;
  type: ReviewIssueType;
  severity: 'CRITICAL' | 'WARNING';
  categoryTab?: 'MISSING_BELEG' | 'DECISION';
  title: string;
  question: string;
  details: string;
  booking: ReviewBookingView;
  relatedLineKeys?: string[];
  relatedBookings?: ReviewBookingView[];
  matchedBeleg?: BookingItem['matchedBeleg'];
  options: ReviewOption[];
  ai?: { category?: string; confidence?: number; reason?: string; suggested_gegenkonto?: string; suggested_bu?: string };
  suggest_upload?: string;
  requiresDateInput?: boolean;
  resolved: boolean;
  resolution?: ReviewResolution;
}

export interface ControlCheck {
  id: string;
  label: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  critical: boolean;
  value: string;
  expected: string;
  hint?: string;
}

export interface AccuracyErrorItem {
  category: string;
  cause: string;
  lineKey: string;
  date: string;
  amount: number;
  text: string;
  proposedAccount: string;
  finalAccount: string;
  proposedDate?: string;
  finalDate?: string;
}

export interface AccuracyReport {
  client_id: string;
  year: number;
  month: number;
  period: string;
  generated_at: string;
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
  error_list: AccuracyErrorItem[];
}

export interface ReviewReport {
  scope: string;
  client_id: string;
  year: number;
  month: number;
  generated_at: string;
  total_bookings: number;
  auto_booked: number;
  excluded_count: number;
  issues: ReviewIssue[];
  open_critical: number;
  open_warnings: number;
  resolved_count: number;
  checks: ControlCheck[];
  blocked: boolean;
  block_reasons: string[];
  totals: { bank_net: number; kasse_net: number; transit_net: number; bank_rows: number };
  bookings: Array<ReviewBookingView & { status: 'AUTO' | 'REVIEW' | 'RESOLVED' }>;
  kasse_items?: Array<{
    date: string;
    sh: 'S' | 'H';
    amount: number;
    gegenkonto: string;
    buCode: string;
    text: string;
    source_file?: string;
    pages?: number[];
    running_balance: number;
  }>;
  accuracy?: AccuracyReport;
  csv_ready: boolean;
  locked?: boolean;
  locked_at?: string;
}

export interface MaterializedDecision {
  resolutionKey: string;
  kind: 'OPEN_INVOICE' | 'UNUSED_BELEG' | 'NEG_CASH';
  item: BookingItem;
  resolution: ReviewResolution;
  meta?: {
    minCashBefore?: number;
    minCashDate?: string;
    firstNegDate?: string;
  };
}

export interface LineResolutionTarget {
  key: string;
  savedKey: string;
  item: BookingItem;
  resolution: ReviewResolution;
  proposed?: {
    konto: string;
    gegenkonto: string;
    buCode: string;
    belegdatum: string;
    amount: number;
    sh: 'S' | 'H';
    reviewHintType?: string;
    dateUncertain?: boolean;
  };
}

export interface AnalyzeContext {
  scope: string;
  clientId: string;
  year: number;
  month: number;
  hasBankStatement: boolean;
  openingBalance?: number;
  closingBalance?: number;
  kasseOpeningBalance?: number;
  vinUnresolved: Set<BookingItem>;
  lineKeys: Map<BookingItem, string>;
  excludedLines: Array<{ item: BookingItem; lineKey: string; resolution: ReviewResolution }>;
  resolvedKeys: Map<string, ReviewResolution>;
  lineResolutionTargets?: LineResolutionTarget[];
  materializedDecisions?: MaterializedDecision[];
  preResolutionItems?: BookingItem[];
  allClientRecords?: any[];
  partialPayments?: Array<{
    beleg: any;
    item?: BookingItem;
    docAmount: number;
    bankAmount: number;
    restAmount: number;
    type: string;
    partner: string;
    vin?: string;
  }>;
  priorOpenItems?: Array<{
    kind: '1600' | '1400';
    month: number;
    amount: number;
    vin?: string;
    invoiceNo?: string;
    partner: string;
  }>;
  priorMonth3200Vins?: Map<string, number[]>;
  bankReconciliation?: {
    openingBalance?: number;
    closingBalance?: number;
    calculatedClosing: number;
    diff: number;
    balanced: boolean;
    pages: Array<{
      page: number;
      txCount: number;
      pageSum: number;
      lines: Array<{ date: string; amount: number; text: string }>;
    }>;
  };
}

const STORAGE_DIR = path.resolve(process.cwd(), '../storage');
const RESOLUTIONS_FILE = path.join(STORAGE_DIR, 'review_resolutions.json');
const VENDOR_RULES_FILE = path.join(STORAGE_DIR, 'review_vendor_rules.json');
const AI_ADVICE_FILE = path.join(STORAGE_DIR, 'review_ai_advice.json');

const readJson = <T>(file: string, fallback: T): T => {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch (e) {
    console.warn(`[ReviewService] Could not read ${path.basename(file)}:`, (e as Error).message);
  }
  return fallback;
};
const writeJson = (file: string, data: unknown): void => {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
};

const fmtDate = (belegdatum: string): string => {
  const d = (belegdatum || '').replace(/[^0-9]/g, '').slice(-4);
  return d.length === 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.` : '';
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ParsedExtfCsvRow {
  rowNum: number;
  amount: number;
  sh: 'S' | 'H';
  konto: string;
  gegenkonto: string;
  buCode: string;
  belegdatum: string;
  belegfeld1: string;
  belegfeld2: string;
  buchungstext: string;
}

function splitSemicolonCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        cur += ch;
      }
    } else if (ch === ';' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function unquoteCsvField(v: string | undefined): string {
  const s = (v || '').trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

function parseCsvAmount(raw: string | undefined): number {
  let s = unquoteCsvField(raw).replace(/\s+/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? round2(n) : 0;
}

export function parseDatevExtfCsv(csvContent: string): ParsedExtfCsvRow[] {
  const lines = (csvContent || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length <= 2) return [];
  const dataLines = lines.slice(2);
  return dataLines.map((line, idx) => {
    const c = splitSemicolonCsvRow(line);
    const shRaw = unquoteCsvField(c[1]).toUpperCase();
    return {
      rowNum: idx + 3,
      amount: parseCsvAmount(c[0]),
      sh: (shRaw === 'S' ? 'S' : 'H') as 'S' | 'H',
      konto: unquoteCsvField(c[6]),
      gegenkonto: unquoteCsvField(c[7]),
      buCode: unquoteCsvField(c[8]),
      belegdatum: unquoteCsvField(c[9]).replace(/[^0-9]/g, '').slice(-4),
      belegfeld1: unquoteCsvField(c[10]),
      belegfeld2: unquoteCsvField(c[11]),
      buchungstext: unquoteCsvField(c[13]),
    };
  });
}

export function computeDailyKasse(
  rows: Array<{ amount: number | string; sh: string; konto: string; gegenkonto: string; belegdatum: string }>,
  initialKasse = 0
): {
  dailyBalances: Array<{ date: string; delta: number; balance: number }>;
  running: number;
  minCash: number;
  minCashDate: string;
  firstNegDate: string;
} {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    const shUp = String(r.sh).toUpperCase();
    let delta = 0;
    if (r.konto === '1000') {
      delta = shUp === 'S' ? amt : -amt;
    } else if (r.gegenkonto === '1000') {
      delta = shUp === 'S' ? -amt : amt;
    } else {
      continue;
    }
    const rawD = (r.belegdatum || '').replace(/[^0-9]/g, '').slice(-4);
    const d = rawD.length === 4 ? rawD : rawD.padStart(4, '0');
    byDay.set(d, round2((byDay.get(d) || 0) + delta));
  }

  const sortedDays = Array.from(byDay.entries()).sort((a, b) =>
    (a[0].slice(2, 4) + a[0].slice(0, 2)).localeCompare(b[0].slice(2, 4) + b[0].slice(0, 2))
  );

  const dailyBalances: Array<{ date: string; delta: number; balance: number }> = [];
  let running = round2(initialKasse);
  let minCash = running;
  let minCashDate = '';
  let firstNegDate = running < -0.05 ? sortedDays[0]?.[0] || '' : '';

  for (const [date, delta] of sortedDays) {
    running = round2(running + delta);
    dailyBalances.push({ date, delta, balance: running });
    if (running < -0.05 && !firstNegDate) {
      firstNegDate = date;
    }
    if (running < minCash) {
      minCash = running;
      minCashDate = date;
    }
  }

  return { dailyBalances, running, minCash, minCashDate, firstNegDate };
}

/** Standard SKR03 answer options for an unknown expense / income line */
const EXPENSE_OPTIONS: ReviewOption[] = [
  { gegenkonto: '4530', buCode: '9', label: '4530 Laufende Kfz-Betriebskosten / Tanken (19%)' },
  { gegenkonto: '4540', buCode: '9', label: '4540 Kfz-Reparaturen / Teile / TÜV (19%)' },
  { gegenkonto: '3800', buCode: '9', label: '3800 Bezugsnebenkosten / Fahrzeugtransport (19%)' },
  { gegenkonto: '4390', buCode: '', label: '4390 Gebühren / Behörden / Zulassung' },
  { gegenkonto: '4520', buCode: '', label: '4520 Kfz-Versicherungen' },
  { gegenkonto: '4510', buCode: '', label: '4510 Kfz-Steuer' },
  { gegenkonto: '3200', buCode: '', label: '3200 Wareneingang (Fahrzeugankauf)' },
  { gegenkonto: '4210', buCode: '', label: '4210 Miete' },
  { gegenkonto: '4600', buCode: '9', label: '4600 Werbekosten / Inserate (19%)' },
  { gegenkonto: '4650', buCode: '', label: '4650 Bewirtungskosten' },
  { gegenkonto: '4673', buCode: '8', label: '4673 Reisekosten / Verpflegung (7%)' },
  { gegenkonto: '4920', buCode: '9', label: '4920 Telefon / Internet (19%)' },
  { gegenkonto: '4930', buCode: '9', label: '4930 Bürobedarf / Software (19%)' },
  { gegenkonto: '4955', buCode: '9', label: '4955 Buchführungs- / Steuerberatungskosten (19%)' },
  { gegenkonto: '4970', buCode: '', label: '4970 Nebenkosten des Geldverkehrs' },
  { gegenkonto: '0730', buCode: '', label: '0730 Gesellschafter-Verrechnungskonto (Privat)' },
  { gegenkonto: '4900', buCode: '', label: '4900 Sonstige betriebliche Aufwendungen (bestätigen)', action: 'ACCEPT' },
];

const INCOME_OPTIONS: ReviewOption[] = [
  { gegenkonto: '8400', buCode: '', label: '8400 Erlöse 19% USt' },
  { gegenkonto: '8193', buCode: '', label: '8193 Erlöse §25a Differenzbesteuerung' },
  { gegenkonto: '8125', buCode: '', label: '8125 Steuerfreie innergemeinschaftliche Lieferung (EU)' },
  { gegenkonto: '1718', buCode: '', label: '1718 Erhaltene Anzahlungen (Kundenanzahlung)' },
  { gegenkonto: '1590', buCode: '', label: '1590 Durchlaufende Posten' },
  { gegenkonto: '1890', buCode: '', label: '1890 Privateinlagen / Gesellschaftereinlage' },
];

const AI_CATEGORY_ACCOUNT: Record<string, { gegenkonto: string; buCode: string }> = {
  fuel: { gegenkonto: '4530', buCode: '9' },
  insurance: { gegenkonto: '4520', buCode: '' },
  car_purchase: { gegenkonto: '3200', buCode: '' },
  car_repair_parts: { gegenkonto: '4540', buCode: '9' },
  supermarket_travel: { gegenkonto: '4673', buCode: '8' },
  telecom: { gegenkonto: '4920', buCode: '9' },
  rent: { gegenkonto: '4210', buCode: '' },
  legal_tax: { gegenkonto: '4955', buCode: '9' },
  office: { gegenkonto: '4930', buCode: '9' },
  advertising: { gegenkonto: '4600', buCode: '9' },
  hospitality: { gegenkonto: '4650', buCode: '' },
  shareholder: { gegenkonto: '0730', buCode: '' },
  bank_fee: { gegenkonto: '4970', buCode: '' },
};

export const reviewService = {
  scopeKey(clientId: string | undefined, year: number, month: number): string {
    return `${clientId || 'user_client_1'}|${year}-${String(month).padStart(2, '0')}`;
  },

  /** Stable per-line key: date|amount|S/H|konto|text-prefix#occurrence */
  assignLineKeys(items: BookingItem[]): Map<BookingItem, string> {
    const keys = new Map<BookingItem, string>();
    const counts = new Map<string, number>();
    for (const it of items) {
      const d = (it.belegdatum || '').replace(/[^0-9]/g, '').slice(-4);
      const txt = (it.buchungstext || '').toLowerCase().replace(/[^a-z0-9äöüß]/gi, '').slice(0, 28);
      const base = `${d}|${(Number(it.amount) || 0).toFixed(2)}|${String(it.sh).toUpperCase()}|${it.konto || ''}|${txt}`;
      const occ = (counts.get(base) || 0) + 1;
      counts.set(base, occ);
      keys.set(it, `${base}#${occ}`);
    }
    return keys;
  },

  // ───────────────────────── Resolutions (user answers) ─────────────────────────
  getResolutions(scope: string): Record<string, ReviewResolution> {
    const all = readJson<Record<string, Record<string, ReviewResolution>>>(RESOLUTIONS_FILE, {});
    return all[scope] || {};
  },

  saveResolution(scope: string, lineKey: string, resolution: ReviewResolution): void {
    const all = readJson<Record<string, Record<string, ReviewResolution>>>(RESOLUTIONS_FILE, {});
    all[scope] = all[scope] || {};
    all[scope][lineKey] = resolution;
    writeJson(RESOLUTIONS_FILE, all);
  },

  removeResolution(scope: string, lineKey: string): boolean {
    const all = readJson<Record<string, Record<string, ReviewResolution>>>(RESOLUTIONS_FILE, {});
    if (!all[scope] || !all[scope][lineKey]) return false;
    delete all[scope][lineKey];
    writeJson(RESOLUTIONS_FILE, all);
    return true;
  },

  clearScope(scope: string): void {
    const all = readJson<Record<string, Record<string, ReviewResolution>>>(RESOLUTIONS_FILE, {});
    delete all[scope];
    writeJson(RESOLUTIONS_FILE, all);
  },

  /**
   * Applies saved user answers to the month's bookings.
   * Returns kept items + excluded lines + map of resolved keys + line-level resolution targets.
   */
  applyResolutions(
    scope: string,
    items: BookingItem[],
    lineKeys: Map<BookingItem, string>
  ): {
    kept: BookingItem[];
    excluded: Array<{ item: BookingItem; lineKey: string; resolution: ReviewResolution }>;
    resolvedKeys: Map<string, ReviewResolution>;
    lineResolutionTargets: LineResolutionTarget[];
  } {
    const saved = this.getResolutions(scope);
    const isSyntheticKey = (k: string) =>
      k.startsWith('NEG_CASH:') || k.startsWith('OPEN_INVOICE:') || k.startsWith('UNUSED_BELEG:') || k.startsWith('PARTIAL:');
    const structuralPrefixOf = (k: string): string => {
      const parts = k.split('|');
      return parts.length >= 5 ? `${parts.slice(0, 4).join('|')}|` : '';
    };

    // Precompute exact matches so unique structural fallback only touches unmatched saved keys & items
    const exactItemKeys = new Set(items.map((it) => lineKeys.get(it) || '').filter((k) => Boolean(k && saved[k])));
    const unmatchedItemPrefixCounts = new Map<string, number>();
    for (const it of items) {
      const key = lineKeys.get(it) || '';
      if (!key || saved[key]) continue;
      const pref = structuralPrefixOf(key);
      if (pref) unmatchedItemPrefixCounts.set(pref, (unmatchedItemPrefixCounts.get(pref) || 0) + 1);
    }
    const unmatchedSavedByPrefix = new Map<string, Array<{ savedKey: string; res: ReviewResolution }>>();
    for (const [k, v] of Object.entries(saved)) {
      if (isSyntheticKey(k) || exactItemKeys.has(k)) continue;
      const pref = structuralPrefixOf(k);
      if (!pref) continue;
      const list = unmatchedSavedByPrefix.get(pref) || [];
      list.push({ savedKey: k, res: v });
      unmatchedSavedByPrefix.set(pref, list);
    }

    const resolvedKeys = new Map<string, ReviewResolution>();
    const excluded: Array<{ item: BookingItem; lineKey: string; resolution: ReviewResolution }> = [];
    const kept: BookingItem[] = [];
    const lineResolutionTargets: LineResolutionTarget[] = [];

    for (const it of items) {
      const key = lineKeys.get(it) || '';
      let matchedSavedKey = key;
      let res = saved[key];
      if (!res && key) {
        const pref = structuralPrefixOf(key);
        const savedCands = pref ? unmatchedSavedByPrefix.get(pref) : undefined;
        if (pref && (unmatchedItemPrefixCounts.get(pref) || 0) === 1 && savedCands && savedCands.length === 1) {
          res = savedCands[0].res;
          matchedSavedKey = savedCands[0].savedKey;
        }
      }
      if (!res) {
        kept.push(it);
        continue;
      }
      const proposed = {
        konto: it.konto || '1200',
        gegenkonto: it.gegenkonto || '4900',
        buCode: it.buCode || '',
        belegdatum: it.belegdatum || '',
        amount: Number(it.amount) || 0,
        sh: (String(it.sh).toUpperCase() === 'S' ? 'S' : 'H') as 'S' | 'H',
        reviewHintType: it.reviewHint?.type,
        dateUncertain: Boolean((it.matchedBeleg as any)?.dateUncertain),
      };
      resolvedKeys.set(key, res);
      if (res.action === 'EXCLUDE') {
        excluded.push({ item: it, lineKey: key, resolution: res });
        continue;
      }
      if (res.action === 'SET_ACCOUNT' && res.gegenkonto) {
        if (it.konto === '1000' && String(it.sh).toUpperCase() === 'H' && res.gegenkonto === '1600') {
          // Partial cash purchase reclassified to open payable (3200 an 1600)
          const expAcc = it.gegenkonto && it.gegenkonto !== '1600' ? it.gegenkonto : '3200';
          it.konto = expAcc;
          it.gegenkonto = '1600';
          it.sh = 'S';
          it.buCode = res.buCode || '';
        } else if (it.konto === '1000' && String(it.sh).toUpperCase() === 'S' && res.gegenkonto === '1400') {
          // Partial cash sale reclassified to open receivable (1400 an 8193)
          const revAcc = it.gegenkonto && it.gegenkonto !== '1400' ? it.gegenkonto : '8193';
          it.konto = '1400';
          it.gegenkonto = revAcc;
          it.sh = 'S';
          it.buCode = res.buCode || '';
        } else {
          it.gegenkonto = res.gegenkonto;
          it.buCode = res.buCode || '';
        }
      }
      if (res.belegdatum && /^\d{4}$/.test(res.belegdatum)) {
        it.belegdatum = res.belegdatum;
      }
      kept.push(it);
      lineResolutionTargets.push({ key, savedKey: matchedSavedKey, item: it, resolution: res, proposed });
    }
    for (const [k, v] of Object.entries(saved)) {
      if (isSyntheticKey(k)) {
        resolvedKeys.set(k, v);
      }
    }
    return { kept, excluded, resolvedKeys, lineResolutionTargets };
  },

  /**
   * Materializes synthetic resolved review decisions (OPEN_INVOICE, UNUSED_BELEG, NEG_CASH Privateinlage)
   * into concrete BookingItem entries so they appear in the DATEV EXTF CSV export.
   */
  materializeResolvedDecisions(params: {
    items: BookingItem[];
    lineKeys: Map<BookingItem, string>;
    resolvedKeys: Map<string, ReviewResolution>;
    allClientRecords: any[];
    month: number;
    kasseOpeningBalance: number;
  }): {
    items: BookingItem[];
    materialized: MaterializedDecision[];
    missingMaterializations: string[];
  } {
    const items = [...params.items];
    const materialized: MaterializedDecision[] = [];
    const missingMaterializations: string[] = [];
    const fallbackMonthDate = `01${String(params.month).padStart(2, '0')}`;

    // Phase A: OPEN_INVOICE:<id> -> e.g. Willi Kaiser 10,000 € (3200 an 1600) or customer open receivable (1400 an 8193)
    for (const [k, res] of params.resolvedKeys.entries()) {
      if (!k.startsWith('OPEN_INVOICE:') || res.action === 'EXCLUDE') continue;
      const id = k.slice('OPEN_INVOICE:'.length);
      const r = params.allClientRecords.find((rec) => rec.id === id);
      if (!r) {
        missingMaterializations.push(`${k} (Beleg nicht gefunden)`);
        continue;
      }
      const isSale = r.type === 'QA24_SALE' || res.gegenkonto === '1400';
      const konto = isSale ? res.gegenkonto || '1400' : r.skr03Account || '3200';
      const gegenkonto = isSale ? r.skr03Account || '8193' : res.gegenkonto || '1600';
      const belegdatum =
        res.belegdatum && /^\d{4}$/.test(res.belegdatum) ? res.belegdatum : r.belegdatum || fallbackMonthDate;
      const ref = (r.vin || r.invoiceNo || '').slice(0, 36);
      const partnerClean = (r.partner || '').trim();
      const textSuffix = r.vin || r.invoiceNo || 'Offene Rechnung';
      const buchungstext = (partnerClean ? `${partnerClean} - ${textSuffix}` : `Offene Rechnung ${textSuffix}`)
        .trim()
        .slice(0, 60);

      const newItem: BookingItem = {
        amount: round2(Number(r.amount) || 0),
        sh: 'S',
        konto,
        gegenkonto,
        buCode: res.buCode || '',
        belegdatum,
        belegfeld1: ref,
        belegfeld2: '',
        buchungstext,
        currency: 'EUR',
        matchedBeleg: {
          id: r.id,
          source_file: r.source_file,
          pages: r.pages || [1],
          partner: r.partner,
          invoiceNo: r.invoiceNo,
          vin: r.vin,
          amount: r.amount,
          taxClause: r.taxClause,
          snippet: r.matchedLineSnippet,
          document_id: r.document_id,
        },
      };
      items.push(newItem);
      params.lineKeys.set(newItem, k);
      materialized.push({ resolutionKey: k, kind: 'OPEN_INVOICE', item: newItem, resolution: res });
    }

    // Phase B: UNUSED_BELEG:<id> -> Kasse 1000 booking
    for (const [k, res] of params.resolvedKeys.entries()) {
      if (!k.startsWith('UNUSED_BELEG:') || res.action === 'EXCLUDE') continue;
      const id = k.slice('UNUSED_BELEG:'.length);
      const r = params.allClientRecords.find((rec) => rec.id === id);
      if (!r) {
        missingMaterializations.push(`${k} (Beleg nicht gefunden)`);
        continue;
      }
      const enteredAmt = typeof res.amount === 'number' && res.amount > 0 ? res.amount : Number(r.amount) || 0;
      const finalAmount = round2(enteredAmt);
      if (!(finalAmount > 0)) {
        missingMaterializations.push(`${k} (Betrag 0,00 € unzulässig)`);
        continue;
      }
      const isSale =
        res.sh === 'S'
          ? true
          : res.sh === 'H'
          ? false
          : res.gegenkonto === '8193' || res.gegenkonto === '8400' || res.gegenkonto === '8125'
          ? true
          : res.gegenkonto === '3200'
          ? false
          : r.type === 'QA24_SALE';
      const gegenkonto = res.gegenkonto || (isSale ? '8193' : r.skr03Account || '3200');
      const belegdatum =
        res.belegdatum && /^\d{4}$/.test(res.belegdatum) ? res.belegdatum : r.belegdatum || fallbackMonthDate;
      const ref = (isSale ? r.invoiceNo || r.vin : r.vin || r.invoiceNo) || '';
      const partnerClean = (r.partner || '').trim();
      const buchungstext = (
        partnerClean
          ? `${partnerClean} - ${r.vin || r.invoiceNo || (isSale ? 'Fahrzeugverkauf' : 'Fahrzeugeinkauf')}`
          : `${isSale ? 'Fahrzeugverkauf' : 'Fahrzeugeinkauf'}${r.vin ? ' ' + r.vin : ''}`
      ).slice(0, 60);

      const newItem: BookingItem = {
        amount: finalAmount,
        sh: isSale ? 'S' : 'H',
        konto: '1000',
        gegenkonto,
        buCode: res.buCode || '',
        belegdatum,
        belegfeld1: String(ref).slice(0, 36),
        belegfeld2: '',
        buchungstext,
        currency: 'EUR',
        matchedBeleg: {
          id: r.id,
          source_file: r.source_file,
          pages: r.pages || [1],
          partner: r.partner,
          invoiceNo: r.invoiceNo,
          vin: r.vin,
          amount: finalAmount,
          taxClause: r.taxClause,
          snippet: r.matchedLineSnippet,
          document_id: r.document_id,
        },
      };
      items.push(newItem);
      params.lineKeys.set(newItem, k);
      materialized.push({ resolutionKey: k, kind: 'UNUSED_BELEG', item: newItem, resolution: res });
    }

    // Phase C: NEG_CASH:<date> -> Privateinlage (1000 an 0730 / 1890), runs AFTER Phase A & B so Kasse reflects any UNUSED_BELEG entries
    const kassePre = computeDailyKasse(items, params.kasseOpeningBalance);
    const exactNegKey = kassePre.minCashDate ? `NEG_CASH:${kassePre.minCashDate}` : '';
    const negEntry =
      (exactNegKey && params.resolvedKeys.has(exactNegKey)
        ? ([exactNegKey, params.resolvedKeys.get(exactNegKey)!] as const)
        : Array.from(params.resolvedKeys.entries()).find(([k]) => k.startsWith('NEG_CASH:'))) || null;

    if (kassePre.minCash < -0.05 && negEntry) {
      const [negKey, res] = negEntry;
      if (res.action !== 'EXCLUDE' && ['0730', '1890'].includes(res.gegenkonto || '')) {
        const depositAmt = round2(Math.abs(kassePre.minCash));
        // Book on firstNegDate (first day Kasse dips below 0) so every day's ending balance is >= 0
        const depositDate =
          res.belegdatum && /^\d{4}$/.test(res.belegdatum)
            ? res.belegdatum
            : kassePre.firstNegDate || kassePre.minCashDate || fallbackMonthDate;
        const newItem: BookingItem = {
          amount: depositAmt,
          sh: 'S',
          konto: '1000',
          gegenkonto: res.gegenkonto!,
          buCode: res.buCode || '',
          belegdatum: depositDate,
          belegfeld1: '',
          belegfeld2: '',
          buchungstext: `Privateinlage Gesellschafter (Kassendeckung ${fmtDate(kassePre.minCashDate)})`.slice(0, 60),
          currency: 'EUR',
        };
        const firstCashIdx = items.findIndex((it) => it.konto === '1000' || it.gegenkonto === '1000');
        if (firstCashIdx >= 0) {
          items.splice(firstCashIdx, 0, newItem);
        } else {
          items.push(newItem);
        }
        params.lineKeys.set(newItem, negKey);
        materialized.push({
          resolutionKey: negKey,
          kind: 'NEG_CASH',
          item: newItem,
          resolution: res,
          meta: {
            minCashBefore: kassePre.minCash,
            minCashDate: kassePre.minCashDate,
            firstNegDate: kassePre.firstNegDate,
          },
        });
      }
    }

    return { items, materialized, missingMaterializations };
  },

  // ───────────────────────── Vendor memory ("save for future") ─────────────────────────
  payeeKey(text: string): string {
    const beforeDash = (text || '').split(/\s+-\s+|\s+PN:|\s{2,}/)[0].toLowerCase().replace(/[^a-zäöüß0-9\s]/gi, ' ').trim();
    const words = beforeDash.split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
    return words.slice(0, 3).join(' ');
  },

  getVendorRules(): Record<string, { gegenkonto: string; buCode: string; saved_at: string; example: string }> {
    return readJson(VENDOR_RULES_FILE, {});
  },

  saveVendorRule(text: string, gegenkonto: string, buCode: string, clientId?: string): string | null {
    // A "Remember vendor" rule may never default to 3200
    if (gegenkonto === '3200') return null;
    const key = this.payeeKey(text);
    if (!key || key.length < 4) return null;
    clientRulesService.saveVendorRule(clientId, key, gegenkonto, buCode);
    const rules = this.getVendorRules();
    rules[key] = { gegenkonto, buCode, saved_at: new Date().toISOString(), example: (text || '').slice(0, 80) };
    writeJson(VENDOR_RULES_FILE, rules);
    return key;
  },

  /** Applies user-confirmed vendor rules to still-unknown (4900) lines. Returns number applied. */
  applyVendorRules(items: BookingItem[]): number {
    const rules = this.getVendorRules();
    const keys = Object.keys(rules);
    if (keys.length === 0) return 0;
    let applied = 0;
    for (const it of items) {
      if (it.gegenkonto !== '4900' || it.konto === '1000') continue;
      const k = this.payeeKey(it.buchungstext || '');
      const rule = k ? rules[k] : undefined;
      if (rule && rule.gegenkonto !== '3200') {
        it.gegenkonto = rule.gegenkonto;
        it.buCode = rule.buCode || '';
        applied++;
      }
    }
    return applied;
  },

  // ───────────────────────── AI advice (Qwen explains doubts) ─────────────────────────
  getAiAdvice(scope: string): Record<string, { suggested_gegenkonto: string; suggested_bu: string; confidence: number; reason: string }> {
    const all = readJson<Record<string, Record<string, any>>>(AI_ADVICE_FILE, {});
    return all[scope] || {};
  },

  /**
   * Asks local Qwen for a suggestion + one-line reason for every open doubt.
   * The answer is ONLY a suggestion shown in the Review List — never auto-applied.
   */
  async generateAiAdvice(report: ReviewReport): Promise<number> {
    const open = report.issues.filter((i) => !i.resolved && i.options.length > 0).slice(0, 25);
    if (open.length === 0) return 0;
    const batch = open.map((i, idx) => ({
      id: idx,
      question: i.question,
      direction: i.booking.sh === 'S' && i.booking.konto === '1200' ? 'incoming' : i.booking.sh === 'H' && i.booking.konto === '1200' ? 'outgoing' : i.booking.konto === '1000' ? 'cash' : 'other',
      amount: i.booking.amount,
      text: i.booking.text,
      allowed: i.options.map((o) => o.gegenkonto),
    }));
    const prompt = `You are an experienced German tax accountant (SKR03, DATEV) for a used-car dealership.
For each open booking doubt choose the most plausible account from its "allowed" list ONLY.
Rules: §25a margin scheme (8193) only if the car was bought from a private seller; 8125 only for EU buyers with VAT-ID;
refunds go back to the ORIGINAL expense account; never invent facts.
Return a confidence 0.0-1.0 and ONE short reason (max 18 words, English).

Doubts:
${JSON.stringify(batch)}

Return ONLY JSON: { "results": [ { "id": 0, "gegenkonto": "....", "confidence": 0.0, "reason": "..." } ] }`;
    const schema = {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              gegenkonto: { type: 'string' },
              confidence: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['id', 'gegenkonto', 'confidence', 'reason'],
          },
        },
      },
      required: ['results'],
    };
    if (!ollamaClient.isEnabled()) {
      return 0;
    }
    try {
      const resp = await ollamaClient.generateJson<{ results?: Array<{ id: number; gegenkonto: string; confidence: number; reason: string }> }>({
        prompt,
        format: schema,
        temperature: 0,
      });
      const results = Array.isArray(resp?.results) ? resp.results : [];
      const all = readJson<Record<string, Record<string, any>>>(AI_ADVICE_FILE, {});
      all[report.scope] = all[report.scope] || {};
      let stored = 0;
      for (const r of results) {
        const issue = open[r.id];
        if (!issue) continue;
        const opt = issue.options.find((o) => o.gegenkonto === String(r.gegenkonto));
        if (!opt) continue; // ignore anything outside the allowed list
        all[report.scope][issue.lineKey] = {
          suggested_gegenkonto: opt.gegenkonto,
          suggested_bu: opt.buCode,
          confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
          reason: String(r.reason || '').slice(0, 180),
        };
        stored++;
      }
      writeJson(AI_ADVICE_FILE, all);
      console.log(`[Review AI] Qwen advised ${stored}/${open.length} open doubt(s) for ${report.scope}.`);
      return stored;
    } catch (err: any) {
      console.warn('[Review AI] Qwen advice skipped (non-fatal):', err?.message || err);
      return 0;
    }
  },

  // ───────────────────────── Doubt detection + control checks ─────────────────────────
  analyze(items: BookingItem[], ctx: AnalyzeContext): ReviewReport {
    const issues: ReviewIssue[] = [];
    const advice = this.getAiAdvice(ctx.scope);
    const vinGroups = new Map<string, BookingItem[]>();

    const view = (it: BookingItem, key: string): ReviewBookingView => ({
      lineKey: key,
      date: fmtDate(it.belegdatum),
      amount: round2(Number(it.amount) || 0),
      sh: (String(it.sh).toUpperCase() === 'S' ? 'S' : 'H') as 'S' | 'H',
      konto: it.konto,
      gegenkonto: it.gegenkonto,
      buCode: it.buCode || '',
      text: it.buchungstext || '',
      belegfeld1: it.belegfeld1 || '',
    });

    // Withdrawals available on bank (1200 -> 1360, H) for cash-plausibility matching
    const withdrawalAmounts: number[] = items
      .filter((it) => it.konto === '1200' && it.gegenkonto === '1360' && String(it.sh).toUpperCase() === 'H')
      .map((it) => Number(it.amount) || 0);
    const usedWithdrawal = new Array(withdrawalAmounts.length).fill(false);

    const pushIssue = (it: BookingItem, issue: Omit<ReviewIssue, 'id' | 'lineKey' | 'booking' | 'resolved' | 'resolution'>) => {
      const key = ctx.lineKeys.get(it) || '';
      const res = ctx.resolvedKeys.get(key);
      const adv = advice[key];
      const aiFromLine =
        it.ai_category || it.ai_confidence !== undefined
          ? {
            category: it.ai_category,
            confidence: it.ai_confidence,
            reason: it.ai_reason,
            suggested_gegenkonto: it.ai_suggested_gegenkonto,
            suggested_bu: it.ai_suggested_bu,
          }
          : undefined;
      const ai = adv
        ? { confidence: adv.confidence, reason: adv.reason, suggested_gegenkonto: adv.suggested_gegenkonto, suggested_bu: adv.suggested_bu, category: aiFromLine?.category }
        : aiFromLine;
      const options = issue.options.map((o) => ({
        ...o,
        recommended: !!ai?.suggested_gegenkonto && ai.suggested_gegenkonto === o.gegenkonto,
      }));
      issues.push({
        ...issue,
        options,
        ai,
        matchedBeleg: issue.matchedBeleg || it.matchedBeleg,
        id: `${issue.type}:${key}`,
        lineKey: key,
        booking: view(it, key),
        resolved: !!res,
        resolution: res,
      });
    };

    for (const it of items) {
      const key = ctx.lineKeys.get(it) || '';
      const amt = Number(it.amount) || 0;
      const sh = String(it.sh).toUpperCase();
      const text = `${it.buchungstext || ''} ${it.belegfeld1 || ''}`;
      const lower = text.toLowerCase();
      const isBank = it.konto === '1200';
      const isCash = it.konto === '1000';
      let flagged = false;

      // 0) Invalid amount / missing accounts
      if (!(amt > 0) || !it.konto || !it.gegenkonto) {
        pushIssue(it, {
          type: 'INVALID_AMOUNT',
          categoryTab: 'MISSING_BELEG',
          severity: 'CRITICAL',
          title: 'Ungültige Buchung (Betrag/Konto fehlt)',
          question: 'This line has no valid amount or account. Exclude it from the DATEV export?',
          details: `Betrag ${amt.toFixed(2)} € • Konto ${it.konto || '—'} / Gegenkonto ${it.gegenkonto || '—'}`,
          options: [{ gegenkonto: it.gegenkonto || '', buCode: it.buCode || '', label: 'Aus Export entfernen', action: 'EXCLUDE' }],
          suggest_upload: 'Upload the original receipt again so the amount can be read correctly.',
        });
        continue;
      }

      // 1) Car sale whose VIN was not found in purchase history (8193 vs 8400 decision)
      // Grouped by car/customer ("1 Car = 1 Question") after the loop so partial payments combine into one question.
      if (ctx.vinUnresolved.has(it) && sh === 'S' && ['8193', '8400', '8125'].includes(it.gegenkonto)) {
        const vin = extractVinFromText(text) || it.matchedBeleg?.vin || undefined;
        const invOrContract =
          it.matchedBeleg?.invoiceNo ||
          (it.belegfeld1 && it.belegfeld1.length >= 4 && !/^\d{5}\s/.test(it.belegfeld1) ? `ID:${it.belegfeld1.toUpperCase()}` : '') ||
          '';
        const gKey = it.carGroupKey || vin || invOrContract || key;
        const arr = vinGroups.get(gKey) || [];
        arr.push(it);
        vinGroups.set(gKey, arr);
        flagged = true;
      }

      // 2) Refund / Rückerstattung with unclear origin
      if (
        !flagged &&
        sh === 'S' &&
        isBank &&
        /(rückerstattung|rueckerstattung|erstattung|gutschrift|refund|rückzahlung|rueckzahlung|storno|rückbuchung|rueckbuchung)/i.test(lower)
      ) {
        // Auto-link known vendor refunds
        if (['8400', '4900'].includes(it.gegenkonto)) {
          if (/ebay/i.test(lower) || /auto-teile/i.test(lower)) {
            it.gegenkonto = '4540';
            it.buCode = '9';
          }
        }
        if (!['4955', '4520', '4530', '4540', '4210', '4510', '4970', '1780', '1576', '4930'].includes(it.gegenkonto)) {
          pushIssue(it, {
            type: 'REFUND_UNCLEAR',
            categoryTab: 'DECISION',
            severity: 'CRITICAL',
            title: 'Rückerstattung: Ursprungskonto unklar',
            question: 'Incoming refund — which ORIGINAL expense/income account must be reversed?',
            details: `Eingang ${amt.toFixed(2)} € • aktuell Gegenkonto ${it.gegenkonto}`,
            options: [
              { gegenkonto: '4540', buCode: '9', label: '4540 Kfz-Reparaturen / Teile (Erstattung)' },
              { gegenkonto: '4520', buCode: '', label: '4520 Kfz-Versicherung (Erstattung)' },
              { gegenkonto: '4530', buCode: '9', label: '4530 Kfz-Betriebskosten (Erstattung)' },
              { gegenkonto: '4930', buCode: '9', label: '4930 Bürobedarf / Software (Erstattung)' },
              { gegenkonto: '4210', buCode: '', label: '4210 Miete (Erstattung)' },
              { gegenkonto: '4955', buCode: '9', label: '4955 Buchführungskosten (Storno/Erstattung)' },
              { gegenkonto: '4510', buCode: '', label: '4510 Kfz-Steuer (Erstattung Hauptzollamt)' },
              { gegenkonto: '3200', buCode: '', label: '3200 Rückzahlung Fahrzeugankauf' },
              { gegenkonto: '8400', buCode: '', label: '8400 Kundenzahlung (keine Erstattung)' },
            ],
            suggest_upload: 'Upload the refund letter / credit note so the original booking can be identified.',
          });
          flagged = true;
        }
      }

      // 2b) Credit from an owner: Stammkapital or Privateinlage? (question comes from the rule engine)
      if (!flagged && it.reviewHint?.type === 'STAMMKAPITAL_UNCLEAR') {
        pushIssue(it, {
          type: 'STAMMKAPITAL_UNCLEAR',
          categoryTab: 'DECISION',
          severity: 'CRITICAL',
          title: 'Einzahlung eines Gesellschafters: Stammkapital oder Privateinlage?',
          question: it.reviewHint.question || 'Stammkapital 0800 oder Privateinlage 0730?',
          details: `Eingang ${amt.toFixed(2)} € von einem Gesellschafter • Stammkapital-Grenze überschritten oder unklar`,
          options: [
            { gegenkonto: '0800', buCode: '', label: '0800 Gezeichnetes Kapital (Stammkapital)' },
            { gegenkonto: '0730', buCode: '', label: '0730 Privateinlage / Gesellschafter-Verrechnungskonto' },
          ],
          suggest_upload: 'Gesellschaftsvertrag oder Einzahlungsbeleg hochladen.',
        });
        flagged = true;
      }

      // 2c) Incoming bank payment with NO QA24 invoice & NO VIN -> "Beleg fehlt" question
      if (!flagged && it.reviewHint?.type === 'MISSING_BELEG_INCOMING') {
        const isDeposit = /\banzahlung\b/i.test(it.buchungstext || '');
        pushIssue(it, {
          type: 'MISSING_BELEG_INCOMING',
          categoryTab: 'MISSING_BELEG',
          severity: 'CRITICAL',
          title: isDeposit ? 'Beleg fehlt: Erhaltene Anzahlung ohne Rechnung' : 'Beleg fehlt: Geldeingang ohne Rechnung',
          question:
            it.reviewHint.question ||
            'Für diesen Geldeingang wurde keine QA24-Rechnung gefunden. Bitte Beleg hochladen oder passendes Konto wählen:',
          details: `Eingang ${amt.toFixed(2)} € • keine passende Ausgangsrechnung im Beleg-Index`,
          options: [
            ...INCOME_OPTIONS.map((o) => (isDeposit && o.gegenkonto === '1718' ? { ...o, recommended: true } : o)),
            { gegenkonto: '3200', buCode: '', label: '3200 Rückzahlung / Gutschrift Fahrzeugankauf' },
            { gegenkonto: '0730', buCode: '', label: '0730 Gesellschafter-Verrechnungskonto' },
          ],
          suggest_upload: 'Fehlende Ausgangsrechnung / Gutschrift zu diesem Geldeingang hochladen.',
        });
        flagged = true;
      }

      // 3) Unknown vendor / low AI confidence (still 4900)
      if (!flagged && isBank && it.gegenkonto === '4900') {
        const aiConf = it.ai_confidence;
        const opts = sh === 'S' ? INCOME_OPTIONS : EXPENSE_OPTIONS;
        const aiAcc = it.ai_category ? AI_CATEGORY_ACCOUNT[it.ai_category] : undefined;
        pushIssue(it, {
          type: 'UNKNOWN_ACCOUNT',
          categoryTab: it.matchedBeleg ? 'DECISION' : 'MISSING_BELEG',
          severity: 'CRITICAL',
          title: aiConf !== undefined ? `Unbekannter Empfänger (KI-Sicherheit ${(aiConf * 100).toFixed(0)}%)` : 'Unbekannter Empfänger / Konto unklar',
          question: it.matchedBeleg
            ? `Beleg gefunden (${it.matchedBeleg.partner}), bitte Gegenkonto bestätigen:`
            : 'The system could not identify this vendor reliably. Which SKR03 account is correct?',
          details: `${sh === 'S' ? 'Eingang' : 'Ausgang'} ${amt.toFixed(2)} €${aiAcc ? ` • KI-Vorschlag ${aiAcc.gegenkonto}` : ''}`,
          options: opts,
          suggest_upload: 'Upload the invoice/receipt of this payment for automatic recognition.',
        });
        flagged = true;
      }

      // 4) Cash deposit (1000/1360) without a matching bank withdrawal
      if (!flagged && isCash && it.gegenkonto === '1360' && sh === 'S') {
        let matched = false;
        for (let i = 0; i < withdrawalAmounts.length; i++) {
          if (!usedWithdrawal[i] && withdrawalAmounts[i] + 0.01 >= amt) {
            usedWithdrawal[i] = true;
            matched = true;
            break;
          }
        }
        if (!matched && ctx.hasBankStatement) {
          pushIssue(it, {
            type: 'CASH_WITHOUT_WITHDRAWAL',
            categoryTab: 'MISSING_BELEG',
            severity: 'CRITICAL',
            title: 'Bareinzahlung ohne Bank-Abhebung',
            question: 'Cash deposit to Kasse has no matching bank withdrawal (Geldtransit 1360 will not be 0). What is the source?',
            details: `Kasse +${amt.toFixed(2)} € • keine passende BAR-AUSZAHLUNG auf dem Kontoauszug`,
            options: [
              { gegenkonto: '1890', buCode: '', label: '1890 Privateinlage / Gesellschaftereinlage' },
              { gegenkonto: '0730', buCode: '', label: '0730 Verbindlichkeiten ggü. Gesellschaftern' },
              { gegenkonto: '8400', buCode: '', label: '8400 Barverkauf (Erlös 19%)' },
              { gegenkonto: '8193', buCode: '', label: '8193 Barverkauf §25a' },
              { gegenkonto: '1360', buCode: '', label: 'Kein Beleg vorhanden → aus Export entfernen', action: 'EXCLUDE' },
            ],
            suggest_upload: 'Upload the Kassebeleg / Einzahlungsbeleg or the bank statement containing the withdrawal.',
          });
          flagged = true;
        }
      }

      // 5) Large cash transaction (> 5,000 €) without an attached Kassenbeleg needs evidence confirmation
      const isMaterializedKey =
        key.startsWith('NEG_CASH:') || key.startsWith('OPEN_INVOICE:') || key.startsWith('UNUSED_BELEG:');
      if (!flagged && isCash && !isMaterializedKey && !['1360', '0730', '1890'].includes(it.gegenkonto) && amt > 5000 && !it.matchedBeleg) {
        pushIssue(it, {
          type: 'LARGE_CASH',
          categoryTab: 'MISSING_BELEG',
          severity: 'CRITICAL',
          title: 'Hohe Barbuchung (> 5.000 €)',
          question: 'Large cash booking. Is there an original Kassebeleg for exactly this amount?',
          details: `Kasse ${sh === 'S' ? '+' : '−'}${amt.toFixed(2)} € • Gegenkonto ${it.gegenkonto}`,
          options: [
            { gegenkonto: it.gegenkonto, buCode: it.buCode || '', label: `Ja, Beleg vorhanden → ${it.gegenkonto} bestätigen`, action: 'ACCEPT' },
            { gegenkonto: it.gegenkonto, buCode: it.buCode || '', label: 'Kein Beleg → aus Export entfernen', action: 'EXCLUDE' },
          ],
          suggest_upload: 'Upload the signed Kassebeleg / Kaufvertrag for this cash amount.',
        });
        flagged = true;
      }

      // 5b) Contract / receipt with unreadable / uncertain date in OCR -> review question, not a guess
      if (!flagged && isCash && (it.matchedBeleg as any)?.dateUncertain) {
        const mb: any = it.matchedBeleg;
        pushIssue(it, {
          type: 'LARGE_CASH',
          categoryTab: 'DECISION',
          severity: 'CRITICAL',
          requiresDateInput: true,
          title: `Vertrags-/Zahlungsdatum unleserlich: ${mb.partner || it.buchungstext} (${amt.toFixed(2)} €)`,
          question: `Kein eindeutiges Vertrags-/Zahlungsdatum im Beleg lesbar (${mb.source_file}, S. ${(mb.pages || []).join(', ') || 1}). Bitte Belegdatum eingeben und Buchung bestätigen:`,
          details: `${mb.partner || it.buchungstext} • ${amt.toFixed(2)} € • Vorläufiges Datum ${fmtDate(it.belegdatum)} • S. ${(mb.pages || []).join(', ') || 1}`,
          options: [
            { gegenkonto: it.gegenkonto, buCode: it.buCode || '', label: `Datum / Buchung bestätigen (${it.gegenkonto})`, action: 'ACCEPT' },
            { gegenkonto: it.gegenkonto, buCode: it.buCode || '', label: 'Aus Export entfernen', action: 'EXCLUDE' },
          ],
        });
        flagged = true;
      }

      // 5c) Restaurant / Einzelunternehmer specific gate questions (Mercedes-Benz Bank, business cars, grocery vs private)
      const isRestaurant = clientRulesService.getRules(ctx.clientId)?.business_type === 'restaurant';
      if (!flagged && isRestaurant && isBank) {
        const bTxt = it.buchungstext || '';
        if (/mercedes-benz\s*bank/i.test(bTxt)) {
          pushIssue(it, {
            type: 'UNKNOWN_ACCOUNT',
            categoryTab: 'DECISION',
            severity: 'CRITICAL',
            title: `Mercedes-Benz Bank Vertrag (${amt.toFixed(2)} €)`,
            question: `Mercedes-Benz Bank Zahlung (${amt.toFixed(2)} €): Handelt es sich um Leasing, Finanzierung oder Privat?`,
            details: `Ausgang ${amt.toFixed(2)} € • Vertrag bitte zuordnen`,
            options: [
              { gegenkonto: '4570', buCode: '9', label: '4570 Kfz-Leasing (geschäftlich)' },
              { gegenkonto: '1705', buCode: '', label: '1705 Darlehen / Finanzierung Tilgung' },
              { gegenkonto: '1800', buCode: '', label: '1800 Privatentnahme (Privatfahrzeug)' },
            ],
            suggest_upload: 'Bitte Mercedes-Benz Bank Leasing-/Finanzierungsvertrag hochladen.',
          });
          flagged = true;
        } else if (/kfz-versicher|kfz-steuer/i.test(bTxt)) {
          const plateM = bTxt.match(/\b((?:OBB|MIL)[-\s]*[A-Z]{1,2}\s*\d{2,4})\b/i);
          const plate = plateM ? plateM[1].toUpperCase() : bTxt.slice(0, 30);
          pushIssue(it, {
            type: 'UNKNOWN_ACCOUNT',
            categoryTab: 'DECISION',
            severity: 'CRITICAL',
            title: `Fahrzeug geschäftlich oder privat? (${plate})`,
            question: `Ist das Fahrzeug ${plate} ein Geschäftsfahrzeug oder Privatfahrzeug?`,
            details: `${bTxt} • ${amt.toFixed(2)} €`,
            options: [
              { gegenkonto: it.gegenkonto || '4520', buCode: '', label: `${it.gegenkonto || '4520'} Geschäftsfahrzeug bestätigen` },
              { gegenkonto: '1800', buCode: '', label: '1800 Privatentnahme (Privatfahrzeug)' },
            ],
          });
          flagged = true;
        } else if (/\b(lidl|aldi|rewe)\b/i.test(bTxt) && sh === 'H') {
          pushIssue(it, {
            type: 'UNKNOWN_ACCOUNT',
            categoryTab: 'DECISION',
            severity: 'WARNING',
            title: `Supermarkt-Einkauf geschäftlich oder privat? (${amt.toFixed(2)} €)`,
            question: `Ist dieser Einkauf (${bTxt.slice(0, 40)}) Wareneingang für das Restaurant oder Privatentnahme?`,
            details: `Ausgang ${amt.toFixed(2)} € • aktuell ${it.gegenkonto}`,
            options: [
              { gegenkonto: it.gegenkonto || '3300', buCode: it.buCode || '8', label: `${it.gegenkonto || '3300'} Wareneingang Restaurant bestätigen` },
              { gegenkonto: '1800', buCode: '', label: '1800 Privatentnahme (private Einkäufe)' },
            ],
          });
          flagged = true;
        }
      }

      // 5d) Double-read mismatch or handwritten price correction -> CRITICAL Question (never auto-book)
      const mbAny: any = it.matchedBeleg;
      if (!flagged && mbAny && (mbAny.doubleReadMismatch || mbAny.handwrittenCorrection)) {
        pushIssue(it, {
          type: 'LARGE_CASH',
          categoryTab: 'DECISION',
          severity: 'CRITICAL',
          title: mbAny.handwrittenCorrection
            ? `Handschriftliche Korrektur am Preis: ${mbAny.partner || it.buchungstext}`
            : `Doppelprüfung Abweichung (Betrag/Datum/VIN): ${mbAny.partner || it.buchungstext}`,
          question: mbAny.handwrittenCorrection
            ? `Handschriftliche Änderung/Durchstreichung erkannt (${mbAny.source_file}, S. ${(mbAny.pages || []).join(', ') || 1}). Bitte Betrag & Konto prüfen:`
            : `Vollseite und Ausschnitt weichen bei Betrag, Datum oder VIN ab (${mbAny.source_file}, S. ${(mbAny.pages || []).join(', ') || 1}). Bitte bestätigen:`,
          details: `${mbAny.partner || it.buchungstext} • ${amt.toFixed(2)} € • ${mbAny.source_file}`,
          options: [
            { gegenkonto: it.gegenkonto || '4900', buCode: it.buCode || '', label: `${it.gegenkonto || '4900'} (${amt.toFixed(2)} €) bestätigen`, action: 'ACCEPT' },
            { gegenkonto: '1800', buCode: '', label: '1800 Privatentnahme / korrigieren' },
            { gegenkonto: it.gegenkonto || '4900', buCode: '', label: 'Aus Export entfernen', action: 'EXCLUDE' },
          ],
        });
        flagged = true;
      }

      // 6) Placeholder / empty booking text
      if (!flagged && /(brief description|lorem ipsum|placeholder|beispieltext|\bn\/a\b|^\s*unknown\s*$|^\s*$)/i.test(it.buchungstext || '')) {
        pushIssue(it, {
          type: 'PLACEHOLDER_TEXT',
          categoryTab: 'DECISION',
          severity: 'WARNING',
          title: 'Platzhalter-Buchungstext',
          question: 'Booking text looks like a placeholder. Keep this booking?',
          details: `"${(it.buchungstext || '').slice(0, 60)}" • ${amt.toFixed(2)} €`,
          options: [
            { gegenkonto: it.gegenkonto, buCode: it.buCode || '', label: 'Buchung behalten', action: 'ACCEPT' },
            { gegenkonto: it.gegenkonto, buCode: it.buCode || '', label: 'Aus Export entfernen', action: 'EXCLUDE' },
          ],
        });
      }
      void key;
    }

    // Emit 1 grouped VIN_NOT_FOUND issue per car / customer ("1 Car = 1 Question")
    for (const [, group] of vinGroups.entries()) {
      const first = group[0];
      const keys = group.map((g) => ctx.lineKeys.get(g) || '').filter(Boolean);
      const firstKey = keys[0] || '';
      const totalAmt = round2(group.reduce((s, g) => s + (Number(g.amount) || 0), 0));
      const matchedBeleg = group.map((g) => g.matchedBeleg).find(Boolean);
      const vin =
        group
          .map((g) => extractVinFromText(`${g.buchungstext || ''} ${g.belegfeld1 || ''}`))
          .find(Boolean) ||
        matchedBeleg?.vin ||
        undefined;
      const firstRes = ctx.resolvedKeys.get(firstKey);
      const allResolved = keys.length > 0 && keys.every((k) => ctx.resolvedKeys.has(k));
      const adv = advice[firstKey];
      const aiFromLine =
        first.ai_category || first.ai_confidence !== undefined
          ? {
            category: first.ai_category,
            confidence: first.ai_confidence,
            reason: first.ai_reason,
            suggested_gegenkonto: first.ai_suggested_gegenkonto,
            suggested_bu: first.ai_suggested_bu,
          }
          : undefined;
      const ai = adv
        ? {
          confidence: adv.confidence,
          reason: adv.reason,
          suggested_gegenkonto: adv.suggested_gegenkonto,
          suggested_bu: adv.suggested_bu,
          category: aiFromLine?.category,
        }
        : aiFromLine;
      const baseOptions = [
        { gegenkonto: '8193', buCode: '', label: '8193 §25a Differenzbesteuerung (Ankauf von Privat)' },
        { gegenkonto: '8400', buCode: '', label: '8400 Regelbesteuerung 19% (Ankauf mit MwSt-Rechnung)' },
        { gegenkonto: '8125', buCode: '', label: '8125 EU-Lieferung steuerfrei (Käufer mit USt-IdNr.)' },
      ];
      const options = baseOptions.map((o) => ({
        ...o,
        recommended: !!ai?.suggested_gegenkonto && ai.suggested_gegenkonto === o.gegenkonto,
      }));
      const bookingView = view(first, firstKey);
      bookingView.amount = totalAmt;
      if (group.length > 1) {
        bookingView.text = `[${group.length} Teilzahlungen] ${first.buchungstext || ''}`;
      }
      issues.push({
        id: `VIN_NOT_FOUND:${firstKey}`,
        lineKey: firstKey,
        relatedLineKeys: keys.length > 1 ? keys : undefined,
        relatedBookings: group.length > 1 ? group.map((g, idx) => view(g, keys[idx] || '')) : undefined,
        categoryTab: 'DECISION',
        type: 'VIN_NOT_FOUND',
        severity: 'CRITICAL',
        title:
          group.length > 1
            ? `Fahrzeugverkauf (${group.length} Teilzahlungen): Steuerart prüfen`
            : 'Fahrzeugverkauf: Ankauf (VIN) nicht gefunden',
        question: vin
          ? `VIN ${vin} has no purchase record. How was this car bought — §25a (private seller) or with VAT invoice?`
          : 'Car sale without VIN / purchase record. Was the car bought §25a (private) or with a VAT invoice?',
        details:
          group.length > 1
            ? `${group.length} Teilzahlungen, Summe ${totalAmt.toFixed(2)} € • aktuell Gegenkonto ${first.gegenkonto} (nur Vorschlag, nicht final)`
            : `Verkauf ${totalAmt.toFixed(2)} € • aktuell Gegenkonto ${first.gegenkonto} (nur Vorschlag, nicht final)`,
        booking: bookingView,
        matchedBeleg,
        options,
        ai,
        suggest_upload: 'Upload the purchase contract (Ankaufvertrag) of this car — the VIN will then resolve automatically.',
        resolved: allResolved,
        resolution: firstRes,
      });
    }

    // Excluded lines are shown as resolved items (audit trail)
    for (const ex of ctx.excludedLines) {
      issues.push({
        id: `EXCLUDED:${ex.lineKey}`,
        lineKey: ex.lineKey,
        type: 'INVALID_AMOUNT',
        severity: 'WARNING',
        title: 'Aus Export entfernt',
        question: 'Removed by user decision.',
        details: ex.resolution.note || '',
        booking: view(ex.item, ex.lineKey),
        options: [],
        resolved: true,
        resolution: ex.resolution,
      });
    }

    // Partial bank payments (contract/invoice partly paid by bank -> cash rest booking + review question)
    if (ctx.partialPayments && ctx.partialPayments.length > 0) {
      for (const p of ctx.partialPayments) {
        const itemKey = p.item ? ctx.lineKeys.get(p.item) : undefined;
        const key = itemKey || `PARTIAL:${p.beleg?.id || p.partner}:${p.restAmount.toFixed(2)}`;
        const res = ctx.resolvedKeys.get(key);
        const isSale = p.type === 'QA24_SALE';
        issues.push({
          id: `PARTIAL:${key}`,
          lineKey: key,
          type: 'CASH_WITHOUT_WITHDRAWAL',
          categoryTab: 'MISSING_BELEG',
          severity: 'CRITICAL',
          title: `Restbetrag ${isSale ? 'bar erhalten' : 'bar bezahlt'}? ${p.partner} (${p.restAmount.toFixed(2)} €)`,
          question: isSale
            ? `Rechnungssumme ist ${p.docAmount.toFixed(2)} €, davon gingen ${p.bankAmount.toFixed(2)} € über die Bank ein. Restbetrag (${p.restAmount.toFixed(2)} €) bar erhalten?`
            : `Vertragssumme ist ${p.docAmount.toFixed(2)} €, davon gingen ${p.bankAmount.toFixed(2)} € über die Bank. Restbetrag (${p.restAmount.toFixed(2)} €) bar bezahlt?`,
          details: `${p.partner} • Beleg ${p.docAmount.toFixed(2)} € • Bank ${p.bankAmount.toFixed(2)} € • Rest ${p.restAmount.toFixed(2)} €${p.vin ? ' • VIN ' + p.vin : ''}`,
          booking: p.item
            ? view(p.item, key)
            : {
                lineKey: key,
                date: fmtDate(p.beleg?.belegdatum || '0103'),
                amount: p.restAmount,
                sh: isSale ? 'S' : 'H',
                konto: '1000',
                gegenkonto: isSale ? '8193' : '3200',
                buCode: '',
                text: `Restbetrag ${p.partner}`,
                belegfeld1: p.vin || p.beleg?.invoiceNo || '',
              },
          matchedBeleg: p.beleg,
          options: [
            { gegenkonto: isSale ? '8193' : '3200', buCode: '', label: isSale ? 'Bar erhalten in Kasse bestätigen (1000 / 8193)' : 'Bar bezahlt aus Kasse bestätigen (3200 / 1000)', action: 'ACCEPT' },
            { gegenkonto: isSale ? '1400' : '1600', buCode: '', label: isSale ? 'Offener Posten (Debitor 1400)' : 'Offener Posten (Kreditor 1600)' },
            { gegenkonto: '', buCode: '', label: 'Keine Kassenbuchung (aus Export entfernen)', action: 'EXCLUDE' },
          ],
          resolved: !!res,
          resolution: res,
        });
      }
    }

    // ───────── Control checks ─────────
    let bankNet = 0;
    let kasseNet = 0;
    let transitNet = 0;
    let bankRows = 0;
    let soHaInvalid = 0;
    let outOfMonth = 0;
    const kasseByDate: Array<{ d: string; delta: number }> = [];
    for (const it of items) {
      const amt = Number(it.amount) || 0;
      const sh = String(it.sh).toUpperCase();
      if (!['S', 'H'].includes(sh) || !it.konto || !it.gegenkonto || !(amt > 0)) soHaInvalid++;
      if (it.konto === '1200') {
        bankRows++;
        bankNet += sh === 'S' ? amt : -amt;
      } else if (it.konto === '1000') {
        kasseNet += sh === 'S' ? amt : -amt;
        kasseByDate.push({ d: (it.belegdatum || '').replace(/[^0-9]/g, '').slice(-4), delta: sh === 'S' ? amt : -amt });
      }
      if (it.gegenkonto === '1360') {
        if (it.konto === '1200' && sh === 'H') transitNet += amt;
        if (it.konto === '1000' && sh === 'S') transitNet -= amt;
        if (it.konto === '1200' && sh === 'S') transitNet -= amt;
        if (it.konto === '1000' && sh === 'H') transitNet += amt;
      }
      const mm = (it.belegdatum || '').replace(/[^0-9]/g, '').slice(-2);
      if (mm && Number(mm) !== ctx.month) outOfMonth++;
    }
    // Running daily cash balance computed chronologically per calendar day
    const initialKasse = typeof ctx.kasseOpeningBalance === 'number' ? ctx.kasseOpeningBalance : 0;
    const { running, minCash, minCashDate, firstNegDate } = computeDailyKasse(items, initialKasse);
    const materializedByKey = new Map<string, MaterializedDecision>();
    for (const mat of ctx.materializedDecisions || []) {
      materializedByKey.set(mat.resolutionKey, mat);
    }

    // Check if cash went negative on any day -> review question Privateinlage (0730)?
    if (minCash < -0.05) {
      const negDayFmt = minCashDate ? `${minCashDate.slice(0, 2)}.${minCashDate.slice(2)}.` : 'Monatsanfang';
      const firstDayFmt = firstNegDate ? `${firstNegDate.slice(0, 2)}.${firstNegDate.slice(2)}.` : negDayFmt;
      const key = `NEG_CASH:${minCashDate || '0103'}`;
      const res = ctx.resolvedKeys.get(key);
      issues.push({
        id: key,
        lineKey: key,
        type: 'CASH_WITHOUT_WITHDRAWAL',
        categoryTab: 'DECISION',
        severity: 'CRITICAL',
        title: `Kasse negativ am ${negDayFmt} (${minCash.toFixed(2)} €) – Privateinlage (0730)?`,
        question: `Kassenbestand ging am ${negDayFmt} ins Minus (${minCash.toFixed(2)} €), da vor den Bankabhebungen bereits Barkäufe getätigt wurden. Privateinlage auf Konto 0730 buchen (ab ${firstDayFmt}, damit Kasse an keinem Tag negativ ist)?`,
        details: `Tiefststand: ${minCash.toFixed(2)} € am ${negDayFmt} • Buchungstag Privateinlage: ${firstDayFmt} • Anfangsbestand: ${initialKasse.toFixed(2)} €`,
        booking: {
          lineKey: key,
          date: fmtDate(firstNegDate || minCashDate || '0103'),
          amount: Math.abs(minCash),
          sh: 'S',
          konto: '1000',
          gegenkonto: '0730',
          buCode: '',
          text: `Privateinlage Gesellschafter (${negDayFmt})`,
          belegfeld1: '',
        },
        options: [
          { gegenkonto: '0730', buCode: '', label: 'Privateinlage buchen (1000 / 0730)' },
          { gegenkonto: '1890', buCode: '', label: 'Privateinlage buchen (1000 / 1890)' },
          { gegenkonto: '', buCode: '', label: 'Ohne Privateinlage fortfahren', action: 'EXCLUDE' },
        ],
        resolved: !!res,
        resolution: res,
      });
    } else {
      const matNeg = (ctx.materializedDecisions || []).find((m) => m.kind === 'NEG_CASH');
      if (matNeg) {
        const minBefore = matNeg.meta?.minCashBefore ?? -matNeg.item.amount;
        const minDayFmt = fmtDate(matNeg.meta?.minCashDate || matNeg.item.belegdatum) || '01.03.';
        issues.push({
          id: matNeg.resolutionKey,
          lineKey: matNeg.resolutionKey,
          type: 'CASH_WITHOUT_WITHDRAWAL',
          categoryTab: 'DECISION',
          severity: 'CRITICAL',
          title: `Privateinlage bestätigt (Kasse gedeckt, vorher ${minBefore.toFixed(2)} € am ${minDayFmt})`,
          question: `Privateinlage (${matNeg.item.amount.toFixed(2)} €) wird auf ${matNeg.item.konto} / ${matNeg.item.gegenkonto} am ${fmtDate(matNeg.item.belegdatum)} exportiert.`,
          details: `Gebucht am ${fmtDate(matNeg.item.belegdatum)} • Gegenkonto ${matNeg.item.gegenkonto}`,
          booking: view(matNeg.item, matNeg.resolutionKey),
          options: [
            { gegenkonto: '0730', buCode: '', label: 'Privateinlage buchen (1000 / 0730)' },
            { gegenkonto: '1890', buCode: '', label: 'Privateinlage buchen (1000 / 1890)' },
          ],
          resolved: true,
          resolution: matNeg.resolution,
        });
      }
    }

    const checks: ControlCheck[] = [];
    checks.push({
      id: 'BANK_STATEMENT',
      label: 'Kontoauszug (1200) vorhanden',
      status: ctx.hasBankStatement ? 'PASS' : 'FAIL',
      critical: true,
      value: ctx.hasBankStatement ? `${bankRows} Bankbuchungen` : 'fehlt',
      expected: 'Kontoauszug des Monats hochgeladen',
      hint: ctx.hasBankStatement ? undefined : 'Upload the bank statement (Kontoauszug) of this month first.',
    });
    if (ctx.hasBankStatement) {
      if (ctx.openingBalance !== undefined && ctx.closingBalance !== undefined) {
        const expected = round2(ctx.closingBalance - ctx.openingBalance);
        const ok = Math.abs(expected - round2(bankNet)) < 0.05;
        checks.push({
          id: 'BANK_BALANCE',
          label: 'Bank 1200 = Kontoauszug (alter → neuer Kontostand)',
          status: ok ? 'PASS' : 'FAIL',
          critical: true,
          value: `${round2(bankNet).toFixed(2)} €`,
          expected: `${expected.toFixed(2)} € (${ctx.openingBalance.toFixed(2)} → ${ctx.closingBalance.toFixed(2)})`,
          hint: ok ? undefined : 'A bank line is missing or duplicated. Re-upload the complete bank statement.',
        });
      } else {
        checks.push({
          id: 'BANK_BALANCE',
          label: 'Bank 1200 = Kontoauszug (alter → neuer Kontostand)',
          status: 'WARN',
          critical: false,
          value: `${round2(bankNet).toFixed(2)} €`,
          expected: 'Kontostand nicht lesbar',
          hint: 'Opening/closing balance could not be read from the statement — please verify manually.',
        });
      }
    }
    checks.push({
      id: 'TRANSIT_1360',
      label: 'Geldtransit 1360 = 0',
      status: Math.abs(transitNet) < 0.05 ? 'PASS' : 'FAIL',
      critical: true,
      value: `${round2(transitNet).toFixed(2)} €`,
      expected: '0,00 €',
      hint: Math.abs(transitNet) < 0.05 ? undefined : 'Every bank withdrawal needs exactly one cash deposit (and vice versa).',
    });
    checks.push({
      id: 'KASSE_PLAUSIBLE',
      label: 'Kassenbestand nie negativ',
      status: minCash > -0.05 ? 'PASS' : 'WARN',
      critical: false,
      value: `Start ${round2(initialKasse).toFixed(2)} € • min ${round2(minCash).toFixed(2)} € • Saldo ${round2(running).toFixed(2)} €`,
      expected: '≥ 0,00 € (inkl. Anfangsbestand)',
      hint: minCash > -0.05 ? undefined : 'Cash went negative — check opening cash balance or missing deposits.',
    });

    // Check unused Belege (PART A + direction-aware per-document booking verification)
    const unusedBelege: any[] = [];
    if (ctx.allClientRecords && ctx.allClientRecords.length > 0) {
      const recordById = new Map<string, any>();
      for (const r of ctx.allClientRecords) {
        if (r.id) recordById.set(r.id, r);
      }
      const isSaleBooking = (it: BookingItem) =>
        ((it.konto === '1200' || it.konto === '1000') && String(it.sh).toUpperCase() === 'S' && it.gegenkonto !== '1360' && it.gegenkonto !== '0730') ||
        it.konto === '1400' ||
        /^8\d{3}$/.test(it.gegenkonto || '');
      const isExpenseOrPurchaseBooking = (it: BookingItem) =>
        ((it.konto === '1200' || it.konto === '1000') && String(it.sh).toUpperCase() === 'H' && it.gegenkonto !== '1360') ||
        it.gegenkonto === '1600';

      const bookedSaleVins = new Set<string>();
      const bookedPurchaseVins = new Set<string>();
      const bookedSaleInvs = new Set<string>();
      const bookedPurchaseInvs = new Set<string>();
      const bookedBelegIds = new Set<string>();

      for (const it of items) {
        const saleDir = isSaleBooking(it);
        const expDir = isExpenseOrPurchaseBooking(it);
        if (it.belegfeld1) {
          const bf = it.belegfeld1.toLowerCase();
          if (saleDir) bookedSaleInvs.add(bf);
          if (expDir) bookedPurchaseInvs.add(bf);
        }
        const v = extractVinFromText(`${it.buchungstext || ''} ${it.belegfeld1 || ''}`);
        if (v) {
          if (saleDir) bookedSaleVins.add(v);
          if (expDir) bookedPurchaseVins.add(v);
        }
        if (it.matchedBeleg?.id) {
          const targetRec = recordById.get(it.matchedBeleg.id);
          const recExpectsSale = targetRec ? targetRec.type === 'QA24_SALE' : saleDir;
          const dirMatches = recExpectsSale ? saleDir : expDir;
          if (dirMatches) {
            bookedBelegIds.add(it.matchedBeleg.id);
          }
        }
      }
      for (const p of ctx.partialPayments || []) {
        if (p.beleg?.id) bookedBelegIds.add(p.beleg.id);
      }
      for (const r of ctx.allClientRecords) {
        if (r.month !== ctx.month || r.year !== ctx.year) continue;
        if (r.type === 'OTHER' && !(r.amount > 0)) continue;

        const matOpenInv = materializedByKey.get(`OPEN_INVOICE:${r.id}`);
        if (matOpenInv) {
          issues.push({
            id: matOpenInv.resolutionKey,
            lineKey: matOpenInv.resolutionKey,
            type: 'UNKNOWN_ACCOUNT',
            categoryTab: 'DECISION',
            severity: 'CRITICAL',
            title: `Offene Rechnung (Zahlung per Überweisung): ${r.partner} (${r.amount.toFixed(2)} €)`,
            question: `Offene Rechnung (Kreditor) buchen? Rechnung über ${r.amount.toFixed(2)} € (${r.source_file}, S. ${(r.pages || []).join('-') || 1}) wird als offener Posten exportiert.`,
            details: `${r.partner} • ${r.amount.toFixed(2)} €${r.vin ? ' • VIN ' + r.vin : ''} • Datei: ${r.source_file} (S. ${(r.pages || []).join(', ') || 1})`,
            booking: view(matOpenInv.item, matOpenInv.resolutionKey),
            matchedBeleg: matOpenInv.item.matchedBeleg,
            options: [
              { gegenkonto: '1600', buCode: '', label: `Offene Rechnung (Kreditor 1600 / ${r.skr03Account || '3200'}) buchen` },
              { gegenkonto: '', buCode: '', label: 'Erst bei Bankzahlung im Folgemonat buchen (nicht relevant für diesen Monat)', action: 'EXCLUDE' },
            ],
            resolved: true,
            resolution: matOpenInv.resolution,
          });
          continue;
        }

        const matUnused = materializedByKey.get(`UNUSED_BELEG:${r.id}`);
        if (matUnused) {
          issues.push({
            id: matUnused.resolutionKey,
            lineKey: matUnused.resolutionKey,
            type: 'UNKNOWN_ACCOUNT',
            categoryTab: 'MISSING_BELEG',
            severity: 'CRITICAL',
            title: `Gebuchter Kassenbeleg: ${r.partner} (${r.amount.toFixed(2)} €)`,
            question: `Hochgeladener Beleg (${r.source_file}, Seite ${(r.pages || []).join(', ') || 1}) wird im Export gebucht.`,
            details: `${r.partner} • ${r.amount.toFixed(2)} € • Datei: ${r.source_file} (S. ${(r.pages || []).join(', ') || 1})`,
            booking: view(matUnused.item, matUnused.resolutionKey),
            matchedBeleg: matUnused.item.matchedBeleg,
            options: [
              { gegenkonto: r.skr03Account || '3200', buCode: '', label: `In Kasse buchen (${r.skr03Account || '3200'})` },
              { gegenkonto: '', buCode: '', label: 'Als nicht relevant markieren', action: 'EXCLUDE' },
            ],
            resolved: true,
            resolution: matUnused.resolution,
          });
          continue;
        }

        const expectsSale = r.type === 'QA24_SALE';
        const expectedSh = expectsSale ? 'S' : 'H';
        const dirVins = expectsSale ? bookedSaleVins : bookedPurchaseVins;
        const dirInvs = expectsSale ? bookedSaleInvs : bookedPurchaseInvs;

        const isBooked =
          r.amount > 0 &&
          (bookedBelegIds.has(r.id) ||
            (r.vin && (dirVins.has(r.vin) || [...dirVins].some((bv) => areVinsFuzzyEqual(r.vin, bv, 2)))) ||
            (r.invoiceNo && dirInvs.has(r.invoiceNo.toLowerCase())) ||
            items.some(
              (it) =>
                it.konto === '1000' &&
                String(it.sh).toUpperCase() === expectedSh &&
                (!it.matchedBeleg || it.matchedBeleg.id === r.id) &&
                Math.abs(Number(it.amount) - r.amount) < 0.05
            ) ||
            ((r.type === 'RECEIPT' || r.type === 'SUPPLIER_INVOICE') &&
              items.some((it) => {
                if (it.konto !== '1200' || String(it.sh).toUpperCase() !== 'H' || Math.abs(Number(it.amount) - r.amount) > 0.05) return false;
                const bTxt = `${it.buchungstext || ''} ${it.belegfeld1 || ''}`.toLowerCase();
                const rWords = `${r.partner || ''}`.toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length >= 4);
                return rWords.some((w) => bTxt.includes(w));
              })));

        if (isBooked) continue;
        if (r.type === 'FINANZBERICHT' || r.type === 'PLATFORM_STATEMENT') continue;

        const isUeberweisung =
          r.paidBy === 'überweisung' ||
          /per\s*.{0,2}berweisung|zahlung\s*per\s*.{0,2}berweisung|zahlungsvereinbarung|zahlungsbedingungen\s*:\s*ohne\s*abzug/i.test(r.rawText);

        if (isUeberweisung) {
          const openInvKey = `OPEN_INVOICE:${r.id}`;
          const res = ctx.resolvedKeys.get(openInvKey);
          if (!res) {
            unusedBelege.push(r);
          }
          const isSale = r.type === 'QA24_SALE';
          issues.push({
            id: openInvKey,
            lineKey: openInvKey,
            type: 'UNKNOWN_ACCOUNT',
            categoryTab: 'DECISION',
            severity: 'CRITICAL',
            title: `Offene Rechnung (Zahlung per Überweisung): ${r.partner} (${r.amount.toFixed(2)} €)`,
            question: `Offene Rechnung (Kreditor) buchen? Rechnung über ${r.amount.toFixed(2)} € (${r.source_file}, S. ${(r.pages || []).join('-') || 1}) hat "Zahlung per Überweisung" und wurde in diesem Monat nicht über die Bank bezahlt (niemals Kasse).`,
            details: `${r.partner} • ${r.amount.toFixed(2)} €${r.vin ? ' • VIN ' + r.vin : ''} • Datei: ${r.source_file} (S. ${(r.pages || []).join(', ') || 1})`,
            booking: {
              lineKey: openInvKey,
              date: fmtDate(r.belegdatum || '2803'),
              amount: r.amount,
              sh: 'S',
              konto: isSale ? '1400' : r.skr03Account || '3200',
              gegenkonto: isSale ? r.skr03Account || '8193' : '1600',
              buCode: '',
              text: `${r.partner} - Offene Rechnung`,
              belegfeld1: r.vin || r.invoiceNo || '',
            },
            matchedBeleg: {
              id: r.id,
              source_file: r.source_file,
              pages: r.pages || [1],
              partner: r.partner,
              invoiceNo: r.invoiceNo,
              vin: r.vin,
              amount: r.amount,
              taxClause: r.taxClause,
              snippet: r.matchedLineSnippet,
              document_id: r.document_id,
            },
            options: [
              { gegenkonto: '1600', buCode: '', label: `Offene Rechnung (Kreditor 1600 / ${r.skr03Account || '3200'}) buchen` },
              { gegenkonto: '', buCode: '', label: 'Erst bei Bankzahlung im Folgemonat buchen (nicht relevant für diesen Monat)', action: 'EXCLUDE' },
            ],
            resolved: !!res,
            resolution: res,
          });
          continue;
        }

        const unusedKey = `UNUSED_BELEG:${r.id}`;
        if (!ctx.resolvedKeys.has(unusedKey)) {
          const isVehicleDoc = r.type === 'QA24_PURCHASE' || r.type === 'QA24_SALE' || r.type === 'CONTRACT';
          const isSaleDoc = r.type === 'QA24_SALE';
          const defaultGegenkonto = isVehicleDoc ? (isSaleDoc ? '8193' : r.skr03Account || '3200') : r.skr03Account || '4900';
          const labelPartner = r.partner || (r.vin ? `Fahrzeug ${r.vin}` : `Seite ${(r.pages || []).join('-') || 1}`);
          unusedBelege.push(r);
          issues.push({
            id: unusedKey,
            lineKey: unusedKey,
            type: 'UNKNOWN_ACCOUNT',
            categoryTab: 'MISSING_BELEG',
            severity: 'CRITICAL',
            requiresDateInput: true,
            title: `Ungebuchter Beleg: ${labelPartner} (${r.amount.toFixed(2)} €)`,
            question: isVehicleDoc
              ? `Hochgeladener Beleg (${r.source_file}, Seite ${(r.pages || []).join(', ') || 1}) wurde noch nicht gebucht. Bitte Betrag (EUR), Datum und Richtung (Ankauf 3200/1000 oder Verkauf 1000/8193) prüfen/eingeben:`
              : `Hochgeladener Ausgabenbeleg (${r.source_file}, Seite ${(r.pages || []).join(', ') || 1}) wurde noch nicht gebucht. Bitte Betrag (EUR), Datum und Aufwandskonto wählen:`,
            details: `${labelPartner} • ${r.amount.toFixed(2)} € • Datei: ${r.source_file} (S. ${(r.pages || []).join(', ') || 1})`,
            booking: {
              lineKey: unusedKey,
              date: fmtDate(r.belegdatum || '0103'),
              amount: r.amount,
              sh: isSaleDoc ? 'S' : 'H',
              konto: '1000',
              gegenkonto: defaultGegenkonto,
              buCode: r.buCode || '',
              text: `${labelPartner}`,
              belegfeld1: r.vin || r.invoiceNo || '',
            },
            matchedBeleg: {
              id: r.id,
              source_file: r.source_file,
              pages: r.pages || [1],
              partner: r.partner,
              invoiceNo: r.invoiceNo,
              vin: r.vin,
              amount: r.amount,
              taxClause: r.taxClause,
              snippet: r.matchedLineSnippet,
              document_id: r.document_id,
            },
            options: isVehicleDoc
              ? [
                  {
                    gegenkonto: '3200',
                    buCode: '',
                    label: 'Ankauf in Kasse buchen (3200 an 1000)',
                    recommended: !isSaleDoc,
                  },
                  {
                    gegenkonto: '8193',
                    buCode: '',
                    label: 'Verkauf (§25a) in Kasse buchen (1000 an 8193)',
                    recommended: isSaleDoc,
                  },
                  { gegenkonto: '', buCode: '', label: 'Als nicht relevant markieren', action: 'EXCLUDE' },
                ]
              : [
                  ...EXPENSE_OPTIONS.filter((o) => o.gegenkonto !== '3200'),
                  { gegenkonto: '', buCode: '', label: 'Als nicht relevant markieren', action: 'EXCLUDE' },
                ],
            resolved: false,
          });
        }
      }
    }

    if (running > 20000) {
      const hasUnusedKasse = unusedBelege.some((b) => /kasse/i.test(b.source_file || ''));
      checks.push({
        id: 'KASSE_SANITY',
        label: 'Kassenbestand am Monatsende',
        status: hasUnusedKasse ? 'FAIL' : 'WARN',
        critical: hasUnusedKasse,
        value: `${round2(running).toFixed(2)} €`,
        expected: '≤ 20.000,00 € (Prüfungsrisiko bei hohem Bar-Saldo)',
        hint: hasUnusedKasse
          ? 'Kassenbestand ist sehr hoch (> 20.000 €) und ungebuchte Kassenbelege existieren! Export blockiert.'
          : 'Kassenbestand ist sehr hoch (> 20.000 €). Prüfen Sie, ob Belege für Barkäufe (Fahrzeugeinkauf) noch fehlen.',
      });
    }

    const unusedNames = unusedBelege.map((u) => `${u.partner} (${Number(u.amount).toFixed(2)} €, S. ${(u.pages || []).join('-') || 1})`).join('; ');
    checks.push({
      id: 'UNUSED_BELEG',
      label: 'Alle hochgeladenen Belege gebucht / geprüft',
      status: unusedBelege.length === 0 ? 'PASS' : 'FAIL',
      critical: true,
      value: unusedBelege.length === 0 ? 'OK' : `${unusedBelege.length} ungebucht: ${unusedNames}`,
      expected: '0 ungebucht',
      hint: unusedBelege.length === 0 ? undefined : `Ungebucht: ${unusedNames}`,
    });
    checks.push({
      id: 'SOLL_HABEN',
      label: 'Alle Buchungen mit Betrag, S/H, Konto & Gegenkonto',
      status: soHaInvalid === 0 ? 'PASS' : 'FAIL',
      critical: true,
      value: soHaInvalid === 0 ? 'OK' : `${soHaInvalid} fehlerhaft`,
      expected: '0 fehlerhaft',
    });
    checks.push({
      id: 'DATES_IN_MONTH',
      label: 'Belegdatum im Buchungsmonat',
      status: outOfMonth === 0 ? 'PASS' : 'WARN',
      critical: false,
      value: outOfMonth === 0 ? 'OK' : `${outOfMonth} außerhalb`,
      expected: `alle im Monat ${String(ctx.month).padStart(2, '0')}/${ctx.year}`,
    });

    if (clientRulesService.getRules(ctx.clientId)?.business_type === 'restaurant') {
      // 1410 balance check across online sales (Finanzbericht) vs platform payouts & fees
      let bal1410 = 0;
      for (const it of items) {
        if (it.konto === '1410') {
          bal1410 += String(it.sh).toUpperCase() === 'S' ? Number(it.amount) : -Number(it.amount);
        } else if (it.gegenkonto === '1410') {
          bal1410 += String(it.sh).toUpperCase() === 'S' ? -Number(it.amount) : Number(it.amount);
        }
      }
      bal1410 = round2(bal1410);
      checks.push({
        id: 'PLATFORM_1410_BALANCE',
        label: 'Verrechnungskonto 1410 (Plattformen ≈ 0 €)',
        status: Math.abs(bal1410) <= 50 ? 'PASS' : 'WARN',
        critical: false,
        value: `${bal1410.toFixed(2)} €`,
        expected: '≈ 0,00 € (Online-Umsätze − Gebühren − Bankauszahlungen)',
      });

      const fbRecords = (ctx.allClientRecords || []).filter((r: any) => r.type === 'FINANZBERICHT' && r.finanzbericht);
      const fbBad = fbRecords.filter((r: any) => !r.finanzbericht.vatSumOk);
      if (fbRecords.length > 0) {
        checks.push({
          id: 'FINANZBERICHT_VAT_SUM',
          label: 'Finanzberichte MwSt-Summe = GESAMT',
          status: fbBad.length === 0 ? 'PASS' : 'WARN',
          critical: false,
          value: fbBad.length === 0 ? `${fbRecords.length}/${fbRecords.length} OK` : `${fbBad.length} Abweichung(en)`,
          expected: '0 Abweichungen',
        });
      }

      // Opening Kasse 01.06.2026 review question if not yet confirmed by client
      const kasseOpenKey = `KASSE_OPENING:${ctx.year}_${String(ctx.month).padStart(2, '0')}`;
      if ((ctx.kasseOpeningBalance === undefined || ctx.kasseOpeningBalance === 0) && !ctx.resolvedKeys.has(kasseOpenKey)) {
        const res = ctx.resolvedKeys.get(kasseOpenKey);
        issues.push({
          id: kasseOpenKey,
          lineKey: kasseOpenKey,
          type: 'CASH_WITHOUT_WITHDRAWAL',
          categoryTab: 'DECISION',
          severity: 'CRITICAL',
          title: `Kassen-Anfangsbestand 01.${String(ctx.month).padStart(2, '0')}.${ctx.year} fehlt`,
          question: `Wie hoch war der Kassenbestand (1000) am 01.${String(ctx.month).padStart(2, '0')}.${ctx.year}? Bitte Anfangsbestand eingeben (oder 0,00 € bestätigen):`,
          details: 'Erforderlich, damit Kasse 1000 nach Bargeldeinzahlung & Ausgaben nicht ins Minus läuft.',
          booking: {
            lineKey: kasseOpenKey,
            date: `01.${String(ctx.month).padStart(2, '0')}.`,
            amount: 0,
            sh: 'S',
            konto: '1000',
            gegenkonto: '9000',
            buCode: '',
            text: 'Kassen-Anfangsbestand',
            belegfeld1: 'EB',
          },
          options: [
            { gegenkonto: '9000', buCode: '', label: 'Anfangsbestand 0,00 € bestätigen', action: 'ACCEPT' },
          ],
          resolved: !!res,
          resolution: res,
        });
      }
    }

    if (ctx.bankReconciliation && ctx.bankReconciliation.pages?.length > 0) {
      const br = ctx.bankReconciliation;
      console.log(`[Bank Reconciliation ${ctx.year}-${String(ctx.month).padStart(2, '0')}] Opening=${br.openingBalance?.toFixed(2) ?? '?'} € | CalcClosing=${br.calculatedClosing.toFixed(2)} € | StmtClosing=${br.closingBalance?.toFixed(2) ?? '?'} € | Diff=${br.diff.toFixed(2)} € | Balanced=${br.balanced}`);
      for (const pg of br.pages) {
        console.log(`  Page ${pg.page}: ${pg.txCount} lines | PageSum=${pg.pageSum.toFixed(2)} €`);
        for (const ln of pg.lines) {
          console.log(`    ${ln.date} | ${ln.amount.toFixed(2).padStart(10)} € | ${ln.text}`);
        }
      }
    }

    // Check 4a: Same VIN booked as 3200 twice across months -> warning
    if (ctx.priorMonth3200Vins && ctx.priorMonth3200Vins.size > 0) {
      const dupVins: string[] = [];
      const seenDup = new Set<string>();
      for (const it of items) {
        const is3200 =
          (it.konto === '3200' && String(it.sh).toUpperCase() === 'S') ||
          (it.gegenkonto === '3200' && String(it.sh).toUpperCase() === 'H');
        if (!is3200) continue;
        // Skip genuine 2nd-installment payments of a prior-month partial-cash purchase where no 1600 OPOS was created
        if (/zahlung\s*2|2\.\s*teilzahlung|restzahlung/i.test(it.buchungstext || '')) continue;
        const v = extractVinFromText(`${it.buchungstext || ''} ${it.belegfeld1 || ''} ${it.matchedBeleg?.vin || ''}`);
        if (!v || seenDup.has(v)) continue;
        let priorMonths = ctx.priorMonth3200Vins.get(v);
        if (!priorMonths) {
          for (const [pv, pms] of ctx.priorMonth3200Vins.entries()) {
            if (areVinsFuzzyEqual(v, pv, 2)) {
              priorMonths = pms;
              break;
            }
          }
        }
        if (priorMonths && priorMonths.length > 0) {
          seenDup.add(v);
          dupVins.push(`${v} (Monat ${priorMonths.join(',')} & ${ctx.month})`);
        }
      }
      checks.push({
        id: 'DUPLICATE_VIN_3200',
        label: 'Keine doppelte Fahrzeugankauf-Buchung (3200) über Monate',
        status: dupVins.length === 0 ? 'PASS' : 'WARN',
        critical: false,
        value: dupVins.length === 0 ? 'OK' : `${dupVins.length} doppelt: ${dupVins.join('; ')}`,
        expected: '0 doppelte VINs auf 3200',
        hint:
          dupVins.length === 0
            ? undefined
            : `Dieselbe VIN wurde in mehreren Monaten auf 3200 gebucht: ${dupVins.join('; ')}. Prüfen Sie, ob ein offener Posten (1600) ausgeglichen werden muss.`,
      });
    }

    // Check 4b: Payment to a supplier with an open 1600 item (or customer with 1400) -> must clear 1600/1400
    if (ctx.priorOpenItems && ctx.priorOpenItems.length > 0) {
      const unClearedOpos: string[] = [];
      let clearedCount = 0;
      for (const it of items) {
        if (it.konto !== '1200' && it.konto !== '1000') continue;
        if (it.gegenkonto === '1360' || it.gegenkonto === '4970' || it.gegenkonto === '0730') continue;
        const shUp = String(it.sh).toUpperCase();
        const targetKind: '1600' | '1400' = shUp === 'H' ? '1600' : '1400';
        const itTxt = `${it.buchungstext || ''} ${it.belegfeld1 || ''} ${it.matchedBeleg?.partner || ''} ${it.matchedBeleg?.vin || ''}`;
        const itVin = extractVinFromText(itTxt) || it.matchedBeleg?.vin || undefined;
        const itAmt = Number(it.amount) || 0;
        const itWords = itTxt
          .toLowerCase()
          .split(/[^a-zäöüß]+/)
          .filter((w) => w.length >= 4 && !/^(gmbh|auto|autohaus|automotive|opel|adam|corsa|audi|tesla|model|bmw|kauf|service|inhaber|zahlung|rechnung|securego|plus|iban|entgelt)$/.test(w));

        for (const op of ctx.priorOpenItems) {
          if (op.kind !== targetKind) continue;
          const vinHit = Boolean(op.vin && itVin && (op.vin === itVin || areVinsFuzzyEqual(op.vin, itVin, 2)));
          const invHit = Boolean(op.invoiceNo && op.invoiceNo.length >= 4 && (it.belegfeld1 || '').toLowerCase() === op.invoiceNo.toLowerCase());
          const opWords = (op.partner || '')
            .toLowerCase()
            .split(/[^a-zäöüß]+/)
            .filter((w) => w.length >= 4 && !/^(gmbh|auto|autohaus|automotive|opel|adam|corsa|audi|tesla|model|bmw|kauf|service|inhaber|offene|rechnung)$/.test(w));
          const nameAmtHit = opWords.some((ow) => itWords.includes(ow)) && Math.abs(itAmt - op.amount) <= 1.0;

          if (vinHit || invHit || nameAmtHit) {
            if (it.gegenkonto === op.kind) {
              clearedCount++;
            } else {
              unClearedOpos.push(`${it.buchungstext} (${itAmt.toFixed(2)} € gebucht auf ${it.gegenkonto} statt ${op.kind})`);
            }
            break;
          }
        }
      }
      checks.push({
        id: 'OPOS_1600_CLEARING',
        label: 'Offene Posten (1600 Kreditor / 1400 Debitor) aus Vormonaten ausgeglichen',
        status: unClearedOpos.length === 0 ? 'PASS' : 'FAIL',
        critical: true,
        value: unClearedOpos.length === 0 ? `OK (${clearedCount} ausgeglichen)` : `${unClearedOpos.length} nicht über 1600/1400 gebucht`,
        expected: 'Zahlung auf offenen Posten muss 1600/1400 ausgleichen',
        hint: unClearedOpos.length === 0 ? undefined : unClearedOpos.join('; '),
      });
    }

    // Check 7: Payment amount != invoice/receipt amount -> warning, not silent
    {
      const paidByBeleg = new Map<string, { meta: NonNullable<BookingItem['matchedBeleg']>; totalPaid: number }>();
      for (const it of items) {
        if (!it.matchedBeleg?.id || !(it.matchedBeleg.amount > 0)) continue;
        if (it.konto !== '1200' && it.konto !== '1000') continue;
        const entry = paidByBeleg.get(it.matchedBeleg.id) || { meta: it.matchedBeleg, totalPaid: 0 };
        entry.totalPaid = round2(entry.totalPaid + (Number(it.amount) || 0));
        paidByBeleg.set(it.matchedBeleg.id, entry);
      }
      const mismatches: string[] = [];
      for (const { meta, totalPaid } of paidByBeleg.values()) {
        if (Math.abs(totalPaid - meta.amount) > 1.0) {
          mismatches.push(`${meta.partner} (${meta.invoiceNo || meta.vin || 'Beleg'}: Beleg ${meta.amount.toFixed(2)} € vs. bezahlt ${totalPaid.toFixed(2)} €)`);
        }
      }
      checks.push({
        id: 'AMOUNT_MISMATCH',
        label: 'Zahlungsbetrag = Rechnungsbetrag',
        status: mismatches.length === 0 ? 'PASS' : 'WARN',
        critical: false,
        value: mismatches.length === 0 ? 'OK' : `${mismatches.length} Abweichung(en)`,
        expected: 'Belegbetrag = gebuchter Zahlungsbetrag',
        hint: mismatches.length === 0 ? undefined : mismatches.join('; '),
      });
    }

    const lineIssues = issues.filter((i) => !i.id.startsWith('EXCLUDED:'));
    const openCritical = lineIssues.filter((i) => !i.resolved && i.severity === 'CRITICAL').length;
    const openWarnings = lineIssues.filter((i) => !i.resolved && i.severity === 'WARNING').length;
    const failedCritical = checks.filter((c) => c.critical && c.status === 'FAIL');

    const blockReasons: string[] = [];
    if (openCritical > 0) blockReasons.push(`${openCritical} item(s) need review`);
    for (const c of failedCritical) blockReasons.push(`${c.label}: ${c.value} (expected ${c.expected})`);

    const reviewKeys = new Set(lineIssues.filter((i) => !i.resolved).map((i) => i.lineKey));
    const resolvedLineKeys = new Set(lineIssues.filter((i) => i.resolved).map((i) => i.lineKey));
    const bookings = items.map((it) => {
      const key = ctx.lineKeys.get(it) || '';
      const status: 'AUTO' | 'REVIEW' | 'RESOLVED' = reviewKeys.has(key) ? 'REVIEW' : resolvedLineKeys.has(key) || ctx.resolvedKeys.has(key) ? 'RESOLVED' : 'AUTO';
      return { ...view(it, key), status };
    });

    const kasseSorted = items
      .filter((it) => it.konto === '1000')
      .slice()
      .sort((a, b) => {
        const da = parseInt((a.belegdatum || '0101').slice(0, 2), 10) || 1;
        const db = parseInt((b.belegdatum || '0101').slice(0, 2), 10) || 1;
        if (da !== db) return da - db;
        const sa = String(a.sh).toUpperCase() === 'S' ? 0 : 1;
        const sb = String(b.sh).toUpperCase() === 'S' ? 0 : 1;
        return sa - sb;
      });
    let kasseRun = initialKasse;
    const kasse_items = kasseSorted.map((it) => {
      const sh = (String(it.sh).toUpperCase() === 'S' ? 'S' : 'H') as 'S' | 'H';
      const amt = round2(Number(it.amount) || 0);
      kasseRun = round2(kasseRun + (sh === 'S' ? amt : -amt));
      return {
        date: fmtDate(it.belegdatum),
        sh,
        amount: amt,
        gegenkonto: it.gegenkonto || '',
        buCode: it.buCode || '',
        text: it.buchungstext || '',
        source_file: it.matchedBeleg?.source_file,
        pages: it.matchedBeleg?.pages,
        running_balance: kasseRun,
      };
    });

    const blocked = blockReasons.length > 0;

    // ───────────────────────── Monthly Accuracy Report ─────────────────────────
    const unreadableCount = lineIssues.filter((i) => Boolean(i.requiresDateInput || /unleserlich/i.test(i.title))).length;
    const belegFehltCount = lineIssues.filter(
      (i) => !(i.requiresDateInput || /unleserlich/i.test(i.title)) && i.categoryTab === 'MISSING_BELEG'
    ).length;
    const entscheidungCount = lineIssues.filter(
      (i) => !(i.requiresDateInput || /unleserlich/i.test(i.title)) && i.categoryTab !== 'MISSING_BELEG'
    ).length;

    const errorList: AccuracyErrorItem[] = [];
    for (const ex of ctx.excludedLines) {
      errorList.push({
        category: 'rule:false_positive_excluded',
        cause: 'System proposed a booking that the user excluded/undid',
        lineKey: ex.lineKey,
        date: fmtDate(ex.item.belegdatum),
        amount: round2(Number(ex.item.amount) || 0),
        text: ex.item.buchungstext || '',
        proposedAccount: ex.item.gegenkonto || '',
        finalAccount: 'EXCLUDED',
      });
    }
    for (const t of ctx.lineResolutionTargets || []) {
      const prop = t.proposed;
      if (!prop) continue;
      const accountChanged =
        t.resolution.action === 'SET_ACCOUNT' &&
        Boolean(t.resolution.gegenkonto) &&
        t.resolution.gegenkonto !== prop.gegenkonto;
      const dateChanged = Boolean(
        t.resolution.belegdatum &&
          (t.resolution.belegdatum !== prop.belegdatum ||
            prop.dateUncertain ||
            lineIssues.some((li) => li.lineKey === t.key && (li.requiresDateInput || /unleserlich/i.test(li.title))))
      );
      const isMissingIncomingAnswered =
        prop.reviewHintType === 'MISSING_BELEG_INCOMING' && t.resolution.action === 'SET_ACCOUNT';

      if (accountChanged || isMissingIncomingAnswered) {
        const isUnclassified = prop.gegenkonto === '4900';
        errorList.push({
          category: isMissingIncomingAnswered
            ? 'beleg:missing_incoming_invoice'
            : isUnclassified
            ? 'rule:unclassified_vendor'
            : 'rule:wrong_account_proposed',
          cause: isMissingIncomingAnswered
            ? `Incoming payment had no matched QA24 invoice (system ${prop.gegenkonto}, user ${t.item.gegenkonto})`
            : isUnclassified
            ? 'No vendor/keyword rule matched (provisional 4900 changed by user)'
            : `Rule proposed ${prop.konto}->${prop.gegenkonto}, user changed to ${t.item.konto}->${t.item.gegenkonto}`,
          lineKey: t.key,
          date: fmtDate(t.item.belegdatum),
          amount: round2(Number(t.item.amount) || 0),
          text: t.item.buchungstext || '',
          proposedAccount: prop.gegenkonto,
          finalAccount: t.item.gegenkonto,
          proposedDate: fmtDate(prop.belegdatum),
          finalDate: fmtDate(t.item.belegdatum),
        });
      }
      if (dateChanged) {
        errorList.push({
          category: 'extraction:unreadable_or_changed_date',
          cause: `Contract/payment date was unreadable or changed by user (${fmtDate(prop.belegdatum)} -> ${fmtDate(t.item.belegdatum)})`,
          lineKey: t.key,
          date: fmtDate(t.item.belegdatum),
          amount: round2(Number(t.item.amount) || 0),
          text: t.item.buchungstext || '',
          proposedAccount: prop.gegenkonto,
          finalAccount: t.item.gegenkonto,
          proposedDate: fmtDate(prop.belegdatum),
          finalDate: fmtDate(t.item.belegdatum),
        });
      }
    }
    for (const mat of ctx.materializedDecisions || []) {
      if (mat.kind === 'UNUSED_BELEG') {
        errorList.push({
          category: 'extraction:unbooked_beleg',
          cause: 'Uploaded Beleg was not auto-booked by Track 3 rules and had to be booked manually',
          lineKey: mat.resolutionKey,
          date: fmtDate(mat.item.belegdatum),
          amount: round2(Number(mat.item.amount) || 0),
          text: mat.item.buchungstext || '',
          proposedAccount: 'UNBOOKED',
          finalAccount: mat.item.gegenkonto,
        });
      }
    }

    const errorsByCategory: Record<string, number> = {};
    for (const err of errorList) {
      errorsByCategory[err.category] = (errorsByCategory[err.category] || 0) + 1;
    }

    // Bookings created/changed by answering a review question MUST NOT count as auto-correct
    const resolvedByQuestion = bookings.filter((b) => b.status === 'RESOLVED').length;
    const autoCorrect = bookings.filter((b) => b.status === 'AUTO').length;
    const currentAccuracyPct =
      items.length > 0 ? Math.round((autoCorrect / items.length) * 10000) / 100 : 100;
    const userChanged = errorList.length;
    const periodStr = `${ctx.year}_${String(ctx.month).padStart(2, '0')}`;

    // First-run snapshot: capture the system's raw pre-resolution proposals the VERY FIRST time this month is processed
    const accDir = path.join(STORAGE_DIR, 'accuracy');
    const safeClient = (ctx.clientId || 'user_client_1').replace(/[^a-zA-Z0-9_-]/g, '_');
    const firstRunPath = path.join(accDir, `${safeClient}_${periodStr}.first_run.json`);
    const normalizeSnapRow = (b: {
      amount: any;
      sh: any;
      konto: any;
      gegenkonto: any;
      buCode?: any;
      belegdatum: any;
      buchungstext?: any;
      belegfeld1?: any;
    }) => ({
      amount: round2(Number(b.amount) || 0),
      sh: (String(b.sh).toUpperCase() === 'S' ? 'S' : 'H') as 'S' | 'H',
      konto: String(b.konto || '1000'),
      gegenkonto: String(b.gegenkonto || '4900'),
      buCode: String(b.buCode || ''),
      belegdatum: String(b.belegdatum || '').replace(/[^0-9]/g, '').slice(-4),
      buchungstext: String(b.buchungstext || '').slice(0, 60),
      belegfeld1: String(b.belegfeld1 || '').slice(0, 36),
    });

    let firstRunProposals: Array<ReturnType<typeof normalizeSnapRow>> = [];
    try {
      if (!fs.existsSync(accDir)) fs.mkdirSync(accDir, { recursive: true });
      if (fs.existsSync(firstRunPath)) {
        const savedSnap = JSON.parse(fs.readFileSync(firstRunPath, 'utf-8'));
        if (Array.isArray(savedSnap?.proposals)) {
          firstRunProposals = savedSnap.proposals;
        }
      } else {
        const seedSource = ctx.preResolutionItems && ctx.preResolutionItems.length > 0 ? ctx.preResolutionItems : items;
        firstRunProposals = seedSource.map(normalizeSnapRow);
        fs.writeFileSync(
          firstRunPath,
          JSON.stringify(
            {
              client_id: ctx.clientId,
              year: ctx.year,
              month: ctx.month,
              period: periodStr,
              captured_at: new Date().toISOString(),
              proposals: firstRunProposals,
            },
            null,
            2
          ) + '\n',
          'utf-8'
        );
      }
    } catch (e: any) {
      console.warn('[AccuracyReport] Could not read/write first_run snapshot:', e?.message);
    }

    // Compare first-run proposals against golden file (if exists) or final exported items
    let targetCompareRows: Array<{
      amount: number;
      sh: string;
      konto: string;
      gegenkonto: string;
      buCode: string;
      belegdatum: string;
    }> = items.map((it) => ({
      amount: round2(Number(it.amount) || 0),
      sh: String(it.sh).toUpperCase(),
      konto: String(it.konto || ''),
      gegenkonto: String(it.gegenkonto || ''),
      buCode: String(it.buCode || ''),
      belegdatum: String(it.belegdatum || '').replace(/[^0-9]/g, '').slice(-4),
    }));
    const goldenFilePath = path.resolve(process.cwd(), '../testdata/golden', `${periodStr}.json`);
    if (fs.existsSync(goldenFilePath)) {
      try {
        const gData = JSON.parse(fs.readFileSync(goldenFilePath, 'utf-8'));
        if (Array.isArray(gData?.bookings) && gData.bookings.length > 0) {
          targetCompareRows = gData.bookings.map((g: any) => ({
            amount: round2(parseFloat(String(g.amount).replace(/\./g, '').replace(',', '.')) || 0),
            sh: String(g.sh).toUpperCase(),
            konto: String(g.konto || ''),
            gegenkonto: String(g.gegenkonto || ''),
            buCode: String(g.buCode || ''),
            belegdatum: String(g.datum || '').replace(/[^0-9]/g, '').slice(-4),
          }));
        }
      } catch {
        // fallback to exported items
      }
    }

    const rowKey = (r: { amount: number; sh: string; konto: string; gegenkonto: string; buCode: string; belegdatum: string }) =>
      `${r.belegdatum}|${r.sh}|${r.konto}|${r.gegenkonto}|${r.buCode || '-'}|${r.amount.toFixed(2)}`;
    const remainingFirstRun = firstRunProposals.map(rowKey);
    let firstRunCorrect = 0;
    for (const tr of targetCompareRows) {
      const k = rowKey(tr);
      const idx = remainingFirstRun.indexOf(k);
      if (idx >= 0) {
        firstRunCorrect++;
        remainingFirstRun.splice(idx, 1);
      }
    }
    const firstRunDenom = targetCompareRows.length;
    const firstRunChanged = Math.max(0, firstRunDenom - firstRunCorrect);
    const firstRunPct =
      firstRunDenom > 0 ? Math.round((firstRunCorrect / firstRunDenom) * 10000) / 100 : 100;

    const accuracy: AccuracyReport = {
      client_id: ctx.clientId,
      year: ctx.year,
      month: ctx.month,
      period: periodStr,
      generated_at: new Date().toISOString(),
      total_bookings: items.length,
      auto_correct: autoCorrect,
      auto_correct_pct: currentAccuracyPct,
      current_accuracy_pct: currentAccuracyPct,
      first_run_correct: firstRunCorrect,
      first_run_accuracy_pct: firstRunPct,
      first_run_changed: firstRunChanged,
      resolved_by_question: resolvedByQuestion,
      questions_asked: unreadableCount + belegFehltCount + entscheidungCount,
      questions_by_type: {
        beleg_fehlt: belegFehltCount,
        entscheidung: entscheidungCount,
        unreadable: unreadableCount,
      },
      user_changed: userChanged,
      goal_met: userChanged === 0 && currentAccuracyPct >= 97,
      errors_by_category: errorsByCategory,
      error_list: errorList,
    };

    try {
      if (!fs.existsSync(accDir)) fs.mkdirSync(accDir, { recursive: true });
      fs.writeFileSync(
        path.join(accDir, `${safeClient}_${periodStr}.json`),
        JSON.stringify(accuracy, null, 2) + '\n',
        'utf-8'
      );
    } catch (e: any) {
      console.warn('[AccuracyReport] Could not write accuracy file:', e?.message);
    }

    return {
      scope: ctx.scope,
      client_id: ctx.clientId,
      year: ctx.year,
      month: ctx.month,
      generated_at: new Date().toISOString(),
      total_bookings: items.length,
      auto_booked: bookings.filter((b) => b.status === 'AUTO').length,
      excluded_count: ctx.excludedLines.length,
      issues,
      open_critical: openCritical,
      open_warnings: openWarnings,
      resolved_count: issues.filter((i) => i.resolved).length,
      checks,
      blocked,
      block_reasons: blockReasons,
      totals: { bank_net: round2(bankNet), kasse_net: round2(kasseNet), transit_net: round2(transitNet), bank_rows: bankRows },
      bookings,
      kasse_items,
      accuracy,
      csv_ready: !blocked,
    };
  },

  /**
   * Post-CSV self-validator: parses the ACTUAL built EXTF CSV string and verifies every accounting invariant on it.
   */
  validateExportedCsv(
    csvContent: string,
    ctx: {
      hasBankStatement: boolean;
      openingBalance?: number;
      closingBalance?: number;
      kasseOpeningBalance?: number;
      resolvedKeys: Map<string, ReviewResolution>;
      lineResolutionTargets: LineResolutionTarget[];
      materializedDecisions: MaterializedDecision[];
      missingMaterializations?: string[];
    }
  ): ControlCheck[] {
    const parsedRows = parseDatevExtfCsv(csvContent);
    const checks: ControlCheck[] = [];
    const normDate = (d: string | undefined) => (d || '').replace(/[^0-9]/g, '').slice(-4).padStart(4, '0');

    // 1. Kasse 1000 never below 0 on any day (computed strictly from parsed CSV lines)
    const initialKasse = typeof ctx.kasseOpeningBalance === 'number' ? ctx.kasseOpeningBalance : 0;
    const kasseStats = computeDailyKasse(parsedRows, initialKasse);
    const kasseOk = kasseStats.minCash >= -0.05;
    checks.push({
      id: 'CSV_KASSE_NON_NEGATIVE',
      label: 'CSV-Prüfung: Kasse 1000 an keinem Tag < 0',
      status: kasseOk ? 'PASS' : 'FAIL',
      critical: true,
      value: `min ${kasseStats.minCash.toFixed(2)} € • Ende ${kasseStats.running.toFixed(2)} €`,
      expected: '≥ 0,00 € an jedem Tag in der CSV',
      hint: kasseOk
        ? undefined
        : `Am ${fmtDate(kasseStats.firstNegDate || kasseStats.minCashDate)} fällt Kasse 1000 in der CSV ins Minus (${kasseStats.minCash.toFixed(2)} € am ${fmtDate(kasseStats.minCashDate)}).`,
    });

    // 2. Bank 1200 closing balance matches bank statement (computed strictly from parsed CSV lines)
    if (ctx.hasBankStatement && ctx.openingBalance !== undefined && ctx.closingBalance !== undefined) {
      let csvBankNet = 0;
      for (const r of parsedRows) {
        if (r.konto === '1200') csvBankNet += r.sh === 'S' ? r.amount : -r.amount;
        else if (r.gegenkonto === '1200') csvBankNet += r.sh === 'S' ? -r.amount : r.amount;
      }
      csvBankNet = round2(csvBankNet);
      const csvClosing = round2(ctx.openingBalance + csvBankNet);
      const expectedClosing = round2(ctx.closingBalance);
      const bankOk = Math.abs(csvClosing - expectedClosing) < 0.05;
      checks.push({
        id: 'CSV_BANK_BALANCE',
        label: 'CSV-Prüfung: Bank 1200 Endbestand = Kontoauszug',
        status: bankOk ? 'PASS' : 'FAIL',
        critical: true,
        value: `${csvClosing.toFixed(2)} € (Netto ${csvBankNet.toFixed(2)} €)`,
        expected: `${expectedClosing.toFixed(2)} € (Differenz ${(expectedClosing - ctx.openingBalance).toFixed(2)} €)`,
        hint: bankOk
          ? undefined
          : `Bank 1200 in der CSV ergibt ${csvClosing.toFixed(2)} € statt Kontoauszug ${expectedClosing.toFixed(2)} €.`,
      });
    }

    // 3. Every resolved decision that creates/modifies a booking appears in the CSV
    const usedRowIndices = new Set<number>();
    const missingDecisions: string[] = [...(ctx.missingMaterializations || [])];

    const consumeMatchingCsvRow = (item: BookingItem): boolean => {
      const targetAmt = round2(Number(item.amount) || 0);
      const targetSh = String(item.sh).toUpperCase();
      const targetDate = normDate(item.belegdatum);
      for (let i = 0; i < parsedRows.length; i++) {
        if (usedRowIndices.has(i)) continue;
        const r = parsedRows[i];
        if (
          Math.abs(r.amount - targetAmt) < 0.05 &&
          r.sh === targetSh &&
          r.konto === item.konto &&
          r.gegenkonto === item.gegenkonto &&
          r.belegdatum === targetDate
        ) {
          usedRowIndices.add(i);
          return true;
        }
      }
      return false;
    };

    const materializedKeys = new Set<string>();
    for (const mat of ctx.materializedDecisions) {
      materializedKeys.add(mat.resolutionKey);
      if (!consumeMatchingCsvRow(mat.item)) {
        missingDecisions.push(
          `${mat.resolutionKey} (${mat.item.amount.toFixed(2)} € ${mat.item.konto}->${mat.item.gegenkonto} am ${fmtDate(mat.item.belegdatum)})`
        );
      }
    }

    // Also catch any synthetic decision in resolvedKeys (e.g. OPEN_INVOICE/UNUSED_BELEG/NEG_CASH) that was NOT excluded yet failed to materialize
    for (const [k, res] of ctx.resolvedKeys.entries()) {
      if (res.action === 'EXCLUDE' || materializedKeys.has(k)) continue;
      if (k.startsWith('OPEN_INVOICE:') || k.startsWith('UNUSED_BELEG:')) {
        missingDecisions.push(`${k} (nicht materialisiert)`);
      } else if (k.startsWith('NEG_CASH:') && ['0730', '1890'].includes(res.gegenkonto || '')) {
        missingDecisions.push(`${k} (Privateinlage ${res.gegenkonto} nicht in CSV)`);
      }
    }

    for (const target of ctx.lineResolutionTargets) {
      if (target.resolution.action === 'EXCLUDE') continue;
      if (!consumeMatchingCsvRow(target.item)) {
        missingDecisions.push(
          `${target.key} (${Number(target.item.amount).toFixed(2)} € ${target.item.konto}->${target.item.gegenkonto} am ${fmtDate(target.item.belegdatum)})`
        );
      }
    }

    const expectedDecisionCount =
      ctx.materializedDecisions.length +
      ctx.lineResolutionTargets.filter((t) => t.resolution.action !== 'EXCLUDE').length;
    const decisionsOk = missingDecisions.length === 0;
    checks.push({
      id: 'CSV_RESOLVED_PRESENT',
      label: 'CSV-Prüfung: Alle bestätigten Entscheidungen exportiert',
      status: decisionsOk ? 'PASS' : 'FAIL',
      critical: true,
      value: decisionsOk ? `OK (${expectedDecisionCount})` : `${missingDecisions.length} fehlen`,
      expected: '0 fehlend',
      hint: decisionsOk ? undefined : `Fehlend in CSV: ${missingDecisions.slice(0, 4).join('; ')}`,
    });

    // 4. Belegfeld 2 max 12 chars & never "KeineRechnung" (parsed from CSV column 11)
    const badBf2Rows = parsedRows.filter((r) => r.belegfeld2.length > 12 || /keinerechnung/i.test(r.belegfeld2));
    const bf2Ok = badBf2Rows.length === 0;
    checks.push({
      id: 'CSV_BELEGFELD2_VALID',
      label: 'CSV-Prüfung: Belegfeld 2 ≤ 12 Zeichen & kein "KeineRechnung"',
      status: bf2Ok ? 'PASS' : 'FAIL',
      critical: true,
      value: bf2Ok ? `OK (${parsedRows.length} Zeilen)` : `${badBf2Rows.length} fehlerhaft`,
      expected: 'alle ≤ 12 Zeichen, kein "KeineRechnung"',
      hint: bf2Ok
        ? undefined
        : `Ungültiges Belegfeld 2 in CSV: ${badBf2Rows
            .slice(0, 4)
            .map((r) => `Zeile ${r.rowNum} ("${r.belegfeld2}" bei ${r.buchungstext.slice(0, 25)})`)
            .join(', ')}`,
    });

    // 5. Geldtransit 1360 == 0 in parsed CSV
    let net1360 = 0;
    for (const r of parsedRows) {
      if (r.konto === '1360') net1360 += r.sh === 'S' ? r.amount : -r.amount;
      else if (r.gegenkonto === '1360') net1360 += r.sh === 'S' ? -r.amount : r.amount;
    }
    net1360 = round2(net1360);
    const transit1360Ok = Math.abs(net1360) < 0.05;
    checks.push({
      id: 'CSV_TRANSIT_1360',
      label: 'CSV-Prüfung: Geldtransit 1360 = 0,00 €',
      status: transit1360Ok ? 'PASS' : 'FAIL',
      critical: true,
      value: `${net1360.toFixed(2)} €`,
      expected: '0,00 €',
      hint: transit1360Ok ? undefined : `Geldtransit 1360 in der CSV ist nicht ausgeglichen (${net1360.toFixed(2)} €).`,
    });

    // 6. Field length limits: Buchungstext <= 60 chars, valid 4-digit/5-digit accounts
    const badTextRows = parsedRows.filter((r) => r.buchungstext.length > 60);
    checks.push({
      id: 'CSV_TEXT_LENGTH',
      label: 'CSV-Prüfung: Buchungstext ≤ 60 Zeichen',
      status: badTextRows.length === 0 ? 'PASS' : 'FAIL',
      critical: true,
      value: badTextRows.length === 0 ? `OK (${parsedRows.length} Zeilen)` : `${badTextRows.length} zu lang`,
      expected: 'alle ≤ 60 Zeichen',
    });

    const badAccountRows = parsedRows.filter(
      (r) => !/^\d{4,5}$/.test(r.konto) || !/^\d{4,5}$/.test(r.gegenkonto)
    );
    checks.push({
      id: 'CSV_SACHKONTEN_VALID',
      label: 'CSV-Prüfung: Alle Konten gültige SKR03/Personenkonten',
      status: badAccountRows.length === 0 ? 'PASS' : 'FAIL',
      critical: true,
      value: badAccountRows.length === 0 ? 'OK' : `${badAccountRows.length} ungültig`,
      expected: 'alle gültige 4-/5-stellige Konten',
    });

    return checks;
  },
};
