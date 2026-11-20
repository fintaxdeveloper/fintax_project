import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Dark translucent pill with a dropdown to pick the upload folder.
class ScanCategorySelector extends StatelessWidget {
  final String sectionLabel;
  final String value;
  final ValueChanged<String> onChanged;

  const ScanCategorySelector({
    super.key,
    required this.sectionLabel,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B).withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        children: [
          const Icon(Icons.folder_rounded, size: 18, color: AppColors.accentGold),
          const SizedBox(width: 8),
          Text('$sectionLabel: ', style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600)),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: value,
                dropdownColor: const Color(0xFF1E293B),
                style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                items: const [
                  DropdownMenuItem(value: '01_FiBu', child: Text('01_FiBu (Accounting)')),
                  DropdownMenuItem(value: '02_LoBu', child: Text('02_LoBu (Payroll)')),
                  DropdownMenuItem(value: '00_Schriftverkehr', child: Text('00_Schriftverkehr (Letters)')),
                  DropdownMenuItem(value: '00_Gruendung', child: Text('00_Gründung (Formation)')),
                ],
                onChanged: (val) {
                  if (val != null) onChanged(val);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
