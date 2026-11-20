import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// White rounded sheet that holds the login form. It fills the remaining
/// height; scrolling is handled by the screen.
class LoginFormCard extends StatelessWidget {
  final List<Widget> children;

  const LoginFormCard({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(36)),
        boxShadow: [
          BoxShadow(color: Color(0x33000000), blurRadius: 30, offset: Offset(0, -6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Drag-handle style accent at the top of the sheet.
          Center(
            child: Container(
              width: 44,
              height: 5,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
          ...children,
        ],
      ),
    );
  }
}
