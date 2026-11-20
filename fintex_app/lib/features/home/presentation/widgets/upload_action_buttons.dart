import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Primary "Scan with camera" button plus the secondary
/// "Choose file" / "From WhatsApp" buttons.
class UploadActionButtons extends StatelessWidget {
  final String scanLabel;
  final String chooseFileLabel;
  final String whatsAppLabel;
  final VoidCallback onScan;
  final VoidCallback onChooseFile;
  final VoidCallback onWhatsApp;

  const UploadActionButtons({
    super.key,
    required this.scanLabel,
    required this.chooseFileLabel,
    required this.whatsAppLabel,
    required this.onScan,
    required this.onChooseFile,
    required this.onWhatsApp,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          height: 54,
          child: ElevatedButton.icon(
            onPressed: onScan,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(27),
              ),
              elevation: 0,
            ),
            icon: const Icon(Icons.crop_free_rounded, size: 22),
            label: Text(
              scanLabel,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _SecondaryButton(label: chooseFileLabel, onPressed: onChooseFile)),
            const SizedBox(width: 12),
            Expanded(child: _SecondaryButton(label: whatsAppLabel, onPressed: onWhatsApp)),
          ],
        ),
      ],
    );
  }
}

class _SecondaryButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;

  const _SecondaryButton({required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: AppColors.surface,
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w800,
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}
