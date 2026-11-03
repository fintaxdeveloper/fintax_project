import 'package:flutter/material.dart';

class Tr {
  Tr._();

  static const Map<String, Map<String, String>> _translations = {
    'appTitle': {'en': 'FinTax Consulting', 'de': 'FinTax Consulting'},
    'login': {'en': 'Sign in', 'de': 'Anmelden'},
    'logout': {'en': 'Logout', 'de': 'Abmelden'},
    'clientNumber': {'en': 'Client number', 'de': 'Mandantennummer'},
    'password': {'en': 'Password', 'de': 'Passwort'},
    'loginHint': {'en': '20418', 'de': '20418'},
    'invalidCredentials': {'en': 'Invalid credentials.', 'de': 'Ungültige Anmeldedaten.'},
    'connectionError': {'en': 'Connection error', 'de': 'Verbindungsfehler'},
    'complianceNote': {'en': 'GDPR & GoBD compliant • Server in Germany', 'de': 'DSGVO & GoBD-konform • Server in Deutschland'},
    'yourFinancesTitle': {'en': 'Your finances,\nalways in order.', 'de': 'Ihre Finanzen,\nimmer im Blick.'},
    'loginSubtitle': {'en': 'Upload documents. Track tasks. Stay in touch with FinTax.', 'de': 'Belege hochladen. Aufgaben verfolgen. In Kontakt mit FinTax bleiben.'},
    'forgotPassword': {'en': 'Forgot password?', 'de': 'Passwort vergessen?'},
    'accountsNote': {'en': 'Accounts are created by FinTax', 'de': 'Konten werden von FinTax erstellt'},

    // Greetings & Welcome
    'goodMorning': {'en': 'Good morning,', 'de': 'Guten Morgen,'},
    'goodAfternoon': {'en': 'Good afternoon,', 'de': 'Guten Tag,'},
    'goodEvening': {'en': 'Good evening,', 'de': 'Guten Abend,'},
    'helloUser': {'en': 'Hello', 'de': 'Hallo'},
    'welcomePortal': {
      'en': 'Welcome, {name} to the client portal of FinTax Consulting',
      'de': 'Willkommen, {name} im Mandantenportal von FinTax Consulting',
    },

    // Home Screen
    'home': {'en': 'Home', 'de': 'Startseite'},
    'octoberAccounting': {'en': 'OCTOBER ACCOUNTING', 'de': 'OKTOBER BUCHHALTUNG'},
    'documentsMissing': {'en': '2 documents missing', 'de': '2 Belege fehlen'},
    'uploadNow': {'en': 'Upload now', 'de': 'Jetzt hochladen'},
    'yourFolders': {'en': 'Your folders', 'de': 'Ihre Ordner'},
    'companyFormation': {'en': 'Company\nformation', 'de': 'Unternehmens-\ngründung'},
    'accounting': {'en': 'Accounting', 'de': 'Buchhaltung'},
    'payroll': {'en': 'Payroll', 'de': 'Lohnabrechnung'},
    'letters': {'en': 'Letters', 'de': 'Schriftverkehr'},
    'invoiceChecked': {'en': 'Invoice #1039 checked', 'de': 'Rechnung #1039 geprüft'},
    'yesterdayTime': {'en': 'Yesterday, 16:40', 'de': 'Gestern, 16:40'},

    // Add Document Screen
    'addDocument': {'en': 'Add a document', 'de': 'Dokument hinzufügen'},
    'pickFolderSub': {'en': 'Pick a folder, then scan or upload.', 'de': 'Ordner wählen, dann scannen oder hochladen.'},
    'invoiceDetected': {'en': 'Invoice detected', 'de': 'Rechnung erkannt'},
    'scanWithCamera': {'en': 'Scan with camera', 'de': 'Mit Kamera scannen'},
    'chooseFile': {'en': 'Choose file', 'de': 'Datei auswählen'},
    'fromWhatsApp': {'en': 'From WhatsApp', 'de': 'Aus WhatsApp'},
    'uploadHintText': {'en': 'PDF, photo or scan · up to 50 MB and 200 pages', 'de': 'PDF, Foto oder Scan · bis 50 MB und 200 Seiten'},

    // To-dos Screen
    'todos': {'en': 'To-dos', 'de': 'To-Dos'},
    'requestsTeam': {'en': 'Requests from your FinTax team', 'de': 'Anfragen Ihres FinTax-Teams'},
    'open': {'en': 'Open', 'de': 'Offen'},
    'dueSoon': {'en': 'Due soon', 'de': 'Demnächst fällig'},
    'done': {'en': 'Done', 'de': 'Erledigt'},
    'urgent': {'en': 'Urgent', 'de': 'Dringend'},
    'soon': {'en': 'Soon', 'de': 'Demnächst'},
    'onTrack': {'en': 'On track', 'de': 'Pünktlich'},
    'bankStatementSept': {'en': 'Bank statement September', 'de': 'Kontoauszug September'},
    'dueIn2Days': {'en': 'Due in 2 days', 'de': 'Fällig in 2 Tagen'},
    'invoice1042': {'en': 'Invoice #1042', 'de': 'Rechnung #1042'},
    'dueIn5Days': {'en': 'Due in 5 days', 'de': 'Fällig in 5 Tagen'},
    'timesheetOct': {'en': 'Timesheet October', 'de': 'Stundenzettel Oktober'},
    'dueIn9Days': {'en': 'Due in 9 days', 'de': 'Fällig in 9 Tagen'},
    'sickNoteJWeber': {'en': 'Sick note, J. Weber', 'de': 'Krankmeldung, J. Weber'},
    'dueIn12Days': {'en': 'Due in 12 days', 'de': 'Fällig in 12 Tagen'},

    // Profile Screen
    'profile': {'en': 'Profile', 'de': 'Profil'},
    'accountSecurity': {'en': 'Account & Security', 'de': 'Sicherheit & Konto'},
    'changePassword': {'en': 'Change Password', 'de': 'Passwort ändern'},
    'lastChanged30Days': {'en': 'Last changed 30 days ago', 'de': 'Letzte Änderung vor 30 Tagen'},
    'gobdGdpr': {'en': 'GoBD & GDPR Compliance', 'de': 'GoBD & DSGVO Konformität'},
    'serverFrankfurt': {'en': 'Server Location: Frankfurt am Main (DE)', 'de': 'Serverstandort: Frankfurt am Main (DE)'},
    'notifications': {'en': 'Notifications', 'de': 'Einstellungen'},
    'pushNotifications': {'en': 'Push Notifications', 'de': 'Push-Benachrichtigungen'},
    'deadlineReminders': {'en': 'Deadline reminders & status updates', 'de': 'Frist-Erinnerungen & Status-Updates'},
    'language': {'en': 'Language', 'de': 'Sprache'},
    'legalSupport': {'en': 'Legal & Support', 'de': 'Rechtliches & Hilfe'},
    'privacyPolicy': {'en': 'Privacy Policy', 'de': 'Datenschutzerklärung'},
    'contactSupport': {'en': 'Contact FinTax Support', 'de': 'Kanzlei FinTax kontaktieren'},
    'confirmLogout': {'en': 'Are you sure you want to log out from FinTax App?', 'de': 'Möchten Sie sich wirklich von der FinTax App abmelden?'},
    'cancel': {'en': 'Cancel', 'de': 'Abbrechen'},

    // Navigation & Common
    'documents': {'en': 'Documents', 'de': 'Dokumente'},
    'tasks': {'en': 'Tasks', 'de': 'Aufgaben'},
    'frankfurt': {'en': 'Frankfurt (DE)', 'de': 'Frankfurt (DE)'},
  };

  static final ValueNotifier<String> languageNotifier = ValueNotifier<String>('en');

  static String get currentLang => languageNotifier.value;

  static void setLanguage(String lang) {
    if (lang == 'en' || lang == 'de') {
      languageNotifier.value = lang;
    }
  }

  static String get(String key) {
    final lang = languageNotifier.value;
    return _translations[key]?[lang] ?? _translations[key]?['en'] ?? key;
  }
}
