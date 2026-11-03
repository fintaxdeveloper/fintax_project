import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/user_session.dart';
import '../models/document_item.dart';
import '../models/todo_task.dart';
import '../core/constants/app_constants.dart';

class ApiService {
  static const String baseUrl = AppConstants.apiBaseUrl;

  static Future<Map<String, dynamic>> login(String identifier, String password) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'identifier': identifier, 'password': password}),
      ).timeout(const Duration(seconds: 5));

      final data = jsonDecode(res.body);
      if (res.statusCode == 200) {
        return {
          'success': true,
          'user': UserSession.fromJson(data['user'] ?? {}, data['token'] ?? ''),
          'message': data['message'],
        };
      } else {
        return {'success': false, 'error': data['error'] ?? 'Anmeldung fehlgeschlagen'};
      }
    } catch (e) {
      // Offline demo fallback
      if (identifier == 'KD-10042' || identifier == 'mandant@mustermann.de') {
        return {
          'success': true,
          'user': UserSession(
            id: 'user_client_1',
            name: 'Hans Mustermann GmbH',
            email: 'mandant@mustermann.de',
            clientNumber: 'KD-10042',
            token: 'demo_offline_token',
            companyName: 'Mustermann GmbH',
          ),
          'message': 'Offline-Demo-Modus aktiv',
        };
      }
      return {'success': false, 'error': 'Verbindungsfehler: $e'};
    }
  }

  static Future<List<DocumentItem>> fetchClientDocuments() async {
    try {
      final res = await http.get(Uri.parse('$baseUrl/documents')).timeout(const Duration(seconds: 5));
      if (res.statusCode == 200) {
        final List list = jsonDecode(res.body);
        return list.map((item) => DocumentItem.fromJson(item)).toList();
      }
      return _demoDocuments();
    } catch (_) {
      return _demoDocuments();
    }
  }

  static Future<Map<String, dynamic>> uploadSimulatedDocument({
    required String filename,
    required String category,
    required String clientId,
    required List<int> bytes,
  }) async {
    try {
      final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/documents/upload'));
      request.fields['client_id'] = clientId;
      request.fields['category'] = category;
      request.files.add(http.MultipartFile.fromBytes('document', bytes, filename: filename));

      final streamedResponse = await request.send().timeout(const Duration(seconds: 10));
      final response = await http.Response.fromStream(streamedResponse);
      final data = jsonDecode(response.body);
      return {'success': response.statusCode == 201 || response.statusCode == 200, 'data': data};
    } catch (e) {
      return {'success': true, 'simulated': true};
    }
  }

  static List<TodoTask> getDemoTodos() {
    return [
      TodoTask(
        id: 'task_1',
        title: 'Eingangsrechnungen Oktober einreichen',
        description: 'Alle Eingangsrechnungen für Oktober 2026 bis zum 10. November hochladen',
        category: '01_FiBu',
        deadline: '10.11.2026',
        priority: TaskPriority.high,
        assignedBy: 'Fr. Schmidt (FinTax)',
        isCompleted: true,
      ),
      TodoTask(
        id: 'task_2',
        title: 'Kontoauszug Deutsche Bank (Oktober)',
        description: 'Monatlichen Kontoauszug der Deutschen Bank hochladen',
        category: '01_FiBu',
        deadline: '12.11.2026',
        priority: TaskPriority.high,
        assignedBy: 'Fr. Schmidt (FinTax)',
      ),
      TodoTask(
        id: 'task_3',
        title: 'Lohndaten Oktober freigeben',
        description: 'Überstunden und Lohndaten für Oktober prüfen und freigeben',
        category: '02_LoBu',
        deadline: '25.10.2026',
        priority: TaskPriority.normal,
        assignedBy: 'Hr. Weber (FinTax)',
        isCompleted: true,
      ),
      TodoTask(
        id: 'task_4',
        title: 'Fehlenden Bewirtungsbeleg ergänzen',
        description: 'Bewirtungsbeleg Restaurant Kaiserhof (€ 184,50)',
        category: '01_FiBu',
        deadline: '15.11.2026',
        priority: TaskPriority.normal,
        assignedBy: 'Fr. Schmidt (FinTax)',
      ),
      TodoTask(
        id: 'task_5',
        title: 'Gewerbeanmeldung Kopie hochladen',
        category: '00_Gruendung',
        deadline: '20.11.2026',
        priority: TaskPriority.low,
        assignedBy: 'Hr. Meier (FinTax)',
      ),
    ];
  }

  static List<MissingDocumentAlert> getDemoMissingDocs() {
    return [
      MissingDocumentAlert(
        title: 'Kontoauszug Oktober 2026 (Deutsche Bank)',
        category: '01_FiBu',
        period: 'Oktober 2026',
        dueDate: '12. Nov 2026',
      ),
      MissingDocumentAlert(
        title: 'Bewirtungsbeleg Kaiserhof (€ 184,50)',
        category: '01_FiBu',
        period: 'Oktober 2026',
        dueDate: '15. Nov 2026',
      ),
    ];
  }

  static List<PayrollEmployee> getDemoEmployees() {
    return [
      PayrollEmployee(
        id: 'emp_1',
        name: 'Thomas Müller',
        position: 'Projektleiter',
        employeeId: 'MA-001',
        startDate: '01.03.2022',
        email: 'mueller@mustermann.de',
      ),
      PayrollEmployee(
        id: 'emp_2',
        name: 'Anna Fischer',
        position: 'Buchhalterin',
        employeeId: 'MA-002',
        startDate: '15.06.2023',
        email: 'fischer@mustermann.de',
      ),
      PayrollEmployee(
        id: 'emp_3',
        name: 'Markus Weber',
        position: 'Vertriebsleiter',
        employeeId: 'MA-003',
        startDate: '01.01.2024',
        email: 'weber@mustermann.de',
      ),
      PayrollEmployee(
        id: 'emp_4',
        name: 'Lisa Schneider',
        position: 'Praktikantin',
        employeeId: 'MA-004',
        isActive: false,
        startDate: '01.09.2026',
        email: 'schneider@mustermann.de',
      ),
    ];
  }

  static List<DocumentItem> _demoDocuments() {
    return [
      DocumentItem(
        id: 'doc_1',
        originalFilename: 'Rechnung_Telekom_Okt2026.pdf',
        category: '01_FiBu',
        sectionName: 'Finanzbuchhaltung',
        totalAmount: 89.99,
        supplierName: 'Deutsche Telekom AG',
        invoiceNumber: 'RE-2026-10-4421',
        date: '01.10.2026',
        status: 'APPROVED',
        sizeBytes: 245760,
      ),
      DocumentItem(
        id: 'doc_2',
        originalFilename: 'Miete_Oktober_2026.pdf',
        category: '01_FiBu',
        sectionName: 'Finanzbuchhaltung',
        totalAmount: 2850.00,
        supplierName: 'Hausverwaltung Schmidt',
        invoiceNumber: 'MV-2026-10',
        date: '01.10.2026',
        status: 'APPROVED',
        sizeBytes: 198400,
      ),
      DocumentItem(
        id: 'doc_3',
        originalFilename: 'Tankquittung_Aral_15Okt.jpg',
        category: '01_FiBu',
        sectionName: 'Finanzbuchhaltung',
        totalAmount: 78.45,
        supplierName: 'Aral AG',
        date: '15.10.2026',
        status: 'PROCESSING',
        sizeBytes: 1843200,
      ),
      DocumentItem(
        id: 'doc_4',
        originalFilename: 'Lohnabrechnung_Mueller_Okt.pdf',
        category: '02_LoBu',
        sectionName: 'Lohnbuchhaltung',
        supplierName: 'Thomas Müller',
        date: '31.10.2026',
        status: 'APPROVED',
        sizeBytes: 156672,
      ),
      DocumentItem(
        id: 'doc_5',
        originalFilename: 'Finanzamt_Bescheid_2025.pdf',
        category: '00_Schriftverkehr',
        sectionName: 'Schriftverkehr',
        supplierName: 'Finanzamt Frankfurt',
        date: '20.10.2026',
        status: 'NEEDS_ATTENTION',
        sizeBytes: 524288,
      ),
    ];
  }
}
