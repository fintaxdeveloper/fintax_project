import 'package:flutter/material.dart';
import '../../../core/l10n/translations.dart';
import '../../../core/theme/app_colors.dart';

/// Small English/German text pair that follows the selected app language.
class L {
  final String en;
  final String de;
  const L(this.en, this.de);

  String get text => Tr.currentLang == 'de' ? de : en;
}

/// A required document in the Master Records checklist. [keywords] are
/// matched against uploaded filenames to mark the item as uploaded.
class RequiredDoc {
  final L title;
  final L subtitle;
  final List<String> keywords;
  const RequiredDoc(this.title, this.subtitle, this.keywords);
}

/// Everything the submit screen needs to know about one folder.
class FolderConfig {
  final String categoryKey;
  final L title;
  final L submitTitle;
  final L subtitle;
  final IconData icon;
  final Color color;
  final Color lightColor;
  final List<L> documentTypes;
  final L notePlaceholder;
  final bool showPipeline;
  final bool showPeriod;
  final List<RequiredDoc> checklist;

  const FolderConfig({
    required this.categoryKey,
    required this.title,
    required this.submitTitle,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.lightColor,
    required this.documentTypes,
    required this.notePlaceholder,
    this.showPipeline = false,
    this.showPeriod = true,
    this.checklist = const [],
  });

  static const financialAccounting = FolderConfig(
    categoryKey: '01_FiBu',
    title: L('Financial Accounting', 'Finanzbuchhaltung'),
    submitTitle: L('Submit Financial Accounting Documents', 'FiBu-Belege einreichen'),
    subtitle: L('Bank statements, receipts & invoices', 'Kontoauszüge, Belege & Rechnungen'),
    icon: Icons.bar_chart_rounded,
    color: AppColors.emeraldIcon,
    lightColor: AppColors.emeraldBox,
    showPipeline: true,
    documentTypes: [
      L('Kontoauszug', 'Kontoauszug'),
      L('Bankbelege', 'Bankbelege'),
      L('Kassebelege', 'Kassenbelege'),
      L('Entertainment Receipts', 'Bewirtungsbelege'),
      L('Fuel Receipts', 'Tankbelege'),
      L('Other', 'Sonstiges'),
    ],
    notePlaceholder: L('e.g. Two receipts belong to the trip to Munich…',
        'z. B. Zwei Belege gehören zur Reise nach München…'),
  );

  static const payroll = FolderConfig(
    categoryKey: '02_LoBu',
    title: L('Payroll & Team', 'Lohn & Team'),
    submitTitle: L('Submit Payroll Documents', 'Lohnunterlagen einreichen'),
    subtitle: L('Timesheets, sick notes & staff changes', 'Stundenzettel, Krankmeldungen & Personal'),
    icon: Icons.people_outline_rounded,
    color: AppColors.purpleIcon,
    lightColor: AppColors.purpleBox,
    documentTypes: [
      L('Payroll Documents', 'Lohnunterlagen'),
      L('Timesheets', 'Stundenzettel'),
      L('New Employees', 'Neue Mitarbeiter'),
      L('Resignations / Terminations', 'Kündigungen'),
      L('Sick Leave Certificates', 'Krankmeldungen'),
      L('Leave / Time Off', 'Urlaub / Freizeit'),
      L('Other', 'Sonstiges'),
    ],
    notePlaceholder: L('e.g. Leave request attached, please include 12 overtime hours…',
        'z. B. Urlaubsantrag anbei, bitte 12 Überstunden berücksichtigen…'),
  );

  static const correspondence = FolderConfig(
    categoryKey: '00_Schriftverkehr',
    title: L('Correspondence', 'Schriftverkehr'),
    submitTitle: L('Submit Correspondence Documents', 'Schriftverkehr einreichen'),
    subtitle: L('Tax notices, letters & contracts', 'Bescheide, Briefe & Verträge'),
    icon: Icons.mail_outline_rounded,
    color: AppColors.orangeIcon,
    lightColor: AppColors.orangeBox,
    documentTypes: [
      L('Official Letters from Authorities', 'Behördenschreiben'),
      L('Contracts', 'Verträge'),
      L('Other Documents', 'Sonstige Dokumente'),
    ],
    notePlaceholder: L('e.g. Tax assessment letter from the tax office with deadline…',
        'z. B. Steuerbescheid vom Finanzamt mit Frist…'),
  );

  static const masterRecords = FolderConfig(
    categoryKey: '00_Gruendung',
    title: L('Master Records', 'Stammdaten'),
    submitTitle: L('Submit Formation Documents', 'Gründungsunterlagen einreichen'),
    subtitle: L('Company formation & registration', 'Firmengründung & Registrierung'),
    icon: Icons.domain_rounded,
    color: AppColors.indigoIcon,
    lightColor: AppColors.indigoBox,
    showPeriod: false,
    documentTypes: [
      L('Commercial Register', 'Handelsregister'),
      L('Trade Registration', 'Gewerbeanmeldung'),
      L('Articles of Association', 'Gesellschaftsvertrag'),
      L('Founder ID / Passport', 'Ausweis / Reisepass'),
      L('Tax ID Notice', 'Steuernummer-Bescheid'),
      L('Other', 'Sonstiges'),
    ],
    checklist: [
      RequiredDoc(L('Commercial Register', 'Handelsregister'),
          L('Certified register extract', 'Beglaubigter Auszug'), ['handelsregister', 'hrb', 'register']),
      RequiredDoc(L('Trade Registration', 'Gewerbeanmeldung'),
          L('Official GewA1 filing', 'Offizielle GewA1-Meldung'), ['gewerbe', 'gewa1', 'trade']),
      RequiredDoc(L('Articles of Association', 'Gesellschaftsvertrag'),
          L('Company bylaws / agreement', 'Satzung / Vertrag'), ['gesellschaftsvertrag', 'satzung', 'articles']),
      RequiredDoc(L('Founder ID / Passport', 'Ausweis / Reisepass'),
          L('Managing Director ID', 'Ausweis Geschäftsführer'), ['ausweis', 'passport', 'reisepass', 'id_']),
      RequiredDoc(L('Tax ID Notice', 'Steuernummer'),
          L('Tax authority letter', 'Schreiben vom Finanzamt'), ['steuernummer', 'taxid', 'tax_id']),
    ],
    notePlaceholder: L('e.g. Updated register extract after address change…',
        'z. B. Aktueller Registerauszug nach Adressänderung…'),
  );
}
