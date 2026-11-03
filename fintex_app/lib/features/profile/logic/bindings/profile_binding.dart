import '../controllers/profile_controller.dart';
import '../../repositories/profile_repository.dart';

class ProfileBinding {
  static ProfileController createController() {
    return ProfileController();
  }

  static ProfileRepository createRepository() {
    return ProfileRepository();
  }
}
