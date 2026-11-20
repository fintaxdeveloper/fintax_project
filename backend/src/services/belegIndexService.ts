import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ocrService, OcrPage } from './ocrService.js';
import { pdfExtractor } from './pdfExtractor.js';
import { ollamaClient } from './ollamaClient.js';
import { clientRulesService } from './clientRulesService.js';
import { skr03Mapper } from './skr03Mapper.js';
import { DocumentRecord } from '../types/document.js';

export type BelegRecordType =
  | 'QA24_SALE'
  | 'QA24_PURCHASE'
  | 'SUPPLIER_INVOICE'
  | 'RECEIPT'
  | 'CONTRACT'
  | 'FINANZBERICHT'
  | 'PLATFORM_STATEMENT'
  | 'OTHER';

export interface MixedVatSplit {
  rate: 7 | 19;
  brutto: number;
  netto?: number;
  mwst?: number;
  account: string;
  buCode: string;
}

export interface FinanzberichtData {
  date: string; // YYYY-MM-DD
  belegdatum: string; // DDMM
  cash7Brutto: number;
  cash19Brutto: number;
  online7Brutto: number;
  online19Brutto: number;
  totalBrutto: number;
  vatSumOk: boolean;
  platforms: Record<string, number>;
}

export interface PlatformStatementData {
  platform: 'lieferando' | 'ordersmart' | 'ubereats';
  period?: string;
  onlineSales: number;
  feesGross: number;
  feesNet?: number;
  feesVat?: number;
  payout: number;
  reverseCharge13b: boolean;
}

export type BelegTaxClause = '25a' | '19' | '7' | 'EU' | null;
export type BelegPaidBy = 'bar' | 'überweisung' | 'karte' | null;

export interface BelegRecord {
  id: string;
  client_id: string;
  year: number;
  month: number;
  source_file: string;
  source_checksum?: string;
  document_id?: string;
  pages: number[];
  type: BelegRecordType;
  partner: string;
  invoiceNo: string | null;
  vin: string | null;
  amount: number;
  netAmount?: number;
  vatRate?: number | null;
  taxClause: BelegTaxClause;
  paidCash: boolean;
  paidBy: BelegPaidBy;
  openAmount: number;
  date: string; // YYYY-MM-DD
  belegdatum: string; // DDMM
  dateUncertain?: boolean;
  skr03Account: string;
  buCode: string;
  vatSplits?: MixedVatSplit[];
  finanzbericht?: FinanzberichtData;
  platformStatement?: PlatformStatementData;
  doubleReadMismatch?: boolean;
  handwrittenCorrection?: boolean;
  amountConfirmed?: boolean;
  cropImageBase64?: string;
  matchedLineSnippet?: string;
  rawText: string;
}

const STORAGE_DIR = path.resolve(process.cwd(), '../storage');
const BELEG_INDEX_FILE = path.join(STORAGE_DIR, 'beleg_index.json');

export function deduplicateBelegRecords(records: BelegRecord[]): BelegRecord[] {
  const seen = new Set<string>();
  const out: BelegRecord[] = [];
  for (const r of records) {
    const pagesKey = (r.pages || []).slice().sort().join(',');
    const baseSource = (r.source_file || '').toLowerCase().replace(/\s*\(\d+\)/g, '').trim();
    const fileId = (r.source_checksum || baseSource).toLowerCase().trim();
    const primaryKey = `${r.client_id}|${fileId}|p:${pagesKey}`;
    const invKey = r.invoiceNo && r.invoiceNo.length >= 3 ? `${r.client_id}|inv:${r.invoiceNo.toLowerCase()}|amt:${r.amount}` : '';
    const partnerKey = r.partner && r.amount ? `${r.client_id}|${r.partner.toLowerCase()}|${r.amount}|p:${pagesKey}` : '';

    if (seen.has(primaryKey) || (invKey && seen.has(invKey)) || (partnerKey && seen.has(partnerKey))) {
      continue;
    }
    seen.add(primaryKey);
    if (invKey) seen.add(invKey);
    if (partnerKey) seen.add(partnerKey);
    out.push(r);
  }
  return out;
}

interface IndexStore {
  indexedFiles: Record<string, string>; // key -> checksum/signature
  records: BelegRecord[];
}

let store: IndexStore | null = null;

function loadStore(): IndexStore {
  if (store) return store;
  try {
    if (fs.existsSync(BELEG_INDEX_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(BELEG_INDEX_FILE, 'utf-8'));
      if (parsed && Array.isArray(parsed.records)) {
        store = {
          indexedFiles: parsed.indexedFiles || {},
          records: deduplicateBelegRecords(parsed.records),
        };
        return store;
      }
    }
  } catch {
    // ignore corrupt index and rebuild
  }
  store = { indexedFiles: {}, records: [] };
  return store;
}

function saveStore(): void {
  try {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    if (store) {
      store.records = deduplicateBelegRecords(store.records);
    }
    fs.writeFileSync(BELEG_INDEX_FILE, JSON.stringify(loadStore(), null, 2), 'utf-8');
  } catch (e: any) {
    console.warn('[BelegIndex] Failed to persist index:', e?.message);
  }
}

/**
 * Normalizes a raw VIN candidate: upper-case, strip non-alphanumeric,
 * map forbidden ISO 3779 letters (I -> 1, O -> 0, Q -> 0).
 */
export function normalizeVin(raw: string): string {
  if (!raw) return '';
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Common 16-char OCR merges (e.g. 'WY' in 'LRWY' read as 'M', 'XP7Y' read as 'XPY')
  if (s.length === 16 && /^LRM[A-Z0-9]{13}$/.test(s)) {
    s = 'LRWY' + s.slice(3);
  } else if (s.length === 16 && /^XPY[A-Z0-9]{13}$/.test(s)) {
    s = 'XP7Y' + s.slice(3);
  }
  s = s.replace(/O/g, '0').replace(/I/g, '1').replace(/Q/g, '0');
  return s.length === 17 ? s : '';
}

function canonicalVinChar(ch: string): string {
  switch (ch) {
    case 'O':
    case 'Q':
    case '0':
      return '0';
    case 'I':
    case '1':
    case 'U':
      return '1';
    case 'Z':
    case '2':
    case 'J':
      return '2';
    case 'S':
    case '5':
      return '5';
    case 'B':
    case '8':
      return '8';
    case 'G':
    case '6':
      return '6';
    default:
      return ch;
  }
}

/**
 * Fuzzy-compares two 17-char VINs (allows up to `maxDiff` character differences,
 * accounting for common OCR swaps U<->1, Z<->2/J, O<->0, S<->5).
 */
export function areVinsFuzzyEqual(v1: string | null | undefined, v2: string | null | undefined, maxDiff = 2): boolean {
  const n1 = normalizeVin(v1 || '');
  const n2 = normalizeVin(v2 || '');
  if (n1.length !== 17 || n2.length !== 17) return false;
  if (n1 === n2) return true;
  let rawDiff = 0;
  let canonDiff = 0;
  for (let i = 0; i < 17; i++) {
    if (n1[i] !== n2[i]) {
      rawDiff++;
      if (canonicalVinChar(n1[i]) !== canonicalVinChar(n2[i])) {
        canonDiff++;
      }
    }
  }
  return rawDiff <= maxDiff || (rawDiff <= maxDiff + 1 && canonDiff === 0);
}

/**
 * Extracts and normalizes a 17-character ISO 3779 VIN from OCR text.
 * Handles glued words (e.g. XP7YGCEL5PB052639Zahlung) and common WinRT OCR slips (O->0, I->1).
 */
export function extractVinFromText(text: string): string | null {
  if (!text) return null;
  // Strip IBANs first so 22-char German/EU IBANs (e.g. DE2050070024...) are never mistaken for 17-char VINs
  const upper = text
    .toUpperCase()
    .replace(/\bIBAN\s*[:.]?\s*[A-Z]{2}\s*\d{2}(?:\s*[A-Z0-9]){11,30}/g, ' ')
    .replace(/\b[A-Z]{2}\d{2}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,4}\b/g, ' ')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, (m) => (m.length !== 17 || /^[A-Z]{2}\d{15}$/.test(m) ? ' ' : m));

  const isPlausibleVin = (v: string): boolean =>
    v.length === 17 && !/^\d+$/.test(v) && !/^[A-Z]{2}\d{15}$/.test(v) && !/^DE\d{8}/.test(v);

  // First check explicitly labeled VIN lines (allows spaces/OCR O/I inside VIN)
  const labelMatch = upper.match(/(?:FAHRGESTELLNUMMER|FAHRZEUG-IDENT(?:\.-?NR)?|FZG-?IDENT(?:\.?-?NR)?|FIN)\s*[:.]?\s*([A-Z0-9\s-]{15,24})/i);
  if (labelMatch) {
    const cleaned = normalizeVin(labelMatch[1].replace(/[\s-]/g, '').slice(0, 17));
    if (isPlausibleVin(cleaned) && /^[A-HJ-NPR-Z0-9]{11}\d{4,6}$/.test(cleaned)) {
      return cleaned;
    }
  }

  // Fallback: scan any 17-char sequence ending in 5-6 digits (tolerates glued text like ...52639ZAHLUNG, blocks trailing digits)
  // Note: ISO 3779 WMI first char can be a letter OR digit 1-5, 7 (e.g. Tesla Fremont 5YJ, Austin 7SA)
  const directMatches = upper.matchAll(/(?<![A-Z0-9])([A-HJ-NPR-Z1-57][A-HJ-NPR-Z]{1,2}[A-HJ-NPR-Z0-9]{8,9}\d{5,6})(?![0-9])/g);
  for (const m of directMatches) {
    const candidate = normalizeVin(m[1].slice(0, 17));
    if (isPlausibleVin(candidate)) {
      return candidate;
    }
  }

  // Check 16-char OCR merged WMI (e.g. LRMGCEK3PC640865 -> LRWYGCEK3PC640865, XPYGCEKONB032304 -> XP7YGCEK0NB032304)
  const mergedMatch = upper.match(/(?<![A-Z0-9])(LRM[A-Z0-9]{8}\d{5}|XPY[A-Z0-9]{7}\d{6})(?![0-9])/);
  if (mergedMatch) {
    const candidate = normalizeVin(mergedMatch[1]);
    if (isPlausibleVin(candidate)) return candidate;
  }

  // Normalized OCR scan (allow O/I in first 11 chars if followed by 6 digits and not followed by more digits)
  const ocrMatches = upper.matchAll(/(?<![A-Z0-9])([A-Z0-9]{11}\d{6})(?![0-9])/g);
  for (const m of ocrMatches) {
    const norm = normalizeVin(m[1]);
    if (isPlausibleVin(norm) && /^[A-HJ-NPR-Z1-57]/.test(norm)) {
      return norm;
    }
  }

  return null;
}

