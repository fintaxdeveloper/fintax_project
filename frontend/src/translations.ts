export type Language = 'en' | 'de' | 'fa' | 'ar';

const enData = {
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
};

const deData = {
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
};

const faData = {
    // Header
    brandTitle: 'FinTax',
    brandBadge: 'SKR03',
    brandSubtitle: 'سیستم هوشمند پردازش اسناد مالی و مالیاتی',
    aiActive: 'سرویس هوش مصنوعی فعال است',
    exportAgendaBtn: 'خروجی Agenda SKR03',

    // Stats
    totalDocs: 'کل اسناد',
    pendingReview: 'در انتظار بررسی',
    approved: 'تأیید شده',
    exported: 'صادر شده به Agenda',

    // Upload
    uploadAnalyzing: 'هوش مصنوعی در حال تحلیل سند است...',
    uploadAnalyzingSubtitle: 'شناسایی خودکار متن، محاسبه مالیات و تطبیق SKR03 در جریان است',
    uploadTitle: 'بارگذاری فاکتور یا رسید',
    uploadSubtitle: 'فایل‌های PDF، JPG یا PNG (حداکثر ۲۵ مگابایت). استخراج خودکار مشخصات فروشنده، تاریخ و مبالغ.',
    selectFileBtn: 'انتخاب فایل',

    // Filters
    tabAll: 'همه اسناد',
    tabAttention: 'نیازمند توجه',
    tabApproved: 'تأیید شده',
    noDocs: 'هنوز سندی ثبت نشده است.',

    // Table Headers
    thDocument: 'سند',
    thSupplier: 'تأمین‌کننده / فروشنده',
    thInvoiceNo: 'شماره فاکتور',
    thDate: 'تاریخ',
    thGrossTotal: 'مبلغ کل (ناخالص)',
    thSkr03Account: 'حساب SKR03',
    thStatus: 'وضعیت',
    thActions: 'عملیات',

    // Status Badges
    badgeReady: 'آماده بررسی',
    badgeAttention: 'نیازمند بررسی',
    badgeApproved: 'تأیید شده',
    badgeExported: 'صادر شده',
    badgeProcessing: 'در حال پردازش هوش مصنوعی...',

    // Actions
    btnReview: 'بررسی',
    btnDelete: 'حذف',
    btnApprove: 'تأیید برای Agenda SKR03',
    btnSaveDraft: 'ذخیره پیش‌نویس',

    // Modal
    modalTitle: 'بررسی سند (Human-in-the-Loop)',
    modalSubtitle: 'سند اصلی: {filename} • وضعیت: {status}',
    openOriginalNewTab: 'نمایش سند اصلی در برگه جدید',

    // Review Form Fields
    fieldSupplier: 'نام تأمین‌کننده / فروشنده',
    fieldInvoiceNo: 'شماره فاکتور',
    fieldDocDate: 'تاریخ سند',
    fieldSkr03Account: 'حساب دفتر کل SKR03',
    fieldVatRate: 'نرخ مالیات بر ارزش افزوده (%)',
    fieldNet: 'مبلغ خالص (€)',
    fieldVatAmount: 'مبلغ مالیات (€)',
    fieldGross: 'مبلغ کل ناخالص (€)',
    fieldNotes: 'یادداشت حسابدار',

    // Math Validation Messages
    mathSuccess: 'کنترل ریاضی تأیید شد: مبلغ خالص + مالیات = مبلغ ناخالص',
    mathError: 'مغایرت در محاسبات: مبلغ خالص + مالیات با مبلغ کل برابر نیست (اختلاف: {diff} €)',
    warnSupplierMissing: 'نام فروشنده مشخص نیست.',
    warnInvoiceNoMissing: 'شماره فاکتور یافت نشد.',
    warnDateMissing: 'تاریخ فاکتور مشخص نیست.',
    warnAmountZero: 'مبلغ فاکتور باید بیشتر از صفر باشد.',
    warnDuplicate: 'احتمال ثبت تکراری این سند وجود دارد.',

    // Correspondence
    correspondenceTabLabel: 'مکاتبات اداره مالیات (Finanzamt)',
    correspondenceBannerTitle: 'سیستم هوشمند مکاتبات مالیاتی و مهلت‌های قانونی',
    correspondenceBannerDesc: 'استخراج هوشمند مهلت‌ها (Fristen)، اقدامات لازم و اعلام به حسابدار مسئول.',
    corrEmptyState: 'هنوز نامه‌ای بارگذاری نشده است.',
    corrUrgencyHigh: 'فوری',
    corrUrgencyMedium: 'متوسط',
    corrUrgencyLow: 'عادی',
    corrCreateTask: 'ایجاد وظیفه',
    corrTaskCreated: 'وظیفه ثبت شد ✓',
    corrDaysLeft: 'روز باقی‌مانده',
    corrOverdue: 'منقضی شده',
    corrToday: 'امروز',
    corrNoDeadline: 'بدون مهلت',
    corrDetailTitle: 'جزئیات مکاتبه',
    corrDetailSender: 'اداره / فرستنده',
    corrDetailType: 'طبقه‌بندی',
    corrDetailTaxNo: 'شماره مالیاتی',
    corrDetailLetterDate: 'تاریخ نامه',
    corrDetailDeadline: 'مهلت قانونی',
    corrDetailSummary: 'خلاصه هوش مصنوعی',
    corrDetailAction: 'اقدام پیشنهادی',
    corrDetailFile: 'فایل منبع',

    payrollTabLabel: 'حقوق و دستمزد',
    payrollBannerTitle: 'سامانه حقوق و دستمزد',
    payrollBannerDesc: 'ارسال مدارک استخدامی، ساعات کاری، اضافه کاری و گواهی استعلاجی.',
    payrollSeedDemoBtn: 'بارگذاری اطلاعات نمونه',
    payrollNewHireBtn: 'کارمند جدید',
    payrollHoursBtn: 'ساعات کاری و پاداش',
    payrollSickBtn: 'گواهی استعلاجی',
    payrollApproveBtn: 'بررسی و محاسبه',
    payrollSubmissionsTitle: 'گزارش‌های ارسالی',
    payrollPayslipsTitle: 'فیش‌های حقوقی',
    payrollStatusSubmitted: 'ارسال شده',
    payrollStatusVerified: 'بررسی شده',
    payrollStatusProcessed: 'محاسبه شده',

    vaultTabLabel: 'پوشه‌های کلاینت (00-03)',
    fileExplorerTitle: 'ساختار استاندارد پوشه‌های حسابداری (00 → 03)',
    fileExplorerSubtitle: 'سازگار با استانداردهای GoBD آلمان',
    maskDataLabel: 'پوشش اطلاعات حساس (DSGVO)',
    maskToggleShow: 'نمایش اطلاعات',
    maskToggleHide: 'پوشش اطلاعات',
};

