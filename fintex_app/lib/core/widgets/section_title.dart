import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Bold section heading used above lists and form groups.
class SectionTitle extends StatelessWidget {
  final String text;

  const SectionTitle(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w800,
        fontSize: 15,
      ),
    );
  }
}
