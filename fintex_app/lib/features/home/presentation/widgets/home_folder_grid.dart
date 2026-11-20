import 'package:flutter/material.dart';

/// Non-scrolling 2-column grid of [HomeFolderCard]s inside a scroll view.
/// Tiles have a fixed height, and very large system font sizes are capped
/// so the card texts always fit.
class HomeFolderGrid extends StatelessWidget {
  final List<Widget> children;
  final double tileHeight;

  const HomeFolderGrid({
    super.key,
    required this.children,
    this.tileHeight = 158,
  });

  @override
  Widget build(BuildContext context) {
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.15,
      child: GridView(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          mainAxisExtent: tileHeight,
        ),
        children: children,
      ),
    );
  }
}
