export type DocumentStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY_FOR_REVIEW'
  | 'NEEDS_ATTENTION'
  | 'APPROVED'
  | 'EXPORTED';

export type DocumentType =
  | 'PURCHASE_INVOICE'
  | 'SALES_INVOICE'
  | 'RECEIPT'
  | 'BANK_STATEMENT'
  | 'OTHER';

export interface ExtractedInvoiceData {
  document_type: DocumentType;
  supplier_name: string;
  supplier_tax_id?: string;
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD
  currency: string;
  net_amount: number;
  vat_rate_percent: number;
  vat_amount: number;
  total_amount: number;
  confidence_score: number;
  skr03_account_code?: string; // e.g. 4930 (Office supplies), 4980, etc.
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export interface DocumentRecord {
  id: string;
  client_id?: string;
  category?: '00_Schriftverkehr' | '01_FiBu' | '02_LoBu' | '03_Agenda';
  original_filename: string;
  stored_filename: string;
  file_path: string;
  relative_path?: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  file_checksum?: string;
  is_duplicate?: boolean;
  duplicate_of_id?: string;
  status: DocumentStatus;
  extracted_data?: ExtractedInvoiceData;
  validation_issues?: ValidationIssue[];
  staff_notes?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  exported_at?: string;
}

