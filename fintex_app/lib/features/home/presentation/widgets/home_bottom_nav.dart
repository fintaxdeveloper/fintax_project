import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';

/// One tab of the bottom navigation.
class _NavTab {
  final IconData icon;
  final IconData selectedIcon;
  final String labelKey;

  const _NavTab(this.icon, this.selectedIcon, this.labelKey);
}

/// Floating bottom bar: four tabs with an animated highlight and a raised
/// scan button in the middle.
class CustomBottomNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final VoidCallback onScanTap;

  const CustomBottomNavBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.onScanTap,
  });

  // Order must match the pages in MainShell.
  static const _tabs = [
    _NavTab(Icons.home_outlined, Icons.home_rounded, 'home'),
    _NavTab(Icons.folder_outlined, Icons.folder_rounded, 'documents'),
    _NavTab(Icons.notifications_none_rounded, Icons.notifications_rounded, 'navNotifications'),
    _NavTab(Icons.person_outline_rounded, Icons.person_rounded, 'profile'),
  ];

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, _, _) {
        Widget tab(int i) => Expanded(
              child: _NavItem(
                tab: _tabs[i],
                label: Tr.get(_tabs[i].labelKey),
                isSelected: currentIndex == i,
                onTap: () => onTap(i),
              ),
            );

        return Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, bottomInset > 0 ? bottomInset : 14),
          child: SizedBox(
            height: 92,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.bottomCenter,
              children: [
                // Bar background
                Container(
                  height: 70,
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(26),
                    border: Border.all(color: AppColors.borderLight),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primary.withValues(alpha: 0.12),
                        blurRadius: 30,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Row(
                    children: [
                      tab(0),
                      tab(1),
                      const SizedBox(width: 76), // space for the scan button
                      tab(2),
                      tab(3),
                    ],
                  ),
                ),
                // Raised scan button
                Positioned(
                  top: 0,
                  child: _ScanButton(onTap: onScanTap),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

typedef HomeBottomNav = CustomBottomNavBar;

class _NavItem extends StatelessWidget {
  final _NavTab tab;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _NavItem({
    required this.tab,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = isSelected ? AppColors.primary : AppColors.textTertiary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOutCubic,
            padding: EdgeInsets.symmetric(horizontal: isSelected ? 16 : 8, vertical: 5),
            decoration: BoxDecoration(
              color: isSelected ? AppColors.primaryLight : Colors.transparent,
              borderRadius: BorderRadius.circular(14),
            ),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
              child: Icon(
                isSelected ? tab.selectedIcon : tab.icon,
                key: ValueKey(isSelected),
                color: color,
                size: 23,
              ),
            ),
          ),
          const SizedBox(height: 4),
          AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 200),
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
            ),
            child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}

/// Teal gradient circle with a gold ring that opens the camera scanner.
class _ScanButton extends StatelessWidget {
  final VoidCallback onTap;

  const _ScanButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(5),
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.background, // cut-out ring between button and bar
      ),
      child: Material(
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        elevation: 0,
        color: Colors.transparent,
        child: Ink(
          width: 62,
          height: 62,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF12777B), AppColors.primary, AppColors.primaryDark],
            ),
            border: Border.all(color: AppColors.accentGold, width: 2),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.4),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: const Icon(Icons.document_scanner_rounded, color: Colors.white, size: 26),
          ),
        ),
      ),
    );
  }
}
