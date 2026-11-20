import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/scan_corner_marker.dart';

/// Gold-framed camera viewfinder.
/// Shows, in order of priority: the captured image, the live camera
/// [preview], or an "align document" hint / [message] when no camera is ready.
class ScanViewfinder extends StatelessWidget {
  final Uint8List? imageBytes;
  final Widget? preview;
  final Widget? message;
  final String alignHint;
  final String autoEdgeLabel;

  const ScanViewfinder({
    super.key,
    required this.imageBytes,
    required this.alignHint,
    required this.autoEdgeLabel,
    this.preview,
    this.message,
  });

  @override
  Widget build(BuildContext context) {
    final showLive = imageBytes == null && preview != null;

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 76, 20, 190),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.accentGold, width: 2),
        borderRadius: BorderRadius.circular(24),
        color: Colors.white.withValues(alpha: 0.05),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (imageBytes != null)
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: Image.memory(imageBytes!, fit: BoxFit.cover),
              ),
            ),

          if (showLive)
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: preview!,
              ),
            ),

          const Positioned(top: 0, left: 0, child: _GoldCorner(top: true, left: true)),
          const Positioned(top: 0, right: 0, child: _GoldCorner(top: true, left: false)),
          const Positioned(bottom: 0, left: 0, child: _GoldCorner(top: false, left: true)),
          const Positioned(bottom: 0, right: 0, child: _GoldCorner(top: false, left: false)),

          if (imageBytes == null && !showLive)
            Center(child: message ?? _AlignHint(hint: alignHint, autoEdgeLabel: autoEdgeLabel)),

          if (showLive)
            Positioned(
              bottom: 14,
              child: _AlignHint(hint: alignHint, autoEdgeLabel: autoEdgeLabel, compact: true),
            ),
        ],
      ),
    );
  }
}

class _GoldCorner extends StatelessWidget {
  final bool top;
  final bool left;

  const _GoldCorner({required this.top, required this.left});

  @override
  Widget build(BuildContext context) {
    return ScanCornerMarker(top: top, left: left, color: AppColors.accentGold, strokeWidth: 4);
  }
}

class _AlignHint extends StatelessWidget {
  final String hint;
  final String autoEdgeLabel;
  final bool compact;

  const _AlignHint({required this.hint, required this.autoEdgeLabel, this.compact = false});

  @override
  Widget build(BuildContext context) {
    // Small pill over the live camera image
    if (compact) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          hint,
          style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.document_scanner_rounded, size: 56, color: Colors.white.withValues(alpha: 0.85)),
        const SizedBox(height: 14),
        Text(
          hint,
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
            autoEdgeLabel,
            style: const TextStyle(color: AppColors.accentGold, fontSize: 11, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}
