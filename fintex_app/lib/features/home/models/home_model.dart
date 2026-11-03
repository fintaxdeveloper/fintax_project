import '../../../models/document_item.dart';
import '../../../models/todo_task.dart';

class HomeDashboardData {
  final List<DocumentItem> recentDocuments;
  final List<TodoTask> todos;
  final List<MissingDocumentAlert> missingDocuments;

  HomeDashboardData({
    required this.recentDocuments,
    required this.todos,
    required this.missingDocuments,
  });

  int get openTasksCount => todos.where((t) => !t.isCompleted).length;
}
