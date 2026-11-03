import '../../../models/todo_task.dart';
import '../../../services/api_service.dart';

class PayrollRepository {
  List<PayrollEmployee> getEmployees() {
    return ApiService.getDemoEmployees();
  }
}