const arData = {
    // Header
    brandTitle: 'FinTax',
    brandBadge: 'SKR03',
    brandSubtitle: 'منصة المعالجة الذكية للمستندات والضرائب الألمانية',
    aiActive: 'خدمة الذكاء الاصطناعي نشطة',
    exportAgendaBtn: 'تصدير Agenda SKR03',

    // Stats
    totalDocs: 'إجمالي المستندات',
    pendingReview: 'قيد المراجعة',
    approved: 'معتمد',
    exported: 'تم التصدير إلى Agenda',

    // Upload
    uploadAnalyzing: 'الذكاء الاصطناعي يقوم بتحليل المستند...',
    uploadAnalyzingSubtitle: 'التعرف الضوئي على النصوص واحتساب الضرائب وتصنيف SKR03 جاري الآن',
    uploadTitle: 'رفع الفاتورة أو الإيصال',
    uploadSubtitle: 'ملفات PDF أو JPG أو PNG (الحد الأقصى 25 ميجابايت). استخراج تلقائي للمورد والتاريخ والمبالغ.',
    selectFileBtn: 'اختيار ملف',

    // Filters
    tabAll: 'جميع المستندات',
    tabAttention: 'بحاجة إلى مراجعة',
    tabApproved: 'معتمد',
    noDocs: 'لا توجد مستندات بعد.',

    // Table Headers
    thDocument: 'المستند',
    thSupplier: 'المورد / البائع',
    thInvoiceNo: 'رقم الفاتورة',
    thDate: 'التاريخ',
    thGrossTotal: 'المبلغ الإجمالي',
    thSkr03Account: 'حساب SKR03',
    thStatus: 'الحالة',
    thActions: 'الإجراءات',

    // Status Badges
    badgeReady: 'جاهز للمراجعة',
    badgeAttention: 'يتطلب انتباه',
    badgeApproved: 'معتمد',
    badgeExported: 'تم التصدير',
    badgeProcessing: 'معالجة بالذكاء الاصطناعي...',

    // Actions
    btnReview: 'مراجعة',
    btnDelete: 'حذف',
    btnApprove: 'اعتماد لـ Agenda SKR03',
    btnSaveDraft: 'حفظ كمسودة',

    // Modal
    modalTitle: 'مراجعة المستند (Human-in-the-Loop)',
    modalSubtitle: 'المستند الأصلي: {filename} • الحالة: {status}',
    openOriginalNewTab: 'عرض المستند الأصلي في علامة تبويب جديدة',

    // Review Form Fields
    fieldSupplier: 'اسم المورد',
    fieldInvoiceNo: 'رقم الفاتورة',
    fieldDocDate: 'تاريخ المستند',
    fieldSkr03Account: 'حساب SKR03',
    fieldVatRate: 'نسبة الضريبة (%)',
    fieldNet: 'المبلغ الصافي (€)',
    fieldVatAmount: 'قيمة الضريبة (€)',
    fieldGross: 'المبلغ الإجمالي (€)',
    fieldNotes: 'ملاحظات المحاسب',

    // Math Validation Messages
    mathSuccess: 'التدقيق الحسابي صحيح: الصافي + الضريبة = الإجمالي',
    mathError: 'خطأ حسابي: الصافي + الضريبة لا يساوي الإجمالي (الفرق: {diff} €)',
    warnSupplierMissing: 'اسم المورد غير واضح.',
    warnInvoiceNoMissing: 'رقم الفاتورة غير محدد.',
    warnDateMissing: 'تاريخ الفاتورة مفقود.',
    warnAmountZero: 'يجب أن يكون المبلغ أكبر من صفر.',
    warnDuplicate: 'تحذير: يحتمل تكرار هذا المستند.',

    // Correspondence
    correspondenceTabLabel: 'مراسلات مصلحة الضرائب (Finanzamt)',
    correspondenceBannerTitle: 'إدارة المراسلات الضريبية والمواعيد القانونية',
    correspondenceBannerDesc: 'استخراج تلقائي للمواعيد النهائية والإجراءات المطلوبة للمحاسب.',
    corrEmptyState: 'لم يتم استلام أي خطابات بعد.',
    corrUrgencyHigh: 'عاجل جداً',
    corrUrgencyMedium: 'متوسط',
    corrUrgencyLow: 'عادي',
    corrCreateTask: 'إنشاء مهمة',
    corrTaskCreated: 'تم إنشاء المهمة ✓',
    corrDaysLeft: 'أيام متبقية',
    corrOverdue: 'متأخر',
    corrToday: 'اليوم',
    corrNoDeadline: 'بدون موعد نهائي',
    corrDetailTitle: 'تفاصيل المراسلة',
    corrDetailSender: 'الجهة / المرسل',
    corrDetailType: 'التصنيف',
    corrDetailTaxNo: 'الرقم الضريبي',
    corrDetailLetterDate: 'تاريخ الخطاب',
    corrDetailDeadline: 'الموعد القانوني',
    corrDetailSummary: 'ملخص الذكاء الاصطناعي',
    corrDetailAction: 'الإجراء المقترح',
    corrDetailFile: 'المستند الأصلي',

    payrollTabLabel: 'الرواتب والأجور',
    payrollBannerTitle: 'إدارة الرواتب والأجور',
    payrollBannerDesc: 'التعاون السلس بين صاحب العمل والمحاسب: بيانات الموظفين الجدد، ساعات العمل، الإجازات المرضية.',
    payrollSeedDemoBtn: 'تحميل بيانات تجريبية',
    payrollNewHireBtn: 'موظف جديد',
    payrollHoursBtn: 'ساعات العمل والمكافآت',
    payrollSickBtn: 'إجازة مرضية',
    payrollApproveBtn: 'مراجعة واحتساب',
    payrollSubmissionsTitle: 'الطلبات المقدمة',
    payrollPayslipsTitle: 'قسائم الرواتب المتاحة',
    payrollStatusSubmitted: 'تم التقديم',
    payrollStatusVerified: 'تم التحقق',
    payrollStatusProcessed: 'تم الاحتساب والإنهاء',

    vaultTabLabel: 'مجلدات العميل (00-03)',
    fileExplorerTitle: 'الهيكل القياسي لمجلدات المحاسبة (00 → 03)',
    fileExplorerSubtitle: 'متوافق مع معايير GoBD الألمانية',
    maskDataLabel: 'حماية البيانات الحساسة (DSGVO)',
    maskToggleShow: 'إظهار البيانات الحساسة',
    maskToggleHide: 'إخفاء البيانات الحساسة',
};

export const translations = {
  en: enData,
  de: deData,
  fa: { ...enData, ...faData },
  ar: { ...enData, ...arData },
};
