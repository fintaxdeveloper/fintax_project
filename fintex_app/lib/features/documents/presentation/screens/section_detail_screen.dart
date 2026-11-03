import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../../../models/document_item.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../../scanner/presentation/screens/camera_scan_screen.dart';

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
    final all = await ApiService.fetchClientDocuments();
    if (!mounted) return;
    setState(() {
      _documents = all.where((d) => d.category == widget.categoryKey || widget.categoryKey == '01_FiBu').toList();
      _loading = false;
    });
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
            // Section Info Card
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: widget.themeColor.withValues(alpha: 0.3)),
                boxShadow: const [
                  BoxShadow(color: AppColors.shadowLight, blurRadius: 10, offset: Offset(0, 4)),
                ],
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: widget.themeColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(Icons.folder_open_rounded, color: widget.themeColor, size: 28),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.title,
                          style: TextStyle(
                            color: widget.themeColor,
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.subtitle,
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.borderLight,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '${_documents.length} Dokumente archiviert',
                            style: const TextStyle(
                              color: AppColors.textPrimary,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Period Selector
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Abrechnungszeitraum:',
                  style: TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w700),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _selectedMonth,
                      style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w700),
                      items: const [
                        DropdownMenuItem(value: '10_Oktober 2026', child: Text('10_Oktober 2026')),
                        DropdownMenuItem(value: '09_September 2026', child: Text('09_September 2026')),
                        DropdownMenuItem(value: '08_August 2026', child: Text('08_August 2026')),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _selectedMonth = val);
                      },
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Documents List
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: AppColors.primary)))
            else if (_documents.isEmpty)
              EmptyState(
                icon: Icons.folder_open_rounded,
                title: 'Noch keine Belege in diesem Ordner',
                subtitle: 'Tippen Sie unten auf "Beleg scannen", um Dokumente einzureichen.',
              )
            else
              ..._documents.map((doc) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                  boxShadow: const [BoxShadow(color: AppColors.shadowLight, blurRadius: 6, offset: Offset(0, 2))],
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: widget.themeColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(Icons.description_outlined, color: widget.themeColor, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            doc.originalFilename,
                            style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 13),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${doc.supplierName ?? 'FinTax Vault'} • ${doc.date}',
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        if (doc.totalAmount != null)
                          Text(
                            '${doc.totalAmount!.toStringAsFixed(2)} €',
                            style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 13),
                          ),
                        const SizedBox(height: 4),
                        StatusBadge.fromStatus(doc.status),
                      ],
                    ),
                  ],
                ),
              )),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: widget.themeColor,
        foregroundColor: Colors.white,
        onPressed: () async {
          final res = await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => CameraScanScreen(user: widget.user, initialCategory: widget.categoryKey),
            ),
          );
          if (res == true) _loadDocs();
        },
        icon: const Icon(Icons.camera_alt_rounded),
        label: const Text('Beleg Scannen', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}
