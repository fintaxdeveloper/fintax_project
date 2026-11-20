import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Info card explaining GoBD/GDPR data handling on the first-login screen.
class PrivacyNoticeCard extends StatelessWidget {
  const PrivacyNoticeCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
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
    );
  }
}
