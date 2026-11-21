import 'package:flutter/material.dart';
import '../../../../models/todo_task.dart';
import '../../repositories/payroll_repository.dart';

class PayrollController extends ChangeNotifier {
  final PayrollRepository _repository = PayrollRepository();

  List<PayrollEmployee> _employees = [];
  bool _isLoading = false;

  List<PayrollEmployee> get employees => _employees;
  bool get isLoading => _isLoading;

  Future<void> loadEmployees({String? clientId}) async {
    _isLoading = true;
    notifyListeners();
    _employees = await _repository.fetchEmployees(clientId: clientId);
    _isLoading = false;
    notifyListeners();
  }
}
