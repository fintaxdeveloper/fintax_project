import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

import { dbService } from './services/dbService.js';
import { aiService } from './services/aiService.js';
import { documentClassifier } from './services/documentClassifier.js';
import { validationService } from './services/validationService.js';
import { exportService } from './services/exportService.js';
import { googleDriveService } from './services/googleDriveService.js';
import { testDbConnection, pool } from './services/pgClient.js';
import { authService, requireAuth, requireRole, AuthenticatedRequest } from './services/authService.js';
import { bankStatementService } from './services/bankStatementService.js';
import { correspondenceService } from './services/correspondenceService.js';
import { payrollService } from './services/payrollService.js';
import { adminService } from './services/adminService.js';
import { clientFolderService } from './services/clientFolderService.js';
import { deletionApprovalService } from './services/deletionApprovalService.js';
import { backupService } from './services/backupService.js';
import { maskingService } from './services/maskingService.js';
import { monthlyDocumentRegistry } from './services/monthlyDocumentRegistry.js';
import { reviewService, ReviewReport, ReviewAction } from './services/reviewService.js';
import { aiCacheService } from './services/aiCacheService.js';
import { skr03Mapper } from './services/skr03Mapper.js';
import { belegIndexService, extractVinFromText } from './services/belegIndexService.js';
import { clientRulesService } from './services/clientRulesService.js';
import { DocumentRecord, ExtractedInvoiceData, BookingItem } from './types/document.js';

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy blocked origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

// Global JWT Protection: every /api route requires authentication except login/OTP/health
const PUBLIC_API_PATHS = new Set(['/health', '/auth/login', '/auth/verify-otp', '/auth/resend-otp']);
app.use('/api', (req: AuthenticatedRequest, res, next) => {
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  return requireAuth(req, res, next);
});

// Admin RBAC Guard: all /api/admin/* endpoints require ADMIN role
app.use('/api/admin', requireRole('ADMIN'));

// Client-isolation helper: CLIENT role may only read/modify its own client_id data
const canAccessClient = (req: AuthenticatedRequest, targetClientId?: string | null): boolean => {
  if (!req.user) return false;
  if (req.user.role === 'ADMIN' || req.user.role === 'STAFF') return true;
  if (!targetClientId) return false;
  return targetClientId === req.user.id;
};

// Ensure storage directories exist
const vaultDir = path.resolve(process.cwd(), '../storage/vault');
const tempDir = path.resolve(process.cwd(), '../storage/temp');
const exportDir = path.resolve(process.cwd(), '../storage/exports');

[vaultDir, tempDir, exportDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer for secure uploads
const storageConfig = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, vaultDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueId = `doc_${uuidv4()}${ext}`;
    cb(null, uniqueId);
  },
});

const upload = multer({
  storage: storageConfig,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
});

// 1. Health Check
app.get('/api/health', async (_req, res) => {
  const dbOk = await testDbConnection();
  res.json({
    status: 'online',
    version: '1.0.0',
    service: 'FinTax AI Processing API',
    database: {
      type: 'PostgreSQL 17',
      status: dbOk ? 'CONNECTED' : 'DISCONNECTED',
      name: 'fintax_db',
    },
    timestamp: new Date().toISOString(),
  });
});

// --- AUTHENTICATION ENDPOINTS (PDF Page 1 & 11) ---
// POST /api/auth/login (Supports Email or Client Number, Triggers 2FA for Staff/Admin)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, identifier, password } = req.body;
    const loginId = identifier || email;

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Benutzername / Mandantennummer und Passwort erforderlich.' });
    }

    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const result = await authService.login(loginId, password, ip);
    if (!result) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten oder Konto deaktiviert.' });
    }

    // If 2FA OTP is required for Staff / Admin
    if (result.requires2FA) {
      return res.json({
        requires2FA: true,
        tempToken: result.tempToken,
        user: result.user,
        maskedEmail: result.maskedEmail,
        demoOtp: result.demoOtp,
        message: result.message,
      });
    }

    // Direct login for Client
    return res.json({
      requires2FA: false,
      message: result.message,
      token: result.token,
      user: result.user,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Serverfehler bei der Anmeldung.' });
  }
});

// POST /api/auth/verify-otp (Verifies 6-digit email code for Staff/Admin)
app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) {
      return res.status(400).json({ error: 'Sitzungstoken und Einmalcode erforderlich.' });
    }

    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const result = authService.verifyOtp(tempToken, otp, ip);
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    return res.json({
      message: '2FA-Bestätigung erfolgreich. Willkommen bei FinTax!',
      token: result.token,
      user: result.user,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Serverfehler bei der OTP-Verifizierung.' });
  }
});

