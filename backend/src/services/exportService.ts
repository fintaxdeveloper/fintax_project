import fs from 'fs';
import path from 'path';
import { DocumentRecord } from '../types/document.js';

export const exportService = {
  generateAgendaSKR03Csv(documents: DocumentRecord[]): {
    csvContent: string;
    filePath: string;
    fileName: string;
  } {
    const approvedDocs = documents.filter((doc) => doc.status === 'APPROVED' && doc.extracted_data);

    // Agenda SKR03 standard CSV header
    // Semicolon delimited, German decimal notation (comma)
    const headers = [
      'Belegdatum',
      'Konto',
      'Gegenkonto',
      'BU_Schluessel',
      'Umsatz',
      'WKZ',
      'Belegnummer',
      'Buchungstext',
      'USt_Satz',
    ];

    const rows = approvedDocs.map((doc) => {
      const data = doc.extracted_data!;
      // Format date to DD.MM.YYYY
      const dateParts = data.invoice_date.split('-');
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : data.invoice_date;

      // German comma decimal format: 1190.00 -> 1190,00
      const formattedAmount = data.total_amount.toFixed(2).replace('.', ',');

      // SKR03 Account mappings
      const expenseAccount = data.skr03_account_code || '4930'; // e.g. 4930 Bürobedarf
      const contraAccount = '1600'; // Verbindlichkeiten aus Lieferungen und Leistungen
      const buCode = data.vat_rate_percent === 19 ? '9' : data.vat_rate_percent === 7 ? '8' : '0';

      const invoiceNum = (data.invoice_number || '').replace(/[;"\n]/g, '');
      const supplierText = (data.supplier_name || '').replace(/[;"\n]/g, '').substring(0, 60);

      return [
        formattedDate,
        expenseAccount,
        contraAccount,
        buCode,
        formattedAmount,
        'EUR',
        `"${invoiceNum}"`,
        `"${supplierText}"`,
        `${data.vat_rate_percent}%`,
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n'); // UTF-8 with BOM for Excel/Agenda compatibility

    const fileName = `Agenda_SKR03_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    const exportDir = path.resolve(process.cwd(), '../storage/exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    const filePath = path.join(exportDir, fileName);
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    return { csvContent, filePath, fileName };
  },
};
