import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../authentication/models/user_model.dart';

/// Teal gradient header card with the user's profile picture, greeting,
/// name, client number and GoBD badge.
class HomeAppBar extends StatelessWidget {
  final UserModel user;
  final String greeting;

  /// Placeholder avatar until real profile pictures exist.
  static const String _dummyAvatarUrl = 'https://i.pravatar.cc/300?img=12';

  const HomeAppBar({
    super.key,
    required this.user,
    required this.greeting,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF12777B), AppColors.primary, AppColors.primaryDark],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.35),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Stack(
        children: [
          // Decorative shapes
          Positioned(top: -50, right: -30, child: _circle(160, Colors.white.withValues(alpha: 0.06))),
          Positioned(bottom: -60, left: -40, child: _circle(140, Colors.white.withValues(alpha: 0.04))),
          Positioned(top: 18, right: 120, child: _circle(10, AppColors.accentGold.withValues(alpha: 0.9))),

          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _ProfileAvatar(imageUrl: _dummyAvatarUrl, initials: user.initials),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            greeting,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.75),
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user.displayName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 21,
                              fontWeight: FontWeight.w800,
                              height: 1.2,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    const _NotificationButton(),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    _GlassChip(
                      icon: Icons.badge_outlined,
                      label: user.clientNumber,
                    ),
                    const SizedBox(width: 8),
                    const _GlassChip(
                      icon: Icons.verified_user_rounded,
                      label: 'GoBD',
                      iconColor: AppColors.accentGold,
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

  static Widget _circle(double size, Color color) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      );
}

/// Round profile picture with a gold ring, online dot and initials fallback.
class _ProfileAvatar extends StatelessWidget {
  final String imageUrl;
  final String initials;

  const _ProfileAvatar({required this.imageUrl, required this.initials});

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      color: AppColors.primaryLight,
      alignment: Alignment.center,
      child: Text(
        initials,
        style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 20),
      ),
    );

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(2.5),
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              colors: [AppColors.accentGold, Color(0xFFFFE08A)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Container(
            padding: const EdgeInsets.all(2),
            decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.primary),
            child: ClipOval(
              child: SizedBox(
                width: 56,
                height: 56,
                child: Image.network(
                  imageUrl,
                  fit: BoxFit.cover,
                  loadingBuilder: (context, child, progress) => progress == null ? child : fallback,
                  errorBuilder: (context, error, stackTrace) => fallback,
                ),
              ),
            ),
          ),
        ),
        Positioned(
          right: 2,
          bottom: 2,
          child: Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(
              color: const Color(0xFF22C55E),
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.primary, width: 2.5),
            ),
          ),
        ),
      ],
    );
  }
}

/// Translucent bell button with an unread dot.
class _NotificationButton extends StatelessWidget {
  const _NotificationButton();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {},
        child: const SizedBox(
          width: 44,
          height: 44,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(Icons.notifications_none_rounded, color: Colors.white, size: 22),
              Positioned(
                top: 11,
                right: 12,
                child: SizedBox(
                  width: 8,
                  height: 8,
                  child: DecoratedBox(
                    decoration: BoxDecoration(color: AppColors.accentGold, shape: BoxShape.circle),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small frosted pill used for the client number and GoBD badge.
class _GlassChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color iconColor;

  const _GlassChip({
    required this.icon,
    required this.label,
    this.iconColor = Colors.white,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: iconColor),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.3),
          ),
        ],
      ),
    );
  }
}