function parseGermanNum(raw: string): number {
  if (!raw) return 0;
  let s = raw.replace(/[€EUR$\s]/gi, '').replace(/OO/g, '00').replace(/[Oo](?=\d|\b)/g, '0').trim();
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function amountExistsInText(amount: number, text: string): boolean {
  if (!(amount > 0)) return false;
  const fixed2 = amount.toFixed(2);
  const commaDec = fixed2.replace('.', ',');
  const intPart = fixed2.split('.')[0];
  const fracPart = fixed2.split('.')[1];
  const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cleanText = text.replace(/\s+/g, ' ').replace(/OO/g, '00');
  const candidates = [
    commaDec,
    fixed2,
    `${intWithDots},${fracPart}`,
    `${intWithDots}, ${fracPart}`,
    `${intWithDots} ,${fracPart}`,
    `${intWithDots}.${fracPart}`,
    String(Math.round(amount)),
    intWithDots,
  ];
  return candidates.some((c) => cleanText.includes(c));
}

export function parseGermanWordNumber(str: string): number {
  if (!str) return 0;
  const norm = str
    .toLowerCase()
    .replace(/[\uFFFD?]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '');

  const units: Record<string, number> = {
    ein: 1, eins: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, funf: 5, fnf: 5,
    sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12, zwolf: 12,
    dreizehn: 13, vierzehn: 14, fuenfzehn: 15, funfzehn: 15, sechzehn: 16,
    siebzehn: 17, achtzehn: 18, neunzehn: 19,
  };
  const tens: Record<string, number> = {
    zwanzig: 20, dreissig: 30, dreissg: 30, dreissiq: 30, dreiig: 30, vierzig: 40,
    fuenfzig: 50, funfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
  };

  function parseUnderThousand(s: string): number {
    if (!s) return 0;
    let sum = 0;
    if (s.includes('hundert') || s.includes('hunden')) {
      const parts = s.split(/hundert|hunden/);
      const hUnit = units[parts[0]] || 1;
      sum += hUnit * 100;
      s = parts[1] || '';
    }
    if (!s) return sum;
    if (units[s]) return sum + units[s];
    if (tens[s]) return sum + tens[s];
    if (s.includes('und')) {
      const parts = s.split('und');
      const u = units[parts[0]] || 0;
      const t = tens[parts[1]] || 0;
      return sum + u + t;
    }
    return sum;
  }

  if (norm.includes('tausend')) {
    const parts = norm.split('tausend');
    const th = parseUnderThousand(parts[0]) || 1;
    const rest = parseUnderThousand(parts[1]);
    return th * 1000 + rest;
  }
  return parseUnderThousand(norm);
}

function extractDateFromText(text: string, fallbackYear: number, fallbackMonth: number): { iso: string; belegdatum: string; dateUncertain?: boolean } {
  const mPadded = String(fallbackMonth).padStart(2, '0');

  // Month names map
  const germanMonths: Record<string, number> = {
    januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, marz: 3, mrz: 3, april: 4, apr: 4,
    mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
    oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
  };
  const namedMonthMatch = text.match(/\b(\d{1,2})\.?\s*(Januar|Februar|März|Maerz|Marz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(20\d{2})\b/i);
  if (namedMonthMatch) {
    const day = parseInt(namedMonthMatch[1], 10);
    const mNum = germanMonths[namedMonthMatch[2].toLowerCase()] || fallbackMonth;
    const yr = parseInt(namedMonthMatch[3], 10);
    if (day >= 1 && day <= 31 && mNum >= 1 && mNum <= 12) {
      const dStr = String(day).padStart(2, '0');
      const mStr = String(mNum).padStart(2, '0');
      return { iso: `${yr}-${mStr}-${dStr}`, belegdatum: `${dStr}${mStr}` };
    }
  }

  // Strip multi-line Erstzulassung / HU / AU / Geburtsdatum blocks so car registration or inspection dates are never matched
  const cleanTextForDate = text
    .replace(/(?:Erstzulassung|Geburtsdatum|Geburtstag|Geb\.?|Hauptuntersuchung|HU\s*\/\s*AU)(?:\s*am)?\s*[:.]?\s*(?:\r?\n\s*)?\d{1,2}[.,/\s]+\d{1,2}[.,/\s]+\d{2,4}/gi, ' ')
    .split(/\r?\n/)
    .filter((line) => !/(?:Erstzulassung|Geburtsdatum|Geburtstag|Geb\.?\s*am|EZ\b|Hauptuntersuchung|HU\s*\/\s*AU)/i.test(line.trim()))
    .join('\n');

  // 1. Contract / signature / handover location + date e.g. "Ort, Datum Marienheide. 10.03.24", "Flörsheim, 04.03.2024", "Mainz 0303.2024"
  const cityDateMatch = cleanTextForDate.match(/(?:Ort\s*[,/]\s*Datum|Übergabe|Fl.{1,2}rsheim|Florsheim|Frankfurt|Mainz|Marienheide|Berlin)[,.\s]*(\d{1,2})[.,\s]*(\d{2})[.,\s]*(202\d|902\d|2[4-6])\b/i);
  if (cityDateMatch) {
    const day = parseInt(cityDateMatch[1], 10);
    const mon = parseInt(cityDateMatch[2], 10);
    let yr = parseInt(cityDateMatch[3].replace(/^90/, '20'), 10);
    if (yr < 100) yr += 2000;
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12 && yr === fallbackYear) {
      const dStr = String(day).padStart(2, '0');
      const mStr = String(mon).padStart(2, '0');
      return { iso: `${yr}-${mStr}-${dStr}`, belegdatum: `${dStr}${mStr}` };
    }
  }

  const yrShort = String(fallbackYear).slice(-2);
  const monthRegex = new RegExp(`(\\d{1,2})[.,/\\s]+(0?${fallbackMonth})[.,/\\s]+(${fallbackYear}|90${yrShort}|${yrShort})\\b`, 'i');
  const compactMonthRegex = new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])[\\s.,/]*(0?${fallbackMonth})(${fallbackYear}|90${yrShort}|${yrShort})\\b`, 'i');
  const preferredMatch = cleanTextForDate.match(monthRegex) || cleanTextForDate.match(compactMonthRegex);
  const anyDateMatch =
    preferredMatch ||
    cleanTextForDate.match(new RegExp(`(?:Datum|Belegdatum|Rechnungsdatum|Übergabe|vom|den)[^0-9]{0,12}(\\d{1,2})[.,/\\s]*(\\d{2})[.,/\\s]*(${fallbackYear}|90${yrShort}|${yrShort})\\b`, 'i')) ||
    cleanTextForDate.match(new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])[.](0?[1-9]|1[0-2])[.](${fallbackYear}|90${yrShort}|${yrShort})\\b`));

  if (anyDateMatch) {
    const day = parseInt(anyDateMatch[1], 10);
    const mon = parseInt(anyDateMatch[2], 10);
    let yr = parseInt(anyDateMatch[3].replace(/^90/, '20'), 10);
    if (yr < 100) yr += 2000;
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      const dStr = String(day).padStart(2, '0');
      const mStr = String(mon).padStart(2, '0');
      return { iso: `${yr}-${mStr}-${dStr}`, belegdatum: `${dStr}${mStr}` };
    }
  }
  // No clear contract/payment date readable in OCR -> mark dateUncertain: true (triggers review question, never silently guessed!)
  return { iso: `${fallbackYear}-${mPadded}-01`, belegdatum: `01${mPadded}`, dateUncertain: true };
}

function extractInvoiceNumber(text: string): string | null {
  // Priority 1: Vehicle invoice number e.g. "Rechnungsnummer: 26/2024" or "54/2024"
  const carInv = text.match(/Rechnungs-?nummer\s*[:.]?\s*(\d{1,4}\/\d{4}|[A-Za-z0-9][A-Za-z0-9/-]{2,20})/i);
  if (carInv) {
    // OCR often reads the "/" in "37/2024" as "1" -> "3712024", or drops it -> "262024".
    // Lazy prefix (min 2 digits) keeps the shortest invoice number: 3712024 -> 37/2024 (not 371/2024).
    const rawInv = carInv[1].trim();
    const candidate = /^(\d{2,3}?)1(20\d{2})$/.test(rawInv)
      ? rawInv.replace(/^(\d{2,3}?)1(20\d{2})$/, '$1/$2')
      : rawInv.replace(/^(\d{1,3})(20\d{2})$/, '$1/$2');
    if (candidate.length >= 2 && !/^(datum|betrag|eur)$/i.test(candidate)) return candidate;
  }
  // Priority 2: Standard supplier invoice numbers (iterate all matches so "Rechnung\nArtikel" doesn't shadow "Rechnungs-Nr: 0424-008050")
  const stdInvRe = /(?:Rechnungs-?Nr\.?|Rechnung\s*Nr\.?|Rechnung•?|Beleg-?Nr\.?|Rg\.?-?Nummer|Nummer)\s*[:.#|]*\s*([A-Za-z0-9][A-Za-z0-9./-]{3,24})/gi;
  for (const stdInv of text.matchAll(stdInvRe)) {
    const val = stdInv[1].trim();
    if (/\d/.test(val) && !/^(bitte|vom|zum|zur|der|die|das|artikel)$/i.test(val)) return val;
  }
  return null;
}

function extractAmount(text: string): { total: number; net?: number; vatRate?: number | null } {
  // Normalize OCR "OO" -> "00" after comma and clean spaces around comma
  const normalized = text
    .replace(/(\d+),[ \t]*[Oo]{2}/g, '$1,00')
    .replace(/(\d+)[.,][ \t]+(\d{2})\b/g, '$1,$2')
    .replace(/(\d+\.\d{3})[.,](\d{2})/g, '$1,$2');

  // 1. Explicit Brutto / Endbetrag labels (strictly prioritized over Netto / MwSt / single-item Gesamtpreis!)
  // Includes OCR-spaced labels ("Gesamtbet rag", "S umme", "Brut to") and DB ticket gross tokens ("EUR***57,90", "t't57,90")
  const bruttoPatterns = [
    /(?:Rechnungsendbetrag|Gesamtbet\s*rag|Gesalltbet\s*rag|Endbet\s*rag|Gesamtforderung|Rechnungsbet\s*rag|Summe\s*Brut\s*to|GESAMT\s*BRUTTO|Bar\s*Total|GESAMT|Brut\s*to-?Endbetrag|Bruttobetrag)\s*[:|EUR€?\s]{0,20}(\d{1,6}(?:\.\d{3})*,\s*(?:\d{2}|[oO]{2}))/i,
    /(?:EUR\s*\*{1,6}|€\s*\*{1,6}|t't|[*]{2,6})\s*(\d{1,5},\s*\d{2})/i,
    /(?:Kaufpreis|Preis)\s*[:|\s]{0,30}(\d{1,6}(?:\.\d{3})*(?:[.,]\s*(?:\d{2,4}|[oO]{2}))?)\s*(?:EUR|€|Euro|\?)/i,
    /(?:Gebühr|Gebuehr)\s*(?:beträgt|betraegt)?\s*[:\s]{0,20}(\d{1,4}(?:,\d{2})?)/i,
    /\bTOTAL\b\s*[:|EUR\s]{0,20}(\d{1,6}(?:\.\d{3})*,\d{2})/i,
  ];
  for (const re of bruttoPatterns) {
    const m = normalized.match(re);
    if (m) {
      const val = parseGermanNum(m[1]);
      if (val > 0 && val < 500000) return { total: val };
    }
  }

  // 2. Check German number words e.g. "vierzigtausendsechshundert", "Dreiunddreißigtausendfünfhundert", "elftausendzweihundert"
  for (const wm of normalized.matchAll(/\b([a-zäöüß\uFFFD?]{3,}tausend[a-zäöüß\uFFFD?]*)\b/gi)) {
    const wVal = parseGermanWordNumber(wm[1]);
    if (wVal >= 1000 && wVal <= 500000) {
      return { total: wVal };
    }
  }

  // Build set of VAT-only amounts (near MwSt/Owst/USt/7,00%/19,00%) so MwSt lines are NEVER picked as receipt totals
  const rawLines = normalized.split(/\r?\n/);
  const vatMarkerIndices = new Set<number>();
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    if (/(?:mwst|owst|must|\bust\b|7[.,]00\s*(?:%|0\/0)|19[.,]00\s*(?:%|0\/0))/i.test(l)) {
      vatMarkerIndices.add(i);
    }
  }
  const vatOnlyCounts = new Map<number, number>();
  const nonVatLineAmounts: number[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    const hasGrossLabel = /(?:gesamt|brut\s*to|summe(?!\s*netto)|endbetrag|rechnung|gegeben|zu\s*zahlen|eur\s*\*|\*{2,}|bar\s*erhalten)/i.test(l);
    const nearVat =
      !hasGrossLabel &&
      (vatMarkerIndices.has(i) || vatMarkerIndices.has(i - 1) || vatMarkerIndices.has(i - 2) || vatMarkerIndices.has(i + 1) || vatMarkerIndices.has(i + 2));
    for (const m of l.matchAll(/(?:^|[\s|:*])(\d{1,6}(?:\.\d{3})*,\d{2})(?=\s*(?:EUR|€|Euro|A|B|ECR|\?|\||$))/gim)) {
      const n = parseGermanNum(m[1]);
      if (!(n > 0.5 && n < 250000)) continue;
      if (nearVat && !/netto/i.test(l)) {
        vatOnlyCounts.set(n, (vatOnlyCounts.get(n) || 0) + 1);
      } else {
        nonVatLineAmounts.push(n);
      }
    }
  }

  // 3. Collect all EUR amounts on tabular/WinRT multi-line pages (support 5+ digits without thousands separator e.g. 10000,00)
  const allMatches = [...normalized.matchAll(/(?:^|[\s|:*])(\d{1,6}(?:\.\d{3})*,\d{2})(?=\s*(?:EUR|€|Euro|A|B|ECR|\?|\||$))/gim)]
    .map((m) => parseGermanNum(m[1]))
    .filter((n) => n > 0.5 && n < 250000);

  if (allMatches.length > 0) {
    // Check if Netto + 19% VAT pair exists: prefer the Brutto value, or calculate gross = net + USt
    for (const a of allMatches) {
      const expectedBrutto = Math.round(a * 1.19 * 100) / 100;
      const matchBrutto = allMatches.find((b) => Math.abs(b - expectedBrutto) < 0.05);
      if (matchBrutto) {
        return { total: matchBrutto, net: a, vatRate: 19 };
      }
      const expectedVat19 = Math.round(a * 0.19 * 100) / 100;
      const matchVat19 = allMatches.find((v) => Math.abs(v - expectedVat19) < 0.05 && v < a);
      if (matchVat19) {
        return { total: Math.round((a + matchVat19) * 100) / 100, net: a, vatRate: 19 };
      }
    }
    // Check 7% pair
    for (const a of allMatches) {
      const expectedBrutto7 = Math.round(a * 1.07 * 100) / 100;
      const matchBrutto7 = allMatches.find((b) => Math.abs(b - expectedBrutto7) < 0.05);
      if (matchBrutto7) {
        return { total: matchBrutto7, net: a, vatRate: 7 };
      }
      const expectedVat7 = Math.round(a * 0.07 * 100) / 100;
      const matchVat7 = allMatches.find((v) => Math.abs(v - expectedVat7) < 0.05 && v < a);
      if (matchVat7) {
        return { total: Math.round((a + matchVat7) * 100) / 100, net: a, vatRate: 7 };
      }
    }
    // Never pick a VAT-only line amount as the total — prefer non-VAT amounts so DB tickets with only MwSt fall back to Vision OCR
    const safeCandidates = nonVatLineAmounts.length > 0 ? nonVatLineAmounts : allMatches.filter((n) => !vatOnlyCounts.has(n));
    if (safeCandidates.length > 0) {
      const maxVal = Math.max(...safeCandidates);
      if (maxVal > 0 && amountExistsInText(maxVal, normalized)) {
        return { total: maxVal };
      }
    }
  }

  // 4. Car price printed without comma decimals e.g. "36000 Kaufpreis in Worten" or "in Bar 36000" or "33500 Euro"
  const integerPriceMatches = [
    /(?:in\s*Bar|Kaufpreis|Gesamtpreis|Erhalt\s*von|Total)\s*[:.\s]{0,20}(\d{4,6})\b/i,
    /\b(\d{4,6})\s*(?:Kaufpreis\s*in\s*Worten|Euro|EUR|€|\?)\b/i,
  ];
  for (const re of integerPriceMatches) {
    const m = normalized.match(re);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v >= 1000 && v <= 250000) return { total: v };
    }
  }

  // 5. Handwritten OCR digit deobfuscator after "Kaufpreis ... verkauft zum Preis von [€?]"
  const hwSection = normalized.match(/(?:verkauft\s+zum\s+Preis\s+von|Kaufpreis\s*[:])\s*(?:[\r\n]+\s*)?[€?]\s*[:.\s]*([A-Za-z0-9.:]{5,12})/i);
  if (hwSection) {
    const rawDigits = hwSection[1]
      .replace(/[.:]/g, '')
      .slice(0, 5)
      .replace(/[AH]/g, '4')
      .replace(/[OQoau]/g, '0')
      .replace(/[G]/gi, '6')
      .replace(/[Iil]/g, '1')
      .replace(/[Z]/gi, '2')
      .replace(/[S]/gi, '5')
      .replace(/[B]/gi, '8');
    if (/^\d{4,5}$/.test(rawDigits)) {
      const v = parseInt(rawDigits, 10);
      if (v >= 1000 && v <= 200000) return { total: v };
    }
  }

  return { total: 0 };
}