// POST /api/auth/resend-otp
app.post('/api/auth/resend-otp', (req, res) => {
  const { tempToken } = req.body;
  if (!tempToken) {
    return res.status(400).json({ error: 'Sitzungstoken erforderlich.' });
  }

  const result = authService.resendOtp(tempToken);
  return res.json(result);
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// GET /api/auth/profile - Check first-login status and privacy acceptance
app.get('/api/auth/profile', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: 'userId required.' });
    }
    const profile = await adminService.getUserProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      client_number: profile.client_number,
      first_login_done: profile.first_login_done || false,
      privacy_accepted: !!profile.privacy_accepted_at,
      privacy_accepted_at: profile.privacy_accepted_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password - First-login password change (PDF requirement)
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'userId, currentPassword, and newPassword required.' });
    }
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const result = await adminService.changePassword(userId, currentPassword, newPassword, ip);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ message: 'Passwort erfolgreich geändert (Password changed successfully).', success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/accept-privacy - GDPR privacy notice acceptance
app.post('/api/auth/accept-privacy', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required.' });
    }
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const result = await adminService.acceptPrivacy(userId, ip);
    res.json({ message: 'Datenschutzhinweis akzeptiert (Privacy notice accepted).', success: result.success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- BANK STATEMENT TRACKING & RECONCILIATION ENDPOINTS (PDF Page 8) ---
// GET /api/bank-statements - List all statements
app.get('/api/bank-statements', async (_req, res) => {
  try {
    const list = await bankStatementService.getAllStatements();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bank-statements/:id - Get statement details and reconciled transactions
app.get('/api/bank-statements/:id', async (req, res) => {
  try {
    const statement = await bankStatementService.getStatementById(req.params.id);
    if (!statement) {
      return res.status(404).json({ error: 'Kontoauszug nicht gefunden (Statement not found).' });
    }
    res.json(statement);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bank-statements/upload - Upload and process bank statement
app.post('/api/bank-statements/upload', upload.single('statement'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei ausgewählt.' });
    }

    const { originalname, filename, path: filePath, mimetype, size } = req.file;
    const authReq = req as AuthenticatedRequest;
    const requestedClientId = (req.body.client_id || '').trim();
    if (authReq.user?.role === 'CLIENT' && requestedClientId && requestedClientId !== authReq.user.id) {
      return res.status(403).json({ error: 'Zugriff verweigert: fremde Mandanten-ID.' });
    }
    const clientId = authReq.user?.role === 'CLIENT' ? authReq.user.id : (requestedClientId || 'user_qa24_704');
    const docId = uuidv4();

    // Create document record
    const newDoc: DocumentRecord = {
      id: docId,
      client_id: clientId,
      original_filename: originalname,
      stored_filename: filename,
      file_path: filePath,
      mime_type: mimetype,
      size_bytes: size,
      uploaded_at: new Date().toISOString(),
      status: 'PROCESSING',
    };
    dbService.create(newDoc);

    const parsedStatement = await bankStatementService.processBankStatement(filePath, mimetype, docId);

    dbService.update(docId, {
      status: parsedStatement.is_reconciled ? 'APPROVED' : 'NEEDS_ATTENTION',
      staff_notes: parsedStatement.reconciliation_error || 'Running balance verified successfully',
    });

    res.status(201).json({
      message: 'Kontoauszug erfolgreich verarbeitet und abgeglichen.',
      statement: parsedStatement,
    });
  } catch (err: any) {
    console.error('Bank statement processing error:', err);
    res.status(500).json({ error: err.message || 'Fehler beim Verarbeiten des Kontoauszugs.' });
  }
});

// POST /api/bank-statements/sample-demo - Create PDF Page 8 sample for instant testing
app.post('/api/bank-statements/sample-demo', async (_req, res) => {
  try {
    const docId = `doc_bank_${uuidv4()}`;
    const sampleDoc: DocumentRecord = {
      id: docId,
      original_filename: 'Kontoauszug_DeutscheBank_Oktober2026.pdf',
      stored_filename: `${docId}.pdf`,
      file_path: path.resolve(vaultDir, `${docId}.pdf`),
      mime_type: 'application/pdf',
      size_bytes: 142800,
      uploaded_at: new Date().toISOString(),
      status: 'APPROVED',
    };
    dbService.create(sampleDoc);

    const statementId = `stmt_db_demo_2026_10`;
    await pool.query(
      `INSERT INTO bank_statements (id, document_id, account_number, statement_period, opening_balance, closing_balance)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (document_id) DO UPDATE SET
         account_number = EXCLUDED.account_number,
         opening_balance = EXCLUDED.opening_balance,
         closing_balance = EXCLUDED.closing_balance`,
      [statementId, docId, 'DE89 3704 0044 0532 0130 00', 'October 2026', 5000.00, 5381.00]
    );

    // Insert 3 exact rows from PDF Page 8
    const txRows = [
      { id: `tx_1_${docId}`, date: '01.10.2026', desc: 'Opening balance / Eröffnungssaldo', debit: null, credit: null, bal: 5000.00 },
      { id: `tx_2_${docId}`, date: '02.10.2026', desc: 'Office supplies GmbH (Bürobedarf)', debit: 119.00, credit: null, bal: 4881.00 },
      { id: `tx_3_${docId}`, date: '04.10.2026', desc: 'Customer payment / Kundenzahlung Rechnung RE-904', debit: null, credit: 500.00, bal: 5381.00 },
    ];

    for (const t of txRows) {
      await pool.query(
        `INSERT INTO bank_transactions (id, statement_id, date, description, debit, credit, running_balance)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [t.id, statementId, t.date, t.desc, t.debit, t.credit, t.bal]
      );
    }

    res.json({ message: 'Sample Deutsche Bank statement initialized successfully.', id: statementId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Upload and Process Document (With Client Folder Tree & Duplicate Detection)
app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei ausgewählt (No file uploaded).' });
    }

    const { originalname, filename, path: tempFilePath, mimetype, size } = req.file;
    const authReq = req as AuthenticatedRequest;
    const requestedClientId = (req.body.client_id || '').trim();
    if (authReq.user?.role === 'CLIENT' && requestedClientId && requestedClientId !== authReq.user.id) {
      return res.status(403).json({ error: 'Zugriff verweigert: fremde Mandanten-ID.' });
    }
    const clientId = authReq.user?.role === 'CLIENT' ? authReq.user.id : (requestedClientId || 'user_qa24_704');
    const category = (req.body.category || '01_FiBu') as any;
    const notes = req.body.notes || '';
    let subTypes: string[] = [];
    if (req.body.sub_types) {
      try {
        subTypes = typeof req.body.sub_types === 'string' ? JSON.parse(req.body.sub_types) : req.body.sub_types;
      } catch {
        subTypes = [String(req.body.sub_types)];
      }
    }

    // 1. Compute SHA-256 Checksum
    const checksum = validationService.calculateChecksum(tempFilePath);

    // Resolve Client Name & Number from DB for Shared with me > _INBOX > 01_Clients folder mapping
    let clientName = clientId;
    try {
      const uRes = await pool.query('SELECT name, client_number FROM users WHERE id = $1 LIMIT 1', [clientId]).catch(() => null);
      if (uRes && uRes.rows.length > 0 && uRes.rows[0].name) {
        clientName = clientFolderService.registerClientName(clientId, uRes.rows[0].name, uRes.rows[0].client_number);
      }
    } catch {
      // fallback to clientId
    }

    // 2. Automatically store in Client Folder Tree: Shared with me/_INBOX/01_Clients/<clientName>/...
    const { storedPath, relativePath } = clientFolderService.storeDocumentFile(
      clientId,
      category,
      tempFilePath,
      originalname
    );

    // Create initial record
    const docId = uuidv4();
    const newDoc: DocumentRecord = {
      id: docId,
      client_id: clientId,
      category,
      sub_types: subTypes,
      original_filename: originalname,
      stored_filename: filename,
      file_path: storedPath,
      relative_path: relativePath,
      file_checksum: checksum,
      mime_type: mimetype,
      size_bytes: size,
      uploaded_at: new Date().toISOString(),
      status: 'PROCESSING',
      staff_notes: notes || undefined,
    };

    dbService.create(newDoc);

    // 2.1 Formation Documents / Master Data ('00_Stammdaten') with AI Expiry Check
    if (category === '00_Stammdaten') {
      try {
        googleDriveService.syncDocument(storedPath, originalname, category, clientName, req.body.document_date, subTypes);
      } catch (gErr) {
        console.warn('[Upload] Google Drive sync error:', gErr);
      }

      console.log(`[Formation AI] Scanning uploaded document "${originalname}" for validity & expiry dates...`);
      let expiryInfo: any = { has_expiry: false };
      try {
        expiryInfo = await aiService.checkDocumentExpiry(storedPath, mimetype, originalname);
      } catch (aiExpErr) {
        console.warn('[Formation AI] Expiry check warning:', aiExpErr);
      }

      const typeDesc = subTypes.length > 0 ? ` (${subTypes.join(', ')})` : '';
      let staffNote = notes || `Gründungsunterlage${typeDesc} gespeichert`;
      if (expiryInfo?.has_expiry) {
        staffNote = `${staffNote} • ${expiryInfo.warning_message}`;
      }

      const docStatus = expiryInfo?.is_expired ? 'NEEDS_ATTENTION' : 'APPROVED';

      const updated = dbService.update(docId, {
        status: docStatus,
        staff_notes: staffNote,
        expiry_date: expiryInfo?.expiry_date,
        expiry_info: expiryInfo,
        extracted_data: {
          document_type: 'OTHER',
          supplier_name: expiryInfo?.doc_title || 'Gründungsunterlage',
          invoice_number: '',
          invoice_date: expiryInfo?.expiry_date || new Date().toISOString().split('T')[0],
          currency: 'EUR',
          net_amount: 0,
          vat_rate_percent: 0,
          vat_amount: 0,
          total_amount: 0,
          confidence_score: 0.99,
        },
      });

      const responseMessage = expiryInfo?.has_expiry
        ? expiryInfo.warning_message
        : 'Gründungsunterlage erfolgreich hochgeladen und in der Datenbank gespeichert.';

      return res.status(201).json({
        message: responseMessage,
        document: updated,
        expiry_info: expiryInfo,
        relative_folder: relativePath,
      });
    }

    // 2.2 Fast-track for Payroll Documents ('02_LoBu')
    if (category === '02_LoBu') {
      try {
        googleDriveService.syncDocument(storedPath, originalname, category, clientName, req.body.document_date, subTypes);
      } catch (gErr) {
        console.warn('[Upload] Google Drive sync error:', gErr);
      }
    }

    // 3. Run 6-Step AI Classification, OCR, Ollama Extraction & SKR03 CSV Routing
    try {
      console.log(`\n=============================================================`);
      console.log(`[Step 1/6 - Upload] PDF/Image received: ${originalname} (${mimetype}, ${size} bytes)`);

      // Step 2: Document Type Detect
      const classification = await documentClassifier.classify(storedPath, mimetype);
      console.log(`[Step 2/6 - Document Type Detect] Classified as: ${classification.category} (Confidence: ${classification.confidence})`);

      // If document is explicitly uploaded as Correspondence (or non-FiBu classified as Tax Letter), route to correspondenceService
      if (category === '00_Schriftverkehr' || (category !== '01_FiBu' && classification.category === 'TAX_LETTER')) {
        try {
          googleDriveService.syncDocument(storedPath, originalname, '00_Schriftverkehr', clientName, req.body.document_date, subTypes);
        } catch (gErr) {
          console.warn('[Upload] Google Drive correspondence sync error:', gErr);
        }
        const letterRecord = await correspondenceService.processLetter(storedPath, mimetype, docId);
        const updated = dbService.update(docId, {
          status: 'NEEDS_ATTENTION',
          staff_notes: `Behördenschreiben erkannt (${letterRecord.sender}): ${letterRecord.letter_type}. Frist: ${letterRecord.deadline || 'Keine'}`,
        });

        return res.status(201).json({
          message: 'Behördenschreiben erfolgreich klassifiziert und verarbeitet.',
          document: updated,
          classification,
          correspondence: letterRecord,
          relative_folder: relativePath,
        });
      }

      // Step 3: OCR & Step 4: Fast Deterministic + Ollama Data Extraction
      console.log(`[Step 3/6 - OCR] Reading text & layout from ${originalname}...`);
      console.log(`[Step 4/6 - Ollama Extraction] Extracting invoice date, supplier, amounts & line items...`);
      // ⚡ Same file uploaded before? Reuse the stored AI result instantly (skips all GPU vision scans)
      const cachedAi = aiCacheService.get(checksum);
      if (cachedAi) {
        console.log(`[AI Cache] ⚡ Cache HIT for "${originalname}" — reusing previous AI extraction (no GPU scan needed).`);
      }

      let extracted: ExtractedInvoiceData;
      let bankStmtResult: any = null;

      if (cachedAi) {
        extracted = cachedAi.extracted;
      } else if (classification.category === 'BANK_STATEMENT') {
        console.log(`[Fast-Track] Direct bank statement processing for "${originalname}" via bankStatementService...`);
        try {
          bankStmtResult = await bankStatementService.processBankStatement(storedPath, mimetype, docId);
        } catch (bsErr) {
          console.warn('[Upload] Bank statement processing error:', bsErr);
        }

        const stmtYear = bankStmtResult?.period_year || 2024;
        const stmtMonth = String(bankStmtResult?.period_month || 1).padStart(2, '0');
        const txBookings = ((bankStmtResult?.transactions || []) as any[])
          .map((tx: any) => {
            const amt = Number(tx.credit || tx.debit || 0);
            if (amt <= 0) return null;
            const isCredit = Number(tx.credit || 0) > 0;
            const desc = String(tx.description || bankStmtResult?.bank_name || 'Bankbuchung').trim();
            const suggested = skr03Mapper.suggestAccount(bankStmtResult?.bank_name || 'Bank', desc, 19);
            const txDateParts = String(tx.date || `${stmtYear}-${stmtMonth}-28`).split('-');
            const bd = txDateParts.length === 3 ? `${txDateParts[2]}${txDateParts[1]}` : `28${stmtMonth}`;
            return {
              amount: amt,
              sh: isCredit ? ('S' as const) : ('H' as const),
              konto: '1200',
              gegenkonto: isCredit ? '8400' : (suggested.code || '4900'),
              buCode: '',
              belegdatum: bd,
              belegfeld1: `BANK-${stmtYear}-${stmtMonth}`,
              buchungstext: desc.slice(0, 60),
              currency: bankStmtResult?.currency || 'EUR',
            };
          })
          .filter(Boolean) as BookingItem[];

        const totalSum = txBookings.reduce((s: number, b: any) => s + b.amount, 0);
        extracted = {
          document_type: 'BANK_STATEMENT',
          supplier_name: `${bankStmtResult?.bank_name || 'Bank'} Kontoauszug (${bankStmtResult?.statement_period || `${stmtMonth}/${stmtYear}`})`,
          supplier_tax_id: '',
          invoice_number: bankStmtResult?.account_number || '',
          invoice_date: `${stmtYear}-${stmtMonth}-28`,
          currency: 'EUR',
          net_amount: parseFloat((totalSum / 1.19).toFixed(2)),
          vat_rate_percent: 19,
          vat_amount: parseFloat((totalSum - totalSum / 1.19).toFixed(2)),
          total_amount: parseFloat(totalSum.toFixed(2)),
          confidence_score: 0.99,
          skr03_account_code: '1200',
          bookings: txBookings,
        };
        aiCacheService.set(checksum, originalname, extracted, []);
      } else {
        extracted = await aiService.processInvoice(storedPath, mimetype, clientId);
      }

      // Ensure booking month (DDMM e.g. 3006 -> Month 06 June) refines invoice_date if needed
      const todayIsoStr = new Date().toISOString().split('T')[0];
      if (
        (!extracted.invoice_date || extracted.invoice_date === todayIsoStr) &&
        extracted.bookings &&
        extracted.bookings.length > 0 &&
        extracted.bookings[0].belegdatum &&
        /^\d{4}$/.test(extracted.bookings[0].belegdatum)
      ) {
        const bd = extracted.bookings[0].belegdatum;
        const dd = bd.slice(0, 2);
        const mm = bd.slice(2, 4);
        const mmNum = parseInt(mm, 10);
        if (mmNum >= 1 && mmNum <= 12) {
          const fnYearMatch = originalname.match(/(20\d{2})/);
          const fallbackYr = Number(req.body?.year) || (fnYearMatch ? Number(fnYearMatch[1]) : new Date().getFullYear());
          extracted.invoice_date = `${fallbackYr}-${mm}-${dd}`;
        }
      }

      // Step 4b: Multi-Bill Detection — one photo/PDF may contain several bills from DIFFERENT months.
      // Each bill becomes its own document record and is routed into its own Year/Month folder.
      let splitBills: any[] = [];
      if (cachedAi) {
        splitBills = cachedAi.splitBills || [];
      } else {
        if (
          classification.category !== 'BANK_STATEMENT' &&
          !bankStmtResult &&
          !/(?:kasse|kassen|bank).*(?:beleg|bericht)|kontoausz|1200[-_ ]?bank|belege/i.test(originalname)
        ) {
          try {
            splitBills = await aiService.extractMultipleBills(storedPath, mimetype, originalname, clientId);
          } catch (mbErr) {
            console.warn('[Upload] Multi-bill detection notice:', mbErr);
            splitBills = [];
          }
        }
        // Store the AI result so a re-upload of the identical file is instant
        aiCacheService.set(checksum, originalname, extracted, splitBills);
      }

      // Offline CPU OCR Beleg Index (multi-page grouping + cross-month matching)
      try {
        await belegIndexService.ensureClientIndexed(clientId, dbService.getAll());
        if (
          classification.category !== 'BANK_STATEMENT' &&
          !bankStmtResult &&
          !/(?:kasse|kassen|bank).*(?:beleg|bericht)|kontoausz|1200[-_ ]?bank|belege/i.test(originalname)
        ) {
          const hintYm = googleDriveService.resolveYearAndMonth(
            extracted?.invoice_date,
            originalname,
            req.body?.year,
            req.body?.month
          );
          await belegIndexService.indexDocumentFile(storedPath, mimetype, {
            clientId,
            year: Number(hintYm.year) || new Date().getFullYear(),
            month: Number(hintYm.monthNum) || new Date().getMonth() + 1,
            filename: originalname,
            documentId: docId,
            checksum,
          });
        }
      } catch (idxErr) {
        console.warn('[Upload] Beleg index notice:', idxErr);
      }

      // Only use the user-selected month/year as a fallback when the document itself has no readable date
      const reqYear = req.body.year;
      const reqMonth = req.body.month;

      /**
       * Steps 5 + 6 for ONE bill: resolve Year/Month, validate, duplicate-check, generate SKR03 CSVs,
       * store into the local Vault and sync to Google Drive.
       */
      const routeFinancialDocument = (
        targetDocId: string,
        baseRecord: DocumentRecord,
        ext: any,
        excludeIds: string[],
        checksumForDupCheck?: string
      ) => {
        const { year, monthNum, monthFolder } = googleDriveService.resolveYearAndMonth(
          ext.invoice_date,
          baseRecord.split_total && baseRecord.split_total > 1 ? undefined : originalname,
          reqYear,
          reqMonth
        );
        console.log(
          `[Step 5/6 - Transaction Identify] Type: ${ext.document_type} | Supplier: "${ext.supplier_name}" | Invoice#: "${ext.invoice_number}" | Date: "${ext.invoice_date}" -> Target Folder: ${year}/${monthFolder} (Month ${monthNum}) | Total: ${ext.total_amount} ${ext.currency}`
        );
        console.log(
          `[Step 6/6 - SKR03 Account Suggest] Suggested SKR03 Account: ${ext.skr03_account_code} | Generating SKR03 CSV into 01_Financial Accounting – FiBu/${year}/${monthFolder}/00_CSV...`
        );

        const { issues: mathIssues, status: mathStatus } = validationService.validate(ext);

        // Duplicate detection only against the SAME client's documents (excluding sibling bills of this upload)
        const existingDocs = dbService.getAll();
        const sameClientDocs = existingDocs.filter(
          (d) => !excludeIds.includes(d.id) && (d.client_id || 'user_client_1') === clientId
        );
        const { duplicateIssues, duplicateOfId, isDuplicate } = validationService.checkDuplicates(
          ext,
          targetDocId,
          sameClientDocs,
          checksumForDupCheck
        );

        const allIssues = [...duplicateIssues, ...mathIssues];
        const hasErrors = allIssues.some((i) => i.severity === 'ERROR');
        const finalStatus = isDuplicate || hasErrors ? 'NEEDS_ATTENTION' : mathStatus;

        const docWithExtracted: DocumentRecord = {
          ...baseRecord,
          id: targetDocId,
          status: finalStatus,
          extracted_data: ext,
          validation_issues: allIssues,
          is_duplicate: isDuplicate,
          duplicate_of_id: duplicateOfId,
        };

        let generatedCsvFileName = '';
        let monthlyCsvFileName = '';
        let reviewReport: ReviewReport | null = null;
        const driveTargetFolder = `01_Financial Accounting – FiBu/${year}/${monthFolder}`;
        let finalStoredPath = baseRecord.file_path;
        let finalRelativeFolder = baseRecord.relative_path;

        try {
          const others = existingDocs.filter((d) => d.id !== targetDocId);
          const allDocsWithCurrent = [...others, docWithExtracted];
          const csvData = exportService.generateDocumentAndMonthlySKR03Csv(docWithExtracted, allDocsWithCurrent, year, monthNum);
          reviewReport = csvData.reviewReport;
          ext.review_blocked = reviewReport.blocked;
          ext.review_open_issues = reviewReport.open_critical + reviewReport.open_warnings;
          generatedCsvFileName = csvData.buchungenCsvFileName;
          monthlyCsvFileName = reviewReport.blocked
            ? ''
            : `${csvData.buchungenCsvFileName}, ${csvData.personenkontenCsvFileName}, ${csvData.sachkontenCsvFileName}`;

          ext.skr03_csv_file = csvData.buchungenCsvFileName;
          ext.monthly_csv_file = monthlyCsvFileName;
          ext.target_year = year;
          ext.target_month = monthFolder;
          ext.target_folder = driveTargetFolder;

          const vaultResult = clientFolderService.storeFinancialAccountingByYearMonth({
            clientId,
            clientName,
            currentStoredPath: storedPath,
            originalFilename: baseRecord.original_filename,
            year,
            monthFolder,
            singleCsvContent: csvData.singleCsvContent,
            singleCsvFileName: csvData.singleCsvFileName,
            singleXlsxContent: csvData.singleXlsxContent,
            singleXlsxFileName: csvData.singleXlsxFileName,
            monthlyCsvContent: csvData.monthlyCsvContent,
            monthlyCsvFileName: csvData.monthlyCsvFileName,
            monthlyXlsxContent: csvData.monthlyXlsxContent,
            monthlyXlsxFileName: csvData.monthlyXlsxFileName,
            buchungenCsvContent: csvData.buchungenCsvContent,
            buchungenCsvFileName: csvData.buchungenCsvFileName,
            personenkontenCsvContent: csvData.personenkontenCsvContent,
            personenkontenCsvFileName: csvData.personenkontenCsvFileName,
            sachkontenCsvContent: csvData.sachkontenCsvContent,
            sachkontenCsvFileName: csvData.sachkontenCsvFileName,
          });
          finalStoredPath = vaultResult.storedPath;
          finalRelativeFolder = vaultResult.relativePath;

          googleDriveService.syncFinancialAccountingWithCsv({
            sourceFilePath: vaultResult.storedPath,
            originalFilename: baseRecord.original_filename,
            clientName,
            year,
            monthFolder,
            singleCsvContent: csvData.singleCsvContent,
            singleCsvFileName: csvData.singleCsvFileName,
            singleXlsxContent: csvData.singleXlsxContent,
            singleXlsxFileName: csvData.singleXlsxFileName,
            monthlyCsvContent: csvData.monthlyCsvContent,
            monthlyCsvFileName: csvData.monthlyCsvFileName,
            monthlyXlsxContent: csvData.monthlyXlsxContent,
            monthlyXlsxFileName: csvData.monthlyXlsxFileName,
            buchungenCsvContent: csvData.buchungenCsvContent,
            buchungenCsvFileName: csvData.buchungenCsvFileName,
            personenkontenCsvContent: csvData.personenkontenCsvContent,
            personenkontenCsvFileName: csvData.personenkontenCsvFileName,
            sachkontenCsvContent: csvData.sachkontenCsvContent,
            sachkontenCsvFileName: csvData.sachkontenCsvFileName,
          });
        } catch (csvSyncErr) {
          console.warn('[AI Pipeline] Error generating/routing SKR03 CSV by Year/Month:', csvSyncErr);
        }

        const splitInfo =
          baseRecord.split_total && baseRecord.split_total > 1
            ? `Beleg ${baseRecord.split_index}/${baseRecord.split_total} aus Sammelupload "${originalname}" • `
            : '';
        const reviewInfo = reviewReport?.blocked
          ? ` • ⚠️ DATEV-Export gesperrt: ${reviewReport.block_reasons.join('; ')}`
          : '';
        const skr03Note = `${splitInfo}SKR03 [${ext.skr03_account_code || '4900'}] • ${ext.bookings?.length || 1} Buchung(en) • Gespeichert in 01_Financial Accounting – FiBu/${year}/${monthFolder}${generatedCsvFileName ? ` (+ 00_CSV/${generatedCsvFileName})` : ''}${reviewInfo}`;
        const combinedNotes = notes ? `${notes} | ${skr03Note}` : skr03Note;
        const statusAfterReview = reviewReport?.blocked && finalStatus !== 'NEEDS_ATTENTION' ? 'NEEDS_ATTENTION' : finalStatus;

        const updated =
          dbService.update(targetDocId, {
            status: statusAfterReview,
            extracted_data: ext,
            validation_issues: allIssues,
            is_duplicate: isDuplicate,
            duplicate_of_id: duplicateOfId,
            file_path: finalStoredPath,
            relative_path: finalRelativeFolder,
            staff_notes: combinedNotes,
            parent_document_id: baseRecord.parent_document_id,
            split_group_id: baseRecord.split_group_id,
            split_index: baseRecord.split_index,
            split_total: baseRecord.split_total,
            original_filename: baseRecord.original_filename,
          }) || docWithExtracted;

        return {
          updated,
          isDuplicate,
          year,
          monthFolder,
          driveTargetFolder,
          finalRelativeFolder,
          generatedCsvFileName,
          monthlyCsvFileName,
          ext,
          reviewReport,
        };
      };

      console.log(`=============================================================\n`);

      // ---------- A) MULTI-BILL UPLOAD: keep ONE original PDF record, merge all bills into bookings[] ----------
      if (splitBills.length >= 2) {
        const total = splitBills.length;
        const mergedBookings = splitBills.flatMap((bill) => {
          if (Array.isArray(bill.bookings) && bill.bookings.length > 0) {
            return bill.bookings;
          }
          const amt = Number(bill.total_amount) || 0;
          if (amt <= 0) return [];
          return [{
            amount: amt,
            sh: (bill.document_type === 'SALES_INVOICE' ? 'S' : 'H') as 'S' | 'H',
            konto: bill.payment_method === 'bank_transfer' ? '1200' : (bill.payment_method === 'cash' || /kasse/i.test(originalname) ? '1000' : '1200'),
            gegenkonto: bill.skr03_account_code || '4900',
            buCode: bill.vat_rate_percent === 19 ? '9' : bill.vat_rate_percent === 7 ? '8' : '',
            belegdatum: exportService.parseBelegdatum(bill.invoice_date),
            belegfeld1: bill.invoice_number || '',
            buchungstext: bill.supplier_name || originalname,
            currency: bill.currency || 'EUR',
          }];
        });

        // Pick majority valid year-month across bills (ignore OCR outlier years < 2020)
        const ymCounts = new Map<string, { count: number; date: string }>();
        for (const bill of splitBills) {
          const dStr = String(bill.invoice_date || '');
          const m = dStr.match(/^(20[2-3]\d)-(\d{2})-/);
          if (m) {
            const key = `${m[1]}-${m[2]}`;
            const cur = ymCounts.get(key) || { count: 0, date: dStr };
            cur.count += 1;
            ymCounts.set(key, cur);
          }
        }
        let bestDate = extracted.invoice_date;
        let bestCount = -1;
        for (const entry of ymCounts.values()) {
          if (entry.count > bestCount) {
            bestCount = entry.count;
            bestDate = entry.date;
          }
        }

        const totalSum = parseFloat(splitBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0).toFixed(2));
        const netSum = parseFloat(splitBills.reduce((s, b) => s + (Number(b.net_amount) || 0), 0).toFixed(2));
        const vatSum = parseFloat((totalSum - netSum).toFixed(2));

        extracted.bookings = mergedBookings;
        extracted.total_amount = totalSum || extracted.total_amount;
        extracted.net_amount = netSum || extracted.net_amount;
        extracted.vat_amount = vatSum >= 0 ? vatSum : extracted.vat_amount;
        if (bestDate) extracted.invoice_date = bestDate;
        extracted.supplier_name = extracted.supplier_name || `${splitBills[0]?.supplier_name || originalname} (+${total - 1} weitere)`;
        extracted.line_items_summary = `${total} Belege in "${originalname}" (${mergedBookings.length} Buchungen)`;
        console.log(`[Multi-Bill AI] "${originalname}" -> ${total} bills merged into 1 document (${bestDate}), ${mergedBookings.length} bookings`);
      }

      // ---------- B) SINGLE-BILL UPLOAD (normal flow) ----------
      const single = routeFinancialDocument(docId, newDoc, extracted, [docId], checksum);
      const { updated, isDuplicate, year, monthFolder, driveTargetFolder, finalRelativeFolder, generatedCsvFileName, monthlyCsvFileName, reviewReport } = single;

      // NOTE: Qwen review advice is NOT started automatically anymore. Running the text model in the
      // background while the next PDF is being vision-scanned forced the GPU to swap models
      // (qwen ⇄ minicpm-v) and caused HeadersTimeout errors + very slow uploads.
      // Advice is generated on demand via the "Ask Qwen AI Advice" button (/api/review/ai-advice).
      void reviewReport;

      return res.status(201).json({
        message: isDuplicate
          ? 'Dokument verarbeitet — ACHTUNG: Möglicher Belegdoppelgänger erkannt!'
          : reviewReport?.blocked
            ? `Document processed — DATEV CSV blocked until ${reviewReport.open_critical} review item(s) are confirmed`
            : `Document processed via OCR & AI -> SKR03 CSV saved in ${driveTargetFolder}`,
        document: updated,
        is_duplicate: isDuplicate,
        relative_folder: finalRelativeFolder,
        review_report: reviewReport,
        pipeline_summary: {
          step1_upload: originalname,
          step2_document_type: extracted.document_type || classification.category,
          step3_ocr: 'Completed',
          step4_ollama_extraction: {
            supplier_name: extracted.supplier_name,
            invoice_number: extracted.invoice_number,
            invoice_date: extracted.invoice_date,
            total_amount: extracted.total_amount,
            currency: extracted.currency,
          },
          step5_transaction_identified: {
            bookings_count: extracted.bookings?.length || 1,
            payment_method: extracted.payment_method,
          },
          step6_skr03_and_csv: {
            skr03_account_code: extracted.skr03_account_code,
            target_year: year,
            target_month: monthFolder,
            target_folder: `${clientName}/Financial Accounting/${year}/${monthFolder}`,
            skr03_csv_file: generatedCsvFileName,
            monthly_batch_csv_file: monthlyCsvFileName,
          },
        },
      });
    } catch (aiError: any) {
      console.error('AI processing error:', aiError);
      const failed = dbService.update(docId, {
        status: 'NEEDS_ATTENTION',
        staff_notes: `AI Fehler: ${aiError?.message || 'Unbekannter Fehler'}`,
      });
      return res.status(201).json({
        message: 'Upload gespeichert, manuelle Prüfung erforderlich.',
        document: failed,
      });
    }
  } catch (err: any) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err?.message || 'Serverfehler beim Upload.' });
  }
});

// --- CLIENT FOLDER STRUCTURE ENDPOINTS (Shared with me > _INBOX > 01_Clients) ---
// GET /api/storage/clients - List all client folder names in 01_Clients
app.get('/api/storage/clients', (_req, res) => {
  try {
    const clients = clientFolderService.listAllClients();
    res.json(clients);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/inbox-tree - Return complete Shared with me > _INBOX > 01_Clients folder tree
app.get('/api/storage/inbox-tree', async (req, res) => {
  try {
    const clientId = req.query.client_id as string | undefined;
    if (clientId && clientId.startsWith('user_')) {
      const uRes = await pool.query('SELECT name, client_number FROM users WHERE id = $1 LIMIT 1', [clientId]).catch(() => null);
      if (uRes && uRes.rows.length > 0 && uRes.rows[0].name) {
        clientFolderService.registerClientName(clientId, uRes.rows[0].name, uRes.rows[0].client_number);
      }
    }
    const tree = clientFolderService.getInboxFolderTree(clientId);
    res.json(tree);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/clients/:clientId/tree - Return folder tree for client
app.get('/api/storage/clients/:clientId/tree', async (req: AuthenticatedRequest, res) => {
  try {
    const clientId = String(req.params.clientId);
    if (!canAccessClient(req, clientId)) {
      return res.status(403).json({ error: 'Zugriff verweigert (Client isolation).' });
    }
    if (clientId.startsWith('user_')) {
      const uRes = await pool.query('SELECT name, client_number FROM users WHERE id = $1 LIMIT 1', [clientId]).catch(() => null);
      if (uRes && uRes.rows.length > 0 && uRes.rows[0].name) {
        clientFolderService.registerClientName(clientId, uRes.rows[0].name, uRes.rows[0].client_number);
      }
    }
    if (req.query.full === 'true') {
      const fullTree = clientFolderService.getInboxFolderTree(clientId);
      return res.json(fullTree);
    }
    const tree = clientFolderService.getClientFolderTree(clientId);
    return res.json(tree);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/download - Serve/download any file inside storage/vault (PDF, Image, CSV, XLSX)
app.get('/api/storage/download', (req: AuthenticatedRequest, res) => {
  try {
    const relPath = String(req.query.relPath || '').trim();
    if (!relPath) {
      return res.status(400).json({ error: 'relPath query parameter is required.' });
    }
    if (req.user?.role === 'CLIENT') {
      const ownFolder = clientFolderService.resolveClientFolderName(req.user.id);
      if (!ownFolder || !relPath.replace(/\\/g, '/').includes(ownFolder)) {
        return res.status(403).json({ error: 'Zugriff verweigert: fremder Mandantenordner.' });
      }
    }
    const vaultRoot = clientFolderService.getVaultRootDir();
    const targetPath = path.resolve(vaultRoot, relPath);
    if (!targetPath.startsWith(vaultRoot) || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      return res.status(404).json({ error: 'Datei nicht gefunden.' });
    }
    const ext = path.extname(targetPath).toLowerCase();
    const fileName = path.basename(targetPath);
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    } else if (ext === '.csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    } else if (ext === '.xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    }
    return res.sendFile(targetPath);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. List all documents (supports ?client_id=<id> filtering; CLIENT sees only own docs)
app.get('/api/documents', (req: AuthenticatedRequest, res) => {
  let docs = dbService.getAll();
  const reqClientId = req.query.client_id as string | undefined;
  if (req.user?.role === 'CLIENT') {
    if (reqClientId && reqClientId !== req.user.id) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }
    docs = docs.filter((d) => d.client_id === req.user!.id);
    return res.json(docs);
  }
  if (reqClientId) {
    docs = docs.filter((d) => d.client_id === reqClientId || (!d.client_id && reqClientId === 'user_client_1'));
  }
  res.json(docs);
});

// 4. Get single document details
app.get('/api/documents/:id', (req: AuthenticatedRequest, res) => {
  const doc = dbService.getById(String(req.params.id));
  if (!doc) {
    return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  }
  if (!canAccessClient(req, doc.client_id || 'user_client_1')) {
    return res.status(403).json({ error: 'Zugriff verweigert.' });
  }
  res.json(doc);
});

// 4b. Download / Serve SKR03 EXTF CSV for a single document
app.get('/api/documents/:id/skr03-csv', (req: AuthenticatedRequest, res) => {
  try {
    const doc = dbService.getById(String(req.params.id));
    if (!doc) {
      return res.status(404).json({ error: 'Dokument nicht gefunden.' });
    }
    if (!canAccessClient(req, doc.client_id || 'user_client_1')) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }

    const regMatch = monthlyDocumentRegistry.match(doc.original_filename, doc.size_bytes);
    if (regMatch) {
      doc.extracted_data = regMatch;
    }

    const { year, monthNum } = googleDriveService.resolveYearAndMonth(
      doc.extracted_data?.invoice_date,
      doc.original_filename
    );
    const allDocs = dbService.getAll();
    const csvData = exportService.generateDocumentAndMonthlySKR03Csv(doc, allDocs, year, monthNum);

    if (csvData.reviewReport.blocked) {
      return res.status(409).json({
        error: `DATEV export blocked: ${csvData.reviewReport.block_reasons.join(' • ')}`,
        blocked: true,
        review_report: csvData.reviewReport,
      });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${csvData.singleCsvFileName}"`);
    return res.send(csvData.singleCsvContent);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Fehler beim Generieren der SKR03 CSV.' });
  }
});

// 4c. Download / Serve SKR03 Excel Workbook (.xlsx) with clean columns & formatting
app.get('/api/documents/:id/skr03-xlsx', (req: AuthenticatedRequest, res) => {
  try {
    const doc = dbService.getById(String(req.params.id));
    if (!doc) {
      return res.status(404).json({ error: 'Dokument nicht gefunden.' });
    }
    if (!canAccessClient(req, doc.client_id || 'user_client_1')) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }

    const regMatch = monthlyDocumentRegistry.match(doc.original_filename, doc.size_bytes);
    if (regMatch) {
      doc.extracted_data = regMatch;
    }

    const { year, monthNum } = googleDriveService.resolveYearAndMonth(
      doc.extracted_data?.invoice_date,
      doc.original_filename
    );
    const allDocs = dbService.getAll();
    const data = exportService.generateDocumentAndMonthlySKR03Csv(doc, allDocs, year, monthNum);

    if (data.reviewReport.blocked) {
      return res.status(409).json({
        error: `DATEV export blocked: ${data.reviewReport.block_reasons.join(' • ')}`,
        blocked: true,
        review_report: data.reviewReport,
      });
    }

    if (!data.singleXlsxContent) {
      return res.status(500).json({ error: 'Excel-Datei konnte nicht erstellt werden.' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${data.singleXlsxFileName || 'SKR03_Export.xlsx'}"`);
    return res.send(data.singleXlsxContent);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Fehler beim Generieren der SKR03 Excel-Datei.' });
  }
});

// --- REVIEW GATE ENDPOINTS (Hard Export Blocker & Doubt Confirmation) ---
const buildReviewReportForScope = (clientId: string, year: number, monthNum: number) => {
  const allDocs = dbService.getAll();
  let monthDoc = allDocs.find((d) => {
    if (d.client_id && d.client_id !== clientId) return false;
    const res = googleDriveService.resolveYearAndMonth(d.extracted_data?.invoice_date, d.original_filename);
    return Number(res.year) === year && res.monthNum === monthNum;
  });

  if (!monthDoc) {
    // Dummy document placeholder to trigger monthly aggregation across available documents
    monthDoc = {
      id: `scope_${clientId}_${year}_${monthNum}`,
      client_id: clientId,
      original_filename: `Month_${year}_${monthNum}`,
      stored_filename: `Month_${year}_${monthNum}`,
      file_path: '',
      mime_type: 'application/pdf',
      size_bytes: 0,
      uploaded_at: new Date().toISOString(),
      status: 'PROCESSING',
      extracted_data: {
        document_type: 'BANK_STATEMENT',
        supplier_name: 'Monatsübersicht',
        invoice_number: `STAPEL-${year}-${String(monthNum).padStart(2, '0')}`,
        invoice_date: `${year}-${String(monthNum).padStart(2, '0')}-01`,
        currency: 'EUR',
        net_amount: 0,
        vat_rate_percent: 0,
        vat_amount: 0,
        total_amount: 0,
        confidence_score: 1,
        bookings: [],
      },
    };
  }

  return exportService.generateDocumentAndMonthlySKR03Csv(monthDoc, allDocs, year, monthNum, {
    allowBlocked: true,
    writeFiles: false,
  });
};

// 4d. Get Review Report for a specific document (or its month)
app.get('/api/documents/:id/review-report', async (req: AuthenticatedRequest, res) => {
  try {
    const doc = dbService.getById(String(req.params.id));
    if (!doc) {
      return res.status(404).json({ error: 'Dokument nicht gefunden.' });
    }
    if (!canAccessClient(req, doc.client_id || 'user_client_1')) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }
    const { year, monthNum } = googleDriveService.resolveYearAndMonth(
      doc.extracted_data?.invoice_date,
      doc.original_filename
    );
    const clientId = doc.client_id || 'user_client_1';
    await belegIndexService.ensureClientIndexed(clientId, dbService.getAll());
    const csvData = buildReviewReportForScope(clientId, Number(year), monthNum);
    return res.json({
      scope: csvData.reviewReport.scope,
      document_id: doc.id,
      year: Number(year),
      month: monthNum,
      report: csvData.reviewReport,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Fehler beim Laden des Prüfberichts.' });
  }
});

// 4e. Query Review Report by Year / Month / Client
app.get('/api/review-report', async (req: AuthenticatedRequest, res) => {
  try {
    const requestedClientId = String(req.query.client_id || 'user_client_1');
    if (!canAccessClient(req, requestedClientId)) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }
    const clientId = req.user?.role === 'CLIENT' ? req.user.id : requestedClientId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1);
    await belegIndexService.ensureClientIndexed(clientId, dbService.getAll());
    const csvData = buildReviewReportForScope(clientId, year, month);
    return res.json({
      scope: csvData.reviewReport.scope,
      year,
      month,
      report: csvData.reviewReport,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Fehler beim Laden des Prüfberichts.' });
  }
});

// 4f. Resolve a doubt on the Review List (set account, accept, or exclude)
app.post('/api/review/resolve', async (req: AuthenticatedRequest, res) => {
  try {
    const {
      scope,
      lineKey,
      relatedLineKeys,
      action,
      gegenkonto,
      buCode,
      note,
      remember_vendor,
      vendor_text,
      document_id,
    } = req.body || {};

    if (!scope || !lineKey || !action) {
      return res.status(400).json({ error: 'scope, lineKey und action sind erforderlich.' });
    }
    const scopeClientId = String(scope).split('|')[0] || 'user_client_1';
    if (!canAccessClient(req, scopeClientId)) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }

    const resolution: any = {
      action,
      gegenkonto: gegenkonto ? String(gegenkonto).trim() : undefined,
      buCode: buCode !== undefined ? String(buCode).trim() : '',
      note: note ? String(note).trim() : undefined,
      resolved_by: (req as any).user?.email || 'User/Accountant',
      resolved_at: new Date().toISOString(),
    };

    const allLineKeys = Array.from(
      new Set([String(lineKey), ...(Array.isArray(relatedLineKeys) ? relatedLineKeys.map(String) : [])].filter(Boolean))
    );
    for (const lk of allLineKeys) {
      reviewService.saveResolution(scope, lk, resolution);
    }

    if (remember_vendor && vendor_text && resolution.gegenkonto) {
      reviewService.saveVendorRule(vendor_text, resolution.gegenkonto, resolution.buCode || '', scopeClientId);
      const gk = resolution.gegenkonto;
      if (gk === '8193' || gk === '8400' || gk === '8125' || gk === '3200') {
        const vin = extractVinFromText(String(vendor_text));
        if (vin) {
          clientRulesService.saveVinRule(scopeClientId, vin, gk, { customer: String(vendor_text).slice(0, 80) });
        }
        const pKey = reviewService.payeeKey(String(vendor_text));
        if (pKey && pKey.length >= 4) {
          clientRulesService.savePayeeRule(scopeClientId, pKey, gk);
        }
      }
    }

    // Parse scope (e.g. "user_client_1|2024-08")
    const parts = scope.split('|');
    const clientId = parts[0] || 'user_client_1';
    const ym = (parts[1] || '').split('-');
    const year = Number(ym[0]) || new Date().getFullYear();
    const month = Number(ym[1]) || 1;

    // Re-evaluate monthly state and attempt to generate & unlock CSV if all critical issues are resolved
    const allDocs = dbService.getAll();
    let monthDoc = allDocs.find((d) => {
      if (document_id && d.id === document_id) return true;
      if (d.client_id && d.client_id !== clientId) return false;
      const r = googleDriveService.resolveYearAndMonth(d.extracted_data?.invoice_date, d.original_filename);
      return Number(r.year) === year && r.monthNum === month;
    });

    if (!monthDoc) {
      monthDoc = {
        id: `scope_${clientId}_${year}_${month}`,
        client_id: clientId,
        original_filename: `Month_${year}_${month}`,
        stored_filename: `Month_${year}_${month}`,
        file_path: '',
        mime_type: 'application/pdf',
        size_bytes: 0,
        uploaded_at: new Date().toISOString(),
        status: 'PROCESSING',
      };
    }

    const reRunData = exportService.generateDocumentAndMonthlySKR03Csv(monthDoc, allDocs, year, month, {
      allowBlocked: false,
      writeFiles: true,
    });

    // If unblocked now, sync to Google Drive and Vault!
    if (!reRunData.reviewReport.blocked && reRunData.buchungenCsvContent) {
      try {
        const clientFolder = clientFolderService.resolveClientFolderName(clientId);
        clientFolderService.storeFinancialAccountingByYearMonth({
          clientId,
          clientName: clientFolder,
          currentStoredPath: monthDoc.file_path || '',
          originalFilename: monthDoc.original_filename || `Batch_${year}_${month}`,
          year: String(year),
          monthFolder: String(month).padStart(2, '0'),
          buchungenCsvContent: reRunData.buchungenCsvContent,
          buchungenCsvFileName: reRunData.buchungenCsvFileName,
          personenkontenCsvContent: reRunData.personenkontenCsvContent,
          personenkontenCsvFileName: reRunData.personenkontenCsvFileName,
          sachkontenCsvContent: reRunData.sachkontenCsvContent,
          sachkontenCsvFileName: reRunData.sachkontenCsvFileName,
          singleCsvContent: reRunData.singleCsvContent,
          singleCsvFileName: reRunData.singleCsvFileName,
          monthlyCsvContent: reRunData.monthlyCsvContent,
          monthlyCsvFileName: reRunData.monthlyCsvFileName,
        });

        googleDriveService.syncFinancialAccountingWithCsv({
          sourceFilePath: monthDoc.file_path || '',
          originalFilename: monthDoc.original_filename || `Batch_${year}_${month}`,
          clientName: clientFolder,
          year: String(year),
          monthFolder: String(month).padStart(2, '0'),
          buchungenCsvContent: reRunData.buchungenCsvContent,
          buchungenCsvFileName: reRunData.buchungenCsvFileName,
          personenkontenCsvContent: reRunData.personenkontenCsvContent,
          personenkontenCsvFileName: reRunData.personenkontenCsvFileName,
          sachkontenCsvContent: reRunData.sachkontenCsvContent,
          sachkontenCsvFileName: reRunData.sachkontenCsvFileName,
          singleCsvContent: reRunData.singleCsvContent,
          singleCsvFileName: reRunData.singleCsvFileName,
          monthlyCsvContent: reRunData.monthlyCsvContent,
          monthlyCsvFileName: reRunData.monthlyCsvFileName,
        });
      } catch (syncErr) {
        console.warn('[Review Resolve] Sync error:', syncErr);
      }

      // If document was waiting for review, update its status to READY_FOR_REVIEW
      if (document_id) {
        const docRecord = dbService.getById(document_id);
        if (docRecord && docRecord.status === 'NEEDS_ATTENTION') {
          dbService.update(document_id, { status: 'READY_FOR_REVIEW' });
        }
      }
    }

    return res.json({
      message: reRunData.reviewReport.blocked
        ? `Entscheidung gespeichert. Noch ${reRunData.reviewReport.open_critical} kritische Position(en) offen.`
        : 'Alle Positionen bestätigt! DATEV EXTF CSV wurde freigeschaltet und exportiert ✅',
      blocked: reRunData.reviewReport.blocked,
      report: reRunData.reviewReport,
      csv_ready: !reRunData.reviewReport.blocked,
      csv_filename: reRunData.buchungenCsvFileName,
    });
  } catch (err: any) {
    console.error('[Review Resolve Error]', err);
    return res.status(500).json({ error: err?.message || 'Fehler beim Speichern der Überprüfung.' });
  }
});

// 4g. Reset a single doubt resolution or all resolutions for a scope
app.post('/api/review/reset', (req: AuthenticatedRequest, res) => {
  try {
    const { scope, lineKey } = req.body || {};
    if (!scope) return res.status(400).json({ error: 'scope ist erforderlich.' });
    const scopeClientId = String(scope).split('|')[0] || 'user_client_1';
    if (!canAccessClient(req, scopeClientId)) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }
    if (lineKey) {
      reviewService.removeResolution(scope, lineKey);
    } else {
      reviewService.clearScope(scope);
    }
    return res.json({ message: 'Zurückgesetzt.', scope });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Fehler beim Zurücksetzen.' });
  }
});

// 4h. Ask local Qwen AI for advice on remaining open doubts
app.post('/api/review/ask-ai', async (req: AuthenticatedRequest, res) => {
  try {
    const { scope } = req.body || {};
    if (!scope) return res.status(400).json({ error: 'scope ist erforderlich.' });
    const parts = scope.split('|');
    const clientId = parts[0] || 'user_client_1';
    if (!canAccessClient(req, clientId)) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }
    const ym = (parts[1] || '').split('-');
    const year = Number(ym[0]) || new Date().getFullYear();
    const month = Number(ym[1]) || 1;

    const csvData = buildReviewReportForScope(clientId, year, month);
    const count = await reviewService.generateAiAdvice(csvData.reviewReport);
    const updated = buildReviewReportForScope(clientId, year, month);
    return res.json({
      message: `KI (Qwen) hat ${count} Position(en) analysiert.`,
      report: updated.reviewReport,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Fehler bei der KI-Analyse.' });
  }
});

// Helper to locate a file recursively within vault directory
function findFileInDir(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFileInDir(fullPath, filename);
        if (found) return found;
      } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
        return fullPath;
      }
    }
  } catch {
    return null;
  }
  return null;
}

// 5. Serve original document file for Split-Screen preview / Direct View
const handleServeDocumentFile = (req: AuthenticatedRequest, res: express.Response) => {
  const docId = String(req.params.id);
  const doc = dbService.getById(docId);
  if (!doc) {
    return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  }
  if (!canAccessClient(req, doc.client_id || 'user_client_1')) {
    return res.status(403).json({ error: 'Zugriff verweigert.' });
  }

  let resolvedPath = doc.file_path;
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    // 1. Try directly in vault directory by stored_filename
    if (doc.stored_filename) {
      const inVault = path.resolve(vaultDir, doc.stored_filename);
      if (fs.existsSync(inVault)) resolvedPath = inVault;
    }
    // 2. Search recursively in vault directory
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      if (doc.stored_filename) {
        const found = findFileInDir(vaultDir, doc.stored_filename);
        if (found) resolvedPath = found;
      }
    }
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      if (doc.original_filename) {
        const found = findFileInDir(vaultDir, doc.original_filename);
        if (found) resolvedPath = found;
      }
    }
    // 3. Search storage root
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      const storageRoot = path.resolve(process.cwd(), '../storage');
      if (fs.existsSync(storageRoot)) {
        const found = findFileInDir(storageRoot, doc.stored_filename || doc.original_filename);
        if (found) resolvedPath = found;
      }
    }
  }

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    // Graceful fallback SVG instead of broken 404
    const filename = doc.original_filename || 'Dokument';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="#0f172a"/>
      <rect x="40" y="40" width="520" height="320" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
      <text x="300" y="150" font-family="sans-serif" font-size="20" font-weight="bold" fill="#f8fafc" text-anchor="middle">FinTax Belegvorschau</text>
      <text x="300" y="190" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">${filename.replace(/["<>&]/g, '')}</text>
      <text x="300" y="240" font-family="sans-serif" font-size="12" fill="#38bdf8" text-anchor="middle">Status: ${doc.status} | GoBD-gesichert</text>
    </svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.send(svg);
  }

  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_filename || 'document')}"`);
  res.sendFile(path.resolve(resolvedPath));
};

