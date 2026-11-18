import fs from 'fs';
import path from 'path';
import { BookingItem } from '../types/document.js';
import { ollamaClient } from './ollamaClient.js';
import { clientRulesService } from './clientRulesService.js';
import { extractVinFromText } from './belegIndexService.js';

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
  | 'REFUND_UNCLEAR'
  | 'UNKNOWN_ACCOUNT'
  | 'CASH_WITHOUT_WITHDRAWAL'
  | 'LARGE_CASH'
  | 'PLACEHOLDER_TEXT'
  | 'INVALID_AMOUNT';

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
  csv_ready: boolean;
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

/** Standard SKR03 answer options for an unknown expense / income line */
const EXPENSE_OPTIONS: ReviewOption[] = [
  { gegenkonto: '4530', buCode: '9', label: '4530 Laufende Kfz-Betriebskosten / Tanken (19%)' },
  { gegenkonto: '4540', buCode: '9', label: '4540 Kfz-Reparaturen / Teile / TÜV (19%)' },
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
   * Returns kept items + excluded lines + map of resolved keys.
   */
  applyResolutions(
    scope: string,
    items: BookingItem[],
    lineKeys: Map<BookingItem, string>
  ): {
    kept: BookingItem[];
    excluded: Array<{ item: BookingItem; lineKey: string; resolution: ReviewResolution }>;
    resolvedKeys: Map<string, ReviewResolution>;
  } {
    const saved = this.getResolutions(scope);
    const resolvedKeys = new Map<string, ReviewResolution>();
    const excluded: Array<{ item: BookingItem; lineKey: string; resolution: ReviewResolution }> = [];
    const kept: BookingItem[] = [];
    for (const it of items) {
      const key = lineKeys.get(it) || '';
      const res = saved[key];
      if (!res) {
        kept.push(it);
        continue;
      }
      resolvedKeys.set(key, res);
      if (res.action === 'EXCLUDE') {
        excluded.push({ item: it, lineKey: key, resolution: res });
        continue;
      }
      if (res.action === 'SET_ACCOUNT' && res.gegenkonto) {
        it.gegenkonto = res.gegenkonto;
        it.buCode = res.buCode || '';
      }
      kept.push(it);
    }
    return { kept, excluded, resolvedKeys };
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
      if (rule) {
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
        const gKey = it.carGroupKey || vin || this.payeeKey(it.buchungstext || '') || key;
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

      // 5) Large cash transaction (> 5,000 €) needs evidence confirmation
      if (!flagged && isCash && it.gegenkonto !== '1360' && amt > 5000) {
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
    // Running cash balance (day/month sort DDMM -> MMDD)
    kasseByDate.sort((a, b) => (a.d.slice(2) + a.d.slice(0, 2)).localeCompare(b.d.slice(2) + b.d.slice(0, 2)));
    const initialKasse = typeof ctx.kasseOpeningBalance === 'number' ? ctx.kasseOpeningBalance : 0;
    let running = initialKasse;
    let minCash = initialKasse;
    for (const k of kasseByDate) {
      running += k.delta;
      if (running < minCash) minCash = running;
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
    if (kasseNet > 20000) {
      checks.push({
        id: 'KASSE_SANITY',
        label: 'Kassenbestand am Monatsende',
        status: 'WARN',
        critical: false,
        value: `${round2(kasseNet).toFixed(2)} €`,
        expected: '≤ 20.000,00 € (Prüfungsrisiko bei hohem Bar-Saldo)',
        hint: 'Kassenbestand ist sehr hoch (> 20.000 €). Prüfen Sie, ob Belege für Barkäufe (Fahrzeugeinkauf) noch fehlen.',
      });
    }
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

    const blocked = blockReasons.length > 0;
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
      csv_ready: !blocked,
    };
  },
};
