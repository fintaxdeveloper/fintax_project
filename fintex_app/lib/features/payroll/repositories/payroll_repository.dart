import '../../../models/todo_task.dart';
import '../../../services/api_service.dart';

class PayrollRepository {
  Future<List<PayrollEmployee>> fetchEmployees({String? clientId}) async {
    return await ApiService.fetchPayrollEmployees(clientId: clientId);
  }

  Future<Map<String, dynamic>> submitPayroll({
    required String clientId,
    required String employeeName,
    required String submissionType,
    required String period,
    Map<String, dynamic>? data,
  }) async {
    return await ApiService.submitPayroll(
      clientId: clientId,
      employeeName: employeeName,
      submissionType: submissionType,
      period: period,
      data: data,
    );
  }
}
