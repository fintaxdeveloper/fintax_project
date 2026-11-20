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
    'welcomeBack': {'en': 'Welcome back', 'de': 'Willkommen zurück'},
    'loginFormSubtitle': {'en': 'Sign in with your client number to continue.', 'de': 'Melden Sie sich mit Ihrer Mandantennummer an.'},

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

    // Home folder cards
    'financialAccounting': {'en': 'Financial Accounting', 'de': 'Finanzbuchhaltung'},
    'financialAccountingSub': {'en': 'Invoices & Bank Statements', 'de': 'Rechnungen & Kontoauszüge'},
    'payrollTeam': {'en': 'Payroll & Team', 'de': 'Lohn & Team'},
    'payrollTeamSub': {'en': 'Timesheets & Payslips', 'de': 'Stundenzettel & Lohnabrechnungen'},
    'correspondence': {'en': 'Correspondence', 'de': 'Schriftverkehr'},
    'correspondenceSub': {'en': 'Tax Letters & Deadlines', 'de': 'Steuerbriefe & Fristen'},
    'masterRecords': {'en': 'Master Records', 'de': 'Stammdaten'},
    'masterRecordsSub': {'en': 'Register, Gewerbe & Bylaws', 'de': 'Register, Gewerbe & Satzung'},
    'badgeActive': {'en': 'Active', 'de': 'Aktiv'},
    'badgeDue25': {'en': 'Due: 25th', 'de': 'Fällig: 25.'},
    'badgeTaxNotices': {'en': 'Tax Notices', 'de': 'Steuerbescheide'},
    'badgeSaved0': {'en': '0 saved', 'de': '0 gespeichert'},
    'actionSubmit': {'en': 'Submit', 'de': 'Einreichen'},
    'actionUpload': {'en': 'Upload', 'de': 'Hochladen'},
    'actionManage': {'en': 'Manage', 'de': 'Verwalten'},

    // Documents screen tabs
    'docsCountSuffix': {'en': 'docs', 'de': 'Belege'},
    'folderDocuments': {'en': 'Documents in this folder', 'de': 'Dokumente in diesem Ordner'},
    'noDocsInFolder': {'en': 'No documents in this folder yet', 'de': 'Noch keine Dokumente in diesem Ordner'},
    'noDocsInFolderSub': {'en': 'Tap "Scan" above to upload your first document.', 'de': 'Tippen Sie oben auf "Scannen", um ein Dokument hochzuladen.'},
    'quickScan': {'en': 'Scan', 'de': 'Scannen'},
    'quickFile': {'en': 'File', 'de': 'Datei'},
    'quickWhatsApp': {'en': 'WhatsApp', 'de': 'WhatsApp'},
    'invoiceChecked': {'en': 'Invoice #1039 checked', 'de': 'Rechnung #1039 geprüft'},
    'yesterdayTime': {'en': 'Yesterday, 16:40', 'de': 'Gestern, 16:40'},
    'recentDocuments': {'en': 'Recent documents', 'de': 'Letzte Dokumente'},
    'viewAll': {'en': 'View all', 'de': 'Alle anzeigen'},
    'noRecentDocuments': {'en': 'No documents uploaded yet', 'de': 'Noch keine Dokumente hochgeladen'},
    'statusChecked': {'en': 'Checked', 'de': 'Geprüft'},
    'statusProcessing': {'en': 'Processing', 'de': 'In Bearbeitung'},
    'statusNeedsReview': {'en': 'Review', 'de': 'Prüfen'},
    'today': {'en': 'Today', 'de': 'Heute'},
    'yesterday': {'en': 'Yesterday', 'de': 'Gestern'},

    // Add Document Screen
    'addDocument': {'en': 'Add a document', 'de': 'Dokument hinzufügen'},
    'pickFolderSub': {'en': 'Pick a folder, then scan or upload.', 'de': 'Ordner wählen, dann scannen oder hochladen.'},
    'invoiceDetected': {'en': 'Invoice detected', 'de': 'Rechnung erkannt'},
    'scanWithCamera': {'en': 'Scan with camera', 'de': 'Mit Kamera scannen'},
    'chooseFile': {'en': 'Choose file', 'de': 'Datei auswählen'},

    // Scanner
    'scanner': {'en': 'Scan document', 'de': 'Beleg scannen'},
    'section': {'en': 'Folder', 'de': 'Ordner'},
    'alignDocument': {'en': 'Align the document inside the frame', 'de': 'Beleg im Rahmen ausrichten'},
    'autoEdge': {'en': 'Auto edge detection', 'de': 'Automatische Kantenerkennung'},
    'page': {'en': 'Page', 'de': 'Seite'},
    'multiPageHint': {'en': 'tap to capture', 'de': 'zum Aufnehmen tippen'},
    'scanUploaded': {'en': 'Document uploaded', 'de': 'Beleg hochgeladen'},
    'scanSavedTo': {'en': 'Saved to {folder} and sent for checking.', 'de': 'In {folder} gespeichert und zur Prüfung gesendet.'},
    'cameraStarting': {'en': 'Starting camera…', 'de': 'Kamera wird gestartet…'},
    'cameraPermissionDenied': {'en': 'Camera access was denied. Allow the camera in the app settings, then try again.', 'de': 'Kamerazugriff verweigert. Bitte Kamera in den App-Einstellungen erlauben und erneut versuchen.'},
    'cameraUnavailable': {'en': 'No camera available. You can still choose a photo from the gallery.', 'de': 'Keine Kamera verfügbar. Sie können ein Foto aus der Galerie wählen.'},
    'tryAgain': {'en': 'Try again', 'de': 'Erneut versuchen'},
    'captureFailed': {'en': 'Could not take the photo. Please try again.', 'de': 'Foto konnte nicht aufgenommen werden. Bitte erneut versuchen.'},
    'uploadFailed': {'en': 'Upload failed. Please try again.', 'de': 'Hochladen fehlgeschlagen. Bitte erneut versuchen.'},
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

    // Notifications Screen
    'navNotifications': {'en': 'Notifications', 'de': 'Mitteilungen'},
    'notificationsSub': {'en': 'Updates from your FinTax team', 'de': 'Neuigkeiten von Ihrem FinTax-Team'},
    'markAllRead': {'en': 'Mark all read', 'de': 'Alle gelesen'},
    'unreadCount': {'en': '{count} unread', 'de': '{count} ungelesen'},
    'filterAll': {'en': 'All', 'de': 'Alle'},
    'filterUnread': {'en': 'Unread', 'de': 'Ungelesen'},
    'filterDocuments': {'en': 'Documents', 'de': 'Dokumente'},
    'filterDeadlines': {'en': 'Deadlines', 'de': 'Fristen'},
    'filterMessages': {'en': 'Messages', 'de': 'Nachrichten'},
    'earlier': {'en': 'Earlier', 'de': 'Früher'},
    'noNotifications': {'en': 'You are all caught up', 'de': 'Alles erledigt'},
    'noNotificationsSub': {'en': 'No notifications here right now.', 'de': 'Hier gibt es gerade keine Benachrichtigungen.'},
    'notifRemoved': {'en': 'Notification removed', 'de': 'Benachrichtigung entfernt'},
    'undo': {'en': 'Undo', 'de': 'Rückgängig'},
    'minutesAgo': {'en': '{n} min ago', 'de': 'vor {n} Min.'},
    'hoursAgo': {'en': '{n} h ago', 'de': 'vor {n} Std.'},
    'daysAgo': {'en': '{n} days ago', 'de': 'vor {n} Tagen'},
    'notifDocCheckedTitle': {'en': 'Document checked', 'de': 'Dokument geprüft'},
    'notifDocCheckedBody': {'en': 'Rechnung_Telekom_Okt.pdf was checked and booked.', 'de': 'Rechnung_Telekom_Okt.pdf wurde geprüft und gebucht.'},
    'notifDeadlineTitle': {'en': 'Deadline in 2 days', 'de': 'Frist in 2 Tagen'},
    'notifDeadlineBody': {'en': 'Please upload your September bank statement.', 'de': 'Bitte laden Sie Ihren Kontoauszug für September hoch.'},
    'notifMessageTitle': {'en': 'New message from your advisor', 'de': 'Neue Nachricht von Ihrem Berater'},
    'notifMessageBody': {'en': 'We need the receipt for invoice #1042.', 'de': 'Wir benötigen den Beleg zu Rechnung #1042.'},
    'notifReviewTitle': {'en': 'Document needs review', 'de': 'Dokument benötigt Prüfung'},
    'notifReviewBody': {'en': 'Scan_0815.jpg is blurry. Please scan it again.', 'de': 'Scan_0815.jpg ist unscharf. Bitte erneut scannen.'},
    'notifPayrollTitle': {'en': 'Payroll October ready', 'de': 'Lohnabrechnung Oktober fertig'},
    'notifPayrollBody': {'en': 'Payslips for 3 employees are available.', 'de': 'Lohnabrechnungen für 3 Mitarbeiter sind verfügbar.'},
    'notifTaxTitle': {'en': 'VAT return submitted', 'de': 'USt-Voranmeldung übermittelt'},
    'notifTaxBody': {'en': 'Your VAT return for September was sent to the tax office.', 'de': 'Ihre USt-Voranmeldung für September wurde an das Finanzamt gesendet.'},
    'notifTimesheetTitle': {'en': 'Timesheet reminder', 'de': 'Erinnerung Stundenzettel'},
    'notifTimesheetBody': {'en': 'Timesheet October is due in 9 days.', 'de': 'Stundenzettel Oktober ist in 9 Tagen fällig.'},

    // Profile Screen
    'profile': {'en': 'Profile', 'de': 'Profil'},
    'accountSecurity': {'en': 'Account & Security', 'de': 'Sicherheit & Konto'},
    'changePassword': {'en': 'Change Password', 'de': 'Passwort ändern'},
    'lastChanged30Days': {'en': 'Last changed 30 days ago', 'de': 'Letzte Änderung vor 30 Tagen'},
    'gobdGdpr': {'en': 'GoBD & GDPR Compliance', 'de': 'GoBD & DSGVO Konformität'},
    'serverFrankfurt': {'en': 'Server Location: Frankfurt am Main (DE)', 'de': 'Serverstandort: Frankfurt am Main (DE)'},
    'notifications': {'en': 'Notifications', 'de': 'Benachrichtigungen'},
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
