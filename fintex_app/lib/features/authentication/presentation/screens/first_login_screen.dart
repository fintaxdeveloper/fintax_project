import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../models/user_model.dart';
import '../../../home/presentation/screens/main_shell.dart';

class FirstLoginScreen extends StatefulWidget {
  final UserModel user;
  const FirstLoginScreen({super.key, required this.user});

  @override
  State<FirstLoginScreen> createState() => _FirstLoginScreenState();
}

class _FirstLoginScreenState extends State<FirstLoginScreen> {
  final _newPwController = TextEditingController();
  final _confirmPwController = TextEditingController();
  bool _acceptedPrivacy = false;
  bool _obscure1 = true;
  bool _obscure2 = true;
  String? _error;

  void _submit() {
    if (!_acceptedPrivacy) {
      setState(() => _error = 'Bitte Datenschutzerklärung bestätigen.');
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

    AppSnackbar.success(context, 'Passwort erfolgreich geändert!');
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => MainShell(user: widget.user)),
    );
  }

  @override
  void dispose() {
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
            // Privacy Notice Card
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.primarySurface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.primaryLight,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.privacy_tip_outlined, color: AppColors.primary, size: 22),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'Datenschutzhinweis (GoBD & DSGVO)',
                          style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 15),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Ihre Daten und Belege werden verschlüsselt auf zertifizierten Servern in Deutschland gespeichert. Es erfolgt kein Training externer KI-Modelle mit Ihren Daten. Bitte vergeben Sie ein neues persönliches Passwort für Ihr Mandantenkonto.',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.5),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Error
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.errorLight,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 20),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13))),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // New Password
            const Text('Neues Passwort', style: TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              controller: _newPwController,
              obscureText: _obscure1,
              style: const TextStyle(color: AppColors.textPrimary),
              decoration: InputDecoration(
                hintText: 'Mindestens 6 Zeichen',
                prefixIcon: const Icon(Icons.lock_outline, size: 20),
                suffixIcon: IconButton(
                  icon: Icon(_obscure1 ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20),
                  onPressed: () => setState(() => _obscure1 = !_obscure1),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Confirm Password
            const Text('Passwort bestätigen', style: TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              controller: _confirmPwController,
              obscureText: _obscure2,
              style: const TextStyle(color: AppColors.textPrimary),
              decoration: InputDecoration(
                hintText: 'Passwort wiederholen',
                prefixIcon: const Icon(Icons.lock_outline, size: 20),
                suffixIcon: IconButton(
                  icon: Icon(_obscure2 ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20),
                  onPressed: () => setState(() => _obscure2 = !_obscure2),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Privacy Checkbox
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Checkbox(
                    value: _acceptedPrivacy,
                    onChanged: (val) => setState(() => _acceptedPrivacy = val ?? false),
                  ),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _acceptedPrivacy = !_acceptedPrivacy),
                      child: const Text(
                        'Ich bestätige die Kenntnisnahme der Datenschutzerklärung von FinTax Consulting.',
                        style: TextStyle(color: AppColors.textPrimary, fontSize: 13),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),

            // Submit
            SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _submit,
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                child: const Text('Speichern & Fortfahren', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
