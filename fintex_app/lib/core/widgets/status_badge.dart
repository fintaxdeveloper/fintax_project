import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class StatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  final Color? backgroundColor;
  final IconData? icon;

  const StatusBadge({
    super.key,
    required this.label,
    required this.color,
    this.backgroundColor,
    this.icon,
  });

  factory StatusBadge.processing() => const StatusBadge(
        label: 'Verarbeitung',
        color: AppColors.primary,
        backgroundColor: AppColors.primaryLight,
        icon: Icons.hourglass_top_rounded,
      );

  factory StatusBadge.approved() => const StatusBadge(
        label: 'Genehmigt',
        color: AppColors.success,
        backgroundColor: AppColors.successLight,
        icon: Icons.check_circle_rounded,
      );

  factory StatusBadge.needsAttention() => const StatusBadge(
        label: 'Prüfung nötig',
        color: AppColors.warning,
        backgroundColor: AppColors.warningLight,
        icon: Icons.warning_rounded,
      );

  factory StatusBadge.exported() => const StatusBadge(
        label: 'Exportiert',
        color: AppColors.success,
        backgroundColor: AppColors.successLight,
        icon: Icons.cloud_done_rounded,
      );

  factory StatusBadge.active() => const StatusBadge(
        label: 'Aktiv',
        color: AppColors.success,
        backgroundColor: AppColors.successLight,
      );

  factory StatusBadge.inactive() => const StatusBadge(
        label: 'Inaktiv',
        color: AppColors.textTertiary,
        backgroundColor: AppColors.borderLight,
      );

  factory StatusBadge.fromStatus(String status) {
    switch (status.toUpperCase()) {
      case 'APPROVED':
        return StatusBadge.approved();
      case 'NEEDS_ATTENTION':
        return StatusBadge.needsAttention();
      case 'EXPORTED':
        return StatusBadge.exported();
      default:
        return StatusBadge.processing();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: backgroundColor ?? color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

