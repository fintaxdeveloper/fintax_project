import fs from 'fs';
import path from 'path';
import os from 'os';

export const FOLDER_SHARED_WITH_ME = 'Shared with me';
export const FOLDER_INBOX = '_INBOX';
export const FOLDER_TEMPLATE = '00_Template Folder Structure - Muster Ordnerstruktur';
export const FOLDER_TRAINING = '00_Training Center';
export const FOLDER_CLIENTS = '01_Clients';

export const CLIENT_FOLDER_CORRESPONDENCE = '00_Correspondence - Schriftverkehr';
export const CLIENT_FOLDER_FIBU = '01_Financial Accounting – FiBu';
export const CLIENT_FOLDER_PAYROLL = '02_Payrol - Lohn';
export const MONTH_FOLDER_CSV = '00_CSV';

/**
 * Service to automatically synchronize uploaded documents and converted SKR03 CSV/Excel exports
 * directly to Google Drive for Desktop following the exact _INBOX hierarchy:
 * - "Shared with me -> _INBOX -> 01_Clients -> <Client Name>"
 *   - "00_Correspondence - Schriftverkehr"
 *   - "01_Financial Accounting – FiBu -> <Year> -> <MM> -> [PDFs + 00_CSV/]"
 *   - "02_Payrol - Lohn"
 */
export class GoogleDriveService {
  private driveBasePath: string | null = null;
  private fintaxFolderPath: string | null = null;
  private fintaxAppFolderPath: string | null = null;
  private inboxClientsPaths: string[] = [];
  private dataFolderPath: string | null = null;

  constructor() {
    this.detectGoogleDrivePaths();
  }

  /**
   * Auto-detect Google Drive local root path & initialize "Shared with me / _INBOX / 01_Clients"
   */
  public detectGoogleDrivePaths(): {
    basePath: string | null;
    fintaxAppPath: string | null;
    fintaxPath: string | null;
    dataPath: string | null;
  } {
    const homeDir = os.homedir();
    const candidateBases = [
      process.env.GOOGLE_DRIVE_PATH,
      'G:\\My Drive',
      path.join(homeDir, 'My Drive'),
      path.join(homeDir, 'Google Drive', 'My Drive'),
      path.join(homeDir, 'Google Drive'),
    ].filter(Boolean) as string[];

    const activeBases: string[] = [];
    for (const base of candidateBases) {
      try {
        if (fs.existsSync(base)) {
          activeBases.push(base);
          if (!this.driveBasePath) {
            this.driveBasePath = base;
          }
        }
      } catch {
        // ignore access errors on drives
      }
    }

    const clientRootsSet = new Set<string>();

    // Scan G:\.shortcut-targets-by-id for shared _INBOX or 01_Clients folders
    const shortcutTargetsDirs = ['G:\\.shortcut-targets-by-id', path.join(homeDir, 'My Drive', '.shortcut-targets-by-id')];
    for (const stDir of shortcutTargetsDirs) {
      try {
        if (fs.existsSync(stDir)) {
          const targetIds = fs.readdirSync(stDir);
          for (const tid of targetIds) {
            const tidPath = path.join(stDir, tid);
            const inboxCandidate = path.join(tidPath, FOLDER_INBOX);
            const directClientsCandidate = path.join(tidPath, FOLDER_CLIENTS);
            if (fs.existsSync(inboxCandidate)) {
              this.ensureInboxStructure(inboxCandidate);
              clientRootsSet.add(path.join(inboxCandidate, FOLDER_CLIENTS));
            } else if (fs.existsSync(directClientsCandidate)) {
              clientRootsSet.add(directClientsCandidate);
            }
          }
        }
      } catch {
        // ignore permission errors on virtual drive dirs
      }
    }

    for (const base of activeBases) {
      const inboxRoots = [
        path.join(base, FOLDER_SHARED_WITH_ME, FOLDER_INBOX),
        path.join(base, FOLDER_INBOX),
        ...(fs.existsSync(path.join(base, '_INBOX (1)')) ? [path.join(base, '_INBOX (1)')] : []),
      ];

      for (const inboxRoot of inboxRoots) {
        try {
          this.ensureInboxStructure(inboxRoot);
          clientRootsSet.add(path.join(inboxRoot, FOLDER_CLIENTS));
        } catch {
          // ignore read-only virtual roots (like G:\ root)
        }
      }
    }

    this.inboxClientsPaths = Array.from(clientRootsSet);

    if (this.driveBasePath && this.inboxClientsPaths.length > 0) {
      // Primary client root: Shared with me / _INBOX / 01_Clients
      this.fintaxAppFolderPath = this.inboxClientsPaths[0];

      // Legacy fintax & data folders
      if (this.driveBasePath.toLowerCase().endsWith('fintax')) {
        this.fintaxFolderPath = this.driveBasePath;
        this.dataFolderPath = path.join(path.dirname(this.driveBasePath), 'data');
      } else {
        this.fintaxFolderPath = path.join(this.driveBasePath, 'fintax');
        this.dataFolderPath = path.join(this.driveBasePath, 'data');
      }

      this.ensureDir(this.fintaxFolderPath);
      this.ensureDir(path.join(this.fintaxFolderPath, 'CSVs'));
      this.ensureDir(path.join(this.fintaxFolderPath, 'Documents'));
      this.ensureDir(this.dataFolderPath);

      console.log(`[Google Drive] Connected to Google Drive Base: ${this.driveBasePath}`);
      console.log(`[Google Drive] Client Root (Shared with me > _INBOX > 01_Clients): ${this.fintaxAppFolderPath}`);
    } else {
      console.warn('[Google Drive] Google Drive folder not detected automatically.');
    }

    return {
      basePath: this.driveBasePath,
      fintaxAppPath: this.fintaxAppFolderPath,
      fintaxPath: this.fintaxFolderPath,
      dataPath: this.dataFolderPath,
    };
  }

