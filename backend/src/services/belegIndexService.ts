import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ocrService, OcrPage } from './ocrService.js';
import { clientRulesService } from './clientRulesService.js';
import { skr03Mapper } from './skr03Mapper.js';
import { DocumentRecord } from '../types/document.js';

export type BelegRecordType =
  | 'QA24_SALE'
  | 'QA24_PURCHASE'
  | 'SUPPLIER_INVOICE'
  | 'RECEIPT'
  | 'CONTRACT'
  | 'OTHER';

export type BelegTaxClause = '25a' | '19' | '7' | 'EU' | null;
export type BelegPaidBy = 'bar' | 'überweisung' | 'karte' | null;

export interface BelegRecord {
  id: string;
  client_id: string;
  year: number;
  month: number;
  source_file: string;
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
  skr03Account: string;
  buCode: string;
  matchedLineSnippet?: string;
  rawText: string;
}

const STORAGE_DIR = path.resolve(process.cwd(), '../storage');
const BELEG_INDEX_FILE = path.join(STORAGE_DIR, 'beleg_index.json');

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
          records: parsed.records,
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
    fs.writeFileSync(BELEG_INDEX_FILE, JSON.stringify(loadStore(), null, 2), 'utf-8');
  } catch (e: any) {
    console.warn('[BelegIndex] Failed to persist index:', e?.message);
  }
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
    const cleaned = labelMatch[1]
      .replace(/[\s-]/g, '')
      .slice(0, 17)
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .replace(/Q/g, '0');
    if (isPlausibleVin(cleaned) && /^[A-HJ-NPR-Z0-9]{11}\d{4,6}$/.test(cleaned)) {
      return cleaned;
    }
  }

  // Fallback: scan any 17-char sequence ending in 5-6 digits (tolerates glued text like ...52639ZAHLUNG, blocks trailing digits)
  // Note: ISO 3779 WMI first char can be a letter OR digit 1-5, 7 (e.g. Tesla Fremont 5YJ, Austin 7SA)
  const directMatches = upper.matchAll(/(?<![A-Z0-9])([A-HJ-NPR-Z1-57][A-HJ-NPR-Z]{1,2}[A-HJ-NPR-Z0-9]{8,9}\d{5,6})(?![0-9])/g);
  for (const m of directMatches) {
    const candidate = m[1].slice(0, 17);
    if (isPlausibleVin(candidate)) {
      return candidate;
    }
  }

  // Normalized OCR scan (allow O/I in first 11 chars if followed by 6 digits and not followed by more digits)
  const ocrMatches = upper.matchAll(/(?<![A-Z0-9])([A-Z0-9]{11}\d{6})(?![0-9])/g);
  for (const m of ocrMatches) {
    const norm = m[1].replace(/O/g, '0').replace(/I/g, '1').replace(/Q/g, '0');
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
  ];
  return candidates.some((c) => cleanText.includes(c));
}

