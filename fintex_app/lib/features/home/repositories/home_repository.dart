import '../../../models/document_item.dart';
import '../../../services/api_service.dart';
import '../models/home_model.dart';

class HomeRepository {
  Future<HomeDashboardData> fetchDashboardData({String? clientId}) async {
    final results = await Future.wait([
      ApiService.fetchClientDocuments(clientId: clientId),
      ApiService.fetchTasks(clientId: clientId),
    ]);

    final docs = results[0] as List<DocumentItem>;
    final todos = results[1] as List;
    final missingDocs = docs
        .where((d) => d.status == 'NEEDS_ATTENTION' || d.status == 'READY_FOR_REVIEW')
        .map((d) => MissingDocumentAlert(
              title: d.originalFilename,
              category: d.category,
              period: d.date,
              dueDate: d.status,
            ))
        .toList();

    return HomeDashboardData(
      recentDocuments: docs,
      todos: List.from(todos),
      missingDocuments: missingDocs,
    );
  }
}
