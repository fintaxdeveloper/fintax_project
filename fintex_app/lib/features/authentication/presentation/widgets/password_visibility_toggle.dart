import 'package:flutter/material.dart';

/// Eye icon button that shows/hides a password field.
class PasswordVisibilityToggle extends StatelessWidget {
  final bool obscured;
  final VoidCallback onPressed;
  final Color? color;
  final double? size;

  const PasswordVisibilityToggle({
    super.key,
    required this.obscured,
    required this.onPressed,
    this.color,
    this.size,
  });

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(
        obscured ? Icons.visibility_off_outlined : Icons.visibility_outlined,
        color: color,
        size: size,
      ),
      onPressed: onPressed,
    );
  }
}
