import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/user_session.dart';
import '../models/document_item.dart';
import '../models/todo_task.dart';
import '../core/constants/app_constants.dart';
import 'auth_service.dart';

class ApiService {
  static const String baseUrl = AppConstants.apiBaseUrl;

  static Map<String, String> _authHeaders({bool jsonContent = true}) {
    final headers = <String, String>{};
    if (jsonContent) {
      headers['Content-Type'] = 'application/json';
    }
    final token = AuthService.instance.token;
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  // ---------------------------------------------------------------------------
  // CENTRALIZED HTTP WRAPPERS WITH FULL REQUEST & RESPONSE CONSOLE LOGGING
  // ---------------------------------------------------------------------------
  static void _logRequest(String method, Uri uri, {Object? body}) {
    debugPrint('================ API REQUEST ================');
    debugPrint('[$method] $uri');
    if (body != null) {
      debugPrint('Request Body: $body');
    }
  }

  static void _logResponse(String method, Uri uri, int statusCode, String body, int elapsedMs) {
    debugPrint('---------------- API RESPONSE ---------------');
    debugPrint('[$method] $uri | Status: $statusCode (${elapsedMs}ms)');
    debugPrint('Response: $body', wrapWidth: 1024);
    debugPrint('=============================================');
  }

  static void _logError(String method, Uri uri, Object error) {
    debugPrint('================ API ERROR ==================');
    debugPrint('[$method] $uri');
    debugPrint('Error: $error');
    debugPrint('=============================================');
  }

  static Future<http.Response> _get(
    Uri uri, {
    Map<String, String>? headers,
    Duration timeout = const Duration(seconds: 15),
    bool isBinary = false,
  }) async {
    final sw = Stopwatch()..start();
    _logRequest('GET', uri);
    try {
      final res = await http.get(uri, headers: headers).timeout(timeout);
      sw.stop();
      final bodyPreview = isBinary
          ? '<Binary ${res.bodyBytes.length} bytes, content-type: ${res.headers['content-type']}>'
          : res.body;
      _logResponse('GET', uri, res.statusCode, bodyPreview, sw.elapsedMilliseconds);
      return res;
    } catch (e) {
      sw.stop();
      _logError('GET', uri, e);
      rethrow;
    }
  }

  static Future<http.Response> _post(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final sw = Stopwatch()..start();
    _logRequest('POST', uri, body: body);
    try {
      final res = await http.post(uri, headers: headers, body: body).timeout(timeout);
      sw.stop();
      _logResponse('POST', uri, res.statusCode, res.body, sw.elapsedMilliseconds);
      return res;
    } catch (e) {
      sw.stop();
      _logError('POST', uri, e);
      rethrow;
    }
  }

  static Future<http.Response> _put(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final sw = Stopwatch()..start();
    _logRequest('PUT', uri, body: body);
    try {
      final res = await http.put(uri, headers: headers, body: body).timeout(timeout);
      sw.stop();
      _logResponse('PUT', uri, res.statusCode, res.body, sw.elapsedMilliseconds);
      return res;
    } catch (e) {
      sw.stop();
      _logError('PUT', uri, e);
      rethrow;
    }
  }

  static Future<http.Response> _delete(
    Uri uri, {
    Map<String, String>? headers,
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final sw = Stopwatch()..start();
    _logRequest('DELETE', uri);
    try {
      final res = await http.delete(uri, headers: headers).timeout(timeout);
      sw.stop();
      _logResponse('DELETE', uri, res.statusCode, res.body, sw.elapsedMilliseconds);
      return res;
    } catch (e) {
      sw.stop();
      _logError('DELETE', uri, e);
      rethrow;
    }
  }

  static Future<http.Response> _sendMultipart(
    http.MultipartRequest request, {
    Duration timeout = const Duration(minutes: 5),
  }) async {
    final sw = Stopwatch()..start();
    _logRequest(
      'POST (MULTIPART)',
      request.url,
      body: 'fields=${request.fields}, files=${request.files.map((f) => '${f.filename} (${f.length}B)').toList()}',
    );
    try {
      final streamed = await request.send().timeout(timeout);
      final res = await http.Response.fromStream(streamed).timeout(timeout);
      sw.stop();
      _logResponse('POST (MULTIPART)', request.url, res.statusCode, res.body, sw.elapsedMilliseconds);
      return res;
    } catch (e) {
      sw.stop();
      _logError('POST (MULTIPART)', request.url, e);
      rethrow;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. HEALTH CHECK
  // ---------------------------------------------------------------------------
  static Future<bool> checkHealth() async {
    try {
      final res = await _get(
        Uri.parse('$baseUrl/health'),
        timeout: const Duration(seconds: 8),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. AUTHENTICATION (Login, 2FA OTP, Profile, Change Password, Privacy)
  // ---------------------------------------------------------------------------
  static Future<Map<String, dynamic>> login(String identifier, String password) async {
    try {
      final res = await _post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'identifier': identifier, 'password': password}),
      );

      final data = jsonDecode(res.body);
      if (res.statusCode == 200) {
        if (data['requires2FA'] == true) {
          return {
            'success': true,
            'requires2FA': true,
            'tempToken': data['tempToken'],
            'maskedEmail': data['maskedEmail'],
            'demoOtp': data['demoOtp'],
            'message': data['message'],
          };
        }
        return {
          'success': true,
          'requires2FA': false,
          'user': UserSession.fromJson(data['user'] ?? {}, data['token'] ?? ''),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'error': data['error'] ?? 'Anmeldung fehlgeschlagen (${res.statusCode})',
        };
      }
    } catch (e) {
      return {'success': false, 'error': 'Verbindungsfehler zum Server: $e'};
    }
  }

  static Future<Map<String, dynamic>> verifyOtp(String tempToken, String otp) async {
    try {
      final res = await _post(
        Uri.parse('$baseUrl/auth/verify-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'tempToken': tempToken, 'otp': otp}),
      );

      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['user'] != null) {
        return {
          'success': true,
          'user': UserSession.fromJson(data['user'], data['token'] ?? ''),
          'message': data['message'],
        };
      }
      return {'success': false, 'error': data['error'] ?? 'OTP-Verifizierung fehlgeschlagen'};
    } catch (e) {
      return {'success': false, 'error': 'Verbindungsfehler: $e'};
    }
  }

  static Future<Map<String, dynamic>> resendOtp(String tempToken) async {
    try {
      final res = await _post(
        Uri.parse('$baseUrl/auth/resend-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'tempToken': tempToken}),
      );

      final data = jsonDecode(res.body);
      if (res.statusCode == 200) {
        return {
          'success': true,
          'demoOtp': data['demoOtp'],
          'message': data['message'],
        };
      }
      return {'success': false, 'error': data['error'] ?? 'Code konnte nicht erneut gesendet werden'};
    } catch (e) {
      return {'success': false, 'error': 'Verbindungsfehler: $e'};
    }
  }

  static Future<Map<String, dynamic>?> fetchProfile(String userId) async {
    try {
      final res = await _get(
        Uri.parse('$baseUrl/auth/profile?userId=${Uri.encodeComponent(userId)}'),
        headers: _authHeaders(),
        timeout: const Duration(seconds: 10),
      );
      if (res.statusCode == 200) {
        return Map<String, dynamic>.from(jsonDecode(res.body));
      }
    } catch (_) {}
    return null;
  }

  static Future<Map<String, dynamic>> updateProfile({
    String? name,
    String? phone,
    String? city,
  }) async {
    try {
      final res = await _put(
        Uri.parse('$baseUrl/auth/profile'),
        headers: _authHeaders(),
        body: jsonEncode({
          if (name != null) 'name': name,
          if (phone != null) 'phone': phone,
          if (city != null) 'city': city,
        }),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        final currentToken = AuthService.instance.token ?? '';
        final updatedUser = data['user'] is Map<String, dynamic>
            ? UserSession.fromJson(data['user'], currentToken)
            : null;
        if (updatedUser != null) {
          AuthService.instance.setUser(updatedUser);
        }
        return {'success': true, 'user': updatedUser, 'message': data['message']};
      }
      return {'success': false, 'error': data['error'] ?? 'Profil konnte nicht aktualisiert werden'};
    } catch (e) {
      return {'success': false, 'error': 'Verbindungsfehler: $e'};
    }
  }

  static Future<Map<String, dynamic>> uploadProfileAvatar({
    required String filename,
    required List<int> bytes,
  }) async {
    try {
      final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/auth/profile/avatar'));
      request.headers.addAll(_authHeaders(jsonContent: false));
      request.files.add(http.MultipartFile.fromBytes('avatar', bytes, filename: filename));
      final response = await _sendMultipart(request, timeout: const Duration(seconds: 45));
      final data = jsonDecode(response.body);
      final ok = (response.statusCode == 200 || response.statusCode == 201) && data['success'] == true;
      if (ok) {
        final currentToken = AuthService.instance.token ?? '';
        final updatedUser = data['user'] is Map<String, dynamic>
            ? UserSession.fromJson(data['user'], currentToken)
            : AuthService.instance.currentUser?.copyWith(profileImage: data['profile_image']?.toString());
        if (updatedUser != null) {
          AuthService.instance.setUser(updatedUser);
        }
        return {'success': true, 'user': updatedUser, 'profile_image': data['profile_image']};
      }
      return {'success': false, 'error': data['error'] ?? 'Profilbild-Upload fehlgeschlagen'};
    } catch (e) {
      return {'success': false, 'error': 'Upload-Fehler: $e'};
    }
  }

  static Future<Map<String, dynamic>> changePassword({
    required String userId,
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      final res = await _post(
        Uri.parse('$baseUrl/auth/change-password'),
        headers: _authHeaders(),
        body: jsonEncode({
          'userId': userId,
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        }),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return {'success': true, 'message': data['message']};
      }
      return {'success': false, 'error': data['error'] ?? 'Passwortänderung fehlgeschlagen'};
    } catch (e) {
      return {'success': false, 'error': 'Verbindungsfehler: $e'};
    }
  }

  static Future<Map<String, dynamic>> acceptPrivacy(String userId) async {
    try {
      final res = await _post(
        Uri.parse('$baseUrl/auth/accept-privacy'),
        headers: _authHeaders(),
        body: jsonEncode({'userId': userId}),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return {'success': true, 'message': data['message']};
      }
      return {'success': false, 'error': data['error'] ?? 'Datenschutzbestätigung fehlgeschlagen'};
    } catch (e) {
      return {'success': false, 'error': 'Verbindungsfehler: $e'};
    }
  }

  // ---------------------------------------------------------------------------
  // 3. DOCUMENTS (List, Upload, Delete, File URL, Authenticated Download)
  // ---------------------------------------------------------------------------
  static Future<List<DocumentItem>> fetchClientDocuments({String? clientId}) async {
    try {
      final effectiveClientId = clientId ?? AuthService.instance.currentUser?.id;
      final uri = (effectiveClientId != null && effectiveClientId.isNotEmpty)
          ? Uri.parse('$baseUrl/documents?client_id=${Uri.encodeComponent(effectiveClientId)}')
          : Uri.parse('$baseUrl/documents');

      final res = await _get(uri, headers: _authHeaders());

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is List) {
          return decoded
              .whereType<Map<String, dynamic>>()
              .map((item) => DocumentItem.fromJson(item))
              .toList();
        }
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>> uploadDocument({
    required String filename,
    required String category,
    required String clientId,
    required List<int> bytes,
    String? notes,
    List<String>? subTypes,
    int? year,
    int? month,
  }) async {
    try {
      final backendCategory = _mapCategoryForBackend(category);
      final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/documents/upload'));
      request.headers.addAll(_authHeaders(jsonContent: false));
      request.fields['client_id'] = clientId;
      request.fields['category'] = backendCategory;
      if (notes != null && notes.trim().isNotEmpty) {
        request.fields['notes'] = notes.trim();
      }
      if (subTypes != null && subTypes.isNotEmpty) {
        request.fields['sub_types'] = jsonEncode(subTypes);
      }
      if (year != null) {
        request.fields['year'] = year.toString();
      }
      if (month != null) {
        request.fields['month'] = month.toString().padLeft(2, '0');
      }
      request.files.add(http.MultipartFile.fromBytes('document', bytes, filename: filename));

      final response = await _sendMultipart(request);
      final data = jsonDecode(response.body);
      final ok = response.statusCode == 201 || response.statusCode == 200;
      DocumentItem? doc;
      if (ok && data is Map && data['document'] is Map<String, dynamic>) {
        doc = DocumentItem.fromJson(data['document']);
      }
      return {
        'success': ok,
        'data': data,
        'document': doc,
        'error': ok ? null : (data is Map ? data['error'] : 'Upload fehlgeschlagen (${response.statusCode})'),
      };
    } catch (e) {
      return {'success': false, 'error': 'Upload-Fehler: $e'};
    }
  }

  /// Backward-compatible alias for screens calling `uploadSimulatedDocument`.
  static Future<Map<String, dynamic>> uploadSimulatedDocument({
    required String filename,
    required String category,
    required String clientId,
    required List<int> bytes,
    String? notes,
    List<String>? subTypes,
    int? year,
    int? month,
  }) {
    return uploadDocument(
      filename: filename,
      category: category,
      clientId: clientId,
      bytes: bytes,
      notes: notes,
      subTypes: subTypes,
      year: year,
      month: month,
    );
  }

  static Future<bool> deleteDocument(String documentId) async {
    try {
      final res = await _delete(
        Uri.parse('$baseUrl/documents/${Uri.encodeComponent(documentId)}?force=true'),
        headers: _authHeaders(),
      );
      return res.statusCode == 200 || res.statusCode == 204;
    } catch (_) {
      return false;
    }
  }

  static String getDocumentViewUrl(String documentId) {
    return '$baseUrl/documents/${Uri.encodeComponent(documentId)}/view';
  }

  static Future<({Uint8List? bytes, String? contentType, String? error})> downloadDocumentBytes(
    String documentId,
  ) async {
    try {
      final res = await _get(
        Uri.parse(getDocumentViewUrl(documentId)),
        headers: _authHeaders(jsonContent: false),
        timeout: const Duration(seconds: 45),
        isBinary: true,
      );
      if (res.statusCode == 200) {
        return (
          bytes: res.bodyBytes,
          contentType: res.headers['content-type'],
          error: null,
        );
      }
      return (
        bytes: null,
        contentType: null,
        error: 'Dokument konnte nicht geladen werden (${res.statusCode})',
      );
    } catch (e) {
      return (
        bytes: null,
        contentType: null,
        error: 'Verbindungsfehler: $e',
      );
    }
  }

  static String _mapCategoryForBackend(String category) {
    switch (category) {
      case '00_Gruendung':
        return '00_Stammdaten';
      case '00_Schriftverkehr':
        return '03_Schriftverkehr';
      default:
        return category;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. TASKS & CORRESPONDENCE
  // ---------------------------------------------------------------------------
  static Future<List<TodoTask>> fetchTasks({String? clientId}) async {
    try {
      final effectiveClientId = clientId ?? AuthService.instance.currentUser?.id;
      final uri = (effectiveClientId != null && effectiveClientId.isNotEmpty)
          ? Uri.parse('$baseUrl/tasks?client_id=${Uri.encodeComponent(effectiveClientId)}')
          : Uri.parse('$baseUrl/tasks');

      final res = await _get(
        uri,
        headers: _authHeaders(),
        timeout: const Duration(seconds: 12),
      );

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is List) {
          return decoded.whereType<Map<String, dynamic>>().map((t) {
            final status = (t['status'] ?? 'OPEN').toString().toUpperCase();
            final due = (t['due_date'] ?? '').toString();
            return TodoTask(
              id: (t['id'] ?? '').toString(),
              title: (t['title'] ?? 'Aufgabe').toString(),
              description: t['description']?.toString(),
              category: '01_FiBu',
              deadline: due.isNotEmpty ? _formatDate(due) : 'Offen',
              isCompleted: status == 'DONE' || status == 'COMPLETED' || status == 'CLOSED',
              priority: status == 'URGENT' ? TaskPriority.high : TaskPriority.normal,
              assignedBy: (t['created_by'] ?? 'FinTax Kanzlei').toString(),
            );
          }).toList();
        }
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> fetchCorrespondence() async {
    try {
      final res = await _get(
        Uri.parse('$baseUrl/correspondence'),
        headers: _authHeaders(),
        timeout: const Duration(seconds: 12),
      );
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is List) {
          return decoded.whereType<Map<String, dynamic>>().toList();
        }
      }
    } catch (_) {}
    return [];
  }

  static Future<Map<String, dynamic>> uploadCorrespondence({
    required String filename,
    required List<int> bytes,
  }) async {
    try {
      final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/correspondence/upload'));
      request.headers.addAll(_authHeaders(jsonContent: false));
      request.files.add(http.MultipartFile.fromBytes('letter', bytes, filename: filename));
      final response = await _sendMultipart(request, timeout: const Duration(seconds: 45));
      final data = jsonDecode(response.body);
      final ok = response.statusCode == 200 || response.statusCode == 201;
      return {'success': ok, 'data': data, 'error': ok ? null : data['error']};
    } catch (e) {
      return {'success': false, 'error': 'Upload-Fehler: $e'};
    }
  }

  // ---------------------------------------------------------------------------
  // 5. PAYROLL (Submissions, Payslips, New Employee / Sick Note / Timesheet)
  // ---------------------------------------------------------------------------
  static Future<List<PayrollEmployee>> fetchPayrollEmployees({String? clientId}) async {
    try {
      final effectiveClientId = clientId ?? AuthService.instance.currentUser?.id;
      final uri = (effectiveClientId != null && effectiveClientId.isNotEmpty)
          ? Uri.parse('$baseUrl/payroll/submissions?client_id=${Uri.encodeComponent(effectiveClientId)}')
          : Uri.parse('$baseUrl/payroll/submissions');

      final res = await _get(
        uri,
        headers: _authHeaders(),
        timeout: const Duration(seconds: 12),
      );

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is List) {
          final seen = <String>{};
          final employees = <PayrollEmployee>[];
          for (final item in decoded.whereType<Map<String, dynamic>>()) {
            final name = (item['employee_name'] ?? '').toString().trim();
            if (name.isEmpty || seen.contains(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            final rawData = item['data_json'] is Map
                ? Map<String, dynamic>.from(item['data_json'])
                : <String, dynamic>{};
            employees.add(PayrollEmployee(
              id: (item['id'] ?? 'emp_${employees.length + 1}').toString(),
              name: name,
              position: (rawData['position'] ?? item['submission_type'] ?? 'Mitarbeiter').toString(),
              employeeId: (rawData['employee_id'] ?? 'MA-${(employees.length + 1).toString().padLeft(3, '0')}').toString(),
              isActive: (item['status'] ?? 'ACTIVE').toString().toUpperCase() != 'INACTIVE',
              startDate: (rawData['start_date'] ?? item['period'] ?? '').toString(),
              email: rawData['email']?.toString(),
            ));
          }
          return employees;
        }
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> fetchPayslips({String? clientId}) async {
    try {
      final effectiveClientId = clientId ?? AuthService.instance.currentUser?.id;
      final uri = (effectiveClientId != null && effectiveClientId.isNotEmpty)
          ? Uri.parse('$baseUrl/payroll/payslips?client_id=${Uri.encodeComponent(effectiveClientId)}')
          : Uri.parse('$baseUrl/payroll/payslips');
      final res = await _get(
        uri,
        headers: _authHeaders(),
        timeout: const Duration(seconds: 12),
      );
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is List) {
          return decoded.whereType<Map<String, dynamic>>().toList();
        }
      }
    } catch (_) {}
    return [];
  }

  static Future<Map<String, dynamic>> submitPayroll({
    required String clientId,
    required String employeeName,
    required String submissionType, // NEW_HIRE, HOURS_OVERTIME, SICK_NOTE, BONUS
    required String period,
    Map<String, dynamic>? data,
  }) async {
    try {
      final res = await _post(
        Uri.parse('$baseUrl/payroll/submit'),
        headers: _authHeaders(),
        body: jsonEncode({
          'client_id': clientId,
          'employee_name': employeeName,
          'submission_type': submissionType,
          'period': period,
          'data': data ?? {},
        }),
      );
      final decoded = jsonDecode(res.body);
      final ok = res.statusCode == 201 || res.statusCode == 200;
      return {
        'success': ok,
        'data': decoded,
        'error': ok ? null : (decoded['error'] ?? 'Übermittlung fehlgeschlagen'),
      };
    } catch (e) {
      return {'success': false, 'error': 'Verbindungsfehler: $e'};
    }
  }

  // ---------------------------------------------------------------------------
  // 6. STORAGE / VAULT TREE
  // ---------------------------------------------------------------------------
  static Future<Map<String, dynamic>?> fetchClientFolderTree(String clientId) async {
    try {
      final res = await _get(
        Uri.parse('$baseUrl/storage/clients/${Uri.encodeComponent(clientId)}/tree'),
        headers: _authHeaders(),
        timeout: const Duration(seconds: 12),
      );
      if (res.statusCode == 200) {
        return Map<String, dynamic>.from(jsonDecode(res.body));
      }
    } catch (_) {}
    return null;
  }

  // ---------------------------------------------------------------------------
  // HELPERS & FALLBACKS
  // ---------------------------------------------------------------------------
  static String _formatDate(String raw) {
    try {
      final dt = DateTime.parse(raw);
      return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year}';
    } catch (_) {
      return raw;
    }
  }

  static List<TodoTask> getDemoTodos() => [];
  static List<MissingDocumentAlert> getDemoMissingDocs() => [];
  static List<PayrollEmployee> getDemoEmployees() => [];
}
