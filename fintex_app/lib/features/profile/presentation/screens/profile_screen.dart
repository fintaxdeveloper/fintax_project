import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../services/api_service.dart';
import '../../../../services/auth_service.dart';
import '../../../authentication/models/user_model.dart';
import '../../../authentication/presentation/screens/login_screen.dart';
import '../widgets/logout_button.dart';
import '../widgets/logout_confirm_dialog.dart';
import '../widgets/profile_header.dart';
import '../widgets/settings_section.dart';
import '../widgets/settings_tile.dart';
import 'edit_profile_screen.dart';

class ProfileScreen extends StatefulWidget {
  final UserModel user;
  const ProfileScreen({super.key, required this.user});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _pushNotifications = true;
  late UserModel _user;

  @override
  void initState() {
    super.initState();
    _user = AuthService.instance.currentUser ?? widget.user;
    _refreshFromServer();
  }

  Future<void> _refreshFromServer() async {
    final data = await ApiService.fetchProfile(_user.id);
    if (!mounted || data == null) return;
    final refreshed = UserModel.fromJson(data, _user.token);
    AuthService.instance.setUser(refreshed);
    setState(() => _user = refreshed);
  }

  Future<void> _openEditProfile() async {
    final updated = await Navigator.push<UserModel>(
      context,
      MaterialPageRoute(builder: (_) => EditProfileScreen(user: _user)),
    );
    if (updated != null && mounted) {
      setState(() => _user = updated);
    }
  }

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

  Future<void> _openChangePasswordDialog(String currentLang) async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    bool saving = false;
    String? err;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: Text(Tr.get('changePassword'), style: const TextStyle(fontWeight: FontWeight.w800)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: currentCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: currentLang == 'en' ? 'Current password' : 'Aktuelles Passwort',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: newCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: currentLang == 'en' ? 'New password' : 'Neues Passwort',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: confirmCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: currentLang == 'en' ? 'Confirm password' : 'Passwort bestätigen',
                ),
              ),
              if (err != null) ...[
                const SizedBox(height: 10),
                Text(err!, style: const TextStyle(color: AppColors.error, fontSize: 12)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(ctx),
              child: Text(Tr.get('cancel')),
            ),
            ElevatedButton(
              onPressed: saving
                  ? null
                  : () async {
                      if (newCtrl.text.trim().length < 6) {
                        setDialogState(() => err = currentLang == 'en'
                            ? 'Password must be at least 6 characters.'
                            : 'Mindestens 6 Zeichen erforderlich.');
                        return;
                      }
                      if (newCtrl.text.trim() != confirmCtrl.text.trim()) {
                        setDialogState(() => err = currentLang == 'en'
                            ? 'Passwords do not match.'
                            : 'Passwörter stimmen nicht überein.');
                        return;
                      }
                      setDialogState(() {
                        saving = true;
                        err = null;
                      });
                      final res = await ApiService.changePassword(
                        userId: widget.user.id,
                        currentPassword: currentCtrl.text.trim(),
                        newPassword: newCtrl.text.trim(),
                      );
                      if (res['success'] == true) {
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (mounted) {
                          AppSnackbar.success(
                            context,
                            currentLang == 'en' ? 'Password updated!' : 'Passwort erfolgreich geändert!',
                          );
                        }
                      } else {
                        setDialogState(() {
                          saving = false;
                          err = res['error']?.toString() ?? 'Error';
                        });
                      }
                    },
              child: Text(saving ? '...' : (currentLang == 'en' ? 'Save' : 'Speichern')),
            ),
          ],
        ),
      ),
    );
    currentCtrl.dispose();
    newCtrl.dispose();
    confirmCtrl.dispose();
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
            title: Text('${Tr.get('profile')} (${_user.clientNumber})'),
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
            child: Column(
              children: [
                ProfileHeader(user: _user, onEditTap: _openEditProfile),
                const SizedBox(height: 24),

                SettingsSection(
                  title: Tr.get('accountSecurity'),
                  children: [
                    SettingsTile(
                      icon: Icons.person_outline_rounded,
                      title: currentLang == 'en' ? 'Edit Profile' : 'Profil bearbeiten',
                      subtitle: currentLang == 'en'
                          ? 'Name, photo, phone & city'
                          : 'Name, Foto, Telefon & Stadt',
                      onTap: _openEditProfile,
                    ),
                    const Divider(),
                    SettingsTile(
                      icon: Icons.lock_outline_rounded,
                      title: Tr.get('changePassword'),
                      subtitle: Tr.get('lastChanged30Days'),
                      onTap: () => _openChangePasswordDialog(currentLang),
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
