import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../services/api_service.dart';
import '../../../../services/auth_service.dart';
import '../../models/user_model.dart';
import '../../../home/presentation/screens/main_shell.dart';
import '../widgets/auth_text_field.dart';
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
          backgroundColor: AppColors.primary,
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                // Header Section
                Expanded(
                  flex: 4,
                  child: Stack(
                    children: [
                      // Decorative Background Circles
                      Positioned(
                        top: -40,
                        right: -40,
                        child: Container(
                          width: 220,
                          height: 220,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white.withValues(alpha: 0.04),
                          ),
                        ),
                      ),
                      Positioned(
                        top: 40,
                        right: 40,
                        child: Container(
                          width: 64,
                          height: 64,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppColors.accentGold,
                          ),
                        ),
                      ),

                      // Header Content
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            // FT Logo Icon
                            Container(
                              width: 56,
                              height: 56,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(18),
                                boxShadow: const [
                                  BoxShadow(color: Colors.black12, blurRadius: 10, offset: Offset(0, 4)),
                                ],
                              ),
                              child: const Center(
                                child: Text(
                                  'FT',
                                  style: TextStyle(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 22,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 24),

                            // Title
                            Text(
                              Tr.get('yourFinancesTitle'),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                                height: 1.2,
                              ),
                            ),
                            const SizedBox(height: 12),

                            // Subtitle
                            Text(
                              Tr.get('loginSubtitle'),
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.85),
                                fontSize: 14,
                                height: 1.4,
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // White Card Form Overlay
                Expanded(
                  flex: 6,
                  child: Container(
                    width: double.infinity,
                    decoration: const BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                    ),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(28),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const SizedBox(height: 8),
                          Text(
                            Tr.get('login'),
                            style: const TextStyle(
                              color: AppColors.textPrimary,
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 24),

                          // Error Banner
                          if (_errorMessage != null) ...[
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppColors.errorLight,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 20),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(_errorMessage!, style: const TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.w600)),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],

                          // Client Number
                          AuthTextField(
                            controller: _identifierController,
                            labelText: Tr.get('clientNumber'),
                            hintText: '20418',
                          ),
                          const SizedBox(height: 18),

                          // Password
                          AuthTextField(
                            controller: _passwordController,
                            labelText: Tr.get('password'),
                            hintText: '••••••••',
                            obscureText: _obscurePassword,
                            onSubmitted: (_) => _handleLogin(),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                color: AppColors.textTertiary,
                                size: 20,
                              ),
                              onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                            ),
                          ),
                          const SizedBox(height: 8),

                          // Forgot Password Link
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () {},
                              style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                              child: Text(
                                Tr.get('forgotPassword'),
                                style: const TextStyle(color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),

                          ElevatedButton(onPressed: (){
                            Navigator.push(context, MaterialPageRoute(builder: (context) => MainShell(user: UserModel(id: "id", name: "name", email: "email", clientNumber: "clientNumber", token: "token"),)));

                          }, child: Text('data')),
                          // Sign In Button
                          SizedBox(
                            height: 54,
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _handleLogin,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(27)),
                                elevation: 4,
                                shadowColor: AppColors.primary.withValues(alpha: 0.4),
                              ),
                              child: _isLoading
                                  ? const SizedBox(
                                      width: 24, height: 24,
                                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                                    )
                                  : Text(Tr.get('login'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                            ),
                          ),
                          const SizedBox(height: 32),

                          // Footer Row
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                Tr.get('accountsNote'),
                                style: const TextStyle(color: AppColors.textTertiary, fontSize: 12, fontWeight: FontWeight.w500),
                              ),
                              GestureDetector(
                                onTap: _toggleLanguage,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppColors.background,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: AppColors.border),
                                  ),
                                  child: Text(
                                    currentLang == 'en' ? 'DE · EN' : 'EN · DE',
                                    style: const TextStyle(
                                      color: AppColors.primary,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
