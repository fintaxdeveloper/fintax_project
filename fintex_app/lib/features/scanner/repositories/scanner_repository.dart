import '../../../services/api_service.dart';

class ScannerRepository {
  Future<Map<String, dynamic>> uploadDocument({
    required String filename,
    required String category,
    required String clientId,
    required List<int> bytes,
  }) async {
    return await ApiService.uploadSimulatedDocument(
      filename: filename,
      category: category,
      clientId: clientId,
      bytes: bytes,
    );
  }
}
