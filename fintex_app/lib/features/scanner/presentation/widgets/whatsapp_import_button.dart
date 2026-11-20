import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Green WhatsApp-styled import button with loading spinner.
class WhatsAppImportButton extends StatelessWidget {
  final bool isLoading;
  final VoidCallback onPressed;

  const WhatsAppImportButton({
    super.key,
    required this.isLoading,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ElevatedButton.icon(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.whatsapp,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        icon: isLoading
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : const Icon(Icons.download_rounded),
        label: const Text(
          'In FinTax importieren & KI starten',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ),
    );
  }
}