  /**
   * Initializes the _INBOX top-level folders:
   * - 00_Template Folder Structure - Muster Ordnerstruktur
   * - 00_Training Center
   * - 01_Clients
   */
  public ensureInboxStructure(inboxRoot: string): void {
    this.ensureDir(inboxRoot);

    const templateDir = path.join(inboxRoot, FOLDER_TEMPLATE);
    this.ensureDir(templateDir);
    this.ensureDir(path.join(templateDir, CLIENT_FOLDER_CORRESPONDENCE));
    this.ensureDir(path.join(templateDir, CLIENT_FOLDER_FIBU));
    this.ensureDir(path.join(templateDir, CLIENT_FOLDER_PAYROLL));

    const trainingDir = path.join(inboxRoot, FOLDER_TRAINING);
    this.ensureDir(trainingDir);

    const clientsDir = path.join(inboxRoot, FOLDER_CLIENTS);
    this.ensureDir(clientsDir);
  }

  public isConnected(): boolean {
    return !!(this.fintaxAppFolderPath && fs.existsSync(this.fintaxAppFolderPath));
  }

  public getStatus() {
    return {
      connected: this.isConnected(),
      basePath: this.driveBasePath,
      fintaxAppFolder: this.fintaxAppFolderPath,
      inboxClientsPaths: this.inboxClientsPaths,
      fintaxFolder: this.fintaxFolderPath,
      dataFolder: this.dataFolderPath,
    };
  }

  /**
   * Cleans invalid filesystem characters from client folder name
   */
  public sanitizeClientFolderName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Formats client folder name with optional client number prefix (e.g. "704_QA24 GbmH")
   */
  public formatClientNameWithNumber(name: string, clientNumber?: string | null): string {
    const cleanName = this.sanitizeClientFolderName(name) || 'Unbekannter_Mandant';
    const cleanNum = clientNumber ? String(clientNumber).trim() : '';
    if (cleanNum && !cleanName.startsWith(`${cleanNum}_`)) {
      return `${cleanNum}_${cleanName}`;
    }
    return cleanName;
  }

  /**
   * Returns path to "Shared with me / _INBOX / 01_Clients" folder in Google Drive
   */
  public getFintaxAppFolderPath(): string | null {
    if (this.fintaxAppFolderPath && fs.existsSync(this.fintaxAppFolderPath)) {
      return this.fintaxAppFolderPath;
    }
    this.detectGoogleDrivePaths();
    return this.fintaxAppFolderPath;
  }

