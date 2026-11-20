import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// One folder tab: label, icon and accent colour.
class FolderTab {
  final String label;
  final IconData icon;
  final Color color;
  final Color lightColor;

  const FolderTab({
    required this.label,
    required this.icon,
    required this.color,
    required this.lightColor,
  });
}

/// Horizontally scrolling row of folder tabs. The selected tab gets a soft
/// pastel fill in its colour; the others are white with a light border.
class FolderTabBar extends StatelessWidget {
  final List<FolderTab> tabs;
  final int selectedIndex;
  final ValueChanged<int> onChanged;

  const FolderTabBar({
    super.key,
    required this.tabs,
    required this.selectedIndex,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: tabs.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final tab = tabs[i];
          final selected = i == selectedIndex;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            decoration: BoxDecoration(
              color: selected ? tab.lightColor : AppColors.surface,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: selected ? tab.color.withValues(alpha: 0.35) : AppColors.border,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(22),
                onTap: () => onChanged(i),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(tab.icon, size: 17, color: tab.color),
                      const SizedBox(width: 6),
                      Text(
                        tab.label,
                        style: TextStyle(
                          color: selected ? tab.color : AppColors.textSecondary,
                          fontSize: 13,
                          fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
