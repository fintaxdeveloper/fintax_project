import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../services/auth_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../../authentication/presentation/screens/login_screen.dart';
import '../widgets/logout_button.dart';
import '../widgets/logout_confirm_dialog.dart';
import '../widgets/profile_header.dart';
import '../widgets/settings_section.dart';
import '../widgets/settings_tile.dart';

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
      builder: (ctx) => LogoutConfirmDialog(
        title: Tr.get('logout'),
        message: Tr.get('confirmLogout'),
        cancelLabel: Tr.get('cancel'),
        onConfirm: () {
          AuthService.instance.logout();
          Navigator.pop(ctx);
          Navigator.pushAndRemoveUntil(
            context,
            MaterialPageRoute(builder: (_) => const LoginScreen()),
            (route) => false,
          );
        },
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

  void _onPushNotificationsChanged(bool val, String currentLang) {
    setState(() => _pushNotifications = val);
    AppSnackbar.info(
      context,
      val
          ? (currentLang == 'en' ? 'Notifications enabled' : 'Benachrichtigungen aktiviert')
          : (currentLang == 'en' ? 'Notifications muted' : 'Benachrichtigungen stummgeschaltet'),
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
                ProfileHeader(user: widget.user),
                const SizedBox(height: 24),

                SettingsSection(
                  title: Tr.get('accountSecurity'),
                  children: [
                    SettingsTile(
                      icon: Icons.lock_outline_rounded,
                      title: Tr.get('changePassword'),
                      subtitle: Tr.get('lastChanged30Days'),
                      onTap: () => AppSnackbar.info(context, currentLang == 'en' ? 'Password change initiated.' : 'Passwortänderung initiiert.'),
                    ),
                    const Divider(),
                    SettingsTile(
                      icon: Icons.shield_outlined,
                      title: Tr.get('gobdGdpr'),
                      subtitle: Tr.get('serverFrankfurt'),
                      trailing: const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 20),
                      onTap: () {},
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                SettingsSection(
                  title: Tr.get('notifications'),
                  children: [
                    SettingsTile(
                      icon: Icons.notifications_none_rounded,
                      title: Tr.get('pushNotifications'),
                      subtitle: Tr.get('deadlineReminders'),
                      trailing: Switch.adaptive(
                        value: _pushNotifications,
                        activeThumbColor: AppColors.primary,
                        onChanged: (val) => _onPushNotificationsChanged(val, currentLang),
                      ),
                    ),
                    const Divider(),
                    SettingsTile(
                      icon: Icons.language_rounded,
                      title: Tr.get('language'),
                      subtitle: currentLanguageName,
                      trailing: LanguageValueTrailing(languageName: currentLanguageName),
                      onTap: _toggleLanguage,
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                SettingsSection(
                  title: Tr.get('legalSupport'),
                  children: [
                    SettingsTile(
                      icon: Icons.privacy_tip_outlined,
                      title: Tr.get('privacyPolicy'),
                      onTap: () {},
                    ),
                    const Divider(),
                    SettingsTile(
                      icon: Icons.support_agent_rounded,
                      title: Tr.get('contactSupport'),
                      subtitle: 'office@fintex.de • +49 (0) 69 123456',
                      onTap: () {},
                    ),
                  ],
                ),
                const SizedBox(height: 28),

                LogoutButton(
                  label: Tr.get('logout'),
                  onPressed: _handleLogout,
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
}
