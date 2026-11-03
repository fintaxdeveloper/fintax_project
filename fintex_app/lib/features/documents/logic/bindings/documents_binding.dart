import '../controllers/documents_controller.dart';
import '../../repositories/documents_repository.dart';

class DocumentsBinding {
  static DocumentsController createController() {
    return DocumentsController();
  }

  static DocumentsRepository createRepository() {
    return DocumentsRepository();
  }
}
