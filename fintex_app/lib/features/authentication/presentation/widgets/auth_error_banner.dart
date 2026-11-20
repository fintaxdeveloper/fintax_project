import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Red warning banner shown above auth forms when validation or login fails.
///
/// [bordered] adds an outline (used on the first-login screen).
class AuthErrorBanner extends StatelessWidget {
  final String message;
  final bool bordered;

  const AuthErrorBanner({
    super.key,
    required this.message,
    this.bordered = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.errorLight,
        borderRadius: BorderRadius.circular(bordered ? 12 : 14),
        border: bordered ? Border.all(color: AppColors.error.withValues(alpha: 0.3)) : null,
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: AppColors.error,
                fontSize: 13,
                fontWeight: bordered ? null : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
