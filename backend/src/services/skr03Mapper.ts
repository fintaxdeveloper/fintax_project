import { supplierMemoryService } from './supplierMemoryService.js';

export interface Skr03Rule {
  keywords: string[];
  accountCode: string;
  accountName: string;
  defaultVatPercent: number;
}

/**
 * Comprehensive German SKR03 chart-of-accounts mapping rules.
 * Each rule maps supplier names / invoice description keywords to the
 * appropriate SKR03 expense or revenue account.
 */
export const SKR03_RULES: Skr03Rule[] = [
  // ─────────────────────────────────────────────────
  //  Monetary / Balance-sheet accounts (for reference)
  // ─────────────────────────────────────────────────

  // 1000 – Kasse (Cash)
  {
    keywords: ['kasse', 'bargeld', 'bar bezahlt', 'cash payment', 'petty cash', 'barauslage'],
    accountCode: '1000',
    accountName: 'Kasse',
    defaultVatPercent: 0,
  },
  // 1200 – Bank
  {
    keywords: ['banküberweisung', 'bank transfer', 'überweisung', 'lastschrift', 'sepa', 'bankeinzug', 'dauerauftrag'],
    accountCode: '1200',
    accountName: 'Bank',
    defaultVatPercent: 0,
  },
  // 1400 – Forderungen aus Lieferungen und Leistungen (Accounts Receivable)
  {
    keywords: ['forderung', 'forderungen', 'accounts receivable', 'debitor', 'ausstehend'],
    accountCode: '1400',
    accountName: 'Forderungen aus Lieferungen und Leistungen',
    defaultVatPercent: 0,
  },
  // 1600 – Verbindlichkeiten aus Lieferungen und Leistungen (Accounts Payable)
  {
    keywords: ['verbindlichkeit', 'verbindlichkeiten', 'accounts payable', 'kreditor', 'lieferantenrechnung'],
    accountCode: '1600',
    accountName: 'Verbindlichkeiten aus Lieferungen und Leistungen',
    defaultVatPercent: 0,
  },

  // ─────────────────────────────────────────────────
  //  1800-1899 – Privatentnahmen / Privateinlagen
  // ─────────────────────────────────────────────────
  {
    keywords: ['privatentnahme', 'privateinlage', 'entnahme', 'einlage', 'privatkonto', 'private withdrawal', 'owner draw'],
    accountCode: '1890',
    accountName: 'Privatentnahmen allgemein',
    defaultVatPercent: 0,
  },

  // ─────────────────────────────────────────────────
  //  3xxx – Wareneingang (Goods purchased)
  // ─────────────────────────────────────────────────

  // 3200 – Wareneingang (Fahrzeugankauf / Kfz-Handel)
  {
    keywords: [
      'fahrzeugankauf', 'pkw ankauf', 'ankauf', 'kaufvertrag', 'autoankauf', 'fahrzeugeinkauf',
      'gebrauchtwagen', 'fahrzeugkauf', 'auto ankauf', 'kfz ankauf', 'kfz-ankauf',
    ],
    accountCode: '3200',
    accountName: 'Wareneingang (Fahrzeugankauf)',
    defaultVatPercent: 0,
  },
  // 3300 – Wareneingang 7% Vorsteuer (reduced-rate goods: food, books, …)
  {
    keywords: [
      'lebensmittel', 'buch', 'bücher', 'nahrung', 'supermarkt',
      'rewe', 'edeka', 'aldi', 'lidl', 'netto', 'penny', 'norma',
      'groceries', 'food', 'books', 'zeitungen',
    ],
    accountCode: '3300',
    accountName: 'Wareneingang 7 % Vorsteuer',
    defaultVatPercent: 7,
  },
  // 3400 – Wareneingang 19% Vorsteuer (standard-rate goods)
  {
    keywords: [
      'waren', 'rohstoffe', 'handelsware', 'lieferung', 'grosshandel',
      'material', 'baumarkt', 'hornbach', 'obi', 'bauhaus',
      'merchandise', 'goods', 'wholesale', 'supplies',
    ],
    accountCode: '3400',
    accountName: 'Wareneingang 19 % Vorsteuer',
    defaultVatPercent: 19,
  },

  // ─────────────────────────────────────────────────
  //  4100-4130 – Personalkosten (Payroll)
  // ─────────────────────────────────────────────────

  // 4100 – Löhne und Gehälter
  {
    keywords: ['lohn', 'löhne', 'gehalt', 'gehälter', 'salary', 'wages', 'payroll', 'lohnabrechnung', 'gehaltsabrechnung'],
    accountCode: '4100',
    accountName: 'Löhne und Gehälter',
    defaultVatPercent: 0,
  },
  // 4120 – Gehälter
  {
    keywords: ['angestelltengehalt', 'festgehalt', 'monatsgehalt', 'employee salary'],
    accountCode: '4120',
    accountName: 'Gehälter',
    defaultVatPercent: 0,
  },
  // 4130 – Gesetzliche Sozialaufwendungen
  {
    keywords: [
      'sozialversicherung', 'sozialaufwand', 'sozialabgaben',
      'arbeitgeberanteil', 'krankenkasse', 'rentenversicherung',
      'arbeitslosenversicherung', 'pflegeversicherung',
      'social security', 'employer contribution',
    ],
    accountCode: '4130',
    accountName: 'Gesetzliche Sozialaufwendungen',
    defaultVatPercent: 0,
  },

  // ─────────────────────────────────────────────────
  //  4200-4260 – Raumkosten / Energie (Premises)
  // ─────────────────────────────────────────────────

  // 4200 – Raumkosten (general premises costs)
  {
    keywords: ['raumkosten', 'raummiete', 'facility', 'premises', 'gebäudekosten'],
    accountCode: '4200',
    accountName: 'Raumkosten / Gas / Strom / Wasser',
    defaultVatPercent: 19,
  },
  // 4210 – Miete (unbewegliche Wirtschaftsgüter)
  {
    keywords: [
      'miete', 'büromiete', 'nebenkosten', 'kaltmiete', 'warmmiete',
      'pacht', 'rent', 'office rent', 'lease',
    ],
    accountCode: '4210',
    accountName: 'Miete (unbewegliche Wirtschaftsgüter)',
    defaultVatPercent: 19,
  },
  // 4240 – Gas, Strom, Wasser
  {
    keywords: [
      'strom', 'gas', 'wasser', 'heizung', 'stadtwerke',
      'electricity', 'energy', 'heating', 'utilities', 'eon', 'e.on',
      'vattenfall', 'enbw', 'mainova', 'rabot', 'rabot energy', 'lichtblick', 'rheinenergie',
      'water', 'sewerage', 'abwasser', 'dewa', 'sewa', 'addc', 'fewa', 'etihad water',
      'electricity & water', 'water consumption', 'energiekosten',
    ],
    accountCode: '4240',
    accountName: 'Gas, Strom, Wasser',
    defaultVatPercent: 19,
  },
  // 4260 – Instandhaltung betrieblicher Räume
  {
    keywords: [
      'instandhaltung räume', 'gebäudereinigung', 'renovierung',
      'reparatur büro', 'wartung räume', 'reinigung', 'cleaning',
      'facility maintenance', 'maintenance premises',
    ],
    accountCode: '4260',
    accountName: 'Instandhaltung betrieblicher Räume',
    defaultVatPercent: 19,
  },

  // ─────────────────────────────────────────────────
  //  4360 – Versicherungen (Insurance)
  // ─────────────────────────────────────────────────
  {
    keywords: [
      'versicherung', 'haftpflicht', 'berufshaftpflicht',
      'betriebshaftpflicht', 'sachversicherung', 'inhaltsversicherung',
      'insurance', 'liability', 'allianz', 'axa', 'hdi',
    ],
    accountCode: '4360',
    accountName: 'Versicherungen',
    defaultVatPercent: 0,
  },

  // ─────────────────────────────────────────────────
  //  4500-4530 – Kfz-Kosten (Vehicle costs)
  // ─────────────────────────────────────────────────

  // 4500 – Kfz-Steuer
  {
    keywords: ['kfz-steuer', 'kfzsteuer', 'kraftfahrzeugsteuer', 'vehicle tax', 'car tax'],
    accountCode: '4500',
    accountName: 'Kfz-Steuer',
    defaultVatPercent: 0,
  },
  // 4510 – Kfz-Versicherungen
  {
    keywords: ['kfz-versicherung', 'kfzversicherung', 'autoversicherung', 'kaskoversicherung', 'car insurance', 'vehicle insurance'],
    accountCode: '4510',
    accountName: 'Kfz-Versicherungen',
    defaultVatPercent: 0,
  },
  // 4530 – Laufende Kfz-Betriebskosten (Tanken, Waschen)
  {
    keywords: [
      'aral', 'shell', 'totalenergies', 'total tankstelle', 'esso', 'jet', 'benzin', 'diesel',
      'tankstelle', 'kraftstoff', 'kfz', 'tanken', 'fuel',
      'gasoline', 'petrol', 'autowäsche', 'car wash', 'waschstraße', 'waschanlage',
    ],
    accountCode: '4530',
    accountName: 'Laufende Kfz-Betriebskosten',
    defaultVatPercent: 19,
  },
  // 4540 – Kfz-Reparaturen, TÜV & Ersatzteile (macOIL, Mr. Wash Ölwechsel, Auto-Teile)
  {
    keywords: [
      'macoil', 'mac oil', 'mr. wash', 'mr wash', 'ölwechsel', 'olwechsel', 'oil change',
      'auto-teile', 'auto-teile-de', 'autoteile', 'kfz-teile', 'ersatzteile', 'kfz reparatur',
      'kfz-reparatur', 'tüv', 'tuev', 'dekra', 'werkstatt', 'reifen', 'reparatur',
      'inspektion', 'bremsen', 'reifendienst', 'kfz-werkstatt',
    ],
    accountCode: '4540',
    accountName: 'Kfz-Reparaturen und TÜV',
    defaultVatPercent: 19,
  },

  // ─────────────────────────────────────────────────
  //  4600 – Werbekosten (Advertising)
  // ─────────────────────────────────────────────────
  {
    keywords: [
      'werbung', 'marketing', 'google ads', 'facebook ads', 'meta ads',
      'instagram ads', 'linkedin ads', 'flyer', 'anzeige', 'pr',
      'sponsoring', 'messe', 'trade fair', 'advertising', 'promotion',
      'plakat', 'banner', 'seo', 'sem',
    ],
    accountCode: '4600',
    accountName: 'Werbekosten',
    defaultVatPercent: 19,
  },

  // ─────────────────────────────────────────────────
  //  4650-4654 – Bewirtungskosten (Entertainment)
  // ─────────────────────────────────────────────────

  // 4650 – Bewirtungsaufwendungen (70% abzugsfähig)
  {
    keywords: [
      'restaurant', 'bewirtung', 'gaststätte', 'essen', 'lunch',
      'dinner', 'cafe', 'café', 'bistro', 'catering', 'speisen',
      'dining', 'meal', 'hospitality',
    ],
    accountCode: '4650',
    accountName: 'Bewirtungsaufwendungen (70 % abzugsfähig)',
    defaultVatPercent: 19,
  },
  // 4654 – Nicht abzugsfähige Bewirtungskosten (30%)
  {
    keywords: ['nicht abzugsfähig bewirtung', 'bewirtung 30', 'non-deductible entertainment'],
    accountCode: '4654',
    accountName: 'Nicht abzugsfähige Bewirtungskosten (30 %)',
    defaultVatPercent: 19,
  },

  // ─────────────────────────────────────────────────
  //  4670 – Reisekosten (Travel expenses)
  // ─────────────────────────────────────────────────
  {
    keywords: [
      'bahn', 'deutsche bahn', 'db ticket', 'lufthansa', 'flug',
      'hotel', 'uber', 'taxi', 'parken', 'ticket', 'reise',
      'reisekosten', 'zugticket', 'boarding', 'airbnb', 'booking.com',
      'mietwagen', 'rental car', 'travel', 'flight', 'train',
      'accommodation', 'übernachtung', 'verpflegung',
    ],
    accountCode: '4670',
    accountName: 'Reisekosten Arbeitnehmer',
    defaultVatPercent: 19,
  },

  // ─────────────────────────────────────────────────
  //  4780 – Fremdleistungen (Outsourced services)
  // ─────────────────────────────────────────────────
  {
    keywords: [
      'fremdleistung', 'subunternehmer', 'freelancer', 'agentur',
      'dienstleister', 'outsourcing', 'contractor', 'subcontractor',
      'agency', 'external service', 'fremdarbeit',
    ],
    accountCode: '4780',
    accountName: 'Fremdleistungen',
    defaultVatPercent: 19,
  },

  // ─────────────────────────────────────────────────
  //  4806 – Reparaturen und Instandhaltung
  // ─────────────────────────────────────────────────
  {
    keywords: [
      'reparatur', 'instandhaltung', 'wartung', 'repair',
      'maintenance', 'service vertrag', 'techniker', 'ersatzteil',
      'spare part',
    ],
    accountCode: '4806',
    accountName: 'Reparaturen und Instandhaltung',
    defaultVatPercent: 19,
  },

  // ─────────────────────────────────────────────────
  //  4900-4969 – Sonstige betriebl. Aufwendungen
  // ─────────────────────────────────────────────────

  // 4900 – Sonstige betriebliche Aufwendungen (catch-all)
  {
    keywords: [
      'sonstige aufwendungen', 'sonstige kosten', 'sonstig',
      'miscellaneous', 'other expenses', 'diverse kosten',
    ],
    accountCode: '4900',
    accountName: 'Sonstige betriebliche Aufwendungen',
    defaultVatPercent: 19,
  },
  // 4910 – Porto
  {
    keywords: [
      'porto', 'briefmarke', 'paket', 'dhl', 'dpd', 'ups', 'fedex',
      'hermes', 'gls', 'post', 'deutsche post', 'versand',
      'postage', 'shipping', 'courier', 'parcel',
    ],
    accountCode: '4910',
    accountName: 'Porto',
    defaultVatPercent: 19,
  },
  // 4920 – Telefon / Internet
  {
    keywords: [
      'telekom', 'vodafone', 'o2', 'telefon', 'internet', 'mobilfunk',
      'sipgate', 'cloud', 'aws', 'google cloud', 'azure', 'hosting',
      'domain', 'dsl', 'glasfaser', 'breitband', 'broadband',
      'telecom', 'phone', 'mobile', '1&1', '1 +1', '1+1', 'freenet', 'ionos',
      'etisalat', 'du', 'e&', 'mobile bill', 'mobile services', 'telefonica', 'congstar',
    ],
    accountCode: '4920',
    accountName: 'Telefon und Internetkosten',
    defaultVatPercent: 19,
  },
  // 4970 – Nebenkosten des Geldverkehrs
  {
    keywords: [
      'bankgebühr', 'bankgebuhr', 'bankgebühren', 'kontoführung', 'abrechnung kontoführung',
      'nebenkosten des geldverkehrs', 'überweisungsgebühr', 'kartenlesegerät gebühr', 'agenda',
      'securego entgelt', 'securego gebühr', 'securego-gebühr', 'securego 0,80', 'securego 0.80',
      'entg:', 'entg', 'entgelt echtzeit', 'echtzeit-überweisung', 'echtzeitüberweisung',
      'entgelt fuer echtzeit', 'entgelt für echtzeit',
    ],
    accountCode: '4970',
    accountName: 'Nebenkosten des Geldverkehrs',
    defaultVatPercent: 0,
  },
  // 4980 – Sonstiger Betriebsbedarf
  {
    keywords: [
      'betriebsbedarf', 'woolworth', 'copytex', 'müller', 'goldberg',
      'dm-drogerie', 'rossmann', 'action', 'tedi', 'kleinmaterial',
    ],
    accountCode: '4980',
    accountName: 'Sonstiger Betriebsbedarf',
    defaultVatPercent: 19,
  },
  // 4570 – Mietleasing Kfz
  {
    keywords: [
      'mercedes-bank', 'mercedes bank', 'bmw bank', 'audi leasing', 'kfz leasing', 'fahrzeugleasing', 'mietleasing kfz',
    ],
    accountCode: '4570',
    accountName: 'Mietleasing Kfz',
    defaultVatPercent: 19,
  },
  // 1360 – Geldtransit
  {
    keywords: [
      'girocard', 'bscard', 'händlerg.', 'kartenabrechnung', 'geldtransit',
      'bar-auszahlung',
    ],
    accountCode: '1360',
    accountName: 'Geldtransit',
    defaultVatPercent: 0,
  },
  // 1361 – Geldtransit Kartenabrechnung
  {
    keywords: [
      'payone', 'sumup', 'zettle', 'stripe', 'square',
    ],
    accountCode: '1361',
    accountName: 'Geldtransit Kartenabrechnung',
    defaultVatPercent: 0,
  },
  // 1742 – Verbindlichkeiten soziale Sicherheit
  {
    keywords: [
      'aok', 'barmer', 'dak', 'knappschaft', 'ikk', 'techniker krankenkasse', 'beitragsnachweis',
    ],
    accountCode: '1742',
    accountName: 'Verbindlichkeiten soziale Sicherheit',
    defaultVatPercent: 0,
  },
  // 1850 – Außergewöhnliche Belastungen (Apotheke)
  {
    keywords: [
      'apotheke', 'pharmacy', 'medikamente',
    ],
    accountCode: '1850',
    accountName: 'Außergewöhnliche Belastungen',
    defaultVatPercent: 0,
  },
  // 4320 – Gewerbesteuer
  {
    keywords: [
      'gewerbesteuer',
    ],
    accountCode: '4320',
    accountName: 'Gewerbesteuer',
    defaultVatPercent: 0,
  },
  // 2375 – Grundsteuer
  {
    keywords: [
      'grundsteuer', 'grundsteu',
    ],
    accountCode: '2375',
    accountName: 'Grundsteuer',
    defaultVatPercent: 0,
  },
  // 4930 – Bürobedarf
  {
    keywords: [
      'büro', 'office', 'papier', 'drucker', 'toner', 'schreibwaren',
      'staples', 'viking', 'büromaterial', 'hefter', 'ordner',
      'kopierpapier', 'office supplies', 'stationery', 'druckerpatrone',
    ],
    accountCode: '4930',
    accountName: 'Bürobedarf',
    defaultVatPercent: 19,
  },
  // 4940 – Zeitschriften, Bücher, Fachliteratur
  {
    keywords: [
      'zeitschrift', 'fachbuch', 'fachliteratur', 'abonnement',
      'abo', 'magazine', 'journal', 'fachzeitschrift', 'publication',
      'subscription journal', 'fachmagazin',
    ],
    accountCode: '4940',
    accountName: 'Zeitschriften / Bücher / Fachliteratur',
    defaultVatPercent: 7,
  },
  // 4945 – Fortbildungskosten
  {
    keywords: [
      'fortbildung', 'weiterbildung', 'seminar', 'kurs', 'schulung',
      'training', 'workshop', 'zertifikat', 'udemy', 'coursera',
      'conference', 'konferenz', 'education', 'learning',
    ],
    accountCode: '4945',
    accountName: 'Fortbildungskosten',
    defaultVatPercent: 19,
  },
  // 4950 – Rechts- und Beratungskosten
  {
    keywords: [
      'rechtsanwalt', 'notar', 'steuerberater', 'beratung',
      'consulting', 'gutachten', 'anwalt', 'kanzlei', 'lawyer',
      'attorney', 'legal', 'notary', 'counsel', 'advisory',
      'wirtschaftsprüfer', 'audit', 'creditreform',
    ],
    accountCode: '4950',
    accountName: 'Rechts- und Beratungskosten',
    defaultVatPercent: 19,
  },
  // 4955 – Buchführungskosten
  {
    keywords: [
      'buchführung', 'buchhaltung', 'datev', 'lexoffice', 'sevdesk',
      'bookkeeping', 'accounting', 'jahresabschluss', 'bilanz',
      'accounting service', 'lohnbüro', 'fintax', 'fintax consulting', 'ekk edelmann', 'edelmann kügler',
    ],
    accountCode: '4955',
    accountName: 'Buchführungskosten',
    defaultVatPercent: 19,
  },
  // 4964 – Aufwendungen IT / Software
  {
    keywords: [
      'software', 'adobe', 'microsoft', 'slack', 'zoom', 'github',
      'saas', 'lizenz', 'subscription', 'it-kosten', 'license',
      'jetbrains', 'atlassian', 'jira', 'confluence', 'notion',
      'dropbox', 'google workspace', 'microsoft 365', 'antivirus',
      'it service', 'hardware', 'computer', 'laptop', 'monitor',
    ],
    accountCode: '4964',
    accountName: 'Aufwendungen für IT / Softwarelizenzen',
    defaultVatPercent: 19,
  },
  // 4969 – Sonstige Abgaben
  {
    keywords: [
      'abgabe', 'gebühr', 'beitrag', 'mitgliedsbeitrag', 'ihk',
      'handwerkskammer', 'kammerbeitrag', 'fee', 'levy', 'dues',
      'contribution', 'membership',
    ],
    accountCode: '4969',
    accountName: 'Sonstige Abgaben',
    defaultVatPercent: 0,
  },

  // ─────────────────────────────────────────────────
  //  8xxx – Erlöse (Revenue accounts)
  // ─────────────────────────────────────────────────

  // 8120 – Steuerfreie Erlöse
  {
    keywords: [
      'steuerfreie erlöse', 'steuerfreier umsatz', 'tax-free revenue',
      'export', 'ausfuhr', 'innergemeinschaftlich', 'reverse charge',
      'drittland', 'exempt revenue',
    ],
    accountCode: '8120',
    accountName: 'Steuerfreie Erlöse',
    defaultVatPercent: 0,
  },
  // 8300 – Erlöse 7% USt
  {
    keywords: [
      'erlöse 7', 'umsatz 7', 'revenue 7', 'einnahmen 7',
      'verkauf lebensmittel', 'verkauf bücher',
    ],
    accountCode: '8300',
    accountName: 'Erlöse 7 % USt',
    defaultVatPercent: 7,
  },
  // 8400 – Erlöse 19% USt
  {
    keywords: [
      'erlöse 19', 'umsatz 19', 'revenue', 'einnahmen', 'honorar',
      'umsatzerlöse', 'verkaufserlöse', 'sales revenue', 'invoice out',
    ],
    accountCode: '8400',
    accountName: 'Erlöse 19 % USt',
    defaultVatPercent: 19,
  },
];

