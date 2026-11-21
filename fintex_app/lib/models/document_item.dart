class DocumentItem {
  final String id;
  final String originalFilename;
  final String category;
  final String sectionName;
  final double? totalAmount;
  final String? supplierName;
  final String? invoiceNumber;
  final String date;
  final String status;
  final bool isDuplicate;
  final int sizeBytes;
  final String? mimeType;

  DocumentItem({
    required this.id,
    required this.originalFilename,
    required this.category,
    required this.sectionName,
    this.totalAmount,
    this.supplierName,
    this.invoiceNumber,
    required this.date,
    required this.status,
    this.isDuplicate = false,
    required this.sizeBytes,
    this.mimeType,
  });

  factory DocumentItem.fromJson(Map<String, dynamic> json) {
    final ext = json['extracted_data'] is Map ? Map<String, dynamic>.from(json['extracted_data']) : <String, dynamic>{};
    final rawCat = (json['category'] ?? '01_FiBu').toString();
    final normalizedCat = _normalizeCategory(rawCat);
    return DocumentItem(
      id: (json['id'] ?? '').toString(),
      originalFilename: (json['original_filename'] ?? 'Dokument.pdf').toString(),
      category: normalizedCat,
      sectionName: (json['sectionName'] ?? _sectionNameFor(normalizedCat)).toString(),
      totalAmount: ext['total_amount'] != null ? (ext['total_amount'] as num).toDouble() : null,
      supplierName: ext['supplier_name']?.toString(),
      invoiceNumber: ext['invoice_number']?.toString(),
      date: (ext['invoice_date'] ?? json['uploaded_at'] ?? '').toString(),
      status: (json['status'] ?? 'PROCESSING').toString(),
      isDuplicate: json['is_duplicate'] == true,
      sizeBytes: json['size_bytes'] is num ? (json['size_bytes'] as num).toInt() : 1024,
      mimeType: json['mime_type']?.toString(),
    );
  }

  static String _normalizeCategory(String raw) {
    final lower = raw.toLowerCase();
    if (lower.contains('stammdaten') || lower.contains('gruendung') || lower.contains('gründung') || lower.contains('formation')) {
      return '00_Gruendung';
    }
    if (lower.contains('lobu') || lower.contains('lohn') || lower.contains('payroll') || lower.startsWith('02_')) {
      return '02_LoBu';
    }
    if (lower.contains('schrift') || lower.contains('corresp') || lower.startsWith('03_') || lower == '00_schriftverkehr') {
      return '00_Schriftverkehr';
    }
    return '01_FiBu';
  }

  static String _sectionNameFor(String cat) {
    switch (cat) {
      case '00_Gruendung':
        return 'Stammdaten';
      case '02_LoBu':
        return 'Lohnbuchhaltung';
      case '00_Schriftverkehr':
        return 'Schriftverkehr';
      default:
        return 'Finanzbuchhaltung';
    }
  }

  String get formattedSize {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1048576) return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
    return '${(sizeBytes / 1048576).toStringAsFixed(1)} MB';
  }
}

class MissingDocumentAlert {
  final String title;
  final String category;
  final String period;
  final String dueDate;
  final bool isOverdue;

  MissingDocumentAlert({
    required this.title,
    required this.category,
    required this.period,
    required this.dueDate,
    this.isOverdue = false,
  });
}
