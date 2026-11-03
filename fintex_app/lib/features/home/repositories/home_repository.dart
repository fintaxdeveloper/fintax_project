import '../../../models/document_item.dart';
import '../../../models/todo_task.dart';
import '../../../services/api_service.dart';
import '../models/home_model.dart';

class HomeRepository {
  Future<HomeDashboardData> fetchDashboardData() async {
    final docs = await ApiService.fetchClientDocuments();
    final todos = ApiService.getDemoTodos();
    final missingDocs = ApiService.getDemoMissingDocs();

    return HomeDashboardData(
      recentDocuments: docs,
      todos: todos,
      missingDocuments: missingDocs,
    );
  }
}
