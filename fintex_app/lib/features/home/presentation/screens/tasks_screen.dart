import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/screen_title_header.dart';
import '../../../../models/document_item.dart';
import '../../../../models/todo_task.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../widgets/task_card.dart';
import '../widgets/task_stat_card.dart';

class TasksScreen extends StatefulWidget {
  final UserModel user;
  const TasksScreen({super.key, required this.user});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  List<TodoTask> _tasks = [];
  List<DocumentItem> _docs = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final results = await Future.wait([
      ApiService.fetchTasks(clientId: widget.user.id),
      ApiService.fetchClientDocuments(clientId: widget.user.id),
    ]);
    if (!mounted) return;
    setState(() {
      _tasks = results[0] as List<TodoTask>;
      _docs = results[1] as List<DocumentItem>;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final attentionDocs = _docs
        .where((d) => d.status == 'NEEDS_ATTENTION' || d.status == 'READY_FOR_REVIEW')
        .toList();
    final approvedDocs = _docs
        .where((d) => d.status == 'APPROVED' || d.status == 'EXPORTED')
        .length;
    final openTasks = _tasks.where((t) => !t.isCompleted).toList();
    final doneTasks = _tasks.where((t) => t.isCompleted).length;

    final openCount = openTasks.length + attentionDocs.length;
    final dueSoonCount = openTasks.where((t) => t.priority == TaskPriority.high).length +
        attentionDocs.where((d) => d.status == 'NEEDS_ATTENTION').length;
    final doneCount = doneTasks + approvedDocs;

    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _loadData,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ScreenTitleHeader(
                      title: Tr.get('todos'),
                      subtitle: Tr.get('requestsTeam'),
                    ),
                    const SizedBox(height: 20),

                    Row(
                      children: [
                        Expanded(
                          child: TaskStatCard(
                            value: '$openCount',
                            label: Tr.get('open'),
                            backgroundColor: AppColors.primary,
                            valueColor: Colors.white,
                            labelColor: Colors.white.withValues(alpha: 0.85),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TaskStatCard(
                            value: '$dueSoonCount',
                            label: Tr.get('dueSoon'),
                            backgroundColor: AppColors.redBox,
                            valueColor: AppColors.redText,
                            labelColor: AppColors.redText,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TaskStatCard(
                            value: '$doneCount',
                            label: Tr.get('done'),
                            backgroundColor: AppColors.greenBox,
                            valueColor: AppColors.greenIcon,
                            labelColor: AppColors.greenIcon,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    if (_loading)
                      const Padding(
                        padding: EdgeInsets.all(40),
                        child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
                      )
                    else if (openTasks.isEmpty && attentionDocs.isEmpty)
                      EmptyState(
                        icon: Icons.check_circle_outline_rounded,
                        title: currentLang == 'en' ? 'All caught up!' : 'Alles erledigt!',
                        subtitle: currentLang == 'en'
                            ? 'No pending tasks or documents needing attention.'
                            : 'Keine offenen Aufgaben oder fehlenden Belege.',
                      )
                    else ...[
                      for (final t in openTasks)
                        TaskCard(
                          title: t.title,
                          subtitle: '${t.assignedBy} • ${t.deadline}',
                          badge: t.priority == TaskPriority.high ? Tr.get('urgent') : Tr.get('soon'),
                          boxColor: t.priority == TaskPriority.high ? AppColors.redBox : AppColors.yellowBox,
                          iconColor: t.priority == TaskPriority.high ? AppColors.redText : AppColors.yellowIcon,
                          badgeBoxColor: t.priority == TaskPriority.high ? AppColors.redBox : AppColors.yellowBox,
                          badgeTextColor: t.priority == TaskPriority.high ? AppColors.redText : AppColors.warning,
                        ),
                      for (final doc in attentionDocs)
                        TaskCard(
                          title: doc.originalFilename,
                          subtitle: '${doc.sectionName} • ${doc.date}',
                          badge: doc.status == 'NEEDS_ATTENTION' ? Tr.get('urgent') : Tr.get('soon'),
                          boxColor: doc.status == 'NEEDS_ATTENTION' ? AppColors.redBox : AppColors.yellowBox,
                          iconColor: doc.status == 'NEEDS_ATTENTION' ? AppColors.redText : AppColors.yellowIcon,
                          badgeBoxColor: doc.status == 'NEEDS_ATTENTION' ? AppColors.redBox : AppColors.yellowBox,
                          badgeTextColor: doc.status == 'NEEDS_ATTENTION' ? AppColors.redText : AppColors.warning,
                        ),
                    ],

                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