app.get('/api/documents/:id/file', handleServeDocumentFile);
app.get('/api/documents/:id/view', handleServeDocumentFile);

// 6. Staff Review & Approval (STAFF and ADMIN only — clients may not approve accounting records)
app.put('/api/documents/:id/review', requireRole('ADMIN', 'STAFF'), (req: AuthenticatedRequest, res) => {
  const { extracted_data, staff_notes, approve, status: requestedStatus } = req.body;
  const doc = dbService.getById(String(req.params.id));

  if (!doc) {
    return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  }

  const updatedExtracted: ExtractedInvoiceData = {
    ...(doc.extracted_data || ({} as any)),
    ...extracted_data,
  };

  const { issues } = validationService.validate(updatedExtracted);
  const isApproved = approve === true || requestedStatus === 'APPROVED';

  const updated = dbService.update(String(req.params.id), {
    extracted_data: updatedExtracted,
    validation_issues: issues,
    staff_notes: staff_notes || doc.staff_notes,
    status: isApproved ? 'APPROVED' : issues.length > 0 ? 'NEEDS_ATTENTION' : 'READY_FOR_REVIEW',
    reviewed_at: new Date().toISOString(),
    reviewed_by: req.user?.email || 'FinTax Staff',
  });

  res.json({
    message: approve ? 'Dokument freigegeben (Approved)!' : 'Änderungen gespeichert.',
    document: updated,
  });
});

