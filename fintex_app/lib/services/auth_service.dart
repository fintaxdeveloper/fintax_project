import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import '../models/user_session.dart';

class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  static const String _sessionFileName = 'fintax_session.json';

  UserSession? _currentUser;
  String? _token;

  UserSession? get currentUser => _currentUser;
  String? get token => _token;
  bool get isLoggedIn => _currentUser != null && _token != null && _token!.isNotEmpty;

  Future<File> _sessionFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}${Platform.pathSeparator}$_sessionFileName');
  }

  /// Stores user in memory and persists session to device storage so reopening
  /// the app skips login and goes directly to the dashboard.
  void setUser(UserSession user) {
    _currentUser = user;
    _token = user.token;
    _persistSession(user);
  }

  Future<void> _persistSession(UserSession user) async {
    try {
      final file = await _sessionFile();
      final payload = jsonEncode({
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'clientNumber': user.clientNumber,
        'token': user.token,
        'role': user.role,
        'isFirstLogin': user.isFirstLogin,
        'companyName': user.companyName,
        'phone': user.phone,
        'city': user.city,
        'profileImage': user.profileImage,
      });
      await file.writeAsString(payload, flush: true);
    } catch (e) {
      debugPrint('[AuthService] Failed to persist session: $e');
    }
  }

  /// Restores a previously saved session from disk on app launch.
  Future<UserSession?> restoreSession() async {
    if (isLoggedIn) return _currentUser;
    try {
      final file = await _sessionFile();
      if (!await file.exists()) return null;
      final raw = await file.readAsString();
      if (raw.trim().isEmpty) return null;
      final data = jsonDecode(raw);
      if (data is! Map<String, dynamic>) return null;
      final savedToken = (data['token'] ?? '').toString();
      final savedId = (data['id'] ?? '').toString();
      if (savedToken.isEmpty || savedId.isEmpty) return null;

      final restored = UserSession(
        id: savedId,
        name: (data['name'] ?? 'Mandant').toString(),
        email: (data['email'] ?? '').toString(),
        clientNumber: (data['clientNumber'] ?? '').toString(),
        token: savedToken,
        role: (data['role'] ?? 'CLIENT').toString(),
        isFirstLogin: data['isFirstLogin'] == true,
        companyName: data['companyName']?.toString(),
        phone: data['phone']?.toString(),
        city: data['city']?.toString(),
        profileImage: data['profileImage']?.toString(),
      );
      _currentUser = restored;
      _token = restored.token;
      debugPrint('[AuthService] Session restored for ${restored.email} (${restored.role})');
      return restored;
    } catch (e) {
      debugPrint('[AuthService] Session restore error: $e');
      return null;
    }
  }

  void logout() {
    _currentUser = null;
    _token = null;
    _clearPersistedSession();
  }

  Future<void> _clearPersistedSession() async {
    try {
      final file = await _sessionFile();
      if (await file.exists()) {
        await file.delete();
      }
    } catch (e) {
      debugPrint('[AuthService] Failed to clear session: $e');
    }
  }
}
