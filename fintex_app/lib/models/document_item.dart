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
    final ext = json['extracted_data'] ?? {};
    return DocumentItem(
      id: json['id'] ?? '',
      originalFilename: json['original_filename'] ?? 'Dokument.pdf',
      category: json['category'] ?? '01_FiBu',
      sectionName: json['sectionName'] ?? 'Finanzbuchhaltung',
      totalAmount: ext['total_amount'] != null ? (ext['total_amount'] as num).toDouble() : null,
      supplierName: ext['supplier_name'],
      invoiceNumber: ext['invoice_number'],
      date: ext['invoice_date'] ?? json['uploaded_at'] ?? '',
      status: json['status'] ?? 'PROCESSING',
      isDuplicate: json['is_duplicate'] ?? false,
      sizeBytes: json['size_bytes'] ?? 1024,
      mimeType: json['mime_type'],
    );
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
