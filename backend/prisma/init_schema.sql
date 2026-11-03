-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'CLIENT', -- 'CLIENT', 'STAFF', 'ADMIN'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    two_factor_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Client Profiles
CREATE TABLE IF NOT EXISTS client_profiles (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    tax_number VARCHAR(128),
    vat_id VARCHAR(128),
    address TEXT,
    phone VARCHAR(64)
);

-- 3. Staff Assignments
CREATE TABLE IF NOT EXISTS staff_assignments (
    id VARCHAR(64) PRIMARY KEY,
    staff_user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    client_user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_user_id, client_user_id)
);

-- 4. Documents Table
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(64) PRIMARY KEY,
    client_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size INTEGER DEFAULT 0,
    file_hash VARCHAR(128),
    folder VARCHAR(128) DEFAULT 'General',
    status VARCHAR(64) DEFAULT 'NEEDS_REVIEW', -- 'UPLOADED', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'EXPORTED', 'REJECTED'
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Extracted Data Table
CREATE TABLE IF NOT EXISTS extracted_data (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
    document_type VARCHAR(64) DEFAULT 'INVOICE',
    supplier_name VARCHAR(255),
    invoice_number VARCHAR(128),
    invoice_date VARCHAR(64),
    net_amount NUMERIC(12, 2),
    vat_rate NUMERIC(6, 2),
    vat_amount NUMERIC(12, 2),
    total_amount NUMERIC(12, 2),
    currency VARCHAR(16) DEFAULT 'EUR',
    skr03_code VARCHAR(32),
    skr03_desc TEXT,
    confidence_score NUMERIC(5, 2),
    raw_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Validation Issues
CREATE TABLE IF NOT EXISTS validation_issues (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) REFERENCES documents(id) ON DELETE CASCADE,
    field VARCHAR(128) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(32) DEFAULT 'WARNING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) REFERENCES documents(id) ON DELETE CASCADE,
    staff_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL, -- 'APPROVED', 'CORRECTED', 'REJECTED'
    notes TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Bank Statements
CREATE TABLE IF NOT EXISTS bank_statements (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
    account_number VARCHAR(128),
    statement_period VARCHAR(128),
    opening_balance NUMERIC(12, 2),
    closing_balance NUMERIC(12, 2)
);

-- 9. Bank Transactions
CREATE TABLE IF NOT EXISTS bank_transactions (
    id VARCHAR(64) PRIMARY KEY,
    statement_id VARCHAR(64) REFERENCES bank_statements(id) ON DELETE CASCADE,
    date VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    debit NUMERIC(12, 2),
    credit NUMERIC(12, 2),
    running_balance NUMERIC(12, 2)
);

-- 10. Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(64) PRIMARY KEY,
    client_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    is_recurring BOOLEAN DEFAULT FALSE,
    status VARCHAR(64) DEFAULT 'PENDING',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Correspondence (Tax Letters)
CREATE TABLE IF NOT EXISTS correspondence (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
    letter_type VARCHAR(128),
    sender VARCHAR(255),
    deadline TIMESTAMP WITH TIME ZONE,
    ai_summary TEXT
);

-- 12. Payroll Submissions
CREATE TABLE IF NOT EXISTS payroll_submissions (
    id VARCHAR(64) PRIMARY KEY,
    client_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    period VARCHAR(32) NOT NULL,
    data_json TEXT,
    status VARCHAR(64) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Payslips
CREATE TABLE IF NOT EXISTS payslips (
    id VARCHAR(64) PRIMARY KEY,
    submission_id VARCHAR(64) REFERENCES payroll_submissions(id) ON DELETE SET NULL,
    employee_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    visible_to_client BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(128) NOT NULL,
    resource_id VARCHAR(128),
    ip_address VARCHAR(64),
    details_json TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Export History (Agenda SKR03)
CREATE TABLE IF NOT EXISTS export_history (
    id VARCHAR(64) PRIMARY KEY,
    staff_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    export_type VARCHAR(64) DEFAULT 'AGENDA_SKR03',
    file_path TEXT NOT NULL,
    document_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 17. Folder Templates
CREATE TABLE IF NOT EXISTS folder_templates (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    structure_json TEXT NOT NULL
);

-- Create Default Demo Users if not present
INSERT INTO users (id, email, password_hash, name, role)
VALUES 
    ('user_admin_1', 'admin@fintax.de', 'admin123', 'FinTax Administrator', 'ADMIN'),
    ('user_staff_1', 'accountant@fintax.de', 'staff123', 'Anna Schmidt (Senior Accountant)', 'STAFF'),
    ('user_client_1', 'client@mustermann.de', 'client123', 'Hans Mustermann GmbH', 'CLIENT')
ON CONFLICT (email) DO NOTHING;
