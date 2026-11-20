import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../services/api_service.dart';
import '../../../../services/auth_service.dart';
import '../../models/user_model.dart';
import '../../../home/presentation/screens/main_shell.dart';
import '../widgets/auth_error_banner.dart';
import '../widgets/auth_text_field.dart';
import '../widgets/forgot_password_link.dart';
import '../widgets/login_footer.dart';
import '../widgets/login_form_card.dart';
import '../widgets/login_header.dart';
import '../widgets/login_submit_button.dart';
import '../widgets/password_visibility_toggle.dart';
import 'first_login_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _identifierController = TextEditingController(text: '20418');
  final _passwordController = TextEditingController(text: 'client123');
  bool _isLoading = false;
  bool _obscurePassword = true;
  String? _errorMessage;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (_identifierController.text.trim().isEmpty || _passwordController.text.trim().isEmpty) {
      setState(() => _errorMessage = Tr.get('invalidCredentials'));
      return;
    }
    setState(() { _isLoading = true; _errorMessage = null; });

    final res = await ApiService.login(
      _identifierController.text.trim(),
      _passwordController.text.trim(),
    );

    if (!mounted) return;
    setState(() => _isLoading = false);

    if (res['success'] == true && res['user'] != null) {
      final UserModel user = res['user'];
      AuthService.instance.setUser(user);

      if (res['message'] != null) {
        AppSnackbar.info(context, res['message']);
      }

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => user.isFirstLogin
              ? FirstLoginScreen(user: user)
              : MainShell(user: user),
        ),
      );
    } else {
      setState(() => _errorMessage = res['error'] ?? Tr.get('invalidCredentials'));
    }
  }

  void _toggleLanguage() {
    final nextLang = Tr.currentLang == 'en' ? 'de' : 'en';
    Tr.setLanguage(nextLang);
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        return Scaffold(
          backgroundColor: AppColors.surface,
          body: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.primary, AppColors.primaryDark],
              ),
            ),
            child: SafeArea(
              bottom: false,
              child: CustomScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                slivers: [
                  SliverToBoxAdapter(
                    child: LoginHeader(
                      title: Tr.get('yourFinancesTitle'),
                      subtitle: Tr.get('loginSubtitle'),
                      currentLang: currentLang,
                      onToggleLanguage: _toggleLanguage,
                    ),
                  ),
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: LoginFormCard(
                      children: [
                        Text(
                          Tr.get('welcomeBack'),
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          Tr.get('loginFormSubtitle'),
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 24),

                        if (_errorMessage != null) ...[
                          AuthErrorBanner(message: _errorMessage!),
                          const SizedBox(height: 16),
                        ],

                        AuthTextField(
                          controller: _identifierController,
                          labelText: Tr.get('clientNumber'),
                          hintText: '20418',
                          prefixIcon: Icons.badge_outlined,
                          keyboardType: TextInputType.number,
                        ),
                        const SizedBox(height: 18),

                        AuthTextField(
                          controller: _passwordController,
                          labelText: Tr.get('password'),
                          hintText: '••••••••',
                          prefixIcon: Icons.lock_outline_rounded,
                          obscureText: _obscurePassword,
                          onSubmitted: (_) => _handleLogin(),
                          suffixIcon: PasswordVisibilityToggle(
                            obscured: _obscurePassword,
                            color: AppColors.textTertiary,
                            size: 20,
                            onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                          ),
                        ),
                        const SizedBox(height: 6),

                        ForgotPasswordLink(
                          label: Tr.get('forgotPassword'),
                          onPressed: () {},
                        ),
                        const SizedBox(height: 18),

                        LoginSubmitButton(
                          label: Tr.get('login'),
                          isLoading: _isLoading,
                          onPressed: _handleLogin,
                        ),

                        // DEV ONLY: skips login with a dummy user. Remove before release.
                        TextButton(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => MainShell(
                                  user: UserModel(id: "id", name: "name", email: "email", clientNumber: "clientNumber", token: "token"),
                                ),
                              ),
                            );
                          },
                          child: const Text(
                            'Skip login (dev)',
                            style: TextStyle(color: AppColors.textTertiary, fontSize: 12),
                          ),
                        ),

                        const Spacer(),
                        const SizedBox(height: 16),
                        LoginFooter(
                          complianceNote: Tr.get('complianceNote'),
                          accountsNote: Tr.get('accountsNote'),
                        ),
                        SizedBox(height: MediaQuery.of(context).padding.bottom),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
