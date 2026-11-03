import 'package:flutter/material.dart';
import '../../../authentication/models/user_model.dart';
import '../../../scanner/presentation/screens/camera_scan_screen.dart';
import '../widgets/home_bottom_nav.dart';
import 'home_screen.dart';
import 'documents_screen.dart';
import 'tasks_screen.dart';

class MainShell extends StatefulWidget {
  final UserModel user;
  const MainShell({super.key, required this.user});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  void _onScanTap() async {
    // Open Camera Scanner directly or switch to Add Document tab
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => CameraScanScreen(user: widget.user)),
    );
    if (result == true) {
      setState(() => _currentIndex = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> pages = [
      HomeScreen(user: widget.user, onOpenScanner: _onScanTap),
      DocumentsScreen(user: widget.user),
      TasksScreen(user: widget.user),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: pages,
      ),
      bottomNavigationBar: CustomBottomNavBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        onScanTap: _onScanTap,
      ),
    );
  }
}
