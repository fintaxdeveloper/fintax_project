import 'package:flutter/material.dart';
// import '../../../models/todo_task.dart';
import '../../../../models/todo_task.dart';
import '../../repositories/payroll_repository.dart';

class PayrollController extends ChangeNotifier {
  final PayrollRepository _repository = PayrollRepository();

  List<PayrollEmployee> _employees = [];

  List<PayrollEmployee> get employees => _employees;

  void loadEmployees() {
    _employees = _repository.getEmployees();
    notifyListeners();
  }
}
