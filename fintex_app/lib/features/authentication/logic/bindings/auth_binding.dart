import '../controllers/auth_controller.dart';
import '../../repositories/auth_repository.dart';

class AuthBinding {
  static AuthController createController() {
    return AuthController();
  }

  static AuthRepository createRepository() {
    return AuthRepository();
  }
}
