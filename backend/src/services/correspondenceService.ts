import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool } from './pgClient.js';
import { ollamaClient } from './ollamaClient.js';
import { pdfExtractor } from './pdfExtractor.js';
import dotenv from 'dotenv';

dotenv.config();

const ALLOW_CLOUD_AI = String(process.env.ALLOW_CLOUD_AI || 'false').toLowerCase() === 'true';
const apiKey = ALLOW_CLOUD_AI ? (process.env.GEMINI_API_KEY || '') : '';
const genAI = ALLOW_CLOUD_AI && apiKey ? new GoogleGenerativeAI(apiKey) : null;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'ollama').toLowerCase();

export interface CorrespondenceRecord {
  id: string;
  document_id: string;
  letter_type: string;
  sender: string;
  tax_number?: string;
  letter_date?: string;
  deadline?: string; // YYYY-MM-DD
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  ai_summary: string;
  action_proposed: string;
  task_id?: string;
  original_filename?: string;
}

export const correspondenceService = {
  // 1. Process Tax Office / Authority Letter with AI (Ollama Local First -> Gemini Fallback)
  async processLetter(filePath: string, mimeType: string, documentId: string): Promise<CorrespondenceRecord> {
    const isPdf = pdfExtractor.isPdf(filePath, mimeType);
    let extractedText = '';
    if (isPdf) {
      extractedText = await pdfExtractor.extractText(filePath);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const prompt = `
You are an expert German tax law assistant and official correspondence (Behördenpost / Finanzamt) auditor.
Analyze this official letter (Finanzamt, Krankenkasse, IHK, or Deutsche Rentenversicherung) and extract key legal deadlines.

Return ONLY a strictly valid JSON object with no markdown wrapping, no backticks, matching this exact schema:
{
  "sender": "Finanzamt München / Techniker Krankenkasse / etc.",
  "tax_number": "Steuernummer or Aktenzeichen if present",
  "letter_type": "Official categorization (e.g. Mahnung Umsatzsteuer, Prüfungsanordnung, Beitragsnachweis)",
  "letter_date": "YYYY-MM-DD",
  "deadline": "YYYY-MM-DD (Explicit legal deadline or reply due date, or empty string)",
  "urgency": "HIGH if penalty/enforcement/short deadline mentioned, otherwise MEDIUM or LOW",
  "ai_summary": "Concise summary in German or English of what the authority requests",
  "action_proposed": "Concrete actionable next step for the tax accountant or client"
}

Important Rules:
1. Accurately detect if there is a Frist (deadline date) such as "bis zum DD.MM.YYYY".
2. If deadline is mentioned, return it in strict YYYY-MM-DD format.
3. Classify urgency accurately.
`;

    let raw: any = null;

    // 1. Try Local Ollama on RTX A3000
    if (AI_PROVIDER === 'ollama') {
      try {
        console.log('[Tax Letter] Processing official tax letter with local Ollama on RTX GPU...');
        if (isPdf) {
          const textPrompt = `
${prompt}

Here is the extracted text from the official tax letter PDF:
---
${extractedText.substring(0, 4000)}
---
`;
          raw = await ollamaClient.generateJson<any>({
            prompt: textPrompt,
          });
        } else {
          raw = await ollamaClient.generateJson<any>({
            prompt,
            images: [base64Data],
          });
        }
        console.log('[Tax Letter] Successfully extracted tax letter details via local Ollama!');
      } catch (err: any) {
        console.warn('[Tax Letter] Local Ollama failed, attempting Gemini fallback:', err.message);
      }
    }

    // 2. Fallback to Cloud Gemini if needed
    if (!raw && genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType || 'application/pdf',
            },
          },
        ]);

        const responseText = result.response.text().trim();
        const cleanJson = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        raw = JSON.parse(cleanJson);
      } catch (err: any) {
        console.warn('[Tax Letter] Gemini fallback failed:', err.message);
      }
    }

    if (!raw) {
      // Safe fallback when fully offline
      raw = {
        sender: 'Finanzamt / Behörde',
        letter_type: 'Behördenschreiben',
        urgency: 'MEDIUM',
        ai_summary: 'Offizielles Schreiben zur manuellen Prüfung eingegangen.',
        action_proposed: 'Fristen und Rechtsbehelfsbelehrung durch Sachbearbeiter prüfen.',
      };
    }

    const letterId = `cor_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const record: CorrespondenceRecord = {
      id: letterId,
      document_id: documentId,
      sender: raw.sender || 'Finanzamt',
      tax_number: raw.tax_number || '',
      letter_type: raw.letter_type || 'Behördenschreiben',
      letter_date: raw.letter_date || new Date().toISOString().split('T')[0],
      deadline: raw.deadline && raw.deadline.length >= 8 ? raw.deadline : undefined,
      urgency: raw.urgency === 'HIGH' ? 'HIGH' : raw.urgency === 'LOW' ? 'LOW' : 'MEDIUM',
      ai_summary: raw.ai_summary || 'Schreiben zur Kenntnisnahme und Prüfung.',
      action_proposed: raw.action_proposed || 'Unterlagen prüfen und fristgerecht einreichen.',
    };

    await this.saveToPostgres(record);
    return record;
  },

  // Save to PostgreSQL table `correspondence`
  async saveToPostgres(record: CorrespondenceRecord) {
    try {
      await pool.query(
        `INSERT INTO correspondence (id, document_id, letter_type, sender, deadline, ai_summary)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (document_id) DO UPDATE SET
           letter_type = EXCLUDED.letter_type,
           sender = EXCLUDED.sender,
           deadline = EXCLUDED.deadline,
           ai_summary = EXCLUDED.ai_summary`,
        [
          record.id,
          record.document_id,
          record.letter_type,
          record.sender,
          record.deadline ? new Date(record.deadline) : null,
          record.ai_summary,
        ]
      );
    } catch (err: any) {
      console.error('[PostgreSQL] Failed to save correspondence:', err);
    }
  },

  // Get all correspondence letters with joined document metadata
  async getAll(): Promise<CorrespondenceRecord[]> {
    try {
      const res = await pool.query(`
        SELECT 
          c.id, c.document_id, c.letter_type, c.sender, c.deadline, c.ai_summary,
          d.original_filename, t.id as task_id
        FROM correspondence c
        LEFT JOIN documents d ON d.id = c.document_id
        LEFT JOIN tasks t ON t.description LIKE '%' || c.id || '%'
        ORDER BY c.deadline ASC NULLS LAST
      `);

      return res.rows.map((row: any) => ({
        id: row.id,
        document_id: row.document_id,
        letter_type: row.letter_type || 'Behördenschreiben',
        sender: row.sender || 'Finanzamt',
        deadline: row.deadline ? new Date(row.deadline).toISOString().split('T')[0] : undefined,
        urgency: 'HIGH',
        ai_summary: row.ai_summary || '',
        action_proposed: 'Fristgerechte Beantwortung oder Einreichung fehlender Nachweise.',
        task_id: row.task_id,
        original_filename: row.original_filename,
      }));
    } catch {
      return [];
    }
  },

  // 1-Click Convert Letter to Assigned Client Task
  async convertToTask(correspondenceId: string, clientId = 'user_client_1', staffId = 'user_staff_1') {
    const cRes = await pool.query('SELECT * FROM correspondence WHERE id = $1', [correspondenceId]);
    if (cRes.rows.length === 0) {
      throw new Error('Correspondence letter not found');
    }

    const letter = cRes.rows[0];
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const taskTitle = `[Frist] ${letter.sender}: ${letter.letter_type}`;
    const taskDescription = `${letter.ai_summary} (Ref: ${correspondenceId})`;

    await pool.query(
      `INSERT INTO tasks (id, client_id, created_by, title, description, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [
        taskId,
        clientId,
        staffId,
        taskTitle,
        taskDescription,
        letter.deadline || new Date(Date.now() + 14 * 86400000),
      ]
    );

    // Also record an audit log event
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        staffId,
        'TASK_CREATED_FROM_LETTER',
        'CORRESPONDENCE',
        correspondenceId,
        JSON.stringify({ taskId, title: taskTitle }),
      ]
    );

    return { taskId, title: taskTitle };
  },

  // Seed sample demo Finanzamt letter for instant testing (PDF Page 10)
  async seedDemoLetter() {
    const docId = `doc_fa_letter_demo`;

    await pool.query(
      `INSERT INTO documents (id, client_id, original_filename, stored_path, mime_type, size, folder, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        docId,
        'user_client_1',
        'Finanzamt_Muenchen_USt_Anforderung.pdf',
        'storage/vault/Finanzamt_Muenchen_USt_Anforderung.pdf',
        'application/pdf',
        84200,
        'Finanzamt Letters',
        'NEEDS_REVIEW',
      ]
    );

    const letterId = `cor_demo_fa_2026`;
    const deadlineDate = new Date(Date.now() + 18 * 86400000);

    await pool.query(
      `INSERT INTO correspondence (id, document_id, letter_type, sender, deadline, ai_summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (document_id) DO UPDATE SET
         deadline = EXCLUDED.deadline,
         ai_summary = EXCLUDED.ai_summary`,
      [
        letterId,
        docId,
        'Umsatzsteuer-Sondervorauszahlung & Voranmeldung Frist',
        'Finanzamt München (Abt. Körperschaften)',
        deadlineDate,
        'Aufforderung zur Abgabe der fehlenden Umsatzsteuervoranmeldung für das III. Quartal 2026 sowie Nachweis über innergemeinschaftliche Lieferungen. Bei Nichtabgabe droht Verspätungszuschlag gemäß § 152 AO.',
      ]
    );

    return { id: letterId, docId };
  },
};
