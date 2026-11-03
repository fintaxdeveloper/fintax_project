import 'dart:math';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';

class WhatsAppImportScreen extends StatefulWidget {
  final UserModel user;
  const WhatsAppImportScreen({super.key, required this.user});

  @override
  State<WhatsAppImportScreen> createState() => _WhatsAppImportScreenState();
}

class _WhatsAppImportScreenState extends State<WhatsAppImportScreen> {
  String _selectedSection = '01_FiBu';
  bool _uploading = false;
  int _selectedFileIndex = 0;

  final List<Map<String, dynamic>> _simulatedWhatsAppFiles = [
    {
      'title': 'Rechnung_Hotel_Muenchen_120.pdf',
      'sender': 'WhatsApp Chat: Reisekosten 2026',
      'size': '412 KB',
      'date': 'Heute, 14:15 Uhr',
      'icon': Icons.picture_as_pdf_rounded,
      'color': Colors.red,
    },
    {
      'title': 'Foto_Tankquittung_Aral.jpg',
      'sender': 'WhatsApp Chat: Buchhaltung Belege',
      'size': '1.8 MB',
      'date': 'Gestern, 18:30 Uhr',
      'icon': Icons.image_rounded,
      'color': Colors.blue,
    },
    {
      'title': 'Kontoauszug_EmiratesNBD_Dubai.pdf',
      'sender': 'WhatsApp Chat: UAE Subsidiary',
      'size': '850 KB',
      'date': '24. Okt, 09:12 Uhr',
      'icon': Icons.account_balance_rounded,
      'color': Colors.amber,
    },
  ];

  Future<void> _importFile() async {
    setState(() => _uploading = true);

    final selected = _simulatedWhatsAppFiles[_selectedFileIndex];
    final dummyBytes = List<int>.generate(2048, (i) => Random().nextInt(256));

    final res = await ApiService.uploadSimulatedDocument(
      filename: selected['title'],
      category: _selectedSection,
      clientId: widget.user.id,
      bytes: dummyBytes,
    );

    setState(() => _uploading = false);
    if (!mounted) return;

    if (res['success'] == true) {
      AppSnackbar.success(context, '✓ "${selected['title']}" via WhatsApp erfolgreich importiert!');
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('WhatsApp Beleg-Import'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // WhatsApp Header Banner
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.whatsapp.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.whatsapp.withValues(alpha: 0.3)),
              ),
              child: const Row(
                children: [
                  Text('💬', style: TextStyle(fontSize: 34)),
                  SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Über WhatsApp teilen (PDF S. 2)',
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Empfangene Dokumente oder Fotos direkt aus Chats in die FinTax Kanzlei-Ordner übernehmen.',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            const Text(
              'Gefundene WhatsApp-Anhänge',
              style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 15),
            ),
            const SizedBox(height: 10),

            // Files List
            ...List.generate(_simulatedWhatsAppFiles.length, (index) {
              final file = _simulatedWhatsAppFiles[index];
              final isSelected = _selectedFileIndex == index;

              return GestureDetector(
                onTap: () => setState(() => _selectedFileIndex = index),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isSelected ? AppColors.primary : AppColors.border,
                      width: isSelected ? 2 : 1,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: isSelected ? AppColors.primary.withValues(alpha: 0.1) : AppColors.shadowLight,
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: (file['color'] as Color).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(file['icon'], color: file['color'] as Color, size: 24),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              file['title'],
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${file['sender']} • ${file['size']} • ${file['date']}',
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      Icon(
                        isSelected ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                        color: isSelected ? AppColors.primary : AppColors.textTertiary,
                        size: 22,
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 20),

            // Target Section Dropdown
            const Text(
              'Zielordner in FinTax wählen',
              style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 15),
            ),
            const SizedBox(height: 8),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedSection,
                  isExpanded: true,
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w700),
                  items: const [
                    DropdownMenuItem(value: '01_FiBu', child: Text('📁 01_FiBu (Finanzbuchhaltung)')),
                    DropdownMenuItem(value: '02_LoBu', child: Text('👥 02_LoBu (Lohn & Personal)')),
                    DropdownMenuItem(value: '00_Schriftverkehr', child: Text('🏛️ 00_Schriftverkehr (Finanzamt)')),
                    DropdownMenuItem(value: '00_Gruendung', child: Text('📑 00_Gründung (Verträge)')),
                  ],
                  onChanged: (val) {
                    if (val != null) setState(() => _selectedSection = val);
                  },
                ),
              ),
            ),
            const SizedBox(height: 32),

            // Import Action Button
            SizedBox(
              height: 52,
              child: ElevatedButton.icon(
                onPressed: _uploading ? null : _importFile,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.whatsapp,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                icon: _uploading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.download_rounded),
                label: const Text(
                  'In FinTax importieren & KI starten',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
