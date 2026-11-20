import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/scan_corner_marker.dart';

/// Decorative camera-frame preview with corner brackets and a gold
/// "invoice detected" pill.
class ScanPreviewCard extends StatelessWidget {
  final String badgeLabel;

  const ScanPreviewCard({super.key, required this.badgeLabel});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 260,
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          const Positioned(left: 36, top: 36, child: ScanCornerMarker(top: true, left: true)),
          const Positioned(right: 36, top: 36, child: ScanCornerMarker(top: true, left: false)),
          const Positioned(left: 36, bottom: 36, child: ScanCornerMarker(top: false, left: true)),
          const Positioned(right: 36, bottom: 36, child: ScanCornerMarker(top: false, left: false)),

          Container(
            width: 170,
            height: 110,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white24),
            ),
          ),

          Positioned(
            bottom: 24,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.accentGold,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                badgeLabel,
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
    );
  }
}
