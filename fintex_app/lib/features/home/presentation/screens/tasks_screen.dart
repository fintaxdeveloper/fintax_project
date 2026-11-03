import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../authentication/models/user_model.dart';

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
        final todoItems = [
          {
            'title': Tr.get('bankStatementSept'),
            'subtitle': Tr.get('dueIn2Days'),
            'badge': Tr.get('urgent'),
            'boxColor': AppColors.redBox,
            'iconColor': AppColors.redText,
            'badgeBoxColor': AppColors.redBox,
            'badgeTextColor': AppColors.redText,
          },
          {
            'title': Tr.get('invoice1042'),
            'subtitle': Tr.get('dueIn5Days'),
            'badge': Tr.get('soon'),
            'boxColor': AppColors.yellowBox,
            'iconColor': AppColors.yellowIcon,
            'badgeBoxColor': AppColors.yellowBox,
            'badgeTextColor': AppColors.warning,
          },
          {
            'title': Tr.get('timesheetOct'),
            'subtitle': Tr.get('dueIn9Days'),
            'badge': Tr.get('onTrack'),
            'boxColor': AppColors.greenBox,
            'iconColor': AppColors.greenIcon,
            'badgeBoxColor': AppColors.greenBox,
            'badgeTextColor': AppColors.greenIcon,
          },
          {
            'title': Tr.get('sickNoteJWeber'),
            'subtitle': Tr.get('dueIn12Days'),
            'badge': Tr.get('onTrack'),
            'boxColor': AppColors.greenBox,
            'iconColor': AppColors.greenIcon,
            'badgeBoxColor': AppColors.greenBox,
            'badgeTextColor': AppColors.greenIcon,
          },
        ];

        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Text(
                    Tr.get('todos'),
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    Tr.get('requestsTeam'),
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Stat Summary Cards Row
                  Row(
                    children: [
                      // Open
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                '4',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 28,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                Tr.get('open'),
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.85),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),

                      // Due Soon
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                          decoration: BoxDecoration(
                            color: AppColors.redBox,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                '1',
                                style: TextStyle(
                                  color: AppColors.redText,
                                  fontSize: 28,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                Tr.get('dueSoon'),
                                style: const TextStyle(
                                  color: AppColors.redText,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),

                      // Done
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                          decoration: BoxDecoration(
                            color: AppColors.greenBox,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                '12',
                                style: TextStyle(
                                  color: AppColors.greenIcon,
                                  fontSize: 28,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                Tr.get('done'),
                                style: const TextStyle(
                                  color: AppColors.greenIcon,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Task List Cards
                  ...todoItems.map((item) {
                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.border),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.03),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          // Document Icon Box
                          Container(
                            width: 46,
                            height: 46,
                            decoration: BoxDecoration(
                              color: item['boxColor'] as Color,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Icon(
                              Icons.description_outlined,
                              color: item['iconColor'] as Color,
                              size: 24,
                            ),
                          ),
                          const SizedBox(width: 14),

                          // Title & Subtitle Column
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item['title'] as String,
                                  style: const TextStyle(
                                    color: AppColors.textPrimary,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  item['subtitle'] as String,
                                  style: const TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),

                          // Status Badge Pill
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: item['badgeBoxColor'] as Color,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(
                              item['badge'] as String,
                              style: TextStyle(
                                color: item['badgeTextColor'] as Color,
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  }),

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
