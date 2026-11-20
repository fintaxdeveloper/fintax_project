import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Right-aligned "Forgot password?" text link.
class ForgotPasswordLink extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;

  const ForgotPasswordLink({
    super.key,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: TextButton(
        onPressed: onPressed,
        style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
        child: Text(
          label,
          style: const TextStyle(color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
