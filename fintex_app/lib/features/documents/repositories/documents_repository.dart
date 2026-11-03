import '../../../models/document_item.dart';
import '../../../services/api_service.dart';

class DocumentsRepository {
  Future<List<DocumentItem>> fetchDocuments() async {
    return await ApiService.fetchClientDocuments();
  }
}
