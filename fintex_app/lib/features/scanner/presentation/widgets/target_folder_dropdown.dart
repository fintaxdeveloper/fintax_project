import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Bordered dropdown for choosing the FinTax folder to import into.
class TargetFolderDropdown extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const TargetFolderDropdown({
    super.key,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w700),
          items: const [
            DropdownMenuItem(value: '01_FiBu', child: Text('📁 01_FiBu (Finanzbuchhaltung)')),
            DropdownMenuItem(value: '02_LoBu', child: Text('👥 02_LoBu (Lohn & Personal)')),
            DropdownMenuItem(value: '00_Schriftverkehr', child: Text('🏛️ 00_Schriftverkehr (Finanzamt)')),
            DropdownMenuItem(value: '00_Gruendung', child: Text('📑 00_Gründung (Verträge)')),
          ],
          onChanged: (val) {
            if (val != null) onChanged(val);
          },
        ),
      ),
    );
  }
}
