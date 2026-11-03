import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../authentication/models/user_model.dart';
import '../../../scanner/presentation/screens/camera_scan_screen.dart';
import '../../../scanner/presentation/screens/whatsapp_import_screen.dart';

class DocumentsScreen extends StatefulWidget {
  final UserModel user;
  const DocumentsScreen({super.key, required this.user});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  int _selectedCategoryIndex = 0;

  void _openCameraScan() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CameraScanScreen(
          user: widget.user,
          initialCategory: _selectedCategoryIndex == 0
              ? '01_FiBu'
              : _selectedCategoryIndex == 1
                  ? '02_LoBu'
                  : '00_Schriftverkehr',
        ),
      ),
    );
  }

  void _openWhatsAppImport() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => WhatsAppImportScreen(user: widget.user),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        final categories = [
          Tr.get('accounting'),
          Tr.get('payroll'),
          Tr.get('letters'),
        ];

        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title Header
                  Text(
                    Tr.get('addDocument'),
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    Tr.get('pickFolderSub'),
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Segmented Folder Selector
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE2ECEB),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: List.generate(categories.length, (index) {
                        final isSelected = _selectedCategoryIndex == index;
                        return Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() => _selectedCategoryIndex = index),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: isSelected ? AppColors.surface : Colors.transparent,
                                borderRadius: BorderRadius.circular(12),
                                boxShadow: isSelected
                                    ? [
                                        BoxShadow(
                                          color: Colors.black.withValues(alpha: 0.05),
                                          blurRadius: 6,
                                          offset: const Offset(0, 2),
                                        ),
                                      ]
                                    : null,
                              ),
                              child: Center(
                                child: Text(
                                  categories[index],
                                  style: TextStyle(
                                    color: isSelected ? AppColors.primary : AppColors.textSecondary,
                                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Camera Frame View Card
                  Container(
                    height: 260,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Positioned(
                          left: 36,
                          top: 36,
                          child: _cornerMarker(top: true, left: true),
                        ),
                        Positioned(
                          right: 36,
                          top: 36,
                          child: _cornerMarker(top: true, left: false),
                        ),
                        Positioned(
                          left: 36,
                          bottom: 36,
                          child: _cornerMarker(top: false, left: true),
                        ),
                        Positioned(
                          right: 36,
                          bottom: 36,
                          child: _cornerMarker(top: false, left: false),
                        ),

                        // Inner Preview Box
                        Container(
                          width: 170,
                          height: 110,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.white24),
                          ),
                        ),

                        // Gold Pill "Invoice detected" Badge
                        Positioned(
                          bottom: 24,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                            decoration: BoxDecoration(
                              color: AppColors.accentGold,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              Tr.get('invoiceDetected'),
                              style: const TextStyle(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w900,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Main Action Button: Scan with camera
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton.icon(
                      onPressed: _openCameraScan,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(27),
                        ),
                        elevation: 0,
                      ),
                      icon: const Icon(Icons.crop_free_rounded, size: 22),
                      label: Text(
                        Tr.get('scanWithCamera'),
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Secondary Buttons Row: Choose file & From WhatsApp
                  Row(
                    children: [
                      Expanded(
                        child: SizedBox(
                          height: 52,
                          child: OutlinedButton(
                            onPressed: _openCameraScan,
                            style: OutlinedButton.styleFrom(
                              backgroundColor: AppColors.surface,
                              side: const BorderSide(color: AppColors.border),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                            child: Text(
                              Tr.get('chooseFile'),
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: SizedBox(
                          height: 52,
                          child: OutlinedButton(
                            onPressed: _openWhatsAppImport,
                            style: OutlinedButton.styleFrom(
                              backgroundColor: AppColors.surface,
                              side: const BorderSide(color: AppColors.border),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                            child: Text(
                              Tr.get('fromWhatsApp'),
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Subtext
                  Center(
                    child: Text(
                      Tr.get('uploadHintText'),
                      style: const TextStyle(
                        color: AppColors.textTertiary,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
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

  Widget _cornerMarker({required bool top, required bool left}) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        border: Border(
          top: top ? const BorderSide(color: Colors.white, width: 3.5) : BorderSide.none,
          bottom: !top ? const BorderSide(color: Colors.white, width: 3.5) : BorderSide.none,
          left: left ? const BorderSide(color: Colors.white, width: 3.5) : BorderSide.none,
          right: !left ? const BorderSide(color: Colors.white, width: 3.5) : BorderSide.none,
        ),
      ),
    );
  }
}
