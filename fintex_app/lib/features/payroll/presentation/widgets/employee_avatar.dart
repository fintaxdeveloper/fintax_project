import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Rounded square with an employee's initials in the payroll color.
class EmployeeAvatar extends StatelessWidget {
  final String initials;
  final double size;
  final double radius;
  final double fontSize;
  final double backgroundAlpha;

  const EmployeeAvatar({
    super.key,
    required this.initials,
    this.size = 46,
    this.radius = 14,
    this.fontSize = 16,
    this.backgroundAlpha = 0.12,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.sectionPayroll.withValues(alpha: backgroundAlpha),
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Center(
        child: Text(
          initials,
          style: TextStyle(
            color: AppColors.sectionPayroll,
            fontWeight: FontWeight.w800,
            fontSize: fontSize,
          ),
        ),
      ),
    );
  }
}