// ─────────────────────────────────────────────────
//  Document type literals used by helper functions
// ─────────────────────────────────────────────────
export type DocumentType =
  | 'PURCHASE_INVOICE'
  | 'RECEIPT'
  | 'SALES_INVOICE'
  | 'BANK_STATEMENT';

// ─────────────────────────────────────────────────
//  Mapper object (public API)
// ─────────────────────────────────────────────────
export const skr03Mapper = {
  /**
   * Suggest the best-matching SKR03 account for a given supplier /
   * description / VAT-rate combination.  Falls back to 4900 (Sonstige
   * betriebliche Aufwendungen) when no keyword matches.
   */
  suggestAccount(
    supplierName: string,
    description = '',
    vatPercent = 19,
  ): { code: string; name: string } {
    // 0. Check Learned Vendor Memory Table first (0 seconds, 100% verified previous knowledge)
    const learned = supplierMemoryService.lookupSupplier(supplierName);
    if (learned && learned.skr03Account) {
      return {
        code: learned.skr03Account,
        name: learned.skr03AccountName || 'Gelerntes Sachkonto',
      };
    }

    const combined = `${supplierName} ${description}`.toLowerCase();

    // Short keywords (e.g. "obi", "pr", "o2", "du", "gas") must match as whole words, otherwise
    // "Mobile" would hit "obi" (Baumarkt) or "price" would hit "pr" (Werbung).
    // Longer keywords may match inside German compound words (e.g. "Stromrechnung" -> "strom").
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keywordMatches = (kw: string): boolean => {
      if (kw.length >= 5) return combined.includes(kw);
      return new RegExp(`(^|[^a-z0-9äöüß])${escapeRe(kw)}($|[^a-z0-9äöüß])`, 'i').test(combined);
    };

    // Pick the most specific rule: supplier-name hits weigh more than description hits,
    // longer keywords weigh more than short ones.
    const supplierLower = (supplierName || '').toLowerCase();
    let best: { code: string; name: string; score: number } | null = null;
    for (const rule of SKR03_RULES) {
      // Never suggest monetary balance-sheet accounts (1000, 1200, 1400, 1600) as the Gegenkonto for an invoice/receipt
      if (['1000', '1200', '1400', '1600'].includes(rule.accountCode)) {
        continue;
      }
      let score = 0;
      for (const kw of rule.keywords) {
        if (!keywordMatches(kw)) continue;
        const inSupplier =
          kw.length >= 5
            ? supplierLower.includes(kw)
            : new RegExp(`(^|[^a-z0-9äöüß])${escapeRe(kw)}($|[^a-z0-9äöüß])`, 'i').test(supplierLower);
        score += kw.length + (inSupplier ? 20 : 0);
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { code: rule.accountCode, name: rule.accountName, score };
      }
    }
    if (best) {
      return { code: best.code, name: best.name };
    }

    // Fallback based on VAT rate
    if (vatPercent === 7) {
      return { code: '3300', name: 'Wareneingang 7 % Vorsteuer' };
    }
    if (vatPercent === 0) {
      return { code: '4900', name: 'Sonstige betriebliche Aufwendungen' };
    }

    return { code: '4900', name: 'Sonstige betriebliche Aufwendungen' };
  },

  /**
   * Return the monetary counter-account (Gegenkonto) depending on document
   * type and payment method.
   *
   *   PURCHASE_INVOICE → 1600 (Verbindlichkeiten) or 1000 (Kasse) if cash
   *   RECEIPT           → 1000 (Kasse)
   *   SALES_INVOICE     → 1400 (Forderungen)
   *   BANK_STATEMENT    → 1200 (Bank)
   */
  getGegenkontoForType(
    documentType: DocumentType,
    isCash = false,
  ): { code: string; name: string } {
    switch (documentType) {
      case 'PURCHASE_INVOICE':
        return isCash
          ? { code: '1000', name: 'Kasse' }
          : { code: '1600', name: 'Verbindlichkeiten aus Lieferungen und Leistungen' };
      case 'RECEIPT':
        return { code: '1000', name: 'Kasse' };
      case 'SALES_INVOICE':
        return { code: '1400', name: 'Forderungen aus Lieferungen und Leistungen' };
      case 'BANK_STATEMENT':
        return { code: '1200', name: 'Bank' };
      default:
        return { code: '1600', name: 'Verbindlichkeiten aus Lieferungen und Leistungen' };
    }
  },

  /**
   * Return the DATEV BU-Schlüssel (tax code) for a given VAT rate.
   *
   *   19 % → "9"  (Vorsteuer 19 %)
   *    7 % → "8"  (Vorsteuer  7 %)
   *    0 % → ""   (no tax)
   */
  getBuSchluessel(vatRate: number): string {
    if (vatRate === 19) return '9';
    if (vatRate === 7) return '8';
    return '';
  },

  /**
   * Return "S" (Soll / Debit) or "H" (Haben / Credit) depending on the
   * document type.
   *
   *   PURCHASE_INVOICE | RECEIPT  → "S" (expense is debited)
   *   SALES_INVOICE              → "H" (revenue is credited)
   *   BANK_STATEMENT             → "S" (default debit)
   */
  getSollHaben(documentType: DocumentType): 'S' | 'H' {
    switch (documentType) {
      case 'PURCHASE_INVOICE':
      case 'RECEIPT':
        return 'S';
      case 'SALES_INVOICE':
        return 'H';
      case 'BANK_STATEMENT':
      default:
        return 'S';
    }
  },
};
