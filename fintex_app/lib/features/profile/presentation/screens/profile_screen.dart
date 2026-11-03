import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../services/auth_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../../authentication/presentation/screens/login_screen.dart';
import '../widgets/profile_header.dart';

class ProfileScreen extends StatefulWidget {
  final UserModel user;
  const ProfileScreen({super.key, required this.user});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _pushNotifications = true;

  void _handleLogout() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(Tr.get('logout')),
        content: Text(Tr.get('confirmLogout')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(Tr.get('cancel')),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () {
              AuthService.instance.logout();
              Navigator.pop(ctx);
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (route) => false,
              );
            },
            child: Text(Tr.get('logout')),
          ),
        ],
      ),
    );
  }

  void _toggleLanguage() {
    final nextLang = Tr.currentLang == 'en' ? 'de' : 'en';
    Tr.setLanguage(nextLang);
    AppSnackbar.info(
      context,
      nextLang == 'en' ? 'Language set to English' : 'Sprache auf Deutsch gewechselt',
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        final currentLanguageName = currentLang == 'en' ? 'English' : 'Deutsch';

        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            title: Text('${Tr.get('profile')} (${widget.user.clientNumber})'),
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
            child: Column(
              children: [
                // User Header Card
                ProfileHeader(user: widget.user),
                const SizedBox(height: 24),

                // Settings Group 1: Account & Security
                _buildSectionHeader(Tr.get('accountSecurity')),
                _buildSettingsContainer([
                  _SettingsTile(
                    icon: Icons.lock_outline_rounded,
                    title: Tr.get('changePassword'),
                    subtitle: Tr.get('lastChanged30Days'),
                    onTap: () => AppSnackbar.info(context, currentLang == 'en' ? 'Password change initiated.' : 'Passwortänderung initiiert.'),
                  ),
                  const Divider(),
                  _SettingsTile(
                    icon: Icons.shield_outlined,
                    title: Tr.get('gobdGdpr'),
                    subtitle: Tr.get('serverFrankfurt'),
                    trailing: const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 20),
                    onTap: () {},
                  ),
                ]),
                const SizedBox(height: 20),

                // Settings Group 2: App Preferences
                _buildSectionHeader(Tr.get('notifications')),
                _buildSettingsContainer([
                  _SettingsTile(
                    icon: Icons.notifications_none_rounded,
                    title: Tr.get('pushNotifications'),
                    subtitle: Tr.get('deadlineReminders'),
                    trailing: Switch.adaptive(
                      value: _pushNotifications,
                      activeThumbColor: AppColors.primary,
                      onChanged: (val) {
                        setState(() => _pushNotifications = val);
                        AppSnackbar.info(
                          context,
                          val
                              ? (currentLang == 'en' ? 'Notifications enabled' : 'Benachrichtigungen aktiviert')
                              : (currentLang == 'en' ? 'Notifications muted' : 'Benachrichtigungen stummgeschaltet'),
                        );
                      },
                    ),
                  ),
                  const Divider(),
                  _SettingsTile(
                    icon: Icons.language_rounded,
                    title: Tr.get('language'),
                    subtitle: currentLanguageName,
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          currentLanguageName,
                          style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary),
                      ],
                    ),
                    onTap: _toggleLanguage,
                  ),
                ]),
                const SizedBox(height: 20),

                // Settings Group 3: Legal & Support
                _buildSectionHeader(Tr.get('legalSupport')),
                _buildSettingsContainer([
                  _SettingsTile(
                    icon: Icons.privacy_tip_outlined,
                    title: Tr.get('privacyPolicy'),
                    onTap: () {},
                  ),
                  const Divider(),
                  _SettingsTile(
                    icon: Icons.support_agent_rounded,
                    title: Tr.get('contactSupport'),
                    subtitle: 'office@fintex.de • +49 (0) 69 123456',
                    onTap: () {},
                  ),
                ]),
                const SizedBox(height: 28),

                // Logout Button
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.error,
                      side: const BorderSide(color: AppColors.error),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    onPressed: _handleLogout,
                    icon: const Icon(Icons.logout_rounded),
                    label: Text(
                      Tr.get('logout'),
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'FinTax Mobile v1.0.0 (Build 42) • ${Tr.get('frankfurt')} (GDPR)',
                  style: const TextStyle(color: AppColors.textTertiary, fontSize: 11),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSectionHeader(String title) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(
          title,
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildSettingsContainer(List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(children: children),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingsTile({
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
