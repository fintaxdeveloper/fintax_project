import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Top section of the login screen: language switch, FinTax logo card,
/// title and subtitle on the teal gradient.
class LoginHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final String currentLang;
  final VoidCallback onToggleLanguage;

  const LoginHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.currentLang,
    required this.onToggleLanguage,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        const Positioned.fill(child: _DecorativeShapes()),
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 36),
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: _LanguagePill(currentLang: currentLang, onTap: onToggleLanguage),
              ),
              const SizedBox(height: 20),
              const _AppLogoCard(),
              const SizedBox(height: 28),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  height: 1.2,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  subtitle,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 14,
                    height: 1.45,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Soft circles and a gold accent dot behind the header content.
class _DecorativeShapes extends StatelessWidget {
  const _DecorativeShapes();

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: Stack(
        children: [
          Positioned(
            top: -80,
            right: -60,
            child: _circle(240, Colors.white.withValues(alpha: 0.05)),
          ),
          Positioned(
            bottom: -40,
            left: -70,
            child: _circle(200, Colors.white.withValues(alpha: 0.04)),
          ),
          Positioned(
            top: 70,
            left: 28,
            child: _circle(14, AppColors.accentGold.withValues(alpha: 0.9)),
          ),
          Positioned(
            top: 130,
            right: 36,
            child: _circle(8, Colors.white.withValues(alpha: 0.35)),
          ),
        ],
      ),
    );
  }

  Widget _circle(double size, Color color) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      );
}

/// The FinTax Consulting logo on a light card matching the image background.
class _AppLogoCard extends StatelessWidget {
  const _AppLogoCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 300),
      height: 92,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F6F6), // matches the logo's background
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.accentGold.withValues(alpha: 0.6), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Image.asset(
        'assets/images/fintax_logo.jpeg',
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => const Center(
          child: Text(
            'FinTax Consulting',
            style: TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.w900,
              fontSize: 22,
            ),
          ),
        ),
      ),
    );
  }
}

/// Translucent DE/EN switch shown in the top-right corner.
class _LanguagePill extends StatelessWidget {
  final String currentLang;
  final VoidCallback onTap;

  const _LanguagePill({required this.currentLang, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.12),
      shape: StadiumBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.25))),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.language_rounded, color: Colors.white, size: 16),
              const SizedBox(width: 6),
              Text(
                currentLang.toUpperCase(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
