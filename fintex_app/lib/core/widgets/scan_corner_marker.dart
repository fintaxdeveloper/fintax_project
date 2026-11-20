import 'package:flutter/material.dart';

/// L-shaped corner bracket drawn at one corner of a scan frame.
class ScanCornerMarker extends StatelessWidget {
  final bool top;
  final bool left;
  final Color color;
  final double strokeWidth;

  const ScanCornerMarker({
    super.key,
    required this.top,
    required this.left,
    this.color = Colors.white,
    this.strokeWidth = 3.5,
  });

  @override
  Widget build(BuildContext context) {
    final side = BorderSide(color: color, width: strokeWidth);
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        border: Border(
          top: top ? side : BorderSide.none,
          bottom: !top ? side : BorderSide.none,
          left: left ? side : BorderSide.none,
          right: !left ? side : BorderSide.none,
        ),
      ),
    );
  }
}
