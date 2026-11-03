import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool } from './pgClient.js';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface BankTransactionRow {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  running_balance: number | null;
  calculated_balance?: number;
  is_valid_balance?: boolean;
}

export interface BankStatementData {
  id: string;
  document_id: string;
  bank_name: string;
  account_number: string;
  iban: string;
  statement_period: string; // e.g. "October 2026"
  period_month: number;    // 10
  period_year: number;     // 2026
  opening_balance: number;
  closing_balance: number;
  currency: string;
  transactions: BankTransactionRow[];
  total_debits: number;
  total_credits: number;
  is_reconciled: boolean;
  reconciliation_error?: string;
  missing_periods_alert?: string[];
}

export const bankStatementService = {
  // 1. Process Bank Statement PDF/Image with AI
  async processBankStatement(filePath: string, mimeType: string, documentId: string): Promise<BankStatementData> {
    if (!genAI || !apiKey) {
      throw new Error('Google Gemini API Key is missing');
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are an expert German banking & accounting OCR auditor.
Analyze this bank statement (Kontoauszug) and extract structured transaction data.

Return ONLY a strictly valid JSON object with no markdown wrapping, no backticks, matching this exact schema:
{
  "bank_name": "Deutsche Bank / Sparkasse / etc.",
  "account_number": "Account or Depot number",
  "iban": "IBAN if present or empty string",
  "statement_period": "Month and Year, e.g. October 2026",
  "period_month": 10,
  "period_year": 2026,
  "opening_balance": 5000.00,
  "closing_balance": 5381.00,
  "currency": "EUR",
  "transactions": [
    {
      "date": "YYYY-MM-DD or DD.MM.YYYY",
      "description": "Clean description of payer, payee or reason",
      "debit": 119.00, // positive number if money left the account, or null
      "credit": null,   // positive number if money entered the account, or null
      "running_balance": 4881.00 // reported balance after this transaction
    }
  ]
}

Important Rules:
1. Debit represents money outgoing (Soll/Ausgaben).
2. Credit represents money incoming (Haben/Einnahmen).
3. Extract ALL transaction lines accurately.
4. If opening or closing balance is negative, use negative numbers.
`;

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
    const rawData = JSON.parse(cleanJson);

    // 2. Perform Running Balance Reconciliation Verification
    const reconciled = this.reconcileTransactions(
      rawData.opening_balance || 0,
      rawData.closing_balance || 0,
      rawData.transactions || []
    );

    const statementId = `stmt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullStatement: BankStatementData = {
      id: statementId,
      document_id: documentId,
      bank_name: rawData.bank_name || 'Deutsche Bank',
      account_number: rawData.account_number || 'DE1234567890',
      iban: rawData.iban || '',
      statement_period: rawData.statement_period || 'October 2026',
      period_month: rawData.period_month || 10,
      period_year: rawData.period_year || 2026,
      opening_balance: rawData.opening_balance || 0,
      closing_balance: rawData.closing_balance || 0,
      currency: rawData.currency || 'EUR',
      transactions: reconciled.transactions,
      total_debits: reconciled.totalDebits,
      total_credits: reconciled.totalCredits,
      is_reconciled: reconciled.isReconciled,
      reconciliation_error: reconciled.reconciliationError,
    };

    // 3. Detect Missing Periods
    fullStatement.missing_periods_alert = await this.checkMissingPeriods(
      fullStatement.account_number,
      fullStatement.period_year,
      fullStatement.period_month
    );

    // 4. Persist to PostgreSQL
    await this.saveToPostgres(fullStatement);

    return fullStatement;
  },

  // Running balance mathematical validation: Opening - Debits + Credits = Closing
  reconcileTransactions(openingBalance: number, closingBalance: number, rows: BankTransactionRow[]) {
    let currentBalance = openingBalance;
    let totalDebits = 0;
    let totalCredits = 0;
    let hasMismatch = false;
    let mismatchDetails = '';

    const validatedTransactions = rows.map((row, idx) => {
      const debit = row.debit ? Number(row.debit) : 0;
      const credit = row.credit ? Number(row.credit) : 0;

      totalDebits += debit;
      totalCredits += credit;
      currentBalance = Math.round((currentBalance - debit + credit) * 100) / 100;

      let isValid = true;
      if (row.running_balance !== null && row.running_balance !== undefined) {
        const diff = Math.abs(currentBalance - Number(row.running_balance));
        isValid = diff < 0.05; // 5 cents tolerance for rounding
        if (!isValid && !hasMismatch) {
          hasMismatch = true;
          mismatchDetails = `Row ${idx + 1} (${row.date}): Expected balance ${currentBalance.toFixed(2)} €, but bank reported ${Number(row.running_balance).toFixed(2)} €`;
        }
      }

      return {
        ...row,
        calculated_balance: currentBalance,
        is_valid_balance: isValid,
      };
    });

    const finalDiff = Math.abs(currentBalance - closingBalance);
    const isReconciled = !hasMismatch && finalDiff < 0.05;

    if (!isReconciled && !mismatchDetails) {
      mismatchDetails = `Total reconciliation difference: Opening (${openingBalance.toFixed(2)} €) - Debits (${totalDebits.toFixed(2)} €) + Credits (${totalCredits.toFixed(2)} €) = ${currentBalance.toFixed(2)} €, but Closing is ${closingBalance.toFixed(2)} €`;
    }

    return {
      transactions: validatedTransactions,
      totalDebits: Math.round(totalDebits * 100) / 100,
      totalCredits: Math.round(totalCredits * 100) / 100,
      isReconciled,
      reconciliationError: isReconciled ? undefined : mismatchDetails,
    };
  },

  // Missing statement month detection (e.g. Sept & Nov uploaded, but Oct missing)
  async checkMissingPeriods(accountNumber: string, _year: number, currentMonth: number): Promise<string[]> {
    try {
      const res = await pool.query(
        'SELECT statement_period FROM bank_statements WHERE account_number = $1',
        [accountNumber]
      );

      const existingPeriods = res.rows.map((r: any) => r.statement_period);
      const alerts: string[] = [];

      // Check if previous month is missing
      if (currentMonth > 1) {
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const prevMonth = monthNames[currentMonth - 1];
        const prevKey = `${prevMonth} ${_year}`;
        if (!existingPeriods.some((p: string) => p && p.toLowerCase().includes(prevMonth.toLowerCase()))) {
          alerts.push(`Statement for ${prevKey} appears to be missing for account ${accountNumber}.`);
        }
      }

      return alerts;
    } catch {
      return [];
    }
  },

  // Save parsed statement & rows into PostgreSQL
  async saveToPostgres(data: BankStatementData) {
    try {
      await pool.query(
        `INSERT INTO bank_statements (id, document_id, account_number, statement_period, opening_balance, closing_balance)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (document_id) DO UPDATE SET
           account_number = EXCLUDED.account_number,
           statement_period = EXCLUDED.statement_period,
           opening_balance = EXCLUDED.opening_balance,
           closing_balance = EXCLUDED.closing_balance`,
        [data.id, data.document_id, data.account_number, data.statement_period, data.opening_balance, data.closing_balance]
      );

      // Save transactions
      for (const row of data.transactions) {
        const rowId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await pool.query(
          `INSERT INTO bank_transactions (id, statement_id, date, description, debit, credit, running_balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [rowId, data.id, row.date, row.description, row.debit, row.credit, row.running_balance]
        );
      }
    } catch (err: any) {
      console.error('[PostgreSQL] Failed to save bank statement:', err);
    }
  },

  // Get all statements with transaction counts
  async getAllStatements() {
    try {
      const res = await pool.query(`
        SELECT 
          bs.id, bs.document_id, bs.account_number, bs.statement_period, 
          bs.opening_balance, bs.closing_balance, d.original_filename,
          COUNT(bt.id) as transaction_count
        FROM bank_statements bs
        LEFT JOIN documents d ON d.id = bs.document_id
        LEFT JOIN bank_transactions bt ON bt.statement_id = bs.id
        GROUP BY bs.id, bs.document_id, bs.account_number, bs.statement_period, bs.opening_balance, bs.closing_balance, d.original_filename
        ORDER BY bs.statement_period DESC
      `);
      return res.rows;
    } catch {
      return [];
    }
  },

  // Get single statement with all transactions
  async getStatementById(id: string) {
    const sRes = await pool.query('SELECT * FROM bank_statements WHERE id = $1', [id]);
    if (sRes.rows.length === 0) return null;

    const statement = sRes.rows[0];
    const tRes = await pool.query('SELECT * FROM bank_transactions WHERE statement_id = $1 ORDER BY date ASC', [id]);

    const reconciled = this.reconcileTransactions(
      Number(statement.opening_balance),
      Number(statement.closing_balance),
      tRes.rows
    );

    return {
      ...statement,
      transactions: reconciled.transactions,
      total_debits: reconciled.totalDebits,
      total_credits: reconciled.totalCredits,
      is_reconciled: reconciled.isReconciled,
      reconciliation_error: reconciled.reconciliationError,
    };
  }
};
