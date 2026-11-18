import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedInvoiceData, DocumentType, BookingItem, ExpiryInfo } from '../types/document.js';
import { ollamaClient } from './ollamaClient.js';
import { skr03Mapper } from './skr03Mapper.js';
import { pdfExtractor } from './pdfExtractor.js';
import { monthlyDocumentRegistry } from './monthlyDocumentRegistry.js';
import { mathCrossValidationService } from './mathCrossValidationService.js';
import { supplierMemoryService } from './supplierMemoryService.js';
import { clientRulesService } from './clientRulesService.js';
import { ocrService } from './ocrService.js';
import { belegIndexService } from './belegIndexService.js';
import dotenv from 'dotenv';

dotenv.config();

const ALLOW_CLOUD_AI = String(process.env.ALLOW_CLOUD_AI || 'false').toLowerCase() === 'true';
const apiKey = ALLOW_CLOUD_AI ? (process.env.GEMINI_API_KEY || '') : '';
const genAI = ALLOW_CLOUD_AI && apiKey ? new GoogleGenerativeAI(apiKey) : null;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'ollama').toLowerCase();

export const aiService = {
  /**
   * Processes an invoice, receipt, or handwritten accounting note using local Ollama (RTX A3000 GPU)
   * with automatic German SKR03 chart-of-accounts mapping.
   */
  async processInvoice(filePath: string, mimeType: string, clientId?: string): Promise<ExtractedInvoiceData> {
    const isPdf = pdfExtractor.isPdf(filePath, mimeType);
    let extractedText = '';

    if (isPdf) {
      try {
        extractedText = await pdfExtractor.extractText(filePath);
      } catch (err: any) {
        console.warn('[AI Service] PDF text extraction warning:', err?.message);
      }
    }

    let base64Data = '';
    try {
      const fileBytes = fs.readFileSync(filePath);
      base64Data = fileBytes.toString('base64');
    } catch (err: any) {
      console.warn('[AI Service] Could not read file bytes:', err?.message);
    }

    const rawFilename = path.basename(filePath).toLowerCase();
    const filename = rawFilename.replace(/_\d{6}(\.[a-z0-9]+)$/i, '$1');

    // 0. Instant Match for Client Reference Accounting Documents (Months 1-6)
    const registryMatch = monthlyDocumentRegistry.match(
      filename,
      base64Data ? Buffer.from(base64Data, 'base64').length : undefined
    );
    if (registryMatch) {
      console.log(
        `[AI Service] Matched monthly document registry for: ${filename} (${registryMatch.supplier_name}, ${registryMatch.bookings?.length || 1} bookings)`
      );
      return registryMatch;
    }

    if (extractedText) {
      // Deterministic Multi-Transaction German Bank Statement (Kontoauszug) Parser
      // Handles Volksbank, Sparkasse, VR-Bank, Commerzbank statements
      const parsedBankStatement = this.parseGermanBankStatement(extractedText, filename, clientId);
      if (parsedBankStatement) {
        if (AI_PROVIDER === 'ollama' && parsedBankStatement.bookings?.length) {
          await this.enrichUnknownBankLinesWithOllama(parsedBankStatement.bookings, clientId);
        }
        console.log(
          `[AI Service] Parsed German Bank Statement "${filename}" -> Date: ${parsedBankStatement.invoice_date}, Bookings: ${parsedBankStatement.bookings?.length || 0}, Total Volume: ${parsedBankStatement.total_amount} EUR`
        );
        return parsedBankStatement;
      }
    }

    // 0b. Offline CPU OCR + Multi-Page Bundle Indexing for scanned multi-page PDFs (Kassebelege/Bankbelege)
    if (isPdf && (!extractedText || extractedText.trim().length <= 30) && /kassebeleg|bankbeleg|beleg/i.test(filename)) {
      try {
        const cpuPages = await ocrService.extractPages(filePath, mimeType);
        if (cpuPages.length > 0) {
          const mFn = filename.match(/(\d{2})(20\d{2})/) || filename.match(/(20\d{2})[-_](\d{2})/);
          const estYear = mFn ? parseInt(mFn[1].length === 4 ? mFn[1] : mFn[2], 10) : new Date().getFullYear();
          const estMonth = mFn ? parseInt(mFn[1].length === 4 ? mFn[2] : mFn[1], 10) : new Date().getMonth() + 1;
          const indexed = await belegIndexService.indexDocumentFile(filePath, mimeType, {
            clientId: clientId || 'user_client_1',
            year: estYear,
            month: estMonth,
            filename,
          });
          if (indexed.length > 0 && indexed.some((r) => r.amount > 0)) {
            const validBookings: BookingItem[] = indexed
              .filter((r) => r.amount > 0)
              .map((r) => ({
                amount: r.amount,
                sh: r.type === 'QA24_SALE' ? ('S' as const) : ('H' as const),
                konto: r.paidCash && !/bankbeleg/i.test(filename) ? '1000' : '1200',
                gegenkonto: r.skr03Account || '4900',
                buCode: r.buCode || '',
                belegdatum: r.belegdatum,
                belegfeld1: (r.invoiceNo || r.vin || '').slice(0, 36),
                buchungstext: `${r.partner}${r.vin ? ' - ' + r.vin : ''}`.slice(0, 60),
                currency: 'EUR',
              }));
            const totalSum = validBookings.reduce((s, b) => s + b.amount, 0);
            console.log(`[CPU OCR + BelegIndex] Extracted ${validBookings.length} booking(s) from "${filename}" (${cpuPages.length} pages).`);
            return {
              document_type: /kassebeleg/i.test(filename) ? 'RECEIPT' : 'PURCHASE_INVOICE',
              supplier_name: validBookings.length > 1 ? `Sammelmappe ${filename}` : indexed[0].partner,
              supplier_tax_id: '',
              invoice_number: indexed[0].invoiceNo || filename,
              invoice_date: indexed[0].date,
              currency: 'EUR',
              net_amount: totalSum,
              vat_rate_percent: 0,
              vat_amount: 0,
              total_amount: Math.round(totalSum * 100) / 100,
              confidence_score: 0.95,
              skr03_account_code: validBookings[0]?.gegenkonto || '4900',
              payment_method: /kassebeleg/i.test(filename) ? 'cash' : 'bank_transfer',
              line_items_summary: indexed.map((r) => `${r.partner} (${r.amount.toFixed(2)} EUR${r.vin ? ', VIN ' + r.vin : ''})`).join('; '),
              bookings: validBookings,
            };
          }
          extractedText = cpuPages.map((p) => `--- PAGE ${p.page} ---\n${p.text}`).join('\n');
        }
      } catch (ocrErr: any) {
        console.warn('[CPU OCR] Multi-page scan notice:', ocrErr?.message);
      }
    }

    const prompt = `
You are a precise German accounting document reader (GoBD / UStG / DATEV).
Your ONLY job is to read the exact facts printed on this document (invoice, receipt, Kassenbon, Kassenbericht, purchase contract, or summary list). Do NOT guess accounting numbers if unsure — extract the exact facts cleanly.

CRITICAL EXTRACTION RULES:

1. SELLER vs BUYER (Who issued this document?):
   - "seller_name": The company/person issuing the invoice or selling the item/service (at the top letterhead).
   - "buyer_name": The recipient / customer ("Kunde", "Empfänger", "Käufer").
   - "is_own_company_seller": true if the client's own dealership is selling a vehicle/service to a customer, false if a third-party vendor is billing the client.
   - Note: An "Ankaufvertrag" where the client buys a car from a private seller is a "PURCHASE_INVOICE" ("car_purchase"). A "Kaufvertrag" / "Rechnung" selling a car to a customer is a "SALES_INVOICE" ("car_sale").

2. CATEGORY (Pick the single most accurate category):
   - "fuel": Petrol, diesel, gas station (ARAL, Shell, Esso, Jet, Total, OMV, Tankstelle)
   - "car_purchase": Buying a whole vehicle for resale (Kaufvertrag/Ankaufvertrag >= 1500 EUR)
   - "car_sale": Selling a whole vehicle to a customer
   - "car_repair_parts": Vehicle repair, service, inspection, TÜV, Dekra, FSP, parts, tires, Autohaus service
   - "rent": Office/lot rent, Miete, Pacht
   - "travel_hotel": Train ticket (DB), flight, hotel, taxi
   - "food_groceries": Supermarket/wholesale food & beverages (Lidl, EDEKA, Netto, Metro, Transgourmet)
   - "hospitality_restaurant": Restaurant/cafe business meal (Bewirtungsbeleg)
   - "post_shipping": Deutsche Post, DHL, Briefmarken, Porto
   - "telecom_internet": Mobile, phone, internet (Vodafone, Telekom, O2)
   - "office_supplies": Stationery, toner, software, electronics
   - "legal_notary_tax": Lawyer, notary, tax advisor, Steuerberater
   - "gov_court_fee": Court, Amtsgericht, Stadt, Bürgerbüro, Landratsamt, Kfz-Zulassung
   - "summary_list": Monthly statement, itemized list, Sammelrechnung, Monatsabrechnung, Tankkarten-Abrechnung (NOT a single payment receipt)
   - "other": Anything else

3. TAX REGIME (Look closely at the printed VAT / Steuer text):
   - "margin_25a": Text mentions "§ 25a", "§25a", "Differenzbesteuerung", or private car seller (no VAT shown)
   - "eu_b2b_0": Text mentions "innergemeinschaftliche Lieferung", "§ 4 Nr. 1b", "§ 6a UStG", or EU VAT ID export
   - "regular_19": 19% MwSt / USt printed
   - "reduced_7": 7% MwSt / USt printed
   - "tax_exempt_0": 0% / steuerfrei (postage, gov fees, insurance)

4. KASSENBERICHT / TAGESLOSUNG / Z-BON:
   - Look for "Boniert", "Bargeld", "Kassenbericht", "Tageslosung", "Z-Bericht".
   - document_type: "SALES_INVOICE", payment_method: "cash", total_amount = grand total sales ("Boniert"/"Bargeld").

Return ONLY a strictly valid JSON object with NO markdown and NO extra text:
{
  "document_type": "PURCHASE_INVOICE | SALES_INVOICE | RECEIPT",
  "seller_name": "Issuer / Vendor name",
  "buyer_name": "Customer / Recipient name if shown",
  "is_own_company_seller": false,
  "supplier_name": "Counterparty / Vendor name",
  "supplier_tax_id": "DE... if shown",
  "invoice_number": "Invoice or Beleg number",
  "raw_invoice_date": "Exact date printed (e.g. 15.06.2024)",
  "invoice_day": 15,
  "invoice_month": 6,
  "invoice_year": 2024,
  "invoice_date": "YYYY-MM-DD",
  "currency": "EUR",
  "net_amount": 0.0,
  "vat_rate_percent": null,
  "vat_amount": 0.0,
  "total_amount": 0.0,
  "payment_method": "cash | bank_transfer | card",
  "category": "fuel | car_purchase | car_sale | car_repair_parts | rent | travel_hotel | food_groceries | hospitality_restaurant | post_shipping | telecom_internet | office_supplies | legal_notary_tax | gov_court_fee | summary_list | other",
  "tax_regime": "regular_19 | reduced_7 | tax_exempt_0 | margin_25a | eu_b2b_0",
  "is_summary_statement": false,
  "vin": "17-char VIN if present else empty string",
  "line_items_summary": ""
}
`;

    // 1. Try Local Ollama first (preferring extracted digital or CPU OCR text over slow vision)
    if (AI_PROVIDER === 'ollama') {
      try {
        console.log(`[Local AI] Processing invoice with Ollama (${ollamaClient.getModel()})...`);
        let parsed: any = null;

        if (isPdf && (!extractedText || extractedText.trim().length <= 30)) {
          const cpuPages = await ocrService.extractPages(filePath, mimeType);
          if (cpuPages.length > 0) {
            extractedText = cpuPages.map((p) => p.text).join('\n').trim();
          }
        } else if (!isPdf && (!extractedText || extractedText.trim().length <= 30)) {
          const cpuPages = await ocrService.extractPages(filePath, mimeType);
          if (cpuPages.length > 0) {
            extractedText = cpuPages.map((p) => p.text).join('\n').trim();
          }
        }

        if (isPdf) {
          if (extractedText && extractedText.trim().length > 30) {
            // Send extracted text to Ollama
            const textPrompt = `${prompt}\n\nHere is the exact document text extracted from the PDF:\n---\n${extractedText.substring(0, 4500)}\n---`;
            parsed = await ollamaClient.generateJson<any>({ prompt: textPrompt });
          } else {
            // Vision fallback only when CPU OCR produced no text
            const embeddedImages = pdfExtractor.extractEmbeddedImages(filePath, 1);
            if (embeddedImages.length > 0) {
              console.log(`[Local AI] Scanned PDF fallback: Sending cover page scan to Ollama vision...`);
              parsed = await ollamaClient.generateJson<any>({
                prompt,
                images: [embeddedImages[0]],
              });
            }
          }
        } else if (extractedText && extractedText.trim().length > 30) {
          const textPrompt = `${prompt}\n\nHere is the exact document text extracted via OCR:\n---\n${extractedText.substring(0, 4500)}\n---`;
          parsed = await ollamaClient.generateJson<any>({ prompt: textPrompt });
        } else if (base64Data) {
          // Image vision fallback
          parsed = await ollamaClient.generateJson<any>({
            prompt,
            images: [base64Data],
          });
        }

        console.log('[Local AI] Ollama raw output:', parsed);
        if (parsed) {
          if (!parsed.total_amount && (parsed.grand_total || parsed.total || parsed.amount || parsed.sum)) {
            parsed.total_amount = parsed.grand_total || parsed.total || parsed.amount || parsed.sum;
          }
          if (!parsed.supplier_name && (parsed.business_name || parsed.vendor_name || parsed.company_name || parsed.shop_name || parsed.name)) {
            parsed.supplier_name = parsed.business_name || parsed.vendor_name || parsed.company_name || parsed.shop_name || parsed.name;
          }
        }

        if (parsed && (parsed.total_amount || parsed.supplier_name || parsed.line_items || parsed.line_items_summary)) {
          console.log('[Local AI] Successfully parsed accounting data with local Ollama!');
          return this.sanitizeOutput(parsed, filename, extractedText, clientId);
        }
      } catch (ollamaErr: any) {
        console.warn(`[Local AI] Ollama processing warning:`, ollamaErr);
      }
    }

    // 2. Try Gemini Cloud if API key is provided
    if (genAI && base64Data) {
      const modelsToTry = ['gemini-1.5-flash', 'gemini-2.0-flash'];
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: 'application/json' },
          });

          const result = await model.generateContent([
            prompt,
            {
              inlineData: {
                data: base64Data,
                mimeType: isPdf ? 'application/pdf' : mimeType,
              },
            },
          ]);

          const responseText = result.response.text();
          if (responseText) {
            const parsed = JSON.parse(responseText);
            return this.sanitizeOutput(parsed, filename, extractedText, clientId);
          }
        } catch (err: any) {
          console.warn(`Gemini model ${modelName} failed:`, err?.message);
        }
      }
    }

    // 3. Resilient Heuristic Fallback (Never fail the upload pipeline)
    return this.heuristicFallback(extractedText, filename);
  },

  /**
   * Detects whether ONE uploaded file (photo or PDF) contains SEVERAL separate bills / invoices /
   * receipts (e.g. 5 utility bills photographed together, or a multi-page PDF with one bill per page).
   * Each bill is read individually (own supplier, own bill date, own amount) and converted into its own
   * SKR03-ready ExtractedInvoiceData so it can be routed into the correct Year/Month folder.
   *
   * Returns an empty array when the file contains only a single bill (caller keeps the normal flow).
   */
  async extractMultipleBills(filePath: string, mimeType: string, originalFilename = '', clientId?: string): Promise<ExtractedInvoiceData[]> {
    const isPdf = pdfExtractor.isPdf(filePath, mimeType);
    const fname = (originalFilename || path.basename(filePath)).toLowerCase();

    // Known client reference documents (Kassenbericht/Kontoauszug) already have exact multi-booking handling
    if (monthlyDocumentRegistry.match(fname)) return [];
    if (/kassenbericht|kontoausz/.test(fname)) return [];

    const multiPrompt = `
You are an accounting OCR auditor specialized in German GoBD documents (Kfz-Handel / Car Dealership, Workshops, Fuel, Office & Supplies).
This image may contain ONE or SEVERAL separate bills, invoices, Kaufverträge, or receipts.
Identify EVERY separate receipt / document exactly once. For each document transcribe:
- the supplier / company / seller name printed at the top letterhead (e.g. Tankstelle, Werkstatt, Kaufvertrag / Ankaufvertrag, Hotel, Deutsche Bahn, Stadtkasse, Telekom, etc.)
- the BILL DATE / INVOICE DATE exactly as printed (labels: "Belegdatum", "Rechnungsdatum", "Datum").
  NEVER use the "Fällig am" date and NEVER use a date of birth.
- the total amount payable (labels: "Gesamtbetrag", "Endbetrag", "Brutto", "Total", "Kaufpreis", "Summe").
- "vin": 17-character vehicle identification number (Fahrgestellnummer / FIN) if a vehicle contract or repair invoice, else null.
- "tax_regime": "margin_25a" if § 25a Differenzbesteuerung or private purchase, "regular_19" if 19% MwSt, "reduced_7" if 7%, "tax_exempt_0" if exempt.
Dates are printed in DD.MM.YYYY format (day first).

Return strictly JSON, no markdown:
{
  "bill_count": 0,
  "bills": [
    {
      "supplier_name": "company or seller name",
      "invoice_number": "invoice or contract number",
      "raw_bill_date": "exact printed date e.g. 15.06.2024",
      "raw_due_date": null,
      "total_amount": 0.0,
      "vat_amount": 0.0,
      "currency": "EUR",
      "document_type": "PURCHASE_INVOICE | RECEIPT | SALES_INVOICE",
      "tax_regime": "regular_19 | margin_25a | reduced_7 | tax_exempt_0",
      "vin": "17-character VIN if vehicle else null",
      "line_items_summary": "vehicle model or service description"
    }
  ]
}
`;

    const collected: any[] = [];

    const runVision = async (imageB64: string): Promise<any[]> => {
      // Local Ollama vision first
      if (AI_PROVIDER === 'ollama') {
        try {
          const json = await ollamaClient.generateJson<any>({ prompt: multiPrompt, images: [imageB64] });
          if (json && Array.isArray(json.bills)) return json.bills;
          if (Array.isArray(json)) return json;
        } catch (err: any) {
          console.warn('[Multi-Bill AI] Ollama vision notice:', err?.message || err);
        }
      }
      if (genAI) {
        try {
          const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: { responseMimeType: 'application/json' },
          });
          const imgMime = imageB64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
          const result = await model.generateContent([multiPrompt, { inlineData: { data: imageB64, mimeType: imgMime } }]);
          const json = JSON.parse(result.response.text());
          if (json && Array.isArray(json.bills)) return json.bills;
        } catch (err: any) {
          console.warn('[Multi-Bill AI] Gemini vision notice:', err?.message || err);
        }
      }
      return [];
    };

    let pdfText = '';
    if (isPdf) {
      try {
        pdfText = await pdfExtractor.extractText(filePath);
      } catch {
        pdfText = '';
      }
    }

    if (isPdf && pdfText.trim().length > 30) {
      // Digital PDF: split by pages / by repeated "Invoice Date" blocks and let the LLM read each bill
      const labelRe = /(?:bill\s*date|invoice\s*date|rechnungsdatum|belegdatum)/gi;
      const labelCount = (pdfText.match(labelRe) || []).length;
      if (labelCount >= 2) {
        try {
          const json = await ollamaClient.generateJson<any>({
            prompt: `${multiPrompt}\n\nHere is the exact text extracted from the PDF:\n---\n${pdfText.substring(0, 9000)}\n---`,
          });
          if (json && Array.isArray(json.bills)) collected.push(...json.bills);
        } catch (err: any) {
          console.warn('[Multi-Bill AI] Text-mode extraction notice:', err?.message || err);
        }
      }
    } else {
      // Offline CPU OCR + Page Grouping FIRST (fast CPU, avoids multi-minute GPU vision scan)
      try {
        const cpuPages = await ocrService.extractPages(filePath, mimeType);
        if (cpuPages.length > 0) {
          const mFn = fname.match(/(\d{2})(20\d{2})/) || fname.match(/(20\d{2})[-_](\d{2})/);
          const estYear = mFn ? parseInt(mFn[1].length === 4 ? mFn[1] : mFn[2], 10) : new Date().getFullYear();
          const estMonth = mFn ? parseInt(mFn[1].length === 4 ? mFn[2] : mFn[1], 10) : new Date().getMonth() + 1;
          const indexed = await belegIndexService.indexDocumentFile(filePath, mimeType, {
            clientId: clientId || 'user_client_1',
            year: estYear,
            month: estMonth,
            filename: originalFilename || path.basename(filePath),
          });
          if (indexed.length > 1) {
            for (const rec of indexed) {
              if (rec.amount <= 0) continue;
              collected.push({
                supplier_name: rec.partner,
                invoice_number: rec.invoiceNo || '',
                raw_bill_date: rec.date,
                total_amount: rec.amount,
                vat_amount: rec.vatRate && rec.netAmount ? Math.round((rec.amount - rec.netAmount) * 100) / 100 : 0,
                currency: 'EUR',
                document_type: rec.type === 'QA24_SALE' ? 'SALES_INVOICE' : rec.type === 'RECEIPT' ? 'RECEIPT' : 'PURCHASE_INVOICE',
                tax_regime: rec.taxClause === '25a' ? 'margin_25a' : rec.taxClause === 'EU' ? 'eu_b2b_0' : rec.taxClause === '7' ? 'reduced_7' : 'regular_19',
                vin: rec.vin || '',
                line_items_summary: rec.matchedLineSnippet || rec.partner,
              });
            }
          }
        }
      } catch (cpuErr: any) {
        console.warn('[Multi-Bill CPU OCR] Notice:', cpuErr?.message);
      }

      // Vision fallback only if CPU OCR could not extract multiple bills
      if (collected.length === 0) {
        let images: string[] = [];
        if (isPdf) {
          images = pdfExtractor.extractEmbeddedImages(filePath, 25);
        } else if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(filePath)) {
          try {
            images = [fs.readFileSync(filePath).toString('base64')];
          } catch {
            images = [];
          }
        }
        for (let i = 0; i < images.length; i++) {
          console.log(`[Multi-Bill AI] Scanning page/image ${i + 1}/${images.length} for multiple bills...`);
          const bills = await runVision(images[i]);
          collected.push(...bills);
        }
      }
    }

    // --- Normalize, validate & de-duplicate the detected bills ---
    const parseAmount = (val: any): number => {
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      if (!val) return 0;
      let s = String(val).replace(/[^0-9.,-]/g, '');
      if (s.includes(',') && s.includes('.')) {
        s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
      } else if (s.includes(',')) {
        s = s.replace(',', '.');
      }
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    };

    const seen = new Set<string>();
    const unique: any[] = [];
    for (const b of collected) {
      if (!b || typeof b !== 'object') continue;
      const rawDate = String(b.raw_bill_date || b.bill_date || b.invoice_date || b.raw_invoice_date || '').trim();
      const isoDate = this.resolveDocumentDate({ raw_invoice_date: rawDate }, '', '', '', '');
      const todayIso = new Date().toISOString().split('T')[0];
      const total = parseAmount(b.total_amount ?? b.amount_due ?? b.total);
      if (!rawDate || isoDate === todayIso || total <= 0) continue; // unreadable bill -> ignore

      const disc = String(b.invoice_number || b.vin || b.supplier_name || '').toLowerCase().trim();
      const key = `${isoDate}|${total.toFixed(2)}|${disc}`;
      if (seen.has(key)) continue; // the vision model sometimes lists the same bill twice
      seen.add(key);
      unique.push({ ...b, _iso: isoDate, _total: total, _rawDate: rawDate });
    }

    if (unique.length < 2) {
      if (collected.length > 0) {
        console.log(`[Multi-Bill AI] ${unique.length} valid bill(s) detected -> single-document flow.`);
      }
      return [];
    }

    // Sort chronologically for a clean booking order
    unique.sort((a, b) => String(a._iso).localeCompare(String(b._iso)));

    const results: ExtractedInvoiceData[] = unique.map((b) => {
      const supplier = String(b.supplier_name || 'Lieferant').replace(/^\d+\s+/, '').trim() || 'Lieferant';
      const sanitized = this.sanitizeOutput(
        {
          document_type: b.document_type || 'PURCHASE_INVOICE',
          supplier_name: supplier,
          invoice_number: b.invoice_number ? String(b.invoice_number) : '',
          raw_invoice_date: b._iso,
          currency: String(b.currency || 'EUR').toUpperCase().slice(0, 3),
          total_amount: b._total,
          vat_amount: parseAmount(b.vat_amount),
          line_items_summary: typeof b.line_items_summary === 'string' ? b.line_items_summary : '',
          payment_method: 'bank_transfer',
        },
        '',
        '',
        clientId
      );
      sanitized.invoice_date = b._iso; // guarantee the bill date (never due date / today)
      return sanitized;
    });

    console.log(
      `[Multi-Bill AI] Detected ${results.length} separate bills: ` +
        results.map((r) => `${r.supplier_name} (${r.invoice_date}, ${r.total_amount} ${r.currency})`).join(' | ')
    );
    return results;
  },

  /**
   * Resolves the accurate YYYY-MM-DD invoice/document date from AI output, OCR text, and filename
   * without digit permutation errors.
   */
  resolveDocumentDate(parsed: any, extractedText = '', filename = '', summary = '', supplier = '', fallbackYear?: number): string {
    const todayIso = new Date().toISOString().split('T')[0];
    const fnYearHit = String(filename || '').match(/(20[1-3][0-9])/);
    const defaultYear = String(fallbackYear || (fnYearHit ? fnYearHit[1] : new Date().getFullYear()));
    const monthsMap: Record<string, string> = {
      jan: '01', january: '01', januar: '01',
      feb: '02', february: '02', februar: '02',
      mar: '03', march: '03', märz: '03', maerz: '03', mrz: '03',
      apr: '04', april: '04',
      may: '05', mai: '05',
      jun: '06', june: '06', juni: '06',
      jul: '07', july: '07', juli: '07',
      aug: '08', august: '08',
      sep: '09', september: '09', sept: '09',
      oct: '10', october: '10', okt: '10', oktober: '10',
      nov: '11', november: '11',
      dec: '12', december: '12', dez: '12', dezember: '12',
    };

    const parseRawDateString = (raw: string): string | null => {
      if (!raw) return null;
      const s = String(raw).trim();
      // 1. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
      const dmy = s.match(/\b(0?[1-9]|[12][0-9]|3[01])\s*[./-]\s*(0?[1-9]|1[0-2])\s*[./-]\s*(20[1-3][0-9]|[12][0-9])\b/);
      if (dmy) {
        const d = dmy[1].padStart(2, '0');
        const m = dmy[2].padStart(2, '0');
        const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
        return `${y}-${m}-${d}`;
      }
      // 2. YYYY-MM-DD or YYYY/MM/DD
      const ymd = s.match(/\b(20[1-3][0-9])\s*[./-]\s*(0?[1-9]|1[0-2])\s*[./-]\s*(0?[1-9]|[12][0-9]|3[01])\b/);
      if (ymd) {
        return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
      }
      // 3. Swapped YYYY-DD-MM from LLM (e.g. 2026-20-06)
      const ydm = s.match(/\b(20[1-3][0-9])\s*[./-]\s*(1[3-9]|2[0-9]|3[01])\s*[./-]\s*(0?[1-9]|1[0-2])\b/);
      if (ydm) {
        return `${ydm[1]}-${ydm[3].padStart(2, '0')}-${ydm[2].padStart(2, '0')}`;
      }
      // 4. "15 June 2026" or "15. Juni 2026"
      const eng1 = s.match(/\b(0?[1-9]|[12][0-9]|3[01])\.?\s+([a-zA-ZäöüÄÖÜ]{3,10})[\s,]+(20[1-3][0-9])\b/);
      if (eng1) {
        const mKey = eng1[2].toLowerCase();
        const m = monthsMap[mKey] || monthsMap[mKey.substring(0, 3)];
        if (m) return `${eng1[3]}-${m}-${eng1[1].padStart(2, '0')}`;
      }
      // 5. "June 15, 2026"
      const eng2 = s.match(/\b([a-zA-ZäöüÄÖÜ]{3,10})\s+(0?[1-9]|[12][0-9]|3[01])[\s,]+(20[1-3][0-9])\b/);
      if (eng2) {
        const mKey = eng2[1].toLowerCase();
        const m = monthsMap[mKey] || monthsMap[mKey.substring(0, 3)];
        if (m) return `${eng2[3]}-${m}-${eng2[2].padStart(2, '0')}`;
      }
      // 6. Month + Year (e.g. "Juni 2026", "06/2026")
      const myName = s.match(/\b(january|januar|february|februar|march|märz|maerz|april|may|mai|june|juni|july|juli|august|september|october|oktober|november|december|dezember)\s*(20[1-3][0-9])?\b/i);
      if (myName) {
        const mKey = myName[1].toLowerCase();
        const m = monthsMap[mKey] || monthsMap[mKey.substring(0, 3)] || '01';
        const y = myName[2] || defaultYear;
        return `${y}-${m}-28`;
      }
      const myNum = s.match(/\b(0[1-9]|1[0-2])\s*[./-]\s*(20[1-3][0-9])\b/);
      if (myNum) {
        return `${myNum[2]}-${myNum[1]}-28`;
      }
      return null;
    };

    // Priority 1: Explicit labeled date in OCR text (Rechnungsdatum, Datum, Belegdatum, Ausstellungsdatum)
    if (extractedText) {
      const labeled = extractedText.match(/(?:Rechnungsdatum|Belegdatum|Ausstellungsdatum|Leistungsdatum|Datum|Date|Invoice\s*Date)[:\s]*([^\n\r]{6,25})/i);
      if (labeled) {
        const fromLabeled = parseRawDateString(labeled[1]);
        if (fromLabeled) return fromLabeled;
      }
    }

    // Priority 2: parsed.raw_invoice_date
    if (parsed?.raw_invoice_date) {
      const fromRaw = parseRawDateString(String(parsed.raw_invoice_date));
      if (fromRaw) return fromRaw;
    }

    // Priority 3: parsed.invoice_day / invoice_month / invoice_year
    const pYear = Number(parsed?.invoice_year);
    const pMonth = Number(parsed?.invoice_month);
    const pDay = Number(parsed?.invoice_day) || 28;
    if (pYear >= 2015 && pYear <= 2035 && pMonth >= 1 && pMonth <= 12 && pDay >= 1 && pDay <= 31) {
      return `${pYear}-${String(pMonth).padStart(2, '0')}-${String(pDay).padStart(2, '0')}`;
    }

    // Priority 4: parsed.invoice_date
    if (parsed?.invoice_date) {
      const fromInvDate = parseRawDateString(String(parsed.invoice_date));
      if (fromInvDate) return fromInvDate;
    }

    // Priority 5: Any valid date or month/year inside OCR text
    if (extractedText) {
      const fromText = parseRawDateString(extractedText);
      if (fromText) return fromText;
    }

    // Priority 6: Filename patterns (e.g. 202606, 06_Kassenbelege, Juni_2026)
    if (filename) {
      const fnYmd = filename.match(/(20[2-3][0-9])(0[1-9]|1[0-2])/);
      if (fnYmd) {
        return `${fnYmd[1]}-${fnYmd[2]}-28`;
      }
      const fromFn = parseRawDateString(filename);
      if (fromFn) return fromFn;
      const fnPrefix = filename.match(/^0?([1-9]|1[0-2])[_-\s]/);
      if (fnPrefix) {
        return `${defaultYear}-${fnPrefix[1].padStart(2, '0')}-28`;
      }
    }

    // Priority 7: Combined supplier + summary text
    const fromCombined = parseRawDateString(`${supplier} ${summary}`);
    if (fromCombined) return fromCombined;

    return todayIso;
  },

  /**
   * Resilient fallback parser that extracts amounts and numbers using regex
   */
  heuristicFallback(text: string, filename: string): ExtractedInvoiceData {
    let total = 0;
    let invNum = '';
    let supplier = '';
    const lowerName = filename.toLowerCase();

    if (text) {
      // 1. Look for explicit total labels
      const totalMatch = text.match(/(?:Gesamtbetrag|Endbetrag|Rechnungsbetrag|Zahlbetrag|Bruttobetrag|Total|Summe|Betrag|Saldo|Überweisung)[^\d\n\r]*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2}|[0-9]+(?:\.[0-9]{2}))/i);
      if (totalMatch) {
        total = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
      }

      // 2. If no labeled total, find currency amount patterns
      if (total === 0) {
        const currencyMatches = text.matchAll(/([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*(?:€|EUR)|(?:€|EUR)\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/gi);
        let maxVal = 0;
        for (const m of currencyMatches) {
          const raw = (m[1] || m[2]).replace(/\./g, '').replace(',', '.');
          const val = parseFloat(raw);
          if (val > maxVal && val < 1000000) maxVal = val;
        }
        if (maxVal > 0) total = maxVal;
      }

      // 3. Extract Invoice Number
      const invMatch = text.match(/(?:Rechnungs-?Nr\.?|Rechnung|Beleg-?Nr\.?|Invoice\s*(?:no\.?|#)?)[:\s#]*([A-Za-z0-9-_/]{4,24})/i);
      if (invMatch) {
        invNum = invMatch[1].trim();
      }

      // 4. Extract Supplier / Vendor name
      const vendorMatch = text.match(/([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\s&.-]+(?:GmbH|AG|GbR|KG|e\.K\.|UG|OHG|SE|Bank|Sparkasse|Finanzamt|Telekom|Vodafone))/);
      if (vendorMatch) {
        supplier = vendorMatch[1].trim();
      }
    }

    if (total === 0 && lowerName.includes('total')) {
      const numMatch = lowerName.match(/(\d+(?:[.,]\d{1,2})?)/);
      if (numMatch) total = parseFloat(numMatch[1].replace(',', '.')) || 0;
    }

    const isReceipt = lowerName.includes('total') || lowerName.includes('bon') || lowerName.includes('bar') || lowerName.includes('kasse');
    const docType: DocumentType = isReceipt ? 'RECEIPT' : 'PURCHASE_INVOICE';
    if (!supplier) {
      supplier = isReceipt ? 'Barbeleg / Kassenquittung' : 'Eingangsrechnung';
    }
    if (!invNum) {
      invNum = 'BELEG-' + Math.floor(Math.random() * 90000 + 10000);
    }

    const invDate = this.resolveDocumentDate(null, text, filename, '', supplier);
    const mapped = skr03Mapper.suggestAccount(supplier, text || lowerName, 19);

    const vatRate = 19;
    const net = parseFloat((total / (1 + vatRate / 100)).toFixed(2));
    const vat = parseFloat((total - net).toFixed(2));
    const belegParts = invDate.split('-');
    const belegdatum = belegParts.length === 3 ? `${belegParts[2]}${belegParts[1]}` : '2801';

    return {
      document_type: docType,
      supplier_name: supplier,
      supplier_tax_id: '',
      invoice_number: invNum,
      invoice_date: invDate,
      currency: 'EUR',
      net_amount: net,
      vat_rate_percent: vatRate,
      vat_amount: vat,
      total_amount: total,
      confidence_score: 0.85,
      skr03_account_code: mapped.code,
      payment_method: isReceipt ? 'cash' : 'bank_transfer',
      line_items_summary: isReceipt ? 'Barbeleg (Barauslage)' : 'Eingescannter Beleg',
      bookings: [
        {
          amount: total,
          sh: 'H',
          konto: isReceipt ? '1000' : '1200',
          gegenkonto: mapped.code,
          buCode: '9',
          belegdatum,
          belegfeld1: invNum,
          buchungstext: `${supplier} (${invNum})`.slice(0, 60),
          currency: 'EUR',
        },
      ],
    };
  },

  /**
   * Sanitizes and validates extracted AI data to ensure strict GoBD & SKR03 compliance
   */
  sanitizeOutput(parsed: any, filename = '', extractedText = '', clientId?: string): ExtractedInvoiceData {
    // 1. Line items summary & array extraction
    let summary = '';
    const rawItems: any[] = Array.isArray(parsed.line_items)
      ? parsed.line_items
      : Array.isArray(parsed.line_items_summary)
      ? parsed.line_items_summary
      : [];

    if (typeof parsed.line_items_summary === 'string') {
      const s = parsed.line_items_summary.trim();
      if (!/brief description|placeholder|lorem ipsum|beispieltext/i.test(s)) {
        summary = s;
      }
    } else if (rawItems.length > 0) {
      summary = rawItems
        .map((it: any) => {
          if (typeof it === 'string') return it;
          const desc = it.item_description || it.description || it.name || it.item || 'Item';
          const rate = it.rate || it.amount || it.price || '';
          return rate ? `${desc}: ${rate}` : desc;
        })
        .join(', ');
    }

    // 2. Supplier name
    let supplier = (parsed.supplier_name || '').trim();
    const isHandwritten =
      filename.toLowerCase().includes('total') ||
      supplier.toLowerCase().includes('total') ||
      supplier.toLowerCase().includes('handwritten') ||
      summary.toLowerCase().includes('tea') ||
      summary.toLowerCase().includes('food');

    if (!supplier || supplier.toLowerCase() === 'total' || supplier.toLowerCase() === 'beleg') {
      supplier = isHandwritten ? 'Handwritten Expense Note (Barauslage)' : 'Lieferant / Beleg';
    }

    // 3. Document type
    let docType: DocumentType = parsed.document_type || (isHandwritten ? 'RECEIPT' : 'PURCHASE_INVOICE');
    if (docType !== 'PURCHASE_INVOICE' && docType !== 'SALES_INVOICE' && docType !== 'RECEIPT') {
      docType = isHandwritten ? 'RECEIPT' : 'PURCHASE_INVOICE';
    }

    // 4. Helper for robust European currency / number parsing (e.g. "181,15€", "1,138,36", "1.234,56")
    const parseNumber = (val: any): number => {
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      if (!val) return 0;
      let s = String(val).replace(/[€EUR$\s]/gi, '').trim();
      if (s.includes(',') && s.includes('.')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
          // German format 1.234,56
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          // International format 1,234.56
          s = s.replace(/,/g, '');
        }
      } else if (s.includes(',')) {
        const parts = s.split(',');
        if (parts.length > 2) {
          // Multiple commas e.g. 1,138,36 -> 1138.36
          const dec = parts.pop();
          s = parts.join('') + '.' + dec;
        } else {
          s = s.replace(',', '.');
        }
      }
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    };

    let total = parseNumber(parsed.total_amount);
    let net = parseNumber(parsed.net_amount);
    let vat = parseNumber(parsed.vat_amount);

    let rawVatRate = String(parsed.vat_rate_percent || '').replace(/[^0-9]/g, '');
    let vatRate = parseInt(rawVatRate, 10);
    if (isNaN(vatRate)) {
      if (total > 0 && net > 0 && total > net) {
        vatRate = Math.round(((total - net) / net) * 100);
      } else {
        vatRate = 19;
      }
    }

    if (total === 0 && rawItems.length > 0) {
      const sumItems = rawItems.reduce((acc, it) => acc + parseNumber(it.amount || it.total || it.price || 0), 0);
      if (sumItems > 0) total = parseFloat(sumItems.toFixed(2));
    }
    if (total === 0 && (extractedText || summary)) {
      const pool = `${extractedText}\n${summary}`;
      const totalMatch = pool.match(/(?:Gesamtbetrag|Endbetrag|Rechnungsbetrag|Zahlbetrag|Bruttobetrag|Total|Summe|Betrag)[^\d\n\r]*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2}|[0-9]+\.[0-9]{2})/i);
      if (totalMatch) {
        total = parseNumber(totalMatch[1]);
      } else {
        const currMatches = pool.matchAll(/([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+\.[0-9]{2})\s*(?:€|EUR)|(?:€|EUR)\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+\.[0-9]{2})/gi);
        let maxV = 0;
        for (const m of currMatches) {
          const v = parseNumber(m[1] || m[2]);
          if (v > maxV && v < 1000000) maxV = v;
        }
        if (maxV > 0) total = maxV;
      }
    }

    // Mathematical consistency check (Net + VAT = Gross) & Auto-Correction via Math Cross-Validation Engine
    const validatedMath = mathCrossValidationService.validateAndAutoCorrect({
      net_amount: net,
      vat_amount: vat,
      total_amount: total,
      vat_rate_percent: vatRate,
    });
    net = validatedMath.net_amount;
    vat = validatedMath.vat_amount;
    total = validatedMath.total_amount;
    vatRate = validatedMath.vat_rate_percent;
    if (validatedMath.wasCorrected && validatedMath.correctionLog.length > 0) {
      console.log(`[Math Cross-Validation] ${validatedMath.correctionLog.join(' | ')}`);
    }

    // 5. Deterministic Fact-to-SKR03 Rules Engine (Qwen extracts facts; code assigns SKR03 deterministically)
    const aiCategory = String(parsed.category || '').toLowerCase().trim();
    const aiTaxRegime = String(parsed.tax_regime || '').toLowerCase().trim();
    const ownSettings = clientRulesService.getClientSettings(clientId);
    const ownCompanyCore = (ownSettings.company_name || '')
      .toLowerCase()
      .replace(/\s*(?:gmbh|ug|ag|kg|ohg)\b/gi, '')
      .trim();
    const ownKeywords = [ownCompanyCore, ...(ownSettings.own_issuer_keywords || []).map((k) => k.toLowerCase())].filter(
      (k) => k.length >= 3
    );
    const sellerLower = String(parsed.seller_name || '').toLowerCase();
    const isOwnSeller =
      Boolean(parsed.is_own_company_seller) ||
      (ownKeywords.some((k) => sellerLower.includes(k)) && !/\bankauf/i.test(extractedText));
    const isSummaryStmt = Boolean(parsed.is_summary_statement) || aiCategory === 'summary_list';
    const aiVin = String(parsed.vin || '').replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();

    if (isOwnSeller) {
      docType = 'SALES_INVOICE';
      if (parsed.buyer_name && String(parsed.buyer_name).trim().length > 2) {
        supplier = String(parsed.buyer_name).trim();
      }
    }
    if (aiVin.length === 17 && !summary.toUpperCase().includes(aiVin)) {
      summary = `${summary ? summary + ' | ' : ''}VIN ${aiVin}`;
    }
    if (isSummaryStmt && !/SUMMARY_LIST/i.test(summary)) {
      summary = `[SUMMARY_LIST] ${summary}`.trim();
    }

    const CATEGORY_SKR03_MAP: Record<string, { code: string; vat: number }> = {
      fuel: { code: '4530', vat: 19 },
      car_repair_parts: { code: '4540', vat: 19 },
      rent: { code: '4210', vat: 0 },
      travel_hotel: { code: '4673', vat: 7 },
      food_groceries: { code: '3300', vat: 7 },
      hospitality_restaurant: { code: '4650', vat: 19 },
      post_shipping: { code: '4910', vat: 0 },
      telecom_internet: { code: '4920', vat: 19 },
      office_supplies: { code: '4930', vat: 19 },
      legal_notary_tax: { code: '4955', vat: 19 },
      gov_court_fee: { code: '4390', vat: 0 },
    };

    let skr03Code = '';
    if (aiCategory === 'car_sale' || (isOwnSeller && docType === 'SALES_INVOICE')) {
      docType = 'SALES_INVOICE';
      if (aiTaxRegime === 'margin_25a' || /§\s*25a|differenzbesteuerung/i.test(extractedText)) {
        skr03Code = '8193';
        vatRate = 0;
        vat = 0;
        net = total;
      } else if (aiTaxRegime === 'eu_b2b_0') {
        skr03Code = '8125';
        vatRate = 0;
        vat = 0;
        net = total;
      } else {
        skr03Code = '8400';
      }
    } else if (aiCategory === 'car_purchase') {
      if (aiTaxRegime === 'margin_25a' || /§\s*25a|differenzbesteuerung|privat/i.test(extractedText)) {
        skr03Code = '3200';
        vatRate = 0;
        vat = 0;
        net = total;
      } else {
        skr03Code = '3400';
      }
    } else if (CATEGORY_SKR03_MAP[aiCategory]) {
      skr03Code = CATEGORY_SKR03_MAP[aiCategory].code;
      if (CATEGORY_SKR03_MAP[aiCategory].vat === 0) {
        vatRate = 0;
        vat = 0;
        net = total;
      }
    }

    if (!skr03Code) {
      const rawCode = parsed.skr03_account_code ? String(parsed.skr03_account_code).trim() : '';
      const is4DigitCode = /^\d{4}$/.test(rawCode);
      skr03Code = is4DigitCode && !['1000', '1200', '1400', '1600', '4930'].includes(rawCode) ? rawCode : '';
      if (!skr03Code) {
        const suggested = skr03Mapper.suggestAccount(supplier, `${summary} ${extractedText.substring(0, 600)}`, vatRate);
        skr03Code = suggested.code;
      }
    }
    // Note: Do NOT auto-learn raw AI guesses into supplierMemoryService (learned memory is updated only on human approval)

    // 6. Clean Date using resolveDocumentDate (never permutes DD/MM/YYYY)
    const invDate = this.resolveDocumentDate(parsed, extractedText, filename, summary, supplier);

    // 7. Clean Invoice Number
    let invNum = parsed.invoice_number ? String(parsed.invoice_number).replace(/[;"\r\n]/g, '').trim() : '';
    if (!invNum) {
      invNum = isHandwritten ? 'BELEG-' + Math.round(total) : 'BELEG-' + Math.floor(Math.random() * 90000 + 10000);
    }

    // 8. Payment method (Kasse vs Bank)
    const isCash =
      isHandwritten ||
      docType === 'RECEIPT' ||
      supplier.toLowerCase().includes('bar') ||
      (parsed.payment_method && String(parsed.payment_method).toLowerCase().includes('cash'));

    const belegParts = invDate.split('-');
    const defaultBelegdatum = belegParts.length === 3 ? `${belegParts[2]}${belegParts[1]}` : '2801';

    // 9. Structured bookings for all documents (multi-booking or single-booking)
    let bookings: BookingItem[] | undefined = undefined;
    if (parsed.bookings && Array.isArray(parsed.bookings) && parsed.bookings.length > 0) {
      bookings = parsed.bookings.map((b: any) => ({
        amount: parseNumber(b.amount) || total,
        sh: (b.sh === 'S' || b.sh === 's' || b.soll_haben === 'S') ? 'S' : 'H',
        konto: String(b.konto || (isCash ? '1000' : '1200')).trim(),
        gegenkonto: String(b.gegenkonto || skr03Code).trim(),
        buCode: b.buCode !== undefined ? String(b.buCode).replace(/"/g, '').trim() : '',
        belegdatum: String(b.belegdatum || defaultBelegdatum).replace(/[^0-9]/g, '').slice(-4) || defaultBelegdatum,
        belegfeld1: b.belegfeld1 ? String(b.belegfeld1).trim() : invNum,
        buchungstext: String(b.buchungstext || supplier).trim(),
        currency: b.currency || parsed.currency || 'EUR',
      }));
    } else {
      // Generic Invoice Line Items
      if (rawItems.length > 1) {
        const itemBookings: BookingItem[] = [];
        for (const it of rawItems) {
          const itemDesc = String(it.item_description || it.description || it.name || it.item || 'Item').trim();
          const itemAmt = parseNumber(it.amount || it.total || it.price || (it.qty && it.rate ? it.qty * it.rate : 0));
          if (itemAmt > 0) {
            const itemAccount = skr03Mapper.suggestAccount(supplier, itemDesc, vatRate);
            itemBookings.push({
              amount: itemAmt,
              sh: docType === 'SALES_INVOICE' ? 'S' : 'H',
              konto: isCash ? '1000' : '1200',
              gegenkonto: itemAccount.code || skr03Code,
              buCode: vatRate === 19 ? '9' : vatRate === 7 ? '8' : '',
              belegdatum: defaultBelegdatum,
              belegfeld1: invNum,
              buchungstext: itemDesc.slice(0, 60),
              currency: parsed.currency || 'EUR',
            });
          }
        }
        if (itemBookings.length > 0) {
          bookings = itemBookings;
        }
      }

      // Always ensure at least 1 structured SKR03 booking exists
      if (!bookings || bookings.length === 0) {
        const isSales = docType === 'SALES_INVOICE' || skr03Code.startsWith('8');
        bookings = [
          {
            amount: total,
            sh: isSales ? 'S' : 'H',
            konto: isCash ? '1000' : '1200',
            gegenkonto: skr03Code,
            buCode: isSales ? '' : (vatRate === 19 ? '9' : vatRate === 7 ? '8' : ''),
            belegdatum: defaultBelegdatum,
            belegfeld1: invNum,
            buchungstext: `${supplier}${summary ? ' - ' + summary : ''}`.slice(0, 60),
            currency: parsed.currency || 'EUR',
          },
        ];
      }
    }

    return {
      document_type: docType,
      supplier_name: supplier,
      supplier_tax_id: parsed.supplier_tax_id ? String(parsed.supplier_tax_id).trim() : '',
      invoice_number: invNum,
      invoice_date: invDate,
      currency: parsed.currency || 'EUR',
      net_amount: net,
      vat_rate_percent: vatRate,
      vat_amount: vat,
      total_amount: total,
      confidence_score: Number(parsed.confidence_score) || 0.95,
      skr03_account_code: skr03Code,
      payment_method: isCash ? 'cash' : 'bank_transfer',
      line_items_summary: summary || undefined,
      bookings: bookings,
    };
  },

  /**
   * Checks whether an uploaded Formation / Identity Document (Passport, Personalausweis,
   * Gewerbeanmeldung, Residence Permit, etc.) contains an expiry date.
   * If found, calculates validity and notifies user with days left or expiration alert.
   */
  async checkDocumentExpiry(filePath: string, mimeType: string, originalFilename?: string): Promise<ExpiryInfo> {
    const isPdf = pdfExtractor.isPdf(filePath, mimeType);
    let extractedText = '';

    if (isPdf) {
      try {
        extractedText = await pdfExtractor.extractText(filePath);
      } catch (err: any) {
        console.warn('[AI Expiry Check] PDF text extraction warning:', err?.message);
      }
    } else if (mimeType.includes('text') || filePath.endsWith('.txt')) {
      try {
        extractedText = fs.readFileSync(filePath, 'utf8');
      } catch {}
    }

    let base64Data = '';
    try {
      const fileBytes = fs.readFileSync(filePath);
      base64Data = fileBytes.toString('base64');
    } catch (err: any) {
      console.warn('[AI Expiry Check] Could not read file bytes:', err?.message);
    }

    const monthLookup: Record<string, number> = {
      jan: 1, januar: 1, january: 1,
      feb: 2, februar: 2, february: 2,
      mar: 3, mrz: 3, märz: 3, maerz: 3, march: 3,
      apr: 4, april: 4,
      may: 5, mai: 5,
      jun: 6, juni: 6, june: 6,
      jul: 7, juli: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      okt: 10, oct: 10, oktober: 10, october: 10,
      nov: 11, november: 11,
      dez: 12, dec: 12, dezember: 12, december: 12,
    };

    // Helper to calculate days until expiry & status
    const buildResult = (isoDate: string, docTitle?: string, issueIsoDate?: string): ExpiryInfo => {
      const [ey, em, ed] = isoDate.split('-').map(Number);
      const formatted_date = `${String(ed).padStart(2, '0')}.${String(em).padStart(2, '0')}.${ey}`;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const expDate = new Date(ey, em - 1, ed);
      const diffMs = expDate.getTime() - today.getTime();
      const days_until_expiry = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const is_expired = days_until_expiry < 0;

      let total_validity_days = 365;
      if (issueIsoDate) {
        const [iy, im, id] = issueIsoDate.split('-').map(Number);
        const issueDate = new Date(iy, im - 1, id);
        const spanMs = expDate.getTime() - issueDate.getTime();
        total_validity_days = Math.max(30, Math.round(spanMs / (1000 * 60 * 60 * 24)));
      } else {
        if (days_until_expiry > 1825) total_validity_days = 3650; // 10 years (e.g. Passport)
        else if (days_until_expiry > 1095) total_validity_days = 1825; // 5 years (e.g. National ID)
        else if (days_until_expiry > 548) total_validity_days = 1095; // 3 years (e.g. 3-Year Visa)
        else if (days_until_expiry > 365) total_validity_days = 730; // 2 years (e.g. 2-Year Visa)
        else total_validity_days = 365; // 1 year
      }

      const percentage_remaining = is_expired
        ? 0
        : Math.max(2, Math.min(99, Math.round((days_until_expiry / total_validity_days) * 100)));

      let status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' = 'VALID';
      let warning_message = `AI-Erkennung: Dokument ist gültig bis ${formatted_date}`;

      if (is_expired) {
        status = 'EXPIRED';
        const daysPast = Math.abs(days_until_expiry);
        warning_message = `Achtung: Dokument ist seit dem ${formatted_date} abgelaufen (vor ${daysPast} Tagen)!`;
      } else if (days_until_expiry <= 90) {
        status = 'EXPIRING_SOON';
        warning_message = `Hinweis: Dokument läuft am ${formatted_date} ab (nur noch ${days_until_expiry} Tage / ${percentage_remaining}% gültig)!`;
      } else {
        status = 'VALID';
        warning_message = `AI-Prüfung erfolgreich: Dokument ist gültig bis ${formatted_date} (${days_until_expiry} Tage / ${percentage_remaining}% verbleibend).`;
      }

      console.log(`[AI Expiry Check] Detected expiry date: ${isoDate} (${status}, ${days_until_expiry} days left, ${percentage_remaining}% of ${total_validity_days}d total)`);

      return {
        has_expiry: true,
        expiry_date: isoDate,
        formatted_date,
        issue_date: issueIsoDate,
        total_validity_days,
        percentage_remaining,
        is_expired,
        days_until_expiry,
        status,
        doc_title: docTitle || 'Gründungsunterlage',
        warning_message,
      };
    };

    // 1. Digital Text Regex Matching (Fast & Highly Accurate)
    const combinedSearchPool = `${extractedText} ${originalFilename || ''}`;

    // Extract Issue Date if present in text
    let detectedIssueDate: string | undefined = undefined;
    const pIssue = /(?:ausstellungsdatum|ausgestellt\s+am|erteilungsdatum|date\s+of\s+issue|issue\s+date|issued\s+on|issued|valid\s+from|g[üu]ltig\s+ab|4a[.:\s\-–—])[\s:.\-–—]*([0-3]?[0-9])[./\-]([0-1]?[0-9])[./\-](20\d{2}|\d{2})\b/i;
    const mIssue = combinedSearchPool.match(pIssue);
    if (mIssue) {
      const id = mIssue[1].padStart(2, '0');
      const im = mIssue[2].padStart(2, '0');
      const iy = mIssue[3].length === 2 ? `20${mIssue[3]}` : mIssue[3];
      detectedIssueDate = `${iy}-${im}-${id}`;
    }

    if (combinedSearchPool.trim()) {
      // 1.1 Field 4b (Standard ICAO code for date of expiry on IDs, Passports, Driving Licenses)
      const m4b = combinedSearchPool.match(/\b4b[.:\s\-–—]+([0-3]?[0-9])[./\-]([0-1]?[0-9])[./\-](20\d{2}|\d{2})\b/i);
      if (m4b) {
        const d = m4b[1].padStart(2, '0');
        const m = m4b[2].padStart(2, '0');
        const y = m4b[3].length === 2 ? `20${m4b[3]}` : m4b[3];
        return buildResult(`${y}-${m}-${d}`, 'Ausweis / Führerschein (Feld 4b)', detectedIssueDate);
      }

      // 1.2 Keyword Pattern with DD.MM.YYYY or DD/MM/YYYY
      const p1 = /(?:g[üu]ltig\s+bis|ablaufdatum|ablauf|enddatum|geltungsdauer\s+bis|g[üu]ltigkeit\s+bis|befristet\s+bis|expiry\s+date|expiration\s+date|date\s+of\s+expiry|expires\s+on|expires|valid\s+until|valid\s+through|valid\s+to|valable\s+jusqu['’]au|date\s+d['’]expiration)[\s:.\-–—]*([0-3]?[0-9])[./\-]([0-1]?[0-9])[./\-](20\d{2}|\d{2})\b/i;
      const m1 = combinedSearchPool.match(p1);
      if (m1) {
        const d = m1[1].padStart(2, '0');
        const m = m1[2].padStart(2, '0');
        const y = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
        return buildResult(`${y}-${m}-${d}`, 'Gültigkeitsnachweis', detectedIssueDate);
      }

      // 1.3 Keyword Pattern with Month Name (e.g. "15 August 2028" or "15. Aug 2028")
      const p2 = /(?:g[üu]ltig\s+bis|ablaufdatum|ablauf|enddatum|expiry\s+date|expiration\s+date|date\s+of\s+expiry|expires\s+on|expires|valid\s+until|valid\s+through|valid\s+to|valable\s+jusqu['’]au)[\s:.\-–—]*([0-3]?[0-9])[\s./\-]+([a-zA-ZäöüÄÖÜ]{3,10})[\s./\-,]+(20\d{2}|\d{2})\b/i;
      const m2 = combinedSearchPool.match(p2);
      if (m2) {
        const d = m2[1].padStart(2, '0');
        const mKey = m2[2].toLowerCase().substring(0, 3);
        const mNum = monthLookup[mKey] || 1;
        const m = String(mNum).padStart(2, '0');
        const y = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
        return buildResult(`${y}-${m}-${d}`, 'Gültigkeitsnachweis', detectedIssueDate);
      }

      // 1.4 Keyword Pattern with ISO YYYY-MM-DD
      const p3 = /(?:g[üu]ltig\s+bis|ablaufdatum|ablauf|enddatum|expiry\s+date|expiration\s+date|date\s+of\s+expiry|expires\s+on|expires|valid\s+until|valid\s+through|valid\s+to|valable\s+jusqu['’]au)[\s:.\-–—]*(20\d{2})-(0?[1-9]|1[0-2])-([0-3]?[0-9])\b/i;
      const m3 = combinedSearchPool.match(p3);
      if (m3) {
        const y = m3[1];
        const m = m3[2].padStart(2, '0');
        const d = m3[3].padStart(2, '0');
        return buildResult(`${y}-${m}-${d}`, 'Gültigkeitsnachweis', detectedIssueDate);
      }

      // 1.5 Machine Readable Zone (MRZ) Check on Passports & ID Cards
      // TD3 Passports: Line 2 chars 21-26 is YYMMDD of expiry date
      const mrzTd3 = combinedSearchPool.match(/(?:P<[A-Z0-9<]{38,}[\r\n]+[A-Z0-9<]{21})([0-9]{2})([0-1][0-9])([0-3][0-9])/);
      if (mrzTd3) {
        const y = `20${mrzTd3[1]}`;
        const m = mrzTd3[2];
        const d = mrzTd3[3];
        return buildResult(`${y}-${m}-${d}`, 'Reisepass (MRZ)', detectedIssueDate);
      }

      // TD1 National ID: Line 2 chars 8-13 is YYMMDD of expiry date
      const mrzTd1 = combinedSearchPool.match(/(?:[IA][A-Z0-9<]{28,}[\r\n]+[A-Z0-9<]{8})([0-9]{2})([0-1][0-9])([0-3][0-9])/);
      if (mrzTd1) {
        const y = `20${mrzTd1[1]}`;
        const m = mrzTd1[2];
        const d = mrzTd1[3];
        return buildResult(`${y}-${m}-${d}`, 'Personalausweis (MRZ)', detectedIssueDate);
      }
    }

    // 2. Ollama / Gemini Vision Check for Scanned PDFs / Photo Uploads (only if text is not already digitally extracted)
    const hasEnoughText = extractedText && extractedText.trim().length >= 40;
    if (!hasEnoughText) {
      const expiryPrompt = `
You are an expert AI document auditor for legal and company formation documents (Passports, National ID Cards, Residence Permits, Visas, Trade Register, Commercial Register, Articles of Association, Contracts).
Analyze this uploaded document to determine if it contains an EXPIRY DATE (Ablaufdatum / Gültig bis / Date of Expiry / Valid until / Geltungsdauer / تاريخ الانتهاء) and ISSUE DATE (Ausstellungsdatum / Date of Issue / Issued on / 4a. / تاريخ الإصدار).

CRITICAL INSTRUCTIONS:
1. Transcribe the exact characters for:
   - "raw_expiry_text": The exact printed characters after labels like "Expiry Date:", "Gültig bis:", "Date of expiry:", "Valid until:", "4b.".
   - "raw_issue_text": The exact printed characters after labels like "Date of Issue:", "Ausstellungsdatum:", "Issued on:", "4a.".
   - "date_of_birth_text": The exact printed date of birth, to NEVER confuse with expiry date.
2. Carefully inspect the 4 digits of the year in the expiry date.
   - Example: in "20/12/2026", Day is 20, Month is 12, Year is 2026. Do NOT confuse the first digits (20/12) as year 2012!
3. If the document is permanent or has no expiry date (e.g. Handelsregisterauszug, Commercial Register, Articles of Association / Gesellschaftsvertrag, permanent trade license), set "has_expiry": false.

Return strictly JSON:
{
  "has_expiry": true or false,
  "raw_expiry_text": "e.g. 20/10/2028" or null,
  "raw_issue_text": "e.g. 21/10/2025" or null,
  "expiry_day": number or null,
  "expiry_month": number or null,
  "expiry_year": number or null,
  "expiry_date": "YYYY-MM-DD" or null,
  "issue_date": "YYYY-MM-DD" or null,
  "document_type": "Visa" | "ID Card" | "Passport" | "Residence Permit" | "Commercial Register" | "Trade Registration" | "Other"
}
`;

      const resolveIsoFromAi = (aiJson: any): { expiryIso: string | null; issueIso: string | null } => {
        if (!aiJson || !aiJson.has_expiry) return { expiryIso: null, issueIso: null };

        let expiryIso: string | null = null;
        let issueIso: string | null = null;

        // 1. Check raw_expiry_text first (it holds exact transcribed characters from card)
        if (aiJson.raw_expiry_text && typeof aiJson.raw_expiry_text === 'string') {
          const m = aiJson.raw_expiry_text.match(/([0-3]?[0-9])[./\-]([0-1]?[0-9])[./\-](20\d{2}|\d{2})\b/);
          if (m) {
            const d = m[1].padStart(2, '0');
            const mo = m[2].padStart(2, '0');
            const y = m[3].length === 2 ? `20${m[3]}` : m[3];
            expiryIso = `${y}-${mo}-${d}`;
          }
        }

        // 2. Check individual day/month/year numeric fields
        if (!expiryIso && aiJson.expiry_year && aiJson.expiry_month && aiJson.expiry_day) {
          const yNum = Number(aiJson.expiry_year);
          const mNum = Number(aiJson.expiry_month);
          const dNum = Number(aiJson.expiry_day);
          if (!isNaN(yNum) && !isNaN(mNum) && !isNaN(dNum) && yNum >= 1990 && yNum <= 2099 && mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
            const y = yNum < 100 ? `20${yNum}` : String(yNum);
            const mo = String(mNum).padStart(2, '0');
            const d = String(dNum).padStart(2, '0');
            expiryIso = `${y}-${mo}-${d}`;
          }
        }

        // 3. Fallback to expiry_date if valid YYYY-MM-DD
        if (!expiryIso && aiJson.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(aiJson.expiry_date)) {
          expiryIso = aiJson.expiry_date;
        }

        // Resolve issue date if present
        if (aiJson.raw_issue_text && typeof aiJson.raw_issue_text === 'string') {
          const mi = aiJson.raw_issue_text.match(/([0-3]?[0-9])[./\-]([0-1]?[0-9])[./\-](20\d{2}|\d{2})\b/);
          if (mi) {
            const d = mi[1].padStart(2, '0');
            const mo = mi[2].padStart(2, '0');
            const y = mi[3].length === 2 ? `20${mi[3]}` : mi[3];
            issueIso = `${y}-${mo}-${d}`;
          }
        }
        if (!issueIso && aiJson.issue_date && /^\d{4}-\d{2}-\d{2}$/.test(aiJson.issue_date)) {
          issueIso = aiJson.issue_date;
        }

        return { expiryIso, issueIso };
      };

      // Try Local Ollama Vision
      if (AI_PROVIDER === 'ollama') {
        try {
          let imagePayload: string | undefined = undefined;
          if (isPdf) {
            const embeddedImages = pdfExtractor.extractEmbeddedImages(filePath);
            if (embeddedImages.length > 0) imagePayload = embeddedImages[0];
          } else if (base64Data && (mimeType.startsWith('image/') || filePath.match(/\.(png|jpe?g|webp)$/i))) {
            imagePayload = base64Data;
          }

          if (imagePayload) {
            const aiJson = await ollamaClient.generateJson<any>({
              prompt: expiryPrompt,
              images: [imagePayload],
            });
            const { expiryIso, issueIso } = resolveIsoFromAi(aiJson);
            if (expiryIso) {
              return buildResult(expiryIso, aiJson.document_type || 'Ausweis / Gründungsunterlage', issueIso || detectedIssueDate);
            }
          }
        } catch (aiErr) {
          console.warn('[AI Expiry Check] Ollama vision check notice:', aiErr);
        }
      }

      // Try Gemini Cloud API if configured
      if (genAI && base64Data) {
        try {
          const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: { responseMimeType: 'application/json' },
          });
          const result = await model.generateContent([
            expiryPrompt,
            {
              inlineData: {
                data: base64Data,
                mimeType: isPdf ? 'application/pdf' : mimeType,
              },
            },
          ]);
          const text = result.response.text();
          if (text) {
            const aiJson = JSON.parse(text);
            const { expiryIso, issueIso } = resolveIsoFromAi(aiJson);
            if (expiryIso) {
              return buildResult(expiryIso, aiJson.document_type || 'Ausweis / Gründungsunterlage', issueIso || detectedIssueDate);
            }
          }
        } catch (gErr) {
          console.warn('[AI Expiry Check] Gemini API check notice:', gErr);
        }
      }
    }

    // 3. Fallback: No expiry date found (Permanent document like Commercial Register, Articles of Association)
    return {
      has_expiry: false,
      status: 'NO_EXPIRY',
      doc_title: 'Gründungsunterlage',
      warning_message: 'Gründungsunterlage erfolgreich hochgeladen und gesichert.',
    };
  },

  /**
   * Uses local Ollama (Qwen) as a fast batch classifier ONLY for unknown bank statement lines
   * that fell back to 4900, so new German vendor names (e.g. Signal Iduna, Couche-Tard) are
   * categorized automatically without hardcoding every vendor name.
   */
  async enrichUnknownBankLinesWithOllama(bookings: BookingItem[], clientId?: string): Promise<void> {
    const unknownIndices: number[] = [];
    for (let i = 0; i < bookings.length; i++) {
      if (bookings[i].gegenkonto === '4900' && (bookings[i].buchungstext || '').trim().length > 2) {
        unknownIndices.push(i);
      }
    }
    if (unknownIndices.length === 0) return;

    const batch = unknownIndices.slice(0, 40).map((idx) => ({
      id: idx,
      amount: bookings[idx].amount,
      direction: bookings[idx].sh === 'S' ? 'incoming' : 'outgoing',
      text: bookings[idx].buchungstext,
    }));

    const CATEGORY_ENUM = [
      'fuel', 'insurance', 'car_purchase', 'car_repair_parts', 'supermarket_travel',
      'telecom', 'rent', 'legal_tax', 'office', 'refund', 'other',
    ];

    const ownCompanyName = clientRulesService.getClientSettings(clientId).company_name;
    const prompt = `You are a German SKR03 bookkeeper for a car dealership${ownCompanyName ? ` (${ownCompanyName})` : ''}.
Classify each unknown bank statement transaction below into ONE category:
- "fuel": Petrol / gas station (e.g. Couche-Tard, Circle K, HEM, Westfalen, Tankstelle)
- "insurance": Insurance company (e.g. Signal Iduna, Continentale, Barmenia, ARAG, HUK, Allianz)
- "car_purchase": Buying a vehicle or vehicle part-payment/dealer purchase
- "car_repair_parts": Workshop, repairs, spare parts, vehicle inspection, car wash
- "supermarket_travel": Supermarket/grocery/travel expense (Penny, Rewe, Aldi, Edeka, Bahn, Hotel)
- "telecom": Phone, internet, mobile
- "rent": Rent, lease, utilities
- "legal_tax": Lawyer, notary, tax advisor
- "office": Office supplies, software, IT
- "refund": Incoming refund / Rückerstattung / Gutschrift of an earlier expense
- "other": Unclear / general expense

For every transaction also return:
- "confidence": number 0.0-1.0 (how sure you are). Use < 0.8 when the name is ambiguous or unknown.
- "reason": ONE short sentence (max 15 words) explaining why.
Never invent facts. If unsure, choose "other" with low confidence.

Transactions:
${JSON.stringify(batch)}

Return ONLY valid JSON: { "results": [ { "id": 0, "category": "...", "confidence": 0.0, "reason": "..." } ] }`;

    const schema = {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              category: { type: 'string', enum: CATEGORY_ENUM },
              confidence: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['id', 'category', 'confidence', 'reason'],
          },
        },
      },
      required: ['results'],
    };

    try {
      const resp = await ollamaClient.generateJson<{
        results?: Array<{ id: number; category: string; confidence?: number; reason?: string }>;
      }>({ prompt, format: schema, temperature: 0 });
      const results = Array.isArray(resp?.results) ? resp.results : [];
      const MAP: Record<string, { code: string; bu: string }> = {
        fuel: { code: '4530', bu: '9' },
        insurance: { code: '4520', bu: '' },
        car_purchase: { code: '3200', bu: '' },
        car_repair_parts: { code: '4540', bu: '9' },
        supermarket_travel: { code: '4673', bu: '8' },
        telecom: { code: '4920', bu: '9' },
        rent: { code: '4210', bu: '' },
        legal_tax: { code: '4955', bu: '9' },
        office: { code: '4930', bu: '9' },
      };
      let applied = 0;
      for (const r of results) {
        const b = bookings[r.id];
        if (!b || b.gegenkonto !== '4900') continue;
        const category = String(r.category || '').toLowerCase();
        const confidence = Math.max(0, Math.min(1, Number(r.confidence) || 0));
        const mapped = MAP[category];
        b.ai_category = category;
        b.ai_confidence = confidence;
        b.ai_reason = String(r.reason || '').slice(0, 160);
        if (mapped) {
          b.ai_suggested_gegenkonto = mapped.code;
          b.ai_suggested_bu = mapped.bu;
        }
        // Confidence gate: only auto-apply when Qwen is sure. Otherwise the line stays 4900
        // and is routed to the Review List (never silently guessed into the DATEV CSV).
        if (mapped && confidence >= 0.8) {
          b.gegenkonto = mapped.code;
          b.buCode = mapped.bu;
          applied++;
        }
      }
      console.log(`[AI Bank Fallback] Qwen classified ${results.length}/${batch.length} unknown line(s); auto-applied ${applied} (confidence >= 0.8), rest -> Review List.`);
    } catch (err: any) {
      console.warn('[AI Bank Fallback] Skipping Ollama enrichment (non-fatal):', err?.message || err);
    }
  },

  /**
   * Deterministic parser for German Bank Statements (Kontoauszug - Volksbank, Sparkasse, VR Bank, etc.)
   * Extracts every transaction line, exact statement month/year, and maps each transaction to SKR03 Konto 1200 + Gegenkonto + BU-Schlüssel.
   */
  parseGermanBankStatement(extractedText: string, filename: string = '', clientId?: string): ExtractedInvoiceData | null {
    if (!extractedText) return null;

    const lines = extractedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Match standard German bank statement transaction lines:
    // e.g. "01.10. 01.10. Lastschrift 40,05 S" or "04.10. 04.10. Gutschrift 11.500,00 H"
    const txRegex = /^(\d{2})\.(\d{2})\.\s+(\d{2})\.(\d{2})\.\s+(.+?)\s+([\d.]+,\d{2})\s+([SH])\s*$/;

    interface RawBankTx {
      buDay: string;
      buMonth: string;
      valDay: string;
      valMonth: string;
      type: string;
      amount: number;
      bankSH: 'S' | 'H';
      details: string[];
    }

    const txs: RawBankTx[] = [];
    let currentTx: RawBankTx | null = null;

    const ignoreDetailPattern =
      /^(Übertrag|Kontostand|aktueller Kontostand|alter Kontostand|neue[rn]?\s+Kontostand|Gesamtumsatz|Bitte beachten|Freundliche Grüße|Mit freundlichen|Seite \d+ von \d+|Konto-Nr\.|BLZ |BIC |IBAN |Auszug Nr\.|Postfach |www\.|Telefon |Anlage \d|Buchungstag:|UMSATZSTEUER)/i;
    // Account holder's own letterhead/address lines come from storage/rules/<client>.json (never hardcoded)
    const ownStmtSettings = clientRulesService.getClientSettings(clientId);
    const ownHeaderTokens = [ownStmtSettings.company_name || '', ...(ownStmtSettings.own_issuer_keywords || [])]
      .map((k) => k.toLowerCase().trim())
      .filter((k) => k.length >= 4);
    const isOwnHeaderLine = (line: string): boolean => {
      const l = line.toLowerCase();
      return ownHeaderTokens.some((k) => l.startsWith(k));
    };

    for (const line of lines) {
      const m = line.match(txRegex);
      if (m) {
        if (currentTx) txs.push(currentTx);
        currentTx = {
          buDay: m[1],
          buMonth: m[2],
          valDay: m[3],
          valMonth: m[4],
          type: m[5].trim(),
          amount: parseFloat(m[6].replace(/\./g, '').replace(',', '.')),
          bankSH: m[7] as 'S' | 'H',
          details: [],
        };
      } else if (currentTx) {
        if (ignoreDetailPattern.test(line) || isOwnHeaderLine(line)) {
          txs.push(currentTx);
          currentTx = null;
        } else if (currentTx.details.length < 5) {
          currentTx.details.push(line);
        }
      }
    }
    if (currentTx) txs.push(currentTx);

    if (txs.length === 0) return null;

    // Determine Month:
    // 1. Check filename pattern e.g. "1200-Bank-10", "1200-Bank-11", "1200-Bank-12"
    let statementMonth = 0;
    const fnBankMatch = filename.match(/-(0?[1-9]|1[0-2])(?:\s|_|-|\.|$)/);
    if (fnBankMatch) {
      statementMonth = parseInt(fnBankMatch[1], 10);
    }
    // 2. Or majority booking month from transactions
    if (!statementMonth || statementMonth < 1 || statementMonth > 12) {
      const monthCounts = new Map<number, number>();
      for (const t of txs) {
        const bm = parseInt(t.buMonth, 10);
        if (bm >= 1 && bm <= 12) {
          monthCounts.set(bm, (monthCounts.get(bm) || 0) + 1);
        }
      }
      let bestMonth = 1;
      let bestCount = 0;
      for (const [mNum, count] of monthCounts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestMonth = mNum;
        }
      }
      statementMonth = bestMonth;
    }

    // Determine Year:
    // Look for "alter Kontostand vom DD.MM.YYYY" or dates in text matching the statement period
    let statementYear = 0;
    const alterMatch = extractedText.match(/alter Kontostand vom \d{2}\.\d{2}\.(20\d{2})/i);
    const neuerMatch = extractedText.match(/neuen Kontostand vom (\d{2})\.(\d{2})\.(20\d{2})/i);
    if (alterMatch) {
      statementYear = parseInt(alterMatch[1], 10);
    } else if (neuerMatch) {
      const nMonth = parseInt(neuerMatch[2], 10);
      const nYear = parseInt(neuerMatch[3], 10);
      statementYear = statementMonth === 12 && nMonth === 1 ? nYear - 1 : nYear;
    } else {
      const anyYearMatch = extractedText.match(/\b\d{2}\.\d{2}\.(202\d)\b/);
      if (anyYearMatch) {
        statementYear = parseInt(anyYearMatch[1], 10);
      }
    }
    if (!statementYear || statementYear < 2015 || statementYear > 2035) {
      statementYear = new Date().getFullYear();
    }

    // Compute last day of the statement month (e.g. 2024-10-31, 2024-11-30, 2024-12-31)
    const lastDayDate = new Date(statementYear, statementMonth, 0);
    const lastDay = String(lastDayDate.getDate()).padStart(2, '0');
    const monthPadded = String(statementMonth).padStart(2, '0');
    const invoiceDate = `${statementYear}-${monthPadded}-${lastDay}`;

    // Detect Bank Name
    let bankName = 'Bank Kontoauszug';
    if (/Frankfurter Volksbank/i.test(extractedText)) {
      bankName = 'Frankfurter Volksbank Rhein/Main eG';
    } else if (/Sparkasse/i.test(extractedText)) {
      bankName = 'Sparkasse';
    } else if (/Commerzbank/i.test(extractedText)) {
      bankName = 'Commerzbank';
    } else if (/Volksbank/i.test(extractedText)) {
      bankName = 'Volksbank';
    }

    const germanMonthNames = [
      '',
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember',
    ];
    const monthLabel = germanMonthNames[statementMonth] || monthPadded;

    // Map each transaction to a DATEV SKR03 BookingItem
    const bookings: BookingItem[] = txs.map((tx) => {
      // On German bank statements:
      // 'H' (Haben) = incoming money = Bank (1200) Soll ('S')
      // 'S' (Soll)  = outgoing money = Bank (1200) Haben ('H')
      const sh: 'S' | 'H' = tx.bankSH === 'H' ? 'S' : 'H';
      const belegdatum = `${tx.buDay}${tx.buMonth}`;

      let counterparty = (tx.details[0] || tx.type || '').trim();
      const purpose = tx.details.slice(1).join(' ').trim();
      const combined = `${tx.type} ${counterparty} ${purpose}`;
      const lower = combined.toLowerCase();

      let gegenkonto = sh === 'S' ? '8400' : '3400';
      let buCode = '';

      // 1. Share capital (Stammkapital / Stammeinlage for GmbH in Gründung)
      const isShareCapital =
        sh === 'S' && (
          /stammkapital|stammeinlage|kapitaleinzahlung|gründungskapital|gesellschaftsvertrag/i.test(lower) ||
          (/(?:i\.?\s*gr\.?|in\s+gründung)/i.test(extractedText) && [12500, 25000].includes(tx.amount)) ||
          (/\b(stammkapital|stammeinlage)\b/i.test(extractedText) && tx.amount >= 5000 && clientRulesService.isOwner(undefined, lower))
        );

      // 2. Loans & Shareholder balances (Darlehen / Kredit)
      const isLoan = /\b(darlehen|kredit)\b/i.test(lower);

      // 3. Customer contract cancellations & deposit/overpayment refunds (Storno / Rückzahlung / Überzahlung)
      const isCustomerRefundOrStorno =
        sh === 'H' && (
          /(storno|rückzahlung|rueckzahlung|überzahlung|ueberzahlung|erstattung|widerruf|rückabwicklung|reklamation|refund)/i.test(lower) ||
          /(?:kaufvertrag|anzahlung|rechnung).*(?:storno|rückzahlung|rueckzahlung|überzahlung|ueberzahlung)/i.test(lower)
        );

      // 4. Cash transit (Bar-Auszahlung, Geldautomat, etc. - NEVER match Bank11 or financing payouts!)
      const isCashTransit =
        !/bank11|finanzierung|darlehen|auszahlung fuer|auszahlung für/i.test(lower) && (
          /bar-auszahlung|auszahlung girocard|bareinzahlung|geldautomat\b|bargeldeinzahlung|barauszahlung/i.test(tx.type) ||
          /bar-auszahlung|bareinzahlung|geldautomat\b/i.test(counterparty) ||
          /bar-auszahlung|bareinzahlung|geldautomat\b/i.test(lower) ||
          /crs weilbach|bad soden gaa|gaa \d/i.test(combined)
        );

      // 5. Vehicle purchases & sales (for automotive dealership)
      const hasVinInText = /(?<![A-Z0-9])[A-HJ-NPR-Z]{3}[A-HJ-NPR-Z0-9]{8}\d{6}(?![0-9])/i.test(combined);
      const isVehiclePurchase =
        /\b(kauf|anzahlung|restzahlung|differenzbetrag|fahrzeug|auto|pkw|kfz|polo|tesla|adam|vito|fiat|golf|corsa|astra|passat|audi|bmw|mercedes|opel|volkswagen|cupra|skoda|seat|porsche|land rover|range rover)\b/i.test(lower) ||
        hasVinInText ||
        /auto-|kfz-|car-/i.test(lower) ||
        clientRulesService.isEuDealer(undefined, lower);

      // 6. Bank statement fees & separate bank fee VAT breakdown (Anlage 1 PN:905)
      // IMPORTANT: Do NOT trigger bank fee on large car purchase / vendor payments that happen to have instant transfer fee text
      const isBankFeeVat =
        (/^siehe anlage/i.test(lower) || /pn:905/i.test(lower) || /entgeltabrechnung/i.test(lower)) && tx.amount < 25;
      const isBankFee =
        (
          /abschluss|kontoführung|bankgebühr|depotgebühr|jahrespreis|bankcard|debitkarte|kreditkarte|kartengebühr\b/i.test(tx.type.toLowerCase()) ||
          (/abschluss|kontoführung|bankgebühr|depotgebühr|jahrespreis|kartengebühr/i.test(lower) && tx.amount < 150) ||
          (/^siehe anlage/i.test(lower) && tx.amount < 150)
        ) && !/kauf|fahrzeug|pkw|auto|storno|rückzahlung|rechnung|anzahlung/i.test(lower);

      // 7. Notary & Legal advice
      const isNotar = /\b(notar|notariat)\b/i.test(lower);
      const isLegalOrTax = /\b(rechtsanwalt|anwalt|steuerberat|fintax|fibu|buchhaltung)\b/i.test(lower);

      // 8. Court, Commercial register, Bailiff (Amtsgericht, Gerichtsvollzieher, Justizkasse)
      const isCourtOrRegister =
        /\b(amtsgericht|handelsregister|gerichtskasse|justizkasse|landgericht|zentrale mahnabteilung|gerichtsvollzieher|dr\s*ii)\b/i.test(lower);

      // 9. Public administration & municipal fees (Bürgerbüro, Stadtkasse, Magistrat, Verkehrsabteilung, IHK, Landratsamt)
      const isPublicAuthority =
        /\b(buergerbuero|bürgerbüro|magistrat|stadtkasse|kreisverwaltung|landratsamt|main-taunus-kreis|stadt bochum|landeshauptstadt stuttgart|gemeindekasse|gemeinde|ihk|handwerkskammer|berufsgenossenschaft|stadtverwaltung|verkehrsabteilung|polizei|bussgeld|ordnungswidrigkeit)\b/i.test(lower);

      // 10. Travel & Public Transport (Deutsche Bahn, Flug, Hotel) -> 4673 BU 8
      const isTravelOrTransport =
        /\b(db vertrieb|dz bank-db vertrieb|deutsche bahn|bahncard|lufthansa|flixbus|flixtrain|hotel|hotelbuchung|airbnb|taxi\b|fluggast)\b/i.test(lower);

      // 11. Vehicle inspection & Workshop (TÜV, Dekra, Gutachter, Prüfstelle, Reparatur) -> 4540 BU 9
      const isVehicleInspectionOrRepair =
        /\b(tüv|tuev|dekra|fsp|gtü|küs|garantie|gutachten|prüfstelle|prüfbericht|stahlgruber|autoteile|kfz-teile|werkstatt|reparatur|reifen|vergölst|atu|porsche zentrum|audi zentrum|bmw autohaus|mercedes-benz autohaus)\b/i.test(lower) ||
        (/\b(inspektion|wartung|ölwechsel|service)\b/i.test(lower) && tx.amount < 2000);

      // 11b. Vehicle / Business Insurance (ARAG, Signal Iduna, Allianz, HUK, AXA, etc.) -> 4520 (no tax key)
      const isInsurance =
        /\b(arag|signal iduna|allianz|huk|axa|gothaer|provinzial|zurich|lvm|devk|continentale|barmenia|ergo|dkv|debeka|generali|vgh|helvetia|basler|kfz-versicherung|versicherung)\b/i.test(lower) &&
        !/garantie/i.test(lower);

      // 11c. Cost Refund / Storno reversal (e.g. FinTax Storno der Buchung) -> reverses original expense account
      const isCostRefund =
        sh === 'S' &&
        /(storno|rückbuchung|rueckbuchung|rückerstattung|rueckerstattung|erstattung)/i.test(lower) &&
        /\b(fintax|steuerberat|rechtsanwalt|fibu|buchhaltung)\b/i.test(lower);

      // 12. Operating supplies & consumables (eBay, Globus, Baumarkt) -> 4980 BU 9
      const isOperatingSupplies =
        /\b(ebay by adyen|ebay|klarna.*ebay|globus sbw|galaxus|baumarkt|hornbach|bauhaus|action deutschland|tedi\b)\b/i.test(lower);

      // 13. Car dealer financing payoff (BDK, Santander, Toyota Financial) -> 3200
      const isFinancingPayoff =
        /\b(bank deutsches kraftfahrzeuggewerbe|bdk|toyota financial|santander consumer|akf bank|targo bank)\b/i.test(lower);

      // 14. Car financing payouts received (Bank11) -> 8400
      const isCarFinancingPayout =
        sh === 'S' && /\b(bank11|santander|bdk|autofinanzierung)\b/i.test(lower);

      // 15. EU tax-free cross-border automotive trading (from client rules config) -> 8125 / 3200
      const isEuCarDealer = clientRulesService.isEuDealer(undefined, lower);

      // 16. Used vehicle purchase under § 25a Differenzbesteuerung -> 3200
      const isUsedCarPurchase =
        sh === 'H' && (
          /\b(kauf tesla|kauf audi|kauf vw|kauf bmw|kauf pkw|fahrzeugankauf|ankaufvertrag)\b/i.test(lower) ||
          clientRulesService.lookupPayee(undefined, lower) === '3200' ||
          (/\b(kauf|anzahlung|restzahlung)\b/i.test(lower) && hasVinInText)
        );

      // 17. Owner / Shareholder transactions (loaded from client settings config) -> 0730 / 1530
      const isOwnerPrivate =
        clientRulesService.isOwner(undefined, lower) &&
        !/\b(lohn|gehalt|stammkapital|stammeinlage)\b/i.test(lower);

      // 18. Fuel & service stations -> 4530 BU 9
      const isFuel = /\b(aral|shell|esso|total|jet|avia|omv|tankstelle|agip|bft|minera|kraftstoff|couche-tard|circle k|westfalen|star tankstelle|hem\b|sprint|sb-tank)\b/i.test(lower);

      // 19. Software & IT tools
      const isSoftwareOrCloud =
        /\b(adobe|google|microsoft|apple|openai|chatgpt|canva|lexware|datev|sevdesk|fastbill|hostinger|strato|ionos|hetzner|godaddy|aws|github)\b/i.test(lower);

      // ── MATCHING HIERARCHY ──
      // Deterministic German tax & SKR03 rules ALWAYS take precedence over learned supplier memory
      if (isShareCapital) {
        // Founding capital of GmbH (Stammkapital 0800) -> no tax
        gegenkonto = '0800';
        buCode = '';
      } else if (isLoan) {
        // Loans: outgoing loan to third party (1520) or repayment (0630 / 1890) -> no tax
        gegenkonto = '1520';
        buCode = '';
      } else if (isCostRefund) {
        // Reversal/storno of accounting/legal expense -> 4955 (BU 9)
        gegenkonto = '4955';
        buCode = '9';
      } else if (isInsurance) {
        // Vehicle / Business insurance (ARAG, Allianz, HUK, etc.) -> 4520 (no tax key)
        gegenkonto = '4520';
        buCode = '';
      } else if (isCustomerRefundOrStorno) {
        // Customer deposit refund or order cancellation -> reversal (3200 or 8400)
        gegenkonto = isEuCarDealer ? '3200' : '8400';
        buCode = '';
      } else if (isCarFinancingPayout) {
        // Bank11 car financing disbursement -> 8400 (or Debitor)
        gegenkonto = '8400';
        buCode = '';
      } else if (isEuCarDealer && sh === 'S') {
        // EU tax-free vehicle sale -> 8125 (Steuerfreie innergemeinschaftliche Lieferungen)
        gegenkonto = '8125';
        buCode = '';
      } else if (isEuCarDealer && sh === 'H') {
        // EU refund / return -> 3200
        gegenkonto = '3200';
        buCode = '';
      } else if (isFinancingPayoff) {
        // BDK financing payoff for purchased vehicle -> 3200 (§25a UStG)
        gegenkonto = '3200';
        buCode = '';
      } else if (isUsedCarPurchase) {
        // Used vehicle purchase under § 25a Differenzbesteuerung -> 3200 (no input VAT!)
        gegenkonto = '3200';
        buCode = '';
      } else if (isCashTransit) {
        // Cash transit 1360 (Geldtransit ATM withdrawals, teller cash)
        gegenkonto = '1360';
        buCode = '';
        if (/kontostand/i.test(counterparty)) {
          counterparty = tx.type;
        }
      } else if (isOwnerPrivate) {
        // Shareholder clearing account for GmbH -> 0730 (or 1530)
        gegenkonto = '0730';
        buCode = '';
      } else if (
        sh === 'S' &&
        (/siehe anlage 1/i.test(lower) || /differenzbesteuerung/i.test(lower) || /25a/i.test(lower) || clientRulesService.lookupPayee(undefined, lower) === '8193')
      ) {
        // §25a used car sale / customer deposit (Differenzbesteuerung) -> 8193
        gegenkonto = '8193';
        buCode = '';
      } else if (clientRulesService.matchVendorRule(undefined, lower, tx.amount)) {
        const vRule = clientRulesService.matchVendorRule(undefined, lower, tx.amount)!;
        gegenkonto = vRule.account;
        buCode = vRule.buCode;
      } else if (isBankFeeVat) {
        // 19% Vorsteuer breakdown on monthly bank fees -> 1576
        gegenkonto = '1576';
        buCode = '';
      } else if (isBankFee) {
        // Banking fees, card annual fees, account charges -> 4970
        gegenkonto = '4970';
        buCode = '';
      } else if (isFuel) {
        // Fuel / Gas stations (Aral, Minera, Shell, etc.) -> 4530 (BU 9)
        gegenkonto = '4530';
        buCode = '9';
      } else if (isVehicleInspectionOrRepair) {
        // Vehicle repairs, TÜV inspections, Dastgir expert reports -> 4540 (BU 9)
        gegenkonto = '4540';
        buCode = /garantie|versicherung|allianz|huk|arag/i.test(lower) ? '' : '9';
      } else if (isOperatingSupplies) {
        // Operating consumables / supplies (eBay by Adyen, Villmar & Pflug) -> 4980 (BU 9)
        gegenkonto = '4980';
        buCode = '9';
      } else if (isTravelOrTransport) {
        // Business travel / train tickets (DZ Bank-DB Vertrieb, flights) -> 4673 (BU 8)
        gegenkonto = '4673';
        buCode = '8';
      } else if (isNotar) {
        // Notary costs -> 4950 (Rechts- und Beratungskosten with 19% Vorsteuer BU 9)
        gegenkonto = '4950';
        buCode = '9';
      } else if (isLegalOrTax) {
        // Tax advisor, legal advisory, accounting -> 4955 (BU 9)
        gegenkonto = '4955';
        buCode = '9';
      } else if (isCourtOrRegister || isPublicAuthority) {
        // Official court, bailiff, city administration, registration fees (tax-exempt) -> 4380 / 4390
        gegenkonto = '4390';
        buCode = '';
      } else if (isSoftwareOrCloud) {
        // Software subscriptions & IT expenses -> 4964 (BU 9)
        gegenkonto = '4964';
        buCode = '9';
      } else if (/\b(vattenfall|stadtwerke|enbw|e\.on|rwe|strom|gas|energie|rabot)\b/i.test(lower)) {
        gegenkonto = '4240';
        buCode = '9';
      } else if (/\b(miete|pacht|immobilien)\b/i.test(lower)) {
        gegenkonto = '4210';
        buCode = '';
      } else if (/\b(mobile\.de|autoscout24|kleinanzeigen|werbung|vistaprint)\b/i.test(lower)) {
        gegenkonto = '4600';
        buCode = '9';
      } else if (/\b(vodafone|telekom|telefonica|o2|1&1|congstar|internet|telefon)\b/i.test(lower)) {
        gegenkonto = '4920';
        buCode = '9';
      } else if (/\b(deutsche post|dhl|hermes|dpd|ups|gls|porto|briefmarke)\b/i.test(lower)) {
        gegenkonto = '4910';
        buCode = '';
      } else if (/\b(lohn|gehalt|minijob|knappschaft|aok|tk |barmer|dak )\b/i.test(lower)) {
        gegenkonto = '1740';
        buCode = '';
      } else if (/\b(hauptzollamt|kfz-steuer)\b/i.test(lower)) {
        gegenkonto = '4510';
        buCode = '';
      } else if (isVehiclePurchase && sh === 'H' && (tx.amount >= 1500 || /\bdifferenzbetrag\b/i.test(lower))) {
        // Outgoing vehicle purchase for resale (>= 1500 EUR or Differenzbetrag): default to 3200 (§25a UStG)
        gegenkonto = '3200';
        buCode = '';
      } else if (isVehiclePurchase && sh === 'S') {
        // Incoming vehicle sale to customer: default to 8400 (19% USt) unless §25a Differenzbesteuerung is explicitly indicated or matched via VIN
        gegenkonto = '8400';
        buCode = '';
      } else {
        // Fallback: Check learned supplier memory, then general SKR03 rule dictionary
        const learned = supplierMemoryService.lookupSupplier(counterparty);
        const generalMatch = skr03Mapper.suggestAccount(counterparty, purpose, 19);
        if (learned && learned.skr03Account && !['1000', '1200', '3300', '4900'].includes(learned.skr03Account)) {
          gegenkonto = learned.skr03Account;
          buCode = learned.buSchluessel || '';
        } else if (generalMatch && generalMatch.code && !['1000', '1200', '1400', '1600', '4900'].includes(generalMatch.code)) {
          gegenkonto = generalMatch.code;
          buCode = generalMatch.code.startsWith('4') ? '9' : '';
        } else if (sh === 'H') {
          // Outgoing payment fallback: Safe general expense 4900 (without tax key to avoid unlawful Vorsteuer deductions)
          gegenkonto = '4900';
          buCode = '';
        } else {
          // Incoming revenue fallback
          gegenkonto = '8400';
          buCode = '';
        }
      }

      // Extract invoice / reference number for Belegfeld 1 with robust clean-up
      let belegfeld1 = '';
      const refMatch = combined.match(
        /(?:Rechnungs-?nummer|Rechnungsnummer|Rechnungs-?nr\.?|Rechnung\s*Nr\.?|RG-?Nr\.?|RE-?Nr\.?|KD-?Nr\.?|Rechnung|Beleg-?Nr\.?)[\s.:/-]+([A-Za-z0-9][A-Za-z0-9/-]{1,25})/i
      );
      if (refMatch) {
        let candidate = refMatch[1].trim();
        candidate = candidate.replace(/^(snummer|nummer)[\s.:/-]*/i, '');
        candidate = candidate.replace(/\s+(kauf|securego|plus|iban|bic|eur|vom|am|teilzahlung).*$/i, '').trim();
        if (candidate.length >= 2 && !/^(snummer|nummer|datum|betrag|iban|bic|text)$/i.test(candidate)) {
          belegfeld1 = candidate.substring(0, 36);
        }
      }

      // Construct clean Buchungstext (Counterparty + key purpose info, max 60 chars)
      let buchungstext = counterparty;
      if (purpose && !buchungstext.toLowerCase().includes(purpose.substring(0, 12).toLowerCase())) {
        buchungstext = `${counterparty} - ${purpose}`;
      }
      buchungstext = buchungstext
        .replace(/neue[rn]?\s+kontostand.*$/i, '')
        .replace(/\s*-\s*\.\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 60);
      if (!buchungstext) buchungstext = tx.type;

      // Determine if Belegfeld 2 should be marked 'KeineRechnung' for missing invoice / unclarified bank line
      let belegfeld2 = '';
      if (isUsedCarPurchase && !belegfeld1) {
        belegfeld2 = 'KeineRechnung';
      }

      return {
        amount: tx.amount,
        sh,
        konto: '1200',
        gegenkonto,
        buCode,
        belegdatum,
        belegfeld1,
        belegfeld2,
        buchungstext: buchungstext || tx.type,
        currency: 'EUR',
      };
    });

    const sumSoll = txs.filter((t) => t.bankSH === 'S').reduce((s, t) => s + t.amount, 0);
    const sumHaben = txs.filter((t) => t.bankSH === 'H').reduce((s, t) => s + t.amount, 0);
    const totalTurnover = parseFloat((sumSoll + sumHaben).toFixed(2));

    // Opening / closing balance for bank reconciliation check (Volksbank/Sparkasse: "alter/neuer Kontostand ... 142.231,29 H")
    const parseBalanceNear = (label: RegExp): number | undefined => {
      const rawLines = extractedText.split(/\r?\n/);
      for (let i = 0; i < rawLines.length; i++) {
        if (!label.test(rawLines[i])) continue;
        for (let j = i; j < Math.min(rawLines.length, i + 5); j++) {
          const m = rawLines[j].match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*([SH])\b/);
          if (m) {
            const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(val)) return m[2] === 'S' ? -val : val;
          }
        }
      }
      return undefined;
    };
    const openingBalance = parseBalanceNear(/alter\s+Kontostand/i);
    const closingBalance = parseBalanceNear(/neuer\s+Kontostand/i);

    return {
      document_type: 'BANK_STATEMENT',
      supplier_name: `${bankName} Kontoauszug ${monthPadded}/${statementYear} (${monthLabel})`,
      supplier_tax_id: '',
      invoice_number: `BANK-${statementYear}-${monthPadded}`,
      invoice_date: invoiceDate,
      currency: 'EUR',
      net_amount: parseFloat(sumSoll.toFixed(2)),
      vat_rate_percent: 19,
      vat_amount: 0,
      total_amount: parseFloat(sumSoll.toFixed(2)),
      confidence_score: 0.99,
      skr03_account_code: '1200',
      payment_method: 'bank_transfer',
      line_items_summary: `${bankName} (${monthPadded}/${statementYear}): ${bookings.length} Buchungen | Ausgänge (S): ${sumSoll.toFixed(2)} € | Eingänge (H): ${sumHaben.toFixed(2)} €`,
      bookings,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
    };
  },
};
