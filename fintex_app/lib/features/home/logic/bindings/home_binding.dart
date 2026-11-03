import '../controllers/home_controller.dart';
import '../../repositories/home_repository.dart';

class HomeBinding {
  static HomeController createController() {
    return HomeController();
  }

  static HomeRepository createRepository() {
    return HomeRepository();
  }
}
