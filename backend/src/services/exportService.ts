import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { DocumentRecord, BookingItem } from '../types/document.js';
import { skr03Mapper } from './skr03Mapper.js';
import { googleDriveService } from './googleDriveService.js';
import { generatePersonenkontenCsvContent, generateSachkontenCsvContent } from './datevExtfTemplates.js';

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
      data.document_type === 'RECEIPT' ||
      data.document_type === 'SALES_INVOICE';

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
    const mandantenNr = '710';
    const beraterName = 'niazi';

    // LINE 1: Agenda / DATEV EXTF Header (Version 700 / 12)
    const line1 = `"EXTF";700;21;"Buchungsstapel";12;${timestamp};;"AG";"${beraterName}";;1;${mandantenNr};${year}0101;4;${datumVon};${datumBis};;;1;0;0;"EUR";;;;;;;;;`;

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
      '1000': 'Kasse (Bargeld)',
      '1200': 'Bank (Girokonto)',
      '1360': 'Geldtransit',
      '1361': 'Geldtransit Kasse - Bank',
      '1400': 'Forderungen aus Lieferungen und Leistungen',
      '1600': 'Verbindlichkeiten aus Lieferungen und Leistungen',
      '1740': 'Verbindlichkeiten aus Lief. u. Leist.',
      '1800': 'Privatentnahmen allgemein',
      '1890': 'Privateinlagen',
      '3000': 'Wareneingang 7 % Vorsteuer (Lebensmittel)',
      '3300': 'Wareneingang 7 % Vorsteuer',
      '3400': 'Wareneingang 19 % Vorsteuer',
      '4200': 'Raumkosten / Nebenkosten',
      '4210': 'Miete (Büro / Betrieb)',
      '4240': 'Gas, Strom, Wasser (Utilities)',
      '4260': 'Instandhaltung betrieblicher Räume',
      '4360': 'Versicherungen',
      '4500': 'Kfz-Steuer',
      '4510': 'Kfz-Versicherungen',
      '4530': 'Laufende Kfz-Betriebskosten (Tanken / Benzin)',
      '4600': 'Werbekosten',
      '4650': 'Bewirtungsaufwendungen (70 % abzugsfähig)',
      '4670': 'Reisekosten / Fahrtkosten',
      '4710': 'Verpackungsmaterial',
      '4780': 'Fremdleistungen',
      '4806': 'Reparaturen und Instandhaltung',
      '4900': 'Sonstige betriebliche Aufwendungen',
      '4910': 'Porto und Versand',
      '4920': 'Telefon und Internetkosten',
      '4930': 'Bürobedarf',
      '4964': 'Aufwendungen für IT / Softwarelizenzen',
      '4980': 'Betriebsbedarf',
      '8120': 'Steuerfreie Erlöse',
      '8300': 'Erlöse 7 % USt (Kassenbericht)',
      '8400': 'Erlöse 19 % USt (Kassenbericht / Umsatzerlöse)',
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
    targetMonth: number
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
    const mandantenNr = '710';
    const beraterName = 'niazi';

    const line1 = `"EXTF";700;21;"Buchungsstapel";12;${timestampBuchungen};;"AG";"${beraterName}";;1;${mandantenNr};${yearNum}0101;4;${datumVon};${datumBis};;;1;0;0;"EUR";;;;;;;;;`;
    const line2 = EXTF_COLUMNS.map((c) => `"${c}"`).join(';');

    // Collect all documents matching that client + year + month
    const monthDocs = allDocs.filter((d) => {
      if (!d.extracted_data) return false;
      const hasVal =
        Number(d.extracted_data.total_amount) > 0 ||
        (Array.isArray(d.extracted_data.bookings) && d.extracted_data.bookings.length > 0);
      if (!hasVal) return false;
      if (doc.client_id && d.client_id && d.client_id !== doc.client_id) return false;
      const resolved = googleDriveService.resolveYearAndMonth(d.extracted_data.invoice_date, d.original_filename);
      return Number(resolved.year) === yearNum && resolved.monthNum === monthNum;
    });

    if (!monthDocs.some((d) => d.id === doc.id)) {
      monthDocs.push(doc);
    }

    const singleRows = this.buildBookingRows(doc);
    const monthlyRows = monthDocs.flatMap((d) => this.buildBookingRows(d));
    const activeRows = monthlyRows.length > 0 ? monthlyRows : singleRows;

    const allMonthlyItems: BookingItem[] = monthDocs.flatMap((d) =>
      d.extracted_data?.bookings && d.extracted_data.bookings.length > 0
        ? d.extracted_data.bookings
        : [{
            amount: Number(d.extracted_data?.total_amount) || 0,
            sh: (d.extracted_data?.document_type === 'SALES_INVOICE' ? 'S' : 'H') as 'S' | 'H',
            konto: d.extracted_data?.payment_method === 'cash' ? '1000' : '1200',
            gegenkonto: d.extracted_data?.skr03_account_code || '4900',
            buCode: d.extracted_data?.vat_rate_percent === 19 ? '9' : d.extracted_data?.vat_rate_percent === 7 ? '8' : '',
            belegdatum: this.parseBelegdatum(d.extracted_data?.invoice_date),
            belegfeld1: d.extracted_data?.invoice_number || '',
            buchungstext: d.extracted_data?.supplier_name || 'Beleg',
            currency: d.extracted_data?.currency || 'EUR',
          }]
    );

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

    // Save the 3 EXTF CSV files to local storage/exports
    const exportDir = path.resolve(process.cwd(), '../storage/exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    fs.writeFileSync(path.join(exportDir, buchungenCsvFileName), buchungenCsvContent, 'utf-8');
    fs.writeFileSync(path.join(exportDir, personenkontenCsvFileName), personenkontenCsvContent, 'utf-8');
    fs.writeFileSync(path.join(exportDir, sachkontenCsvFileName), sachkontenCsvContent, 'utf-8');

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
      bookingCount: singleRows.length,
    };
  },
};
