import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../../../models/todo_task.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import 'new_employee_screen.dart';

class PayrollScreen extends StatefulWidget {
  final UserModel user;
  const PayrollScreen({super.key, required this.user});

  @override
  State<PayrollScreen> createState() => _PayrollScreenState();
}

class _PayrollScreenState extends State<PayrollScreen> {
  late List<PayrollEmployee> _employees;

  @override
  void initState() {
    super.initState();
    _employees = ApiService.getDemoEmployees();
  }

  void _openAddEmployee() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => NewEmployeeScreen(user: widget.user)),
    );
    if (result != null && result is PayrollEmployee) {
      if (!mounted) return;
      setState(() => _employees.insert(0, result));
      AppSnackbar.success(context, 'Mitarbeiter ${result.name} angelegt!');
    }
  }

  void _showEmployeeDetails(PayrollEmployee emp) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
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
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: AppColors.sectionPayroll.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Center(
                    child: Text(
                      emp.initials,
                      style: const TextStyle(
                        color: AppColors.sectionPayroll,
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(emp.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: AppColors.textPrimary)),
                      const SizedBox(height: 2),
                      Text('${emp.position} • ${emp.employeeId}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                    ],
                  ),
                ),
                StatusBadge(
                  label: emp.isActive ? 'Aktiv' : 'Inaktiv',
                  color: emp.isActive ? AppColors.success : AppColors.textTertiary,
                  backgroundColor: emp.isActive ? AppColors.successLight : AppColors.borderLight,
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Divider(),
            const SizedBox(height: 12),
            _infoRow('E-Mail', emp.email ?? '—'),
            _infoRow('Eintrittsdatum', emp.startDate),
            _infoRow('Lohnsteuerabzug', 'Klasse 1 (Elektronisch via ELStAM)'),
            _infoRow('Krankenkasse', 'Techniker Krankenkasse (TK)'),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Navigator.pop(ctx);
                      AppSnackbar.info(context, 'AU / Krankmeldung für ${emp.name} hochladen...');
                    },
                    icon: const Icon(Icons.sick_rounded, size: 18),
                    label: const Text('Krankmeldung'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.pop(ctx);
                      AppSnackbar.info(context, 'Stundenzettel für ${emp.name} hochladen...');
                    },
                    icon: const Icon(Icons.upload_file_rounded, size: 18),
                    label: const Text('Stundenzettel'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
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

  @override
  Widget build(BuildContext context) {
    final activeCount = _employees.where((e) => e.isActive).length;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Lohnbuchhaltung (LoBu)'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Summary Cards
            Row(
              children: [
                Expanded(
                  child: _SummaryBox(
                    label: 'Mitarbeiter',
                    value: '${_employees.length}',
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryBox(
                    label: 'Aktiv',
                    value: '$activeCount',
                    color: AppColors.success,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SummaryBox(
                    label: 'Frist LoBu',
                    value: '25. Nov',
                    color: AppColors.warning,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Section Title & Add Action
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Personalstamm (4 Mitarbeiter)',
                  style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 15),
                ),
                TextButton.icon(
                  onPressed: _openAddEmployee,
                  icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                  label: const Text('Neu'),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Employee List
            ..._employees.map((emp) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
                boxShadow: const [BoxShadow(color: AppColors.shadowLight, blurRadius: 8, offset: Offset(0, 2))],
              ),
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                onTap: () => _showEmployeeDetails(emp),
                leading: Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: AppColors.sectionPayroll.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Center(
                    child: Text(
                      emp.initials,
                      style: const TextStyle(
                        color: AppColors.sectionPayroll,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ),
                title: Text(
                  emp.name,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary),
                ),
                subtitle: Text(
                  '${emp.position} • Eintritt: ${emp.startDate}',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
                trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary),
              ),
            )),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddEmployee,
        backgroundColor: AppColors.sectionPayroll,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.person_add_rounded),
        label: const Text('Neuer Mitarbeiter', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _SummaryBox extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _SummaryBox({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
        boxShadow: const [BoxShadow(color: AppColors.shadowLight, blurRadius: 6, offset: Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 18),
          ),
        ],
      ),
    );
  }
}