function extractDateFromText(text: string, fallbackYear: number, fallbackMonth: number): { iso: string; belegdatum: string } {
  const mPadded = String(fallbackMonth).padStart(2, '0');
  const monthRegex = new RegExp(`(\\d{1,2})[.,/]\\s*(0?${fallbackMonth})[.,/\\s]*(202[0-9]|902[0-9]|24|25|26)\\b`, 'i');
  const preferredMatch = text.match(monthRegex);
  const anyDateMatch =
    preferredMatch ||
    text.match(/(?:Datum|Belegdatum|Rechnungsdatum|den)[^0-9]{0,12}(\d{1,2})[.,/\s]+(\d{2})[.,/\s]*(20\d{2}|\d{2})\b/i) ||
    text.match(/\b(0?[1-9]|[12]\d|3[01])[.](0?[1-9]|1[0-2])[.](202\d|902\d|\d{2})\b/);

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
  return { iso: `${fallbackYear}-${mPadded}-28`, belegdatum: `28${mPadded}` };
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
  // Priority 2: Standard supplier invoice numbers
  const stdInv = text.match(/(?:Rechnungs-?Nr\.?|Rechnung\s*Nr\.?|Rechnung•?|Beleg-?Nr\.?|Rg\.?-?Nummer|Nummer)\s*[:.#|]*\s*([A-Za-z0-9][A-Za-z0-9./-]{3,24})/i);
  if (stdInv) {
    const val = stdInv[1].trim();
    if (/\d/.test(val) && !/^(bitte|vom|zum|zur|der|die|das)$/i.test(val)) return val;
  }
  return null;
}

function extractAmount(text: string): { total: number; net?: number; vatRate?: number | null } {
  // Normalize OCR "OO" -> "00" after comma and clean spaces around comma
  const normalized = text
    .replace(/(\d+),[ \t]*[Oo]{2}/g, '$1,00')
    .replace(/(\d+)[.,][ \t]+(\d{2})\b/g, '$1,$2')
    .replace(/(\d+\.\d{3})[.,](\d{2})/g, '$1,$2');

  // 1. Explicit Brutto / Endbetrag labels (strictly prioritized over Netto!)
  const bruttoPatterns = [
    /(?:Rechnungsendbetrag|Gesamtbetrag|Endbetrag|Gesamtforderung|Rechnungsbetrag|Summe\s*Brutto|GESAMT\s*BRUTTO|Bar\s*Total|GESAMT)\s*[:|EUR\s]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /(?:Kaufpreis|Preis)\s*[:|\s]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:EUR|€)/i,
    /\bTOTAL\b\s*[:|EUR\s]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/i,
  ];
  for (const re of bruttoPatterns) {
    const m = normalized.match(re);
    if (m) {
      const val = parseGermanNum(m[1]);
      if (val > 0 && val < 500000) return { total: val };
    }
  }

  // 2. Collect all EUR amounts on tabular/WinRT multi-line pages
  const allMatches = [...normalized.matchAll(/(?:^|[\s|:*])(\d{1,3}(?:\.\d{3})*,\d{2})(?=\s*(?:EUR|€|A|B|ECR|\||$))/gim)]
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
    // Otherwise highest plausible currency amount in the document (validated in text)
    const maxVal = Math.max(...allMatches);
    if (maxVal > 0 && amountExistsInText(maxVal, normalized)) {
      return { total: maxVal };
    }
  }

  // 3. Car price printed without comma decimals e.g. "53000 €" or "25.890,00"
  const largeCur = normalized.match(/\b(\d{4,5})\s*(?:EUR|€|c\b)/i);
  if (largeCur) {
    const v = parseInt(largeCur[1], 10);
    if (v >= 1000 && v <= 200000) return { total: v };
  }

  return { total: 0 };
}

