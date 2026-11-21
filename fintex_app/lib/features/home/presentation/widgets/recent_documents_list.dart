import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Processing state of a recently uploaded document.
enum RecentDocStatus { checked, processing, needsReview }

/// One row in [RecentDocumentsList].
class RecentDocument {
  final String name;
  final String category;
  final String time;
  final RecentDocStatus status;
  final bool isImage;
  final VoidCallback? onTap;

  const RecentDocument({
    required this.name,
    required this.category,
    required this.time,
    required this.status,
    this.isImage = false,
    this.onTap,
  });
}

/// "Recent documents" section: header with optional "View all" link and a
/// white card listing the latest uploads with their status.
class RecentDocumentsList extends StatelessWidget {
  final String title;
  final String? viewAllLabel;
  final VoidCallback? onViewAll;
  final List<RecentDocument> documents;
  final String emptyText;

  /// Labels for the three status chips, in enum order.
  final Map<RecentDocStatus, String> statusLabels;

  const RecentDocumentsList({
    super.key,
    required this.title,
    required this.documents,
    required this.statusLabels,
    required this.emptyText,
    this.viewAllLabel,
    this.onViewAll,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            if (viewAllLabel != null && onViewAll != null)
              TextButton(
                onPressed: onViewAll,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  visualDensity: VisualDensity.compact,
                ),
                child: Text(
                  viewAllLabel!,
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
            boxShadow: const [
              BoxShadow(color: Color(0x0A0F172A), blurRadius: 12, offset: Offset(0, 4)),
            ],
          ),
          child: documents.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(24),
                  child: Center(
                    child: Text(
                      emptyText,
                      style: const TextStyle(color: AppColors.textTertiary, fontSize: 13),
                    ),
                  ),
                )
              : Column(
                  children: [
                    for (int i = 0; i < documents.length; i++) ...[
                      _RecentDocumentTile(
                        doc: documents[i],
                        statusLabel: statusLabels[documents[i].status] ?? '',
                      ),
                      if (i < documents.length - 1)
                        const Divider(height: 1, indent: 68, endIndent: 16, color: AppColors.borderLight),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _RecentDocumentTile extends StatelessWidget {
  final RecentDocument doc;
  final String statusLabel;

  const _RecentDocumentTile({required this.doc, required this.statusLabel});

  @override
  Widget build(BuildContext context) {
    final (Color fg, Color bg, IconData statusIcon) = switch (doc.status) {
      RecentDocStatus.checked => (AppColors.success, AppColors.successLight, Icons.check_circle_rounded),
      RecentDocStatus.processing => (AppColors.blueIcon, AppColors.blueBox, Icons.autorenew_rounded),
      RecentDocStatus.needsReview => (AppColors.warning, AppColors.warningLight, Icons.error_outline_rounded),
    };

    final fileColor = doc.isImage ? AppColors.purpleIcon : AppColors.redText;
    final fileBg = doc.isImage ? AppColors.purpleBox : AppColors.redBox;

    return InkWell(
      onTap: doc.onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
        children: [
          // File type icon
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: fileBg,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              doc.isImage ? Icons.image_outlined : Icons.picture_as_pdf_outlined,
              color: fileColor,
              size: 20,
            ),
          ),
          const SizedBox(width: 14),

          // Name + category · time
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 13.5,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${doc.category} · ${doc.time}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11.5),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),

          // Status chip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(statusIcon, size: 12, color: fg),
                const SizedBox(width: 4),
                Text(
                  statusLabel,
                  style: TextStyle(color: fg, fontSize: 10.5, fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
        ],
      ),
      ),
    );
  }
}
