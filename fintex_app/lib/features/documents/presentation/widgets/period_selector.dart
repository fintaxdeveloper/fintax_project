import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// "Billing period" label with a month dropdown.
class PeriodSelector extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const PeriodSelector({
    super.key,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        const Text(
          'Abrechnungszeitraum:',
          style: TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w700),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: value,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w700),
              items: const [
                DropdownMenuItem(value: '10_Oktober 2026', child: Text('10_Oktober 2026')),
                DropdownMenuItem(value: '09_September 2026', child: Text('09_September 2026')),
                DropdownMenuItem(value: '08_August 2026', child: Text('08_August 2026')),
              ],
              onChanged: (val) {
                if (val != null) onChanged(val);
              },
            ),
          ),
        ),
      ],
    );
  }
}
