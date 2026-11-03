import 'package:flutter/material.dart';
import '../../repositories/scanner_repository.dart';

class ScannerController extends ChangeNotifier {
  final ScannerRepository _repository = ScannerRepository();

  bool _isUploading = false;
  bool get isUploading => _isUploading;

  Future<bool> upload({
    required String filename,
    required String category,
    required String clientId,
    required List<int> bytes,
  }) async {
    _isUploading = true;
    notifyListeners();

    final result = await _repository.uploadDocument(
      filename: filename,
      category: category,
      clientId: clientId,
      bytes: bytes,
    );

    _isUploading = false;
    notifyListeners();

    return result['success'] == true;
  }
}