  public getAllClientsRoots(): string[] {
    const hasGDrive = this.inboxClientsPaths.some((p) => p.toUpperCase().startsWith('G:'));
    if (this.inboxClientsPaths.length === 0 || (!hasGDrive && fs.existsSync('G:\\'))) {
      this.detectGoogleDrivePaths();
    }
    return this.inboxClientsPaths;
  }

  /**
   * Creates the client folder inside Shared with me > _INBOX > 01_Clients > <Client Name>:
   * 1. 00_Correspondence - Schriftverkehr
   * 2. 01_Financial Accounting – FiBu (with current year folder, e.g. 2026)
   * 3. 02_Payrol - Lohn
   */
  public createClientFolderTree(
    clientName: string,
    year = new Date().getFullYear(),
    clientNumber?: string | null
  ): { clientDir: string; folders: string[]; yearDir: string } | null {
    const roots = this.getAllClientsRoots();
    if (roots.length === 0) {
      console.warn('[Google Drive] Cannot create client folder: Google Drive root not found.');
      return null;
    }

    const safeClientName = this.formatClientNameWithNumber(clientName, clientNumber);
    const subfolders = [
      CLIENT_FOLDER_CORRESPONDENCE,
      CLIENT_FOLDER_FIBU,
      CLIENT_FOLDER_PAYROLL,
    ];

    const correspondenceSubs = ['FinTax', 'Company Formation', 'Tax Office'];
    const payrollSubs = [
      'Payroll Statements + Deregistrations + Registrations',
      'Employment Agency',
      "Employers' Liability Insurance Association",
      'Health Insurance',
      'Social Welfare Fund (SOKA)',
    ];

    let primaryClientDir = '';
    let primaryYearDir = '';

    for (const root of roots) {
      const clientDir = path.join(root, safeClientName);
      this.ensureDir(clientDir);

      for (const sub of subfolders) {
        this.ensureDir(path.join(clientDir, sub));
      }

      for (const sub of correspondenceSubs) {
        this.ensureDir(path.join(clientDir, CLIENT_FOLDER_CORRESPONDENCE, sub));
      }

      for (const sub of payrollSubs) {
        this.ensureDir(path.join(clientDir, CLIENT_FOLDER_PAYROLL, sub));
      }

      const yearDir = path.join(clientDir, CLIENT_FOLDER_FIBU, String(year));
      this.ensureDir(yearDir);

      if (!primaryClientDir) {
        primaryClientDir = clientDir;
        primaryYearDir = yearDir;
      }
    }

    console.log(
      `[Google Drive] Created client hierarchy in Shared with me > _INBOX > 01_Clients > "${safeClientName}":`,
      `${CLIENT_FOLDER_CORRESPONDENCE}, ${CLIENT_FOLDER_FIBU} (${year}), ${CLIENT_FOLDER_PAYROLL}`
    );

    return {
      clientDir: primaryClientDir,
      folders: subfolders,
      yearDir: primaryYearDir,
    };
  }