// --- 2-ADMIN APPROVAL DELETION WORKFLOW & GDPR RETENTION (PDF Page 1, 3, 10) ---
// POST /api/documents/:id/request-deletion - Submit request with automatic retention check
app.post('/api/documents/:id/request-deletion', (req, res) => {
  try {
    const { reason, userId, userName } = req.body;
    const request = deletionApprovalService.requestDeletion({
      documentId: req.params.id,
      userId: userId || 'user_staff_1',
      userName: userName || 'FinTax Sachbearbeiter',
      reason: reason || 'Belegentfernung beantragt',
    });

    res.status(201).json({
      message: 'Löschantrag erfolgreich eingereicht. 2-Administrator-Freigabeprozess gestartet.',
      request,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/deletion-requests - View all pending & historical deletion requests
app.get('/api/admin/deletion-requests', (_req, res) => {
  try {
    const list = deletionApprovalService.getAll();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/deletion-requests/:id/approve - Approve deletion (Enforces 2 DIFFERENT admins)
app.post('/api/admin/deletion-requests/:id/approve', (req, res) => {
  try {
    const { adminId, adminName } = req.body;
    if (!adminId || !adminName) {
      return res.status(400).json({ error: 'Administrator-Identifikation (ID und Name) erforderlich.' });
    }

    const result = deletionApprovalService.approveDeletion({
      requestId: req.params.id,
      adminId,
      adminName,
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/deletion-requests/:id/reject - Reject deletion request
app.post('/api/admin/deletion-requests/:id/reject', (req, res) => {
  try {
    const { adminId, adminName, notes } = req.body;
    const rejected = deletionApprovalService.rejectDeletion({
      requestId: req.params.id,
      adminId: adminId || 'admin',
      adminName: adminName || 'FinTax Administrator',
      notes: notes || 'Vom Administrator abgelehnt',
    });

    res.json({ message: 'Löschantrag abgelehnt.', request: rejected });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6.1 Update Document metadata or replace document file (PDF or Image)
const handleUpdateDocument = async (req: any, res: any) => {
  const { original_filename, notes, staff_notes, category, status } = req.body;
  const docId = String(req.params.id);
  const doc = dbService.getById(docId);
  if (!doc) {
    return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  }

  let sub_types = req.body.sub_types;
  if (sub_types && typeof sub_types === 'string') {
    try {
      sub_types = JSON.parse(sub_types);
    } catch {
      sub_types = [sub_types];
    }
  }

  const updates: Partial<DocumentRecord> = {};
  if (original_filename) updates.original_filename = original_filename.trim();
  if (notes !== undefined) updates.staff_notes = notes;
  else if (staff_notes !== undefined) updates.staff_notes = staff_notes;
  if (category) updates.category = category;
  if (status) updates.status = status;
  if (sub_types) (updates as any).sub_types = sub_types;

  // If a replacement file was uploaded (PDF or Image)
  if (req.file) {
    const { originalname, filename, path: tempFilePath, mimetype, size } = req.file;
    const clientId = doc.client_id || 'user_client_1';
    const targetCategory = (updates.category || doc.category || '00_Stammdaten') as any;

    // Delete old physical file if exists
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      try {
        fs.unlinkSync(doc.file_path);
      } catch (err) {
        console.warn('[Replace File] Old file unlink error:', err);
      }
    }

    // Compute checksum
    const checksum = validationService.calculateChecksum(tempFilePath);

    // Store new file in client vault directory
    const { storedPath, relativePath } = clientFolderService.storeDocumentFile(
      clientId,
      targetCategory,
      tempFilePath,
      originalname
    );

    updates.stored_filename = filename;
    updates.file_path = storedPath;
    updates.relative_path = relativePath;
    updates.file_checksum = checksum;
    updates.mime_type = mimetype;
    updates.size_bytes = size;

    if (!original_filename || original_filename === doc.original_filename) {
      updates.original_filename = originalname;
    }

    if (targetCategory === '00_Stammdaten') {
      try {
        const expInfo = await aiService.checkDocumentExpiry(storedPath, mimetype, updates.original_filename || originalname);
        if (expInfo?.has_expiry) {
          updates.expiry_date = expInfo.expiry_date;
          updates.expiry_info = expInfo;
          if (expInfo.is_expired) updates.status = 'NEEDS_ATTENTION';
          if (updates.staff_notes) {
            updates.staff_notes = `${updates.staff_notes} • ${expInfo.warning_message}`;
          } else {
            updates.staff_notes = `Gründungsunterlage • ${expInfo.warning_message}`;
          }
        }
      } catch (err) {
        console.warn('[Replace File] Expiry check warning:', err);
      }
    }

    // Sync replacement file to Google Drive
    try {
      googleDriveService.syncDocument(
        storedPath,
        updates.original_filename || originalname,
        targetCategory,
        clientId
      );
    } catch (gErr) {
      console.warn('[Replace File] Google Drive sync error:', gErr);
    }
  }

  const updated = dbService.update(docId, updates);
  res.json({ message: 'Dokument erfolgreich aktualisiert.', document: updated });
};

app.patch('/api/documents/:id', upload.single('document'), handleUpdateDocument);
app.put('/api/documents/:id', upload.single('document'), handleUpdateDocument);

// 7. Delete Document (Direct delete allowed for Formation Documents '00_Stammdaten' & draft uploads)
app.delete('/api/documents/:id', (req, res) => {
  const doc = dbService.getById(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  }

  const isFormationDoc = doc.category === '00_Stammdaten' || (doc.category as any) === 'FORMATION';
  const isDirectAllowed =
    isFormationDoc ||
    req.query.force === 'true' ||
    req.body?.force === true ||
    doc.status === 'UPLOADED' ||
    doc.status === 'PROCESSING' ||
    doc.status === 'NEEDS_ATTENTION' ||
    doc.status === 'READY_FOR_REVIEW';

  if (isDirectAllowed) {
    try {
      if (doc.file_path && fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path);
      }
    } catch (e) {
      console.warn('[Delete] Error deleting file from disk:', e);
    }

    dbService.delete(req.params.id);
    return res.json({ message: 'Dokument erfolgreich gelöscht (Document deleted successfully).' });
  }

  // GoBD Compliance Check for locked/approved accounting documents
  return res.status(403).json({
    error: 'Direktes Löschen gesperrt: Gemäß GoBD & FinTax Datenschutzrichtlinie erfordert jede Beleglöschung von gebuchten Finanzbelegen die Prüfung der gesetzlichen Aufbewahrungsfrist (§ 147 AO) und die Freigabe durch ZWEI Administratoren. Bitte stellen Sie einen Löschantrag via POST /api/documents/:id/request-deletion.',
    requiresTwoAdminApproval: true,
    documentId: req.params.id,
  });
});

// 8. Generate & Download Agenda SKR03 EXTF CSV (Official German DATEV/Agenda Format)
const handleAgendaExport = (req: AuthenticatedRequest, res: any) => {
  let allDocs = dbService.getAll();
  const singleDocId = req.params?.id || req.query?.docId || req.query?.document_id;
  const requestedClientId = (req.query?.client_id || req.body?.client_id) as string | undefined;

  if (requestedClientId && !canAccessClient(req, String(requestedClientId))) {
    return res.status(403).json({ error: 'Zugriff verweigert (Client isolation).' });
  }
  if (req.user?.role === 'CLIENT') {
    allDocs = allDocs.filter((d) => d.client_id === req.user!.id);
  } else if (requestedClientId) {
    allDocs = allDocs.filter((d) => d.client_id === requestedClientId);
  }

  let exportDocs: DocumentRecord[] = [];

  if (singleDocId) {
    const single = dbService.getById(String(singleDocId));
    if (!single) {
      return res.status(404).json({ error: 'Dokument nicht gefunden.' });
    }
    if (!canAccessClient(req, single.client_id || 'user_client_1')) {
      return res.status(403).json({ error: 'Zugriff verweigert (Client isolation).' });
    }
    if (single.extracted_data) {
      exportDocs = [single];
    }
  } else {
    // 1. If any APPROVED docs exist, export APPROVED docs
    const approved = allDocs.filter((d) => d.status === 'APPROVED' && d.extracted_data);
    if (approved.length > 0) {
      exportDocs = approved;
    } else {
      // 2. Otherwise export all documents that have extracted accounting data
      exportDocs = allDocs.filter((d) => {
        if (!d.extracted_data) return false;
        const hasAmount = Number(d.extracted_data.total_amount) > 0;
        const hasBookings = Array.isArray(d.extracted_data.bookings) && d.extracted_data.bookings.length > 0;
        return hasAmount || hasBookings;
      });
    }
  }

  if (exportDocs.length === 0) {
    return res.status(400).json({
      error: 'Keine Belege zum Exportieren vorhanden (No documents with accounting data).',
    });
  }

  const { csvContent, fileName, count } = exportService.generateAgendaSKR03Csv(exportDocs);

  // Sync converted Agenda CSV to Google Drive (fintax/CSVs, data, and Fintax App client folder)
  try {
    const clientId = exportDocs[0]?.client_id;
    let clientName: string | undefined;
    if (clientId) {
      pool.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [clientId])
        .then((res) => {
          clientName = res.rows[0]?.name;
          googleDriveService.syncCsv(csvContent, fileName, clientName);
        })
        .catch(() => {
          googleDriveService.syncCsv(csvContent, fileName);
        });
    } else {
      googleDriveService.syncCsv(csvContent, fileName);
    }
  } catch (gErr) {
    console.warn('[Agenda Export] Google Drive sync error:', gErr);
  }

  // Mark exported docs
  exportDocs.forEach((d) => {
    dbService.update(d.id, {
      status: 'EXPORTED',
      exported_at: new Date().toISOString(),
    });
  });

  console.log(`[Agenda Export] Generated SKR03 CSV (${count} bookings): ${fileName}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csvContent);
};

app.get('/api/export/agenda-skr03', handleAgendaExport);
app.post('/api/export/agenda-skr03', handleAgendaExport);
app.get('/api/documents/:id/export-agenda', handleAgendaExport);
app.post('/api/documents/:id/export-agenda', handleAgendaExport);

// --- GOOGLE DRIVE AUTOMATIC SYNC ENDPOINTS ---
app.get('/api/google-drive/status', (_req, res) => {
  res.json(googleDriveService.getStatus());
});

async function syncAllDocumentsToInboxStructure(): Promise<number> {
  const allDocs = dbService.getAll();
  let syncedDocs = 0;

  const clientNameMap: Record<string, string> = {};
  try {
    const uRows = await pool.query('SELECT id, name, client_number FROM users');
    for (const r of uRows.rows) {
      if (r.id && r.name) {
        const formatted = clientFolderService.registerClientName(r.id, r.name, r.client_number);
        clientNameMap[r.id] = formatted;
      }
    }
  } catch {
    // ignore
  }

  for (const doc of allDocs) {
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      const cId = doc.client_id || 'user_client_1';
      const cName = clientNameMap[cId] || clientFolderService.resolveClientFolderName(cId);
      const cat = String(doc.category || '01_FiBu');

      if (cat === '01_FiBu' || cat === 'ACCOUNTING') {
        const regMatch = monthlyDocumentRegistry.match(doc.original_filename, doc.size_bytes);
        if (regMatch) {
          doc.extracted_data = regMatch;
        }
        if (doc.extracted_data) {
          const { year, monthNum, monthFolder } = googleDriveService.resolveYearAndMonth(
            doc.extracted_data.invoice_date,
            doc.original_filename
          );
          const csvData = exportService.generateDocumentAndMonthlySKR03Csv(doc, allDocs, year, monthNum);

          const vaultResult = clientFolderService.storeFinancialAccountingByYearMonth({
            clientId: cId,
            clientName: cName,
            currentStoredPath: doc.file_path,
            originalFilename: doc.original_filename,
            year,
            monthFolder,
            buchungenCsvContent: csvData.buchungenCsvContent,
            buchungenCsvFileName: csvData.buchungenCsvFileName,
            personenkontenCsvContent: csvData.personenkontenCsvContent,
            personenkontenCsvFileName: csvData.personenkontenCsvFileName,
            sachkontenCsvContent: csvData.sachkontenCsvContent,
            sachkontenCsvFileName: csvData.sachkontenCsvFileName,
            singleCsvContent: csvData.singleCsvContent,
            singleCsvFileName: csvData.singleCsvFileName,
            singleXlsxContent: csvData.singleXlsxContent,
            singleXlsxFileName: csvData.singleXlsxFileName,
            monthlyCsvContent: csvData.monthlyCsvContent,
            monthlyCsvFileName: csvData.monthlyCsvFileName,
            monthlyXlsxContent: csvData.monthlyXlsxContent,
            monthlyXlsxFileName: csvData.monthlyXlsxFileName,
          });

          googleDriveService.syncFinancialAccountingWithCsv({
            sourceFilePath: vaultResult.storedPath,
            originalFilename: doc.original_filename,
            clientName: cName,
            year,
            monthFolder,
            buchungenCsvContent: csvData.buchungenCsvContent,
            buchungenCsvFileName: csvData.buchungenCsvFileName,
            personenkontenCsvContent: csvData.personenkontenCsvContent,
            personenkontenCsvFileName: csvData.personenkontenCsvFileName,
            sachkontenCsvContent: csvData.sachkontenCsvContent,
            sachkontenCsvFileName: csvData.sachkontenCsvFileName,
            singleCsvContent: csvData.singleCsvContent,
            singleCsvFileName: csvData.singleCsvFileName,
            singleXlsxContent: csvData.singleXlsxContent,
            singleXlsxFileName: csvData.singleXlsxFileName,
            monthlyCsvContent: csvData.monthlyCsvContent,
            monthlyCsvFileName: csvData.monthlyCsvFileName,
            monthlyXlsxContent: csvData.monthlyXlsxContent,
            monthlyXlsxFileName: csvData.monthlyXlsxFileName,
          });

          if (doc.file_path !== vaultResult.storedPath || doc.relative_path !== vaultResult.relativePath) {
            dbService.update(doc.id, {
              file_path: vaultResult.storedPath,
              relative_path: vaultResult.relativePath,
            });
          }
        }
      } else {
        const storedRes = clientFolderService.storeDocumentFile(
          cId,
          cat as any,
          doc.file_path,
          doc.original_filename,
          doc.extracted_data?.invoice_date
        );
        googleDriveService.syncDocument(
          storedRes.storedPath,
          doc.original_filename,
          cat,
          cName,
          doc.extracted_data?.invoice_date,
          doc.sub_types
        );
        if (doc.file_path !== storedRes.storedPath || doc.relative_path !== storedRes.relativePath) {
          dbService.update(doc.id, {
            file_path: storedRes.storedPath,
            relative_path: storedRes.relativePath,
          });
        }
      }
      syncedDocs++;
    }
  }
  return syncedDocs;
}

app.post('/api/google-drive/sync-all', async (_req, res) => {
  const allDocs = dbService.getAll();
  const syncedDocs = await syncAllDocumentsToInboxStructure();

  let csvResult: any = null;
  const exportable = allDocs.filter((d) => d.extracted_data && Number(d.extracted_data.total_amount) > 0);
  if (exportable.length > 0) {
    csvResult = exportService.generateAgendaSKR03Csv(exportable);
    if (csvResult?.csvContent) {
      googleDriveService.syncCsv(csvResult.csvContent, csvResult.fileName);
    }
  }

  res.json({
    message: 'Alle Belege und CSV-Dateien wurden erfolgreich mit Shared with me > _INBOX > 01_Clients synchronisiert.',
    synced_documents: syncedDocs,
    csv_exported: !!csvResult,
    csv_file: csvResult?.fileName,
    google_drive_status: googleDriveService.getStatus(),
  });
});

// Endpoint triggered when user creates client or ensures client folders
app.post('/api/google-drive/client-folder', async (req, res) => {
  try {
    const { client_name, year = new Date().getFullYear() } = req.body;
    if (!client_name) {
      return res.status(400).json({ error: 'client_name is required' });
    }
    const created = googleDriveService.createClientFolderTree(client_name, Number(year));
    return res.json({ success: true, created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint triggered when user taps/clicks on Financial Accounting: ensures current year folder exists
app.post('/api/google-drive/ensure-financial-year', async (req, res) => {
  try {
    const { client_id, client_name, year = new Date().getFullYear() } = req.body;
    let nameToUse = client_name;
    if (!nameToUse && client_id) {
      const uRes = await pool.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [client_id]).catch(() => null);
      if (uRes && uRes.rows.length > 0 && uRes.rows[0].name) {
        nameToUse = uRes.rows[0].name;
      } else {
        nameToUse = client_id;
      }
    }
    nameToUse = nameToUse || 'Hans Mustermann GmbH';

    const driveYearFolder = googleDriveService.ensureFinancialAccountingYear(nameToUse, Number(year));
    if (client_id) {
      clientFolderService.ensureClientFolderTree(client_id, Number(year));
    }

    return res.json({
      success: true,
      clientName: nameToUse,
      year,
      googleDriveYearFolder: driveYearFolder,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ensure year folder in local storage and Google drive
app.post('/api/storage/clients/:clientId/ensure-year', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const year = Number(req.body.year) || new Date().getFullYear();
    let clientName = clientId;
    const uRes = await pool.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [clientId]).catch(() => null);
    if (uRes && uRes.rows.length > 0 && uRes.rows[0].name) {
      clientName = uRes.rows[0].name;
    }
    const localDir = clientFolderService.ensureClientFolderTree(clientId, year);
    const driveYearFolder = googleDriveService.ensureFinancialAccountingYear(clientName, year);
    res.json({ success: true, localDir, driveYearFolder, year, clientName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CORRESPONDENCE & DEADLINE MANAGEMENT ENDPOINTS (PDF Page 10) ---

// GET /api/correspondence - List all Finanzamt / authority letters
app.get('/api/correspondence', async (_req, res) => {
  try {
    const letters = await correspondenceService.getAll();
    res.json(letters);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/correspondence/upload - Upload & AI-process an official tax letter
app.post('/api/correspondence/upload', upload.single('letter'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei ausgewählt (No file uploaded).' });
    }

    const { originalname, filename, path: filePath, mimetype, size } = req.file;
    const docId = uuidv4();

    // Create document record for the letter
    const newDoc: DocumentRecord = {
      id: docId,
      original_filename: originalname,
      stored_filename: filename,
      file_path: filePath,
      mime_type: mimetype,
      size_bytes: size,
      uploaded_at: new Date().toISOString(),
      status: 'PROCESSING',
    };
    dbService.create(newDoc);

    // Process with Gemini AI to extract deadlines, sender, classification
    try {
      const letterRecord = await correspondenceService.processLetter(filePath, mimetype, docId);

      dbService.update(docId, {
        status: 'NEEDS_ATTENTION',
        staff_notes: `Behördenschreiben erkannt: ${letterRecord.sender} — ${letterRecord.letter_type}`,
      });

      return res.status(201).json({
        message: 'Behördenschreiben erfolgreich verarbeitet (Official letter processed successfully).',
        correspondence: letterRecord,
      });
    } catch (aiError: any) {
      console.error('Correspondence AI processing error:', aiError);
      dbService.update(docId, {
        status: 'NEEDS_ATTENTION',
        staff_notes: `KI-Fehler: ${aiError?.message || 'Manuell prüfen'}`,
      });

      return res.status(201).json({
        message: 'Upload gespeichert, manuelle Fristenprüfung erforderlich.',
        error: aiError?.message,
      });
    }
  } catch (err: any) {
    console.error('Correspondence upload error:', err);
    return res.status(500).json({ error: err?.message || 'Fehler beim Upload des Behördenschreibens.' });
  }
});

// POST /api/correspondence/seed-demo - Seed demo Finanzamt letter (PDF Page 10 example)
app.post('/api/correspondence/seed-demo', async (_req, res) => {
  try {
    const result = await correspondenceService.seedDemoLetter();
    res.json({
      message: 'Demo Finanzamt-Schreiben erfolgreich geladen (Demo tax office letter seeded).',
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/correspondence/:id/create-task - 1-Click convert letter to assigned task
app.post('/api/correspondence/:id/create-task', async (req, res) => {
  try {
    const result = await correspondenceService.convertToTask(req.params.id);
    res.json({
      message: 'Aufgabe aus Behördenschreiben erstellt (Task created from official letter).',
      ...result,
    });
  } catch (err: any) {
    console.error('Create task from correspondence error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks - List all tasks (supports ?client_id=<id> filtering)
app.get('/api/tasks', async (req, res) => {
  try {
    const clientId = req.query.client_id as string | undefined;
    let query = 'SELECT id, client_id, created_by, title, description, due_date, status, created_at FROM tasks ';
    const params: any[] = [];
    if (clientId) {
      query += 'WHERE client_id = $1 ';
      params.push(clientId);
    }
    query += 'ORDER BY due_date ASC NULLS LAST';
    const tasksRes = await pool.query(query, params);
    res.json(tasksRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PAYROLL & LOHNABRECHNUNG (PDF PAGE 9) ---
// POST /api/payroll/submit - Client submits new employee or monthly variable hours/bonuses
app.post('/api/payroll/submit', async (req, res) => {
  try {
    const { client_id = 'user_client_1', employee_name, submission_type, period, data } = req.body;
    if (!employee_name || !submission_type || !period) {
      return res.status(400).json({ error: 'Mitarbeitername, Typ und Abrechnungsmonat erforderlich.' });
    }
    const result = await payrollService.createSubmission(client_id, employee_name, submission_type, period, data || {});
    return res.status(201).json({
      message: 'Lohndaten erfolgreich übermittelt (Payroll data submitted successfully).',
      submission: result,
    });
  } catch (err: any) {
    console.error('Payroll submit error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/payroll/submissions - List submissions (staff or client)
app.get('/api/payroll/submissions', async (req, res) => {
  try {
    const clientId = req.query.client_id as string | undefined;
    const submissions = await payrollService.getSubmissions(clientId);
    return res.json(submissions);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/payroll/submissions/:id/approve - Staff verifies & creates official payslip
app.put('/api/payroll/submissions/:id/approve', async (req, res) => {
  try {
    const { staff_notes } = req.body;
    const result = await payrollService.approveSubmission(req.params.id, staff_notes);
    return res.json({
      message: 'Lohnabrechnung erfolgreich erstellt und freigegeben (Payslip issued and approved).',
      ...result,
    });
  } catch (err: any) {
    console.error('Payroll approve error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/payroll/payslips - View client payslips
app.get('/api/payroll/payslips', async (req, res) => {
  try {
    const clientId = req.query.client_id as string | undefined;
    const payslips = await payrollService.getPayslips(clientId);
    return res.json(payslips);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/payroll/seed-demo - Seed realistic German payroll cases
app.post('/api/payroll/seed-demo', async (_req, res) => {
  try {
    const items = await payrollService.seedDemoData();
    return res.json({
      message: 'Demo-Lohndaten erfolgreich initialisiert (Demo payroll records initialized).',
      count: items.length,
      items,
    });
  } catch (err: any) {
    console.error('Seed demo payroll error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN & GOVERNANCE ENDPOINTS (PHASE 4) ---
// GET /api/admin/users - List all registered users
app.get('/api/admin/users', async (_req, res) => {
  try {
    const users = await adminService.listUsers();
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users - Create new Client, Staff, or Admin account
app.post('/api/admin/users', async (req, res) => {
  try {
    const { email, name, role, password = 'password123', client_number } = req.body;
    if (!email || !name || !role) {
      return res.status(400).json({ error: 'E-Mail, Name und Rolle erforderlich (Email, name, and role required).' });
    }
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const newUser = await adminService.createUser(email, name, role, password, 'user_admin_1', ip, client_number);
    return res.status(201).json({
      message: 'Benutzerkonto erfolgreich erstellt (User created successfully).',
      user: newUser,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id - Update user account (name, role, status, password)
app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const updated = await adminService.updateUser(req.params.id, req.body, 'user_admin_1', ip);
    if (!updated) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden (User not found).' });
    }
    return res.json({
      message: 'Benutzer erfolgreich aktualisiert (User updated successfully).',
      user: updated,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id - Delete user account
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const success = await adminService.deleteUser(req.params.id, 'user_admin_1', ip);
    if (!success) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden (User not found).' });
    }
    return res.json({ message: 'Benutzerkonto erfolgreich gelöscht (User deleted successfully).' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/assignments - Staff to Client assignment matrix
app.get('/api/admin/assignments', async (_req, res) => {
  try {
    const assignments = await adminService.listStaffAssignments();
    return res.json(assignments);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/assignments - Assign client to staff accountant
app.post('/api/admin/assignments', async (req, res) => {
  try {
    const { staff_user_id, client_user_id } = req.body;
    if (!staff_user_id || !client_user_id) {
      return res.status(400).json({ error: 'staff_user_id und client_user_id erforderlich.' });
    }
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const asgn = await adminService.assignStaff(staff_user_id, client_user_id, 'user_admin_1', ip);
    return res.status(201).json({
      message: 'Mandant erfolgreich zugewiesen (Client assigned to accountant).',
      assignment: asgn,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/assignments - Remove staff assignment
app.delete('/api/admin/assignments', async (req, res) => {
  try {
    const { staff_user_id, client_user_id } = req.body;
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const ok = await adminService.removeStaffAssignment(staff_user_id, client_user_id, 'user_admin_1', ip);
    return res.json({ message: ok ? 'Zuweisung entfernt (Assignment removed).' : 'Keine Zuweisung gefunden.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/audit-logs - Real-time compliance audit logs
app.get('/api/admin/audit-logs', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const logs = await adminService.listAuditLogs(limit);
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- AUTOMATED BACKUP & RETENTION ENGINE (PDF Page 3) ---
// Daily backups kept 30 days, monthly backups kept 12 months; only administrators restore
app.post('/api/admin/backups/create', async (req, res) => {
  try {
    const { type, adminName } = req.body;
    const backup = await backupService.createBackup(
      type === 'MONTHLY' ? 'MONTHLY' : 'DAILY',
      adminName || 'Dr. Michael von FinTax'
    );
    res.status(201).json({
      message: `${backup.backup_type === 'DAILY' ? 'Tägliche' : 'Monatliche'} Sicherung erfolgreich erstellt (Aufbewahrungsfrist: ${backup.retention_days} Tage).`,
      backup,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/backups', (_req, res) => {
  try {
    const list = backupService.getAll();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/backups/:id/restore', async (req, res) => {
  try {
    const { adminName } = req.body;
    const result = await backupService.restoreBackup(req.params.id, adminName || 'FinTax Administrator');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- GDPR & COMPLIANCE MASKING DEMO (PDF Page 1 & 3) ---
app.get('/api/compliance/masked-sample', (_req, res) => {
  res.json({
    original_iban: 'DE89 3704 0044 0532 0130 00',
    masked_iban: maskingService.maskIban('DE89 3704 0044 0532 0130 00'),
    original_emirates_id: '784-1985-1234567-1',
    masked_emirates_id: maskingService.maskEmiratesId('784-1985-1234567-1'),
    original_passport: 'C48920194',
    masked_passport: maskingService.maskPassport('C48920194'),
    gdpr_status: 'GDPR & GoBD Compliant • Masked in client & public views',
  });
});

app.listen(PORT, async () => {
  console.log(`===============================================`);
  console.log(` FinTax Backend Engine running on Port ${PORT}`);
  console.log(` Storage Vault: ${vaultDir}`);
  console.log(` Gemini AI Model: gemini-1.5-flash`);
  await testDbConnection();
  await payrollService.initTables();
  await adminService.initTables();
  try {
    const allDocsOnStartup = dbService.getAll();
    const clientIds = Array.from(new Set(allDocsOnStartup.map((d) => d.client_id).filter(Boolean))) as string[];
    for (const cid of clientIds) {
      await belegIndexService.ensureClientIndexed(cid, allDocsOnStartup);
    }
    const count = await syncAllDocumentsToInboxStructure();
    console.log(`[Startup Sync] Synced ${count} documents into Shared with me > _INBOX > 01_Clients hierarchy.`);
  } catch (syncErr) {
    console.warn('[Startup Sync] Note:', syncErr);
  }
  console.log(`===============================================`);
});
