import 'package:flutter/material.dart';
import '../../models/user_model.dart';
import '../../repositories/auth_repository.dart';
import '../../../../services/auth_service.dart';

class AuthController extends ChangeNotifier {
  final AuthRepository _repository = AuthRepository();

  bool _isLoading = false;
  String? _errorMessage;
  UserModel? _currentUser;

  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  UserModel? get currentUser => _currentUser;

  Future<bool> login(String identifier, String password) async {
    if (identifier.trim().isEmpty || password.trim().isEmpty) {
      _errorMessage = 'Bitte alle Felder ausfüllen.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    final res = await _repository.login(identifier.trim(), password.trim());
    _isLoading = false;

    if (res['success'] == true && res['user'] != null) {
      _currentUser = res['user'] as UserModel;
      AuthService.instance.setUser(_currentUser!);
      notifyListeners();
      return true;
    } else {
      _errorMessage = res['error'] ?? 'Ungültige Anmeldedaten.';
      notifyListeners();
      return false;
    }
  }

  void logout() {
    _repository.logout();
    AuthService.instance.logout();
    _currentUser = null;
    notifyListeners();
  }
}
