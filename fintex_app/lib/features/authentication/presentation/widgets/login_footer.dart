import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Bottom of the login form: compliance badge and the accounts note.
class LoginFooter extends StatelessWidget {
  final String complianceNote;
  final String accountsNote;

  const LoginFooter({
    super.key,
    required this.complianceNote,
    required this.accountsNote,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.primarySurface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.primaryLight),
          ),
          child: Row(
            children: [
              const Icon(Icons.verified_user_rounded, color: AppColors.primary, size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  complianceNote,
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.info_outline_rounded, color: AppColors.textTertiary, size: 14),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                accountsNote,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.textTertiary,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
