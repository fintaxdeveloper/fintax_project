import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/primary_action_button.dart';
import '../../../../services/api_service.dart';
import '../../models/user_model.dart';
import '../../../home/presentation/screens/main_shell.dart';
import '../widgets/auth_error_banner.dart';
import '../widgets/labeled_password_field.dart';
import '../widgets/privacy_consent_tile.dart';
import '../widgets/privacy_notice_card.dart';

class FirstLoginScreen extends StatefulWidget {
  final UserModel user;
  final String? initialPassword;
  const FirstLoginScreen({super.key, required this.user, this.initialPassword});

  @override
  State<FirstLoginScreen> createState() => _FirstLoginScreenState();
}

class _FirstLoginScreenState extends State<FirstLoginScreen> {
  final _currentPwController = TextEditingController();
  final _newPwController = TextEditingController();
  final _confirmPwController = TextEditingController();
  bool _acceptedPrivacy = false;
  bool _obscureCurrent = true;
  bool _obscure1 = true;
  bool _obscure2 = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.initialPassword != null && widget.initialPassword!.isNotEmpty) {
      _currentPwController.text = widget.initialPassword!;
    }
  }

  Future<void> _submit() async {
    if (!_acceptedPrivacy) {
      setState(() => _error = 'Bitte Datenschutzerklärung bestätigen.');
      return;
    }
    if (_currentPwController.text.trim().isEmpty) {
      setState(() => _error = 'Bitte aktuelles Passwort eingeben.');
      return;
    }
    if (_newPwController.text.length < 6) {
      setState(() => _error = 'Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }
    if (_newPwController.text != _confirmPwController.text) {
      setState(() => _error = 'Die Passwörter stimmen nicht überein.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    final pwRes = await ApiService.changePassword(
      userId: widget.user.id,
      currentPassword: _currentPwController.text.trim(),
      newPassword: _newPwController.text.trim(),
    );

    if (!mounted) return;
    if (pwRes['success'] != true) {
      setState(() {
        _submitting = false;
        _error = pwRes['error'] ?? 'Passwort konnte nicht geändert werden.';
      });
      return;
    }

    final privacyRes = await ApiService.acceptPrivacy(widget.user.id);
    if (!mounted) return;
    setState(() => _submitting = false);

    if (privacyRes['success'] != true) {
      setState(() => _error = privacyRes['error'] ?? 'Datenschutzbestätigung fehlgeschlagen.');
      return;
    }

    AppSnackbar.success(context, 'Passwort erfolgreich geändert!');
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => MainShell(user: widget.user)),
    );
  }

  @override
  void dispose() {
    _currentPwController.dispose();
    _newPwController.dispose();
    _confirmPwController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Erstanmeldung & Datenschutz')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const PrivacyNoticeCard(),
            const SizedBox(height: 24),

            if (_error != null) ...[
              AuthErrorBanner(message: _error!, bordered: true),
              const SizedBox(height: 16),
            ],

            if (widget.initialPassword == null || widget.initialPassword!.isEmpty) ...[
              LabeledPasswordField(
                label: 'Aktuelles Passwort',
                hintText: 'Ihr bisheriges Passwort',
                controller: _currentPwController,
                obscured: _obscureCurrent,
                onToggleVisibility: () => setState(() => _obscureCurrent = !_obscureCurrent),
              ),
              const SizedBox(height: 16),
            ],

            LabeledPasswordField(
              label: 'Neues Passwort',
              hintText: 'Mindestens 6 Zeichen',
              controller: _newPwController,
              obscured: _obscure1,
              onToggleVisibility: () => setState(() => _obscure1 = !_obscure1),
            ),
            const SizedBox(height: 16),

            LabeledPasswordField(
              label: 'Passwort bestätigen',
              hintText: 'Passwort wiederholen',
              controller: _confirmPwController,
              obscured: _obscure2,
              onToggleVisibility: () => setState(() => _obscure2 = !_obscure2),
            ),
            const SizedBox(height: 20),

            PrivacyConsentTile(
              accepted: _acceptedPrivacy,
              onChanged: (val) => setState(() => _acceptedPrivacy = val),
            ),
            const SizedBox(height: 28),

            PrimaryActionButton(
              label: _submitting ? 'Wird gespeichert...' : 'Speichern & Fortfahren',
              onPressed: _submitting ? () {} : _submit,
              backgroundColor: AppColors.success,
            ),
          ],
        ),
      ),
    );
  }
}
