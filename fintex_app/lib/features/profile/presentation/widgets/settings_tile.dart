import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// One row inside a settings group: tinted icon, title, optional subtitle
/// and trailing widget (defaults to a chevron when tappable).
class SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const SettingsTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.primaryLight,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: AppColors.primary, size: 20),
      ),
      title: Text(
        title,
        style: const TextStyle(
          color: AppColors.textPrimary,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: subtitle != null
          ? Text(
              subtitle!,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
            )
          : null,
      trailing: trailing ?? (onTap != null ? const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary) : null),
    );
  }
}

/// Trailing "Deutsch >" / "English >" shown on the language setting.
class LanguageValueTrailing extends StatelessWidget {
  final String languageName;

  const LanguageValueTrailing({super.key, required this.languageName});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          languageName,
          style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary),
        ),
        const SizedBox(width: 4),
        const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary),
      ],
    );
  }
}
