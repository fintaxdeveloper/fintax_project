import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../authentication/models/user_model.dart';
import '../../../documents/presentation/screens/section_detail_screen.dart';
import '../../../payroll/presentation/screens/payroll_screen.dart';
import '../widgets/home_card.dart';
import '../widgets/home_folder_grid.dart';
import '../widgets/home_header.dart';
import '../widgets/recent_documents_list.dart';

class HomeScreen extends StatefulWidget {
  final UserModel user;
  final VoidCallback onOpenScanner;
  final VoidCallback? onViewAllDocuments;
  final VoidCallback? onOpenNotifications;

  const HomeScreen({
    super.key,
    required this.user,
    required this.onOpenScanner,
    this.onViewAllDocuments,
    this.onOpenNotifications,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  void _openSection(String categoryKey, String title, String subtitle, Color color) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SectionDetailScreen(
          user: widget.user,
          categoryKey: categoryKey,
          title: title,
          subtitle: subtitle,
          themeColor: color,
        ),
      ),
    );
  }

  void _openPayroll() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => PayrollScreen(user: widget.user)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final displayName = widget.user.name.isEmpty || widget.user.name == 'Mandant'
        ? 'Mohammad'
        : widget.user.name;

    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  HomeHeader(
                    welcomeText: currentLang == 'en' ? 'Welcome,' : 'Willkommen,',
                    displayName: displayName,
                    onRefresh: () => setState(() {}),
                    onNotificationTap: widget.onOpenNotifications,
                  ),

                  const SizedBox(height: 24),

                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          Tr.get('yourFolders'),
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 14),

                        HomeFolderGrid(
                          children: [
                            HomeFolderCard(
                              icon: Icons.bar_chart_rounded,
                              iconBoxColor: AppColors.emeraldBox,
                              iconColor: AppColors.emeraldIcon,
                              title: Tr.get('financialAccounting'),
                              subtitle: Tr.get('financialAccountingSub'),
                              badgeText: Tr.get('badgeActive'),
                              actionLabel: Tr.get('actionSubmit'),
                              onTap: () => _openSection('01_FiBu', Tr.get('financialAccounting'), Tr.get('financialAccountingSub'), AppColors.emeraldIcon),
                            ),
                            HomeFolderCard(
                              icon: Icons.people_outline_rounded,
                              iconBoxColor: AppColors.purpleBox,
                              iconColor: AppColors.purpleIcon,
                              title: Tr.get('payrollTeam'),
                              subtitle: Tr.get('payrollTeamSub'),
                              badgeText: Tr.get('badgeDue25'),
                              actionLabel: Tr.get('actionSubmit'),
                              onTap: _openPayroll,
                            ),
                            HomeFolderCard(
                              icon: Icons.mail_outline_rounded,
                              iconBoxColor: AppColors.orangeBox,
                              iconColor: AppColors.orangeIcon,
                              title: Tr.get('correspondence'),
                              subtitle: Tr.get('correspondenceSub'),
                              badgeText: Tr.get('badgeTaxNotices'),
                              actionLabel: Tr.get('actionUpload'),
                              onTap: () => _openSection('00_Schriftverkehr', Tr.get('correspondence'), Tr.get('correspondenceSub'), AppColors.orangeIcon),
                            ),
                            HomeFolderCard(
                              icon: Icons.domain_rounded,
                              iconBoxColor: AppColors.indigoBox,
                              iconColor: AppColors.indigoIcon,
                              title: Tr.get('masterRecords'),
                              subtitle: Tr.get('masterRecordsSub'),
                              badgeText: Tr.get('badgeSaved0'),
                              actionLabel: Tr.get('actionManage'),
                              onTap: () => _openSection('00_Gruendung', Tr.get('masterRecords'), Tr.get('masterRecordsSub'), AppColors.indigoIcon),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),

                        const SizedBox(height: 8),
                        RecentDocumentsList(
                          title: Tr.get('recentDocuments'),
                          viewAllLabel: Tr.get('viewAll'),
                          onViewAll: widget.onViewAllDocuments,
                          emptyText: Tr.get('noRecentDocuments'),
                          statusLabels: {
                            RecentDocStatus.checked: Tr.get('statusChecked'),
                            RecentDocStatus.processing: Tr.get('statusProcessing'),
                            RecentDocStatus.needsReview: Tr.get('statusNeedsReview'),
                          },
                          // Dummy data until the documents API is connected.
                          documents: [
                            RecentDocument(
                              name: 'Rechnung_1039.pdf',
                              category: Tr.get('financialAccounting'),
                              time: '${Tr.get('today')}, 09:12',
                              status: RecentDocStatus.processing,
                            ),
                            RecentDocument(
                              name: 'Kontoauszug_Oktober.pdf',
                              category: Tr.get('financialAccounting'),
                              time: Tr.get('yesterdayTime'),
                              status: RecentDocStatus.checked,
                            ),
                            RecentDocument(
                              name: 'Tankbeleg_ARAL.jpg',
                              category: Tr.get('financialAccounting'),
                              time: '${Tr.get('yesterday')}, 11:05',
                              status: RecentDocStatus.needsReview,
                              isImage: true,
                            ),
                            RecentDocument(
                              name: 'Steuerbescheid_2024.pdf',
                              category: Tr.get('correspondence'),
                              time: '14.11.2026',
                              status: RecentDocStatus.checked,
                            ),
                          ],
                        ),
                        const SizedBox(height: 120),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
