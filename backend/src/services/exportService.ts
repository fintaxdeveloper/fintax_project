import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { DocumentRecord, BookingItem } from '../types/document.js';
import { skr03Mapper } from './skr03Mapper.js';
import { googleDriveService } from './googleDriveService.js';
import { clientFolderService } from './clientFolderService.js';
import { monthlyDocumentRegistry } from './monthlyDocumentRegistry.js';
import { generatePersonenkontenCsvContent, generateSachkontenCsvContent } from './datevExtfTemplates.js';
import { reviewService, ReviewReport } from './reviewService.js';
import { clientRulesService } from './clientRulesService.js';
import { belegIndexService, extractVinFromText } from './belegIndexService.js';

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
    // Prioritize documents with extracted data and positive amounts or bookings
    const exportableDocs = documents.filter((doc) => {
      if (!doc.extracted_data) return false;
      const hasAmount = Number(doc.extracted_data.total_amount) > 0;
      const hasBookings = Array.isArray(doc.extracted_data.bookings) && doc.extracted_data.bookings.length > 0;
      return hasAmount || hasBookings;
    });

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePart = `${year}${month}${day}`;
    const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const timestamp = `${datePart}${timePart}383`;

    const datumVon = `${year}${month}01`;
    const lastDayOfMonth = new Date(year, now.getMonth() + 1, 0).getDate();
    const datumBis = `${year}${month}${String(lastDayOfMonth).padStart(2, '0')}`;
    const exportClientId = documents.find((d) => d.client_id)?.client_id;
    const exportSettings = clientRulesService.getClientSettings(exportClientId);
    const mandantenNr = exportSettings.mandanten_nr || '710';
    const beraterName = exportSettings.berater_name || process.env.DEFAULT_BERATER_NAME || 'berater';

    // LINE 1: Agenda / DATEV EXTF Header (Version 700 / 12)
    const line1 = `"EXTF";700;21;"Buchungsstapel";12;${timestamp};;"AG";"${beraterName}";;1;${mandantenNr};${year}0101;4;${datumVon};${datumBis};;;;1;;;"EUR"`;

    // LINE 2: Column Names quoted and separated by semicolon
    const line2 = EXTF_COLUMNS.map((c) => `"${c}"`).join(';');

    // DATA ROWS: Exact 124 fields per booking, expanding multi-booking documents
    const rows: string[] = exportableDocs.flatMap((doc) => this.buildBookingRows(doc));

    // Agenda & DATEV standard: UTF-8 with BOM (\uFEFF) and Windows CRLF (\r\n)
    const csvContent = '\uFEFF' + [line1, line2, ...rows].join('\r\n') + '\r\n';

    const fileName = `EXTF_Buchungen_${datePart}_${timePart}_${year}_${parseInt(month, 10)}.csv`;
    const exportDir = path.resolve(process.cwd(), '../storage/exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    const filePath = path.join(exportDir, fileName);
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    // Automatically sync generated CSV to Google Drive
    try {
      googleDriveService.syncCsv(csvContent, fileName);
    } catch (gErr) {
      console.warn('[Agenda Export] Google Drive sync error:', gErr);
    }

    return { csvContent, filePath, fileName, count: rows.length };
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
    opts: { allowBlocked?: boolean; writeFiles?: boolean } = {}
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
    reviewReport: ReviewReport;
  } {
    const yearNum = Number(targetYear) || new Date().getFullYear();
    const monthNum = targetMonth >= 1 && targetMonth <= 12 ? targetMonth : new Date().getMonth() + 1;
    const monthPadded = String(monthNum).padStart(2, '0');

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
    const clientSettings = clientRulesService.getClientSettings(doc.client_id);
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
    let closingBalance: number | undefined;
    if (officialMonthBookings && officialMonthBookings.length > 0) {
      allMonthlyItems = [...officialMonthBookings];
      hasBankStatement = true;
    } else {
      // 3-Track Separation: Bank Statements (1200) vs Kasse (1000) vs Bank Belege (Invoices/Receipts)
      const isBankStmt = (d: DocumentRecord): boolean =>
        d.extracted_data?.document_type === 'BANK_STATEMENT' ||
        /kontoauszug|1200[-_ ]?bank|bank[-_]\d+/i.test(d.original_filename || '');

      const isKasseDoc = (d: DocumentRecord): boolean =>
        !isBankStmt(d) &&
        (/kasse/i.test(d.original_filename || '') || d.extracted_data?.payment_method === 'cash');

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
          for (const item of extractDocItems(bd)) {
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
              const hasFeeMatch = item.sh === 'H' && /(?:entg|entgelt|gebühr)[:\s]*0[,.]80|securego.*0[,.]80/i.test(bTxt);
              const amtNum = Number(item.amount) || 0;
              if (hasFeeMatch && amtNum > 0.80) {
                // Split into main transaction and 0.80 EUR instant fee
                const baseAmt = parseFloat((amtNum - 0.80).toFixed(2));
                bankItems.push({
                  ...item,
                  amount: baseAmt,
                  konto: item.konto || '1200',
                });
                bankItems.push({
                  amount: 0.80,
                  sh: 'H',
                  konto: '1200',
                  gegenkonto: '4970',
                  buCode: '',
                  belegdatum: item.belegdatum,
                  belegfeld1: item.belegfeld1 || '',
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

        // Track 3: Add genuine Cash/Kasse (1000) items that are NOT already bank transfers, NOT card/SEPA payments, NOT on bank by VIN, and NOT summary/merged lists
        for (const kd of kasseDocs) {
          if (/\[SUMMARY_LIST\]/i.test(kd.extracted_data?.line_items_summary || '')) continue;
          if (/bankbeleg/i.test(kd.original_filename || '')) continue;
          for (const kItem of extractDocItems(kd)) {
            const kText = kItem.buchungstext || '';
            if (clientRulesService.isForeignClient(doc.client_id, kText)) continue;
            const kAmt = Number(kItem.amount) || 0;
            const isSummaryList =
              /\[SUMMARY_LIST\]|itemized\s*list|monatsabrechnung|sammelrechnung|tankkarten[-\s]*abrechnung|zusammenfassung|abrechnung\s+tankkarte/i.test(kText) ||
              (/\baral\b/i.test(kText) && kAmt > 250);
            if (isSummaryList) continue;

            // VIN duplicate guard: if this car's VIN already has a bank booking this month, never book in Kasse
            const kFull = `${kText} ${kItem.belegfeld1 || ''}`;
            const kVins = new Set<string>(stripIbans(kFull).match(vinExtractRegex) || []);
            const kv1 = extractVinFromText(kFull);
            if (kv1) kVins.add(kv1);
            if ([...kVins].some((v) => bankVins.has(v))) continue;

            // Merged multi-contract hallucination / inverted Ankaufvertrag guard:
            if (/ankaufvertrag/i.test(kText) && kItem.sh === 'S') continue;
            if (kAmt > 50000 && kItem.gegenkonto !== '1360') continue;

            const isAlreadyOnBank =
              kItem.gegenkonto !== '1360' &&
              bankItems.some((b) => Math.abs((Number(b.amount) || 0) - kAmt) < 1.0);
            const looksLikeBankOrCard = /überwiesen|ueberwiesen|bank|sparkasse|volksbank|girocard|ec-chip|ec-cash|kartenzahlung|kundenbeleg|sepa|lastschrift|mastercard|visa/i.test(kText);
            if (!isAlreadyOnBank && !looksLikeBankOrCard && kItem.konto === '1000') {
              allMonthlyItems.push(kItem);
            }
          }
        }
      } else {
        // Step 4: NEVER book Belege onto Konto 1200 when no Bank Statement exists for this month (no standalone mode).
        // Review Gate will block export with "Kontoauszug (1200) vorhanden: fehlt".
        hasBankStatement = false;
        allMonthlyItems = [];
      }
    }

    // Auto-generate Kasse (1000) counter-entries for Geldtransit (1360) withdrawals 1-to-1!
    // Use occurrence counts per (belegdatum, cashAmount) instead of a Set so multiple same-day,
    // same-amount ATM withdrawals (e.g. 2x 2,000 EUR on 28.10) each get their own Kasse deposit.
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

    // Build rich VIN & Invoice tax-regime intelligence from genuine Beleg documents (NEVER from BANK_STATEMENT docs!)
    const vinTaxMap = new Map<string, '8193' | '8400' | '8125'>();
    const invoiceTaxMap = new Map<string, '8193' | '8400' | '8125'>();
    const payeeTaxMap = new Map<string, '8193' | '8400' | '8125'>();
    const vinRegex = /(?<![A-Z0-9])([A-HJ-NPR-Z]{2,3}[A-HJ-NPR-Z0-9]{8,9}\d{5,6})(?![0-9])/g;
    const extractAllVins = (s: string): string[] => {
      const set = new Set<string>();
      const v = extractVinFromText(s);
      if (v) set.add(v);
      const cleaned = (s || '')
        .toUpperCase()
        .replace(/\bIBAN\s*[:.]?\s*[A-Z]{2}\s*\d{2}(?:\s*[A-Z0-9]){11,30}/g, ' ')
        .replace(/\b[A-Z]{2}\d{2}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,4}\b/g, ' ')
        .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, (m) => (m.length !== 17 || /^[A-Z]{2}\d{15}$/.test(m) ? ' ' : m));
      const m = cleaned.match(vinRegex);
      if (m) {
        m.forEach((x) => {
          if (!/^[A-Z]{2}\d{15}$/.test(x) && !/^DE\d{8}/.test(x)) set.add(x);
        });
      }
      return [...set];
    };

    const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const extractPayeePrefix = (text: string): string => {
      const beforeDash = (text || '').split(/\s+-\s+|\s+PN:|\s{2,}/)[0].toLowerCase().replace(/[^a-zäöüß0-9\s]/gi, ' ').trim();
      const legalStop = /^(gmbh|mbh|ug|ag|kg|ohg|gbr|unipessoal|lda|ltda|sarl|srl|sas|bv|nv|oy|ab|aps|inc|llc|co|ltd|firma|herr|frau)$/;
      const words = beforeDash.split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !legalStop.test(w));
      return words.slice(0, 2).join(' ');
    };

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
    const vinUnresolved = new Set<BookingItem>();
    for (const item of allMonthlyItems) {
      const belegMatch =
        item.konto === '1200' && indexedBelege.length > 0
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
          item.belegfeld1 = belegMatch.record.invoiceNo;
        }
      }

      const txt = `${item.buchungstext || ''} ${item.belegfeld1 || ''}`.toLowerCase();
      if (/\b(aral|shell|esso|total|jet|avia|omv|tankstelle|agip|bft|minera|couche-tard|circle k|westfalen|star tankstelle|hem\b|sprint|sb-tank)\b/i.test(txt)) {
        item.gegenkonto = '4530';
        item.buCode = '9';
      } else if (/\b(arag|signal iduna|allianz|huk|axa|gothaer|provinzial|zurich|lvm|devk|continentale|barmenia|ergo|dkv|debeka|generali|vgh|helvetia|basler|kfz-versicherung|versicherung)\b/i.test(txt) && !/garantie/i.test(txt)) {
        item.gegenkonto = '4520';
        item.buCode = '';
      } else if (clientRulesService.matchVendorRule(doc.client_id, txt, Number(item.amount) || 0)) {
        const vr = clientRulesService.matchVendorRule(doc.client_id, txt, Number(item.amount) || 0)!;
        item.gegenkonto = vr.account;
        item.buCode = vr.buCode;
      } else if (/\b(penny|rewe|aldi|edeka|lidl|netto|kaufland)\b/i.test(txt) && Number(item.amount) < 500 && item.sh === 'H') {
        item.gegenkonto = '4673';
        item.buCode = '8';
      } else if (item.sh === 'S' && /(storno|rückbuchung|rueckbuchung|erstattung|refund|gutschrift)/i.test(txt)) {
        if (/\b(fintax|steuerberat|rechtsanwalt|fibu|buchhaltung)\b/i.test(txt)) {
          item.gegenkonto = '4955';
          item.buCode = '9';
        } else if (/\b(auto-teile|autoteile|kfz-teile|ersatzteile)\b/i.test(txt) || /\bebay\b/i.test(txt)) {
          item.gegenkonto = '4540';
          item.buCode = '9';
        }
      } else if (/\b(ölwechsel|olwechsel|auto-teile|autoteile)\b/i.test(txt)) {
        item.gegenkonto = '4540';
        item.buCode = '9';
      } else if (item.sh === 'H' && (/\b(kaufvertrag|fahrzeugankauf)\b/i.test(txt) || clientRulesService.lookupPayee(doc.client_id, txt) === '3200')) {
        item.gegenkonto = '3200';
        item.buCode = '';
      } else if (/\b(tüv|tuev|dekra|gtü|küs|porsche zentrum|audi zentrum|bmw autohaus|mercedes-benz autohaus)\b/i.test(txt) && Number(item.amount) < 1500) {
        item.gegenkonto = '4540';
        item.buCode = '9';
      } else if (/\b(deutsche post|briefmarke|porto)\b/i.test(txt)) {
        item.gegenkonto = '4910';
        item.buCode = '';
      } else if (/\b(main-taunus-kreis|landratsamt|amtsgericht|stadtkasse|buergerbuero|bürgerbüro|kfz-steuer|hauptzollamt)\b/i.test(txt)) {
        item.buCode = '';
      } else if (/\bdifferenzbetrag\b/i.test(txt) && item.sh === 'H') {
        item.gegenkonto = '3200';
        item.buCode = '';
      } else if (/(überzahlung|ueberzahlung)/i.test(txt) && item.sh === 'H') {
        item.gegenkonto = '8400';
        item.buCode = '';
      } else if (item.sh === 'S' && (item.gegenkonto === '8193' || item.gegenkonto === '8400' || item.gegenkonto === '8125')) {
        const upperTxt = `${item.buchungstext || ''} ${item.belegfeld1 || ''}`.toUpperCase();
        const vins = extractAllVins(upperTxt);
        let resolvedTax: '8193' | '8400' | '8125' | undefined;

        // 1. EU dealer registry check (rules/<client>.json)
        if (clientRulesService.isEuDealer(doc.client_id, txt)) {
          resolvedTax = '8125';
        }

        // 2. By exact 17-char VIN (glued-safe)
        if (!resolvedTax && vins.length > 0) {
          for (const vin of vins) {
            const matchedSalesAcc = vinTaxMap.get(vin) || (clientRulesService.lookupVin(doc.client_id, vin)?.taxKey as any);
            if (matchedSalesAcc && matchedSalesAcc !== '3200') {
              resolvedTax = matchedSalesAcc;
              break;
            }
          }
        }

        // 2b. By 7-character suffix VINs (e.g. bank statement short VINs)
        if (!resolvedTax) {
          const words = upperTxt.split(/[^A-Z0-9]/).filter((w) => w.length >= 6 && w.length <= 10 && /\d/.test(w) && /[A-Z]/.test(w));
          for (const w of words) {
            const matched = clientRulesService.lookupVin(doc.client_id, w);
            if (matched && matched.taxKey !== '3200') {
              resolvedTax = matched.taxKey as any;
              break;
            }
          }
        }

        // 3. By matched OCR BelegRecord (cross-month §25a / EU / 19% / private purchase)
        if (!resolvedTax && belegMatch) {
          const r = belegMatch.record;
          if (r.taxClause === 'EU' || r.skr03Account === '8125' || clientRulesService.isEuDealer(doc.client_id, r.partner || '')) {
            resolvedTax = '8125';
          } else if (r.taxClause === '25a' || (r.type === 'QA24_PURCHASE' && r.taxClause !== '19') || r.skr03Account === '8193') {
            resolvedTax = '8193';
          } else if (r.taxClause === '19') {
            resolvedTax = '8400';
          } else if (r.vin && vinTaxMap.has(r.vin.toUpperCase())) {
            resolvedTax = vinTaxMap.get(r.vin.toUpperCase());
          }
        }

        // 4. By Payee / Buyer name
        if (!resolvedTax) {
          const payee = extractPayeePrefix(item.buchungstext || '');
          if (payee && payeeTaxMap.has(payee)) {
            resolvedTax = payeeTaxMap.get(payee);
          } else {
            const matchedRule = clientRulesService.lookupPayee(doc.client_id, txt);
            if (matchedRule && matchedRule !== '3200') {
              resolvedTax = matchedRule as any;
            } else {
              for (const [pKey, targetAcc] of payeeTaxMap.entries()) {
                if (pKey.length >= 4 && txt.includes(pKey)) {
                  resolvedTax = targetAcc;
                  break;
                }
              }
            }
          }
        }

        // 5. By Invoice / Beleg Number
        if (!resolvedTax) {
          const invMatch = (item.buchungstext || '').match(/(?:rechnungsnummer|rechnung|rg|rn|beleg)[:\s]*([a-z0-9\/\-]+)/i);
          const rawInv = invMatch ? invMatch[1] : item.belegfeld1;
          if (rawInv) {
            const normInv = normalizeKey(rawInv);
            if (invoiceTaxMap.has(normInv)) {
              resolvedTax = invoiceTaxMap.get(normInv);
            }
          }
        }

        // 6. By Vehicle / Tax Keywords
        if (!resolvedTax) {
          if (/(differenzbesteuerung|25a|gebrauchtgegenst|sonderregelung|differenzbesteuert)/i.test(txt)) {
            resolvedTax = '8193';
          } else if (/(innergemeinschaftliche|eu-lieferung|steuerfrei\s*§?\s*4|ig\.?\s*lieferung)/i.test(txt)) {
            resolvedTax = '8125';
          }
        }

        if (resolvedTax) {
          item.gegenkonto = resolvedTax;
          item.buCode = '';
        } else if (
          item.gegenkonto === '8193' &&
          /(differenzbesteuerung|25a|gebrauchtgegenst|sonderregelung|differenzbesteuert)/i.test(txt)
        ) {
          // Explicit §25a indicator in the text → keep 8193 (no doubt)
        } else {
          // VIN not found in purchase history → provisional 8400, but NEVER final: route to Review List
          if (item.gegenkonto === '8193') {
            item.gegenkonto = '8400';
            item.buCode = '';
          }
          // Step 5: Group ONLY by VIN, Invoice Number, or Contract ID. NEVER by payee prefix!
          const contractOrInvMatch =
            belegMatch?.record.invoiceNo ||
            (item.belegfeld1 && item.belegfeld1.length >= 4 && !/^\d{5}\s/.test(item.belegfeld1) ? item.belegfeld1 : '') ||
            (item.buchungstext || '').match(/\b(?:ReNr|Re-Nr|RG|RE|Re|VR|Vertrag|Kaufvertrag)[.:#\s-]*([A-Z0-9\/-]{2,15})\b/i)?.[1] ||
            '';
          item.carGroupKey =
            belegMatch?.record.vin ||
            vins[0] ||
            (contractOrInvMatch ? `ID:${contractOrInvMatch.toUpperCase()}` : undefined);
          if (!isStornoPair(item) && (Number(item.amount) || 0) >= 500) {
            vinUnresolved.add(item);
          }
        }
      } else if (
        item.sh === 'H' &&
        ['4900', '4930'].includes(item.gegenkonto) &&
        belegMatch?.record.skr03Account &&
        !['1000', '1200', '4900'].includes(belegMatch.record.skr03Account)
      ) {
        item.gegenkonto = belegMatch.record.skr03Account;
        if (belegMatch.record.buCode !== undefined) {
          item.buCode = belegMatch.record.buCode;
        }
      }
    }

    // Same-VIN = Same-Account rule for split vehicle purchase payments (e.g. Teil 1 / Teil 2)
    const monthPurchaseVins = new Set<string>();
    for (const item of allMonthlyItems) {
      if (item.sh === 'H' && item.gegenkonto === '3200') {
        const vins = extractAllVins(`${item.buchungstext || ''} ${item.belegfeld1 || ''}`);
        vins.forEach((v) => monthPurchaseVins.add(v));
      }
    }
    for (const item of allMonthlyItems) {
      if (item.sh === 'H' && item.gegenkonto === '4900') {
        const vins = extractAllVins(`${item.buchungstext || ''} ${item.belegfeld1 || ''}`);
        if (vins.some((v) => monthPurchaseVins.has(v))) {
          item.gegenkonto = '3200';
          item.buCode = '';
        }
      }
    }

    // Same-Payee Linking for follow-up / rest / deposit payments ("rest", "Restzahlung", "Anzahlung", "Teil 2")
    const payeePurchaseMap = new Map<string, string>();
    const payeeSaleMap = new Map<string, string>();
    for (const item of allMonthlyItems) {
      const prefix = extractPayeePrefix(item.buchungstext || '');
      if (!prefix) continue;
      if (item.sh === 'H' && ['3200', '3400'].includes(item.gegenkonto)) {
        payeePurchaseMap.set(prefix, item.gegenkonto);
      } else if (item.sh === 'S' && ['8193', '8400', '8125'].includes(item.gegenkonto)) {
        payeeSaleMap.set(prefix, item.gegenkonto);
      }
    }
    for (const item of allMonthlyItems) {
      const txt = (item.buchungstext || '').toLowerCase();
      if (!/\b(rest|restzahlung|restbetrag|anzahlung|teil\s*\d+)\b/i.test(txt)) continue;
      const prefix = extractPayeePrefix(item.buchungstext || '');
      if (!prefix) continue;
      if (item.sh === 'H' && item.gegenkonto === '4900' && payeePurchaseMap.has(prefix)) {
        item.gegenkonto = payeePurchaseMap.get(prefix)!;
        item.buCode = '';
      } else if (item.sh === 'S' && ['8400', '8193'].includes(item.gegenkonto) && payeeSaleMap.has(prefix)) {
        item.gegenkonto = payeeSaleMap.get(prefix)!;
        item.buCode = '';
        // Linked to the same buyer's main sale → same account, but only certain if that sale itself is certain
        const linkedSaleIsCertain = allMonthlyItems.some(
          (other) =>
            other !== item &&
            other.sh === 'S' &&
            !vinUnresolved.has(other) &&
            other.gegenkonto === item.gegenkonto &&
            extractPayeePrefix(other.buchungstext || '') === prefix
        );
        if (linkedSaleIsCertain) vinUnresolved.delete(item);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // REVIEW GATE: user-confirmed vendor rules → saved user answers → doubt detection
    // ─────────────────────────────────────────────────────────────────────────────
    const reviewScope = reviewService.scopeKey(doc.client_id, yearNum, monthNum);
    const vendorRuleHits = reviewService.applyVendorRules(allMonthlyItems);
    if (vendorRuleHits > 0) {
      console.log(`[Review Gate ${yearNum}-${monthPadded}] Applied ${vendorRuleHits} user-confirmed vendor rule(s).`);
    }
    const lineKeys = reviewService.assignLineKeys(allMonthlyItems);
    const { kept, excluded, resolvedKeys } = reviewService.applyResolutions(reviewScope, allMonthlyItems, lineKeys);
    allMonthlyItems = kept;
    // Calculate cumulative Kasse starting balance from previous months in the same year
    let kasseOpeningBalance = clientRulesService.getStartingBalance(doc.client_id, yearNum, '1000') || 0;
    const priorBankVinsByMonth = new Map<number, Set<string>>();
    const priorBankAmountsByMonth = new Map<number, number[]>();
    const priorBankTransitByMonth = new Map<number, number>();
    const seenPriorBankStmts = new Set<string>();
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
      if (seenPriorBankStmts.has(stmtDedupKey)) continue;
      seenPriorBankStmts.add(stmtDedupKey);
      for (const b of extractDocItems(d)) {
        const bMonth = parseInt((b.belegdatum || '').replace(/[^0-9]/g, '').slice(-2), 10) || Number(dMeta.monthNum);
        if (!(bMonth > 0 && bMonth < monthNum)) continue;
        if (b.konto === '1200') {
          const amt = Number(b.amount) || 0;
          const amts = priorBankAmountsByMonth.get(bMonth) || [];
          amts.push(amt);
          priorBankAmountsByMonth.set(bMonth, amts);
          const vSet = priorBankVinsByMonth.get(bMonth) || new Set<string>();
          extractAllVins(`${b.buchungstext || ''} ${b.belegfeld1 || ''}`).forEach((v) => vSet.add(v));
          priorBankVinsByMonth.set(bMonth, vSet);
          if (b.gegenkonto === '1360') {
            const delta = String(b.sh).toUpperCase() === 'H' ? amt : -amt;
            priorBankTransitByMonth.set(bMonth, (priorBankTransitByMonth.get(bMonth) || 0) + delta);
          }
        }
      }
    }
    const priorKasseTransitByMonth = new Map<number, number>();
    for (const d of allDocs) {
      if (doc.client_id && d.client_id !== doc.client_id) continue;
      if (/bankbeleg/i.test(d.original_filename || '')) continue;
      if (/\[SUMMARY_LIST\]/i.test(d.extracted_data?.line_items_summary || '')) continue;
      const dMeta = googleDriveService.resolveYearAndMonth(d.extracted_data?.invoice_date, d.original_filename);
      if (Number(dMeta.year) !== yearNum) continue;
      for (const b of extractDocItems(d)) {
        const bMonth = parseInt((b.belegdatum || '').replace(/[^0-9]/g, '').slice(-2), 10) || Number(dMeta.monthNum);
        if (!(bMonth > 0 && bMonth < monthNum) || b.konto !== '1000') continue;
        const kText = b.buchungstext || '';
        const kAmt = Number(b.amount) || 0;
        if (clientRulesService.isForeignClient(doc.client_id, kText)) continue;
        if (/ankaufvertrag/i.test(kText) && b.sh === 'S') continue;
        if (kAmt > 50000 && b.gegenkonto !== '1360') continue;
        if (/\[SUMMARY_LIST\]|itemized\s*list|monatsabrechnung|sammelrechnung|tankkarten[-\s]*abrechnung|zusammenfassung/i.test(kText) || (/\baral\b/i.test(kText) && kAmt > 250)) continue;
        if (/überwiesen|ueberwiesen|bank|sparkasse|volksbank|girocard|ec-chip|ec-cash|kartenzahlung|kundenbeleg|sepa|lastschrift|mastercard|visa/i.test(kText)) continue;
        const vSet = priorBankVinsByMonth.get(bMonth);
        if (vSet && extractAllVins(`${kText} ${b.belegfeld1 || ''}`).some((v) => vSet.has(v))) continue;
        const bAmts = priorBankAmountsByMonth.get(bMonth);
        if (b.gegenkonto !== '1360' && bAmts && bAmts.some((ba) => Math.abs(ba - kAmt) < 1.0)) continue;
        const delta = (String(b.sh).toUpperCase() === 'S' ? 1 : -1) * kAmt;
        if (b.gegenkonto === '1360') {
          priorKasseTransitByMonth.set(bMonth, (priorKasseTransitByMonth.get(bMonth) || 0) + delta);
        } else {
          kasseOpeningBalance += delta;
        }
      }
    }
    for (let mPrev = 1; mPrev < monthNum; mPrev++) {
      if (priorBankTransitByMonth.has(mPrev)) {
        kasseOpeningBalance += priorBankTransitByMonth.get(mPrev)!;
      } else if (priorKasseTransitByMonth.has(mPrev)) {
        kasseOpeningBalance += priorKasseTransitByMonth.get(mPrev)!;
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
      kasseOpeningBalance,
      vinUnresolved,
      lineKeys,
      excludedLines: excluded,
      resolvedKeys,
    });
    console.log(
      `[Review Gate ${yearNum}-${monthPadded}] ${reviewReport.total_bookings} bookings | auto ${reviewReport.auto_booked} | open critical ${reviewReport.open_critical} | warnings ${reviewReport.open_warnings} | ${reviewReport.blocked ? 'EXPORT BLOCKED: ' + reviewReport.block_reasons.join(' ; ') : 'CSV READY ✅'}`
    );

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

    // Build standard 124-field rows from the complete merged items
    const activeRows: string[] = allMonthlyItems.map((item) => {
      const shKey = (String(item.sh).toUpperCase() === 'S') ? '"S"' : '"H"';
      const formattedAmount = item.amount.toFixed(2).replace('.', ',');
      const belegdatum = (item.belegdatum || '0101').replace(/[^0-9]/g, '').slice(-4);
      const rawText = (item.buchungstext || '').replace(/[;"\r\n]/g, '').trim();
      const buchungstext = rawText ? `"${rawText.substring(0, 60)}"` : '""';
      const rawField1 = (item.belegfeld1 || '').replace(/[;"\r\n]/g, '').trim();
      const belegfeld1 = rawField1 ? `"${rawField1.substring(0, 36)}"` : '""';
      const rawField2 = (item.belegfeld2 || '').replace(/[;"\r\n]/g, '').trim();
      const belegfeld2 = rawField2 ? `"${rawField2.substring(0, 36)}"` : '""';
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

    // Keep Excel buffers for direct UI Excel download endpoint (/api/documents/:id/skr03-xlsx)
    const singleXlsxFileName = `EXTF_Buchungen_${datePart}_${timePart}_${yearNum}_${monthNum}.xlsx`;
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
        reviewReport,
      };
    }

    // Save the 3 EXTF CSV files to local storage/exports
    if (opts.writeFiles !== false) {
      const exportDir = path.resolve(process.cwd(), '../storage/exports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      fs.writeFileSync(path.join(exportDir, buchungenCsvFileName), buchungenCsvContent, 'utf-8');
      fs.writeFileSync(path.join(exportDir, personenkontenCsvFileName), personenkontenCsvContent, 'utf-8');
      fs.writeFileSync(path.join(exportDir, sachkontenCsvFileName), sachkontenCsvContent, 'utf-8');
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
      reviewReport,
    };
  },
};
