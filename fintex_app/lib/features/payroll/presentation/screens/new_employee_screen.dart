import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/primary_action_button.dart';
import '../../../../models/todo_task.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../widgets/labeled_text_field.dart';

class NewEmployeeScreen extends StatefulWidget {
  final UserModel user;
  const NewEmployeeScreen({super.key, required this.user});

  @override
  State<NewEmployeeScreen> createState() => _NewEmployeeScreenState();
}

class _NewEmployeeScreenState extends State<NewEmployeeScreen> {
  final _nameController = TextEditingController();
  final _positionController = TextEditingController();
  final _emailController = TextEditingController();
  final _startDateController = TextEditingController(text: '01.11.2026');
  bool _submitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    _positionController.dispose();
    _emailController.dispose();
    _startDateController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    final position = _positionController.text.trim();
    if (name.isEmpty || position.isEmpty) {
      AppSnackbar.warning(context, 'Bitte Name und Position ausfüllen.');
      return;
    }

    setState(() => _submitting = true);
    final now = DateTime.now();
    final period = '${now.year}-${now.month.toString().padLeft(2, '0')}';
    final empCode = 'MA-${(now.millisecondsSinceEpoch % 1000).toString().padLeft(3, '0')}';

    final res = await ApiService.submitPayroll(
      clientId: widget.user.id,
      employeeName: name,
      submissionType: 'NEW_HIRE',
      period: period,
      data: {
        'position': position,
        'email': _emailController.text.trim(),
        'start_date': _startDateController.text.trim(),
        'employee_id': empCode,
      },
    );

    if (!mounted) return;
    setState(() => _submitting = false);

    if (res['success'] == true) {
      final emp = PayrollEmployee(
        id: 'emp_${now.millisecondsSinceEpoch}',
        name: name,
        position: position,
        employeeId: empCode,
        startDate: _startDateController.text.trim(),
        email: _emailController.text.trim().isNotEmpty ? _emailController.text.trim() : null,
      );
      Navigator.pop(context, emp);
    } else {
      AppSnackbar.error(context, res['error']?.toString() ?? 'Mitarbeiter konnte nicht gespeichert werden.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Neuer Mitarbeiter'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LabeledTextField(
              label: 'Vor- und Nachname *',
              controller: _nameController,
              hintText: 'z.B. Sabine Meyer',
            ),
            const SizedBox(height: 16),
            LabeledTextField(
              label: 'Position / Funktion *',
              controller: _positionController,
              hintText: 'z.B. Vertriebsassistenz',
            ),
            const SizedBox(height: 16),
            LabeledTextField(
              label: 'E-Mail Adresse',
              controller: _emailController,
              hintText: 'meyer@mustermann.de',
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 16),
            LabeledTextField(
              label: 'Eintrittsdatum',
              controller: _startDateController,
              prefixIcon: Icons.calendar_today,
            ),
            const SizedBox(height: 28),
            PrimaryActionButton(
              label: _submitting ? 'Wird gespeichert...' : 'Mitarbeiter anlegen',
              onPressed: _submitting ? () {} : _submit,
              backgroundColor: AppColors.sectionPayroll,
            ),
          ],
        ),
      ),
    );
  }
}
