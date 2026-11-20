import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Compact folder card: coloured icon and status chip on top, title and
/// subtitle in the middle, action label with a round arrow at the bottom.
/// All texts are limited in lines so they always fit inside the card.
class HomeFolderCard extends StatelessWidget {
  final IconData icon;
  final Color iconBoxColor;
  final Color iconColor;
  final String title;
  final String? subtitle;
  final String badgeText;
  final String? actionLabel;
  final VoidCallback onTap;

  const HomeFolderCard({
    super.key,
    required this.icon,
    required this.iconBoxColor,
    required this.iconColor,
    required this.title,
    this.subtitle,
    required this.badgeText,
    this.actionLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(20);
    return Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: [
          BoxShadow(
            color: iconColor.withValues(alpha: 0.10),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: AppColors.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: iconColor.withValues(alpha: 0.12)),
        ),
        child: InkWell(
          onTap: onTap,
          child: Stack(
            children: [
              // Soft coloured circle in the top-right corner
              Positioned(
                top: -34,
                right: -34,
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: iconBoxColor.withValues(alpha: 0.7),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Icon + status chip
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(11),
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [iconColor.withValues(alpha: 0.75), iconColor],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: iconColor.withValues(alpha: 0.30),
                                blurRadius: 8,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          child: Icon(icon, color: Colors.white, size: 19),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Align(
                            alignment: Alignment.topRight,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: iconColor.withValues(alpha: 0.25)),
                              ),
                              child: Text(
                                badgeText,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: iconColor,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Title
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        height: 1.15,
                        letterSpacing: -0.2,
                      ),
                    ),

                    // Subtitle
                    if (subtitle != null) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 11.5,
                        ),
                      ),
                    ],

                    const Spacer(),

                    // Action label + round arrow
                    if (actionLabel != null)
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              actionLabel!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: iconColor,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              color: iconBoxColor,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(Icons.arrow_forward_rounded, color: iconColor, size: 14),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class HomeCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final int docCount;
  final VoidCallback onTap;

  const HomeCard({
    super.key,
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.docCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return HomeFolderCard(
      icon: icon,
      iconBoxColor: color.withValues(alpha: 0.15),
      iconColor: color,
      title: title,
      subtitle: subtitle,
      badgeText: '$docCount',
      onTap: onTap,
    );
  }
}
