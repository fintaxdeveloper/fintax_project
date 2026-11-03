import 'package:flutter/material.dart';
import '../../../../core/l10n/translations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../authentication/models/user_model.dart';
import '../../../documents/presentation/screens/section_detail_screen.dart';
import '../../../payroll/presentation/screens/payroll_screen.dart';
import '../widgets/home_card.dart';

class HomeScreen extends StatefulWidget {
  final UserModel user;
  final VoidCallback onOpenScanner;

  const HomeScreen({
    super.key,
    required this.user,
    required this.onOpenScanner,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  void _openSection(String categoryKey, String title, String subtitle, Color color) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SectionDetailScreen(
          user: widget.user,
          categoryKey: categoryKey,
          title: title,
          subtitle: subtitle,
          themeColor: color,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final displayName = widget.user.name.isEmpty || widget.user.name == 'Mandant'
        ? 'Mohammad'
        : widget.user.name;

    return ValueListenableBuilder<String>(
      valueListenable: Tr.languageNotifier,
      builder: (context, currentLang, child) {
        return Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  // Top Header matching screenshot
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                    child: Row(
                      children: [
                        // Squircle User Avatar Profile Image
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            color: const Color(0xFF334155),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.08),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(16),
                            child: Image.network(
                              'https://png.pngtree.com/png-clipart/20230927/original/pngtree-man-avatar-image-for-profile-png-image_13001879.png',
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) {
                                return Container(
                                  color: const Color(0xFF475569),
                                  child: Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      const Icon(
                                        Icons.person,
                                        size: 38,
                                        color: Colors.white70,
                                      ),
                                      Positioned(
                                        bottom: 2,
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                          decoration: BoxDecoration(
                                            color: AppColors.primary,
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: Text(
                                            displayName.isNotEmpty ? displayName[0].toUpperCase() : 'M',
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),

                        // Welcome & Name Column
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                currentLang == 'en' ? 'Welcome,' : 'Willkommen,',
                                style: const TextStyle(
                                  color: Color(0xFF475569),
                                  fontSize: 16,
                                  fontWeight: FontWeight.w400,
                                  letterSpacing: 0.1,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                displayName,
                                style: const TextStyle(
                                  color: Color(0xFF0F172A),
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.2,
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Right Sync / Refresh Button
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppColors.surface,
                            border: Border.all(color: AppColors.border),
                          ),
                          child: IconButton(
                            icon: const Icon(Icons.sync_rounded, color: Color(0xFF0F172A), size: 22),
                            onPressed: () {
                              setState(() {});
                            },
                            padding: EdgeInsets.zero,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Progress Card Banner
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: AppColors.border),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.04),
                            blurRadius: 14,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          // Gauge Circle
                          SizedBox(
                            width: 68,
                            height: 68,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                SizedBox(
                                  width: 68,
                                  height: 68,
                                  child: CircularProgressIndicator(
                                    value: 0.78,
                                    strokeWidth: 8,
                                    backgroundColor: AppColors.primaryLight,
                                    valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primary),
                                    strokeCap: StrokeCap.round,
                                  ),
                                ),
                                const Text(
                                  '78%',
                                  style: TextStyle(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 16,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 16),

                          // Column
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  Tr.get('octoberAccounting'),
                                  style: TextStyle(
                                    color: AppColors.textSecondary.withValues(alpha: 0.9),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.8,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  Tr.get('documentsMissing'),
                                  style: const TextStyle(
                                    color: AppColors.textPrimary,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                  ),
                                ),
                                const SizedBox(height: 8),

                                // Upload Button
                                SizedBox(
                                  height: 36,
                                  child: ElevatedButton(
                                    onPressed: widget.onOpenScanner,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.accentGold,
                                      foregroundColor: AppColors.primary,
                                      elevation: 0,
                                      padding: const EdgeInsets.symmetric(horizontal: 16),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(18),
                                      ),
                                    ),
                                    child: Text(
                                      Tr.get('uploadNow'),
                                      style: const TextStyle(
                                        color: AppColors.primary,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Main Content Body
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          Tr.get('yourFolders'),
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 14),

                        // 2x2 Folder Cards Grid
                        GridView.count(
                          crossAxisCount: 2,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          childAspectRatio: 1.15,
                          children: [
                            HomeFolderCard(
                              icon: Icons.apartment_rounded,
                              iconBoxColor: AppColors.blueBox,
                              iconColor: AppColors.blueIcon,
                              title: Tr.get('companyFormation'),
                              badgeText: '3',
                              onTap: () => _openSection('00_Gruendung', Tr.get('companyFormation'), 'Commercial Register & Contracts', AppColors.blueIcon),
                            ),
                            HomeFolderCard(
                              icon: Icons.bar_chart_rounded,
                              iconBoxColor: AppColors.greenBox,
                              iconColor: AppColors.greenIcon,
                              title: Tr.get('accounting'),
                              badgeText: '48',
                              onTap: () => _openSection('01_FiBu', Tr.get('accounting'), 'Invoices & Bank statements', AppColors.greenIcon),
                            ),
                            HomeFolderCard(
                              icon: Icons.people_outline_rounded,
                              iconBoxColor: AppColors.yellowBox,
                              iconColor: AppColors.yellowIcon,
                              title: Tr.get('payroll'),
                              badgeText: '6',
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(builder: (_) => PayrollScreen(user: widget.user)),
                              ),
                            ),
                            HomeFolderCard(
                              icon: Icons.mail_outline_rounded,
                              iconBoxColor: AppColors.pinkBox,
                              iconColor: AppColors.pinkIcon,
                              title: Tr.get('letters'),
                              badgeText: '1 new',
                              onTap: () => _openSection('00_Schriftverkehr', Tr.get('letters'), 'Tax office notices', AppColors.pinkIcon),
                            ),
                          ],
                        ),

                        const SizedBox(height: 20),

                        // Checked Document Activity Card
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.border),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.03),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: const BoxDecoration(
                                  color: AppColors.greenBox,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.check_rounded, color: AppColors.greenIcon, size: 22),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      Tr.get('invoiceChecked'),
                                      style: const TextStyle(
                                        color: AppColors.textPrimary,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 14,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      Tr.get('yesterdayTime'),
                                      style: const TextStyle(
                                        color: AppColors.textSecondary,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 120),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
