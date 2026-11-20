import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Green intro banner explaining WhatsApp document import.
class WhatsAppInfoBanner extends StatelessWidget {
  const WhatsAppInfoBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.whatsapp.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.whatsapp.withValues(alpha: 0.3)),
      ),
      child: const Row(
        children: [
          Text('💬', style: TextStyle(fontSize: 34)),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Über WhatsApp teilen (PDF S. 2)',
                  style: TextStyle(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Empfangene Dokumente oder Fotos direkt aus Chats in die FinTax Kanzlei-Ordner übernehmen.',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
