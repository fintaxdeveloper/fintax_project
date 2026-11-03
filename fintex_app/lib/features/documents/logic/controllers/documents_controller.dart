import 'package:flutter/material.dart';
import '../../../models/document_item.dart';
import '../../repositories/documents_repository.dart';

class DocumentsController extends ChangeNotifier {
  final DocumentsRepository _repository = DocumentsRepository();

  List<DocumentItem> _documents = [];
  bool _isLoading = false;

  List<DocumentItem> get documents => _documents;
  bool get isLoading => _isLoading;

  Future<void> loadDocuments() async {
    _isLoading = true;
    notifyListeners();

    _documents = await _repository.fetchDocuments();
    _isLoading = false;
    notifyListeners();
  }
}
