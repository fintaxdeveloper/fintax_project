import 'dart:typed_data';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';

class CameraScanScreen extends StatefulWidget {
  final UserModel user;
  final String initialCategory;

  const CameraScanScreen({
    super.key,
    required this.user,
    this.initialCategory = '01_FiBu',
  });

  @override
  State<CameraScanScreen> createState() => _CameraScanScreenState();
}

class _CameraScanScreenState extends State<CameraScanScreen> {
  final ImagePicker _picker = ImagePicker();
  late String _selectedCategory;
  bool _flashOn = false;
  int _pageCount = 1;
  bool _isProcessing = false;
  Uint8List? _capturedImageBytes;
  String? _capturedFilename;

  @override
  void initState() {
    super.initState();
    _selectedCategory = widget.initialCategory;
  }

  Future<void> _captureWithCamera() async {
    setState(() => _isProcessing = true);

    try {
      final XFile? photo = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
      );

      if (photo != null) {
        final bytes = await photo.readAsBytes();
        setState(() {
          _capturedImageBytes = bytes;
          _capturedFilename = photo.name;
        });
        await _processAndUploadDocument(bytes, photo.name);
      } else {
        // Fallback capture simulation for emulators without active camera
        final dummyBytes = Uint8List.fromList(List<int>.generate(2048, (i) => Random().nextInt(256)));
        final filename = 'Scan_${DateTime.now().millisecondsSinceEpoch}.pdf';
        await _processAndUploadDocument(dummyBytes, filename);
      }
    } catch (e) {
      // In case camera permission denied or running on desktop/emulator without camera
      final dummyBytes = Uint8List.fromList(List<int>.generate(2048, (i) => Random().nextInt(256)));
      final filename = 'Scan_${DateTime.now().millisecondsSinceEpoch}.pdf';
      await _processAndUploadDocument(dummyBytes, filename);
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _pickFromGallery() async {
    setState(() => _isProcessing = true);
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
      );

      if (image != null) {
        final bytes = await image.readAsBytes();
        setState(() {
          _capturedImageBytes = bytes;
          _capturedFilename = image.name;
        });
        await _processAndUploadDocument(bytes, image.name);
      }
    } catch (e) {
      AppSnackbar.error(context, 'Error selecting image: $e');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _processAndUploadDocument(Uint8List bytes, String filename) async {
    final res = await ApiService.uploadSimulatedDocument(
      filename: filename,
      category: _selectedCategory,
      clientId: widget.user.id,
      bytes: bytes,
    );

    if (!mounted) return;

    if (res['success'] == true) {
      showDialog(
        context: context,
        builder: (_) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          backgroundColor: AppColors.surface,
          title: Row(
            children: [
              const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 28),
              const SizedBox(width: 10),
              Text(Tr.get('scanUploaded'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'File: $filename',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textPrimary),
              ),
              const SizedBox(height: 8),
              Text(
                'Document ($_pageCount page(s)) saved to $_selectedCategory and sent to AI validation module.',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4),
              ),
            ],
          ),
          actions: [
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context); // close dialog
                Navigator.pop(context, true); // return success to parent screen
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              ),
              child: const Text('OK', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          Tr.get('scanner'),
          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _flashOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
              color: _flashOn ? AppColors.accentGold : Colors.white,
            ),
            onPressed: () => setState(() => _flashOn = !_flashOn),
          ),
        ],
      ),
      body: Stack(
        children: [
          // Viewfinder Camera Preview Area
          Center(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              decoration: BoxDecoration(
                border: Border.all(color: AppColors.accentGold, width: 2),
                borderRadius: BorderRadius.circular(24),
                color: Colors.white.withValues(alpha: 0.05),
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Captured Image Preview if available
                  if (_capturedImageBytes != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(22),
                      child: Image.memory(
                        _capturedImageBytes!,
                        width: double.infinity,
                        height: double.infinity,
                        fit: BoxFit.cover,
                      ),
                    ),

                  const Positioned(top: 0, left: 0, child: _CornerMarker(top: true, left: true)),
                  const Positioned(top: 0, right: 0, child: _CornerMarker(top: true, left: false)),
                  const Positioned(bottom: 0, left: 0, child: _CornerMarker(top: false, left: true)),
                  const Positioned(bottom: 0, right: 0, child: _CornerMarker(top: false, left: false)),

                  if (_capturedImageBytes == null)
                    Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.document_scanner_rounded, size: 56, color: Colors.white.withValues(alpha: 0.85)),
                          const SizedBox(height: 14),
                          Text(
                            Tr.get('alignDocument'),
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.accentGold.withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: AppColors.accentGold),
                            ),
                            child: Text(
                              Tr.get('autoEdge'),
                              style: const TextStyle(color: AppColors.accentGold, fontSize: 11, fontWeight: FontWeight.w800),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),

          // Top Category Selector Pill
          Positioned(
            top: 12,
            left: 20,
            right: 20,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B).withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.white24),
              ),
              child: Row(
                children: [
                  const Icon(Icons.folder_rounded, size: 18, color: AppColors.accentGold),
                  const SizedBox(width: 8),
                  Text('${Tr.get("section")}: ', style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600)),
                  Expanded(
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _selectedCategory,
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                        items: const [
                          DropdownMenuItem(value: '01_FiBu', child: Text('01_FiBu (Accounting)')),
                          DropdownMenuItem(value: '02_LoBu', child: Text('02_LoBu (Payroll)')),
                          DropdownMenuItem(value: '00_Schriftverkehr', child: Text('00_Schriftverkehr (Letters)')),
                          DropdownMenuItem(value: '00_Gruendung', child: Text('00_Gründung (Formation)')),
                        ],
                        onChanged: (val) {
                          if (val != null) setState(() => _selectedCategory = val);
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bottom Controls (Gallery, Shutter Button, Close)
          Positioned(
            bottom: 32,
            left: 0,
            right: 0,
            child: Column(
              children: [
                Text(
                  '${Tr.get("page")} $_pageCount (${Tr.get("multiPageHint")})',
                  style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 18),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    // Open Gallery / Choose Image
                    IconButton(
                      icon: const Icon(Icons.photo_library_rounded, color: Colors.white, size: 30),
                      onPressed: _isProcessing ? null : _pickFromGallery,
                      tooltip: Tr.get('chooseFile'),
                    ),

                    // Shutter Button
                    GestureDetector(
                      onTap: _isProcessing ? null : _captureWithCamera,
                      child: Container(
                        width: 78,
                        height: 78,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 4),
                        ),
                        child: Center(
                          child: Container(
                            width: 62,
                            height: 62,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
                                colors: [AppColors.accentGold, AppColors.accentGoldDark],
                              ),
                            ),
                            child: _isProcessing
                                ? const Padding(
                                    padding: EdgeInsets.all(18),
                                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.primary),
                                  )
                                : const Icon(Icons.camera_alt_rounded, color: AppColors.primary, size: 30),
                          ),
                        ),
                      ),
                    ),

                    // Close
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: Colors.white, size: 30),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CornerMarker extends StatelessWidget {
  final bool top;
  final bool left;
  const _CornerMarker({required this.top, required this.left});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        border: Border(
          top: top ? const BorderSide(color: AppColors.accentGold, width: 4) : BorderSide.none,
          bottom: !top ? const BorderSide(color: AppColors.accentGold, width: 4) : BorderSide.none,
          left: left ? const BorderSide(color: AppColors.accentGold, width: 4) : BorderSide.none,
          right: !left ? const BorderSide(color: AppColors.accentGold, width: 4) : BorderSide.none,
        ),
      ),
    );
  }
}
