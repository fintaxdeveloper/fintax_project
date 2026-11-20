import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../services/api_service.dart';
import '../../../authentication/models/user_model.dart';
import '../widgets/scan_category_selector.dart';
import '../widgets/scan_success_dialog.dart';
import '../widgets/scan_viewfinder.dart';
import '../widgets/scanner_controls.dart';

/// Document scanner with a live in-app camera preview.
/// Tapping the shutter takes a photo, shows it in the frame and uploads it
/// to the selected folder. The gallery button picks an existing photo.
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

enum _CameraState { starting, ready, permissionDenied, unavailable }

class _CameraScanScreenState extends State<CameraScanScreen> with WidgetsBindingObserver {
  final ImagePicker _picker = ImagePicker();

  CameraController? _controller;
  _CameraState _cameraState = _CameraState.starting;

  late String _selectedCategory;
  bool _flashOn = false;
  bool _isProcessing = false;
  Uint8List? _capturedImageBytes;

  @override
  void initState() {
    super.initState();
    _selectedCategory = widget.initialCategory;
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  /// Release the camera when the app goes to the background and
  /// start it again when the user comes back.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (state == AppLifecycleState.inactive) {
      if (controller == null || !controller.value.isInitialized) return;
      _controller = null;
      controller.dispose();
      if (mounted) setState(() => _cameraState = _CameraState.starting);
    } else if (state == AppLifecycleState.resumed && _controller == null) {
      _initCamera();
    }
  }

  Future<void> _initCamera() async {
    setState(() => _cameraState = _CameraState.starting);
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (mounted) setState(() => _cameraState = _CameraState.unavailable);
        return;
      }
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        back,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      await controller.setFlashMode(_flashOn ? FlashMode.always : FlashMode.off);

      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _cameraState = _CameraState.ready;
      });
    } on CameraException catch (e) {
      if (!mounted) return;
      final denied = e.code.contains('AccessDenied') || e.code.contains('Restricted');
      setState(() => _cameraState = denied ? _CameraState.permissionDenied : _CameraState.unavailable);
    } catch (_) {
      if (mounted) setState(() => _cameraState = _CameraState.unavailable);
    }
  }

  Future<void> _toggleFlash() async {
    final next = !_flashOn;
    setState(() => _flashOn = next);
    try {
      await _controller?.setFlashMode(next ? FlashMode.always : FlashMode.off);
    } catch (_) {
      // Some devices (e.g. front-only cameras) have no flash; ignore.
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      // No live camera: retry starting it, or fall back to the gallery.
      if (_cameraState == _CameraState.unavailable) {
        await _pickFromGallery();
      } else {
        await _initCamera();
      }
      return;
    }
    if (controller.value.isTakingPicture) return;

    setState(() => _isProcessing = true);
    try {
      final XFile photo = await controller.takePicture();
      final bytes = await photo.readAsBytes();
      if (!mounted) return;
      setState(() => _capturedImageBytes = bytes);
      await _upload(bytes, 'Scan_${DateTime.now().millisecondsSinceEpoch}.jpg');
    } on CameraException catch (_) {
      if (mounted) AppSnackbar.error(context, Tr.get('captureFailed'));
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _pickFromGallery() async {
    setState(() => _isProcessing = true);
    try {
      final XFile? image = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
      if (image == null) return; // user cancelled
      final bytes = await image.readAsBytes();
      if (!mounted) return;
      setState(() => _capturedImageBytes = bytes);
      await _upload(bytes, image.name);
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Error selecting image: $e');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _upload(Uint8List bytes, String filename) async {
    final res = await ApiService.uploadSimulatedDocument(
      filename: filename,
      category: _selectedCategory,
      clientId: widget.user.id,
      bytes: bytes,
    );
    if (!mounted) return;

    if (res['success'] != true) {
      setState(() => _capturedImageBytes = null); // back to live preview
      AppSnackbar.error(context, Tr.get('uploadFailed'));
      return;
    }

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => ScanSuccessDialog(
        title: Tr.get('scanUploaded'),
        filename: filename,
        message: Tr.get('scanSavedTo').replaceAll('{folder}', _selectedCategory),
        onOk: () => Navigator.pop(dialogContext),
      ),
    );
    if (mounted) Navigator.pop(context, true); // report success to the caller
  }

  /// Live preview scaled to fill the frame (crop instead of letterbox).
  Widget? _buildPreview() {
    final controller = _controller;
    if (_cameraState != _CameraState.ready || controller == null || !controller.value.isInitialized) {
      return null;
    }
    final size = controller.value.previewSize;
    if (size == null) return CameraPreview(controller);
    return FittedBox(
      fit: BoxFit.cover,
      child: SizedBox(
        // previewSize is reported in landscape; swap for portrait.
        width: size.height,
        height: size.width,
        child: CameraPreview(controller),
      ),
    );
  }

  /// Message shown in the frame when the camera is not running.
  Widget? _buildMessage() {
    switch (_cameraState) {
      case _CameraState.ready:
        return null;
      case _CameraState.starting:
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(color: AppColors.accentGold),
            const SizedBox(height: 14),
            Text(Tr.get('cameraStarting'), style: const TextStyle(color: Colors.white70, fontSize: 13)),
          ],
        );
      case _CameraState.permissionDenied:
      case _CameraState.unavailable:
        final denied = _cameraState == _CameraState.permissionDenied;
        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(denied ? Icons.no_photography_rounded : Icons.videocam_off_rounded,
                  color: Colors.white70, size: 48),
              const SizedBox(height: 12),
              Text(
                Tr.get(denied ? 'cameraPermissionDenied' : 'cameraUnavailable'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _initCamera,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.accentGold,
                  side: const BorderSide(color: AppColors.accentGold),
                ),
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: Text(Tr.get('tryAgain')),
              ),
            ],
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, _, _) {
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
                onPressed: _cameraState == _CameraState.ready ? _toggleFlash : null,
              ),
            ],
          ),
          body: Stack(
            children: [
              Positioned.fill(
                child: ScanViewfinder(
                  imageBytes: _capturedImageBytes,
                  preview: _buildPreview(),
                  message: _buildMessage(),
                  alignHint: Tr.get('alignDocument'),
                  autoEdgeLabel: Tr.get('autoEdge'),
                ),
              ),

              Positioned(
                top: 12,
                left: 20,
                right: 20,
                child: ScanCategorySelector(
                  sectionLabel: Tr.get('section'),
                  value: _selectedCategory,
                  onChanged: (val) => setState(() => _selectedCategory = val),
                ),
              ),

              Positioned(
                bottom: 32,
                left: 0,
                right: 0,
                child: ScannerControls(
                  pageInfo: '${Tr.get('page')} 1 · ${Tr.get('multiPageHint')}',
                  galleryTooltip: Tr.get('chooseFile'),
                  isProcessing: _isProcessing,
                  onGallery: _pickFromGallery,
                  onCapture: _capture,
                  onClose: () => Navigator.pop(context),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
