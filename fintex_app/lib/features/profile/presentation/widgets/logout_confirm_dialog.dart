import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// "Really log out?" confirmation dialog.
class LogoutConfirmDialog extends StatelessWidget {
  final String title;
  final String message;
  final String cancelLabel;
  final VoidCallback onConfirm;

  const LogoutConfirmDialog({
    super.key,
    required this.title,
    required this.message,
    required this.cancelLabel,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(cancelLabel),
        ),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
          onPressed: onConfirm,
          child: Text(title),
        ),
      ],
    );
  }
}