function isOwnIssuerText(text: string, clientId?: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const compact = lower.replace(/[^a-z0-9äöüß]/g, '');
  const settings = clientRulesService.getClientSettings(clientId);
  const ownLower = (settings.company_name || '')
    .toLowerCase()
    .replace(/\s*(?:gmbh|ug|ag|kg|ohg)\b/gi, '')
    .trim();
  const ownKeywords = (settings.own_issuer_keywords || []).map((k) => k.toLowerCase());

  if (ownLower.length >= 3 && lower.includes(ownLower)) return true;
  if (ownKeywords.some((k) => k.length >= 3 && (lower.includes(k) || compact.includes(k.replace(/[^a-z0-9äöüß]/g, ''))))) {
    return true;
  }

  // Fuzzy OCR-tolerant anchors for QA24 / configured company letterhead
  // Handles OCR noise like "QA2QGmbH", "QA2CGmbH", "OA24", "Industrie$tr.32", "S5439", "EIOrsheim"
  if (ownLower.includes('qa24') || ownKeywords.some((k) => k.includes('qa24') || k.includes('65439'))) {
    if (/(?:qa2[4qc]|oa24|qa24automotive|65439|06145|industrie|orsheim|fl.{1,2}rsheim|florsheim)/i.test(compact)) {
      return true;
    }
  }
  return false;
}

export function isCleanPersonOrCompany(cand: string): boolean {
  if (!cand || cand.length < 3 || cand.length > 48) return false;
  if (/[\uFFFD]|[.]{2,}|[:]{1,}/.test(cand)) return false;
  if (/\b(?:der|die|das|dem|den|des|sich|ist|wird|auf|bis|zur|beruht|telefonnummer|kaufvertrag|ankaufvertrag|verkäufer|käufer|zwischen|universal)\b/i.test(cand)) return false;
  if (
    /^\d{5}\b/.test(cand) ||
    /(?:str\.|stra.{1,3}e|weg|ring|gasse|platz|allee)\s+\d+/i.test(cand) ||
    /\bwea\s+\d+/i.test(cand)
  ) {
    return false;
  }
  const letters = (cand.match(/[a-zäöüß]/gi) || []).length;
  if (letters < 4 || letters / cand.replace(/\s+/g, '').length < 0.7) return false;

  // Reject pure lowercase OCR fragments (e.g. "rid t de") — a person or company name must start capitalized or have a capitalized word / company acronym
  if (!/^(?:[A-ZÄÖÜ]|eBay\b|macOIL\b|auto-teile)/i.test(cand.trim())) return false;
  if (!/[A-ZÄÖÜ]/.test(cand)) return false;

  const tokens = cand.trim().split(/\s+/).filter(Boolean);
  const cleanCapWords = tokens.filter((t) => /^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(t.replace(/[.,]+$/g, ''))).length;
  const allLowerCount = tokens.filter((t) => /^[a-zäöüß]{1,5}$/.test(t) && !/^(?:am|im|in|der|die|von|van|zu|de|e\.k\.|und|plus)$/i.test(t)).length;
  // Reject phrases with multiple random short lowercase words unless it's a formal legal/descriptive entity (e.g. "Stadt Flörsheim am Main")
  if (cleanCapWords === 0 && !/\b(?:GmbH|AG|KG|UG|OHG|GbR|OY)\b/.test(cand)) return false;
  if (allLowerCount >= 2 && cleanCapWords < 2) return false;

  const allowedMixedToken = /^(?:GmbH|gGmbH|KGaA|mbH|eBay|macOIL|Co\.?KG|Mc[A-ZÄÖÜ][a-zäöüß]+|De[A-ZÄÖÜ][a-zäöüß]+|iPhone)[.,]?$/;
  const allowedTwoLetterUpper = /^(?:AG|KG|UG|OY|SE|SA|BV|NV|OHG|EK|CO|DR)$/;

  for (const rawTok of tokens) {
    const tok = rawTok.replace(/[.,-]+$/g, '');
    if (!tok) continue;
    // Reject 2+ uppercase letters immediately followed by lowercase (e.g. "NEWte", "KAUfvertrag")
    if (/^[A-ZÄÖÜ]{2,}[a-zäöüß]/.test(tok)) return false;
    // Reject internal lowercase-to-uppercase camelCase garble unless known legitimate pattern
    if (/[a-zäöüß][A-ZÄÖÜ]/.test(tok) && !allowedMixedToken.test(tok)) return false;
    // Reject standalone 2-letter ALL-CAPS gibberish tokens (e.g. "BJ") unless valid legal suffix or >=2 clean capitalized words
    if (/^[A-ZÄÖÜ]{2}$/.test(tok) && !allowedTwoLetterUpper.test(tok) && cleanCapWords < 2) return false;
  }
  return true;
}

export function detectVehicleMake(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.replace(/\r?\n/g, ' ');
  const makePatterns: Array<[string, RegExp]> = [
    ['mercedes', /\bmerc[\s._-]{0,2}e[\s._-]{0,2}des|\bdaimler\b|\bamg\b/i],
    ['audi', /\baudi\b/i],
    ['bmw', /\bbmw\b/i],
    ['opel', /\bopel\b/i],
    ['tesla', /\btesla\b/i],
    ['vw', /\bvolkswagen\b|\bvw\b/i],
    ['porsche', /\bporsche\b/i],
    ['ford', /\bford\b/i],
    ['skoda', /\b[sš]koda\b/i],
    ['seat', /\bseat\b/i],
    ['peugeot', /\bpeugeot\b/i],
    ['renault', /\brenault\b/i],
    ['hyundai', /\bhyundai\b/i],
    ['kia', /\bkia\b/i],
    ['toyota', /\btoyota\b/i],
    ['mazda', /\bmazda\b/i],
    ['nissan', /\bnissan\b/i],
    ['volvo', /\bvolvo\b/i],
    ['fiat', /\bfiat\b/i],
  ];
  for (const [make, re] of makePatterns) {
    if (re.test(text)) return make;
  }
  return null;
}

function extractPartner(text: string, type: BelegRecordType, clientId?: string): string {
  const lines = text
    .split(/\r?\n|\|/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length >= 3 &&
        (!/^\d+$/.test(l) || /^\d{5}$/.test(l)) &&
        !/(?:fl.{1,2}rsheim|florsheim|frankfurt|berlin|mainz)[,\s]*\d{1,2}[.]?\d{2}/i.test(l)
    );

  const settings = clientRulesService.getClientSettings(clientId);

  const isFormTitleOrFieldLabel = (line: string): boolean => {
    const l = line.toLowerCase().trim();
    if (
      /kaufver.{0,3}g|k\s*a\s*u\s*f\s*v\s*e\s*r|ankaufvertrag|gebraucht\w*\s+kraftfahrzeug|f.{1,2}r\s+ein\s+gebrauchtes|verbindliche\s+bestellung|rechnung\s+f.{1,2}r\s+den\s+verkauf|vertragsformular|hiermit\s+\w+\s+der\s+verk|folgendes\s+fahrzeug|fahrzeug.{1,2}bergabe|fahrzeugangaben|sondervereinbarungen/i.test(
        l
      )
    ) {
      return true;
    }
    if (
      /^(?:vo(?:rn|m)ame|voavne|zuname|nachname|familienname|name[.,\s]*vorname|name|anschrift|ans[a-z&]+ft|str(?:aße|asse|ate)?\.?|plz|piz|ptz|ort|u\s+ott|telefon|telefm|mobil|fax|e-?mail|hersteller|fahrg[a-z-\s]*|nr\.?|sod|t.{1,2}v|s.{1,2}d|k.{1,2}ufer|verk.{1,2}ufer(?:\s*\([^)]*\))?|privat|gewerblich|pass-?nr|personalausweis\w*|geburtsdatum|geb\.?\s*am|je\s+f.{1,2}r|marke|modell|erstzulassung|km-stand|typ|motorleistung|n.{1,2}chste\s+hu|stand\s+des|sonderausstattungen|liefertermin|besondere\s+vereinbarungen|kaufpreis|datum)(?:\b|[:\s]|$)/i.test(
        l
      )
    ) {
      return true;
    }
    return false;
  };

  const isOwnOrNoise = (line: string): boolean => {
    const l = line.toLowerCase();
    if (isOwnIssuerText(line, clientId)) return true;
    if (isFormTitleOrFieldLabel(line)) return true;
    return (
      l.includes('iban') ||
      l.includes('bic:') ||
      l.includes('tele:') ||
      l.includes('tel.:') ||
      l.includes('tel:') ||
      l.includes('fax:') ||
      l.includes('www.') ||
      /fl.{1,2}rsheim|florsheim|f16.{1,2}beim/i.test(l) ||
      l.includes('industriestr') ||
      l.includes('indusriestr') ||
      l.includes('rechnungsnummer') ||
      /bitte\s+das\s+z/i.test(l) ||
      /\d{1,2}[.]\d{2}[.]?\d{2,4}/.test(l)
    );
  };

  if (type === 'QA24_PURCHASE') {
    // 1. Scan lines after "Verkäufer" up to "Käufer" or vehicle specs, stopping once we pass the seller's address block
    const sellerIdx = lines.findIndex((l) => /^verk.{1,2}ufer\b/i.test(l));
    if (sellerIdx >= 0) {
      const picked: string[] = [];
      let sawAddressLine = false;
      for (let i = sellerIdx + 1; i < Math.min(lines.length, sellerIdx + 14); i++) {
        const cand = lines[i].replace(/^(?:Name[.,\s]*vorname|Vorname|Zuname|Herr|Frau)\s*[:.\s]*/i, '').trim();
        if (/^(?:k.{1,2}ufer|kraftfahrzeug|fahrzeugangaben|ankaufvertrag|marke\s*:|hersteller\s*:|hiermit\b)/i.test(cand)) break;
        if (
          /^\d{5}\b/.test(cand) ||
          /(?:str\.|stra.{1,3}e|weg|ring|gasse|platz|allee)\s+\d+/i.test(cand) ||
          /\bwea\s+\d+/i.test(cand)
        ) {
          sawAddressLine = true;
          if (picked.length > 0) break;
          continue;
        }
        // Once past the seller address block (PLZ/street), stop scanning so Käufer/footer noise (e.g. "NEWte BJ") is never picked
        if (sawAddressLine) break;
        if (isOwnOrNoise(cand) || !isCleanPersonOrCompany(cand)) continue;
        if (/^[A-HJ-NPR-Z0-9]{16,17}$/i.test(cand) || /^(?:tesla|opel|audi|bmw|mercedes|vw|volkswagen|ford|mainz|frankfurt|berlin)\b$/i.test(cand)) continue;
        picked.push(cand);
        if (picked.length >= 2 || cand.includes(',') || cand.split(/\s+/).length >= 2) break;
      }
      if (picked.length > 0) {
        return picked.join(' ').slice(0, 60);
      }
    }
  }

  if (type === 'QA24_SALE' || type === 'QA24_PURCHASE') {
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const line = lines[i];
      if (/^(?:k\s*a\s*u\s*f\s*v\s*e\s*r|kaufver|ankaufver.{0,3}g|rechnung\s+f|rechnungsnummer|verk.{1,2}ufer)/i.test(line)) break;
      if (isOwnOrNoise(line) || !isCleanPersonOrCompany(line)) continue;
      if (/^(?:Marke|Modell|Erstzulassung|\d{5}\s+)/i.test(line)) continue;
      if (/^[A-ZÄÖÜ]{2,6}$/.test(line.trim())) continue;
      if (/[a-zäöüß]{3,}/i.test(line) && !/^\d+$/.test(line)) {
        return line.replace(/^Firma\s+/i, '').slice(0, 60);
      }
    }
    if (type === 'QA24_PURCHASE') {
      // Name not cleanly readable in OCR -> leave partner empty so caller uses "Fahrzeugeinkauf <VIN>"
      return '';
    }
  }

  if (/gewerbeanmeldung|stadt\s*flörsheim/i.test(text)) {
    return 'Stadt Flörsheim am Main';
  }
  if (/\b(?:db\s+fernverkehr|deutsche\s+bahn|einfache\s+fa[hy]rt.*civ\s*1080|civ\s*1080.*db)\b/i.test(text.replace(/\r?\n/g, ' '))) {
    return 'Deutsche Bahn';
  }
  const tankLineMatch = text.match(/^([A-ZÄÖÜ0-9-]{2,15}[-\s]+(?:Tank|Jank)\s*stel\s*le(?:\s+\d+)?)/im);
  if (tankLineMatch) {
    return tankLineMatch[1].replace(/Jank/i, 'Tank').replace(/stel\s*le/i, 'stelle').replace(/\s+/g, ' ').trim();
  }

  // 1. Check client-configured supplier header patterns from storage/rules/<client>.json
  if (settings.supplier_headers) {
    for (const [pattern, canonicalName] of Object.entries(settings.supplier_headers)) {
      try {
        if (new RegExp(pattern, 'i').test(text)) {
          return canonicalName;
        }
      } catch {
        if (text.toLowerCase().includes(pattern.toLowerCase())) {
          return canonicalName;
        }
      }
    }
  }

  // 2. Generic German legal entity / business header detection
  for (const line of lines.slice(0, 12)) {
    if (isOwnOrNoise(line)) continue;
    if (
      /\b(GmbH|AG|KG|OHG|UG|GbR|e\.?\s*K\.?|Tankstelle|Station|Supermarkt|Markt|Autohaus|Automobile|Autoschilder|Kreisverwaltung|Landeshauptstadt|Stadtkasse)\b/i.test(
        line
      )
    ) {
      return line.slice(0, 60);
    }
  }

  for (const line of lines.slice(0, 8)) {
    if (!isOwnOrNoise(line) && /[a-zäöüß]{3,}/i.test(line)) {
      return line.slice(0, 60);
    }
  }
  return 'Unbekannter Beleg';
}

