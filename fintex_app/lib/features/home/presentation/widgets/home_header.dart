import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Top row of the home tab: profile picture, welcome text with the user's
/// name and today's date, plus notification and refresh buttons.
/// Kept flat (no card) so it blends with the page background.
class HomeHeader extends StatelessWidget {
  final String welcomeText;
  final String displayName;
  final VoidCallback onRefresh;
  final VoidCallback? onNotificationTap;

  const HomeHeader({
    super.key,
    required this.welcomeText,
    required this.displayName,
    required this.onRefresh,
    this.onNotificationTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
      child: Row(
        children: [
          _UserAvatar(displayName: displayName),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$welcomeText 👋',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.calendar_today_rounded, size: 12, color: AppColors.primary),
                    const SizedBox(width: 5),
                    Text(
                      _formattedDate(),
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _HeaderIconButton(
            icon: Icons.notifications_none_rounded,
            showDot: true,
            onPressed: onNotificationTap ?? () {},
          ),
          const SizedBox(width: 8),
          _HeaderIconButton(icon: Icons.sync_rounded, onPressed: onRefresh),
        ],
      ),
    );
  }

  /// Today's date as DD.MM.YYYY.
  static String _formattedDate() {
    final now = DateTime.now();
    String two(int v) => v.toString().padLeft(2, '0');
    return '${two(now.day)}.${two(now.month)}.${now.year}';
  }
}

/// Round profile picture with a thin teal–gold gradient ring.
class _UserAvatar extends StatelessWidget {
  final String displayName;

  const _UserAvatar({required this.displayName});

  @override
  Widget build(BuildContext context) {
    final fallback = _AvatarFallback(displayName: displayName);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(2),
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.primary, AppColors.accentGold],
            ),
          ),
          child: Container(
            padding: const EdgeInsets.all(2),
            decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.background),
            child: ClipOval(
              child: SizedBox(
                width: 50,
                height: 50,
                child: Image.network(
                  'https://i.pravatar.cc/300?img=12',
                  fit: BoxFit.cover,
                  loadingBuilder: (context, child, progress) => progress == null ? child : fallback,
                  errorBuilder: (context, error, stackTrace) => fallback,
                ),
              ),
            ),
          ),
        ),
        Positioned(
          right: 1,
          bottom: 1,
          child: Container(
            width: 13,
            height: 13,
            decoration: BoxDecoration(
              color: const Color(0xFF22C55E),
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.background, width: 2.5),
            ),
          ),
        ),
      ],
    );
  }
}

/// Initial letter on a light teal background, shown while the picture loads
/// or if it fails.
class _AvatarFallback extends StatelessWidget {
  final String displayName;

  const _AvatarFallback({required this.displayName});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.primaryLight,
      alignment: Alignment.center,
      child: Text(
        displayName.isNotEmpty ? displayName[0].toUpperCase() : 'M',
        style: const TextStyle(
          color: AppColors.primary,
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

/// White rounded icon button with a soft shadow and optional gold dot.
class _HeaderIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;
  final bool showDot;

  const _HeaderIconButton({
    required this.icon,
    required this.onPressed,
    this.showDot = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(color: AppColors.shadowLight, blurRadius: 10, offset: Offset(0, 4)),
        ],
      ),
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.borderLight),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onPressed,
          child: SizedBox(
            width: 42,
            height: 42,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(icon, color: AppColors.textPrimary, size: 21),
                if (showDot)
                  Positioned(
                    top: 10,
                    right: 11,
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: AppColors.accentGold,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.surface, width: 1.5),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
