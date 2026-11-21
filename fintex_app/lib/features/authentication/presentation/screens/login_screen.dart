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
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
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
    final identifier = _identifierController.text.trim();
    final password = _passwordController.text.trim();
    if (identifier.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = Tr.get('invalidCredentials'));
      return;
    }
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final res = await ApiService.login(identifier, password);

    if (!mounted) return;
    setState(() => _isLoading = false);

    if (res['success'] == true && res['requires2FA'] == true && res['tempToken'] != null) {
      await _showOtpDialog(
        tempToken: res['tempToken'].toString(),
        maskedEmail: (res['maskedEmail'] ?? identifier).toString(),
        initialOtp: (res['demoOtp'] ?? '').toString(),
        password: password,
      );
      return;
    }

    if (res['success'] == true && res['user'] != null) {
      _completeLogin(res['user'] as UserModel, password, res['message']?.toString());
    } else {
      setState(() => _errorMessage = res['error']?.toString() ?? Tr.get('invalidCredentials'));
    }
  }

  void _completeLogin(UserModel user, String password, String? message) {
    AuthService.instance.setUser(user);
    if (message != null && message.isNotEmpty) {
      AppSnackbar.info(context, message);
    }
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => user.isFirstLogin
            ? FirstLoginScreen(user: user, initialPassword: password)
            : MainShell(user: user),
      ),
    );
  }

  Future<void> _showOtpDialog({
    required String tempToken,
    required String maskedEmail,
    required String initialOtp,
    required String password,
  }) async {
    final otpController = TextEditingController(text: initialOtp);
    String currentOtpDisplay = initialOtp;
    String? otpError;
    bool verifying = false;
    bool resending = false;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: const Text('2FA Security Code', style: TextStyle(fontWeight: FontWeight.w800)),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Code sent to $maskedEmail',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  if (currentOtpDisplay.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFECFDF5),
                        border: Border.all(color: const Color(0xFF86EFAC)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        'Generated Code: $currentOtpDisplay',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFF14532D),
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          letterSpacing: 2,
                        ),
                      ),
                    ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: otpController,
                    maxLength: 6,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: 6),
                    decoration: InputDecoration(
                      counterText: '',
                      hintText: '123456',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  if (otpError != null) ...[
                    const SizedBox(height: 8),
                    Text(otpError!, style: const TextStyle(color: AppColors.error, fontSize: 12)),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: resending
                      ? null
                      : () async {
                          setDialogState(() => resending = true);
                          final r = await ApiService.resendOtp(tempToken);
                          setDialogState(() {
                            resending = false;
                            if (r['success'] == true && r['demoOtp'] != null) {
                              currentOtpDisplay = r['demoOtp'].toString();
                              otpController.text = currentOtpDisplay;
                              otpError = null;
                            } else {
                              otpError = r['error']?.toString();
                            }
                          });
                        },
                  child: Text(resending ? '...' : 'Resend'),
                ),
                TextButton(
                  onPressed: verifying ? null : () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: verifying
                      ? null
                      : () async {
                          final code = otpController.text.trim();
                          if (code.length < 6) {
                            setDialogState(() => otpError = 'Please enter the 6-digit code.');
                            return;
                          }
                          setDialogState(() {
                            verifying = true;
                            otpError = null;
                          });
                          final v = await ApiService.verifyOtp(tempToken, code);
                          if (v['success'] == true && v['user'] != null) {
                            if (ctx.mounted) Navigator.pop(ctx);
                            if (mounted) {
                              _completeLogin(v['user'] as UserModel, password, v['message']?.toString());
                            }
                          } else {
                            setDialogState(() {
                              verifying = false;
                              otpError = v['error']?.toString() ?? 'Invalid code';
                            });
                          }
                        },
                  child: Text(verifying ? '...' : 'Verify'),
                ),
              ],
            );
          },
        );
      },
    );
    otpController.dispose();
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
                          labelText: '${Tr.get('clientNumber')} / E-Mail',
                          hintText: 'qa24@fintax.de / 726',
                          prefixIcon: Icons.badge_outlined,
                          keyboardType: TextInputType.emailAddress,
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