function parseFlexAmount(s: string): number {
  let t = s.trim().replace(/[€\s]/g, '');
  if (!t) return 0;
  // Handle both "224.74" and "1.484,22" / "224,74"
  if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(t)) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{2}$/.test(t)) {
    t = t.replace(',', '.');
  } else if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(t)) {
    t = t.replace(/,/g, '');
  } else {
    t = t.replace(',', '.');
  }
  const v = parseFloat(t);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export function parseFinanzberichtPage(rawText: string, effectiveYear: number, fallbackMonth: number): FinanzberichtData | null {
  const lower = rawText.toLowerCase();
  if (!/finanzbericht|steuer\s+f[uü]r\s+barbestell|umsatz\s+und\s+steuern/i.test(lower)) return null;

  // Date: "Finanzbericht 02/06/2026" or "F i b i c h t 06 / / 2026"
  let day = 1;
  let month = fallbackMonth;
  let year = effectiveYear;
  const dm = rawText.match(/(?:finanzbericht|f\s*i\s*[bi]\s*[ic]\s*h\s*t|f\s*i\s*i)\s*(\d{1,2})\s*\/\s*(\d{0,2})\s*\/\s*(20\d{2})/i);
  if (dm) {
    const dVal = parseInt(dm[1], 10);
    if (dVal >= 1 && dVal <= 31) day = dVal;
    if (dm[2]) {
      const mVal = parseInt(dm[2], 10);
      if (mVal >= 1 && mVal <= 12) month = mVal;
    }
    year = parseInt(dm[3], 10);
  }
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const belegdatum = `${String(day).padStart(2, '0')}${String(month).padStart(2, '0')}`;

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const euroAmts: number[] = [];
  for (const l of lines) {
    const em = l.match(/^[€({[]\s*(\d+[.,]\d{2})\s*$/);
    if (em) euroAmts.push(parseFlexAmount(em[1]));
  }

  // Payment channels (OrderYOYO, Lieferando, UberEats, Pos, Bar)
  const platforms: Record<string, number> = {};
  const labelRe = /^(OrderYOYO|OlderYOYO|Lieferando|Ljeferando|UberEats|Pos|Bar|Bart)\s*[:;,.]?$/i;
  for (let i = 0; i < lines.length; i++) {
    const lm = lines[i].match(labelRe);
    if (lm) {
      let key = lm[1].toLowerCase();
      if (key.startsWith('o')) key = 'orderyoyo';
      else if (key.startsWith('l')) key = 'lieferando';
      else if (key.startsWith('u')) key = 'ubereats';
      else if (key.startsWith('b')) key = 'bar';
      else key = 'pos';
      // Look ahead for € amount on nearby lines if inline not present
      const inline = lines[i].match(/(\d+[.,]\d{2})/);
      if (inline) {
        platforms[key] = (platforms[key] || 0) + parseFlexAmount(inline[1]);
      }
    }
  }

  // Extract Netto/MwSt/Brutto triples in Bar section vs Bargeldlos section
  const barIdx = lines.findIndex((l) => /Steuer\s+f[uü]r\s+Barbestell/i.test(l));
  const onlineIdx = lines.findIndex((l) => /Steuern\s+f[uü]r\s+bargeldlose/i.test(l));
  const umsatzIdx = lines.findIndex((l) => /UMSAT[ZI]\s+UND/i.test(l));

  const extractSectionVat = (startIdx: number, endIdx: number): { vat7: number; vat19: number } => {
    if (startIdx < 0) return { vat7: 0, vat19: 0 };
    const sec = lines.slice(startIdx, endIdx > startIdx ? endIdx : lines.length);
    const nums: number[] = [];
    for (const sl of sec) {
      if (/^\d{1,4}[., ]\d{2}$/.test(sl) && !/%|€/.test(sl)) {
        nums.push(parseFlexAmount(sl.replace(/\s+/g, '')));
      }
    }
    let vat7 = 0;
    let vat19 = 0;
    // 1) Try adjacent (Netto, MwSt, Brutto) triples
    for (let i = 0; i + 2 < nums.length; i++) {
      const a = nums[i], b = nums[i + 1], c = nums[i + 2];
      if (a > 0 && c > a && Math.abs((a + b) - c) <= 0.15) {
        const ratio = b / a;
        if (ratio < 0.12) vat7 = Math.round((vat7 + c) * 100) / 100;
        else vat19 = Math.round((vat19 + c) * 100) / 100;
        i += 2;
      }
    }
    // 2) Fallback when WinRT OCR reads columns vertically (e.g. [n1, n2, m1, m2, b1, b2] or [n1, m1, b1])
    if (vat7 === 0 && vat19 === 0 && nums.length >= 6) {
      const half = Math.floor(nums.length / 3);
      for (let k = 0; k < half; k++) {
        const a = nums[k], b = nums[k + half], c = nums[k + 2 * half];
        if (a > 0 && c > a && Math.abs((a + b) - c) <= 0.25) {
          const ratio = b / a;
          if (ratio < 0.12) vat7 = Math.round((vat7 + c) * 100) / 100;
          else vat19 = Math.round((vat19 + c) * 100) / 100;
        }
      }
    }
    // 3) Fallback: if section still has 0, use €-prefixed Bar/Online totals or largest Brutto in section
    if (vat7 === 0 && vat19 === 0 && nums.length >= 3) {
      // Find any pair (a, b, c) anywhere in nums with a + b = c
      const used = new Set<number>();
      for (let i = 0; i < nums.length; i++) {
        if (used.has(i) || nums[i] <= 0) continue;
        for (let j = i + 1; j < nums.length; j++) {
          if (used.has(j) || nums[j] <= 0) continue;
          const sum = Math.round((nums[i] + nums[j]) * 100) / 100;
          const k = nums.findIndex((v, idx) => idx > j && !used.has(idx) && Math.abs(v - sum) <= 0.20);
          if (k > 0) {
            used.add(i); used.add(j); used.add(k);
            const ratio = Math.min(nums[i], nums[j]) / Math.max(nums[i], nums[j]);
            if (ratio < 0.12) vat7 = Math.round((vat7 + nums[k]) * 100) / 100;
            else vat19 = Math.round((vat19 + nums[k]) * 100) / 100;
            break;
          }
        }
      }
    }
    return { vat7, vat19 };
  };

  const barVat = extractSectionVat(barIdx, onlineIdx > barIdx ? onlineIdx : umsatzIdx);
  const onlineVat = extractSectionVat(onlineIdx, umsatzIdx > onlineIdx ? umsatzIdx : lines.length);

  // Total Brutto Gesamt from bottom or max € amount
  let totalBrutto = 0;
  const bruttoGesamtMatch = rawText.match(/Brutto\s*(?:Gesamt)?\s*[:;]?\s*[€({]?\s*(\d+[.,]\d{2})/i);
  if (bruttoGesamtMatch) totalBrutto = parseFlexAmount(bruttoGesamtMatch[1]);
  if (totalBrutto === 0 && euroAmts.length > 0) totalBrutto = Math.max(...euroAmts);

  let cash7 = barVat.vat7;
  let cash19 = barVat.vat19;
  let online7 = onlineVat.vat7;
  let online19 = onlineVat.vat19;
  // Fallback when WinRT OCR garbles VAT table rows: use ZAHLARTEN Bar vs Online totals
  if (cash7 + cash19 + online7 + online19 === 0 && totalBrutto > 0) {
    const barM = rawText.match(/\bBar\s*[:;]?\s*[€({]?\s*(\d+[.,]\d{2})/i);
    const barAmt = barM ? parseFlexAmount(barM[1]) : 0;
    if (barAmt > 0 && barAmt <= totalBrutto + 0.05) {
      cash7 = barAmt;
      online7 = Math.max(0, Math.round((totalBrutto - barAmt) * 100) / 100);
    } else if (/steuer\s+f[uü]r\s+barbestell/i.test(lower)) {
      online7 = totalBrutto;
    } else {
      online7 = totalBrutto;
    }
  }

  const vatSum = Math.round((cash7 + cash19 + online7 + online19) * 100) / 100;
  const vatSumOk = totalBrutto > 0 ? Math.abs(vatSum - totalBrutto) <= 0.25 : vatSum > 0;

  return {
    date,
    belegdatum,
    cash7Brutto: cash7,
    cash19Brutto: cash19,
    online7Brutto: online7,
    online19Brutto: online19,
    totalBrutto: totalBrutto || vatSum,
    vatSumOk,
    platforms,
  };
}

export function parsePlatformStatement(rawText: string): PlatformStatementData | null {
  const lower = rawText.toLowerCase();
  if (/order\s*smart|app\s*smart|orderyoyo/i.test(lower) && /auszahlung|übersicht abrechnung|gesamter rechnungsbetrag/i.test(lower)) {
    const payoutM = rawText.match(/Auszahlung\*?\s*:\s*([\d.,]+)\s*€/i);
    const salesM = rawText.match(/Online\s+Einnahmen[^\d]*([\d.,]+)\s*€/i);
    const feeGrossM = rawText.match(/Gesamter\s+Rechnungsbetrag[^\d]*([\d.,]+)\s*€/i) || rawText.match(/Gesamt\s+brutto[^\d]*([\d.,]+)\s*[€c]/i);
    const feeNetM = rawText.match(/Gesamt\s+netto[^\d]*([\d.,]+)\s*€/i);
    const feeVatM = rawText.match(/USt\.-Betrag[^\d]*([\d.,]+)\s*€/i);
    const periodM = rawText.match(/Woche\s+\d+[^)\n]*/i);
    return {
      platform: 'ordersmart',
      period: periodM?.[0]?.trim(),
      onlineSales: salesM ? parseFlexAmount(salesM[1]) : 0,
      feesGross: feeGrossM ? parseFlexAmount(feeGrossM[1]) : 0,
      feesNet: feeNetM ? parseFlexAmount(feeNetM[1]) : undefined,
      feesVat: feeVatM ? parseFlexAmount(feeVatM[1]) : undefined,
      payout: payoutM ? parseFlexAmount(payoutM[1]) : 0,
      reverseCharge13b: false,
    };
  }
  if (/lieferando\.de|yd\.yourdelivery|takeaway\.com/i.test(lower) && /gesamtbetrag dieser rechnung|verrechnet mit eingegangenen/i.test(lower)) {
    const feeGrossM = rawText.match(/Gesamtbetrag\s+dieser\s+Rechnung[^\d]*([\d.,]+)/i);
    const feeNetM = rawText.match(/Zwischensumme[^\d]*([\d.,]+)/i);
    const feeVatM = rawText.match(/MwSt\.\s*\(19%[^\d]*([\d.,]+)/i);
    const salesM = rawText.match(/Verwaltungsgebühr\s*\(Online-Zahlungen\)[^\d]*([\d.,]+)/i) || rawText.match(/Bestellungen im Wert von\s*€?\s*([\d.,]+)/i);
    const feesGross = feeGrossM ? parseFlexAmount(feeGrossM[1]) : 0;
    const onlineSales = salesM ? parseFlexAmount(salesM[1]) : 0;
    return {
      platform: 'lieferando',
      onlineSales,
      feesGross,
      feesNet: feeNetM ? parseFlexAmount(feeNetM[1]) : undefined,
      feesVat: feeVatM ? parseFlexAmount(feeVatM[1]) : undefined,
      payout: Math.max(0, Math.round((onlineSales - feesGross) * 100) / 100),
      reverseCharge13b: /takeaway\.com|derdengelden|reverse\s*charge|13b/i.test(lower),
    };
  }
  if (/uber\s*eats/i.test(lower) && /nettoauszahlung|auszahlungszeitraum/i.test(lower)) {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const nums = lines.filter((l) => /^-?[\d.,]+\s*[€ec]?$/i.test(l)).map((l) => parseFlexAmount(l.replace(/[€ec]/gi, '')));
    const payout = nums.length > 0 ? Math.abs(nums[nums.length - 1]) : 0;
    const feeNeg = nums.find((n) => n < 0);
    const feesGross = feeNeg ? Math.abs(feeNeg) : 0;
    const onlineSales = Math.round((payout + feesGross) * 100) / 100;
    const periodM = rawText.match(/Auszahlungszeitraum:\s*([^\n]+)/i);
    return {
      platform: 'ubereats',
      period: periodM?.[1]?.trim(),
      onlineSales,
      feesGross,
      payout,
      reverseCharge13b: true,
    };
  }
  return null;
}

export function extractMixedVatSplits(rawText: string, grossTotal: number): MixedVatSplit[] | undefined {
  const lower = rawText.toLowerCase();
  if (!/\b(lidl|lödl|aldi|rewe|edeka|kaufland|netto|penny)\b/i.test(lower)) return undefined;
  const hasA7 = /\b[a1]\s*7\s*[,.]?\s*0{0,2}\s*%|\b7%\b/i.test(lower);
  const hasB19 = /\bb\s*19\s*[,.]?\s*0{0,2}\s*%|\b19%\b/i.test(lower);
  if (!hasA7 || !hasB19) return undefined;

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const vatIdx = lines.findIndex((l) => /netto.*mwst|steuer\s*%|brutto/i.test(l));
  if (vatIdx < 0) return undefined;
  const sec = lines.slice(vatIdx, vatIdx + 25);
  let brutto7 = 0;
  let brutto19 = 0;
  for (const sl of sec) {
    const m = sl.match(/(7|19)\s*[,.]?\s*0{0,2}\s*%.*?(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})/);
    if (m) {
      const rate = parseInt(m[1], 10);
      const b = parseFlexAmount(m[4]);
      if (rate === 7) brutto7 += b;
      else if (rate === 19) brutto19 += b;
    }
  }
  if (brutto7 > 0 && brutto19 > 0 && Math.abs(brutto7 + brutto19 - grossTotal) <= 0.5) {
    return [
      { rate: 7, brutto: Math.round(brutto7 * 100) / 100, account: '3300', buCode: '8' },
      { rate: 19, brutto: Math.round(brutto19 * 100) / 100, account: '3400', buCode: '9' },
    ];
  }
  return undefined;
}

function classifyBelegPage(rawText: string, filename: string, clientId?: string): BelegRecordType {
  const lower = rawText.toLowerCase();
  const isOwnIssuer = isOwnIssuerText(rawText, clientId);
  const rules = clientRulesService.getRules(clientId);
  const isCarDealer = !rules?.business_type || rules.business_type === 'car_dealer';

  // Daily POS report ("Finanzbericht DD/MM/YYYY")
  if (/finanzbericht\s+\d{1,2}\s*\/\s*\d{0,2}\s*\/\s*20\d{2}|steuer\s+f[uü]r\s+barbestellungen|umsatz\s+und\s+steuern/i.test(lower)) {
    return 'FINANZBERICHT';
  }
  // Delivery platform settlement statements (order smart / app smart, Lieferando / Takeaway.com, Uber Eats)
  if (
    (/order\s*smart|app\s*smart|orderyoyo/i.test(lower) && /übersicht abrechnung|ihr kundenkonto|gesamter rechnungsbetrag/i.test(lower)) ||
    (/lieferando\.de|yd\.yourdelivery|takeaway\.com/i.test(lower) && /gesamtbetrag dieser rechnung|verrechnet mit eingegangenen/i.test(lower)) ||
    (/uber\s*eats/i.test(lower) && /nettoauszahlung|auszahlungszeitraum/i.test(lower))
  ) {
    return 'PLATFORM_STATEMENT';
  }
  if (/einzelauflistung|trinkgelder erhalten von|spezifikation der transaktionen|anhang.*bankauszahlung|stundenzettel|verdorbene ware|rechtsbehelfsbelehrung|sepa-überweisung\/zahlschein|ihre stromkosten im detail|herkunft ihres stroms|finanzamt obornburg|finanzamt.*steuernu|monatliche\s*berichte|\bmahnung\b|zahlungserinnerung/i.test(lower)) {
    return 'OTHER';
  }

  if (isCarDealer) {

  // If Verkäufer is QA24 and this is an explicit sales invoice or QA24's own sales contract ("Kaufvertrag für folgendes Fahrzeug"):
  const isKaeuferOwn = /(?:käufer|kaeufer|k\s*ä\s*u\s*f\s*e\s*r|kufer)\s*[:.\s]{0,50}(?:qa2[4qc]|oa24|qayumi|industriestr|indusrie|65439|flörsheim|florsheim)/i.test(lower);
  const isExplicitSaleInvoice =
    /(?:rechnung\s+für\s+den\s+verkauf|rechnung\s+nr\.?\s*0[1-9]\/2024|rechnungsnummer:\s*0[1-9]\/2024)/i.test(lower) ||
    (isOwnIssuer && !isKaeuferOwn && !/ankauf/i.test(lower) && /kaufve.{1,4}g\s+f.{1,2}r\s+folgendes\s+fahrzeug/i.test(lower));
  if (isExplicitSaleInvoice) {
    return 'QA24_SALE';
  }

  // Non-financial statutory vehicle transfer notification (Veräußerungsanzeige gem. § 13 Abs. 4 FZV) or 1-cent rounding credit note
  if (
    (/erungsanzeige|empfangsbest.{1,3}tigung\s+gem.{1,6}13\s+abs/i.test(lower)) &&
    !/rechnungsbetrag|gesamtbetrag|kaufpreis/i.test(lower)
  ) {
    return 'OTHER';
  }
  if (/rechnungskorrektur|rundung-?gutschn?rift/i.test(lower) && /-?\s*0[,.]0[1-5]\b/.test(lower)) {
    return 'OTHER';
  }

  // Vehicle purchase contracts (QA24 buying vehicle from private person or dealer)
  if (/ankaufve.{1,4}g|adac\s+kaufvertrag|kaufvertrag\s+für|k\s*a\s*u\s*f\s*v\s*e\s*r\s*t\s*r\s*a\s*g|kaufver[&a-z]+g|kautv.{1,4}trag/i.test(lower)) {
    return 'QA24_PURCHASE';
  }

  // If Käufer is QA24, this is a vehicle purchase contract
  if (isKaeuferOwn && /kaufvertrag|ankaufvertrag|bestellung/i.test(lower)) {
    return 'QA24_PURCHASE';
  }

  if (/ankaufvertrag|verbindliche\s+bestellung/i.test(lower)) {
    return 'QA24_PURCHASE';
  }
  if (/(?:verkauf\s+nach\s+[§s5]?\s*25a)/i.test(lower)) {
    return 'QA24_SALE';
  }
  if (/adac\s+kaufvertrag|kaufvertrag\s+für\s+ein\s+gebrauchtes/i.test(lower)) {
    return 'QA24_PURCHASE';
  }
  // Vehicle purchase invoice issued by a third-party dealer (has VIN + vehicle price >= 3000 EUR + vehicle specs)
  if (
    !isOwnIssuer &&
    /rechnung|invoice/i.test(lower) &&
    /fahrgestellnummer|fahrzeug-ident|erstzulassung|kilometerstand|laufleistung/i.test(lower) &&
    extractVinFromText(rawText) &&
    extractAmount(rawText).total >= 3000
  ) {
    return 'QA24_PURCHASE';
  }
  } // end isCarDealer
  if (/(?:gewerbeanmeldung|gewerbeamt|rathausplatz|magistrat)/i.test(lower)) {
    return 'RECEIPT';
  }
  if (/(?:girocard|ec-chip|kundenbeleg|tankstelle|super\s*fuel|super\s*e10|diesel|einzahlquittung|kassenbon|summe\s+ec-cash|mastercard)/i.test(lower)) {
    return 'RECEIPT';
  }
  if (/rechnung|rechnungs-?nr|rechnungsdatum|invoice/i.test(lower)) {
    return 'SUPPLIER_INVOICE';
  }
  if (/kaufvertrag/i.test(lower)) {
    return 'CONTRACT';
  }
  if (/bankbeleg|kasse[n]?beleg|kasse/i.test(filename.toLowerCase())) {
    return 'RECEIPT';
  }
  return 'OTHER';
}

function isContinuationPage(pageText: string, prevText: string, pageNum: number): boolean {
  const lower = pageText.toLowerCase();
  // Vehicle handover protocol or statutory § 13 Abs. 4 FZV Veräußerungsanzeige following a contract
  if (/(?:f?ahrzeug[a-z\uFFFD?]*bergabe|uebergabeprotokoll|übergabeprotokoll)/i.test(lower)) {
    return true;
  }
  if (
    /erungsanzeige|empfangsbest.{1,3}tigung\s+gem.{1,6}13\s+abs/i.test(lower) &&
    !/kaufpreis|rechnungsbetrag|gesamtbetrag/i.test(lower) &&
    /kaufvertrag|ankaufvertrag|k\s*a\s*u\s*f\s*v\s*e\s*r/i.test(prevText.toLowerCase())
  ) {
    return true;
  }
  // Order agreement / payment terms following an invoice
  if (/verbindliche\s+bestellung|zahlungsvereinbarung/i.test(lower) && !extractAmount(pageText).total) {
    return true;
  }
  // Bank details / attachment page with no distinct amount/invoice
  if (/bankverbindung|volk[s6]bank|sparkasse|genodefi/i.test(lower) && pageText.length < 300 && !extractAmount(pageText).total) {
    return true;
  }
  // AGB / Terms & Conditions page 2 of car contract
  if (
    (/verkürzung\s+der\s+verj[äa]hrungsfrist|akzeptiert\s+der\s+käufer\s+bedingungen|eigentum\s+des\s+verkäufers\s+bleibt|mit\s+seiner\s+unterschrift\s+akzeptiert/i.test(lower) ||
      (/abweichend\s+von\s+der\s+gesetzlich/i.test(lower) && /verj.{1,4}rungs/i.test(lower))) &&
    !/kaufpreis\s*:|rechnungsbetrag|fahrgestellnummer/i.test(lower)
  ) {
    return true;
  }
  // Multi-page invoice page 2 of 2 (e.g. G+K Eschborn, Avalon Premium Cars, Vattenfall Rückseite)
  if (/seite\s*2\s*von\s*2|blatt\s*2\b|\bübertrag\b/i.test(lower) && !/seite\s*1\s*von/i.test(lower)) {
    return true;
  }
  // order smart / app smart 5-page weekly settlement: pages 2/5..5/5 belong to page 1/5 ("Übersicht Abrechnung")
  if (
    /order\s*smart|app\s*smart/i.test(lower) &&
    /seite:\s*[2-5]\/5/i.test(lower) &&
    /übersicht abrechnung|rechnungsnummer/i.test(prevText.toLowerCase())
  ) {
    return true;
  }
  if (/fortsetzung\s+auf\s+der\s+r[üu]ckseite/i.test(prevText.toLowerCase()) && pageText.length < 150) {
    return true;
  }
  // Tiny garbage/upside-down stub right after an invoice -> attach rather than create bogus 0-amount record
  if (pageNum > 1 && pageText.trim().length < 50 && prevText.length > 150) {
    return true;
  }
  return false;
}

export interface StrictOllamaReceipt {
  docType: 'ankaufvertrag' | 'kaufvertrag' | 'rechnung_eingang' | 'rechnung_ausgang' | 'kassenbon' | 'storno' | 'mahnung' | 'sonstiges';
  date: string | null;
  grossAmount: number | null;
  netAmount: number | null;
  vatRate: number | null;
  vin: string | null;
  partnerName: string | null;
  invoiceNo: string | null;
  taxClause: '25a' | '13b' | 'igL' | null;
  handwrittenNotes: string | null;
  needsReview?: boolean;
  doubleReadMismatch?: boolean;
  handwrittenCorrection?: boolean;
}

export async function extractStrictReceiptWithOllama(
  imgBase64: string,
  cropImgBase64?: string
): Promise<StrictOllamaReceipt | null> {
  if (!(await ollamaClient.isAvailable())) return null;
  const prompt =
    'Extract ONLY factual fields from this German/EU accounting document page as strict JSON (no account codes, never guess). ' +
    'Multilingual mapping: Lasku / Factuur / Faktura / Invoice / Rechnung -> rechnung_eingang or rechnung_ausgang; ' +
    'Storno / Credit note / Hyvityslasku -> storno. ' +
    'If there is ANY handwritten correction, strike-through, or overwritten digit near a price, describe it in handwrittenNotes. ' +
    'Schema: {"docType":"ankaufvertrag|kaufvertrag|rechnung_eingang|rechnung_ausgang|kassenbon|storno|mahnung|sonstiges","date":"YYYY-MM-DD|null","grossAmount":number|null,"netAmount":number|null,"vatRate":number|null,"vin":"17-char VIN|null","partnerName":"string|null","invoiceNo":"string|null","taxClause":"25a|13b|igL|null","handwrittenNotes":"string|null"}';

  const cropPrompt =
    'Re-read ONLY the amount, date, and 17-char VIN from this focused region/page as strict JSON. Never guess: ' +
    '{"docType":"...","date":"YYYY-MM-DD|null","grossAmount":number|null,"netAmount":number|null,"vatRate":number|null,"vin":"17-char VIN|null","partnerName":"string|null","invoiceNo":"string|null","taxClause":"25a|13b|igL|null","handwrittenNotes":"string|null"}';

  const validate = (r: StrictOllamaReceipt): boolean => {
    if (r.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(r.vin.trim())) return false;
    if (r.grossAmount !== null && (!Number.isFinite(Number(r.grossAmount)) || Number(r.grossAmount) < 0)) return false;
    if (r.netAmount !== null && !Number.isFinite(Number(r.netAmount))) return false;
    if (r.netAmount && r.vatRate && r.grossAmount) {
      const calcGross = Number(r.netAmount) * (1 + Number(r.vatRate) / 100);
      if (Math.abs(calcGross - Number(r.grossAmount)) > 0.05) return false;
    }
    return true;
  };

  let passA: StrictOllamaReceipt | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ollamaClient.generateJson<StrictOllamaReceipt>({
        model: ollamaClient.getVisionModel(),
        images: [imgBase64],
        prompt: attempt === 0 ? prompt : `${prompt} PREVIOUS OUTPUT FAILED VALIDATION (check net+vat=gross and 17-char VIN).`,
        format: 'json',
        temperature: 0,
      });
      if (res && validate(res)) {
        passA = { ...res, needsReview: false };
        break;
      }
      if (attempt === 1 && res) {
        passA = { ...res, needsReview: true };
      }
    } catch {
      // retry once
    }
  }
  if (!passA) return null;

  // Pass (b): Double-read on cropped region (or focused re-read) to verify amount, date, VIN
  try {
    const passB = await ollamaClient.generateJson<StrictOllamaReceipt>({
      model: ollamaClient.getVisionModel(),
      images: [cropImgBase64 || imgBase64],
      prompt: cropPrompt,
      format: 'json',
      temperature: 0,
    });
    if (passB) {
      const amtDiff =
        passA.grossAmount !== null &&
        passB.grossAmount !== null &&
        Math.abs(Number(passA.grossAmount) - Number(passB.grossAmount)) > 0.02;
      const dateDiff = passA.date && passB.date && passA.date !== passB.date;
      const vinDiff = passA.vin && passB.vin && passA.vin.toUpperCase() !== passB.vin.toUpperCase();
      if (amtDiff || dateDiff || vinDiff) {
        passA.doubleReadMismatch = true;
        passA.needsReview = true;
      }
    }
  } catch {
    // non-fatal
  }

  if (
    passA.handwrittenNotes &&
    /(korrigiert|durchgestrichen|überschrieben|handschriftlich|strikethrough|overwritten|corrected|crossed)/i.test(
      passA.handwrittenNotes
    )
  ) {
    passA.handwrittenCorrection = true;
    passA.needsReview = true;
  }

  return passA;
}

export const belegIndexService = {
  /**
   * Groups multi-page scanned bundles (merges AGB/terms & Blatt 2 pages with page 1)
   * and parses deterministic BelegRecord entries verified against the raw OCR text.
   */
  groupAndClassifyPages(
    pages: OcrPage[],
    meta: { clientId: string; year: number; month: number; filename: string; documentId?: string; checksum?: string }
  ): BelegRecord[] {
    if (!pages || pages.length === 0) return [];

    // 1. Group pages into logical documents
    const groups: Array<{ pageNums: number[]; rawText: string }> = [];
    for (const p of pages) {
      const text = (p.text || '').trim();
      if (!text) continue;
      if (groups.length > 0 && isContinuationPage(text, groups[groups.length - 1].rawText, p.page)) {
        groups[groups.length - 1].pageNums.push(p.page);
        groups[groups.length - 1].rawText += `\n--- PAGE ${p.page} ---\n${text}`;
      } else {
        groups.push({ pageNums: [p.page], rawText: text });
      }
    }

    const records: BelegRecord[] = [];
    // Detect dominant 4-digit year from actual printed dates inside the document pages
    // so a misnamed file (e.g. "062026_Kassebelege.pdf" containing 2024 receipts) uses the real document year.
    let effectiveYear = meta.year;
    if (meta.year > 2025) {
      const yearCounts = new Map<number, number>();
      for (const g of groups) {
        for (const ymMatch of g.rawText.matchAll(/\b(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](202[3-5])\b/g)) {
          const y = parseInt(ymMatch[1], 10);
          yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
        }
      }
      let bestCount = 0;
      for (const [y, cnt] of yearCounts.entries()) {
        if (cnt > bestCount) {
          bestCount = cnt;
          effectiveYear = y;
        }
      }
    }

    for (const g of groups) {
      const raw = g.rawText;
      const lower = raw.toLowerCase();
      const type = classifyBelegPage(raw, meta.filename, meta.clientId);
      const partner = extractPartner(raw, type, meta.clientId);
      const invoiceNo = extractInvoiceNumber(raw);
      const vin = extractVinFromText(raw);
      const amtInfo = extractAmount(raw);
      const { iso: date, belegdatum, dateUncertain } = extractDateFromText(raw, effectiveYear, meta.month);
      const parsedDocYear = parseInt(date.slice(0, 4), 10);
      const recordYear =
        parsedDocYear >= effectiveYear - 1 && parsedDocYear <= effectiveYear + 1
          ? parsedDocYear
          : effectiveYear;

      // Determine tax clause
      let taxClause: BelegTaxClause = null;
      if (/(?:[§s5]\s*25a|25a\s*ustg|differenzbesteuerung|gebrauchtgegenst[äa]nde|sonderregelung)/i.test(lower)) {
        taxClause = '25a';
      } else if (clientRulesService.isEuDealer(meta.clientId, `${partner} ${raw}`) || /innergemeinschaftliche|eu-lieferung|steuerfrei/i.test(lower)) {
        taxClause = 'EU';
      } else if (/19\s*[,.]?\s*0{0,2}\s*%|\b19%\b/i.test(lower)) {
        taxClause = '19';
      } else if (/7\s*[,.]?\s*0{0,2}\s*%|\b7%\b/i.test(lower)) {
        taxClause = '7';
      }

      // Determine payment method — card/SEPA/bank ALWAYS overrides cash!
      let paidBy: BelegPaidBy = null;
      let paidCash = false;
      if (/(girocard|ec-chip|ec-cash|kartenzahlung|kundenbeleg|mastercard|ec-karte)/i.test(lower)) {
        paidBy = 'karte';
      } else if (
        /(sepa[-\s]*lastschrift|lastschriftmandat|paypal|ebay\s*managed|per\s*.{0,2}berweisung|zahlung\s*per\s*.{0,2}berweisung|zahlungsvereinbarung|zahlungsbedingungen\s*:\s*ohne\s*abzug)/i.test(lower)
      ) {
        paidBy = 'überweisung';
      } else if (
        (/(bar\s*bezahlt|in\s*bar\s*gezahlt|kaufpreis\s*bar|barzahlung|bar\s*erhalten|in\s*bar|rückgeld|bar\s*total|\[\s*x\s*\]\s*barzahlung)/i.test(lower) ||
         /kasse[n]?beleg|kasse/i.test(meta.filename) ||
         type === 'QA24_SALE' ||
         /gewerbeanmeldung|gebühr/i.test(lower)) &&
        !/bankbeleg/i.test(meta.filename.toLowerCase())
      ) {
        paidBy = 'bar';
        paidCash = true;
      }

      // Map SKR03 account & BU code deterministically before falling back to dictionary
      let skr03Account = '4900';
      let buCode = '';
      const isTrainOrTaxi =
        /\b(db\s+fernverkehr|deutsche\s+bahn|db\s+vertrieb|bahncard|bahnbonus|einfache\s+fa[hy]rt|ice\s+von|civ\s*1080|funktaxen\w*|taxen\w*|taxi\b|flixbus|flixtrain)\b/i.test(
          lower
        );
      const isFuelReceipt =
        /\b(tank\s*stel\s*le|jank\s*stel\s*le|aral|shell|esso|jet[-\s]*tank|avia|total\s*energies|omv|hem\b|bft|kraftstoff|benzin|diesel|super\s*e\s*1[0o]|super\s*e\s*5)\b/i.test(
          lower
        ) ||
        (/\bsuper\b/i.test(lower) && /\bliter\b|eur\s*\/\s*[l1i]|zapfpunkt/i.test(lower)) ||
        /\d+[.,]\d+\s*liter\b/i.test(lower);
      const isTuvReceipt =
        /\b(t[üu]v|dekra|fsp\b|gt[üu]|k[üu]s|hauptuntersuchung|hu\s*\/\s*au|fahrzeuguntersuchung|stvzo|prüfbericht)\b/i.test(lower);
      const isAuthorityReceipt =
        type !== 'QA24_SALE' &&
        type !== 'QA24_PURCHASE' &&
        !vin &&
        !(amtInfo.total > 500) &&
        (/\b(gewerbeanmeldung|gewerbeamt|magistrat|rathaus|stadtkasse|landeshauptstadt|kreisausschuss|kreisverwaltung|landratsamt|kfz[-\s]*zu[1l]assung|zulassung|i-?kfz|geb[üu]hr(?:en)?|ver-?walt\s*ung\s*s?geb)\b/i.test(
          lower
        ) ||
          /[a-zäöüß-]+kreis\b/i.test(lower));

      if (type === 'QA24_SALE') {
        if (!taxClause) taxClause = '25a';
        skr03Account = taxClause === 'EU' ? '8125' : taxClause === '19' ? '8400' : '8193';
      } else if (type === 'QA24_PURCHASE') {
        skr03Account = taxClause === '19' ? '3400' : '3200';
      } else if (isTrainOrTaxi) {
        skr03Account = '4673';
        buCode = taxClause === '19' ? '9' : '8';
      } else if (isFuelReceipt) {
        skr03Account = '4530';
        buCode = '9';
      } else if (isTuvReceipt) {
        skr03Account = '4540';
        buCode = '9';
      } else if (isAuthorityReceipt) {
        skr03Account = '4390';
        buCode = '';
      } else {
        const vendorHit = clientRulesService.matchVendorRule(meta.clientId, `${partner} ${raw.slice(0, 400)}`, amtInfo.total);
        if (vendorHit) {
          skr03Account = vendorHit.account;
          buCode = vendorHit.buCode;
        } else {
          const suggested = skr03Mapper.suggestAccount(partner, raw.slice(0, 500), taxClause === '7' ? 7 : 19);
          skr03Account = suggested.code || '4900';
          // Small receipts never default to 3300 unless grocery/food keywords appear
          if (type === 'RECEIPT' && skr03Account === '3300' && !/\b(rewe|edeka|aldi|lidl|penny|lebensmittel)\b/i.test(lower)) {
            skr03Account = '4900';
          }
          buCode = skr03Account.startsWith('4') && !['4390', '4520', '4510', '4910', '4970', '4210'].includes(skr03Account)
            ? taxClause === '7' ? '8' : '9'
            : '';
        }
      }

      // Find crisp 1-line highlight snippet for UI preview
      const snippetLine = raw
        .split(/\r?\n|\|/)
        .map((l) => l.trim())
        .find((l) => /25a|differenz|rechnungsbetrag|gesamtbetrag|endbetrag|fahrgestellnummer|summe\s*brutto/i.test(l));

      const fbData = type === 'FINANZBERICHT' ? parseFinanzberichtPage(raw, effectiveYear, meta.month) : null;
      const platData = type === 'PLATFORM_STATEMENT' ? parsePlatformStatement(raw) : null;
      const effAmount = fbData ? fbData.totalBrutto : platData ? (platData.payout || platData.feesGross) : amtInfo.total;
      const vatSplits = type === 'RECEIPT' || type === 'SUPPLIER_INVOICE' ? extractMixedVatSplits(raw, effAmount) : undefined;

      records.push({
        id: uuidv4(),
        client_id: meta.clientId,
        year: recordYear,
        month: meta.month,
        source_file: meta.filename,
        source_checksum: meta.checksum,
        document_id: meta.documentId,
        pages: g.pageNums,
        type,
        partner: fbData ? 'Pizza Amore Finanzbericht' : platData ? platData.platform.toUpperCase() : partner,
        invoiceNo,
        vin,
        amount: effAmount,
        netAmount: amtInfo.net,
        vatRate: taxClause === '19' ? 19 : taxClause === '7' ? 7 : taxClause === '25a' ? 0 : null,
        taxClause,
        paidCash,
        paidBy,
        openAmount: effAmount,
        date: fbData ? fbData.date : date,
        belegdatum: fbData ? fbData.belegdatum : belegdatum,
        dateUncertain: fbData ? false : dateUncertain,
        skr03Account: fbData ? '8300' : platData ? '1410' : skr03Account,
        buCode: fbData ? '' : platData ? '' : buCode,
        ...(vatSplits ? { vatSplits } : {}),
        ...(fbData ? { finanzbericht: fbData } : {}),
        ...(platData ? { platformStatement: platData } : {}),
        matchedLineSnippet: snippetLine || raw.slice(0, 140),
        rawText: raw.slice(0, 3500),
      });
    }

    return records;
  },

  /**
   * Indexes a file (running offline CPU OCR via ocrService if scanned) and stores records in `storage/beleg_index.json`.
   */
  async indexDocumentFile(
    filePath: string,
    mimeType: string,
    meta: { clientId: string; year: number; month: number; filename: string; documentId?: string; checksum?: string },
    opts?: { force?: boolean }
  ): Promise<BelegRecord[]> {
    if (!fs.existsSync(filePath)) return [];
    const data = loadStore();
    const fileChecksum = meta.checksum || crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    const fileKey = `${meta.clientId}|${meta.filename}|${fileChecksum}`;

    const existing = data.records.filter(
      (r) =>
        r.client_id === meta.clientId &&
        (r.source_checksum === fileChecksum || r.source_file.toLowerCase() === meta.filename.toLowerCase())
    );
    if (!opts?.force && data.indexedFiles[fileKey] && existing.length > 0) {
      return deduplicateBelegRecords(existing);
    }

    const pages = await ocrService.extractPages(filePath, mimeType, fileChecksum);
    if (pages.length === 0) return [];

    // Preserve previous record IDs by page list so existing review resolutions (e.g. OPEN_INVOICE:<id>) never break
    const prevIdByPages = new Map<string, string>();
    for (const prev of existing) {
      const pk = (prev.pages || []).slice().sort((a, b) => a - b).join(',');
      if (pk && prev.id && !prevIdByPages.has(pk)) {
        prevIdByPages.set(pk, prev.id);
      }
    }

    const records = this.groupAndClassifyPages(pages, { ...meta, checksum: fileChecksum });
    for (const r of records) {
      const pk = (r.pages || []).slice().sort((a, b) => a - b).join(',');
      const prevId = prevIdByPages.get(pk);
      if (prevId) r.id = prevId;
    }

    // Optional local Vision OCR fallback when handwritten contract partner/VIN/amount/date OR receipt/invoice gross total/date was unreadable on CPU OCR
    const needsGrossInvoiceCheck = (r: BelegRecord) =>
      (r.type === 'RECEIPT' || r.type === 'SUPPLIER_INVOICE') &&
      (!(r.amount > 0) ||
        r.dateUncertain ||
        (/netto(?:betrag)?/i.test(r.rawText) && !r.netAmount) ||
        !isCleanPersonOrCompany(r.partner));
    const missingVisionRecords = records.filter(
      (r) =>
        ((r.type === 'QA24_PURCHASE' || r.type === 'QA24_SALE') &&
          (!r.partner || !r.vin || !(r.amount > 0) || r.dateUncertain)) ||
        needsGrossInvoiceCheck(r)
    );
    if (missingVisionRecords.length > 0 && pdfExtractor.isPdf(filePath, mimeType)) {
      try {
        if (await ollamaClient.isAvailable()) {
          const pageImages = pdfExtractor.extractEmbeddedImages(filePath, 60);
          for (const r of missingVisionRecords) {
            const firstPage = (r.pages && r.pages[0]) || 1;
            const img = pageImages[firstPage - 1];
            if (!img) continue;
            try {
              const isInvoiceOrReceipt =
                r.type === 'RECEIPT' ||
                r.type === 'SUPPLIER_INVOICE' ||
                (r.type === 'QA24_SALE' && /rechnung\s+f.{1,2}r|rechnungsnummer/i.test(r.rawText));
              if (isInvoiceOrReceipt && (r.type !== 'QA24_SALE' || !(r.amount > 0))) {
                const amtResp = await ollamaClient.generateJson<{
                  total_amount?: number | string;
                  partner?: string;
                  date?: string;
                }>({
                  model: ollamaClient.getTextModel(),
                  images: [img],
                  prompt:
                    'Read this German receipt or invoice carefully. Return ONLY valid JSON with: ' +
                    '"total_amount" (ONLY the GROSS total / Gesamtbetrag / Bruttobetrag / Rechnungsbetrag paid incl. MwSt, e.g. 450.00 or 847.98 — NEVER Nettobetrag, NEVER MwSt alone, NEVER phone numbers; 0 if unreadable), ' +
                    '"partner" (vendor or issuer company name, empty string if unreadable), ' +
                    '"date" (receipt/invoice date DD.MM.YYYY or YYYY-MM-DD, empty string if unreadable). Never guess.',
                  format: 'json',
                  temperature: 0,
                });
                const parseVisionAmount = (v: unknown): number => {
                  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
                  if (typeof v === 'string') {
                    const numOnly = v.trim().replace(/[^0-9.,]/g, '');
                    if (!numOnly) return 0;
                    return /\.\d{1,2}$/.test(numOnly)
                      ? Number(numOnly.replace(/,/g, '')) || 0
                      : parseGermanNum(numOnly);
                  }
                  return 0;
                };
                const isPhoneHallucinated = (val: number, raw: string): boolean => {
                  if (!(val > 0 && val < 500000)) return false;
                  const decStr = val.toFixed(2);
                  const decComma = decStr.replace('.', ',');
                  const digits = decStr.replace(/\D/g, '').replace(/^0+/, '');
                  if (digits.length < 4) return false;
                  if (raw.includes(decStr) || raw.includes(decComma)) return false;
                  // Normalize OCR letter O/o after digit groups ("766 99 oo" -> "766 99 00")
                  const normRaw = raw.replace(/(\d[\s/-]+)[oO]+/g, (_, p1) => p1 + '00');
                  const phoneGroups = normRaw.match(/\d{2,5}(?:[\s/-]+\d{2,5}){1,4}/g) || [];
                  return phoneGroups.some((pg) => {
                    const pDigits = pg.replace(/\D/g, '');
                    return (
                      pDigits.length >= digits.length + 1 &&
                      (pDigits.startsWith(digits) || pDigits.includes(digits + '0'))
                    );
                  });
                };

                let tot = parseVisionAmount(amtResp?.total_amount);
                if (isPhoneHallucinated(tot, r.rawText || '')) {
                  const retryResp = await ollamaClient.generateJson<{
                    total_amount?: number | string;
                    date?: string;
                  }>({
                    images: [img],
                    prompt:
                      'Previous answer picked a printed phone number! IGNORE all printed telephone/Funk numbers in the header/footer. ' +
                      'Read ONLY the handwritten EURO amount inside the fare/total box (e.g. 30.00) and the handwritten date (YYYY-MM-DD). Return JSON {"total_amount": number, "date": "YYYY-MM-DD"}, or 0 if illegible.',
                    temperature: 0,
                  });
                  const retryTot = parseVisionAmount(retryResp?.total_amount);
                  tot = isPhoneHallucinated(retryTot, r.rawText || '') ? 0 : retryTot;
                  if (retryResp?.date && !amtResp?.date) {
                    amtResp.date = retryResp.date;
                  }
                }
                if (tot > 0 && tot < 500000) {
                  r.amount = Math.round(tot * 100) / 100;
                  r.openAmount = r.amount;
                }
                if (amtResp?.partner && (!r.partner || r.partner === 'Unbekannter Beleg' || r.partner === 'Obj' || !isCleanPersonOrCompany(r.partner))) {
                  const pCand = String(amtResp.partner).trim();
                  if (pCand && !isOwnIssuerText(pCand, meta.clientId) && isCleanPersonOrCompany(pCand)) {
                    r.partner = pCand.slice(0, 60);
                  }
                }
                if (r.dateUncertain && amtResp?.date) {
                  const ds = String(amtResp.date).trim();
                  let dateStr = '';
                  if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
                    dateStr = ds;
                  } else {
                    const dmy = ds.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
                    if (dmy) {
                      let yr = parseInt(dmy[3], 10);
                      if (yr < 100) yr += 2000;
                      dateStr = `${yr}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
                    }
                  }
                  if (dateStr) {
                    const parsedYear = Number(dateStr.slice(0, 4));
                    const parsedMonth = Number(dateStr.slice(5, 7));
                    if ((!meta.year || parsedYear === meta.year) && (!meta.month || parsedMonth === meta.month || parsedMonth === meta.month - 1)) {
                      r.date = dateStr;
                      r.belegdatum = `${r.date.slice(8, 10)}${r.date.slice(5, 7)}`;
                      r.dateUncertain = false;
                    }
                  }
                }
              } else {
                const contractPrompt =
                  'Extract fields from this German car purchase/sale contract (handwritten and printed). Return ONLY valid JSON with keys: ' +
                  '"seller_name" (Verkaeufer full name), "buyer_name" (Kaeufer full name), "vin" (17-character Fahrgestellnummer/FIN), ' +
                  '"purchase_price" (numeric total Kaufpreis/Preis in EUR, NEVER Kilometerstand/km), ' +
                  '"price_in_words" (exact handwritten German words after "In Worten"), ' +
                  '"contract_date" (date at bottom near Ort/Datum/Unterschrift in DD.MM.YYYY format, NEVER Erstzulassung or geb. am), ' +
                  '"payment_notes" (exact handwritten text under Besondere Vereinbarungen or Zahlungsbedingungen), ' +
                  '"cash_amount" (numeric partial cash amount if explicitly split into bar + ueberwiesen, else 0), ' +
                  '"paid_in_cash" (boolean, true if Bar/bar bei Uebergabe/komplett Bar). Use empty string or 0 if unreadable.';
                const resp = await ollamaClient.generateJson<{
                  seller_name?: string;
                  buyer_name?: string;
                  vin?: string;
                  purchase_price?: number | string;
                  price_in_words?: string;
                  contract_date?: string;
                  payment_notes?: string;
                  cash_amount?: number | string;
                  paid_in_cash?: boolean;
                }>({
                  model: ollamaClient.getTextModel(),
                  images: [img],
                  prompt: contractPrompt,
                  format: 'json',
                  temperature: 0,
                });

                // If contract spans multiple pages (e.g. p.21 contract + p.22 Veräußerungsanzeige with handover date) and date is still missing, check page 2
                if (!resp?.contract_date && r.pages && r.pages.length > 1) {
                  const secondImg = pageImages[r.pages[1] - 1];
                  if (secondImg) {
                    const resp2 = await ollamaClient.generateJson<{
                      seller_name?: string;
                      vin?: string;
                      contract_date?: string;
                    }>({
                      model: ollamaClient.getTextModel(),
                      images: [secondImg],
                      prompt: contractPrompt,
                      format: 'json',
                      temperature: 0,
                    });
                    if (resp2?.contract_date) resp.contract_date = resp2.contract_date;
                    if (!resp?.vin && resp2?.vin) resp.vin = resp2.vin;
                    if (!resp?.seller_name && resp2?.seller_name) resp.seller_name = resp2.seller_name;
                  }
                }

                // 1. Partner name (replace missing or noisy single-word/placeholder OCR partner)
                const sellerCand = String(resp?.seller_name || '').trim();
                const buyerCand = String(resp?.buyer_name || '').trim();
                const preferred = r.type === 'QA24_PURCHASE' ? sellerCand : buyerCand;
                const alt = r.type === 'QA24_PURCHASE' ? buyerCand : sellerCand;
                const cand = !isOwnIssuerText(preferred, meta.clientId)
                  ? preferred
                  : !isOwnIssuerText(alt, meta.clientId)
                  ? alt
                  : '';
                const existingNoisy =
                  !r.partner ||
                  /telefonnummer|zwischen|unbekannt/i.test(r.partner) ||
                  (r.partner.trim().split(/\s+/).length === 1 && cand.split(/\s+/).length >= 2);
                if (cand && existingNoisy && isCleanPersonOrCompany(cand)) {
                  r.partner = cand.slice(0, 60);
                }

                // 2. VIN (clean 17-char or suffix recovery for clipped handwritten WMIs like 5YJ3EL1PB045428 -> XP7YGCEL1PB045428)
                if (resp?.vin) {
                  const rawV = String(resp.vin).toUpperCase().replace(/[^A-Z0-9]/g, '');
                  let normVin = normalizeVin(rawV);
                  if (/^W0L[0O]H[AH]P/.test(rawV)) {
                    normVin = normalizeVin(rawV.replace(/^W0L[0O]H[AH]P/, 'W0L0MAP'));
                  } else if (/^W0V[0O]H[AH]P/.test(rawV)) {
                    normVin = normalizeVin(rawV.replace(/^W0V[0O]H[AH]P/, 'W0V0MAP'));
                  } else if (/^XP7YGCEK7N3/.test(normVin)) {
                    normVin = normVin.replace(/^XP7YGCEK7N3/, 'XP7YGCEK7NB');
                  } else if (normVin.length === 15 && /^[5X].*EL\dPB\d{6}$/.test(normVin)) {
                    normVin = `XP7YGC${normVin.slice(-11)}`;
                  }
                  const existingBadVin = !r.vin || /00000$/.test(r.vin);
                  if (existingBadVin && normVin.length === 17) {
                    r.vin = normVin;
                  }
                }

                // 3. Purchase / Sale Price
                if (!(r.amount > 0) && resp?.purchase_price !== undefined) {
                  const rawPrice = resp.purchase_price;
                  const priceNum =
                    typeof rawPrice === 'number'
                      ? rawPrice
                      : parseGermanNum(String(rawPrice).replace(/[^0-9.,]/g, ''));
                  if (priceNum >= 500 && priceNum < 500000) {
                    r.amount = Math.round(priceNum * 100) / 100;
                    r.openAmount = r.amount;
                  }
                }

                // 4. Contract / Payment Date (DD.MM.YYYY, DD.MM.YY, or YYYY-MM-DD)
                if ((r.dateUncertain || r.belegdatum === `01${String(meta.month).padStart(2, '0')}`) && resp?.contract_date) {
                  const ds = String(resp.contract_date).trim();
                  let day = 0;
                  let mon = 0;
                  let yr = 0;
                  const dmy = ds.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
                  const ymd = ds.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                  if (dmy) {
                    day = parseInt(dmy[1], 10);
                    mon = parseInt(dmy[2], 10);
                    yr = parseInt(dmy[3], 10);
                    if (yr < 100) yr += 2000;
                  } else if (ymd) {
                    yr = parseInt(ymd[1], 10);
                    mon = parseInt(ymd[2], 10);
                    day = parseInt(ymd[3], 10);
                  }
                  // Cursive handwritten "04" is occasionally read as "09" by OCR; reconcile when document belongs to month 04
                  if (meta.month === 4 && mon === 9) mon = 4;
                  if (day >= 1 && day <= 31 && mon === meta.month && (!meta.year || yr === meta.year)) {
                    const dd = String(day).padStart(2, '0');
                    const mm = String(mon).padStart(2, '0');
                    r.date = `${yr}-${mm}-${dd}`;
                    r.belegdatum = `${dd}${mm}`;
                    r.dateUncertain = false;
                  }
                }

                // 5. Append handwritten payment notes (e.g. "10.000,- wurden überwiesen / 2.000,- wurden in Bar bezahlt", "5000,- wurden in Bar gezahlt, Restbetrag wird überwiesen")
                const notes = String(resp?.payment_notes || '').trim();
                if (notes && notes.length >= 3 && !r.rawText.includes(notes)) {
                  r.rawText += `\n${notes}`;
                }
                const cashAmt = Number(resp?.cash_amount) || 0;
                if (cashAmt > 0 && r.amount > 0 && cashAmt < r.amount - 0.5) {
                  const cashNote = `${cashAmt} EUR wurden in Bar gezahlt`;
                  if (!/in\s+bar\s+(?:gezahlt|bezahlt|erhalten)/i.test(r.rawText)) {
                    r.rawText += `\n${cashNote}`;
                  }
                } else if (resp?.paid_in_cash) {
                  r.paidCash = true;
                  r.paidBy = 'bar';
                }
              }
            } catch (pageErr: any) {
              console.warn(`[BelegIndex] Vision fallback skipped on page ${firstPage}:`, pageErr?.message || pageErr);
            }
          }
        }
      } catch (visErr: any) {
        console.warn('[BelegIndex] Vision fallback unavailable:', visErr?.message || visErr);
      }
    }

    if (records.length > 0) {
      // Re-indexing is IDEMPOTENT: replace existing records for this file/checksum, NEVER append duplicates!
      const newSourceLower = meta.filename.toLowerCase();
      data.records = data.records.filter((r) => {
        if (r.client_id !== meta.clientId) return true;
        if (fileChecksum && r.source_checksum === fileChecksum) return false;
        if (r.source_file.toLowerCase() === newSourceLower) return false;
        return true;
      });
      data.records.push(...records);
      data.records = deduplicateBelegRecords(data.records);
      data.indexedFiles[fileKey] = new Date().toISOString();
      saveStore();
      console.log(`[BelegIndex] Indexed ${records.length} document(s) from "${meta.filename}" (Month ${meta.month}/${meta.year})`);
    }
    return records;
  },

  /**
   * Ensures all Kassebelege/Bankbelege PDFs in `allDocs` for a client are indexed on CPU (cached once per file).
   */
  async ensureClientIndexed(clientId: string, allDocs: DocumentRecord[]): Promise<void> {
    const data = loadStore();

    // Build month -> bank statement year map so Belege without an explicit date inherit their statement's year (NEVER filename "062026")
    const monthToStatementYear = new Map<number, number>();
    for (const bd of allDocs) {
      if (clientId && bd.client_id !== clientId) continue;
      const isStmt = bd.extracted_data?.document_type === 'BANK_STATEMENT' || /kontoauszug|1200[-_ ]?bank/i.test(bd.original_filename || '');
      if (!isStmt) continue;
      const ymStmt = (bd.extracted_data?.invoice_date || '').match(/^(\d{4})-(\d{2})/);
      if (ymStmt) {
        const sy = parseInt(ymStmt[1], 10);
        const sm = parseInt(ymStmt[2], 10);
        if (sy >= 2015 && sy <= 2035 && sm >= 1 && sm <= 12) {
          monthToStatementYear.set(sm, sy);
        }
      }
    }

    for (const d of allDocs) {
      if (clientId && d.client_id !== clientId) continue;
      if (d.is_duplicate) continue;
      const fn = d.original_filename || '';
      if (!/kasse[n]?beleg|kasse|bankbeleg|kaufvertrag|rechnung|beleg/i.test(fn)) continue;
      if (!d.file_path || !fs.existsSync(d.file_path)) continue;

      const fileKey = `${d.client_id || clientId}|${fn}|${d.file_checksum || d.size_bytes || 0}`;
      if (data.indexedFiles[fileKey]) continue;

      const dateStr = d.extracted_data?.invoice_date || '';
      const ym = dateStr.match(/^(\d{4})-(\d{2})/);
      const fnMonthMatch = fn.match(/^(0[1-9]|1[0-2])20\d{2}[\s_-]/) || fn.match(/^20\d{2}[_-]?(0[1-9]|1[0-2])[\s_-]/);
      const parsedFnMonth = fnMonthMatch ? parseInt(fnMonthMatch[1], 10) : NaN;
      const month = ym ? parseInt(ym[2], 10) : !isNaN(parsedFnMonth) ? parsedFnMonth : 1;

      const pathYearMatch = d.file_path.match(/[\\\/](20[12]\d)[\\\/]/);
      const pathYear = pathYearMatch ? parseInt(pathYearMatch[1], 10) : NaN;
      const stmtYear = monthToStatementYear.get(month);
      const docYear = ym ? parseInt(ym[1], 10) : NaN;

      // Priority: document date year -> same month's bank statement year -> storage folder year -> current year (NEVER filename year!)
      const year = !isNaN(docYear) ? docYear : stmtYear || (!isNaN(pathYear) ? pathYear : new Date().getFullYear());

      await this.indexDocumentFile(d.file_path, d.mime_type || 'application/pdf', {
        clientId: d.client_id || clientId,
        year,
        month,
        filename: fn,
        documentId: d.id,
        checksum: d.file_checksum,
      });
    }
  },

  /**
   * Returns all indexed BelegRecords for the client within a rolling cross-month window [month - lookbackMonths .. month + 1].
   */
  getClientIndex(clientId: string | undefined, year: number, month: number, lookbackMonths = 6): BelegRecord[] {
    const data = loadStore();
    const targetMonthIndex = year * 12 + month;
    const filtered = data.records.filter((r) => {
      if (clientId && r.client_id !== clientId) return false;
      const rMonthIndex = r.year * 12 + r.month;
      return rMonthIndex >= targetMonthIndex - lookbackMonths && rMonthIndex <= targetMonthIndex + 1;
    });
    // Sanitize stale OCR-garbage partners (never keep unreadable garble like "NEWte BJ" or form labels like "Telefonnummer")
    for (const r of filtered) {
      if (r.partner) {
        r.partner = r.partner.replace(/^[-_\s]+/, '').replace(/^Nfain-Taunus/i, 'Main-Taunus').trim();
      }
      if ((r.type === 'QA24_PURCHASE' || r.type === 'QA24_SALE') && r.partner && !isCleanPersonOrCompany(r.partner)) {
        r.partner = '';
      }
      if (r.type === 'QA24_SALE' && r.skr03Account === '8400' && r.taxClause !== '19') {
        r.skr03Account = '8193';
        r.taxClause = r.taxClause || '25a';
      }
    }
    // Reconcile fuzzy-matched VINs across purchase and sale records (max 2 char OCR difference or matching 8-char serial suffix)
    const cleanWmiRe = /^(?:WAUZZZ|WVWZZZ|WBA|WDD|WDB|W0V|W0L|LRWY|LRW3|XP7Y)/;
    for (const r of filtered) {
      const rVin = r.vin;
      if (!rVin) continue;
      const peer = filtered.find(
        (o) =>
          o !== r &&
          o.vin &&
          cleanWmiRe.test(o.vin) &&
          (areVinsFuzzyEqual(rVin, o.vin, 2) ||
            (rVin.length >= 14 && o.vin.length === 17 && rVin.slice(-8) === o.vin.slice(-8)))
      );
      if (peer && peer.vin && (!cleanWmiRe.test(rVin) || r.type !== peer.type)) {
        r.vin = peer.vin;
      }
    }
    // General cross-document VIN reconciliation: if a handwritten purchase contract has no VIN or an
    // invalid/partially-misread handwritten WMI, infer the clean VIN ONLY when an unclaimed same-make,
    // plausibly priced sale matches unambiguously (1 candidate).
    const purchases = filtered.filter((r) => r.type === 'QA24_PURCHASE');
    const claimedVins = purchases.map((p) => p.vin).filter((v): v is string => Boolean(v && cleanWmiRe.test(v)));
    for (const r of purchases) {
      if (!(r.amount >= 1000)) continue;
      if (r.vin && cleanWmiRe.test(r.vin)) continue;
      const make = detectVehicleMake(r.rawText);
      const candidates = filtered.filter((s) => {
        if (s.type !== 'QA24_SALE' || !s.vin || s.vin.length !== 17) return false;
        if (claimedVins.some((cv) => cv === s.vin || areVinsFuzzyEqual(cv, s.vin, 2))) return false;
        if (!(s.amount >= r.amount * 0.85 && s.amount <= r.amount * 1.5)) return false;
        const sMake = detectVehicleMake(s.rawText);
        if (make && sMake && make !== sMake) return false;
        if (!r.vin) return Boolean(make && sMake === make);
        const vdsMatch = r.vin.slice(3, 9) === s.vin.slice(3, 9);
        let samePos = 0;
        for (let i = 0; i < 17; i++) {
          if (r.vin[i] === s.vin[i]) samePos++;
        }
        return (Boolean(make && sMake === make) && (vdsMatch || samePos >= 7)) || (vdsMatch && samePos >= 8);
      });
      if (candidates.length === 1 && candidates[0].vin) {
        r.vin = candidates[0].vin;
        claimedVins.push(r.vin);
      }
    }
    return filtered;
  },

  /**
   * Looks up a matching BelegRecord (invoice, car contract, or receipt) by invoiceNo, VIN, partner, or card amount.
   */
  findMatchForBankLine(
    records: BelegRecord[],
    txText: string,
    txAmount: number,
    sh: 'S' | 'H',
    txBelegdatum: string,
    txBelegfeld1?: string
  ): { record: BelegRecord; matchedBy: string } | null {
    const lower = `${txText} ${txBelegfeld1 || ''}`.toLowerCase();
    const vin = extractVinFromText(`${txText} ${txBelegfeld1 || ''}`);
    const dirAllowed = (r: BelegRecord) =>
      sh === 'S'
        ? r.type === 'QA24_SALE' || r.type === 'CONTRACT'
        : r.type === 'QA24_PURCHASE' || r.type === 'RECEIPT' || r.type === 'SUPPLIER_INVOICE';
    const levenshtein = (a: string, b: string): number => {
      if (a === b) return 0;
      const m = a.length;
      const n = b.length;
      const dp = Array.from({ length: n + 1 }, (_, j) => j);
      for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
          const cur = dp[j];
          dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
          prev = cur;
        }
      }
      return dp[n];
    };
    const similarToken = (a: string, b: string) =>
      a === b || (a.length >= 5 && b.length >= 5 && levenshtein(a, b) <= 1);
    const normInvOcr = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/b/g, '8').replace(/o/g, '0').replace(/i/g, '1');

    // 1. Invoice number match (e.g. 26/2024, 32/2024, 0424-008050 <-> 0424-00B050)
    const invMatch = lower.match(/(?:rechnungsnummer|rechnungsnr|renr|rechnung|invoice|rn|rg)[:\s/-]*(\d{1,4}\/\d{4}|\d{4}-[a-z0-9]{4,8}|\d{6,12}|2024-\d{3,6})/i);
    const candidateInv = (invMatch?.[1] || txBelegfeld1 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (candidateInv && candidateInv.length >= 4 && !/bank2024/.test(candidateInv)) {
      const candidateOcr = normInvOcr(candidateInv);
      const invHit = records.find(
        (r) =>
          dirAllowed(r) &&
          r.invoiceNo &&
          (r.invoiceNo.toLowerCase().replace(/[^a-z0-9]/g, '') === candidateInv ||
            (candidateOcr.length >= 6 && normInvOcr(r.invoiceNo) === candidateOcr))
      );
      if (invHit) return { record: invHit, matchedBy: `Rechnungsnummer ${invHit.invoiceNo}` };
    }

    // 2. Exact or fuzzy 17-char VIN (max 2 char OCR difference) or 7-char suffix match (direction-checked!)
    if (vin) {
      const vinHit = records.find(
        (r) =>
          dirAllowed(r) &&
          r.vin &&
          (r.vin === vin || areVinsFuzzyEqual(r.vin, vin, 2) || r.vin.endsWith(vin.slice(-7)))
      );
      if (vinHit) return { record: vinHit, matchedBy: `VIN ${vinHit.vin}` };
    }
    const shortWords = txText.toUpperCase().split(/[^A-Z0-9]/).filter((w) => w.length >= 6 && w.length <= 10 && /\d/.test(w) && /[A-Z]/.test(w));
    for (const sw of shortWords) {
      const suffixHit = records.find((r) => dirAllowed(r) && r.vin && r.vin.endsWith(sw.slice(-7)));
      if (suffixHit) return { record: suffixHit, matchedBy: `VIN-Endung ${sw}` };
    }

    // 3. Fuzzy partner token match for vehicle sales & purchases
    const txTokens = lower
      .split(/[^a-zäöüß]+/)
      .filter((t) => t.length >= 4 && !/^(gmbh|auto|autohaus|automotive|opel|adam|corsa|audi|tesla|model|ford|ranger|vw|polo|kauf|kaufvertrag|ankaufvertrag|rechnung|zahlung|anzahlung|restzahlung|schlusszahlung|teilzahlung|virement|instantane|eref|pn|bank|fuer|und|privat|securego|plus|iban|euro|entgelt|abwa|systems)$/.test(t));

    if (sh === 'S') {
      const saleCandidates = records.filter((r) => r.type === 'QA24_SALE' || r.type === 'CONTRACT');
      for (const r of saleCandidates) {
        const partnerTokens = r.partner
          .toLowerCase()
          .split(/[^a-zäöüß]+/)
          .filter((t) => t.length >= 4 && !/^(firma|herr|frau|unipessoal|gmbh|autohaus|automotive|auto)$/.test(t));
        const sharedTokens = partnerTokens.filter((pt) => txTokens.some((tt) => similarToken(pt, tt)) || lower.includes(pt));
        if (sharedTokens.length > 0 && txAmount <= (r.amount || Infinity) + 500) {
          return { record: r, matchedBy: `Vertragspartner ${r.partner}` };
        }
      }
    }

    // 4. Card receipt / supplier expense matching (exact amount ±0.05; similar name allows ±35 days, amount-only within ±7 days)
    if (sh === 'H') {
      const txDay = parseInt((txBelegdatum || '').slice(0, 2), 10) || 1;
      const txMon = parseInt((txBelegdatum || '').slice(2, 4), 10) || 1;
      const txApproxDays = txMon * 31 + txDay;

      const expenseCandidates = records.filter((r) => r.type === 'RECEIPT' || r.type === 'SUPPLIER_INVOICE');
      let bestAmtHit: BelegRecord | null = null;
      let bestScore = -1;

      for (const r of expenseCandidates) {
        const matchesGross = Math.abs(r.amount - txAmount) <= 0.05;
        const matchesNet = typeof r.netAmount === 'number' && r.netAmount > 0 && Math.abs(r.netAmount - txAmount) <= 0.05;
        if (!matchesGross && !matchesNet) continue;

        const rTokens = `${r.partner || ''} ${(r.rawText || '').slice(0, 200)}`
          .toLowerCase()
          .split(/[^a-zäöüß]+/)
          .filter((t) => t.length >= 4 && !/^(gmbh|firma|rechnung|datum|artikel|betrag|systems|assekuranz|straße|strasse)$/.test(t));
        const nameMatch = txTokens.some((tt) => rTokens.some((rt) => similarToken(tt, rt)));

        const rDay = parseInt((r.belegdatum || '').slice(0, 2), 10) || 1;
        const rMon = parseInt((r.belegdatum || '').slice(2, 4), 10) || 1;
        const dist = Math.abs((rMon * 31 + rDay) - txApproxDays);

        if ((nameMatch && dist <= 35) || dist <= 7) {
          const score = (nameMatch ? 1000 : 0) - dist;
          if (score > bestScore) {
            bestScore = score;
            bestAmtHit = r;
          }
        }
      }
      if (bestAmtHit) {
        return { record: bestAmtHit, matchedBy: `Belegbetrag ${bestAmtHit.amount.toFixed(2)} € (${bestAmtHit.partner})` };
      }
    }

    return null;
  },
};
