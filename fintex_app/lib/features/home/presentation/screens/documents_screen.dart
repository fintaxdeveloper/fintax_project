import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/screen_title_header.dart';
import '../../../../models/document_item.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../../documents/presentation/widgets/document_list_tile.dart';
import '../../../scanner/presentation/screens/camera_scan_screen.dart';
import '../../../scanner/presentation/screens/whatsapp_import_screen.dart';
import '../widgets/folder_summary_card.dart';
import '../widgets/folder_tab_bar.dart';

/// Static description of one folder tab.
class _Folder {
  final String categoryKey;
  final String titleKey;
  final String subtitleKey;
  final IconData icon;
  final Color color;
  final Color lightColor;

  const _Folder(this.categoryKey, this.titleKey, this.subtitleKey, this.icon, this.color, this.lightColor);
}

class DocumentsScreen extends StatefulWidget {
  final UserModel user;
  const DocumentsScreen({super.key, required this.user});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  static const _folders = [
    _Folder('01_FiBu', 'financialAccounting', 'financialAccountingSub', Icons.bar_chart_rounded,
        AppColors.emeraldIcon, AppColors.emeraldBox),
    _Folder('02_LoBu', 'payrollTeam', 'payrollTeamSub', Icons.people_outline_rounded,
        AppColors.purpleIcon, AppColors.purpleBox),
    _Folder('00_Schriftverkehr', 'correspondence', 'correspondenceSub', Icons.mail_outline_rounded,
        AppColors.orangeIcon, AppColors.orangeBox),
    _Folder('00_Gruendung', 'masterRecords', 'masterRecordsSub', Icons.domain_rounded,
        AppColors.indigoIcon, AppColors.indigoBox),
  ];

  int _selectedIndex = 0;
  List<DocumentItem> _allDocuments = [];
  bool _loading = true;

  _Folder get _folder => _folders[_selectedIndex];

  List<DocumentItem> _docsFor(_Folder f) =>
      _allDocuments.where((d) => d.category == f.categoryKey).toList();

  @override
  void initState() {
    super.initState();
    _loadDocuments();
  }

  Future<void> _loadDocuments() async {
    setState(() => _loading = true);
    final docs = await ApiService.fetchClientDocuments();
    if (!mounted) return;
    setState(() {
      _allDocuments = docs;
      _loading = false;
    });
  }

  Future<void> _openCameraScan() async {
    final res = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CameraScanScreen(user: widget.user, initialCategory: _folder.categoryKey),
      ),
    );
    if (res == true) _loadDocuments();
  }

  void _openWhatsAppImport() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => WhatsAppImportScreen(user: widget.user)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        final docs = _docsFor(_folder);

        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _loadDocuments,
              child: ListView(
                padding: const EdgeInsets.only(top: 20, bottom: 120),
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: ScreenTitleHeader(
                      title: Tr.get('documents'),
                      subtitle: Tr.get('pickFolderSub'),
                    ),
                  ),
                  const SizedBox(height: 18),

                  // The 4 folder tabs
                  FolderTabBar(
                    selectedIndex: _selectedIndex,
                    onChanged: (i) => setState(() => _selectedIndex = i),
                    tabs: [
                      for (final f in _folders)
                        FolderTab(
                          label: Tr.get(f.titleKey),
                          icon: f.icon,
                          color: f.color,
                          lightColor: f.lightColor,
                        ),
                    ],
                  ),
                  const SizedBox(height: 18),

                  // Content of the selected tab
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      child: Column(
                        key: ValueKey(_selectedIndex),
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          FolderSummaryCard(
                            icon: _folder.icon,
                            color: _folder.color,
                            lightColor: _folder.lightColor,
                            title: Tr.get(_folder.titleKey),
                            subtitle: Tr.get(_folder.subtitleKey),
                            countLabel: _loading ? '…' : '${docs.length} ${Tr.get('docsCountSuffix')}',
                            scanLabel: Tr.get('quickScan'),
                            fileLabel: Tr.get('quickFile'),
                            whatsAppLabel: Tr.get('quickWhatsApp'),
                            onScan: _openCameraScan,
                            onFile: _openCameraScan,
                            onWhatsApp: _openWhatsAppImport,
                          ),
                          const SizedBox(height: 22),
                          Text(
                            Tr.get('folderDocuments'),
                            style: const TextStyle(
                              color: AppColors.textPrimary,
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (_loading)
                            Padding(
                              padding: const EdgeInsets.all(40),
                              child: Center(child: CircularProgressIndicator(color: _folder.color)),
                            )
                          else if (docs.isEmpty)
                            EmptyState(
                              icon: Icons.folder_open_rounded,
                              title: Tr.get('noDocsInFolder'),
                              subtitle: Tr.get('noDocsInFolderSub'),
                            )
                          else
                            for (final doc in docs)
                              DocumentListTile(document: doc, themeColor: _folder.color),
                        ],
                      ),
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
