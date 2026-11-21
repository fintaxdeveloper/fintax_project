class AppConstants {
  AppConstants._();

  static const String appName = 'FinTax Consulting';
  static const String appVersion = '1.0.0';
  static const String apiBaseUrl = 'https://fintax.westpointtrading.com/api';

  // Folder section keys
  static const String sectionFormation = '00_Gruendung';
  static const String sectionAccounting = '01_FiBu';
  static const String sectionPayroll = '02_LoBu';
  static const String sectionCorrespondence = '00_Schriftverkehr';
  static const String sectionAgenda = '03_Agenda';

  // Route names
  static const String routeLogin = '/login';
  static const String routeFirstLogin = '/first-login';
  static const String routeHome = '/home';
  static const String routeSection = '/section';
  static const String routeCameraScan = '/camera-scan';
  static const String routeWhatsApp = '/whatsapp-import';
  static const String routeDocDetail = '/document-detail';
  static const String routePayroll = '/payroll';
  static const String routeNewEmployee = '/new-employee';
  static const String routeTodos = '/todos';
  static const String routeProfile = '/profile';
}
