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
import { validationService } from './services/validationService.js';
import { exportService } from './services/exportService.js';
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
import { DocumentRecord, ExtractedInvoiceData } from './types/document.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

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
    const docId = uuidv4();

    // Create document record
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
    const clientId = (req.body.client_id || 'user_client_1').trim();
    const category = (req.body.category || '01_FiBu') as any;

    // 1. Compute SHA-256 Checksum
    const checksum = validationService.calculateChecksum(tempFilePath);

    // 2. Automatically store in Client Folder Tree: <clientId>/01_FiBu/<year>/<month>/
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
      original_filename: originalname,
      stored_filename: filename,
      file_path: storedPath,
      relative_path: relativePath,
      file_checksum: checksum,
      mime_type: mimetype,
      size_bytes: size,
      uploaded_at: new Date().toISOString(),
      status: 'PROCESSING',
    };

    dbService.create(newDoc);

    // 3. Run AI extraction
    try {
      const extracted = await aiService.processInvoice(storedPath, mimetype);
      const { issues: mathIssues, status: mathStatus } = validationService.validate(extracted);

      // 4. Run Duplicate Detection (File Checksum, Invoice # + Supplier, Date + Amount)
      const existingDocs = dbService.getAll();
      const { duplicateIssues, duplicateOfId, isDuplicate } = validationService.checkDuplicates(
        extracted,
        docId,
        existingDocs,
        checksum
      );

      const allIssues = [...duplicateIssues, ...mathIssues];
      const hasErrors = allIssues.some((i) => i.severity === 'ERROR');
      const finalStatus = isDuplicate || hasErrors ? 'NEEDS_ATTENTION' : mathStatus;

      const updated = dbService.update(docId, {
        status: finalStatus,
        extracted_data: extracted,
        validation_issues: allIssues,
        is_duplicate: isDuplicate,
        duplicate_of_id: duplicateOfId,
      });

      return res.status(201).json({
        message: isDuplicate
          ? 'Dokument verarbeitet — ACHTUNG: Möglicher Belegdoppelgänger erkannt!'
          : 'Dokument erfolgreich verarbeitet (Document successfully processed).',
        document: updated,
        is_duplicate: isDuplicate,
        relative_folder: relativePath,
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

// --- CLIENT FOLDER STRUCTURE ENDPOINTS (PDF Page 3 & 11) ---
// GET /api/storage/clients - List all client folder IDs
app.get('/api/storage/clients', (_req, res) => {
  try {
    const clients = clientFolderService.listAllClients();
    res.json(clients);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/clients/:clientId/tree - Return folder tree with 00_ to 03_ structure
app.get('/api/storage/clients/:clientId/tree', (req, res) => {
  try {
    const tree = clientFolderService.getClientFolderTree(req.params.clientId);
    res.json(tree);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. List all documents
app.get('/api/documents', (_req, res) => {
  const docs = dbService.getAll();
  res.json(docs);
});

// 4. Get single document details
app.get('/api/documents/:id', (req, res) => {
  const doc = dbService.getById(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  }
  res.json(doc);
});

// 5. Serve original document file for Split-Screen preview
app.get('/api/documents/:id/file', (req, res) => {
  const doc = dbService.getById(req.params.id);
  if (!doc || !fs.existsSync(doc.file_path)) {
    return res.status(404).json({ error: 'Datei nicht gefunden.' });
  }

  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${doc.original_filename}"`);
  res.sendFile(path.resolve(doc.file_path));
});

// 6. Staff Review & Approval
app.put('/api/documents/:id/review', (req, res) => {
  const { extracted_data, staff_notes, approve } = req.body;
  const doc = dbService.getById(req.params.id);

  if (!doc) {
    return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  }

  const updatedExtracted: ExtractedInvoiceData = {
    ...(doc.extracted_data || ({} as any)),
    ...extracted_data,
  };

  const { issues } = validationService.validate(updatedExtracted);

  const updated = dbService.update(req.params.id, {
    extracted_data: updatedExtracted,
    validation_issues: issues,
    staff_notes: staff_notes || doc.staff_notes,
    status: approve ? 'APPROVED' : issues.length > 0 ? 'NEEDS_ATTENTION' : 'READY_FOR_REVIEW',
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'FinTax Staff',
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

// 7. Direct Delete Attempt (Protected: Enforces 2-Admin Rule)
app.delete('/api/documents/:id', (req, res) => {
  const doc = dbService.getById(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  }

  // PDF Compliance Check: Direct unapproved deletion is forbidden!
  return res.status(403).json({
    error: 'Direktes Löschen gesperrt: Gemäß GoBD & FinTax Datenschutzrichtlinie erfordert jede Beleglöschung die Prüfung der gesetzlichen Aufbewahrungsfrist (§ 147 AO) und die Freigabe durch ZWEI Administratoren. Bitte stellen Sie einen Löschantrag via POST /api/documents/:id/request-deletion.',
    requiresTwoAdminApproval: true,
    documentId: req.params.id,
  });
});

// 8. Generate & Download Agenda SKR03 CSV
app.post('/api/export/agenda-skr03', (_req, res) => {
  const allDocs = dbService.getAll();
  const approvedDocs = allDocs.filter((d) => d.status === 'APPROVED');

  if (approvedDocs.length === 0) {
    return res.status(400).json({
      error: 'Keine freigegebenen Dokumente zum Exportieren vorhanden (No approved documents).',
    });
  }

  const { csvContent, fileName } = exportService.generateAgendaSKR03Csv(allDocs);

  // Mark exported docs
  approvedDocs.forEach((d) => {
    dbService.update(d.id, {
      status: 'EXPORTED',
      exported_at: new Date().toISOString(),
    });
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csvContent);
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

// GET /api/tasks - List all tasks (used by the task tracker)
app.get('/api/tasks', async (_req, res) => {
  try {
    const tasksRes = await pool.query(
      'SELECT id, client_id, created_by, title, description, due_date, status, created_at FROM tasks ORDER BY due_date ASC NULLS LAST'
    );
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
  console.log(`===============================================`);
});
