import 'package:flutter/material.dart';
import '../models/home_model.dart';
import '../../repositories/home_repository.dart';

class HomeController extends ChangeNotifier {
  final HomeRepository _repository = HomeRepository();

  HomeDashboardData? _data;
  bool _isLoading = true;

  HomeDashboardData? get data => _data;
  bool get isLoading => _isLoading;

  Future<void> loadDashboard() async {
    _isLoading = true;
    notifyListeners();

    _data = await _repository.fetchDashboardData();
    _isLoading = false;
    notifyListeners();
  }
}
