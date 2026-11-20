import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/primary_action_button.dart';
import '../widgets/auth_text_field.dart';
import '../widgets/password_visibility_toggle.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _companyController = TextEditingController();
  bool _isLoading = false;
  bool _obscurePassword = true;

  void _handleRegister() {
    if (_nameController.text.isEmpty || _emailController.text.isEmpty || _passwordController.text.isEmpty) {
      AppSnackbar.error(context, 'Bitte alle erforderlichen Felder ausfüllen.');
      return;
    }
    setState(() => _isLoading = true);
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) {
        setState(() => _isLoading = false);
        AppSnackbar.success(context, 'Registrierung erfolgreich! Bitte melden Sie sich an.');
        Navigator.pop(context);
      }
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _companyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Registrieren')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AuthTextField(
                controller: _nameController,
                labelText: 'Vollständiger Name',
                hintText: 'Max Mustermann',
                prefixIcon: Icons.person_outline,
              ),
              const SizedBox(height: 16),
              AuthTextField(
                controller: _emailController,
                labelText: 'E-Mail Adresse',
                hintText: 'name@beispiel.de',
                prefixIcon: Icons.email_outlined,
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 16),
              AuthTextField(
                controller: _companyController,
                labelText: 'Firmenname (optional)',
                hintText: 'Mustermann GmbH',
                prefixIcon: Icons.business_outlined,
              ),
              const SizedBox(height: 16),
              AuthTextField(
                controller: _passwordController,
                labelText: 'Passwort',
                hintText: '••••••••',
                prefixIcon: Icons.lock_outline,
                obscureText: _obscurePassword,
                suffixIcon: PasswordVisibilityToggle(
                  obscured: _obscurePassword,
                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                ),
              ),
              const SizedBox(height: 28),
              PrimaryActionButton(
                label: 'Konto erstellen',
                isLoading: _isLoading,
                onPressed: _handleRegister,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