function extractPartner(text: string, type: BelegRecordType, clientId?: string): string {
  const lines = text
    .split(/\r?\n|\|/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);

  const settings = clientRulesService.getClientSettings(clientId);
  const ownLower = (settings.company_name || '')
    .toLowerCase()
    .replace(/\s*(?:gmbh|ug|ag|kg|ohg)\b/gi, '')
    .trim();
  const ownKeywords = (settings.own_issuer_keywords || []).map((k) => k.toLowerCase());

  const isOwnOrNoise = (line: string): boolean => {
    const l = line.toLowerCase();
    if (ownLower && ownLower.length >= 3 && l.includes(ownLower)) return true;
    if (ownKeywords.some((k) => k.length >= 3 && l.includes(k))) return true;
    return (
      l.includes('iban') ||
      l.includes('bic:') ||
      l.includes('tele:') ||
      l.includes('tel.:') ||
      l.includes('fax:') ||
      l.includes('www.') ||
      l.includes('rechnungsnummer') ||
      l.includes('kaufvertrag') ||
      l.includes('ankaufvertrag')
    );
  };

  if (type === 'QA24_SALE' || type === 'QA24_PURCHASE') {
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const line = lines[i];
      if (/^(kaufvertrag|ankaufvertrag|rechnung für|rechnungsnummer)/i.test(line)) break;
      if (isOwnOrNoise(line)) continue;
      if (/^(?:Marke|Modell|Erstzulassung|\d{5}\s+)/i.test(line)) continue;
      if (/[a-zäöüß]{3,}/i.test(line) && !/^\d+$/.test(line)) {
        return line.replace(/^Firma\s+/i, '').slice(0, 60);
      }
    }
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

function classifyBelegPage(rawText: string, filename: string, clientId?: string): BelegRecordType {
  const lower = rawText.toLowerCase();
  const settings = clientRulesService.getClientSettings(clientId);
  const ownLower = (settings.company_name || '')
    .toLowerCase()
    .replace(/\s*(?:gmbh|ug|ag|kg|ohg)\b/gi, '')
    .trim();
  const ownKeywords = (settings.own_issuer_keywords || []).map((k) => k.toLowerCase());
  const isOwnIssuer =
    (ownLower.length >= 3 && lower.includes(ownLower)) ||
    ownKeywords.some((k) => k.length >= 3 && lower.includes(k));

  if (/ankaufvertrag|verbindliche\s+bestellung/i.test(lower)) {
    return 'QA24_PURCHASE';
  }
  if (isOwnIssuer && /(?:kaufvertrag\s+für|rechnung\s+für\s+den\s+(?:ver)?kauf|verkauf\s+nach\s+[§s5]?\s*25a)/i.test(lower)) {
    return 'QA24_SALE';
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
  if (/(?:girocard|ec-chip|kundenbeleg|tankstelle|super\s*fuel|super\s*e10|diesel|einzahlquittung|kassenbon|summe\s+ec-cash|mastercard)/i.test(lower)) {
    return 'RECEIPT';
  }
  if (/rechnung|rechnungs-?nr|rechnungsdatum|invoice/i.test(lower)) {
    return 'SUPPLIER_INVOICE';
  }
  if (/kaufvertrag/i.test(lower)) {
    return 'QA24_SALE';
  }
  if (/bankbeleg|kassebeleg/i.test(filename.toLowerCase())) {
    return 'RECEIPT';
  }
  return 'OTHER';
}

function isContinuationPage(pageText: string, prevText: string, pageNum: number): boolean {
  const lower = pageText.toLowerCase();
  // AGB / Terms & Conditions page 2 of car contract
  if (
    /verkürzung\s+der\s+verj[äa]hrungsfrist|akzeptiert\s+der\s+käufer\s+bedingungen|eigentum\s+des\s+verkäufers\s+bleibt|mit\s+seiner\s+unterschrift\s+akzeptiert/i.test(lower) &&
    !/kaufpreis\s*:|rechnungsbetrag|fahrgestellnummer/i.test(lower)
  ) {
    return true;
  }
  // Multi-page invoice page 2 of 2 (e.g. G+K Eschborn, Avalon Premium Cars, Vattenfall Rückseite)
  if (/seite\s*2\s*von\s*2|blatt\s*2\b|\bübertrag\b/i.test(lower) && !/seite\s*1\s*von/i.test(lower)) {
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

export const belegIndexService = {
  /**
   * Groups multi-page scanned bundles (merges AGB/terms & Blatt 2 pages with page 1)
   * and parses deterministic BelegRecord entries verified against the raw OCR text.
   */
  groupAndClassifyPages(
    pages: OcrPage[],
    meta: { clientId: string; year: number; month: number; filename: string; documentId?: string }
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
    const yearCounts = new Map<number, number>();
    for (const g of groups) {
      for (const ymMatch of g.rawText.matchAll(/\b(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](20\d{2})\b/g)) {
        const y = parseInt(ymMatch[1], 10);
        if (y >= 2015 && y <= 2035) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
      }
    }
    let effectiveYear = meta.year;
    let bestCount = 0;
    for (const [y, cnt] of yearCounts.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        effectiveYear = y;
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
      const { iso: date, belegdatum } = extractDateFromText(raw, effectiveYear, meta.month);
      const parsedDocYear = parseInt(date.slice(0, 4), 10);
      const recordYear = parsedDocYear >= 2000 && parsedDocYear <= 2100 ? parsedDocYear : effectiveYear;

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
      } else if (/(sepa[-\s]*lastschrift|lastschriftmandat|paypal|ebay\s*managed|überwiesen|ueberwiesen|per\s*überweisung)/i.test(lower)) {
        paidBy = 'überweisung';
      } else if (
        /(bar\s*bezahlt|in\s*bar\s*gezahlt|kaufpreis\s*bar|barzahlung|bar\s*erhalten|rückgeld|bar\s*total|\[\s*x\s*\]\s*barzahlung)/i.test(lower) &&
        !/bankbeleg/i.test(meta.filename.toLowerCase())
      ) {
        paidBy = 'bar';
        paidCash = true;
      }

      // Map SKR03 account & BU code
      let skr03Account = '4900';
      let buCode = '';
      if (type === 'QA24_SALE') {
        skr03Account = taxClause === '25a' ? '8193' : taxClause === 'EU' ? '8125' : '8400';
      } else if (type === 'QA24_PURCHASE') {
        skr03Account = taxClause === '19' ? '3400' : '3200';
      } else {
        const vendorHit = clientRulesService.matchVendorRule(meta.clientId, `${partner} ${raw.slice(0, 400)}`, amtInfo.total);
        if (vendorHit) {
          skr03Account = vendorHit.account;
          buCode = vendorHit.buCode;
        } else {
          const suggested = skr03Mapper.suggestAccount(partner, raw.slice(0, 500), taxClause === '7' ? 7 : 19);
          skr03Account = suggested.code || '4900';
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

      records.push({
        id: uuidv4(),
        client_id: meta.clientId,
        year: recordYear,
        month: meta.month,
        source_file: meta.filename,
        document_id: meta.documentId,
        pages: g.pageNums,
        type,
        partner,
        invoiceNo,
        vin,
        amount: amtInfo.total,
        netAmount: amtInfo.net,
        vatRate: taxClause === '19' ? 19 : taxClause === '7' ? 7 : taxClause === '25a' ? 0 : null,
        taxClause,
        paidCash,
        paidBy,
        openAmount: amtInfo.total,
        date,
        belegdatum,
        skr03Account,
        buCode,
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
    meta: { clientId: string; year: number; month: number; filename: string; documentId?: string; checksum?: string }
  ): Promise<BelegRecord[]> {
    if (!fs.existsSync(filePath)) return [];
    const data = loadStore();
    const fileKey = `${meta.clientId}|${meta.filename}|${meta.checksum || fs.statSync(filePath).size}`;
    if (data.indexedFiles[fileKey]) {
      return data.records.filter(
        (r) => r.client_id === meta.clientId && r.source_file === meta.filename
      );
    }

    const pages = await ocrService.extractPages(filePath, mimeType, meta.checksum);
    if (pages.length === 0) return [];

    const records = this.groupAndClassifyPages(pages, meta);
    if (records.length > 0) {
      // Remove any stale records for the exact same filename + client before saving
      data.records = data.records.filter(
        (r) => !(r.client_id === meta.clientId && r.source_file === meta.filename)
      );
      data.records.push(...records);
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
    for (const d of allDocs) {
      if (clientId && d.client_id !== clientId) continue;
      if (d.is_duplicate) continue;
      const fn = d.original_filename || '';
      if (!/kassebeleg|bankbeleg|kaufvertrag|rechnung|beleg/i.test(fn)) continue;
      if (!d.file_path || !fs.existsSync(d.file_path)) continue;

      const fileKey = `${d.client_id || clientId}|${fn}|${d.file_checksum || d.size_bytes || 0}`;
      if (data.indexedFiles[fileKey]) continue;

      const dateStr = d.extracted_data?.invoice_date || '';
      const ym = dateStr.match(/^(\d{4})-(\d{2})/);
      const fnYm = fn.match(/(\d{2})(20\d{2})/) || fn.match(/(20\d{2})[-_](\d{2})/);
      const parsedFnYear = fnYm ? parseInt(fnYm[1].length === 4 ? fnYm[1] : fnYm[2], 10) : NaN;
      const parsedFnMonth = fnYm ? parseInt(fnYm[1].length === 4 ? fnYm[2] : fnYm[1], 10) : NaN;
      const year = ym ? parseInt(ym[1], 10) : !isNaN(parsedFnYear) ? parsedFnYear : new Date().getFullYear();
      const month = ym ? parseInt(ym[2], 10) : !isNaN(parsedFnMonth) ? parsedFnMonth : 1;

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
    return data.records.filter((r) => {
      if (clientId && r.client_id !== clientId) return false;
      const rMonthIndex = r.year * 12 + r.month;
      return rMonthIndex >= targetMonthIndex - lookbackMonths && rMonthIndex <= targetMonthIndex + 1;
    });
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

    // 1. Invoice number match (e.g. 26/2024, 32/2024, 54/2024, 3730701540)
    const invMatch = lower.match(/(?:rechnungsnummer|rechnungsnr|renr|rechnung|invoice|rn|rg)[:\s/-]*(\d{1,4}\/\d{4}|\d{6,12}|2024-\d{3,6})/i);
    const candidateInv = (invMatch?.[1] || txBelegfeld1 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (candidateInv && candidateInv.length >= 4 && !/bank2024/.test(candidateInv)) {
      const invHit = records.find(
        (r) => r.invoiceNo && r.invoiceNo.toLowerCase().replace(/[^a-z0-9]/g, '') === candidateInv
      );
      if (invHit) return { record: invHit, matchedBy: `Rechnungsnummer ${invHit.invoiceNo}` };
    }

    // 2. Exact 17-char VIN or 7-char suffix match
    if (vin) {
      const vinHit = records.find(
        (r) => r.vin && (r.vin === vin || r.vin.endsWith(vin.slice(-7)))
      );
      if (vinHit) return { record: vinHit, matchedBy: `VIN ${vinHit.vin}` };
    }
    const shortWords = txText.toUpperCase().split(/[^A-Z0-9]/).filter((w) => w.length >= 6 && w.length <= 10 && /\d/.test(w) && /[A-Z]/.test(w));
    for (const sw of shortWords) {
      const suffixHit = records.find((r) => r.vin && r.vin.endsWith(sw.slice(-7)));
      if (suffixHit) return { record: suffixHit, matchedBy: `VIN-Endung ${sw}` };
    }

    // 3. Fuzzy partner token match for vehicle sales & purchases
    const txTokens = lower
      .split(/[^a-zäöüß]+/)
      .filter((t) => t.length >= 4 && !/^(gmbh|auto|opel|adam|corsa|audi|tesla|model|ford|ranger|vw|polo|kauf|kaufvertrag|ankaufvertrag|rechnung|zahlung|anzahlung|restzahlung|schlusszahlung|virement|instantane|eref|pn|bank|fuer|und|privat|securego|plus|iban|euro|entgelt)$/.test(t));

    if (sh === 'S') {
      const saleCandidates = records.filter((r) => r.type === 'QA24_SALE' || r.type === 'CONTRACT');
      for (const r of saleCandidates) {
        const partnerTokens = r.partner
          .toLowerCase()
          .split(/[^a-zäöüß]+/)
          .filter((t) => t.length >= 4 && !/^(firma|herr|frau|unipessoal|gmbh)$/.test(t));
        const sharedTokens = partnerTokens.filter((pt) => txTokens.includes(pt) || lower.includes(pt));
        if (sharedTokens.length > 0 && txAmount <= (r.amount || Infinity) + 500) {
          return { record: r, matchedBy: `Vertragspartner ${r.partner}` };
        }
      }
    }

    // 4. Card receipt / supplier expense matching (amount exact ±0.05 and date ±7 days)
    if (sh === 'H') {
      const txDay = parseInt((txBelegdatum || '').slice(0, 2), 10) || 1;
      const txMon = parseInt((txBelegdatum || '').slice(2, 4), 10) || 1;
      const txApproxDays = txMon * 31 + txDay;

      const expenseCandidates = records.filter((r) => r.type === 'RECEIPT' || r.type === 'SUPPLIER_INVOICE');
      let bestAmtHit: BelegRecord | null = null;
      let bestDist = 999;

      for (const r of expenseCandidates) {
        const matchesGross = Math.abs(r.amount - txAmount) <= 0.05;
        const matchesNet = typeof r.netAmount === 'number' && r.netAmount > 0 && Math.abs(r.netAmount - txAmount) <= 0.05;
        if (!matchesGross && !matchesNet) continue;
        const rDay = parseInt((r.belegdatum || '').slice(0, 2), 10) || 1;
        const rMon = parseInt((r.belegdatum || '').slice(2, 4), 10) || 1;
        const dist = Math.abs((rMon * 31 + rDay) - txApproxDays);
        if (dist <= 7 && dist < bestDist) {
          bestDist = dist;
          bestAmtHit = r;
        }
      }
      if (bestAmtHit) {
        return { record: bestAmtHit, matchedBy: `Belegbetrag ${bestAmtHit.amount.toFixed(2)} € (${bestAmtHit.partner})` };
      }
    }

    return null;
  },
};
