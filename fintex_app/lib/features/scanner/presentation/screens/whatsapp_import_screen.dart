import 'dart:math';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/section_title.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../widgets/target_folder_dropdown.dart';
import '../widgets/whatsapp_file_tile.dart';
import '../widgets/whatsapp_import_button.dart';
import '../widgets/whatsapp_info_banner.dart';

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
    } else {
      AppSnackbar.error(context, res['error']?.toString() ?? 'Upload fehlgeschlagen');
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
            const WhatsAppInfoBanner(),
            const SizedBox(height: 24),

            const SectionTitle('Gefundene WhatsApp-Anhänge'),
            const SizedBox(height: 10),

            ...List.generate(_simulatedWhatsAppFiles.length, (index) {
              final file = _simulatedWhatsAppFiles[index];
              return WhatsAppFileTile(
                title: file['title'],
                details: '${file['sender']} • ${file['size']} • ${file['date']}',
                icon: file['icon'],
                color: file['color'] as Color,
                isSelected: _selectedFileIndex == index,
                onTap: () => setState(() => _selectedFileIndex = index),
              );
            }),
            const SizedBox(height: 20),

            const SectionTitle('Zielordner in FinTax wählen'),
            const SizedBox(height: 8),

            TargetFolderDropdown(
              value: _selectedSection,
              onChanged: (val) => setState(() => _selectedSection = val),
            ),
            const SizedBox(height: 32),

            WhatsAppImportButton(
              isLoading: _uploading,
              onPressed: _importFile,
            ),
          ],
        ),
      ),
    );
  }
}
