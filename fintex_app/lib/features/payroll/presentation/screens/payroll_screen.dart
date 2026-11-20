import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/section_title.dart';
import '../../../../models/todo_task.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../widgets/employee_details_sheet.dart';
import '../widgets/employee_list_tile.dart';
import '../widgets/payroll_summary_box.dart';
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
      builder: (ctx) => EmployeeDetailsSheet(
        employee: emp,
        onSickNote: () {
          Navigator.pop(ctx);
          AppSnackbar.info(context, 'AU / Krankmeldung für ${emp.name} hochladen...');
        },
        onTimesheet: () {
          Navigator.pop(ctx);
          AppSnackbar.info(context, 'Stundenzettel für ${emp.name} hochladen...');
        },
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
            Row(
              children: [
                Expanded(
                  child: PayrollSummaryBox(
                    label: 'Mitarbeiter',
                    value: '${_employees.length}',
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: PayrollSummaryBox(
                    label: 'Aktiv',
                    value: '$activeCount',
                    color: AppColors.success,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: PayrollSummaryBox(
                    label: 'Frist LoBu',
                    value: '25. Nov',
                    color: AppColors.warning,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const SectionTitle('Personalstamm (4 Mitarbeiter)'),
                TextButton.icon(
                  onPressed: _openAddEmployee,
                  icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                  label: const Text('Neu'),
                ),
              ],
            ),
            const SizedBox(height: 8),

            ..._employees.map((emp) => EmployeeListTile(
                  employee: emp,
                  onTap: () => _showEmployeeDetails(emp),
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