  /**
   * Syncs the complete folder structure for all existing clients in 01_Clients
   */
  public syncAllClientsInFintaxApp(year = new Date().getFullYear()): string[] {
    const root = this.getFintaxAppFolderPath();
    if (!root || !fs.existsSync(root)) return [];

    const updatedClients: string[] = [];
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        this.createClientFolderTree(entry.name, year);
        updatedClients.push(entry.name);
      }
    }
    return updatedClients;
  }

  /**
   * When user clicks/taps on Financial Accounting: ensures current year folder exists
   */
  public ensureFinancialAccountingYear(
    clientName: string,
    year = new Date().getFullYear()
  ): string | null {
    const roots = this.getAllClientsRoots();
    if (roots.length === 0) return null;

    const safeClientName = this.sanitizeClientFolderName(clientName) || 'Unbekannter_Mandant';
    let primaryYearDir: string | null = null;

    for (const root of roots) {
      const financialDir = path.join(root, safeClientName, CLIENT_FOLDER_FIBU);
      this.ensureDir(financialDir);

      const yearDir = path.join(financialDir, String(year));
      this.ensureDir(yearDir);
      if (!primaryYearDir) primaryYearDir = yearDir;
    }

    console.log(`[Google Drive] Ensured year folder "${year}" in ${CLIENT_FOLDER_FIBU} for "${safeClientName}".`);
    return primaryYearDir;
  }

  /**
   * Automatically save converted Agenda/DATEV EXTF CSV to Google Drive
   */
  public syncCsv(csvContent: string, fileName: string, clientName?: string, year = new Date().getFullYear(), monthNum?: number): string[] {
    const savedPaths: string[] = [];
    if (!this.isConnected()) {
      this.detectGoogleDrivePaths();
    }

    try {
      const mFolder = String(monthNum || new Date().getMonth() + 1).padStart(2, '0');

      // 1. If client name is provided, save into 01_Clients/<Client Name>/01_Financial Accounting – FiBu/<year>/<MM>/00_CSV/
      if (clientName) {
        const safeName = this.sanitizeClientFolderName(clientName);
        for (const root of this.getAllClientsRoots()) {
          const csvDir = path.join(root, safeName, CLIENT_FOLDER_FIBU, String(year), mFolder, MONTH_FOLDER_CSV);
          this.ensureDir(csvDir);
          const targetPath = path.join(csvDir, fileName);
          fs.writeFileSync(targetPath, csvContent, 'utf-8');
          savedPaths.push(targetPath);
        }
      }

      // 2. Save in fintax/CSVs/
      if (this.fintaxFolderPath) {
        const csvSubDir = path.join(this.fintaxFolderPath, 'CSVs');
        this.ensureDir(csvSubDir);
        const targetCsvPath = path.join(csvSubDir, fileName);
        fs.writeFileSync(targetCsvPath, csvContent, 'utf-8');
        savedPaths.push(targetCsvPath);

        const targetRootPath = path.join(this.fintaxFolderPath, fileName);
        fs.writeFileSync(targetRootPath, csvContent, 'utf-8');
        savedPaths.push(targetRootPath);
      }

      // 3. Also save in data/ folder if it exists
      if (this.dataFolderPath && fs.existsSync(this.dataFolderPath)) {
        const targetDataPath = path.join(this.dataFolderPath, fileName);
        fs.writeFileSync(targetDataPath, csvContent, 'utf-8');
        savedPaths.push(targetDataPath);
      }

      console.log(`[Google Drive] Successfully synced CSV "${fileName}" (${savedPaths.length} locations).`);
    } catch (err) {
      console.error('[Google Drive] Error writing CSV to Google Drive:', err);
    }

    return savedPaths;
  }

  /**
   * Parses an extracted invoice date (ISO, German, English) or filename hint into exact Year & 2-digit Month folder ("01" .. "12")
   */
  public resolveYearAndMonth(
    invoiceDate?: string,
    filename?: string,
    fallbackYear?: string | number,
    fallbackMonth?: string | number
  ): { year: string; monthNum: number; monthFolder: string } {
    const now = new Date();
    const todayIso = now.toISOString().split('T')[0];

    const monthNameLookup: Record<string, number> = {
      jan: 1, january: 1, januar: 1,
      feb: 2, february: 2, februar: 2,
      mar: 3, march: 3, märz: 3, maerz: 3, mrz: 3,
      apr: 4, april: 4,
      may: 5, mai: 5,
      jun: 6, june: 6, juni: 6,
      jul: 7, july: 7, juli: 7,
      aug: 8, august: 8,
      sep: 9, september: 9, sept: 9,
      oct: 10, october: 10, okt: 10, oktober_de: 10,
      nov: 11, november: 11,
      dec: 12, december: 12, dez: 12, dezember: 12,
    };

    let detectedYear: number | null = null;
    let detectedMonth: number | null = null;

    if (invoiceDate && invoiceDate.trim() !== '' && invoiceDate.trim() !== todayIso) {
      const s = invoiceDate.trim();

      // 1. ISO YYYY-MM-DD
      const iso = s.match(/\b(20\d{2})-(1[0-2]|0?[1-9])-(3[01]|[12]\d|0?[1-9])\b/);
      if (iso) {
        detectedYear = parseInt(iso[1], 10);
        detectedMonth = parseInt(iso[2], 10);
      }

      // 2. German DD.MM.YYYY or DD/MM/YYYY
      if (!detectedYear) {
        const de = s.match(/\b(3[01]|[12]\d|0?[1-9])[./-](1[0-2]|0?[1-9])[./-](20\d{2})\b/);
        if (de) {
          detectedMonth = parseInt(de[2], 10);
          detectedYear = parseInt(de[3], 10);
        }
      }

      // 3. English/German month names e.g. "05 Aug 2024", "Aug 05, 2024", "June 2026", "Juni 2026"
      if (!detectedYear || !detectedMonth) {
        const eng1 = s.match(/(\d{1,2})[\s.\-]+([a-zA-ZäöüÄÖÜ]{3,10})[\s,]+(20\d{2})/);
        if (eng1) {
          const mKey = eng1[2].toLowerCase();
          detectedMonth = monthNameLookup[mKey] || monthNameLookup[mKey.substring(0, 3)] || 1;
          detectedYear = parseInt(eng1[3], 10);
        } else {
          const eng2 = s.match(/([a-zA-ZäöüÄÖÜ]{3,10})[\s.\-]+(\d{1,2})?[\s,]*(20\d{2})?/);
          if (eng2) {
            const mKey = eng2[1].toLowerCase();
            const matchedM = monthNameLookup[mKey] || monthNameLookup[mKey.substring(0, 3)];
            if (matchedM) {
              detectedMonth = matchedM;
              detectedYear = eng2[3] ? parseInt(eng2[3], 10) : 2026;
            }
          }
        }
      }
    }

    // 4. Check filename for explicit YYYYMM prefix, MMYYYY prefix, MM_ prefix, or German/English month names
    if (filename) {
      const cleanFn = path.basename(filename).replace(/_\d{6}(\.[a-z0-9]+)$/i, '$1');
      // e.g. 202605_Kassenbericht.pdf
      const fnMatch = cleanFn.match(/^(20[12]\d)[_-]?(0[1-9]|1[0-2])[\s_-]/);
      // e.g. 042026_Bankbelege.pdf
      const fnMmYyyy = cleanFn.match(/^(0[1-9]|1[0-2])(20[12]\d)[\s_-]/);
      // e.g. 1200-Bank-04 Kontoauszug.pdf
      const fnBankMonth = cleanFn.match(/-(0[1-9]|1[0-2])[\s_-]/);

      if (fnMatch) {
        if (!detectedYear) detectedYear = parseInt(fnMatch[1], 10);
        if (!detectedMonth) detectedMonth = parseInt(fnMatch[2], 10);
        if (detectedYear === 2016) detectedYear = 2026;
      } else if (fnMmYyyy) {
        // Explicit 2-digit month prefix in filename (e.g. 052026_Bankbelege or 052026_Kassebelege)
        // Extract ONLY the month from scanner prefix; NEVER overwrite a valid document year with scanner year (e.g. 2026)!
        detectedMonth = parseInt(fnMmYyyy[1], 10);
        if (!detectedYear) {
          detectedYear = (fallbackYear && Number(fallbackYear) >= 2020) ? Number(fallbackYear) : parseInt(fnMmYyyy[2], 10);
        }
      } else if (fnBankMonth) {
        detectedMonth = parseInt(fnBankMonth[1], 10);
        if (!detectedYear) {
          detectedYear = (fallbackYear && Number(fallbackYear) >= 2020) ? Number(fallbackYear) : 2024;
        }
      } else if (!detectedYear || !detectedMonth) {
        const fnAny = cleanFn.match(/(20[12]\d)[_-]?(0[1-9]|1[0-2])/);
        if (fnAny) {
          detectedYear = parseInt(fnAny[1], 10);
          detectedMonth = parseInt(fnAny[2], 10);
          if (detectedYear === 2016) detectedYear = 2026;
        } else {
          const fnLeadingMonth = cleanFn.match(/^(1[0-2]|0?[1-9])[\s_-]/);
          if (fnLeadingMonth) {
            detectedMonth = parseInt(fnLeadingMonth[1], 10);
            if (!detectedYear) detectedYear = 2026;
          } else {
            const fnMonthName = cleanFn.match(/\b(january|januar|february|februar|march|märz|maerz|april|may|mai|june|juni|july|juli|august|september|october|oktober|november|december|dezember)\b/i);
            if (fnMonthName) {
              const mKey = fnMonthName[1].toLowerCase();
              const matchedM = monthNameLookup[mKey] || monthNameLookup[mKey.substring(0, 3)];
              if (matchedM) {
                detectedMonth = matchedM;
                const fnYear = cleanFn.match(/\b(20[1-3]\d)\b/);
                detectedYear = fnYear ? parseInt(fnYear[1], 10) : (detectedYear || 2026);
              }
            }
          }
        }
      }
    }

    // 5. Check fallbackYear / fallbackMonth if still not resolved
    if (!detectedYear && fallbackYear) {
      const fy = parseInt(String(fallbackYear), 10);
      if (!isNaN(fy) && fy >= 2000 && fy <= 2100) detectedYear = fy;
    }
    if (!detectedMonth && fallbackMonth) {
      const fmStr = String(fallbackMonth).toLowerCase().trim();
      const fmNum = parseInt(fmStr, 10);
      if (!isNaN(fmNum) && fmNum >= 1 && fmNum <= 12) {
        detectedMonth = fmNum;
      } else if (monthNameLookup[fmStr] || monthNameLookup[fmStr.substring(0, 3)]) {
        detectedMonth = monthNameLookup[fmStr] || monthNameLookup[fmStr.substring(0, 3)];
      }
    }

    const finalYear = detectedYear || now.getFullYear();
    const finalMonth = detectedMonth && detectedMonth >= 1 && detectedMonth <= 12 ? detectedMonth : now.getMonth() + 1;
    // Exact 2-digit month folder ("01" .. "12") matching the Google Drive _INBOX screenshot specification
    const monthFolder = String(finalMonth).padStart(2, '0');

    return {
      year: String(finalYear),
      monthNum: finalMonth,
      monthFolder,
    };
  }

  /**
   * Saves the uploaded Financial Accounting document (PDF/Image) into:
   *   Shared with me / _INBOX / 01_Clients / <Client Name> / 01_Financial Accounting – FiBu / <Year> / <MM> / <PDF>
   * AND saves its AI-converted SKR03 CSV & Excel files into the "00_CSV" subfolder:
   *   Shared with me / _INBOX / 01_Clients / <Client Name> / 01_Financial Accounting – FiBu / <Year> / <MM> / 00_CSV / <CSV & XLSX>
   */
  public syncFinancialAccountingWithCsv(params: {
    sourceFilePath: string;
    originalFilename: string;
    clientName: string;
    year: string;
    monthFolder: string;
    singleCsvContent: string;
    singleCsvFileName: string;
    singleXlsxContent?: Buffer;
    singleXlsxFileName?: string;
    monthlyCsvContent?: string;
    monthlyCsvFileName?: string;
    monthlyXlsxContent?: Buffer;
    monthlyXlsxFileName?: string;
    buchungenCsvContent?: string;
    buchungenCsvFileName?: string;
    personenkontenCsvContent?: string;
    personenkontenCsvFileName?: string;
    sachkontenCsvContent?: string;
    sachkontenCsvFileName?: string;
  }): {
    driveYearMonthDir: string | null;
    savedDocPath: string | null;
    savedCsvPaths: string[];
  } {
    if (!this.isConnected()) {
      this.detectGoogleDrivePaths();
    }

    const savedCsvPaths: string[] = [];
    let driveYearMonthDir: string | null = null;
    let savedDocPath: string | null = null;

    // Normalize monthFolder to 2-digit number (e.g. "10" -> "10", "05_May" -> "05")
    const mMatch = params.monthFolder.match(/^(1[0-2]|0?[1-9])(?:$|[^0-9])/);
    const normalizedMonth = mMatch
      ? String(parseInt(mMatch[1], 10)).padStart(2, '0')
      : params.monthFolder;

    try {
      const roots = this.getAllClientsRoots();
      const safeClient = this.sanitizeClientFolderName(params.clientName) || 'Hans Mustermann GmbH (Mandant)';

      // Ensure base client tree exists
      this.createClientFolderTree(safeClient, Number(params.year) || new Date().getFullYear());

      const buchName = params.buchungenCsvFileName || params.singleCsvFileName;
      const buchContent = params.buchungenCsvContent || params.singleCsvContent;

      for (const root of roots) {
        // 1. Target Month folder: 01_Clients / <Client Name> / 01_Financial Accounting – FiBu / <Year> / <MM>
        const yearMonthDir = path.join(root, safeClient, CLIENT_FOLDER_FIBU, params.year, normalizedMonth);
        this.ensureDir(yearMonthDir);

        // 2. Target CSV subfolder inside the month folder: ... / <Year> / <MM> / 00_CSV
        const csvSubDir = path.join(yearMonthDir, MONTH_FOLDER_CSV);
        this.ensureDir(csvSubDir);

        if (!driveYearMonthDir) {
          driveYearMonthDir = yearMonthDir;
        }

        // Copy the uploaded PDF / Image directly into the Month folder (<Year>/<MM>/<filename>)
        if (fs.existsSync(params.sourceFilePath)) {
          const docPath = path.join(yearMonthDir, params.originalFilename);
          fs.copyFileSync(params.sourceFilePath, docPath);
          if (!savedDocPath) savedDocPath = docPath;
        }

        // Clean up any previous SKR03_ or EXTF_ files in 00_CSV so only the 3 clean DATEV EXTF files remain
        try {
          const existing = fs.readdirSync(csvSubDir);
          for (const f of existing) {
            if (f.startsWith('SKR03_') || f.startsWith('EXTF_')) {
              try {
                fs.unlinkSync(path.join(csvSubDir, f));
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }

        // 1. EXTF_Buchungen_<YYYYMMDD>_<HHMMSS>_<YEAR>_<M>.csv
        if (buchContent && buchName) {
          const p1 = path.join(csvSubDir, buchName);
          fs.writeFileSync(p1, buchContent, 'utf-8');
          savedCsvPaths.push(p1);
        }

        // 2. EXTF_Personenkonten_<YYYYMMDD>_<HHMMSS>_<YEAR>.csv
        if (params.personenkontenCsvContent && params.personenkontenCsvFileName) {
          const p2 = path.join(csvSubDir, params.personenkontenCsvFileName);
          fs.writeFileSync(p2, params.personenkontenCsvContent, 'utf-8');
          savedCsvPaths.push(p2);
        }

        // 3. EXTF_Sachkonten_<YYYYMMDD>_<HHMMSS>_<YEAR>.csv
        if (params.sachkontenCsvContent && params.sachkontenCsvFileName) {
          const p3 = path.join(csvSubDir, params.sachkontenCsvFileName);
          fs.writeFileSync(p3, params.sachkontenCsvContent, 'utf-8');
          savedCsvPaths.push(p3);
        }
      }

      console.log(
        `[Google Drive] Routed doc to: 01_Clients/${safeClient}/${CLIENT_FOLDER_FIBU}/${params.year}/${normalizedMonth} (+ 3 DATEV EXTF CSVs in ${MONTH_FOLDER_CSV})`
      );

      // 3. Also sync the 3 files to global fintax/CSVs and data/
      if (buchContent && buchName) {
        this.syncCsv(buchContent, buchName);
      }
      if (params.personenkontenCsvContent && params.personenkontenCsvFileName) {
        this.syncCsv(params.personenkontenCsvContent, params.personenkontenCsvFileName);
      }
      if (params.sachkontenCsvContent && params.sachkontenCsvFileName) {
        this.syncCsv(params.sachkontenCsvContent, params.sachkontenCsvFileName);
      }
    } catch (err) {
      console.error('[Google Drive] Error in syncFinancialAccountingWithCsv:', err);
    }

    return {
      driveYearMonthDir,
      savedDocPath,
      savedCsvPaths,
    };
  }

  /**
   * Automatically save uploaded document (PDF/Image) to Google Drive client folders
   */
  public syncDocument(
    sourceFilePath: string,
    originalFilename: string,
    category: string = '01_FiBu',
    clientIdentifier: string = 'Hans Mustermann GmbH',
    docDate?: string,
    subTypes?: string[]
  ): string | null {
    if (!this.isConnected()) {
      this.detectGoogleDrivePaths();
    }

    try {
      if (!fs.existsSync(sourceFilePath)) {
        console.warn(`[Google Drive] Source document not found: ${sourceFilePath}`);
        return null;
      }

      const { year, monthFolder } = this.resolveYearAndMonth(docDate, originalFilename);
      const subTypesJoined = (subTypes || []).join(' ').toLowerCase();
      const safeName = this.sanitizeClientFolderName(clientIdentifier);
      this.createClientFolderTree(safeName, Number(year));

      let primaryTargetDir = '';

      for (const root of this.getAllClientsRoots()) {
        let targetDir = '';

        if (category === '00_Stammdaten' || category === 'FORMATION') {
          targetDir = path.join(root, safeName, CLIENT_FOLDER_CORRESPONDENCE, 'Company Formation');
        } else if (category === '00_Schriftverkehr' || category === 'CORRESPONDENCE') {
          let corrSub = 'Tax Office';
          if (subTypesJoined.includes('contract') || subTypesJoined.includes('vertr') || subTypesJoined.includes('fintax')) {
            corrSub = 'FinTax';
          } else if (subTypesJoined.includes('formation') || subTypesJoined.includes('notar') || subTypesJoined.includes('register')) {
            corrSub = 'Company Formation';
          }
          targetDir = path.join(root, safeName, CLIENT_FOLDER_CORRESPONDENCE, corrSub);
        } else if (category === '02_LoBu' || category === 'PAYROLL') {
          let payrollSub = 'Payroll Statements + Deregistrations + Registrations';
          if (subTypesJoined.includes('employment') || subTypesJoined.includes('arbeitsagentur')) {
            payrollSub = 'Employment Agency';
          } else if (subTypesJoined.includes('liability') || subTypesJoined.includes('berufsgenossenschaft')) {
            payrollSub = "Employers' Liability Insurance Association";
          } else if (subTypesJoined.includes('health') || subTypesJoined.includes('krankenkasse') || subTypesJoined.includes('sick')) {
            payrollSub = 'Health Insurance';
          } else if (subTypesJoined.includes('soka') || subTypesJoined.includes('welfare')) {
            payrollSub = 'Social Welfare Fund (SOKA)';
          }
          targetDir = path.join(root, safeName, CLIENT_FOLDER_PAYROLL, payrollSub);
        } else {
          // Financial Accounting -> 01_Financial Accounting – FiBu / <Year> / <MM>
          targetDir = path.join(root, safeName, CLIENT_FOLDER_FIBU, year, monthFolder);
          this.ensureDir(path.join(targetDir, MONTH_FOLDER_CSV));
        }

        this.ensureDir(targetDir);
        const targetClientPath = path.join(targetDir, originalFilename);
        fs.copyFileSync(sourceFilePath, targetClientPath);
        if (!primaryTargetDir) primaryTargetDir = targetDir;
      }

      // Also keep in fintax/Documents/<category>/ for backup
      if (this.fintaxFolderPath) {
        const catDir = path.join(this.fintaxFolderPath, 'Documents', category);
        this.ensureDir(catDir);
        const targetPath = path.join(catDir, originalFilename);
        fs.copyFileSync(sourceFilePath, targetPath);
      }

      return primaryTargetDir ? path.join(primaryTargetDir, originalFilename) : null;
    } catch (err) {
      console.error('[Google Drive] Error copying document to Google Drive:', err);
      return null;
    }
  }

  private ensureDir(dirPath: string) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch (err) {
      console.warn(`[Google Drive] Could not create directory ${dirPath}:`, err);
    }
  }
}

export const googleDriveService = new GoogleDriveService();
