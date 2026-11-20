import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Checkbox row for accepting the privacy policy. Tapping the text toggles too.
class PrivacyConsentTile extends StatelessWidget {
  final bool accepted;
  final ValueChanged<bool> onChanged;

  const PrivacyConsentTile({
    super.key,
    required this.accepted,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Checkbox(
            value: accepted,
            onChanged: (val) => onChanged(val ?? false),
          ),
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(!accepted),
              child: const Text(
                'Ich bestätige die Kenntnisnahme der Datenschutzerklärung von FinTax Consulting.',
                style: TextStyle(color: AppColors.textPrimary, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
