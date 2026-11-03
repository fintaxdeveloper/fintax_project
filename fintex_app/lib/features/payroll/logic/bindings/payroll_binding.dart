import '../controllers/payroll_controller.dart';
import '../../repositories/payroll_repository.dart';

class PayrollBinding {
  static PayrollController createController() {
    return PayrollController();
  }

  static PayrollRepository createRepository() {
    return PayrollRepository();
  }
}
