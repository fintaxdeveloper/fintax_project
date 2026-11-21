import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../authentication/models/user_model.dart';

/// Profile card at the top of the profile tab: large round photo with a
/// teal→gold ring, name, email and client chips on a light pastel card.
class ProfileHeader extends StatelessWidget {
  final UserModel user;
  final VoidCallback? onEditTap;

  const ProfileHeader({super.key, required this.user, this.onEditTap});

  @override
  Widget build(BuildContext context) {
    final company = user.companyName;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [AppColors.primaryLight, AppColors.surface],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.10)),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Stack(
          children: [
            // Soft decorative circles
            Positioned(
              top: -34,
              right: -26,
              child: _Blob(
                size: 100,
                color: AppColors.accentGold.withValues(alpha: 0.12),
              ),
            ),
            Positioned(
              top: 24,
              left: -36,
              child: _Blob(
                size: 76,
                color: AppColors.primary.withValues(alpha: 0.06),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: onEditTap,
                    child: _Avatar(
                      initials: user.initials,
                      avatarUrl: user.resolvedAvatarUrl,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                user.displayName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: AppColors.textPrimary,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.3,
                                ),
                              ),
                            ),
                            if (onEditTap != null)
                              IconButton(
                                onPressed: onEditTap,
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                                icon: const Icon(Icons.edit_rounded, size: 18, color: AppColors.primary),
                                tooltip: 'Edit Profile',
                              ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            const Icon(
                              Icons.mail_outline_rounded,
                              size: 13,
                              color: AppColors.textSecondary,
                            ),
                            const SizedBox(width: 5),
                            Flexible(
                              child: Text(
                                user.email,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            _InfoChip(
                              icon: Icons.badge_outlined,
                              label: 'Mandant ${user.clientNumber}',
                              color: AppColors.primary,
                              background: AppColors.surface,
                            ),
                            if (company != null && company.isNotEmpty)
                              _InfoChip(
                                icon: Icons.business_rounded,
                                label: company,
                                color: AppColors.indigoIcon,
                                background: AppColors.indigoBox,
                              ),
                            if (user.phone != null && user.phone!.isNotEmpty)
                              _InfoChip(
                                icon: Icons.phone_outlined,
                                label: user.phone!,
                                color: AppColors.textPrimary,
                                background: AppColors.surface,
                              ),
                            if (user.city != null && user.city!.isNotEmpty)
                              _InfoChip(
                                icon: Icons.location_on_outlined,
                                label: user.city!,
                                color: AppColors.indigoIcon,
                                background: AppColors.indigoBox,
                              ),
                            const _InfoChip(
                              icon: Icons.verified_rounded,
                              label: 'Verified',
                              color: AppColors.success,
                              background: AppColors.successLight,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String initials;
  final String? avatarUrl;
  const _Avatar({required this.initials, this.avatarUrl});

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primaryDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initials,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
      ),
    );

    return SizedBox(
      width: 76,
      height: 76,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Gradient ring
          Container(
            padding: const EdgeInsets.all(2.5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                colors: [AppColors.primary, AppColors.accentGold],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.25),
                  blurRadius: 12,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Container(
              padding: const EdgeInsets.all(2.5),
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: ClipOval(
                child: avatarUrl != null && avatarUrl!.isNotEmpty
                    ? Image.network(
                        avatarUrl!,
                        width: 66,
                        height: 66,
                        fit: BoxFit.cover,
                        loadingBuilder: (context, child, progress) =>
                            progress == null ? child : fallback,
                        errorBuilder: (context, error, stackTrace) => fallback,
                      )
                    : SizedBox(width: 66, height: 66, child: fallback),
              ),
            ),
          ),
          // Camera / edit badge
          Positioned(
            right: -2,
            bottom: 0,
            child: Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: AppColors.accentGold,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: const Icon(
                Icons.camera_alt_rounded,
                size: 11,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Color background;

  const _InfoChip({
    required this.icon,
    required this.label,
    required this.color,
    required this.background,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  final double size;
  final Color color;
  const _Blob({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}
