import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../authentication/models/user_model.dart';
import '../widgets/home_app_bar.dart';
import '../widgets/home_card.dart';

class DashboardScreen extends StatelessWidget {
  final UserModel user;
  const DashboardScreen({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              HomeAppBar(user: user, greeting: 'Übersicht'),
              const SizedBox(height: 24),
              const Text('Dashboard Key Metrics', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  HomeFolderCard(
                    icon: Icons.receipt_long_rounded,
                    iconBoxColor: AppColors.greenBox,
                    iconColor: AppColors.greenIcon,
                    title: 'Buchhaltung',
                    badgeText: '12',
                    onTap: () {},
                  ),
                  HomeFolderCard(
                    icon: Icons.people_alt_rounded,
                    iconBoxColor: AppColors.yellowBox,
                    iconColor: AppColors.yellowIcon,
                    title: 'Lohnabrechnung',
                    badgeText: '5',
                    onTap: () {},
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
