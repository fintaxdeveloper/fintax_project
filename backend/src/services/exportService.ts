import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { DocumentRecord, BookingItem } from '../types/document.js';
import { skr03Mapper } from './skr03Mapper.js';
import { googleDriveService } from './googleDriveService.js';
import { clientFolderService } from './clientFolderService.js';
import { monthlyDocumentRegistry } from './monthlyDocumentRegistry.js';
import { generatePersonenkontenCsvContent, generateSachkontenCsvContent } from './datevExtfTemplates.js';
import {
  reviewService,
  ReviewReport,
  MaterializedDecision,
  LineResolutionTarget,
  parseDatevExtfCsv,
} from './reviewService.js';
import { clientRulesService } from './clientRulesService.js';
import { belegIndexService, extractVinFromText, areVinsFuzzyEqual } from './belegIndexService.js';
import {
  ruleEngine,
  priorCapitalBooked,
  extractAllVins,
  extractPayeePrefix,
  normalizeKey,
  RuleDecision,
  MonthLinks,
} from './ruleEngine.js';
import { monthLockService } from './monthLockService.js';
import { dbService } from './dbService.js';

// Exact 124 columns for Agenda & DATEV EXTF format (Buchungsstapel Version 700 / 12)
const EXTF_COLUMNS = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basis-Umsatz',
  'WKZ Basis-Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
  'Postensperre',
  'Diverse Adressnummer',
  'Geschäftspartnerbank',
  'Sachverhalt',
  'Zinssperre',
  'Beleglink',
  'Beleginfo - Art 1',
  'Beleginfo - Inhalt 1',
  'Beleginfo - Art 2',
  'Beleginfo - Inhalt 2',
  'Beleginfo - Art 3',
  'Beleginfo - Inhalt 3',
  'Beleginfo - Art 4',
  'Beleginfo - Inhalt 4',
  'Beleginfo - Art 5',
  'Beleginfo - Inhalt 5',
  'Beleginfo - Art 6',
  'Beleginfo - Inhalt 6',
  'Beleginfo - Art 7',
  'Beleginfo - Inhalt 7',
  'Beleginfo - Art 8',
  'Beleginfo - Inhalt 8',
  'KOST1 - Kostenstelle',
  'KOST2 - Kostenstelle',
  'Kost-Menge',
  'EU-Land u. UStID (Bestimmung)',
  'EU-Steuersatz (Bestimmung)',
  'Abw. Versteuerungsart',
  'Sachverhalt L+L',
  'Funktionsergänzung L+L',
  'BU 49 Hauptfunktionstyp',
  'BU 49 Hauptfunktionsnummer',
  'BU 49 Funktionsergänzung',
  'Zusatzinformation - Art 1',
  'Zusatzinformation- Inhalt 1',
  'Zusatzinformation - Art 2',
  'Zusatzinformation- Inhalt 2',
  'Zusatzinformation - Art 3',
  'Zusatzinformation- Inhalt 3',
  'Zusatzinformation - Art 4',
  'Zusatzinformation- Inhalt 4',
  'Zusatzinformation - Art 5',
  'Zusatzinformation- Inhalt 5',
  'Zusatzinformation - Art 6',
  'Zusatzinformation- Inhalt 6',
  'Zusatzinformation - Art 7',
  'Zusatzinformation- Inhalt 7',
  'Zusatzinformation - Art 8',
  'Zusatzinformation- Inhalt 8',
  'Zusatzinformation - Art 9',
  'Zusatzinformation- Inhalt 9',
  'Zusatzinformation - Art 10',
  'Zusatzinformation- Inhalt 10',
  'Zusatzinformation - Art 11',
  'Zusatzinformation- Inhalt 11',
  'Zusatzinformation - Art 12',
  'Zusatzinformation- Inhalt 12',
  'Zusatzinformation - Art 13',
  'Zusatzinformation- Inhalt 13',
  'Zusatzinformation - Art 14',
  'Zusatzinformation- Inhalt 14',
  'Zusatzinformation - Art 15',
  'Zusatzinformation- Inhalt 15',
  'Zusatzinformation - Art 16',
  'Zusatzinformation- Inhalt 16',
  'Zusatzinformation - Art 17',
  'Zusatzinformation- Inhalt 17',
  'Zusatzinformation - Art 18',
  'Zusatzinformation- Inhalt 18',
  'Zusatzinformation - Art 19',
  'Zusatzinformation- Inhalt 19',
  'Zusatzinformation - Art 20',
  'Zusatzinformation- Inhalt 20',
  'Stück',
  'Gewicht',
  'Zahlweise',
  'Forderungsart',
  'Veranlagungsjahr',
  'Zugeordnete Fälligkeit',
  'Skontotyp',
  'Auftragsnummer',
  'Buchungstyp',
  'USt-Schlüssel (Anzahlungen)',
  'EU-Land (Anzahlungen)',
  'Sachverhalt L+L (Anzahlungen)',
  'EU-Steuersatz (Anzahlungen)',
  'Erlöskonto (Anzahlungen)',
  'Herkunft-Kz',
  'Buchungs GUID',
  'KOST-Datum',
  'SEPA-Mandatsreferenz',
  'Skontosperre',
  'Gesellschaftername',
  'Beteiligtennummer',
  'Identifikationsnummer',
  'Zeichnernummer',
  'Postensperre bis',
  'Bezeichnung SoBil-Sachverhalt',
  'Kennzeichen SoBil-Buchung',
  'Festschreibung',
  'Leistungsdatum',
  'Datum Zuord. Steuerperiode',
  'Fälligkeit',
  'Generalumkehr (GU)',
  'Steuersatz',
  'Land',
  'Abrechnungsreferenz',
  'BVV-Position',
  'EU-Land u. UStID (Ursprung)',
  'EU-Steuersatz (Ursprung)',
];

// Indices of empty fields that MUST be unquoted in Agenda/DATEV EXTF
const UNQUOTED_EMPTY_INDICES = new Set([
  3, 4, 12, 14, 16, 17, 18, 38, 40, 42, 43, 44, 45, 46,
  87, 88, 89, 91, 92, 93, 96, 98, 99, 100, 103, 105, 107,
  110, 112, 114, 115, 116, 118, 121, 123
]);

