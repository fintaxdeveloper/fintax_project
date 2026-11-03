import '../models/user_session.dart';

class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  UserSession? _currentUser;
  String? _token;

  UserSession? get currentUser => _currentUser;
  String? get token => _token;
  bool get isLoggedIn => _currentUser != null;

  void setUser(UserSession user) {
    _currentUser = user;
    _token = user.token;
  }

  void logout() {
    _currentUser = null;
    _token = null;
  }
}

