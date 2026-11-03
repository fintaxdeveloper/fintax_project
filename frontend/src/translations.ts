export type Language = 'en' | 'de';

export const translations = {
  en: {
    // Header
    brandTitle: 'FINTAX',
    brandBadge: 'SKR03 Engine',
    brandSubtitle: 'AI Document Processing & Tax Automation Platform',
    aiActive: 'AI Service Active',
    exportAgendaBtn: 'Export Agenda SKR03',

    // Stats
    totalDocs: 'Total Documents',
    pendingReview: 'Pending Review',
    approved: 'Approved',
    exported: 'Exported to Agenda',

    // Upload
    uploadAnalyzing: 'AI is analyzing document data...',
    uploadAnalyzingSubtitle: 'OCR text recognition, VAT verification & SKR03 mapping in progress',
    uploadTitle: 'Upload invoice or receipt here',
    uploadSubtitle: 'PDF, JPG or PNG (max. 25 MB). AI extracts supplier, date, amounts, and tax automatically.',
    selectFileBtn: 'Select File',

    // Filters
    tabAll: 'All Documents',
    tabAttention: 'Needs Attention',
    tabApproved: 'Approved',
    noDocs: 'No documents in this view yet.',

    // Table Headers
    thDocument: 'Document',
    thSupplier: 'Supplier / Vendor',
    thInvoiceNo: 'Invoice No.',
    thDate: 'Date',
    thGrossTotal: 'Gross Amount',
    thSkr03Account: 'SKR03 Account',
    thStatus: 'Status',
    thActions: 'Actions',

    // Status Badges
    badgeReady: 'Ready for Review',
    badgeAttention: 'Needs Attention',
    badgeApproved: 'Approved',
    badgeExported: 'Exported',
    badgeProcessing: 'AI Processing...',

    // Actions
    btnReview: 'Review',
    btnDelete: 'Delete',
    confirmDelete: 'Are you sure you want to delete this document?',

    // Modal
    modalTitle: 'Document Review (Human-in-the-Loop)',
    modalSubtitle: 'Original: {filename} • Status: {status}',
    openOriginalNewTab: 'Open original in new tab',
    mathPassed: 'Arithmetic check passed: Net + VAT = Gross total',
    mathFailed: 'Arithmetic mismatch: Net + VAT equals {calc} €, but Gross is {total} € (Difference: {diff} €).',

    // Modal Fields
    fieldSupplier: 'Supplier / Issuer',
    fieldInvoiceNo: 'Invoice Number',
    fieldDate: 'Document Date',
    fieldSkr03Account: 'SKR03 Booking Account',
    fieldVatRate: 'VAT Rate (%)',
    fieldNetAmount: 'Net Amount (€)',
    fieldVatAmount: 'VAT Amount (€)',
    fieldGrossTotal: 'Gross Total (€)',

    // SKR03 Accounts
    acc4930: '4930 - Office Supplies',
    acc4980: '4980 - Operating Supplies',
    acc4964: '4964 - IT & Software Expenses',
    acc4660: '4660 - Travel & Entertainment Expenses',
    acc4910: '4910 - Postage & Telecommunications',
    acc4900: '4900 - Other Operating Expenses',

    // VAT Options
    vat19: '19% Standard Rate',
    vat7: '7% Reduced Rate',
    vat0: '0% Tax Exempt / None',

    // Modal Buttons
    btnSaveDraft: 'Save Draft',
    btnApprove: 'Approve for Agenda SKR03',

    // Correspondence & Deadline Module (PDF Page 10)
    corrTabLabel: 'Tax Office Letters & Deadlines (PDF Page 10)',
    corrBannerTitle: 'Finanzamt & Authority Correspondence — Deadline Tracking',
    corrBannerDesc: 'AI reads official letters, extracts deadlines (Fristen), classifies urgency, and enables 1-click task creation for accountants.',
    corrSeedDemoBtn: 'Load Demo Finanzamt Letter (PDF Page 10)',
    corrUploadBtn: 'Upload Tax Office Letter',
    corrEmptyTitle: 'No correspondence letters loaded yet',
    corrEmptyDesc: 'Click "Load Demo Finanzamt Letter" above, or upload an official letter to extract deadlines and create tasks.',
    corrThSender: 'Sender / Authority',
    corrThLetterType: 'Letter Type / Category',
    corrThDeadline: 'Deadline (Frist)',
    corrThUrgency: 'Urgency',
    corrThSummary: 'AI Summary',
    corrThTask: 'Task',
    corrUrgencyHigh: 'HIGH',
    corrUrgencyMedium: 'MEDIUM',
    corrUrgencyLow: 'LOW',
    corrCreateTask: 'Create Task',
    corrTaskCreated: 'Task Created ✓',
    corrDaysLeft: 'days left',
    corrOverdue: 'OVERDUE',
    corrToday: 'TODAY',
    corrNoDeadline: 'No deadline',
    corrDetailTitle: 'Correspondence Detail',
    corrDetailSender: 'Authority / Sender',
    corrDetailType: 'Classification',
    corrDetailTaxNo: 'Tax Number / Ref.',
    corrDetailLetterDate: 'Letter Date',
    corrDetailDeadline: 'Legal Deadline (Frist)',
    corrDetailSummary: 'AI-Generated Summary',
    corrDetailAction: 'Recommended Action',
    corrDetailFile: 'Source Document',

    // Payroll & Wage Accounting Module (PDF Page 9)
    payrollTabLabel: 'Payroll & Wage Accounting (PDF Page 9)',
    payrollBannerTitle: 'German Payroll Management & Employee Submissions (PDF Page 9)',
    payrollBannerDesc: 'Seamless workflow between employer and tax consultant: submit new hires, monthly overtime/hours, sick notes (eAU), and dispatch approved payslips.',
    payrollSeedDemoBtn: 'Load Demo Payroll Data (PDF Page 9)',
    payrollNewHireBtn: 'New Employee (Stammdaten)',
    payrollHoursBtn: 'Monthly Hours & Overtime',
    payrollSickBtn: 'Sick Note (eAU)',
    payrollApproveBtn: 'Verify & Issue Payslip',
    payrollSubmissionsTitle: 'Employer Payroll Submissions',
    payrollPayslipsTitle: 'Issued Payslips Archive',
    payrollStatusSubmitted: 'Submitted',
    payrollStatusVerified: 'Verified',
    payrollStatusProcessed: 'Processed & Issued',

    // File Explorer & Masking
    vaultTabLabel: 'Folder Vault (00-03)',
    fileExplorerTitle: 'Standard Client Archive Structure (00 → 03)',
    fileExplorerSubtitle: 'Automated 4-folder structure conforming to German GoBD tax archiving regulations',
    maskDataLabel: 'GDPR Data Masking',
    maskToggleShow: 'Show Sensitive IDs',
    maskToggleHide: 'Mask Sensitive IDs',
  },
  de: {
    // Header
    brandTitle: 'FINTAX',
    brandBadge: 'SKR03 Engine',
    brandSubtitle: 'KI-Belegverarbeitung & Steuerautomatisierungs-Plattform',
    aiActive: 'KI-Dienst Aktiv',
    exportAgendaBtn: 'Export Agenda SKR03',

    // Stats
    totalDocs: 'Gesamt Dokumente',
    pendingReview: 'Zur Prüfung (Review)',
    approved: 'Freigegeben (Approved)',
    exported: 'In Agenda Exportiert',

    // Upload
    uploadAnalyzing: 'KI analysiert Belegdaten...',
    uploadAnalyzingSubtitle: 'Texterkennung, USt-Prüfung & SKR03-Zuordnung laufen',
    uploadTitle: 'Rechnung oder Beleg hier hochladen',
    uploadSubtitle: 'PDF, JPG oder PNG (max. 25 MB). Die KI extrahiert Lieferant, Datum, Beträge und Steuern automatisch.',
    selectFileBtn: 'Datei auswählen',

    // Filters
    tabAll: 'Alle Belege',
    tabAttention: 'Prüfung erforderlich',
    tabApproved: 'Freigegeben',
    noDocs: 'Noch keine Belege in dieser Ansicht vorhanden.',

    // Table Headers
    thDocument: 'Dokument',
    thSupplier: 'Lieferant / Absender',
    thInvoiceNo: 'Rechnungs-Nr.',
    thDate: 'Belegdatum',
    thGrossTotal: 'Bruttobetrag',
    thSkr03Account: 'SKR03 Konto',
    thStatus: 'Status',
    thActions: 'Aktionen',

    // Status Badges
    badgeReady: 'Bereit zur Prüfung',
    badgeAttention: 'Prüfung nötig',
    badgeApproved: 'Freigegeben',
    badgeExported: 'Exportiert',
    badgeProcessing: 'KI läuft...',

    // Actions
    btnReview: 'Prüfen',
    btnDelete: 'Löschen',
    confirmDelete: 'Möchten Sie dieses Dokument wirklich löschen?',

    // Modal
    modalTitle: 'Belegprüfung (Human-in-the-Loop Review)',
    modalSubtitle: 'Original: {filename} • Status: {status}',
    openOriginalNewTab: 'Original in neuem Tab öffnen',
    mathPassed: 'Rechenprüfung bestanden: Netto + USt = Bruttobetrag',
    mathFailed: 'Rechenfehler erkannt: Netto + USt ergibt {calc} €, aber Brutto ist {total} € (Differenz: {diff} €).',

    // Modal Fields
    fieldSupplier: 'Lieferant / Aussteller',
    fieldInvoiceNo: 'Rechnungsnummer',
    fieldDate: 'Belegdatum',
    fieldSkr03Account: 'SKR03 Buchungskonto',
    fieldVatRate: 'USt-Satz (%)',
    fieldNetAmount: 'Nettobetrag (€)',
    fieldVatAmount: 'Umsatzsteuer (€)',
    fieldGrossTotal: 'Gesamtbetrag Brutto (€)',

    // SKR03 Accounts
    acc4930: '4930 - Bürobedarf',
    acc4980: '4980 - Betriebsbedarf',
    acc4964: '4964 - IT & Softwareaufwand',
    acc4660: '4660 - Reisekosten / Bewirtung',
    acc4910: '4910 - Porto & Telefon',
    acc4900: '4900 - Sonstige betriebliche Aufwendungen',

    // VAT Options
    vat19: '19% Regelsteuersatz',
    vat7: '7% Ermäßigter Steuersatz',
    vat0: '0% Steuerfrei / Kein Ausweis',

    // Modal Buttons
    btnSaveDraft: 'Entwurf speichern',
    btnApprove: 'Freigeben für Agenda SKR03',

    // Correspondence & Deadline Module (PDF Seite 10)
    corrTabLabel: 'Behördenpost & Fristen (PDF Seite 10)',
    corrBannerTitle: 'Finanzamt- & Behördenpost — Fristenverwaltung',
    corrBannerDesc: 'Die KI liest amtliche Schreiben, erkennt Fristen (z.B. „bis zum DD.MM.YYYY"), klassifiziert die Dringlichkeit und ermöglicht 1-Klick-Aufgabenerstellung.',
    corrSeedDemoBtn: 'Demo Finanzamt-Schreiben laden (PDF S. 10)',
    corrUploadBtn: 'Behördenschreiben hochladen',
    corrEmptyTitle: 'Noch keine Behördenpost vorhanden',
    corrEmptyDesc: 'Klicken Sie oben auf „Demo Finanzamt-Schreiben laden" oder laden Sie ein amtliches Schreiben hoch.',
    corrThSender: 'Absender / Behörde',
    corrThLetterType: 'Schreibenart / Kategorie',
    corrThDeadline: 'Frist (Deadline)',
    corrThUrgency: 'Dringlichkeit',
    corrThSummary: 'KI-Zusammenfassung',
    corrThTask: 'Aufgabe',
    corrUrgencyHigh: 'HOCH',
    corrUrgencyMedium: 'MITTEL',
    corrUrgencyLow: 'NIEDRIG',
    corrCreateTask: 'Aufgabe erstellen',
    corrTaskCreated: 'Aufgabe erstellt ✓',
    corrDaysLeft: 'Tage übrig',
    corrOverdue: 'ÜBERFÄLLIG',
    corrToday: 'HEUTE',
    corrNoDeadline: 'Keine Frist',
    corrDetailTitle: 'Korrespondenzdetails',
    corrDetailSender: 'Behörde / Absender',
    corrDetailType: 'Klassifizierung',
    corrDetailTaxNo: 'Steuernummer / Aktenzeichen',
    corrDetailLetterDate: 'Datum des Schreibens',
    corrDetailDeadline: 'Gesetzliche Frist',
    corrDetailSummary: 'KI-generierte Zusammenfassung',
    corrDetailAction: 'Empfohlene Maßnahme',
    corrDetailFile: 'Quelldokument',

    // Payroll & Wage Accounting Module (PDF Seite 9)
    payrollTabLabel: 'Lohn & Gehalt (PDF Seite 9)',
    payrollBannerTitle: 'Lohnabrechnung & Mandanten-Meldungen (PDF Seite 9)',
    payrollBannerDesc: 'Nahtlose Zusammenarbeit zwischen Arbeitgeber und Kanzlei: Stammdaten-Neuzugänge, variable Stunden/Überstunden, Krankmeldungen (eAU) und Gehaltsabrechnungen.',
    payrollSeedDemoBtn: 'Demo-Lohndaten laden (PDF S. 9)',
    payrollNewHireBtn: 'Neuer Mitarbeiter (Stammdaten)',
    payrollHoursBtn: 'Monatliche Stunden & Boni',
    payrollSickBtn: 'Krankmeldung (eAU)',
    payrollApproveBtn: 'Prüfen & Abrechnen',
    payrollSubmissionsTitle: 'Eingereichte Arbeitgeber-Meldungen',
    payrollPayslipsTitle: 'Verfügbare Gehaltsabrechnungen',
    payrollStatusSubmitted: 'Eingereicht',
    payrollStatusVerified: 'Geprüft',
    payrollStatusProcessed: 'Abgerechnet & Bereitgestellt',

    // File Explorer & Masking
    vaultTabLabel: 'Kanzlei-Ordner (00-03)',
    fileExplorerTitle: 'Standardisierte Kanzlei-Ordnerstruktur (00 → 03)',
    fileExplorerSubtitle: 'Automatisierte 4-Ordner-Struktur gemäß deutschen GoBD-Aufbewahrungsvorgaben',
    maskDataLabel: 'DSGVO Datenschutz-Maskierung',
    maskToggleShow: 'Sensible Daten anzeigen',
    maskToggleHide: 'Sensible Daten maskieren',
  },
};