export const exportService = {
  getExportDir(): string {
    const candidates = [
      ...(process.env.FINTAX_STORAGE_DIR ? [path.resolve(process.env.FINTAX_STORAGE_DIR, 'exports')] : []),
      path.resolve(process.cwd(), 'fintax_project-main/storage/exports'),
      path.resolve(process.cwd(), 'storage/exports'),
      path.resolve(process.cwd(), '../storage/exports'),
      path.resolve(process.cwd(), '../../storage/exports'),
    ];
    for (const d of candidates) {
      if (fs.existsSync(d) || fs.existsSync(path.dirname(d))) return d;
    }
    return candidates[1] || path.resolve(process.cwd(), 'storage/exports');
  },

  /**
   * Helper to format any number to German comma decimal (e.g. 2110 or 5,77)
   */
  formatAmount(val: number): string {
    const rounded = Math.round(val * 100) / 100;
    return Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(2).replace('.', ',');
  },

  /**
   * Helper to parse and convert any date string (German, English, ISO) into DDMM
   */
  parseBelegdatum(dateStr: string | undefined): string {
    if (!dateStr) {
      const now = new Date();
      return `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    const s = String(dateStr).trim();

    // Range like "02.02.2026 - 28.02.2026" -> take end date
    if (s.includes(' - ') || s.includes(' bis ')) {
      const parts = s.split(/\s*-\s*|\s*bis\s*/);
      if (parts.length > 1) {
        return this.parseBelegdatum(parts[parts.length - 1]);
      }
    }

    // English month names: "05 Aug 2024" or "Aug 05, 2024" or "5 August 2024"
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', mai: '05',
      jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', okt: '10',
      nov: '11', dec: '12', dez: '12',
    };
    const engMatch1 = s.match(/(\d{1,2})[\s\-]+([a-zA-Z]{3,9})[\s,]+(\d{4})/);
    if (engMatch1) {
      const day = engMatch1[1].padStart(2, '0');
      const mStr = engMatch1[2].toLowerCase().substring(0, 3);
      const month = months[mStr] || '01';
      return `${day}${month}`;
    }
    const engMatch2 = s.match(/([a-zA-Z]{3,9})[\s\-]+(\d{1,2})[\s,]+(\d{4})/);
    if (engMatch2) {
      const mStr = engMatch2[1].toLowerCase().substring(0, 3);
      const day = engMatch2[2].padStart(2, '0');
      const month = months[mStr] || '01';
      return `${day}${month}`;
    }

    // ISO format: "YYYY-MM-DD"
    const isoMatch = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[3].padStart(2, '0')}${isoMatch[2].padStart(2, '0')}`;
    }

    // German format: "DD.MM.YYYY" or "DD.MM"
    const germanMatch = s.match(/(\d{1,2})\.(\d{1,2})(?:\.\d{2,4})?/);
    if (germanMatch) {
      return `${germanMatch[1].padStart(2, '0')}${germanMatch[2].padStart(2, '0')}`;
    }

    // Raw 4 digits: "0508" or "2802"
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 4) {
      return digits.slice(-4);
    }

    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`;
  },

  /**
   * Builds a single 124-field row directly from a BookingItem
   */
  buildRowFromItem(item: BookingItem): string {
    const fields = new Array(124);
    for (let i = 0; i < 124; i++) {
      if (UNQUOTED_EMPTY_INDICES.has(i)) {
        fields[i] = '';
      } else {
        fields[i] = '""';
      }
    }

    const formattedAmount = this.formatAmount(item.amount);
    const shKey = `"${item.sh}"`;
    const buCode = item.buCode ? `"${item.buCode.replace(/"/g, '')}"` : '""';
    const belegdatum = this.parseBelegdatum(item.belegdatum);
    const rawInvNum = item.belegfeld1 ? String(item.belegfeld1).replace(/[;"\r\n]/g, '').trim() : '';
    const belegfeld1 = rawInvNum ? `"${rawInvNum.substring(0, 36)}"` : '""';
    const rawText = (item.buchungstext || 'Beleg').replace(/[;"\r\n]/g, '').trim();
    const buchungstext = `"${rawText.substring(0, 60)}"`;

    fields[0] = formattedAmount;   // Umsatz (ohne Soll/Haben-Kz)
    fields[1] = shKey;             // Soll/Haben-Kennzeichen ("S" or "H")
    if (item.currency && item.currency.toUpperCase() !== 'EUR') {
      fields[2] = `"${item.currency.toUpperCase()}"`; // WKZ Umsatz
    }
    fields[6] = item.konto;        // Konto (1000 or 1200)
    let gegenkonto = item.gegenkonto;
    if (gegenkonto === item.konto || ['1000', '1200'].includes(gegenkonto)) {
      gegenkonto = item.sh === 'S' ? '8400' : '4900';
    }
    fields[7] = gegenkonto;        // Gegenkonto (SKR03 Account)
    fields[8] = buCode;            // BU-Schlüssel ("9", "8", or "")
    fields[9] = belegdatum;        // Belegdatum (DDMM)
    fields[10] = belegfeld1;       // Belegfeld 1
    fields[13] = buchungstext;     // Buchungstext
    fields[113] = '0';             // Festschreibung (0 = Offen)

    return fields.join(';');
  },

  /**
   * Builds one or more 124-field rows from a DocumentRecord.
   * If document contains multiple bookings (e.g. 7% + 19% split or multi-receipts), returns each row.
   */
  buildBookingRows(doc: DocumentRecord): string[] {
    const data = doc.extracted_data;
    if (data?.bookings && data.bookings.length > 0) {
      return data.bookings
        .filter((b) => Number(b.amount) > 0)
        .map((b) => this.buildRowFromItem(b));
    }
    const single = this.buildBookingRow(doc);
    return single ? [single] : [];
  },

  /**
   * Builds a single 124-field row conforming exactly to DATEV EXTF Buchungsstapel format
   */
  buildBookingRow(doc: DocumentRecord): string | null {
    const data = doc.extracted_data || {
      document_type: 'PURCHASE_INVOICE',
      supplier_name: doc.original_filename || 'Beleg',
      invoice_number: 'BELEG-001',
      invoice_date: new Date().toISOString().split('T')[0],
      currency: 'EUR',
      net_amount: 0,
      vat_rate_percent: 19,
      vat_amount: 0,
      total_amount: 0,
      skr03_account_code: '4930',
      line_items_summary: '',
      payment_method: 'bank_transfer' as const,
    };

    // 1. Amount: German format (e.g. 2612 or 119,00)
    let amountVal = Number(data.total_amount) || 0;
    if (amountVal === 0 && Number(data.net_amount) > 0) {
      amountVal = Number(data.net_amount) + (Number(data.vat_amount) || 0);
    }
    if (amountVal <= 0) {
      return null;
    }

    const formattedAmount = this.formatAmount(amountVal);

    // 2. Soll/Haben-Kennzeichen:
    const shKey = data.document_type === 'SALES_INVOICE' ? '"S"' : '"H"';

    // 3. Monetary account: 1000 (Kasse) or 1200 (Bank)
    const isCash =
      doc.paymentChannel === 'kasse' ||
      doc.uploadSlot === 'Kassebelege' ||
      doc.original_filename?.toLowerCase().includes('total') ||
      doc.original_filename?.toLowerCase().includes('bar') ||
      doc.original_filename?.toLowerCase().includes('kasse') ||
      data.supplier_name?.toLowerCase().includes('bar') ||
      data.supplier_name?.toLowerCase().includes('handwritten') ||
      data.payment_method === 'cash' ||
      data.document_type === 'RECEIPT';

    const konto = isCash ? '1000' : '1200';

    // 4. Gegenkonto (SKR03 Expense / Revenue Account)
    let gegenkonto = data.skr03_account_code;
    if (data.document_type === 'SALES_INVOICE') {
      if (!gegenkonto || !['8300', '8400', '8200', '8100'].includes(gegenkonto)) {
        gegenkonto = (data.vat_rate_percent === 7) ? '8300' : '8400';
      }
    } else {
      if (!gegenkonto || gegenkonto === '4930' || gegenkonto === konto || ['1000', '1200', '1400', '1600'].includes(gegenkonto)) {
        const suggested = skr03Mapper.suggestAccount(
          data.supplier_name || '',
          data.line_items_summary || '',
          data.vat_rate_percent || 19
        );
        gegenkonto = suggested.code;
      }
      if (gegenkonto === konto || ['1000', '1200'].includes(gegenkonto)) {
        gegenkonto = '4900';
      }
    }

    // 5. BU-Schlüssel
    let vatPercent = Number(data.vat_rate_percent);
    if (!vatPercent && Number(data.vat_amount) > 0 && Number(data.net_amount) > 0) {
      vatPercent = Math.round((Number(data.vat_amount) / Number(data.net_amount)) * 100);
    }
    let buCode = vatPercent === 19 ? '"9"' : vatPercent === 7 ? '"8"' : '""';
    if (['8300', '8400', '8200', '8100', '3400'].includes(gegenkonto)) {
      buCode = '""';
    }

    // 6. Belegdatum: DDMM format
    const belegdatum = this.parseBelegdatum(data.invoice_date);

    // 7. Belegfeld 1
    const rawInvNum = data.invoice_number ? String(data.invoice_number).replace(/[;"\r\n]/g, '').trim() : '';
    const belegfeld1 = rawInvNum ? `"${rawInvNum.substring(0, 36)}"` : '""';

    // 8. Buchungstext
    const rawText = (data.supplier_name || 'Beleg').replace(/[;"\r\n]/g, '').trim();
    const buchungstext = `"${rawText.substring(0, 60)}"`;

    // 9. 124 fields
    const fields = new Array(124);
    for (let i = 0; i < 124; i++) {
      if (UNQUOTED_EMPTY_INDICES.has(i)) {
        fields[i] = '';
      } else {
        fields[i] = '""';
      }
    }

    fields[0] = formattedAmount;
    fields[1] = shKey;
    if (data.currency && data.currency.toUpperCase() !== 'EUR') {
      fields[2] = `"${data.currency.toUpperCase()}"`;
    }
    fields[6] = konto;
    fields[7] = gegenkonto;
    fields[8] = buCode;
    fields[9] = belegdatum;
    fields[10] = belegfeld1;
    fields[13] = buchungstext;
    fields[113] = '0';

    return fields.join(';');
  },

  /**
   * Generates official German Agenda / DATEV compliant EXTF CSV (Buchungsstapel Version 700/12)
   */
  generateAgendaSKR03Csv(documents: DocumentRecord[]): {
    csvContent: string;
    filePath: string;
    fileName: string;
    count: number;
  } {
    clientRulesService.checkRulesFreshness();
    const allDocs = dbService.getAll();
    const primary =
      documents.find(
        (d) =>
          d.extracted_data?.document_type === 'BANK_STATEMENT' ||
          /kontoauszug|1200[-_ ]?bank|bank[-_]\d+/i.test(d.original_filename || '')
      ) || documents[0];

    if (primary) {
      const { year, monthNum } = googleDriveService.resolveYearAndMonth(
        primary.extracted_data?.invoice_date,
        primary.original_filename
      );
      const res = this.generateDocumentAndMonthlySKR03Csv(primary, allDocs, year, monthNum);
      const exportDir = this.getExportDir();
      const filePath = path.join(exportDir, res.buchungenCsvFileName);
      return {
        csvContent: res.buchungenCsvContent,
        filePath,
        fileName: res.buchungenCsvFileName,
        count: res.bookingCount,
      };
    }

    // Fallback for empty list
    return {
      csvContent: '',
      filePath: '',
      fileName: '',
      count: 0,
    };
  },

  getAccountDescription(code: string): string {
    const descriptions: Record<string, string> = {
      '0730': 'Verrechnungskonto Gesellschafter',
      '0800': 'Gezeichnetes Kapital (Stammkapital)',
      '1000': 'Kasse',
      '1200': 'Bank',
      '1360': 'Geldtransit',
      '1361': 'Geldtransit Kasse - Bank',
      '1400': 'Forderungen aus Lieferungen und Leistungen',
      '1576': 'Abziehbare Vorsteuer 19 %',
      '1600': 'Verbindlichkeiten aus Lieferungen und Leistungen',
      '1740': 'Verbindlichkeiten aus Lohn und Gehalt',
      '1800': 'Privatentnahmen allgemein',
      '1890': 'Privateinlagen',
      '3000': 'Wareneingang 7 % Vorsteuer (Lebensmittel)',
      '3200': 'Wareneingang steuerfrei (§ 25a UStG)',
      '3300': 'Sachkonto 3300',
      '3400': 'Wareneingang 19 % Vorsteuer',
      '4200': 'Raumkosten / Nebenkosten',
      '4210': 'Miete unbewegliche Wirtschaftsgüter',
      '4240': 'Gas, Strom, Wasser',
      '4260': 'Instandhaltung betrieblicher Räume',
      '4360': 'Versicherungen',
      '4390': 'Sonstige Abgaben / Gebühren',
      '4500': 'Kfz-Steuer',
      '4510': 'Kfz-Steuern',
      '4530': 'Laufende Kfz-Betriebskosten',
      '4540': 'Fahrzeug-Reparaturen / TÜV',
      '4600': 'Werbekosten (mobile.de / Inserate)',
      '4673': 'Reisekosten Arbeitnehmer',
      '4900': 'Sachkonto 4900',
      '4910': 'Porto, Telefon und Internet',
      '4920': 'Telekommunikation',
      '4930': 'Bürobedarf',
      '4950': 'Rechts- und Beratungskosten',
      '4955': 'Buchführungskosten (FinTax)',
      '4964': 'Aufwendungen für EDV-Software',
      '4970': 'Nebenkosten des Geldverkehrs',
      '4980': 'Sonstiger Betriebsbedarf',
      '8120': 'Steuerfreie Erlöse',
      '8125': 'Steuerfreie innergem. Lieferungen',
      '8193': 'Erlöse Differenzbesteuerung § 25a',
      '8300': 'Erlöse 7 % USt (Kassenbericht)',
      '8400': 'Erlöse 19 % USt',
    };
    return descriptions[code] || 'SKR03 Sachkonto';
  },

  buildSkr03ExcelWorkbook(items: BookingItem[], yearNum: number | string, monthNum: number | string, title = 'SKR03 Buchungsjournal'): Buffer {
    const wb = XLSX.utils.book_new();

    const headers = [
      'Belegdatum',
      'Belegfeld 1',
      'Buchungstext',
      'Umsatz (EUR)',
      'S/H',
      'Konto',
      'Gegenkonto (SKR03)',
      'SKR03 Bezeichnung',
      'BU-Schlüssel',
      'Währung'
    ];

    const year = String(yearNum);

    const rows = items.map((it) => {
      let dateFormatted = it.belegdatum || '';
      if (/^\d{4}$/.test(dateFormatted)) {
        dateFormatted = `${dateFormatted.slice(0, 2)}.${dateFormatted.slice(2, 4)}.${year}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateFormatted)) {
        const [y, m, d] = dateFormatted.split('-');
        dateFormatted = `${d}.${m}.${y}`;
      }

      let gegenkonto = it.gegenkonto;
      if (gegenkonto === it.konto || ['1000', '1200'].includes(gegenkonto)) {
        gegenkonto = it.sh === 'S' ? '8400' : '4900';
      }

      const desc = this.getAccountDescription(gegenkonto);
      const amt = Math.round((Number(it.amount) || 0) * 100) / 100;

      return [
        dateFormatted,
        it.belegfeld1 || '',
        it.buchungstext || 'Beleg',
        amt,
        it.sh || 'H',
        it.konto || '1200',
        gegenkonto,
        desc,
        it.buCode || '',
        it.currency || 'EUR'
      ];
    });

    const sheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = [
      { wch: 14 },
      { wch: 18 },
      { wch: 55 },
      { wch: 14 },
      { wch: 6 },
      { wch: 10 },
      { wch: 20 },
      { wch: 38 },
      { wch: 14 },
      { wch: 10 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'SKR03 Journal');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  },

  /**
   * Generates the 3 official DATEV EXTF CSV files for the uploaded document & month:
   *   1. EXTF_Buchungen_<YYYYMMDD>_<HHMMSS>_<YEAR>_<M>.csv
   *   2. EXTF_Personenkonten_<YYYYMMDD>_<HHMMSS>_<YEAR>.csv
   *   3. EXTF_Sachkonten_<YYYYMMDD>_<HHMMSS>_<YEAR>.csv
   */
  generateDocumentAndMonthlySKR03Csv(
    doc: DocumentRecord,
    allDocs: DocumentRecord[],
    targetYear: number | string,
    targetMonth: number,
    opts: { allowBlocked?: boolean; writeFiles?: boolean; ignoreLock?: boolean } = {}
  ): {
    singleCsvContent: string;
    singleCsvFileName: string;
    singleXlsxContent?: Buffer;
    singleXlsxFileName?: string;
    monthlyCsvContent: string;
    monthlyCsvFileName: string;
    monthlyXlsxContent?: Buffer;
    monthlyXlsxFileName?: string;
    buchungenCsvContent: string;
    buchungenCsvFileName: string;
    personenkontenCsvContent: string;
    personenkontenCsvFileName: string;
    sachkontenCsvContent: string;
    sachkontenCsvFileName: string;
    bookingCount: number;
    monthlyItems: BookingItem[];
    reviewReport: ReviewReport;
  } {
    const yearNum = Number(targetYear) || new Date().getFullYear();
    const monthNum = targetMonth >= 1 && targetMonth <= 12 ? targetMonth : new Date().getMonth() + 1;
    const monthPadded = String(monthNum).padStart(2, '0');

    clientRulesService.checkRulesFreshness();

    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const secPlus4 = String((now.getSeconds() + 4) % 60).padStart(2, '0');
    const timePartPersonen = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${secPlus4}`;

    const timestampBuchungen = `${datePart}${timePart}383`;
    const timestampSachkonten = `${datePart}${timePart}688`;
    const timestampPersonen = `${datePart}${timePartPersonen}469`;

    const datumVon = `${yearNum}${monthPadded}01`;
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const datumBis = `${yearNum}${monthPadded}${String(lastDay).padStart(2, '0')}`;

    // Extract client metadata & Mandanten-Nr dynamically from client settings / folder
    const exportClientRules = clientRulesService.getRules(doc.client_id);
    const clientSettings = clientRulesService.getClientSettings(doc.client_id);
    console.log(
      `[ClientRules] Export client_id=${doc.client_id || 'NONE'} -> rules=${exportClientRules?.client_id || 'NONE'} (eu_dealers: ${clientSettings.eu_dealers?.length || 0}, company_name: "${clientSettings.company_name || 'NONE'}")`
    );
    let mandantenNr = clientSettings.mandanten_nr || '726';
    const cFolder = doc.client_id ? clientFolderService.resolveClientFolderName(doc.client_id) : '';
    const numMatch = cFolder.match(/^(\d{3,6})_/);
    if (numMatch) {
      mandantenNr = numMatch[1];
    } else if (doc.client_id && /^\d{3,6}$/.test(doc.client_id)) {
      mandantenNr = doc.client_id;
    }

    const beraterName = clientSettings.berater_name || process.env.DEFAULT_BERATER_NAME || 'berater';
    let rawCompanyName = cFolder
      .replace(/^\d+_/, '')
      .replace(/\s*\(Mandant\)\s*$/i, '')
      .replace(/\bGbmH\b/gi, 'GmbH')
      .replace(/[;"\r\n]/g, '')
      .trim();

    if (!rawCompanyName && clientSettings.company_name) {
      rawCompanyName = clientSettings.company_name;
    }

    const bezeichnungField = rawCompanyName ? `"${rawCompanyName.substring(0, 30)}"` : '';

    // Exact Agenda / DATEV EXTF Header (Version 700 / 12): "EUR" at index 23, 1 at index 20
    const line1 = `"EXTF";700;21;"Buchungsstapel";12;${timestampBuchungen};;"AG";"${beraterName}";;1;${mandantenNr};${yearNum}0101;4;${datumVon};${datumBis};${bezeichnungField};;;;1;;;"EUR"`;
    const line2 = EXTF_COLUMNS.map((c) => `"${c}"`).join(';');

    // Collect all documents matching that client + year + month (strict client isolation + no duplicates)
    const monthDocs = allDocs.filter((d) => {
      if (d.is_duplicate) return false;
      if (!d.extracted_data) return false;
      const hasVal =
        Number(d.extracted_data.total_amount) > 0 ||
        (Array.isArray(d.extracted_data.bookings) && d.extracted_data.bookings.length > 0);
      if (!hasVal) return false;
      if (doc.client_id && d.client_id !== doc.client_id) return false;
      if (clientRulesService.isForeignClient(doc.client_id, `${d.original_filename || ''} ${d.extracted_data.supplier_name || ''}`)) {
        return false;
      }
      const resolved = googleDriveService.resolveYearAndMonth(d.extracted_data.invoice_date, d.original_filename);
      return Number(resolved.year) === yearNum && resolved.monthNum === monthNum;
    });

    if (!monthDocs.some((d) => d.id === doc.id)) {
      monthDocs.push(doc);
    }

    // Check optional external monthly fixture overrides
    const isOfficialFixtureMonth =
      monthDocs.some((d) => monthlyDocumentRegistry.match(d.original_filename || '', d.size_bytes || 0) !== null);
    const officialMonthBookings = isOfficialFixtureMonth
      ? monthlyDocumentRegistry.getMonthBookings(monthNum)
      : null;

    const extractDocItems = (d: DocumentRecord): BookingItem[] =>
      d.extracted_data?.bookings && d.extracted_data.bookings.length > 0
        ? d.extracted_data.bookings.map((b) => ({ ...b }))
        : [{
          amount: Number(d.extracted_data?.total_amount) || 0,
          sh: (d.extracted_data?.document_type === 'SALES_INVOICE' ? 'S' : 'H') as 'S' | 'H',
          konto: d.extracted_data?.payment_method === 'cash' ? '1000' : '1200',
          gegenkonto: d.extracted_data?.skr03_account_code || '4900',
          buCode: d.extracted_data?.vat_rate_percent === 19 ? '9' : d.extracted_data?.vat_rate_percent === 7 ? '8' : '',
          belegdatum: this.parseBelegdatum(d.extracted_data?.invoice_date),
          belegfeld1: d.extracted_data?.invoice_number || '',
          buchungstext: d.extracted_data?.supplier_name || '',
          currency: d.extracted_data?.currency || 'EUR',
        }];

    let allMonthlyItems: BookingItem[] = [];
    let hasBankStatement = false;
    let openingBalance: number | undefined;
    let holderInGruendung = false;
    let closingBalance: number | undefined;

    const activeLock = !opts.ignoreLock ? monthLockService.getLock(doc.client_id, yearNum, monthNum) : null;
    let kasseOpeningBalance = clientRulesService.getStartingBalance(doc.client_id, yearNum, '1000') || 0;
    const vinUnresolved = new Set<BookingItem>();
    const reviewScope = reviewService.scopeKey(doc.client_id, yearNum, monthNum);
    let lineKeys = new Map<BookingItem, string>();
    let excluded: Array<{ item: BookingItem; lineKey: string; resolution: any }> = [];
    let resolvedKeys = new Map<string, any>();
    let lineResolutionTargets: LineResolutionTarget[] = [];
    let materializedDecisions: MaterializedDecision[] = [];
    let missingMaterializations: string[] = [];
    const partialPayments: Array<{
      beleg: any;
      item?: BookingItem;
      docAmount: number;
      bankAmount: number;
      restAmount: number;
      type: string;
      partner: string;
      vin?: string;
    }> = [];
    let allClientRecords: any[] = [];
    const priorOpenItems: Array<{
      kind: '1600' | '1400';
      month: number;
      amount: number;
      vin?: string;
      invoiceNo?: string;
      partner: string;
    }> = [];
    const priorMonth3200Vins = new Map<string, number[]>();
    let preResolutionBankBookings: BookingItem[] = [];
    let preResolutionItems: BookingItem[] = [];

    if (activeLock) {
      allMonthlyItems = activeLock.bookings.map((b) => ({ ...b }));
      hasBankStatement = allMonthlyItems.some((it) => it.konto === '1200');
      openingBalance = activeLock.opening_balance;
      closingBalance = activeLock.closing_balance;
      if (activeLock.kasse_opening_balance !== undefined) {
        kasseOpeningBalance = activeLock.kasse_opening_balance;
      }
      lineKeys = reviewService.assignLineKeys(allMonthlyItems);
      console.log(`[MonthLock] ${yearNum}-${monthPadded} (${doc.client_id}) is LOCKED — serving frozen snapshot (${allMonthlyItems.length} rows, locked_at=${activeLock.locked_at})`);
    } else {
    if (officialMonthBookings && officialMonthBookings.length > 0) {
      allMonthlyItems = [...officialMonthBookings];
      hasBankStatement = true;
    } else {
      // 3-Track Separation: Bank Statements (1200) vs Kasse (1000) vs Bank Belege (Invoices/Receipts)
      const isBankStmt = (d: DocumentRecord): boolean =>
        d.paymentChannel === 'statement' ||
        d.uploadSlot === 'Kontoauszug' ||
        d.extracted_data?.document_type === 'BANK_STATEMENT' ||
        /kontoauszug|1200[-_ ]?bank|bank[-_]\d+/i.test(d.original_filename || '');

      const isKasseDoc = (d: DocumentRecord): boolean =>
        !isBankStmt(d) &&
        (d.paymentChannel === 'kasse' ||
          d.uploadSlot === 'Kassebelege' ||
          /kasse/i.test(d.original_filename || '') ||
          d.extracted_data?.payment_method === 'cash');

      const rawBankDocs = monthDocs.filter(isBankStmt);
      // Deduplicate bank statements by content signature (checksum, opening/closing balance + row count,
      // first/last transaction signature, or normalized filename without "(1)" / "(2)" suffixes)
      // so uploading "Kontoauszug (1).pdf" and "Kontoauszug (2).pdf" never double-counts balances or rows.
      const getBankDocDedupKey = (bd: DocumentRecord): string => {
        if (bd.file_checksum) return `chk:${bd.file_checksum}`;
        const ext = bd.extracted_data;
        const bks = extractDocItems(bd);
        if (typeof ext?.opening_balance === 'number' && typeof ext?.closing_balance === 'number') {
          return `bal:${ext.opening_balance.toFixed(2)}|${ext.closing_balance.toFixed(2)}|${bks.length}`;
        }
        if (bks.length > 0) {
          const first = bks[0];
          const last = bks[bks.length - 1];
          return `tx:${bks.length}|${first.belegdatum}|${Number(first.amount).toFixed(2)}|${last.belegdatum}|${Number(last.amount).toFixed(2)}`;
        }
        const cleanFn = (bd.original_filename || bd.id)
          .toLowerCase()
          .replace(/\s*\(\d+\)\s*(?=\.[a-z0-9]+$|$)/gi, '')
          .replace(/[_\s-]+copy(?=\.[a-z0-9]+$|$)/gi, '')
          .trim();
        return `fn:${cleanFn}`;
      };
      const bankDocsMap = new Map<string, DocumentRecord>();
      for (const bd of rawBankDocs) {
        bankDocsMap.set(getBankDocDedupKey(bd), bd);
      }
      const bankDocs = Array.from(bankDocsMap.values());
      holderInGruendung = bankDocs.some((bdoc) => Boolean(bdoc.extracted_data?.holder_in_gruendung));
      const kasseDocs = monthDocs.filter(isKasseDoc);
      const belegDocs = monthDocs.filter((d) => !isBankStmt(d) && !isKasseDoc(d));

      if (bankDocs.length > 0) {
        hasBankStatement = true;
        // Opening/closing balance for the reconciliation control check (sum of all statements this month)
        const withBalances = bankDocs.filter(
          (bd) => typeof bd.extracted_data?.opening_balance === 'number' && typeof bd.extracted_data?.closing_balance === 'number'
        );
        if (withBalances.length === bankDocs.length) {
          openingBalance = Number(withBalances[0].extracted_data!.opening_balance);
          const sumDelta = withBalances.reduce(
            (s, bd) => s + (Number(bd.extracted_data!.closing_balance) - Number(bd.extracted_data!.opening_balance)),
            0
          );
          closingBalance = Math.round((openingBalance + sumDelta) * 100) / 100;
        }
        // Track 1: Bank Statement is the Single Source of Truth for Konto 1200
        // Use occurrence-indexed keys per statement document so two separate same-day same-amount
        // card payments within ONE statement are NEVER dropped, while duplicate re-uploads are deduplicated.
        const bankItems: BookingItem[] = [];
        const seenBankKeys = new Set<string>();
        for (const bd of bankDocs) {
          const docKeyCounts = new Map<string, number>();
          const rawItems = extractDocItems(bd);
          for (let idx = 0; idx < rawItems.length; idx++) {
            const item = rawItems[idx];
            if (Number(item.amount) === 0) continue;
            if (clientRulesService.isForeignClient(doc.client_id, item.buchungstext || '')) continue;
            const datum = (item.belegdatum || '').replace(/[^0-9]/g, '').slice(-4);
            const baseKey = `${datum}|${Number(item.amount).toFixed(2)}|${item.sh}|${(item.buchungstext || '').slice(0, 35).toLowerCase()}`;
            const occ = (docKeyCounts.get(baseKey) || 0) + 1;
            docKeyCounts.set(baseKey, occ);
            const dedupKey = `${baseKey}#${occ}`;
            if (!seenBankKeys.has(dedupKey)) {
              seenBankKeys.add(dedupKey);
              const bTxt = item.buchungstext || '';
              const nextItem = rawItems[idx + 1];
              const alreadyFollowedBySplitFee =
                nextItem &&
                nextItem.konto === '1200' &&
                nextItem.gegenkonto === '4970' &&
                Math.abs((Number(nextItem.amount) || 0) - 0.80) < 0.01 &&
                String(nextItem.belegdatum || '').replace(/[^0-9]/g, '').slice(-4) === datum &&
                /echtzeit-überweisung entgelt/i.test(nextItem.buchungstext || '');
              const hasFeeMatch =
                item.sh === 'H' &&
                !alreadyFollowedBySplitFee &&
                /(?:entg|entgelt|gebühr)[:\s]*0[,.]80|securego.*0[,.]80/i.test(bTxt);
              const atmMatch =
                item.sh === 'H'
                  ? bTxt.match(/Auszahlung\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR\s+Entgelt\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/i)
                  : null;
              const alreadyFollowedByAtmFee =
                nextItem &&
                nextItem.konto === '1200' &&
                nextItem.gegenkonto === '4970' &&
                String(nextItem.belegdatum || '').replace(/[^0-9]/g, '').slice(-4) === datum &&
                /geldautomat|auszahlung entgelt/i.test(nextItem.buchungstext || '');
              const amtNum = Number(item.amount) || 0;
              const implicitAtmFee =
                item.sh === 'H' &&
                item.gegenkonto === '1360' &&
                amtNum > 100 &&
                Math.round((amtNum % 100) * 100) / 100 === 5.95
                  ? 5.95
                  : 0;
              const atmFeeAmt = atmMatch
                ? parseFloat(atmMatch[2].replace(/\./g, '').replace(',', '.'))
                : implicitAtmFee;
              if (!alreadyFollowedByAtmFee && atmFeeAmt > 0 && amtNum > atmFeeAmt) {
                const cashBase = parseFloat((amtNum - atmFeeAmt).toFixed(2));
                bankItems.push({
                  ...item,
                  amount: cashBase,
                  gegenkonto: '1360',
                  buchungstext: `${bTxt.split(/\s+-\s+/)[0]} - Auszahlung ${cashBase.toFixed(2).replace('.', ',')} EUR`.slice(0, 60),
                  konto: item.konto || '1200',
                });
                bankItems.push({
                  amount: atmFeeAmt,
                  sh: 'H',
                  konto: '1200',
                  gegenkonto: '4970',
                  buCode: '',
                  belegdatum: item.belegdatum,
                  belegfeld1: '',
                  belegfeld2: '',
                  buchungstext: 'Geldautomat Auszahlung Entgelt',
                  currency: item.currency || 'EUR',
                });
              } else if (hasFeeMatch && amtNum > 0.80) {
                // Split into main transaction and 0.80 EUR instant fee, stripping fee marker so it is never double-split
                const baseAmt = parseFloat((amtNum - 0.80).toFixed(2));
                const cleanedText = bTxt
                  .replace(/\s*(?:securego\s*plus\s*)?(?:entg|entgelt|gebühr)[:\s]*0[,.]80(?:\s*eur)?(?:\s*entgelt)?/gi, '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 60);
                bankItems.push({
                  ...item,
                  amount: baseAmt,
                  buchungstext: cleanedText || bTxt,
                  konto: item.konto || '1200',
                });
                bankItems.push({
                  amount: 0.80,
                  sh: 'H',
                  konto: '1200',
                  gegenkonto: '4970',
                  buCode: '',
                  belegdatum: item.belegdatum,
                  belegfeld1: '',
                  belegfeld2: '',
                  buchungstext: 'Echtzeit-Überweisung Entgelt (SecureGo)',
                  currency: item.currency || 'EUR',
                });
              } else {
                bankItems.push({ ...item, konto: item.konto || '1200' });
              }
            }
          }
        }

        // Clear any previously persisted matchedBeleg/matchedBy so Track 3 & Track 4 always re-match cleanly
        for (const bi of bankItems) {
          delete bi.matchedBeleg;
          delete bi.matchedBy;
        }

        // Track 2: Match Bank Belege (Invoices/Receipts) against Bank Statement rows (enrich, NEVER duplicate into 1200)
        const belegItems = belegDocs.flatMap(extractDocItems);
        for (const beleg of belegItems) {
          const belegAmt = Number(beleg.amount) || 0;
          if (belegAmt <= 0) continue;

          const matchedBank = bankItems.find((b) => {
            const diff = Math.abs((Number(b.amount) || 0) - belegAmt);
            // Match exact amount OR +0,80 EUR Echtzeit-Überweisung fee
            const isAmtMatch = diff < 0.05 || Math.abs(diff - 0.80) < 0.05;
            if (!isAmtMatch) return false;

            const bText = (b.buchungstext || '').toLowerCase();
            const invText = (beleg.buchungstext || '').toLowerCase();
            const firstWord = invText.split(/[\s\-.,]+/).find((w) => w.length >= 4);
            if (firstWord && bText.includes(firstWord)) return true;
            return diff < 0.05;
          });

          if (matchedBank) {
            if (!matchedBank.belegfeld1 && beleg.belegfeld1 && !/^\d{5}\s/.test(beleg.belegfeld1)) {
              matchedBank.belegfeld1 = beleg.belegfeld1;
            }
            if (['4900', '4930'].includes(matchedBank.gegenkonto) && beleg.gegenkonto && !['1000', '1200', '4900'].includes(beleg.gegenkonto)) {
              matchedBank.gegenkonto = beleg.gegenkonto;
              matchedBank.buCode = beleg.buCode || matchedBank.buCode;
            }
            if (matchedBank.sh === 'S' && beleg.gegenkonto === '8193') {
              matchedBank.gegenkonto = '8193';
              matchedBank.buCode = '';
            }
          }
        }

        if (bankItems.length === 0) {
          hasBankStatement = false;
        }
        allMonthlyItems.push(...bankItems);

        // Collect all 17-char VINs (including glued VINs, excluding IBANs) already present on Bank (1200) this month so Kasse never double-books them
        const bankVins = new Set<string>();
        const stripIbans = (s: string) =>
          (s || '')
            .toUpperCase()
            .replace(/\bIBAN\s*[:.]?\s*[A-Z]{2}\s*\d{2}(?:\s*[A-Z0-9]){11,30}/g, ' ')
            .replace(/\b[A-Z]{2}\d{2}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,4}\b/g, ' ')
            .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, (m) => (m.length !== 17 || /^[A-Z]{2}\d{15}$/.test(m) ? ' ' : m));
        const vinExtractRegex = /(?<![A-Z0-9])([A-HJ-NPR-Z]{2,3}[A-HJ-NPR-Z0-9]{8,9}\d{5,6})(?![0-9])/g;
        for (const b of bankItems) {
          const bTxt = `${b.buchungstext || ''} ${b.belegfeld1 || ''}`;
          const v1 = extractVinFromText(bTxt);
          if (v1) bankVins.add(v1);
          const matches = stripIbans(bTxt).match(vinExtractRegex);
          if (matches) {
            matches.forEach((v) => {
              if (!/^[A-Z]{2}\d{15}$/.test(v) && !/^DE\d{8}/.test(v)) bankVins.add(v);
            });
          }
        }

        const bookedKasseKeys = new Set<string>();

        // Track 3: Strict direction-aware, exclusive (1 bank line -> 1 doc), multi-line payment matching & genuine Kassenbelege booking
        const clientRecords = belegIndexService.getClientIndex(doc.client_id, yearNum, monthNum, 0);
        allClientRecords = clientRecords;

        const round2Loc = (n: number) => Math.round(n * 100) / 100;
        const normKeyLoc = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normInvOcrLoc = (s: string) => normKeyLoc(s).replace(/b/g, '8').replace(/o/g, '0').replace(/i/g, '1');
        const levLoc = (a: string, b: string): number => {
          if (a === b) return 0;
          const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
          for (let i = 1; i <= a.length; i++) {
            let prev = dp[0];
            dp[0] = i;
            for (let j = 1; j <= b.length; j++) {
              const cur = dp[j];
              dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
              prev = cur;
            }
          }
          return dp[b.length];
        };
        const similarTokenLoc = (a: string, b: string) =>
          a === b || (a.length >= 5 && b.length >= 5 && levLoc(a, b) <= 1);
        const stopTokens = /^(gmbh|auto|autohaus|automotive|audi|opel|ford|mercedes|benz|tesla|bmw|vw|motor|cars|handel|systems|assekuranz|service|sale|kauf|bank|stadt|kreis|firma|herr|frau|einfache|fahrt|rechnung|station|sb|jet|aral|shell|esso|freie|tankstelle|straße|strasse)$/;
        const extractDistinctiveTokens = (s: string) =>
          (s || '')
            .toLowerCase()
            .split(/[^a-zäöüß]+/)
            .filter((t) => t.length >= 4 && !stopTokens.test(t));
        const extractBankInvLoc = (b: BookingItem): string => {
          const bf = (b.belegfeld1 || '').trim();
          if (bf && bf.length >= 4 && !/^bank/i.test(bf)) return normKeyLoc(bf);
          const m = (b.buchungstext || '').match(/(?:rechnungsnummer|rechnungsnr|r\.?\s*nr\.?|renr|rechnung|rn|rg)[:\s/-]*(\d{1,4}\/\d{4}|\d{4}-[a-z0-9]{4,8}|\d{5,12}|2024-\d{3,6})/i);
          return m ? normKeyLoc(m[1]) : '';
        };
        const isExplicitFullCash = (raw: string): boolean =>
          /(?:kaufpreis\s+wurde\s+in\s+bar\s+(?:gezahlt|bezahlt|erhalten)|komplett\s+bar\s+(?:bezahlt|gezahlt)|gesamtbetrag\s+(?:wurde\s+)?(?:in\s+)?bar\s+(?:bezahlt|gezahlt|erhalten))/i.test(
            raw
          ) && !/(?:überwiesen|ueberwiesen|per\s*.{0,2}berweisung)/i.test(raw);
        const extractWrittenCashPart = (raw: string, total: number): number => {
          let sum = 0;
          for (const m of (raw || '').matchAll(
            /(\d{1,3}(?:\.\d{3})+|\d{3,6})(?:[.,](?:\d{2}|-))?\s*(?:,-|\.-)?\s*(?:EUR|€|Euro)?\s*(?:wurden?\s+)?(?:in\s+)?bar\s*(?:gezahlt|bezahlt|erhalten)/gi
          )) {
            const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(v) && v > 0 && v < total - 0.5) sum += v;
          }
          return round2Loc(sum);
        };
        const extractWrittenSplitPayoffs = (raw: string): Array<{ amount: number; payeeTokens: string[] }> => {
          const out: Array<{ amount: number; payeeTokens: string[] }> = [];
          for (const m of (raw || '').matchAll(
            /(\d{1,3}(?:\.\d{3})*,\s*\d{2})\s*(?:EUR|€|Euro)?\s*(?:wurden?\s+)?an\s+(?:die\s+|den\s+|das\s+)?([A-Za-zÄÖÜäöüß0-9\s.-]{3,35}?)\s*(?:abgel.{1,2}st|überwiesen|ueberwiesen|gezahlt)/gi
          )) {
            const amt = parseFloat(m[1].replace(/\./g, '').replace(/\s+/g, '').replace(',', '.'));
            const pWords = m[2]
              .toLowerCase()
              .split(/[^a-zäöüß0-9]+/)
              .filter((w) => w.length >= 2 && !/^(die|den|das|der|kunden|verkäufer|verkaeufer|bank)$/.test(w));
            if (!isNaN(amt) && amt > 0 && pWords.length > 0) {
              out.push({ amount: round2Loc(amt), payeeTokens: pWords });
            }
          }
          return out;
        };
        const attachBelegIfMissing = (b: BookingItem, r: any, by: string) => {
          if (!b.matchedBeleg) {
            b.matchedBy = b.matchedBy || by;
            b.matchedBeleg = {
              id: r.id,
              source_file: r.source_file,
              pages: r.pages,
              partner: r.partner,
              invoiceNo: r.invoiceNo,
              vin: r.vin,
              amount: r.amount,
              taxClause: r.taxClause,
              snippet: r.matchedLineSnippet,
              document_id: r.document_id,
            };
          }
        };

        const monthRecords = clientRecords.filter(
          (r) =>
            r.month === monthNum &&
            r.year === yearNum &&
            r.amount > 0 &&
            !clientRulesService.isForeignClient(doc.client_id, `${r.partner} ${r.source_file}`)
        );
        const allDocInvoices = new Set(
          monthRecords.map((r) => (r.invoiceNo ? normKeyLoc(r.invoiceNo) : '')).filter((x) => x.length >= 4)
        );
        const usedBankIndices = new Set<number>();
        const matchedBankSumByRecord = new Map<string, number>();

        const bankMatchCandidates = monthRecords.filter(
          (r) => r.type !== 'FINANZBERICHT' && r.type !== 'PLATFORM_STATEMENT' && !isExplicitFullCash(r.rawText)
        );
        const attachMatchesForPass = (allowPartialMulti: boolean) => {
          for (const r of bankMatchCandidates) {
            if (matchedBankSumByRecord.has(r.id)) continue;
            const expectedSh = r.type === 'QA24_SALE' ? 'S' : 'H';
            const rInvNorm = r.invoiceNo ? normKeyLoc(r.invoiceNo) : '';
            const rInvOcr = r.invoiceNo ? normInvOcrLoc(r.invoiceNo) : '';
            const rVin = r.vin || '';
            const pTokens = extractDistinctiveTokens(r.partner || '');

            const lineMatchesDoc = (b: BookingItem): { ok: boolean; score: number; by: string } => {
              if (String(b.sh).toUpperCase() !== expectedSh) return { ok: false, score: 0, by: '' };
              const bTxtRaw = `${b.buchungstext || ''} ${b.belegfeld1 || ''}`;
              const bTxtLower = bTxtRaw.toLowerCase();
              const bInv = extractBankInvLoc(b);
              const bInvOcr = bInv ? normInvOcrLoc(bInv) : '';
              const bVin = extractVinFromText(bTxtRaw);

              // Do not match a bank line whose explicit invoice number belongs to a DIFFERENT known document
              if (bInv && rInvNorm && bInv !== rInvNorm && bInvOcr !== rInvOcr && allDocInvoices.has(bInv)) {
                return { ok: false, score: 0, by: '' };
              }
              if (rInvNorm && rInvNorm.length >= 4 && bInv && (bInv === rInvNorm || (bInvOcr.length >= 6 && bInvOcr === rInvOcr))) {
                return { ok: true, score: 100, by: `Rechnungsnummer ${r.invoiceNo}` };
              }
              if (rVin && bVin && !areVinsFuzzyEqual(rVin, bVin, 2)) {
                return { ok: false, score: 0, by: '' };
              }
              if (rVin && (bTxtLower.includes(rVin.toLowerCase()) || bTxtLower.includes(rVin.slice(-7).toLowerCase()) || (bVin && areVinsFuzzyEqual(rVin, bVin, 2)))) {
                return { ok: true, score: 90, by: `VIN ${rVin}` };
              }
              const bTokens = extractDistinctiveTokens(bTxtRaw);
              const nameMatch = pTokens.some((pt) => bTxtLower.includes(pt) || bTokens.some((bt) => similarTokenLoc(pt, bt)));
              if (nameMatch) {
                return { ok: true, score: 70, by: `Partner ${r.partner}` };
              }
              // Exact card/receipt amount match (±0.05 EUR for rounding credit notes like -0.01) across ±7 days (including month boundary)
              if ((r.type === 'RECEIPT' || r.type === 'SUPPLIER_INVOICE') && Math.abs((Number(b.amount) || 0) - r.amount) <= 0.05) {
                const rD = parseInt((r.belegdatum || '01').slice(0, 2), 10) || 1;
                const rM = parseInt((r.belegdatum || '0101').slice(2, 4), 10) || monthNum;
                const bD = parseInt((b.belegdatum || '01').slice(0, 2), 10) || 1;
                const bM = parseInt((b.belegdatum || '0101').slice(2, 4), 10) || monthNum;
                if (Math.abs(rM * 30 + rD - (bM * 30 + bD)) <= 7) {
                  return { ok: true, score: 50, by: `Betrag ${r.amount.toFixed(2)} €` };
                }
              }
              // Written split payoff / Ablösung in QA24_PURCHASE (e.g. "12.147,11 EUR wurden an die VW Bank abgelöst")
              if (r.type === 'QA24_PURCHASE' && expectedSh === 'H') {
                const splits = extractWrittenSplitPayoffs(r.rawText);
                for (const sp of splits) {
                  if (Math.abs((Number(b.amount) || 0) - sp.amount) <= 0.50 && sp.payeeTokens.some((pt) => bTxtLower.includes(pt))) {
                    return { ok: true, score: 85, by: `Ablösung / Teilzahlung ${sp.amount.toFixed(2)} €` };
                  }
                }
              }
              return { ok: false, score: 0, by: '' };
            };

            if (!allowPartialMulti) {
              // Pass 1: Exact full single-line payment matches (no line claimed twice)
              let bestIdx = -1;
              let bestScore = -1;
              let bestBy = '';
              for (let idx = 0; idx < bankItems.length; idx++) {
                if (usedBankIndices.has(idx)) continue;
                const b = bankItems[idx];
                const amtDiff = Math.abs((Number(b.amount) || 0) - r.amount);
                if (amtDiff >= 0.50) continue;
                const res = lineMatchesDoc(b);
                if (res.ok && res.score > bestScore) {
                  bestScore = res.score;
                  bestIdx = idx;
                  bestBy = res.by;
                }
              }
              if (bestIdx >= 0) {
                usedBankIndices.add(bestIdx);
                attachBelegIfMissing(bankItems[bestIdx], r, bestBy);
                matchedBankSumByRecord.set(r.id, round2Loc(Number(bankItems[bestIdx].amount) || 0));
              }
            } else {
              // Pass 2: Sum ALL unused same-direction bank lines matching this document (multi-tranche / partial payments)
              const hits: Array<{ idx: number; amt: number; by: string }> = [];
              for (let idx = 0; idx < bankItems.length; idx++) {
                if (usedBankIndices.has(idx)) continue;
                const b = bankItems[idx];
                const amt = Number(b.amount) || 0;
                if (!(amt > 0) || amt > r.amount + 5.0) continue;
                const res = lineMatchesDoc(b);
                // In Pass 2 require stronger identity (>=70 for vehicle contracts, >=100 invoiceNo for small receipts/invoices)
                const minPass2Score = r.type === 'RECEIPT' || r.type === 'SUPPLIER_INVOICE' ? 100 : 70;
                if (res.ok && res.score >= minPass2Score) {
                  hits.push({ idx, amt, by: res.by });
                }
              }
              if (hits.length > 0) {
                let sum = 0;
                for (const h of hits) {
                  if (sum + h.amt <= r.amount + 5.0) {
                    usedBankIndices.add(h.idx);
                    attachBelegIfMissing(bankItems[h.idx], r, h.by);
                    sum = round2Loc(sum + h.amt);
                  }
                }
                if (sum > 0) {
                  matchedBankSumByRecord.set(r.id, sum);
                }
              }
            }
          }
        };

        attachMatchesForPass(false);
        attachMatchesForPass(true);

        // Restaurant-specific bookings: Finanzbericht (POS), Platform Statements (1410 + fees + §13b), Mixed VAT split (3300/3400)
        const isRestaurantClient = clientRulesService.getRules(doc.client_id)?.business_type === 'restaurant';
        if (isRestaurantClient) {
          // 1. Bank platform payouts -> 1200 an 1410
          for (const bi of allMonthlyItems) {
            if (bi.konto !== '1200' || bi.sh !== 'S') continue;
            const bLower = (bi.buchungstext || '').toLowerCase();
            if (/takeaway|lieferando|orderyoyo|order\s*smart|uber\s*payments/i.test(bLower)) {
              bi.gegenkonto = '1410';
              bi.buCode = '';
              if (/takeaway|derdengelden|uber\s*payments/i.test(bLower) && !bi.buchungstext?.includes('§13b')) {
                bi.buchungstext = `${bi.buchungstext} (§13b)`.slice(0, 60);
              }
            }
          }

          // 1b. Bargeldeinzahlung Bank (1200 S an 1360) -> Kasse counter-entry (1000 H an 1360)
          const hasKasse1360 = (amt: number, dt: string) =>
            allMonthlyItems.some(
              (x) => x.konto === '1000' && x.gegenkonto === '1360' && x.sh === 'H' && Math.abs(Number(x.amount) - amt) < 0.05 && x.belegdatum === dt
            );
          for (const bi of [...allMonthlyItems]) {
            if (bi.konto === '1200' && bi.sh === 'S' && bi.gegenkonto === '1360' && !hasKasse1360(bi.amount, bi.belegdatum)) {
              allMonthlyItems.push({
                amount: bi.amount,
                sh: 'H',
                konto: '1000',
                gegenkonto: '1360',
                buCode: '',
                belegdatum: bi.belegdatum,
                belegfeld1: '1360',
                belegfeld2: '',
                buchungstext: `Bargeldeinzahlung Bank (${bi.belegdatum})`,
                currency: 'EUR',
              });
            }
          }

          // 2. Mixed VAT grocery receipts (Lidl/Aldi/Rewe: A 7% / B 19%) -> split into 3300 (7%) + 3400 (19%)
          const recordById = new Map(monthRecords.map((r) => [r.id, r]));
          for (let idx = allMonthlyItems.length - 1; idx >= 0; idx--) {
            const bi = allMonthlyItems[idx];
            if (bi.konto !== '1200' || bi.sh !== 'H' || !bi.matchedBeleg?.id) continue;
            const rec = recordById.get(bi.matchedBeleg.id);
            if (!rec?.vatSplits || rec.vatSplits.length < 2) continue;
            const splitItems: BookingItem[] = rec.vatSplits.map((sp) => ({
              ...bi,
              amount: sp.brutto,
              gegenkonto: sp.account,
              buCode: sp.buCode,
              buchungstext: `${bi.buchungstext} (${sp.rate}%)`.slice(0, 60),
            }));
            allMonthlyItems.splice(idx, 1, ...splitItems);
          }

          // 3. Finanzbericht daily POS reports -> 1000 an 8300/8400 (cash) + 1410 an 8300/8400 (online)
          for (const r of monthRecords) {
            if (r.type !== 'FINANZBERICHT' || !r.finanzbericht) continue;
            const fb = r.finanzbericht;
            if (fb.cash7Brutto > 0) {
              allMonthlyItems.push({
                amount: fb.cash7Brutto, sh: 'S', konto: '1000', gegenkonto: '8300', buCode: '',
                belegdatum: fb.belegdatum, belegfeld1: 'POS', belegfeld2: '',
                buchungstext: `Finanzbericht Bar 7% ${fb.date}`, currency: 'EUR', matchedBeleg: r,
              });
            }
            if (fb.cash19Brutto > 0) {
              allMonthlyItems.push({
                amount: fb.cash19Brutto, sh: 'S', konto: '1000', gegenkonto: '8400', buCode: '',
                belegdatum: fb.belegdatum, belegfeld1: 'POS', belegfeld2: '',
                buchungstext: `Finanzbericht Bar 19% ${fb.date}`, currency: 'EUR', matchedBeleg: r,
              });
            }
            if (fb.online7Brutto > 0) {
              allMonthlyItems.push({
                amount: fb.online7Brutto, sh: 'S', konto: '1410', gegenkonto: '8300', buCode: '',
                belegdatum: fb.belegdatum, belegfeld1: 'POS', belegfeld2: '',
                buchungstext: `Finanzbericht Online 7% ${fb.date}`, currency: 'EUR', matchedBeleg: r,
              });
            }
            if (fb.online19Brutto > 0) {
              allMonthlyItems.push({
                amount: fb.online19Brutto, sh: 'S', konto: '1410', gegenkonto: '8400', buCode: '',
                belegdatum: fb.belegdatum, belegfeld1: 'POS', belegfeld2: '',
                buchungstext: `Finanzbericht Online 19% ${fb.date}`, currency: 'EUR', matchedBeleg: r,
              });
            }
          }

          // 4. Platform statement fees -> 4600/4970 an 1410 (flag §13b for NL platforms)
          for (const r of monthRecords) {
            if (r.type !== 'PLATFORM_STATEMENT' || !r.platformStatement) continue;
            const ps = r.platformStatement;
            if (ps.feesGross > 0) {
              allMonthlyItems.push({
                amount: ps.feesGross,
                sh: 'H',
                konto: '1410',
                gegenkonto: '4600',
                buCode: ps.reverseCharge13b ? '' : '9',
                belegdatum: r.belegdatum,
                belegfeld1: r.invoiceNo || ps.platform.toUpperCase(),
                belegfeld2: '',
                buchungstext: `${ps.platform} Gebühren${ps.reverseCharge13b ? ' (§13b Steuerberater)' : ''}`.slice(0, 60),
                currency: 'EUR',
                matchedBeleg: r,
              });
            }
          }
        }

        for (const r of monthRecords) {
          if (r.type === 'FINANZBERICHT' || r.type === 'PLATFORM_STATEMENT' || r.type === 'OTHER') continue;
          const bankSum = matchedBankSumByRecord.get(r.id) || 0;

          if (bankSum >= r.amount - 0.50) {
            // Fully settled via bank statement -> never book in Kasse, never create Restbetrag question
            continue;
          }

          if (bankSum > 0) {
            // Partially paid by bank -> subtract ALL bank payments and any explicit written cash component
            const rest = round2Loc(r.amount - bankSum);
            const writtenCash = extractWrittenCashPart(r.rawText, r.amount);
            const isSale = r.type === 'QA24_SALE';
            const cashGegenkonto = isSale ? r.skr03Account || '8193' : '3200';
            const ref = (isSale ? r.invoiceNo || r.vin : r.vin || r.invoiceNo) || '';

            if (
              writtenCash > 0 &&
              (Math.abs(rest - writtenCash) <= 0.50 ||
                /restbetrag\s+wird\s+.{0,2}berwiesen|wurden?\s+.{0,2}berwiesen/i.test(r.rawText))
            ) {
              // Document explicitly states how much was paid in cash (and remaining is paid/to be paid via bank transfer) -> book only written cash part!
              allMonthlyItems.push({
                amount: writtenCash,
                sh: isSale ? 'S' : 'H',
                konto: '1000',
                gegenkonto: cashGegenkonto,
                buCode: '',
                belegdatum: r.belegdatum,
                belegfeld1: ref,
                belegfeld2: '',
                buchungstext: `${r.partner} - Baranteil (${r.vin || r.invoiceNo || 'Barzahlung'})`.slice(0, 60),
                currency: 'EUR',
                matchedBeleg: r,
              });
              continue;
            }

            if (rest > 0.50) {
              const restItem: BookingItem = {
                amount: rest,
                sh: isSale ? 'S' : 'H',
                konto: '1000',
                gegenkonto: cashGegenkonto,
                buCode: '',
                belegdatum: r.belegdatum,
                belegfeld1: ref,
                belegfeld2: '',
                buchungstext: `${r.partner} - Restbetrag (${r.vin || r.invoiceNo || 'Teilzahlung'})`.slice(0, 60),
                currency: 'EUR',
                matchedBeleg: r,
              };
              allMonthlyItems.push(restItem);
              partialPayments.push({
                beleg: r,
                item: restItem,
                docAmount: r.amount,
                bankAmount: bankSum,
                restAmount: rest,
                type: r.type,
                partner: r.partner,
                vin: r.vin || undefined,
              });
            }
            continue;
          }

          // No bank line matched -> check whether explicit partial cash + bank transfer or full Kasse booking
          if (r.paidBy === 'karte') continue;
          const writtenCashNoBank = extractWrittenCashPart(r.rawText, r.amount);
          if (writtenCashNoBank > 0) {
            const isSale = r.type === 'QA24_SALE';
            const cashGegenkonto = isSale ? r.skr03Account || '8193' : '3200';
            const ref = (isSale ? r.invoiceNo || r.vin : r.vin || r.invoiceNo) || '';
            const dedupKey = `PARTCASH:${r.id}:${writtenCashNoBank}`;
            if (!bookedKasseKeys.has(dedupKey)) {
              bookedKasseKeys.add(dedupKey);
              allMonthlyItems.push({
                amount: writtenCashNoBank,
                sh: isSale ? 'S' : 'H',
                konto: '1000',
                gegenkonto: cashGegenkonto,
                buCode: '',
                belegdatum: r.belegdatum,
                belegfeld1: ref,
                belegfeld2: '',
                buchungstext: `${r.partner} - Baranteil (${r.vin || r.invoiceNo || 'Barzahlung'})`.slice(0, 60),
                currency: 'EUR',
                matchedBeleg: r,
              });
            }
            continue;
          }
          if (r.paidBy === 'überweisung' || /per\s*.{0,2}berweisung|zahlungsvereinbarung/i.test(r.rawText)) {
            // Document explicitly paid via bank transfer (e.g. Willi Kaiser) -> never Kasse
            continue;
          }

          // Cash purchase (Ankaufvertrag / Kaufvertrag QA24 = Käufer in Bar)
          if (r.type === 'QA24_PURCHASE' && (isExplicitFullCash(r.rawText) || r.paidCash || r.paidBy === 'bar' || /kasse/i.test(r.source_file))) {
            const dedupKey = `PURCHASE:${r.vin || r.partner}:${r.amount}`;
            if (bookedKasseKeys.has(dedupKey)) continue;
            bookedKasseKeys.add(dedupKey);

            allMonthlyItems.push({
              amount: r.amount,
              sh: 'H',
              konto: '1000',
              gegenkonto: '3200',
              buCode: '',
              belegdatum: r.belegdatum,
              belegfeld1: r.vin || r.invoiceNo || '',
              belegfeld2: '',
              buchungstext: (r.partner ? `${r.partner} - ${r.vin || 'Fahrzeugeinkauf'}` : `Fahrzeugeinkauf${r.vin ? ' ' + r.vin : ''}`).slice(0, 60),
              currency: 'EUR',
              matchedBeleg: r,
            });
            continue;
          }

          // QA24 sale invoice in cash (or with §25a and not received in bank) -> 1000 an 8193
          if (r.type === 'QA24_SALE' && (isExplicitFullCash(r.rawText) || r.paidCash || r.paidBy === 'bar' || /kasse/i.test(r.source_file))) {
            const dedupKey = `SALE:${r.vin || r.invoiceNo || r.partner}:${r.amount}`;
            if (bookedKasseKeys.has(dedupKey)) continue;
            bookedKasseKeys.add(dedupKey);

            allMonthlyItems.push({
              amount: r.amount,
              sh: 'S',
              konto: '1000',
              gegenkonto: r.skr03Account || '8193',
              buCode: '',
              belegdatum: r.belegdatum,
              belegfeld1: r.invoiceNo || r.vin || '',
              belegfeld2: '',
              buchungstext: `${r.partner} - ${r.vin || r.invoiceNo || 'Fahrzeugverkauf'}`.slice(0, 60),
              currency: 'EUR',
              matchedBeleg: r,
            });
            continue;
          }

          // Authority fee receipt (Gebühr) -> 4390 an 1000 (no VAT)
          if (r.skr03Account === '4390' || (/gewerbeanmeldung|gebühr|gebuehr/i.test(r.rawText) && r.amount <= 500)) {
            const dedupKey = `FEE:${r.id}`;
            if (bookedKasseKeys.has(dedupKey)) continue;
            bookedKasseKeys.add(dedupKey);

            allMonthlyItems.push({
              amount: r.amount,
              sh: 'H',
              konto: '1000',
              gegenkonto: '4390',
              buCode: '',
              belegdatum: r.belegdatum,
              belegfeld1: r.invoiceNo || '',
              belegfeld2: '',
              buchungstext: `${r.partner} - Gebühr`.slice(0, 60),
              currency: 'EUR',
              matchedBeleg: r,
            });
            continue;
          }

          // Small genuine Kasse operating receipts (DB / Bahn / Taxi 4673, Fuel 4530, TÜV/HU 4540)
          if (
            (r.type === 'RECEIPT' || r.type === 'SUPPLIER_INVOICE') &&
            r.amount <= 500 &&
            ['4530', '4673', '4540'].includes(r.skr03Account) &&
            (r.paidCash || r.paidBy === 'bar' || /kasse/i.test(r.source_file))
          ) {
            const dedupKey = `KASSE_RCPT:${r.id}`;
            if (bookedKasseKeys.has(dedupKey)) continue;
            bookedKasseKeys.add(dedupKey);

            const bu =
              r.buCode || (r.skr03Account === '4673' ? '8' : r.skr03Account === '4530' || r.skr03Account === '4540' ? '9' : '');
            const desc =
              r.skr03Account === '4673'
                ? 'Fahrtkosten / Reise'
                : r.skr03Account === '4530'
                ? 'Kraftstoff'
                : 'Kfz / TÜV';
            allMonthlyItems.push({
              amount: r.amount,
              sh: 'H',
              konto: '1000',
              gegenkonto: r.skr03Account,
              buCode: bu,
              belegdatum: r.belegdatum,
              belegfeld1: r.invoiceNo || '',
              belegfeld2: '',
              buchungstext: `${r.partner} - ${desc}`.slice(0, 60),
              currency: 'EUR',
              matchedBeleg: r,
            });
            continue;
          }
        }
      } else {
        // Step 4: NEVER book Belege onto Konto 1200 when no Bank Statement exists for this month (no standalone mode).
        // Review Gate will block export with "Kontoauszug (1200) vorhanden: fehlt".
        hasBankStatement = false;
        allMonthlyItems = [];
      }
    }

    // Build rich VIN & Invoice tax-regime intelligence from genuine Beleg documents (NEVER from BANK_STATEMENT docs!)
    const vinTaxMap = new Map<string, '8193' | '8400' | '8125'>();
    const invoiceTaxMap = new Map<string, '8193' | '8400' | '8125'>();
    const payeeTaxMap = new Map<string, '8193' | '8400' | '8125'>();
    for (const d of allDocs) {
      if (doc.client_id && d.client_id !== doc.client_id) continue;
      const ext = d.extracted_data;
      // Bug 1 Fix: NEVER derive tax maps from BANK_STATEMENT documents (one EU line on a bank statement must never taint other VINs on that statement)
      const isBankStmtDoc =
        ext?.document_type === 'BANK_STATEMENT' ||
        /bankstatement|kontoauszug|1200[-_ ]?bank|bank[-_]\d+/i.test(d.original_filename || '');
      if (isBankStmtDoc) continue;

      const dBookings = extractDocItems(d);
      const allText = `${d.original_filename || ''} ${ext?.supplier_name || ''} ${ext?.line_items_summary || ''} ${JSON.stringify(ext?.bookings || [])}`;
      const has3200Purchase = dBookings.some((b) => b.konto !== '1200' && b.gegenkonto === '3200');
      const hasExplicit19PurchaseOrInvoice =
        dBookings.some((b) => b.konto !== '1200' && b.gegenkonto === '3400') ||
        (Number(ext?.vat_rate_percent) === 19 &&
          Number(ext?.vat_amount) > 0 &&
          /(?:19\s*[,.]?\s*0{0,2}\s*%|mwst|mehrwertsteuer|umsatzsteuer)/i.test(allText));
      const isExplicit25a =
        (ext as any)?.tax_regime === 'margin_25a' ||
        has3200Purchase ||
        /(?:§\s*25a|differenzbesteuerung|gebrauchtgegenstände|sonderregelung)/i.test(allText);
      const isEuSale =
        (ext as any)?.tax_regime === 'eu_b2b_0' ||
        /(?:innergemeinschaftliche|eu-lieferung)/i.test(allText);

      // Bug 2 Fix: Provisional 8400 bookings must NEVER confirm themselves in vinTaxMap
      const targetAccount: '8193' | '8400' | '8125' | undefined = isEuSale
        ? '8125'
        : isExplicit25a
        ? '8193'
        : hasExplicit19PurchaseOrInvoice
        ? '8400'
        : undefined;

      if (targetAccount) {
        if (ext?.invoice_number) {
          invoiceTaxMap.set(normalizeKey(ext.invoice_number), targetAccount);
        }
        if (ext?.supplier_name) {
          const pKey = extractPayeePrefix(ext.supplier_name);
          if (pKey && pKey.length >= 3) {
            payeeTaxMap.set(pKey, targetAccount);
          }
        }
        for (const v of extractAllVins(allText)) {
          vinTaxMap.set(v, targetAccount);
        }
      }

      // Only scan confirmed non-bank purchase/sale Beleg bookings (never provisional 8400 or bank 1200 lines)
      for (const b of dBookings) {
        if (b.konto === '1200') continue;
        if (!['8125', '3200', '8193', '3400'].includes(b.gegenkonto)) continue;
        const bText = `${b.buchungstext || ''} ${b.belegfeld1 || ''}`;
        const bVins = extractAllVins(bText);
        if (bVins.length > 0) {
          const bTarget: '8193' | '8400' | '8125' =
            b.gegenkonto === '8125' ? '8125' : b.gegenkonto === '3200' || b.gegenkonto === '8193' ? '8193' : '8400';
          for (const vin of bVins) {
            const prev = vinTaxMap.get(vin);
            if (!prev || bTarget === '8125' || bTarget === '8193') {
              vinTaxMap.set(vin, bTarget);
            }
          }
        }
      }
    }

    // Merge cross-month OCR Beleg Index (multi-page PDFs grouped by invoice/contract/receipt)
    const indexedBelege = belegIndexService.getClientIndex(doc.client_id, yearNum, monthNum, 6);
    for (const r of indexedBelege) {
      let idxAcc: '8193' | '8400' | '8125' | undefined;
      if (r.taxClause === 'EU' || r.skr03Account === '8125' || (r.partner && clientRulesService.isEuDealer(doc.client_id, r.partner))) {
        idxAcc = '8125';
      } else if (r.type === 'QA24_PURCHASE' || r.skr03Account === '3200') {
        idxAcc = r.taxClause === '19' ? '8400' : '8193';
      } else if (r.type === 'QA24_SALE' || r.type === 'CONTRACT') {
        if (r.taxClause === '25a') idxAcc = '8193';
        else if (r.taxClause === '19') idxAcc = '8400';
      }
      if (idxAcc) {
        if (r.vin) {
          const existing = vinTaxMap.get(r.vin.toUpperCase());
          if (!existing || idxAcc === '8125' || idxAcc === '8193') {
            vinTaxMap.set(r.vin.toUpperCase(), idxAcc);
          }
        }
        if (r.invoiceNo) invoiceTaxMap.set(normalizeKey(r.invoiceNo), idxAcc);
        if (r.partner) {
          const pKey = extractPayeePrefix(r.partner);
          if (pKey && pKey.length >= 3) {
            const existingP = payeeTaxMap.get(pKey);
            if (!existingP || idxAcc === '8125' || idxAcc === '8193') {
              payeeTaxMap.set(pKey, idxAcc);
            }
          }
        }
      }
    }

    // Merge client rules from storage/rules/<client>.json (Golden Rule: zero hardcoded client data in code)
    const clientRules = clientRulesService.getRules(doc.client_id);
    if (clientRules?.vehicle_registry) {
      for (const [vKey, vRule] of Object.entries(clientRules.vehicle_registry)) {
        vinTaxMap.set(vKey.toUpperCase(), vRule.tax_key as any);
      }
    }
    if (clientRules?.payee_tax_mappings) {
      for (const [pKey, pTax] of Object.entries(clientRules.payee_tax_mappings)) {
        payeeTaxMap.set(pKey.toLowerCase(), pTax as any);
      }
    }

    const isStornoPair = (it: BookingItem): boolean => {
      if (it.konto !== '1200') return false;
      const amt = Number(it.amount) || 0;
      const p = extractPayeePrefix(it.buchungstext || '');
      if (!p || amt <= 0) return false;
      const oppSh = String(it.sh).toUpperCase() === 'S' ? 'H' : 'S';
      return allMonthlyItems.some(
        (other) =>
          other !== it &&
          other.konto === '1200' &&
          String(other.sh).toUpperCase() === oppSh &&
          Math.abs((Number(other.amount) || 0) - amt) < 0.05 &&
          (extractPayeePrefix(other.buchungstext || '') === p ||
            /(storno|rückzahlung|rueckzahlung|überzahlung|ueberzahlung|rückbuchung|rueckbuchung)/i.test(`${it.buchungstext} ${other.buchungstext}`))
      );
    };

    // Final deterministic SKR03 & VAT safety normalization before EXTF row generation
    // ── ONE PLACE FOR RULES ─────────────────────────────────────────────────────
    // This code only collects facts (matched Beleg, tax maps, month context) and applies the result.
    // Every account decision is made by ruleEngine.decideAccount().
    const taxMaps = { vin: vinTaxMap, invoice: invoiceTaxMap, payee: payeeTaxMap } as const;
    const capitalAccount = clientRulesService.getStammkapital(doc.client_id)?.account || '0800';
    let capitalBookedSoFar = priorCapitalBooked(allDocs, doc.client_id, yearNum, monthNum);
    const firstBankCredit = allMonthlyItems.find((i) => i.konto === '1200' && String(i.sh).toUpperCase() === 'S');
    const belegOf = new Map<BookingItem, ReturnType<typeof belegIndexService.findMatchForBankLine>>();

    const traceDecision = (item: BookingItem, d: RuleDecision) => {
      const m = belegOf.get(item);
      console.log(
        `[Decision Trace] Bank line ${item.belegdatum} "${item.buchungstext}" (${item.amount} €): ` +
        `step: ${d.step}, match: ${m ? m.matchedBy : 'none'}, record id: ${m?.record?.id || 'none'}, ` +
        `taxClause: ${m?.record?.taxClause || 'none'}, final account: ${d.account}${d.needsReview ? ' (provisional → review question)' : ''}, why: ${d.reason}`
      );
    };

    const applyDecision = (item: BookingItem, d: RuleDecision) => {
      item.gegenkonto = d.account;
      item.buCode = d.buCode;
      if (d.reviewKind === 'STAMMKAPITAL') {
        item.reviewHint = { type: 'STAMMKAPITAL_UNCLEAR', question: d.question || '' };
      } else if (d.reviewKind === 'MISSING_BELEG_INCOMING') {
        item.reviewHint = { type: 'MISSING_BELEG_INCOMING', question: d.question || '' };
      } else {
        delete item.reviewHint;
      }
      if (d.reviewKind === 'VIN_SALE') {
        const m = belegOf.get(item);
        const vins = extractAllVins(`${item.buchungstext || ''} ${item.belegfeld1 || ''}`.toUpperCase());
        const contractOrInvMatch =
          m?.record.invoiceNo ||
          (item.belegfeld1 && item.belegfeld1.length >= 4 && !/^\d{5}\s/.test(item.belegfeld1) ? item.belegfeld1 : '') ||
          (item.buchungstext || '').match(/\b(?:ReNr|Re-Nr|RG|RE|Re|VR|Vertrag|Kaufvertrag)[.:#\s-]*([A-Z0-9\/-]{2,15})\b/i)?.[1] ||
          '';
        item.carGroupKey = m?.record.vin || vins[0] || (contractOrInvMatch ? `ID:${contractOrInvMatch.toUpperCase()}` : undefined);
        if (!isStornoPair(item) && (Number(item.amount) || 0) >= 500) vinUnresolved.add(item);
      }
    };

    const decideItem = (item: BookingItem, links?: MonthLinks): RuleDecision => {
      const m = belegOf.get(item);
      const sh: 'S' | 'H' = String(item.sh).toUpperCase() === 'S' ? 'S' : 'H';
      return ruleEngine.decideAccount({
        clientId: doc.client_id,
        phase: 'normalize',
        konto: item.konto,
        sh,
        amount: Number(item.amount) || 0,
        text: item.buchungstext || '',
        belegfeld1: item.belegfeld1,
        currentAccount: item.gegenkonto,
        beleg: m
          ? { ...m.record, id: m.record.id, matchedBy: m.matchedBy }
          : item.matchedBeleg
          ? { ...(item.matchedBeleg as any), id: item.matchedBeleg.id, type: (item.matchedBeleg as any).type || (sh === 'S' ? 'QA24_SALE' : 'QA24_PURCHASE'), matchedBy: item.matchedBy || 'Kassenbeleg' }
          : null,
        taxMaps,
        stammkapital: {
          holderInGruendung,
          isFirstCreditAfterZeroOpening:
            item === firstBankCredit && openingBalance !== undefined && Math.abs(openingBalance) < 0.005,
          earlierBooked: capitalBookedSoFar,
        },
        links,
      });
    };

    const firstPass = new Map<BookingItem, RuleDecision>();
    for (const item of allMonthlyItems) {
      const belegMatch =
        !item.matchedBeleg && item.konto === '1200' && indexedBelege.length > 0
          ? belegIndexService.findMatchForBankLine(
              indexedBelege,
              item.buchungstext || '',
              Number(item.amount) || 0,
              String(item.sh).toUpperCase() === 'S' ? 'S' : 'H',
              item.belegdatum || '',
              item.belegfeld1
            )
          : null;
      if (belegMatch) {
        belegOf.set(item, belegMatch);
        item.matchedBy = belegMatch.matchedBy;
        item.matchedBeleg = {
          id: belegMatch.record.id,
          source_file: belegMatch.record.source_file,
          pages: belegMatch.record.pages,
          partner: belegMatch.record.partner,
          invoiceNo: belegMatch.record.invoiceNo,
          vin: belegMatch.record.vin,
          amount: belegMatch.record.amount,
          taxClause: belegMatch.record.taxClause,
          snippet: belegMatch.record.matchedLineSnippet,
          document_id: belegMatch.record.document_id,
        };
        if ((!item.belegfeld1 || /^bank/i.test(item.belegfeld1)) && belegMatch.record.invoiceNo) {
          const isSaleRecord = belegMatch.record.type === 'QA24_SALE' || belegMatch.record.taxClause === '25a' || belegMatch.record.taxClause === 'EU';
          // A sales invoice number never belongs on a purchase (outgoing) line
          if (!(item.sh === 'H' && isSaleRecord)) item.belegfeld1 = belegMatch.record.invoiceNo;
        }
      }
      const d = decideItem(item);
      applyDecision(item, d);
      firstPass.set(item, d);
      if (d.step === 'b-special' && !d.needsReview && d.account === capitalAccount && item.konto === '1200' && String(item.sh).toUpperCase() === 'S') {
        capitalBookedSoFar += Number(item.amount) || 0;
      }
      if (d.step !== 'd-vendor' || d.needsReview) traceDecision(item, d);
    }

    // Second pass: follow-up payments (Teil 2 / Restzahlung / same VIN) are linked to the already decided payment
    const links: MonthLinks = { purchaseVins: new Set<string>(), purchasePayee: new Map<string, string>(), salePayee: new Map<string, string>() };
    for (const item of allMonthlyItems) {
      const prefix = extractPayeePrefix(item.buchungstext || '');
      if (item.sh === 'H' && item.gegenkonto === '3200') {
        extractAllVins(`${item.buchungstext || ''} ${item.belegfeld1 || ''}`).forEach((v) => links.purchaseVins.add(v));
      }
      if (!prefix) continue;
      if (item.sh === 'H' && ['3200', '3400'].includes(item.gegenkonto)) links.purchasePayee.set(prefix, item.gegenkonto);
      else if (item.sh === 'S' && ['8193', '8400', '8125'].includes(item.gegenkonto)) links.salePayee.set(prefix, item.gegenkonto);
    }
    for (const item of allMonthlyItems) {
      const d1 = firstPass.get(item);
      if (!d1?.needsReview || d1.reviewKind === 'STAMMKAPITAL' || d1.reviewKind === 'MISSING_BELEG_INCOMING') continue;
      const d2 = decideItem(item, links);
      if (d2.needsReview) continue; // still unresolved → stays a review question
      applyDecision(item, d2);
      vinUnresolved.delete(item);
      if (d2.linkedPayee) {
        const certain = allMonthlyItems.some(
          (other) =>
            other !== item && other.sh === 'S' && !vinUnresolved.has(other) &&
            other.gegenkonto === item.gegenkonto && extractPayeePrefix(other.buchungstext || '') === d2.linkedPayee
        );
        if (!certain) vinUnresolved.add(item);
      }
      traceDecision(item, d2);
    }

    // Auto-generate Kasse (1000) counter-entries for Geldtransit (1360) withdrawals 1-to-1
    // (runs AFTER ruleEngine.decideAccount so vehicle purchases / other 1200 lines are already finalized)
    const existingKasseCounts = new Map<string, number>();
    for (const it of allMonthlyItems) {
      if (it.konto === '1000' && it.gegenkonto === '1360') {
        const d = (it.belegdatum || '').replace(/[^0-9]/g, '').slice(-4);
        const key = `${d}|${Number(it.amount).toFixed(2)}`;
        existingKasseCounts.set(key, (existingKasseCounts.get(key) || 0) + 1);
      }
    }
    const transitWithdrawals = allMonthlyItems.filter(
      (it) => it.konto === '1200' && it.gegenkonto === '1360' && String(it.sh).toUpperCase() === 'H'
    );
    for (const tw of transitWithdrawals) {
      let cashAmount = Number(tw.amount) || 0;
      const auszahlungMatch = (tw.buchungstext || '').match(/Auszahlung\s+([\d.,]+)\s*EUR/i);
      if (auszahlungMatch) {
        const parsedCash = parseFloat(auszahlungMatch[1].replace(/\./g, '').replace(',', '.'));
        if (!isNaN(parsedCash) && parsedCash > 0 && parsedCash <= cashAmount) {
          cashAmount = parsedCash;
        }
      }
      const d = (tw.belegdatum || '').replace(/[^0-9]/g, '').slice(-4);
      const kasseKey = `${d}|${cashAmount.toFixed(2)}`;
      const remainingExisting = existingKasseCounts.get(kasseKey) || 0;
      if (remainingExisting > 0) {
        existingKasseCounts.set(kasseKey, remainingExisting - 1);
      } else {
        allMonthlyItems.push({
          amount: cashAmount,
          sh: 'S',
          konto: '1000',
          gegenkonto: '1360',
          buCode: '',
          belegdatum: tw.belegdatum,
          belegfeld1: 'KASSE-BAR',
          belegfeld2: '',
          buchungstext: 'Bareinzahlung Kasse - Auszahlung',
          currency: 'EUR',
        });
      }
    }

    // Collect prior-month open items (OPOS: 1600 Kreditor / 1400 Debitor) and prior-month 3200 purchase VINs
    const exportDirForOpening = this.getExportDir();
    const priorExportFiles = fs.existsSync(exportDirForOpening) ? fs.readdirSync(exportDirForOpening) : [];
    const addPrior3200Vin = (vin: string | null | undefined, m: number) => {
      if (!vin || vin.length !== 17) return;
      const list = priorMonth3200Vins.get(vin) || [];
      if (!list.includes(m)) list.push(m);
      priorMonth3200Vins.set(vin, list);
    };
    const addPriorOpenItem = (op: {
      kind: '1600' | '1400';
      month: number;
      amount: number;
      vin?: string;
      invoiceNo?: string;
      partner: string;
    }) => {
      const exists = priorOpenItems.some(
        (e) =>
          e.kind === op.kind &&
          e.month === op.month &&
          ((e.vin && op.vin && areVinsFuzzyEqual(e.vin, op.vin, 2)) ||
            (e.invoiceNo && op.invoiceNo && e.invoiceNo.toLowerCase() === op.invoiceNo.toLowerCase()) ||
            Math.abs(e.amount - op.amount) < 0.05)
      );
      if (!exists) priorOpenItems.push(op);
    };

    const allLookbackRecords = belegIndexService.getClientIndex(doc.client_id, yearNum, monthNum, 6);
    for (let mPrev = 1; mPrev < monthNum; mPrev++) {
      // 1. Check prior month's latest exported EXTF CSV
      const monthFileRe = new RegExp(`^EXTF_Buchungen_\\d{8}_\\d{6}_${yearNum}_${mPrev}\\.csv$`);
      const candidates = priorExportFiles.filter((f) => monthFileRe.test(f)).sort((a, b) => b.localeCompare(a));
      for (const fname of candidates) {
        try {
          const rawCsv = fs.readFileSync(path.join(exportDirForOpening, fname), 'utf-8');
          const headerCols = (rawCsv.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '').split(';');
          const csvMandant = (headerCols[11] || '').replace(/"/g, '').trim();
          if (csvMandant && String(mandantenNr) && csvMandant !== String(mandantenNr)) continue;
          const parsedPrev = parseDatevExtfCsv(rawCsv);
          for (const row of parsedPrev) {
            const rVin = extractVinFromText(`${row.buchungstext} ${row.belegfeld1}`) || undefined;
            if ((row.konto === '3200' && row.sh === 'S') || (row.gegenkonto === '3200' && row.sh === 'H')) {
              addPrior3200Vin(rVin, mPrev);
            }
            if ((row.gegenkonto === '1600' && row.sh === 'S') || (row.konto === '1600' && row.sh === 'H')) {
              addPriorOpenItem({
                kind: '1600',
                month: mPrev,
                amount: row.amount,
                vin: rVin,
                invoiceNo: row.belegfeld1 || undefined,
                partner: row.buchungstext,
              });
            }
            if ((row.konto === '1400' && row.sh === 'S') || (row.gegenkonto === '1400' && row.sh === 'H')) {
              addPriorOpenItem({
                kind: '1400',
                month: mPrev,
                amount: row.amount,
                vin: rVin,
                invoiceNo: row.belegfeld1 || undefined,
                partner: row.buchungstext,
              });
            }
          }
          break;
        } catch {
          // try older candidate
        }
      }
      // 2. Check prior month's saved review resolutions (OPEN_INVOICE / PARTIAL to 1600 or 1400) and prior 3200 Belege
      const prevScope = reviewService.scopeKey(doc.client_id, yearNum, mPrev);
      const prevSaved = reviewService.getResolutions(prevScope);
      for (const [k, res] of Object.entries(prevSaved)) {
        if (res.action === 'EXCLUDE') continue;
        if (k.startsWith('OPEN_INVOICE:')) {
          const recId = k.slice('OPEN_INVOICE:'.length);
          const rec = allLookbackRecords.find((r) => r.id === recId);
          if (rec) {
            const kind: '1600' | '1400' = res.gegenkonto === '1400' || rec.type === 'QA24_SALE' ? '1400' : '1600';
            addPriorOpenItem({
              kind,
              month: mPrev,
              amount: rec.amount,
              vin: rec.vin || undefined,
              invoiceNo: rec.invoiceNo || undefined,
              partner: rec.partner,
            });
            if (kind === '1600' && (rec.skr03Account === '3200' || rec.type === 'QA24_PURCHASE')) {
              addPrior3200Vin(rec.vin, mPrev);
            }
          }
        }
      }
      for (const rec of allLookbackRecords) {
        if (rec.year === yearNum && rec.month === mPrev && rec.type === 'QA24_PURCHASE' && rec.amount > 0 && rec.vin) {
          addPrior3200Vin(rec.vin, mPrev);
        }
      }
    }

    const matchPriorOpenItem = (it: BookingItem) => {
      if (it.konto !== '1200' && it.konto !== '1000') return null;
      if (it.gegenkonto === '1360' || it.gegenkonto === '4970' || it.gegenkonto === '0730') return null;
      const shUp = String(it.sh).toUpperCase();
      const targetKind: '1600' | '1400' = shUp === 'H' ? '1600' : '1400';
      const itTxt = `${it.buchungstext || ''} ${it.belegfeld1 || ''} ${it.matchedBeleg?.partner || ''} ${it.matchedBeleg?.vin || ''}`;
      const itVin = extractVinFromText(itTxt) || it.matchedBeleg?.vin || undefined;
      const itAmt = Number(it.amount) || 0;
      const itWords = itTxt
        .toLowerCase()
        .split(/[^a-zäöüß]+/)
        .filter((w) => w.length >= 4 && !/^(gmbh|auto|autohaus|automotive|opel|adam|corsa|audi|tesla|model|bmw|kauf|service|inhaber|zahlung|rechnung|securego|plus|iban|entgelt)$/.test(w));

      for (const op of priorOpenItems) {
        if (op.kind !== targetKind) continue;
        if (op.vin && itVin && (op.vin === itVin || areVinsFuzzyEqual(op.vin, itVin, 2))) {
          return op;
        }
        if (op.invoiceNo && op.invoiceNo.length >= 4 && (it.belegfeld1 || '').toLowerCase() === op.invoiceNo.toLowerCase()) {
          return op;
        }
        const opWords = (op.partner || '')
          .toLowerCase()
          .split(/[^a-zäöüß]+/)
          .filter((w) => w.length >= 4 && !/^(gmbh|auto|autohaus|automotive|opel|adam|corsa|audi|tesla|model|bmw|kauf|service|inhaber|offene|rechnung)$/.test(w));
        const sharedName = opWords.some((ow) => itWords.includes(ow));
        if (sharedName && Math.abs(itAmt - op.amount) <= 1.0) {
          return op;
        }
      }
      return null;
    };

    // Rule 1 (OPOS): Before finalizing outgoing/incoming payments, check open 1600 (Kreditor) / 1400 (Debitor) items from earlier months
    for (const item of allMonthlyItems) {
      const matchedOp = matchPriorOpenItem(item);
      if (matchedOp) {
        item.gegenkonto = matchedOp.kind;
        item.buCode = '';
        vinUnresolved.delete(item);
        console.log(
          `[OPOS Clearing ${yearNum}-${monthPadded}] ${item.belegdatum} "${item.buchungstext}" (${Number(item.amount).toFixed(2)} €) clears open ${matchedOp.kind} from ${matchedOp.month}/${yearNum} (${matchedOp.partner})`
        );
      }
    }

    // Capture pre-resolution proposals before vendor rules & user answers are applied
    preResolutionBankBookings = allMonthlyItems
      .filter((it) => it.konto === '1200')
      .map((it) => ({ ...it }));
    preResolutionItems = allMonthlyItems.map((it) => ({ ...it }));

    // ─────────────────────────────────────────────────────────────────────────────
    // REVIEW GATE: user-confirmed vendor rules → saved user answers → doubt detection
    // ─────────────────────────────────────────────────────────────────────────────
    const vendorRuleHits = reviewService.applyVendorRules(allMonthlyItems);
    if (vendorRuleHits > 0) {
      console.log(`[Review Gate ${yearNum}-${monthPadded}] Applied ${vendorRuleHits} user-confirmed vendor rule(s).`);
    }
    lineKeys = reviewService.assignLineKeys(allMonthlyItems);
    const resApplied = reviewService.applyResolutions(reviewScope, allMonthlyItems, lineKeys);
    allMonthlyItems = resApplied.kept;
    excluded = resApplied.excluded;
    resolvedKeys = resApplied.resolvedKeys;
    lineResolutionTargets = resApplied.lineResolutionTargets;
    // Re-apply OPOS clearing in case a stale resolution overwrote an open-item payment with 3200
    for (const item of allMonthlyItems) {
      const matchedOp = matchPriorOpenItem(item);
      if (matchedOp && item.gegenkonto === '3200') {
        item.gegenkonto = matchedOp.kind;
        item.buCode = '';
      }
    }
    // Calculate cumulative Kasse 1000 opening balance from prior months:
    // Priority 1: Locked month snapshot -> Priority 2: Month N-1 exported EXTF CSV -> Priority 3: Prior raw doc fallback
    const computePriorMonthRawFallback = (mPrev: number): number => {
      const priorBankVins = new Set<string>();
      const priorBankAmounts: number[] = [];
      let bankTransit = 0;
      let hasBankTransit = false;
      const seenStmts = new Set<string>();
      for (const d of allDocs) {
        if (doc.client_id && d.client_id !== doc.client_id) continue;
        const dMeta = googleDriveService.resolveYearAndMonth(d.extracted_data?.invoice_date, d.original_filename);
        if (Number(dMeta.year) !== yearNum) continue;
        const isStmt = d.extracted_data?.document_type === 'BANK_STATEMENT' || /bankstatement|kontoauszug|1200-bank/i.test(d.original_filename || '');
        if (!isStmt) continue;
        const stmtDedupKey = d.file_checksum
          ? `chk:${d.file_checksum}`
          : typeof d.extracted_data?.opening_balance === 'number' && typeof d.extracted_data?.closing_balance === 'number'
          ? `bal:${d.extracted_data.opening_balance.toFixed(2)}|${d.extracted_data.closing_balance.toFixed(2)}`
          : (d.original_filename || d.id).toLowerCase().replace(/\s*\(\d+\)\s*(?=\.[a-z0-9]+$|$)/gi, '').trim();
        if (seenStmts.has(stmtDedupKey)) continue;
        seenStmts.add(stmtDedupKey);
        for (const b of extractDocItems(d)) {
          const bMonth = parseInt((b.belegdatum || '').replace(/[^0-9]/g, '').slice(-2), 10) || Number(dMeta.monthNum);
          if (bMonth !== mPrev || b.konto !== '1200') continue;
          const amt = Number(b.amount) || 0;
          priorBankAmounts.push(amt);
          extractAllVins(`${b.buchungstext || ''} ${b.belegfeld1 || ''}`).forEach((v) => priorBankVins.add(v));
          if (b.gegenkonto === '1360') {
            hasBankTransit = true;
            bankTransit += String(b.sh).toUpperCase() === 'H' ? amt : -amt;
          }
        }
      }
      let monthDelta = 0;
      let kasseTransit = 0;
      let hasKasseTransit = false;
      for (const d of allDocs) {
        if (doc.client_id && d.client_id !== doc.client_id) continue;
        if (/bankbeleg/i.test(d.original_filename || '')) continue;
        if (/\[SUMMARY_LIST\]/i.test(d.extracted_data?.line_items_summary || '')) continue;
        const dMeta = googleDriveService.resolveYearAndMonth(d.extracted_data?.invoice_date, d.original_filename);
        if (Number(dMeta.year) !== yearNum) continue;
        for (const b of extractDocItems(d)) {
          const bMonth = parseInt((b.belegdatum || '').replace(/[^0-9]/g, '').slice(-2), 10) || Number(dMeta.monthNum);
          if (bMonth !== mPrev || b.konto !== '1000') continue;
          const kText = b.buchungstext || '';
          const kAmt = Number(b.amount) || 0;
          if (clientRulesService.isForeignClient(doc.client_id, kText)) continue;
          if (/ankaufvertrag/i.test(kText) && b.sh === 'S') continue;
          if (kAmt > 50000 && b.gegenkonto !== '1360') continue;
          if (/\[SUMMARY_LIST\]|itemized\s*list|monatsabrechnung|sammelrechnung|tankkarten[-\s]*abrechnung|zusammenfassung/i.test(kText) || (/\baral\b/i.test(kText) && kAmt > 250)) continue;
          if (/überwiesen|ueberwiesen|bank|sparkasse|volksbank|girocard|ec-chip|ec-cash|kartenzahlung|kundenbeleg|sepa|lastschrift|mastercard|visa/i.test(kText)) continue;
          if (extractAllVins(`${kText} ${b.belegfeld1 || ''}`).some((v) => priorBankVins.has(v))) continue;
          if (b.gegenkonto !== '1360' && priorBankAmounts.some((ba) => Math.abs(ba - kAmt) < 1.0)) continue;
          const delta = (String(b.sh).toUpperCase() === 'S' ? 1 : -1) * kAmt;
          if (b.gegenkonto === '1360') {
            hasKasseTransit = true;
            kasseTransit += delta;
          } else {
            monthDelta += delta;
          }
        }
      }
      if (hasBankTransit) monthDelta += bankTransit;
      else if (hasKasseTransit) monthDelta += kasseTransit;
      return Math.round(monthDelta * 100) / 100;
    };

    for (let mPrev = 1; mPrev < monthNum; mPrev++) {
      const prevLock = monthLockService.getLock(doc.client_id || 'user_client_1', yearNum, mPrev);
      if (prevLock) {
        let lockDelta = 0;
        for (const b of prevLock.bookings) {
          const amt = Number(b.amount) || 0;
          const shUp = String(b.sh).toUpperCase();
          if (b.konto === '1000') lockDelta += shUp === 'S' ? amt : -amt;
          else if (b.gegenkonto === '1000') lockDelta += shUp === 'S' ? -amt : amt;
        }
        kasseOpeningBalance = Math.round((kasseOpeningBalance + lockDelta) * 100) / 100;
        continue;
      }

      const monthFileRe = new RegExp(`^EXTF_Buchungen_\\d{8}_\\d{6}_${yearNum}_${mPrev}\\.csv$`);
      const candidates = priorExportFiles.filter((f) => monthFileRe.test(f)).sort((a, b) => b.localeCompare(a));
      let csvDelta: number | null = null;
      for (const fname of candidates) {
        try {
          const rawCsv = fs.readFileSync(path.join(exportDirForOpening, fname), 'utf-8');
          const headerCols = (rawCsv.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '').split(';');
          const csvMandant = (headerCols[11] || '').replace(/"/g, '').trim();
          if (csvMandant && String(mandantenNr) && csvMandant !== String(mandantenNr)) continue;
          const parsedPrev = parseDatevExtfCsv(rawCsv);
          let sum1000 = 0;
          for (const row of parsedPrev) {
            if (row.konto === '1000') sum1000 += row.sh === 'S' ? row.amount : -row.amount;
            else if (row.gegenkonto === '1000') sum1000 += row.sh === 'S' ? -row.amount : row.amount;
          }
          csvDelta = Math.round(sum1000 * 100) / 100;
          break;
        } catch {
          // try older candidate
        }
      }
      if (csvDelta !== null) {
        kasseOpeningBalance = Math.round((kasseOpeningBalance + csvDelta) * 100) / 100;
      } else {
        kasseOpeningBalance = Math.round((kasseOpeningBalance + computePriorMonthRawFallback(mPrev)) * 100) / 100;
      }
    }
    const matRes = reviewService.materializeResolvedDecisions({
      items: allMonthlyItems,
      lineKeys,
      resolvedKeys,
      allClientRecords,
      month: monthNum,
      kasseOpeningBalance,
    });
    allMonthlyItems = matRes.items;
    materializedDecisions = matRes.materialized;
    missingMaterializations = matRes.missingMaterializations;
    } // end if (!activeLock)

    // Scrub invalid placeholder "KeineRechnung" from Belegfeld 2 on all items before audit/export/persist
    for (const it of allMonthlyItems) {
      if (it.belegfeld2 && /^keinerechnung$/i.test(it.belegfeld2.trim())) {
        it.belegfeld2 = '';
      }
    }

    const reviewReport = reviewService.analyze(allMonthlyItems, {
      scope: reviewScope,
      clientId: doc.client_id || 'user_client_1',
      year: yearNum,
      month: monthNum,
      hasBankStatement,
      openingBalance,
      closingBalance,
      bankReconciliation: (doc.extracted_data as any)?.bank_reconciliation || (allDocs.find((d) => (d.extracted_data as any)?.bank_reconciliation)?.extracted_data as any)?.bank_reconciliation,
      kasseOpeningBalance,
      vinUnresolved,
      lineKeys,
      excludedLines: excluded,
      resolvedKeys,
      lineResolutionTargets,
      materializedDecisions,
      preResolutionItems,
      allClientRecords,
      partialPayments,
      priorOpenItems,
      priorMonth3200Vins,
    });
    reviewReport.locked = Boolean(activeLock);
    if (activeLock) {
      reviewReport.locked_at = activeLock.locked_at;
    }
    console.log(
      `[Review Gate ${yearNum}-${monthPadded}] ${reviewReport.total_bookings} bookings | auto ${reviewReport.auto_booked} | open critical ${reviewReport.open_critical} | warnings ${reviewReport.open_warnings} | ${reviewReport.blocked ? 'EXPORT BLOCKED: ' + reviewReport.block_reasons.join(' ; ') : 'CSV READY ✅'}`
    );
    if (reviewReport.accuracy) {
      const acc = reviewReport.accuracy;
      console.log(
        `[Accuracy ${yearNum}-${monthPadded}] Total=${acc.total_bookings} | Auto-Correct=${acc.auto_correct} (${acc.auto_correct_pct.toFixed(1)}%) | Questions=${acc.questions_asked} (Beleg fehlt: ${acc.questions_by_type.beleg_fehlt}, Entscheidung: ${acc.questions_by_type.entscheidung}, Unreadable: ${acc.questions_by_type.unreadable}) | User-Changed=${acc.user_changed} | Goal=${acc.goal_met ? 'PASS ✅' : 'FAIL ❌'}`
      );
    }

    // Automatic Self-Audit Reconciliation Check before EXTF generation
    let auditBankNet = 0;
    let auditKasseNet = 0;
    let auditTransitNet = 0;
    let auditBankCount = 0;
    for (const it of allMonthlyItems) {
      const amt = Number(it.amount) || 0;
      const shUp = String(it.sh).toUpperCase();
      if (it.konto === '1200') {
        auditBankCount++;
        auditBankNet += shUp === 'S' ? amt : -amt;
      } else if (it.konto === '1000') {
        auditKasseNet += shUp === 'S' ? amt : -amt;
      }
      if (it.gegenkonto === '1360') {
        if (it.konto === '1200' && shUp === 'H') auditTransitNet += amt;
        if (it.konto === '1000' && shUp === 'S') auditTransitNet -= amt;
      }
    }
    console.log(
      `[Self-Audit ${yearNum}-${monthPadded}] Rows=${allMonthlyItems.length} | Bank1200(${auditBankCount})=${auditBankNet.toFixed(2)} EUR | Kasse1000=${auditKasseNet.toFixed(2)} EUR | Transit1360=${auditTransitNet.toFixed(2)} EUR`
    );
    if (reviewReport.kasse_items && reviewReport.kasse_items.length > 0) {
      console.log(
        `[Kasse 1000 List ${yearNum}-${monthPadded}] Start=${kasseOpeningBalance.toFixed(2)} EUR | Entries=${reviewReport.kasse_items.length} | End=${(kasseOpeningBalance + auditKasseNet).toFixed(2)} EUR`
      );
      for (const ki of reviewReport.kasse_items) {
        const src = ki.source_file ? `${ki.source_file}${ki.pages && ki.pages.length ? ' p.' + ki.pages.join(',') : ''}` : 'Bank 1200 / Geldtransit';
        console.log(
          `  ${ki.date} | ${ki.sh} | ${ki.amount.toFixed(2).padStart(10, ' ')} € | 1000->${ki.gegenkonto.padEnd(4, ' ')} | Saldo ${ki.running_balance.toFixed(2).padStart(10, ' ')} € | ${src} | "${ki.text}"`
        );
      }
    }

    // Persist freshly recalculated pre-resolution bookings back to document records in database
    if (!activeLock && hasBankStatement && monthDocs.length > 0 && opts.writeFiles !== false) {
      for (const bd of monthDocs) {
        if (bd.id && bd.extracted_data?.document_type === 'BANK_STATEMENT') {
          dbService.update(bd.id, {
            extracted_data: {
              ...bd.extracted_data,
              bookings: preResolutionBankBookings,
            } as any,
          });
        }
      }
    }

    // Build standard 124-field rows from the complete merged items
    const activeRows: string[] = allMonthlyItems.map((item) => {
      const shKey = (String(item.sh).toUpperCase() === 'S') ? '"S"' : '"H"';
      const formattedAmount = item.amount.toFixed(2).replace('.', ',');
      const belegdatum = (item.belegdatum || '0101').replace(/[^0-9]/g, '').slice(-4);
      const rawText = (item.buchungstext || '').replace(/[;"\r\n]/g, '').trim();
      const buchungstext = rawText ? `"${rawText.substring(0, 60)}"` : '""';
      const rawField1 = (item.belegfeld1 || '').replace(/[;"\r\n]/g, '').trim();
      const belegfeld1 = rawField1 ? `"${rawField1.substring(0, 36)}"` : '""';
      let rawField2 = (item.belegfeld2 || '').replace(/[;"\r\n]/g, '').trim();
      if (/^keinerechnung$/i.test(rawField2)) rawField2 = '';
      const belegfeld2 = rawField2 ? `"${rawField2.substring(0, 12)}"` : '""';
      const buCode = item.buCode ? `"${item.buCode.replace(/"/g, '')}"` : '""';

      const fields = new Array(124);
      for (let i = 0; i < 124; i++) {
        fields[i] = UNQUOTED_EMPTY_INDICES.has(i) ? '' : '""';
      }

      fields[0] = formattedAmount;
      fields[1] = shKey;
      fields[6] = item.konto || '1000';
      fields[7] = item.gegenkonto || '3300';
      fields[8] = buCode;
      fields[9] = belegdatum;
      fields[10] = belegfeld1;
      fields[11] = belegfeld2;
      fields[13] = buchungstext;
      fields[113] = '0';

      return fields.join(';');
    });

    // 1. EXTF_Buchungen_<YYYYMMDD>_<HHMMSS>_<YEAR>_<M>.csv
    const buchungenCsvFileName = `EXTF_Buchungen_${datePart}_${timePart}_${yearNum}_${monthNum}.csv`;
    const buchungenCsvContent = '\uFEFF' + [line1, line2, ...activeRows].join('\r\n') + '\r\n';

    // Post-CSV self-validator: parse the built CSV file itself and run all hard integrity checks on it
    const csvChecks = reviewService.validateExportedCsv(buchungenCsvContent, {
      hasBankStatement,
      openingBalance,
      closingBalance,
      kasseOpeningBalance,
      resolvedKeys,
      lineResolutionTargets,
      materializedDecisions,
      missingMaterializations,
    });
    reviewReport.checks.push(...csvChecks);
    const failedCsvChecks = csvChecks.filter((c) => c.critical && c.status === 'FAIL');
    if (failedCsvChecks.length > 0) {
      reviewReport.blocked = true;
      reviewReport.csv_ready = false;
      for (const fc of failedCsvChecks) {
        reviewReport.block_reasons.push(`${fc.label}: ${fc.hint || `${fc.value} (expected ${fc.expected})`}`);
      }
      console.warn(
        `[Post-CSV Validator ${yearNum}-${monthPadded}] EXPORT BLOCKED: ${failedCsvChecks.map((c) => `${c.id}=${c.value}`).join(' ; ')}`
      );
    }

    // 2. EXTF_Personenkonten_<YYYYMMDD>_<HHMMSS>_<YEAR>.csv
    const personenkontenCsvFileName = `EXTF_Personenkonten_${datePart}_${timePartPersonen}_${yearNum}.csv`;
    const personenkontenCsvContent = generatePersonenkontenCsvContent(
      monthDocs,
      allMonthlyItems,
      yearNum,
      timestampPersonen,
      mandantenNr,
      beraterName
    );

    // 3. EXTF_Sachkonten_<YYYYMMDD>_<HHMMSS>_<YEAR>.csv
    const sachkontenCsvFileName = `EXTF_Sachkonten_${datePart}_${timePart}_${yearNum}.csv`;
    const sachkontenCsvContent = generateSachkontenCsvContent(
      allMonthlyItems,
      yearNum,
      timestampSachkonten,
      (code) => this.getAccountDescription(code),
      mandantenNr,
      beraterName
    );

    // Keep Excel buffers as read-only preview (_VORSCHAU.xlsx) for /api/documents/:id/skr03-xlsx
    const singleXlsxFileName = `EXTF_Buchungen_${datePart}_${timePart}_${yearNum}_${monthNum}_VORSCHAU.xlsx`;
    const singleXlsxContent = this.buildSkr03ExcelWorkbook(allMonthlyItems, yearNum, monthPadded, `EXTF ${yearNum}/${monthPadded}`);

    // HARD EXPORT BLOCKER: while critical doubts / failed control checks remain, NO DATEV CSV is released.
    const releaseCsv = !reviewReport.blocked || opts.allowBlocked === true;
    if (!releaseCsv) {
      return {
        singleCsvContent: '',
        singleCsvFileName: '',
        singleXlsxContent: undefined,
        singleXlsxFileName: undefined,
        monthlyCsvContent: '',
        monthlyCsvFileName: '',
        monthlyXlsxContent: undefined,
        monthlyXlsxFileName: undefined,
        buchungenCsvContent: '',
        buchungenCsvFileName: '',
        personenkontenCsvContent: '',
        personenkontenCsvFileName: '',
        sachkontenCsvContent: '',
        sachkontenCsvFileName: '',
        bookingCount: activeRows.length,
        monthlyItems: allMonthlyItems,
        reviewReport,
      };
    }

    // Save the 3 EXTF CSV files + Fragen.txt to local storage/exports
    if (opts.writeFiles !== false) {
      const exportDir = this.getExportDir();
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      fs.writeFileSync(path.join(exportDir, buchungenCsvFileName), buchungenCsvContent, 'utf-8');
      fs.writeFileSync(path.join(exportDir, personenkontenCsvFileName), personenkontenCsvContent, 'utf-8');
      fs.writeFileSync(path.join(exportDir, sachkontenCsvFileName), sachkontenCsvContent, 'utf-8');

      // Generate Fragen.txt listing open items (open 1400/1600, unknown accounts, open review issues)
      const open1400_1600 = allMonthlyItems.filter(
        (it) => ['1400', '1600'].includes(it.konto) || ['1400', '1600'].includes(it.gegenkonto)
      );
      const openQuestions = reviewReport.issues.filter((i) => !i.resolved);
      const fragenLines: string[] = [
        `OFFENE FRAGEN & OPOS — ${doc.client_id || ''} (${monthPadded}/${yearNum})`,
        `Erstellt: ${new Date().toISOString()}`,
        '================================================================',
        '',
        `1. OFFENE REVIEW-FRAGEN (${openQuestions.length}):`,
        ...openQuestions.map(
          (q, idx) =>
            `  ${idx + 1}. [${q.severity}] ${q.booking.date} | ${q.booking.amount.toFixed(2)} EUR | ${q.title} — ${q.question}`
        ),
        '',
        `2. OFFENE POSTEN 1400 / 1600 (${open1400_1600.length}):`,
        ...open1400_1600.map(
          (it, idx) =>
            `  ${idx + 1}. ${it.belegdatum} | ${Number(it.amount).toFixed(2)} EUR | ${it.konto} -> ${it.gegenkonto} | ${it.buchungstext}`
        ),
      ];
      fs.writeFileSync(
        path.join(exportDir, `Fragen_${yearNum}_${monthPadded}.txt`),
        fragenLines.join('\r\n'),
        'utf-8'
      );
    }

    return {
      singleCsvContent: buchungenCsvContent,
      singleCsvFileName: buchungenCsvFileName,
      singleXlsxContent,
      singleXlsxFileName,
      monthlyCsvContent: buchungenCsvContent,
      monthlyCsvFileName: buchungenCsvFileName,
      monthlyXlsxContent: singleXlsxContent,
      monthlyXlsxFileName: singleXlsxFileName,
      buchungenCsvContent,
      buchungenCsvFileName,
      personenkontenCsvContent,
      personenkontenCsvFileName,
      sachkontenCsvContent,
      sachkontenCsvFileName,
      bookingCount: activeRows.length,
      monthlyItems: allMonthlyItems,
      reviewReport,
    };
  },
};
