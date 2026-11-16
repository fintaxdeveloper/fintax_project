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

export interface BookingItem {
  amount: number;
  sh: 'S' | 'H';
  konto: string;
  gegenkonto: string;
  buCode: string;
  belegdatum: string;
  belegfeld1?: string;
  belegfeld2?: string;
  buchungstext: string;
  currency?: string;
  /** Qwen fallback classification metadata (only set for lines the deterministic rules could not map) */
  ai_category?: string;
  ai_confidence?: number;
  ai_reason?: string;
  ai_suggested_gegenkonto?: string;
  ai_suggested_bu?: string;
}

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
  payment_method?: 'cash' | 'bank_transfer';
  line_items_summary?: string;
  bookings?: BookingItem[];
  skr03_csv_file?: string;
  monthly_csv_file?: string;
  target_year?: string;
  target_month?: string;
  target_folder?: string;
  /** Bank statement opening / closing balance (positive = credit balance) for reconciliation */
  opening_balance?: number;
  closing_balance?: number;
  /** Review gate status of the month this document belongs to */
  review_blocked?: boolean;
  review_open_issues?: number;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export type DocumentCategory =
  | '00_Stammdaten'
  | '00_Schriftverkehr'
  | '01_FiBu'
  | '02_LoBu'
  | '03_Agenda';

export interface ExpiryInfo {
  has_expiry: boolean;
  expiry_date?: string; // YYYY-MM-DD
  formatted_date?: string; // DD.MM.YYYY
  issue_date?: string; // YYYY-MM-DD
  total_validity_days?: number;
  percentage_remaining?: number;
  is_expired?: boolean;
  days_until_expiry?: number;
  status?: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_EXPIRY';
  doc_title?: string;
  warning_message?: string;
}

export interface DocumentRecord {
  id: string;
  client_id?: string;
  category?: DocumentCategory;
  sub_types?: string[];
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
  expiry_date?: string;
  expiry_info?: ExpiryInfo;
  /** Set when one uploaded file contained several bills and was split into separate records */
  parent_document_id?: string;
  split_group_id?: string;
  split_index?: number;
  split_total?: number;
}

