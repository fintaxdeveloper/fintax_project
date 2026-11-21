import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../models/document_item.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../../scanner/presentation/screens/camera_scan_screen.dart';
import '../widgets/document_list_tile.dart';
import '../widgets/period_selector.dart';
import '../widgets/section_info_card.dart';

class SectionDetailScreen extends StatefulWidget {
  final UserModel user;
  final String categoryKey;
  final String title;
  final String subtitle;
  final Color themeColor;

  const SectionDetailScreen({
    super.key,
    required this.user,
    required this.categoryKey,
    required this.title,
    required this.subtitle,
    required this.themeColor,
  });

  @override
  State<SectionDetailScreen> createState() => _SectionDetailScreenState();
}

class _SectionDetailScreenState extends State<SectionDetailScreen> {
  List<DocumentItem> _documents = [];
  bool _loading = true;
  String _selectedMonth = '10_Oktober 2026';

  @override
  void initState() {
    super.initState();
    _loadDocs();
  }

  Future<void> _loadDocs() async {
    setState(() => _loading = true);
    final all = await ApiService.fetchClientDocuments(clientId: widget.user.id);
    if (!mounted) return;
    setState(() {
      _documents = all.where((d) => d.category == widget.categoryKey).toList();
      _loading = false;
    });
  }

  Future<void> _openScanner() async {
    final res = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CameraScanScreen(user: widget.user, initialCategory: widget.categoryKey),
      ),
    );
    if (res == true) _loadDocs();
  }

  Widget _buildDocumentList() {
    if (_loading) {
      return const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: AppColors.primary)));
    }
    if (_documents.isEmpty) {
      return EmptyState(
        icon: Icons.folder_open_rounded,
        title: 'Noch keine Belege in diesem Ordner',
        subtitle: 'Tippen Sie unten auf "Beleg scannen", um Dokumente einzureichen.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _documents
          .map((doc) => DocumentListTile(document: doc, themeColor: widget.themeColor))
          .toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _loadDocs,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionInfoCard(
              title: widget.title,
              subtitle: widget.subtitle,
              themeColor: widget.themeColor,
              documentCount: _documents.length,
            ),
            const SizedBox(height: 20),

            PeriodSelector(
              value: _selectedMonth,
              onChanged: (val) => setState(() => _selectedMonth = val),
            ),
            const SizedBox(height: 16),

            _buildDocumentList(),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: widget.themeColor,
        foregroundColor: Colors.white,
        onPressed: _openScanner,
        icon: const Icon(Icons.camera_alt_rounded),
        label: const Text('Beleg Scannen', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}
