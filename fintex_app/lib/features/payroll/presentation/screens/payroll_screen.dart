import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/empty_state.dart';
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
  List<PayrollEmployee> _employees = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadEmployees();
  }

  Future<void> _loadEmployees() async {
    setState(() => _loading = true);
    final list = await ApiService.fetchPayrollEmployees(clientId: widget.user.id);
    if (!mounted) return;
    setState(() {
      _employees = list;
      _loading = false;
    });
  }

  Future<void> _openAddEmployee() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => NewEmployeeScreen(user: widget.user)),
    );
    if (result != null && result is PayrollEmployee) {
      if (!mounted) return;
      AppSnackbar.success(context, 'Mitarbeiter ${result.name} angelegt!');
      _loadEmployees();
    }
  }

  Future<void> _submitQuickPayroll(PayrollEmployee emp, String type, String label) async {
    final now = DateTime.now();
    final period = '${now.year}-${now.month.toString().padLeft(2, '0')}';
    final res = await ApiService.submitPayroll(
      clientId: widget.user.id,
      employeeName: emp.name,
      submissionType: type,
      period: period,
      data: {'position': emp.position, 'email': emp.email ?? '', 'note': label},
    );
    if (!mounted) return;
    if (res['success'] == true) {
      AppSnackbar.success(context, '$label für ${emp.name} übermittelt!');
      _loadEmployees();
    } else {
      AppSnackbar.error(context, res['error']?.toString() ?? 'Übermittlung fehlgeschlagen');
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
          _submitQuickPayroll(emp, 'SICK_NOTE', 'AU / Krankmeldung');
        },
        onTimesheet: () {
          Navigator.pop(ctx);
          _submitQuickPayroll(emp, 'HOURS_OVERTIME', 'Stundenzettel');
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
      body: RefreshIndicator(
        color: AppColors.sectionPayroll,
        onRefresh: _loadEmployees,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
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
                      value: '25. Mon.',
                      color: AppColors.warning,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  SectionTitle('Personalstamm (${_employees.length} Mitarbeiter)'),
                  TextButton.icon(
                    onPressed: _openAddEmployee,
                    icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                    label: const Text('Neu'),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator(color: AppColors.sectionPayroll)),
                )
              else if (_employees.isEmpty)
                const EmptyState(
                  icon: Icons.people_outline_rounded,
                  title: 'Noch keine Mitarbeiter eingereicht',
                  subtitle: 'Tippen Sie auf "Neuer Mitarbeiter", um Lohndaten an die Kanzlei zu senden.',
                )
              else
                ..._employees.map((emp) => EmployeeListTile(
                      employee: emp,
                      onTap: () => _showEmployeeDetails(emp),
                    )),
            ],
          ),
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
