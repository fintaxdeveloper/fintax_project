import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/primary_action_button.dart';
import '../../../../models/todo_task.dart';
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

  @override
  void dispose() {
    _nameController.dispose();
    _positionController.dispose();
    _emailController.dispose();
    _startDateController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_nameController.text.trim().isEmpty || _positionController.text.trim().isEmpty) {
      return;
    }

    final emp = PayrollEmployee(
      id: 'emp_${DateTime.now().millisecondsSinceEpoch}',
      name: _nameController.text.trim(),
      position: _positionController.text.trim(),
      employeeId: 'MA-00${DateTime.now().second}',
      startDate: _startDateController.text.trim(),
      email: _emailController.text.trim().isNotEmpty ? _emailController.text.trim() : null,
    );

    Navigator.pop(context, emp);
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
              hintText: 'z.B. Vertiebsassistenz',
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
              label: 'Mitarbeiter anlegen',
              onPressed: _submit,
              backgroundColor: AppColors.sectionPayroll,
            ),
          ],
        ),
      ),
    );
  }
}
