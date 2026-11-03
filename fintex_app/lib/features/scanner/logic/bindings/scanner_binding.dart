import '../controllers/scanner_controller.dart';
import '../../repositories/scanner_repository.dart';

class ScannerBinding {
  static ScannerController createController() {
    return ScannerController();
  }

  static ScannerRepository createRepository() {
    return ScannerRepository();
  }
}
