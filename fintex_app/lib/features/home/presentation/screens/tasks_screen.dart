import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/screen_title_header.dart';
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
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: SingleChildScrollView(
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
                          value: '4',
                          label: Tr.get('open'),
                          backgroundColor: AppColors.primary,
                          valueColor: Colors.white,
                          labelColor: Colors.white.withValues(alpha: 0.85),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TaskStatCard(
                          value: '1',
                          label: Tr.get('dueSoon'),
                          backgroundColor: AppColors.redBox,
                          valueColor: AppColors.redText,
                          labelColor: AppColors.redText,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TaskStatCard(
                          value: '12',
                          label: Tr.get('done'),
                          backgroundColor: AppColors.greenBox,
                          valueColor: AppColors.greenIcon,
                          labelColor: AppColors.greenIcon,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  TaskCard(
                    title: Tr.get('bankStatementSept'),
                    subtitle: Tr.get('dueIn2Days'),
                    badge: Tr.get('urgent'),
                    boxColor: AppColors.redBox,
                    iconColor: AppColors.redText,
                    badgeBoxColor: AppColors.redBox,
                    badgeTextColor: AppColors.redText,
                  ),
                  TaskCard(
                    title: Tr.get('invoice1042'),
                    subtitle: Tr.get('dueIn5Days'),
                    badge: Tr.get('soon'),
                    boxColor: AppColors.yellowBox,
                    iconColor: AppColors.yellowIcon,
                    badgeBoxColor: AppColors.yellowBox,
                    badgeTextColor: AppColors.warning,
                  ),
                  TaskCard(
                    title: Tr.get('timesheetOct'),
                    subtitle: Tr.get('dueIn9Days'),
                    badge: Tr.get('onTrack'),
                    boxColor: AppColors.greenBox,
                    iconColor: AppColors.greenIcon,
                    badgeBoxColor: AppColors.greenBox,
                    badgeTextColor: AppColors.greenIcon,
                  ),
                  TaskCard(
                    title: Tr.get('sickNoteJWeber'),
                    subtitle: Tr.get('dueIn12Days'),
                    badge: Tr.get('onTrack'),
                    boxColor: AppColors.greenBox,
                    iconColor: AppColors.greenIcon,
                    badgeBoxColor: AppColors.greenBox,
                    badgeTextColor: AppColors.greenIcon,
                  ),

                  const SizedBox(height: 100),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
