import { pool } from './pgClient.js';

export interface PayrollSubmission {
  id: string;
  client_id: string;
  employee_name: string;
  submission_type: 'NEW_HIRE' | 'HOURS_OVERTIME' | 'SICK_NOTE' | 'BONUS';
  period: string; // e.g. "2026-10"
  data_json: any;
  status: 'SUBMITTED' | 'VERIFIED' | 'PROCESSED';
  created_at: string;
  staff_notes?: string;
}

export interface PayslipRecord {
  id: string;
  submission_id?: string;
  client_id: string;
  employee_name: string;
  period: string; // e.g. "2026-10"
  gross_salary: number;
  net_salary: number;
  tax_deduction: number;
  social_security: number;
  tax_class: string;
  visible_to_client: boolean;
  created_at: string;
}

export const payrollService = {
  // Ensure tables exist in PostgreSQL
  async initTables() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS payroll_submissions (
          id VARCHAR(64) PRIMARY KEY,
          client_id VARCHAR(64) NOT NULL,
          employee_name VARCHAR(255) NOT NULL,
          submission_type VARCHAR(32) NOT NULL,
          period VARCHAR(16) NOT NULL,
          data_json JSONB NOT NULL,
          status VARCHAR(32) DEFAULT 'SUBMITTED',
          staff_notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS payslips (
          id VARCHAR(64) PRIMARY KEY,
          submission_id VARCHAR(64),
          client_id VARCHAR(64) NOT NULL,
          employee_name VARCHAR(255) NOT NULL,
          period VARCHAR(16) NOT NULL,
          gross_salary NUMERIC(12, 2) NOT NULL,
          net_salary NUMERIC(12, 2) NOT NULL,
          tax_deduction NUMERIC(12, 2) NOT NULL,
          social_security NUMERIC(12, 2) NOT NULL,
          tax_class VARCHAR(8) DEFAULT 'I',
          visible_to_client BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('[PostgreSQL] Payroll tables initialized.');
    } catch (err) {
      console.error('[PostgreSQL] Failed to initialize payroll tables:', err);
    }
  },

  // Submit new payroll item (by client)
  async createSubmission(
    clientId: string,
    employeeName: string,
    submissionType: PayrollSubmission['submission_type'],
    period: string,
    data: any
  ): Promise<PayrollSubmission> {
    await this.initTables();
    const id = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const query = `
      INSERT INTO payroll_submissions (id, client_id, employee_name, submission_type, period, data_json, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED', CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await pool.query(query, [id, clientId, employeeName, submissionType, period, JSON.stringify(data)]);
    return res.rows[0];
  },

  // Get submissions (for staff or filtered for client)
  async getSubmissions(clientId?: string): Promise<PayrollSubmission[]> {
    await this.initTables();
    let query = 'SELECT * FROM payroll_submissions ';
    const params: any[] = [];
    if (clientId) {
      query += 'WHERE client_id = $1 ';
      params.push(clientId);
    }
    query += 'ORDER BY created_at DESC;';
    const res = await pool.query(query, params);
    return res.rows;
  },

  // Staff approves submission and issues/finalizes monthly payslip
  async approveSubmission(submissionId: string, staffNotes?: string): Promise<{ submission: PayrollSubmission; payslip: PayslipRecord }> {
    await this.initTables();
    // 1. Update submission status
    const updateQuery = `
      UPDATE payroll_submissions 
      SET status = 'PROCESSED', staff_notes = $1 
      WHERE id = $2 
      RETURNING *;
    `;
    const subRes = await pool.query(updateQuery, [staffNotes || 'Von Steuerberater geprüft und abgerechnet.', submissionId]);
    if (subRes.rows.length === 0) {
      throw new Error(`Submission ${submissionId} not found`);
    }
    const sub: PayrollSubmission = subRes.rows[0];

    // 2. Generate corresponding payslip calculation
    const rawData = typeof sub.data_json === 'string' ? JSON.parse(sub.data_json) : sub.data_json;
    const gross = Number(rawData.gross_salary || rawData.base_salary || 3850);
    // Standard German Tax & SV estimation (approx 18% Lohnsteuer, 20% Sozialversicherung)
    const tax = Math.round(gross * 0.18 * 100) / 100;
    const sv = Math.round(gross * 0.205 * 100) / 100;
    const net = Math.round((gross - tax - sv) * 100) / 100;

    const payslipId = `slip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payslipQuery = `
      INSERT INTO payslips (id, submission_id, client_id, employee_name, period, gross_salary, net_salary, tax_deduction, social_security, tax_class, visible_to_client)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
      RETURNING *;
    `;
    const slipRes = await pool.query(payslipQuery, [
      payslipId,
      sub.id,
      sub.client_id,
      sub.employee_name,
      sub.period,
      gross,
      net,
      tax,
      sv,
      rawData.tax_class || 'I',
    ]);

    return {
      submission: sub,
      payslip: slipRes.rows[0],
    };
  },

  // Get payslips (filtered for client)
  async getPayslips(clientId?: string): Promise<PayslipRecord[]> {
    await this.initTables();
    let query = 'SELECT * FROM payslips ';
    const params: any[] = [];
    if (clientId) {
      query += 'WHERE client_id = $1 ';
      params.push(clientId);
    }
    query += 'ORDER BY period DESC, employee_name ASC;';
    const res = await pool.query(query, params);
    return res.rows;
  },

  // Seed demo German payroll cases (PDF Page 9)
  async seedDemoData() {
    await this.initTables();
    const demoItems = [
      {
        client_id: 'user_client_1',
        employee_name: 'Maximilian Müller',
        submission_type: 'NEW_HIRE' as const,
        period: '2026-10',
        data: {
          job_title: 'Senior Software Engineer',
          start_date: '2026-10-01',
          gross_salary: 5400.0,
          tax_class: 'I',
          tax_id: '12 345 678 901',
          social_sec_no: '15 070489 M 052',
          health_insurance: 'Techniker Krankenkasse (TK)',
          iban: 'DE44 7001 0080 0123 4567 89',
        },
        status: 'SUBMITTED' as const,
      },
      {
        client_id: 'user_client_1',
        employee_name: 'Sophie Becker',
        submission_type: 'HOURS_OVERTIME' as const,
        period: '2026-10',
        data: {
          job_title: 'Projektmanagerin',
          base_salary: 4100.0,
          regular_hours: 168,
          overtime_hours: 14.5,
          overtime_rate: 32.5,
          bonus: 250.0,
          gross_salary: 4821.25,
          notes: 'Wochenendarbeit Go-Live Mandantenportal',
        },
        status: 'SUBMITTED' as const,
      },
      {
        client_id: 'user_client_1',
        employee_name: 'Florian Wagner',
        submission_type: 'SICK_NOTE' as const,
        period: '2026-10',
        data: {
          job_title: 'Buchhalter & Sachbearbeiter',
          gross_salary: 3200.0,
          sick_from: '2026-10-12',
          sick_to: '2026-10-16',
          days_count: 5,
          continued_pay: true, // Entgeltfortzahlung im Krankheitsfall (EFZG)
          eAu_retrieved: true,
          notes: 'Elektronische Arbeitsunfähigkeitsbescheinigung (eAU) bestätigt',
        },
        status: 'VERIFIED' as const,
      },
    ];

    const inserted: PayrollSubmission[] = [];
    for (const item of demoItems) {
      const id = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const res = await pool.query(
        `INSERT INTO payroll_submissions (id, client_id, employee_name, submission_type, period, data_json, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *;`,
        [id, item.client_id, item.employee_name, item.submission_type, item.period, JSON.stringify(item.data), item.status]
      );
      inserted.push(res.rows[0]);
    }

    // Seed one already approved historical payslip
    await pool.query(
      `INSERT INTO payslips (id, client_id, employee_name, period, gross_salary, net_salary, tax_deduction, social_security, tax_class, visible_to_client)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
       ON CONFLICT (id) DO NOTHING;`,
      ['slip_hist_sep2026_01', 'user_client_1', 'Maximilian Müller', '2026-09', 5400.0, 3290.45, 1025.10, 1084.45, 'I']
    );

    return inserted;
  },
};
