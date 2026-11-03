import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../models/todo_task.dart';
import '../../../authentication/models/user_model.dart';

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
            const Text('Vor- und Nachname *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary)),
            const SizedBox(height: 6),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(hintText: 'z.B. Sabine Meyer'),
            ),
            const SizedBox(height: 16),

            const Text('Position / Funktion *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary)),
            const SizedBox(height: 6),
            TextField(
              controller: _positionController,
              decoration: const InputDecoration(hintText: 'z.B. Vertiebsassistenz'),
            ),
            const SizedBox(height: 16),

            const Text('E-Mail Adresse', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary)),
            const SizedBox(height: 6),
            TextField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(hintText: 'meyer@mustermann.de'),
            ),
            const SizedBox(height: 16),

            const Text('Eintrittsdatum', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary)),
            const SizedBox(height: 6),
            TextField(
              controller: _startDateController,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.calendar_today, size: 18)),
            ),
            const SizedBox(height: 28),

            SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _submit,
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.sectionPayroll),
                child: const Text('Mitarbeiter anlegen', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
