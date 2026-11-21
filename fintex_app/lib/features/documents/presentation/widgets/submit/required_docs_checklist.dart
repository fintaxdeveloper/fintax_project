import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';

class RequiredDocStatus {
  final String title;
  final String subtitle;
  final bool uploaded;
  const RequiredDocStatus(this.title, this.subtitle, this.uploaded);
}

/// 2-column grid of required documents with a Pending / Uploaded chip.
class RequiredDocsChecklist extends StatelessWidget {
  final List<RequiredDocStatus> items;
  final String pendingLabel;
  final String uploadedLabel;

  const RequiredDocsChecklist({
    super.key,
    required this.items,
    required this.pendingLabel,
    required this.uploadedLabel,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final itemWidth = (constraints.maxWidth - 10) / 2;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final item in items)
              SizedBox(width: itemWidth, child: _Tile(item, pendingLabel, uploadedLabel)),
          ],
        );
      },
    );
  }
}

class _Tile extends StatelessWidget {
  final RequiredDocStatus item;
  final String pendingLabel;
  final String uploadedLabel;

  const _Tile(this.item, this.pendingLabel, this.uploadedLabel);

  @override
  Widget build(BuildContext context) {
    final done = item.uploaded;
    final color = done ? AppColors.success : AppColors.textTertiary;

    return Container(
      constraints: const BoxConstraints(minHeight: 92),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: done ? AppColors.successLight.withValues(alpha: 0.5) : AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: done ? AppColors.success.withValues(alpha: 0.3) : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: done ? AppColors.successLight : AppColors.borderLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(done ? Icons.check_circle_rounded : Icons.schedule_rounded, size: 11, color: color),
                const SizedBox(width: 3),
                Text(
                  done ? uploadedLabel : pendingLabel,
                  style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            item.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 13,
              fontWeight: FontWeight.w700,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            item.subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11.5),
          ),
        ],
      ),
    );
  }
}
