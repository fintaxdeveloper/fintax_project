import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import 'password_visibility_toggle.dart';

/// Label + password TextField with a lock icon and visibility toggle.
class LabeledPasswordField extends StatelessWidget {
  final String label;
  final String hintText;
  final TextEditingController controller;
  final bool obscured;
  final VoidCallback onToggleVisibility;

  const LabeledPasswordField({
    super.key,
    required this.label,
    required this.hintText,
    required this.controller,
    required this.obscured,
    required this.onToggleVisibility,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          obscureText: obscured,
          style: const TextStyle(color: AppColors.textPrimary),
          decoration: InputDecoration(
            hintText: hintText,
            prefixIcon: const Icon(Icons.lock_outline, size: 20),
            suffixIcon: PasswordVisibilityToggle(
              obscured: obscured,
              size: 20,
              onPressed: onToggleVisibility,
            ),
          ),
        ),
      ],
    );
  }
}
