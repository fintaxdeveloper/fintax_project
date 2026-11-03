import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedInvoiceData } from '../types/document.js';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_VISION_MODEL || 'moondream';
const AI_PROVIDER = (process.env.AI_PROVIDER || 'ollama').toLowerCase();

export const aiService = {
  async processInvoice(filePath: string, mimeType: string): Promise<ExtractedInvoiceData> {
    const fileBytes = fs.readFileSync(filePath);
    const base64Data = fileBytes.toString('base64');

    const prompt = `
You are an expert German accounting AI assistant specializing in German tax regulations (GoBD, UStG) and SKR03 chart of accounts.
Carefully analyze this invoice or receipt image/document.

Extract the following details in strict JSON format:
{
  "document_type": "PURCHASE_INVOICE",
  "supplier_name": "Full legal name of the vendor/supplier",
  "supplier_tax_id": "USt-IdNr or Steuernummer if found, or empty string",
  "invoice_number": "Invoice or receipt reference number",
  "invoice_date": "YYYY-MM-DD",
  "currency": "EUR",
  "net_amount": 100.00,
  "vat_rate_percent": 19,
  "vat_amount": 19.00,
  "total_amount": 119.00,
  "confidence_score": 0.95,
  "skr03_account_code": "4930"
}

Rules:
1. Ensure amounts are pure numbers with dot decimal (e.g. 1190.00, not 1.190,00).
2. If total is present but net is not, compute net = total / (1 + vat_rate/100).
3. Normalize date into YYYY-MM-DD format.
4. Output valid JSON only with NO markdown wrapper.
`;

    // 1. Try Local Ollama first if configured or running
    if (AI_PROVIDER === 'ollama') {
      try {
        console.log(`[Local AI] Processing with Ollama (${OLLAMA_MODEL}) on local RTX GPU...`);
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            prompt: prompt,
            images: [base64Data],
            format: 'json',
            stream: false,
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          const cleanJson = (data.response || '').replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          const parsed = JSON.parse(cleanJson);
          console.log('[Local AI] Successfully processed invoice with Ollama!');
          return this.sanitizeOutput(parsed);
        } else {
          console.warn(`[Local AI] Ollama responded with status ${res.status}. Falling back to cloud Gemini...`);
        }
      } catch (ollamaErr: any) {
        console.warn(`[Local AI] Ollama not reachable (${ollamaErr?.message}). Falling back to Gemini...`);
      }
    }

    // 2. Fallback to Cloud Gemini if Ollama is not running
    if (genAI) {
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
                mimeType: mimeType === 'application/pdf' ? 'application/pdf' : mimeType,
              },
            },
          ]);

          const responseText = result.response.text();
          if (responseText) {
            const parsed = JSON.parse(responseText);
            return this.sanitizeOutput(parsed);
          }
        } catch (err: any) {
          console.warn(`Model ${modelName} failed, trying fallback:`, err?.message);
        }
      }
    }

    throw new Error('Neither Local Ollama nor Cloud Gemini could process the document.');
  },

  sanitizeOutput(parsed: any): ExtractedInvoiceData {
    return {
      document_type: parsed.document_type || 'PURCHASE_INVOICE',
      supplier_name: parsed.supplier_name || 'Unbekannter Lieferant',
      supplier_tax_id: parsed.supplier_tax_id || '',
      invoice_number: parsed.invoice_number || 'N/A',
      invoice_date: parsed.invoice_date || new Date().toISOString().split('T')[0],
      currency: parsed.currency || 'EUR',
      net_amount: Number(parsed.net_amount) || 0,
      vat_rate_percent: Number(parsed.vat_rate_percent) || 19,
      vat_amount: Number(parsed.vat_amount) || 0,
      total_amount: Number(parsed.total_amount) || 0,
      confidence_score: Number(parsed.confidence_score) || 0.9,
      skr03_account_code: parsed.skr03_account_code || '4930',
    };
  },
};
