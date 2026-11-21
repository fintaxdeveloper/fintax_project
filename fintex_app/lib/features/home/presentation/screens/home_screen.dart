import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../models/document_item.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../../documents/models/folder_config.dart';
import '../../../documents/presentation/screens/document_viewer_screen.dart';
import '../../../documents/presentation/screens/folder_submit_screen.dart';
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
  List<DocumentItem> _documents = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDocuments();
  }

  Future<void> _loadDocuments() async {
    setState(() => _loading = true);
    final docs = await ApiService.fetchClientDocuments(clientId: widget.user.id);
    if (!mounted) return;
    setState(() {
      _documents = docs;
      _loading = false;
    });
  }

  Future<void> _openFolder(FolderConfig folder) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FolderSubmitScreen(user: widget.user, folder: folder),
      ),
    );
    _loadDocuments();
  }

  RecentDocStatus _mapStatus(String status) {
    final s = status.toUpperCase();
    if (s == 'APPROVED' || s == 'EXPORTED' || s == 'VERIFIED') return RecentDocStatus.checked;
    if (s == 'NEEDS_ATTENTION' || s == 'READY_FOR_REVIEW') return RecentDocStatus.needsReview;
    return RecentDocStatus.processing;
  }

  String _categoryLabel(String category) {
    switch (category) {
      case '00_Gruendung':
        return Tr.get('masterRecords');
      case '02_LoBu':
        return Tr.get('payrollTeam');
      case '00_Schriftverkehr':
        return Tr.get('correspondence');
      default:
        return Tr.get('financialAccounting');
    }
  }

  String _formatDateLabel(String raw) {
    if (raw.isEmpty) return Tr.get('today');
    try {
      final dt = DateTime.parse(raw);
      return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year}';
    } catch (_) {
      return raw.length > 16 ? raw.substring(0, 10) : raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    final displayName = widget.user.name.isEmpty || widget.user.name == 'Mandant'
        ? 'Client'
        : widget.user.name;

    final masterCount = _documents.where((d) => d.category == '00_Gruendung').length;
    final recentItems = _documents.take(6).map((d) {
      final lower = d.originalFilename.toLowerCase();
      final isImg = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
      return RecentDocument(
        name: d.originalFilename,
        category: _categoryLabel(d.category),
        time: _formatDateLabel(d.date),
        status: _mapStatus(d.status),
        isImage: isImg,
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => DocumentViewerScreen(document: d)),
        ),
      );
    }).toList();

    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _loadDocuments,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  children: [
                    HomeHeader(
                      welcomeText: currentLang == 'en' ? 'Welcome,' : 'Willkommen,',
                      displayName: displayName,
                      onRefresh: _loadDocuments,
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
                                onTap: () => _openFolder(FolderConfig.financialAccounting),
                              ),
                              HomeFolderCard(
                                icon: Icons.people_outline_rounded,
                                iconBoxColor: AppColors.purpleBox,
                                iconColor: AppColors.purpleIcon,
                                title: Tr.get('payrollTeam'),
                                subtitle: Tr.get('payrollTeamSub'),
                                badgeText: Tr.get('badgeDue25'),
                                actionLabel: Tr.get('actionSubmit'),
                                onTap: () => _openFolder(FolderConfig.payroll),
                              ),
                              HomeFolderCard(
                                icon: Icons.mail_outline_rounded,
                                iconBoxColor: AppColors.orangeBox,
                                iconColor: AppColors.orangeIcon,
                                title: Tr.get('correspondence'),
                                subtitle: Tr.get('correspondenceSub'),
                                badgeText: Tr.get('badgeTaxNotices'),
                                actionLabel: Tr.get('actionUpload'),
                                onTap: () => _openFolder(FolderConfig.correspondence),
                              ),
                              HomeFolderCard(
                                icon: Icons.domain_rounded,
                                iconBoxColor: AppColors.indigoBox,
                                iconColor: AppColors.indigoIcon,
                                title: Tr.get('masterRecords'),
                                subtitle: Tr.get('masterRecordsSub'),
                                badgeText: currentLang == 'en'
                                    ? '$masterCount saved'
                                    : '$masterCount gespeichert',
                                actionLabel: Tr.get('actionManage'),
                                onTap: () => _openFolder(FolderConfig.masterRecords),
                              ),
                            ],
                          ),
                          const SizedBox(height: 28),
                          if (_loading)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 28),
                              child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
                            )
                          else
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
                              documents: recentItems,
                            ),
                          const SizedBox(height: 120),
                        ],
                      ),
                    ),
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
