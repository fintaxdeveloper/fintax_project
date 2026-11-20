import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Bottom camera controls: page counter, gallery button, shutter, close.
class ScannerControls extends StatelessWidget {
  final String pageInfo;
  final String galleryTooltip;
  final bool isProcessing;
  final VoidCallback onGallery;
  final VoidCallback onCapture;
  final VoidCallback onClose;

  const ScannerControls({
    super.key,
    required this.pageInfo,
    required this.galleryTooltip,
    required this.isProcessing,
    required this.onGallery,
    required this.onCapture,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          pageInfo,
          style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 18),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            IconButton(
              icon: const Icon(Icons.photo_library_rounded, color: Colors.white, size: 30),
              onPressed: isProcessing ? null : onGallery,
              tooltip: galleryTooltip,
            ),
            _ShutterButton(isProcessing: isProcessing, onTap: onCapture),
            IconButton(
              icon: const Icon(Icons.close_rounded, color: Colors.white, size: 30),
              onPressed: onClose,
            ),
          ],
        ),
      ],
    );
  }
}

class _ShutterButton extends StatelessWidget {
  final bool isProcessing;
  final VoidCallback onTap;

  const _ShutterButton({required this.isProcessing, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isProcessing ? null : onTap,
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
            child: isProcessing
                ? const Padding(
                    padding: EdgeInsets.all(18),
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.primary),
                  )
                : const Icon(Icons.camera_alt_rounded, color: AppColors.primary, size: 30),
          ),
        ),
      ),
    );
  }
}
