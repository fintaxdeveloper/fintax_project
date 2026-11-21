import '../../../services/api_service.dart';
import '../../../services/auth_service.dart';

class AuthRepository {
  Future<Map<String, dynamic>> login(String identifier, String password) async {
    return await ApiService.login(identifier, password);
  }

  Future<Map<String, dynamic>> verifyOtp(String tempToken, String otp) async {
    return await ApiService.verifyOtp(tempToken, otp);
  }

  Future<Map<String, dynamic>> resendOtp(String tempToken) async {
    return await ApiService.resendOtp(tempToken);
  }

  Future<Map<String, dynamic>> changePassword({
    required String userId,
    required String currentPassword,
    required String newPassword,
  }) async {
    return await ApiService.changePassword(
      userId: userId,
      currentPassword: currentPassword,
      newPassword: newPassword,
    );
  }

  Future<Map<String, dynamic>> acceptPrivacy(String userId) async {
    return await ApiService.acceptPrivacy(userId);
  }

  void logout() {
    AuthService.instance.logout();
  }
}
