import '../../../services/api_service.dart';
import '../models/user_model.dart';

class AuthRepository {
  Future<Map<String, dynamic>> login(String identifier, String password) async {
    return await ApiService.login(identifier, password);
  }

  void logout() {
    // Perform logout cleanup logic if required
  }
}
