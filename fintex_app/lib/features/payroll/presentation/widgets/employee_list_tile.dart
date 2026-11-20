import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../models/todo_task.dart';
import 'employee_avatar.dart';

/// Card row for one employee in the payroll staff list.
class EmployeeListTile extends StatelessWidget {
  final PayrollEmployee employee;
  final VoidCallback onTap;

  const EmployeeListTile({
    super.key,
    required this.employee,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
        boxShadow: const [BoxShadow(color: AppColors.shadowLight, blurRadius: 8, offset: Offset(0, 2))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        onTap: onTap,
        leading: EmployeeAvatar(initials: employee.initials),
        title: Text(
          employee.name,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary),
        ),
        subtitle: Text(
          '${employee.position} • Eintritt: ${employee.startDate}',
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
        ),
        trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary),
      ),
    );
  }
}
