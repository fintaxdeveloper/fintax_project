import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Light, pastel card at the top of a folder tab: icon, title, subtitle,
/// document count and three quick upload buttons.
class FolderSummaryCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final Color lightColor;
  final String title;
  final String subtitle;
  final String countLabel;
  final String scanLabel;
  final String fileLabel;
  final String whatsAppLabel;
  final VoidCallback onScan;
  final VoidCallback onFile;
  final VoidCallback onWhatsApp;

  const FolderSummaryCard({
    super.key,
    required this.icon,
    required this.color,
    required this.lightColor,
    required this.title,
    required this.subtitle,
    required this.countLabel,
    required this.scanLabel,
    required this.fileLabel,
    required this.whatsAppLabel,
    required this.onScan,
    required this.onFile,
    required this.onWhatsApp,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [lightColor, Colors.white],
        ),
        border: Border.all(color: color.withValues(alpha: 0.15)),
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            top: -40,
            right: -30,
            child: Container(
              width: 130,
              height: 130,
              decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.06)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: color.withValues(alpha: 0.15)),
                      ),
                      child: Icon(icon, color: color, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.textPrimary, fontSize: 17, fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: color.withValues(alpha: 0.25)),
                      ),
                      child: Text(
                        countLabel,
                        style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _QuickButton(icon: Icons.document_scanner_rounded, label: scanLabel, onTap: onScan, color: color, primary: true)),
                    const SizedBox(width: 8),
                    Expanded(child: _QuickButton(icon: Icons.upload_file_rounded, label: fileLabel, onTap: onFile, color: color)),
                    const SizedBox(width: 8),
                    Expanded(child: _QuickButton(icon: Icons.chat_rounded, label: whatsAppLabel, onTap: onWhatsApp, color: color)),
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

class _QuickButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;
  final Color color;

  const _QuickButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.color,
    this.primary = false,
  });

  @override
  Widget build(BuildContext context) {
    // Primary button: soft tinted fill; others: white with a light border.
    return Material(
      color: primary ? color.withValues(alpha: 0.12) : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: color.withValues(alpha: primary ? 0.25 : 0.12)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          child: Column(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(height: 4),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
