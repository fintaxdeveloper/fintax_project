import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../../../models/todo_task.dart';
import 'employee_avatar.dart';

/// Bottom sheet with an employee's details and upload shortcuts.
class EmployeeDetailsSheet extends StatelessWidget {
  final PayrollEmployee employee;
  final VoidCallback onSickNote;
  final VoidCallback onTimesheet;

  const EmployeeDetailsSheet({
    super.key,
    required this.employee,
    required this.onSickNote,
    required this.onTimesheet,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              EmployeeAvatar(
                initials: employee.initials,
                size: 52,
                radius: 16,
                fontSize: 18,
                backgroundAlpha: 0.15,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(employee.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: AppColors.textPrimary)),
                    const SizedBox(height: 2),
                    Text('${employee.position} • ${employee.employeeId}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  ],
                ),
              ),
              StatusBadge(
                label: employee.isActive ? 'Aktiv' : 'Inaktiv',
                color: employee.isActive ? AppColors.success : AppColors.textTertiary,
                backgroundColor: employee.isActive ? AppColors.successLight : AppColors.borderLight,
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Divider(),
          const SizedBox(height: 12),
          _InfoRow(label: 'E-Mail', value: employee.email ?? '—'),
          _InfoRow(label: 'Eintrittsdatum', value: employee.startDate),
          const _InfoRow(label: 'Lohnsteuerabzug', value: 'Klasse 1 (Elektronisch via ELStAM)'),
          const _InfoRow(label: 'Krankenkasse', value: 'Techniker Krankenkasse (TK)'),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onSickNote,
                  icon: const Icon(Icons.sick_rounded, size: 18),
                  label: const Text('Krankmeldung'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onTimesheet,
                  icon: const Icon(Icons.upload_file_rounded, size: 18),
                  label: const Text('Stundenzettel'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          Text(value, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      ),
    );
  }
}
