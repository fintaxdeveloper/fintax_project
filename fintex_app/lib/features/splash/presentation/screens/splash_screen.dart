import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../services/auth_service.dart';
import '../../../authentication/presentation/screens/login_screen.dart';
import '../../../home/presentation/screens/main_shell.dart';

/// Executive animated luxury splash screen for FinTax Consulting.
/// Displays the FinTax emerald & gold brand emblem with halo shimmer,
/// concentric pulse rings, staggered typography, and smooth session routing:
///   - Logged-in user -> Splash -> MainShell (Dashboard)
///   - Logged-out user -> Splash -> LoginScreen
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _entryController;
  late final AnimationController _ambientController;
  late final AnimationController _shimmerController;

  late final Animation<double> _logoScale;
  late final Animation<double> _logoOpacity;
  late final Animation<double> _titleSlide;
  late final Animation<double> _titleOpacity;
  late final Animation<double> _lineExpand;
  late final Animation<double> _footerOpacity;
  late final Animation<double> _progressAnim;

  @override
  void initState() {
    super.initState();

    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
    );

    _entryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    );

    _ambientController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 7),
    )..repeat();

    _shimmerController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1900),
    )..repeat();

    _logoScale = Tween<double>(begin: 0.55, end: 1.0).animate(
      CurvedAnimation(
        parent: _entryController,
        curve: const Interval(0.0, 0.45, curve: Curves.easeOutBack),
      ),
    );

    _logoOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entryController,
        curve: const Interval(0.0, 0.30, curve: Curves.easeOut),
      ),
    );

    _titleSlide = Tween<double>(begin: 24.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _entryController,
        curve: const Interval(0.28, 0.62, curve: Curves.easeOutCubic),
      ),
    );

    _titleOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entryController,
        curve: const Interval(0.28, 0.58, curve: Curves.easeOut),
      ),
    );

    _lineExpand = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entryController,
        curve: const Interval(0.45, 0.78, curve: Curves.easeOutExpo),
      ),
    );

    _footerOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entryController,
        curve: const Interval(0.60, 0.90, curve: Curves.easeOut),
      ),
    );

    _progressAnim = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entryController,
        curve: const Interval(0.10, 1.0, curve: Curves.easeInOutCubic),
      ),
    );

    _entryController.forward();
    _bootAndNavigate();
  }

  Future<void> _bootAndNavigate() async {
    final results = await Future.wait([
      AuthService.instance.restoreSession(),
      Future.delayed(const Duration(milliseconds: 2600)),
    ]);

    if (!mounted) return;
    final restoredUser = results[0];

    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
      ),
    );

    final Widget destination = restoredUser != null
        ? MainShell(user: restoredUser)
        : const LoginScreen();

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 550),
        pageBuilder: (_, __, ___) => destination,
        transitionsBuilder: (_, animation, __, child) {
          final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
          return FadeTransition(
            opacity: curved,
            child: ScaleTransition(
              scale: Tween<double>(begin: 0.97, end: 1.0).animate(curved),
              child: child,
            ),
          );
        },
      ),
    );
  }

  @override
  void dispose() {
    _entryController.dispose();
    _ambientController.dispose();
    _shimmerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const emeraldDeep = Color(0xFF041C14);
    const emeraldMid = Color(0xFF072E21);
    const emeraldRich = Color(0xFF0C4A34);
    const champagneGold = Color(0xFFDFB772);
    const brightGold = Color(0xFFF3D59B);

    return Scaffold(
      backgroundColor: emeraldDeep,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Deep Luxury Emerald-Obsidian Gradient Background
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [emeraldDeep, emeraldMid, emeraldRich, emeraldDeep],
                stops: [0.0, 0.38, 0.72, 1.0],
              ),
            ),
          ),

          // 2. Animated Ambient Floating Bokeh Glows
          AnimatedBuilder(
            animation: _ambientController,
            builder: (context, _) {
              final angle = _ambientController.value * 2 * math.pi;
              return Stack(
                children: [
                  Positioned(
                    top: -90 + math.sin(angle) * 18,
                    right: -70 + math.cos(angle) * 14,
                    child: Container(
                      width: 280,
                      height: 280,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            champagneGold.withValues(alpha: 0.18),
                            champagneGold.withValues(alpha: 0.0),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: -110 + math.cos(angle) * 20,
                    left: -80 + math.sin(angle) * 16,
                    child: Container(
                      width: 320,
                      height: 320,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            const Color(0xFF10B981).withValues(alpha: 0.16),
                            const Color(0xFF10B981).withValues(alpha: 0.0),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),

          // 3. Center Emblem + Typography + Progress
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                children: [
                  const Spacer(flex: 3),

                  // Animated Pulsing Rings + Rotating Gold Halo + Logo Card
                  AnimatedBuilder(
                    animation: Listenable.merge([
                      _entryController,
                      _ambientController,
                      _shimmerController,
                    ]),
                    builder: (context, _) {
                      final pulse = (math.sin(_ambientController.value * 2 * math.pi) + 1) / 2;
                      return Opacity(
                        opacity: _logoOpacity.value,
                        child: Transform.scale(
                          scale: _logoScale.value,
                          child: SizedBox(
                            width: 310,
                            height: 170,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                // Outer Pulse Ring (rounded, follows the wide logo card)
                                Container(
                                  width: 280 + (pulse * 16),
                                  height: 138 + (pulse * 16),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(38 + pulse * 6),
                                    border: Border.all(
                                      color: champagneGold.withValues(alpha: 0.10 + (1 - pulse) * 0.12),
                                      width: 1.2,
                                    ),
                                  ),
                                ),

                                // Rotating gold light running around the card edge
                                Container(
                                  width: 264,
                                  height: 122,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(32),
                                    gradient: SweepGradient(
                                      transform: GradientRotation(
                                        _ambientController.value * 2 * math.pi,
                                      ),
                                      colors: [
                                        champagneGold.withValues(alpha: 0.0),
                                        champagneGold.withValues(alpha: 0.55),
                                        brightGold,
                                        champagneGold.withValues(alpha: 0.0),
                                      ],
                                      stops: const [0.0, 0.35, 0.5, 0.72],
                                    ),
                                  ),
                                ),

                                // Wide pearl-white logo card with shimmer
                                Container(
                                  width: 256,
                                  height: 114,
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(28),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.42),
                                        blurRadius: 30,
                                        offset: const Offset(0, 14),
                                      ),
                                      BoxShadow(
                                        color: champagneGold.withValues(alpha: 0.22),
                                        blurRadius: 24,
                                        spreadRadius: 2,
                                      ),
                                    ],
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(28),
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        Padding(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 18,
                                            vertical: 16,
                                          ),
                                          child: Image.asset(
                                            'assets/images/fintax_logo.png',
                                            fit: BoxFit.contain,
                                            filterQuality: FilterQuality.high,
                                          ),
                                        ),
                                        // Diagonal Specular Gold Shimmer Sweep
                                        Positioned.fill(
                                          child: FractionalTranslation(
                                            translation: Offset(
                                              -1.6 + (_shimmerController.value * 3.2),
                                              0,
                                            ),
                                            child: Transform.rotate(
                                              angle: -0.45,
                                              child: Container(
                                                width: 48,
                                                decoration: BoxDecoration(
                                                  gradient: LinearGradient(
                                                    colors: [
                                                      Colors.white.withValues(alpha: 0.0),
                                                      brightGold.withValues(alpha: 0.26),
                                                      Colors.white.withValues(alpha: 0.38),
                                                      Colors.white.withValues(alpha: 0.0),
                                                    ],
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),

                  const SizedBox(height: 26),

                  // Staggered Brand Typography
                  AnimatedBuilder(
                    animation: _entryController,
                    builder: (context, _) {
                      return Opacity(
                        opacity: _titleOpacity.value,
                        child: Transform.translate(
                          offset: Offset(0, _titleSlide.value),
                          child: Column(
                            children: [
                              const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    'FinTax ',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 32,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: -0.5,
                                    ),
                                  ),
                                  Text(
                                    'Consulting',
                                    style: TextStyle(
                                      color: champagneGold,
                                      fontSize: 32,
                                      fontWeight: FontWeight.w300,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),

                              // Expanding Metallic Gold Accent Line
                              Container(
                                width: 140 * _lineExpand.value,
                                height: 2,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(2),
                                  gradient: const LinearGradient(
                                    colors: [
                                      Colors.transparent,
                                      champagneGold,
                                      brightGold,
                                      champagneGold,
                                      Colors.transparent,
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),

                              Text(
                                'AI TAX ADVISORY • SKR03 CLOUD',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.72),
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 2.2,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),

                  const Spacer(flex: 3),

                  // Sleek Animated Gold-Emerald Progress Bar + Compliance Badge
                  AnimatedBuilder(
                    animation: _entryController,
                    builder: (context, _) {
                      return Opacity(
                        opacity: _footerOpacity.value,
                        child: Column(
                          children: [
                            Container(
                              width: 180,
                              height: 3.5,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              alignment: Alignment.centerLeft,
                              child: FractionallySizedBox(
                                widthFactor: _progressAnim.value.clamp(0.05, 1.0),
                                child: Container(
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(999),
                                    gradient: const LinearGradient(
                                      colors: [Color(0xFF10B981), champagneGold, brightGold],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 18),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.06),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: champagneGold.withValues(alpha: 0.22),
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.verified_user_outlined,
                                    color: champagneGold,
                                    size: 14,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'GoBD & DSGVO Zertifiziert • Frankfurt (DE)',
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.8),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),

                  const SizedBox(height: 28),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
