import fs from 'fs';
import path from 'path';
import { ollamaClient } from './ollamaClient.js';
import { pdfExtractor } from './pdfExtractor.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

export type DetectedDocumentCategory =
  | 'PURCHASE_INVOICE'
  | 'SALES_INVOICE'
  | 'RECEIPT'
  | 'BANK_STATEMENT'
  | 'TAX_LETTER'
  | 'PAYROLL'
  | 'OTHER';

export interface DocumentClassificationResult {
  category: DetectedDocumentCategory;
  confidence: number;
  reasoning: string;
  detected_language: string;
}

const ALLOW_CLOUD_AI = String(process.env.ALLOW_CLOUD_AI || 'false').toLowerCase() === 'true';
const apiKey = ALLOW_CLOUD_AI ? (process.env.GEMINI_API_KEY || '') : '';
const genAI = ALLOW_CLOUD_AI && apiKey ? new GoogleGenerativeAI(apiKey) : null;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'ollama').toLowerCase();

export const documentClassifier = {
  async classify(filePath: string, mimeType: string): Promise<DocumentClassificationResult> {
    const filename = path.basename(filePath).toLowerCase();

    // 0. Fast-track high-confidence filename heuristics
    if (
      filename.includes('total') ||
      filename.includes('bon') ||
      filename.includes('kasse') ||
      filename.includes('quittung') ||
      filename.includes('barbeleg') ||
      filename.includes('bankbeleg')
    ) {
      return {
        category: 'RECEIPT',
        confidence: 0.98,
        reasoning: 'Filename matches cash receipt / Belege bundle',
        detected_language: 'de',
      };
    }

    if (
      filename.includes('kontoauszug') ||
      filename.includes('bank_statement') ||
      filename.includes('bank statement')
    ) {
      return {
        category: 'BANK_STATEMENT',
        confidence: 0.98,
        reasoning: 'Filename indicates official bank statement',
        detected_language: 'de',
      };
    }

    const isPdf = pdfExtractor.isPdf(filePath, mimeType);
    let extractedText = '';

    if (isPdf) {
      extractedText = await pdfExtractor.extractText(filePath);
    }

    const basePrompt = `
You are an intelligent document classification AI for a German tax & accounting firm (FinTax).
Examine this document and classify it strictly into ONE of the following categories:
- PURCHASE_INVOICE: Formal supplier/vendor bills, Eingangsrechnungen with invoice header, Net/VAT breakdown, and payment terms.
- SALES_INVOICE: Outgoing customer bills issued by the client company (Ausgangsrechnung).
- RECEIPT: Any cash register slip (Kassenbon), fuel/store receipt, taxi bill, hospitality receipt (Bewirtungsbeleg), or HANDWRITTEN expense notes/calculations (e.g. lists of expenses like food, tea, travel, rent with a handwritten total).
- BANK_STATEMENT: OFFICIAL printed/digital bank statements (Kontoauszug from Sparkasse, Deutsche Bank, etc.) containing official bank headers, IBAN, Kontonummer, starting balance, debits/credits, and closing balance. NOTE: A handwritten note or slip that merely mentions the word "bank" or an informal transfer is NOT a bank statement; classify it as RECEIPT!
- TAX_LETTER: Official government correspondence from Finanzamt, Krankenkasse, IHK, or Rentenversicherung with legal deadlines (Fristen).
- PAYROLL: Monthly payslips (Lohn-/Gehaltsabrechnung), social security notifications, or employee work hour timesheets.
- OTHER: General contracts, business plans, software overviews, or general documentation.

Classification Guidelines:
1. If the document is handwritten with items and expenses, it is ALWAYS a "RECEIPT".
2. Only classify as "BANK_STATEMENT" if you clearly see an official bank statement with IBAN or account balance tables.
3. For general documents or PDFs explaining projects/features, classify as "OTHER".

Return ONLY a strictly valid JSON object matching this schema with no extra text or markdown:
{
  "category": "PURCHASE_INVOICE | SALES_INVOICE | RECEIPT | BANK_STATEMENT | TAX_LETTER | PAYROLL | OTHER",
  "confidence": 0.95,
  "reasoning": "Clear justification of category",
  "detected_language": "de"
}
`;

    // 1. If text is extracted from PDF, use text-based Ollama generation
    if (extractedText && extractedText.length > 50) {
      const textPrompt = `
${basePrompt}

Here is the extracted text from the document:
---
${extractedText.substring(0, 3000)}
---
`;
      if (AI_PROVIDER === 'ollama') {
        try {
          console.log('[Classifier] Classifying PDF text via local Ollama...');
          const parsed = await ollamaClient.generateJson<DocumentClassificationResult>({
            prompt: textPrompt,
          });
          if (parsed && parsed.category) {
            return {
              category: parsed.category,
              confidence: Number(parsed.confidence) || 0.95,
              reasoning: parsed.reasoning || 'Classified via extracted PDF text',
              detected_language: parsed.detected_language || 'de',
            };
          }
        } catch (err: any) {
          console.warn('[Classifier] Ollama text classification fallback:', err.message);
        }
      }
    }

    // 2. Image-based fallback (for JPG/PNG)
    if (!isPdf) {
      const fileBytes = fs.readFileSync(filePath);
      const base64Data = fileBytes.toString('base64');

      if (AI_PROVIDER === 'ollama') {
        try {
          console.log('[Classifier] Running vision classification with Ollama on RTX A3000...');
          const parsed = await ollamaClient.generateJson<DocumentClassificationResult>({
            prompt: basePrompt,
            images: [base64Data],
          });

          if (parsed && parsed.category) {
            return {
              category: parsed.category,
              confidence: Number(parsed.confidence) || 0.85,
              reasoning: parsed.reasoning || 'Classified via local Ollama Vision',
              detected_language: parsed.detected_language || 'de',
            };
          }
        } catch (err: any) {
          console.warn('[Classifier] Ollama vision classification fallback:', err.message);
        }
      }
    }

    // Keyword heuristics fallback if LLM is busy
    if (extractedText) {
      const lower = extractedText.toLowerCase();
      if (lower.includes('kontoauszug') || lower.includes('iban') || lower.includes('kontostand')) {
        return { category: 'BANK_STATEMENT', confidence: 0.99, reasoning: 'Heuristic keyword match: Kontoauszug', detected_language: 'de' };
      }
      if (lower.includes('finanzamt') || lower.includes('steuer-nr') || lower.includes('frist')) {
        return { category: 'TAX_LETTER', confidence: 0.95, reasoning: 'Heuristic keyword match: Finanzamt', detected_language: 'de' };
      }
      if (lower.includes('rechnung') || lower.includes('invoice') || lower.includes('ust-idnr')) {
        return { category: 'PURCHASE_INVOICE', confidence: 0.9, reasoning: 'Heuristic keyword match: Rechnung', detected_language: 'de' };
      }
    }

    return {
      category: 'PURCHASE_INVOICE',
      confidence: 0.6,
      reasoning: 'Default fallback category',
      detected_language: 'de',
    };
  },
};
