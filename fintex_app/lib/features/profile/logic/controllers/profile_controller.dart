import 'package:flutter/material.dart';
import '../models/profile_model.dart';
import '../../repositories/profile_repository.dart';

class ProfileController extends ChangeNotifier {
  final ProfileRepository _repository = ProfileRepository();
  ProfileSettings _settings = ProfileSettings();

  ProfileSettings get settings => _settings;

  void toggleNotifications(bool value) {
    _settings = _settings.copyWith(pushNotifications: value);
    _repository.saveProfileSettings(_settings);
    notifyListeners();
  }

  void changeLanguage(String lang) {
    _settings = _settings.copyWith(language: lang);
    _repository.saveProfileSettings(_settings);
    notifyListeners();
  }
}
