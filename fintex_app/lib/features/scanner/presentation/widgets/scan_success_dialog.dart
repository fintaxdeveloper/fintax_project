import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Confirmation dialog shown after a scan was uploaded successfully.
class ScanSuccessDialog extends StatelessWidget {
  final String title;
  final String filename;
  final String message;
  final VoidCallback onOk;

  const ScanSuccessDialog({
    super.key,
    required this.title,
    required this.filename,
    required this.message,
    required this.onOk,
  });

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      backgroundColor: AppColors.surface,
      title: Row(
        children: [
          const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 28),
          const SizedBox(width: 10),
          Flexible(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'File: $filename',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4),
          ),
        ],
      ),
      actions: [
        ElevatedButton(
          onPressed: onOk,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          ),
          child: const Text('OK', style: TextStyle(fontWeight: FontWeight.w800)),
        ),
      ],
    );
  }
}
