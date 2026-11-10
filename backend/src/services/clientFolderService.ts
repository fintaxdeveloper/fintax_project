import fs from 'fs';
import path from 'path';
import {
  FOLDER_SHARED_WITH_ME,
  FOLDER_INBOX,
  FOLDER_TEMPLATE,
  FOLDER_TRAINING,
  FOLDER_CLIENTS,
  CLIENT_FOLDER_CORRESPONDENCE,
  CLIENT_FOLDER_FIBU,
  CLIENT_FOLDER_PAYROLL,
  MONTH_FOLDER_CSV,
} from './googleDriveService.js';

export type FolderCategory = '00_Stammdaten' | '00_Schriftverkehr' | '01_FiBu' | '02_LoBu' | '03_Agenda';

export const FOLDER_CATEGORIES: Record<FolderCategory, { nameDe: string; nameEn: string; description: string }> = {
  '00_Stammdaten': {
    nameDe: 'Gründungsunterlagen & Stammdaten',
    nameEn: 'Formation Documents & Master Data',
    description: 'Gewerbeanmeldung, Handelsregisterauszug, Gesellschaftervertrag, Ausweise & Steuernummern',
  },
  '00_Schriftverkehr': {
    nameDe: '00_Correspondence - Schriftverkehr',
    nameEn: '00_Correspondence - Schriftverkehr',
    description: 'Finanzamt, IHK, Krankenkassen, Verträge & Handelsregister',
  },
  '01_FiBu': {
    nameDe: '01_Financial Accounting – FiBu',
    nameEn: '01_Financial Accounting – FiBu',
    description: 'Eingangsrechnungen, Ausgangsrechnungen, Kassenbücher, Bank & 00_CSV',
  },
  '02_LoBu': {
    nameDe: '02_Payrol - Lohn',
    nameEn: '02_Payrol - Lohn',
    description: 'Personalfragebögen, Arbeitsunfähigkeiten, Stundenzettel & Lohnabrechnungen',
  },
  '03_Agenda': {
    nameDe: '00_CSV (SKR03 Exports)',
    nameEn: '00_CSV (SKR03 Exports)',
    description: 'Exportierte SKR03 Buchungsstapel & Excel-Dateien im Monatsordner 00_CSV',
  },
};

export interface FolderNode {
  name: string;
  path: string;
  relativePath?: string;
  type: 'directory' | 'file';
  sizeBytes?: number;
  category?: FolderCategory;
  children?: FolderNode[];
  fileCount?: number;
}

function resolveVaultDir(): string {
  let cur = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate1 = path.join(cur, 'storage', 'vault');
    if (fs.existsSync(candidate1)) return candidate1;
    const candidate2 = path.join(cur, 'fintax_project-main', 'storage', 'vault');
    if (fs.existsSync(candidate2)) return candidate2;
    cur = path.dirname(cur);
  }
  return path.resolve(process.cwd(), '../storage/vault');
}

const CLIENT_MAP_FILE = path.join(resolveVaultDir(), 'client_name_map.json');

function loadClientMap(): Record<string, string> {
  try {
    if (fs.existsSync(CLIENT_MAP_FILE)) {
      return JSON.parse(fs.readFileSync(CLIENT_MAP_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {
    user_client_1: 'Hans Mustermann GmbH (Mandant)',
    user_client_2: 'Alpen Logistik Bayern KG (Mandant)',
  };
}

function saveClientMap(map: Record<string, string>): void {
  try {
    const dir = path.dirname(CLIENT_MAP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CLIENT_MAP_FILE, JSON.stringify(map, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

export const clientFolderService = {
  clientIdToFolderName: loadClientMap(),

  /**
   * Registers a client ID -> human-readable client folder name (e.g. "704_QA24 GbmH" or "Jane Doe")
   */
  registerClientName(clientId: string, clientName: string, clientNumber?: string | null): string {
    const cleanName = this.sanitizeFolderName(clientName) || 'Unbekannter_Mandant';
    const cleanNum = clientNumber ? String(clientNumber).trim() : '';
    const formatted = cleanNum && !cleanName.startsWith(`${cleanNum}_`)
      ? `${cleanNum}_${cleanName}`
      : cleanName;

    if (clientId) {
      this.clientIdToFolderName[clientId] = formatted;
      saveClientMap(this.clientIdToFolderName);
    }
    return formatted;
  },

  /**
   * Resolves a clientId (like "user_client_1") or clientName into the exact folder name inside 01_Clients
   */
  resolveClientFolderName(clientIdOrName: string): string {
    if (!clientIdOrName) return 'Hans Mustermann GmbH (Mandant)';
    if (this.clientIdToFolderName[clientIdOrName]) {
      return this.clientIdToFolderName[clientIdOrName];
    }
    return this.sanitizeFolderName(clientIdOrName);
  },

  /**
   * Base vault root: storage/vault
   */
  getVaultRootDir(): string {
    return resolveVaultDir();
  },

  /**
   * Shared with me root: storage/vault/Shared with me
   */
  getSharedWithMeDir(): string {
    const dir = path.join(this.getVaultRootDir(), FOLDER_SHARED_WITH_ME);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  },

  /**
   * _INBOX root: storage/vault/Shared with me/_INBOX
   */
  getInboxDir(): string {
    const inboxDir = path.join(this.getSharedWithMeDir(), FOLDER_INBOX);
    if (!fs.existsSync(inboxDir)) {
      fs.mkdirSync(inboxDir, { recursive: true });
    }

    // Ensure 00_Template Folder Structure - Muster Ordnerstruktur
    const templateDir = path.join(inboxDir, FOLDER_TEMPLATE);
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }
    [CLIENT_FOLDER_CORRESPONDENCE, CLIENT_FOLDER_FIBU, CLIENT_FOLDER_PAYROLL].forEach((sub) => {
      const p = path.join(templateDir, sub);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });

    // Ensure 00_Training Center
    const trainingDir = path.join(inboxDir, FOLDER_TRAINING);
    if (!fs.existsSync(trainingDir)) {
      fs.mkdirSync(trainingDir, { recursive: true });
    }

    // Ensure 01_Clients
    const clientsDir = path.join(inboxDir, FOLDER_CLIENTS);
    if (!fs.existsSync(clientsDir)) {
      fs.mkdirSync(clientsDir, { recursive: true });
    }

    return inboxDir;
  },

  /**
   * 01_Clients directory: storage/vault/Shared with me/_INBOX/01_Clients
   */
  getBaseStorageDir(): string {
    const inboxDir = this.getInboxDir();
    return path.join(inboxDir, FOLDER_CLIENTS);
  },

  sanitizeFolderName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Initializes the client folder structure inside:
   *   Shared with me / _INBOX / 01_Clients / <Client Name> /
   *     ├── 00_Correspondence - Schriftverkehr
   *     ├── 01_Financial Accounting – FiBu / <Year>
   *     └── 02_Payrol - Lohn
   */
  ensureClientFolderTree(
    clientIdOrName: string,
    year = new Date().getFullYear(),
    _month = new Date().getMonth() + 1,
    clientNameOverride?: string,
    clientNumber?: string | null
  ): string {
    let clientFolderName = clientNameOverride
      ? this.registerClientName(clientIdOrName, clientNameOverride, clientNumber)
      : this.resolveClientFolderName(clientIdOrName);

    // Avoid creating raw "user_17..." folders if not mapped yet
    if (clientFolderName.startsWith('user_') && clientIdOrName !== 'user_client_1' && clientIdOrName !== 'user_client_2') {
      if (this.clientIdToFolderName[clientIdOrName]) {
        clientFolderName = this.clientIdToFolderName[clientIdOrName];
      }
    }

    const clientBase = path.join(this.getBaseStorageDir(), clientFolderName);
    if (!fs.existsSync(clientBase)) {
      fs.mkdirSync(clientBase, { recursive: true });
    }

    const yearFolder = year.toString();

    // Exact 3 folders inside each client from screenshots:
    // 1. 00_Correspondence - Schriftverkehr
    // 2. 01_Financial Accounting – FiBu
    // 3. 02_Payrol - Lohn
    const coreFolders = [
      CLIENT_FOLDER_CORRESPONDENCE,
      CLIENT_FOLDER_FIBU,
      CLIENT_FOLDER_PAYROLL,
    ];
    coreFolders.forEach((folderName) => {
      const folderPath = path.join(clientBase, folderName);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
    });

    // 1. Correspondence subfolders
    const correspondenceSubs = ['FinTax', 'Company Formation', 'Tax Office'];
    correspondenceSubs.forEach((sub) => {
      const p = path.join(clientBase, CLIENT_FOLDER_CORRESPONDENCE, sub);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });

    // 2. Payroll subfolders
    const payrollSubs = [
      'Payroll Statements + Deregistrations + Registrations',
      'Employment Agency',
      "Employers' Liability Insurance Association",
      'Health Insurance',
      'Social Welfare Fund (SOKA)',
    ];
    payrollSubs.forEach((sub) => {
      const p = path.join(clientBase, CLIENT_FOLDER_PAYROLL, sub);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });

    // 3. Financial Accounting Year folder
    const financialYearDir = path.join(clientBase, CLIENT_FOLDER_FIBU, yearFolder);
    if (!fs.existsSync(financialYearDir)) {
      fs.mkdirSync(financialYearDir, { recursive: true });
    }

    return clientBase;
  },

  /**
   * Seeds the reference demo client "704_QA24 GbmH" shown in the user's screenshots
   */
  ensureDemoReferenceClient(): void {
    const demoClient = '704_QA24 GbmH';
    this.ensureClientFolderTree(demoClient, 2024);
    const fibu2024 = path.join(this.getBaseStorageDir(), demoClient, CLIENT_FOLDER_FIBU, '2024');
    for (let m = 2; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const mDir = path.join(fibu2024, mm);
      const csvDir = path.join(mDir, MONTH_FOLDER_CSV);
      if (!fs.existsSync(csvDir)) {
        fs.mkdirSync(csvDir, { recursive: true });
      }
    }
  },

  /**
   * Resolves target directory for a file based on category and document date
   */
  resolveTargetFolder(clientId: string, category: FolderCategory, dateStr?: string): {
    absoluteDir: string;
    relativeDir: string;
    year: string;
    month: string;
  } {
    const clientFolderName = this.resolveClientFolderName(clientId);
    let date = new Date();
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    const year = date.getFullYear().toString();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const clientBase = this.ensureClientFolderTree(clientFolderName, Number(year));

    let catFolder = CLIENT_FOLDER_FIBU;
    let relativeDir = '';
    let absoluteDir = '';

    if (category === '00_Stammdaten') {
      catFolder = CLIENT_FOLDER_CORRESPONDENCE;
      relativeDir = path.join(FOLDER_SHARED_WITH_ME, FOLDER_INBOX, FOLDER_CLIENTS, clientFolderName, catFolder, 'Company Formation');
      absoluteDir = path.join(clientBase, catFolder, 'Company Formation');
    } else if (category === '00_Schriftverkehr') {
      catFolder = CLIENT_FOLDER_CORRESPONDENCE;
      relativeDir = path.join(FOLDER_SHARED_WITH_ME, FOLDER_INBOX, FOLDER_CLIENTS, clientFolderName, catFolder, 'Tax Office');
      absoluteDir = path.join(clientBase, catFolder, 'Tax Office');
    } else if (category === '02_LoBu') {
      catFolder = CLIENT_FOLDER_PAYROLL;
      relativeDir = path.join(FOLDER_SHARED_WITH_ME, FOLDER_INBOX, FOLDER_CLIENTS, clientFolderName, catFolder, 'Payroll Statements + Deregistrations + Registrations');
      absoluteDir = path.join(clientBase, catFolder, 'Payroll Statements + Deregistrations + Registrations');
    } else {
      catFolder = CLIENT_FOLDER_FIBU;
      relativeDir = path.join(FOLDER_SHARED_WITH_ME, FOLDER_INBOX, FOLDER_CLIENTS, clientFolderName, catFolder, year, month);
      absoluteDir = path.join(clientBase, catFolder, year, month);
    }

    if (!fs.existsSync(absoluteDir)) {
      fs.mkdirSync(absoluteDir, { recursive: true });
    }
    if (catFolder === CLIENT_FOLDER_FIBU) {
      const csvDir = path.join(absoluteDir, MONTH_FOLDER_CSV);
      if (!fs.existsSync(csvDir)) {
        fs.mkdirSync(csvDir, { recursive: true });
      }
    }

    return { absoluteDir, relativeDir, year, month };
  },

  /**
   * Stores a file into the structured client folder hierarchy
   */
  storeDocumentFile(
    clientId: string,
    category: FolderCategory,
    sourceFilePath: string,
    originalFilename: string,
    docDate?: string
  ): { storedPath: string; relativePath: string; fileName: string } {
    const { absoluteDir, relativeDir } = this.resolveTargetFolder(clientId, category, docDate);

    const storedPath = path.join(absoluteDir, originalFilename);
    const relativePath = path.join(relativeDir, originalFilename);

    if (fs.existsSync(sourceFilePath) && path.resolve(sourceFilePath) !== path.resolve(storedPath)) {
      fs.copyFileSync(sourceFilePath, storedPath);
    }

    return { storedPath, relativePath, fileName: originalFilename };
  },

  /**
   * Relocates/stores a Financial Accounting document into:
   *   Shared with me / _INBOX / 01_Clients / <Client Name> / 01_Financial Accounting – FiBu / <Year> / <MM> / <originalFilename>
   * AND stores its converted SKR03 CSV & Excel files into:
   *   Shared with me / _INBOX / 01_Clients / <Client Name> / 01_Financial Accounting – FiBu / <Year> / <MM> / 00_CSV / <CSV & XLSX>
   */
  storeFinancialAccountingByYearMonth(params: {
    clientId: string;
    clientName?: string;
    currentStoredPath: string;
    originalFilename: string;
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
  }): { storedPath: string; relativePath: string; csvRelativePath: string } {
    if (params.clientName && params.clientId) {
      this.registerClientName(params.clientId, params.clientName);
    }
    const clientFolderName = params.clientName
      ? this.sanitizeFolderName(params.clientName)
      : this.resolveClientFolderName(params.clientId);

    const clientBase = this.ensureClientFolderTree(clientFolderName, Number(params.year) || new Date().getFullYear());

    // Normalize monthFolder to 2-digit number ("01" .. "12")
    const normalizedMonth = params.monthFolder.match(/^(0?[1-9]|1[0-2])/)
      ? String(parseInt(params.monthFolder.match(/^(0?[1-9]|1[0-2])/)![1], 10)).padStart(2, '0')
      : params.monthFolder;

    // 1. 01_Financial Accounting – FiBu / <Year> / <MM>
    const finAccMonthDir = path.join(clientBase, CLIENT_FOLDER_FIBU, params.year, normalizedMonth);
    if (!fs.existsSync(finAccMonthDir)) {
      fs.mkdirSync(finAccMonthDir, { recursive: true });
    }

    // 2. 00_CSV subfolder inside <Year> / <MM> / 00_CSV
    const csvDir = path.join(finAccMonthDir, MONTH_FOLDER_CSV);
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
    }

    const targetDocPath = path.join(finAccMonthDir, params.originalFilename);

    if (fs.existsSync(params.currentStoredPath)) {
      if (path.resolve(params.currentStoredPath) !== path.resolve(targetDocPath)) {
        fs.copyFileSync(params.currentStoredPath, targetDocPath);
      }
    }

    // Remove any previous/old CSV or XLSX exports in 00_CSV so only the 3 clean DATEV EXTF files remain
    try {
      const existingFiles = fs.readdirSync(csvDir);
      for (const f of existingFiles) {
        if (f.startsWith('SKR03_') || f.startsWith('EXTF_')) {
          try {
            fs.unlinkSync(path.join(csvDir, f));
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    const buchName = params.buchungenCsvFileName || params.singleCsvFileName;
    const buchContent = params.buchungenCsvContent || params.singleCsvContent;

    // Save the 3 official DATEV EXTF CSV files inside 00_CSV:
    // 1. EXTF_Buchungen_<YYYYMMDD>_<HHMMSS>_<YEAR>_<M>.csv
    if (buchContent && buchName) {
      fs.writeFileSync(path.join(csvDir, buchName), buchContent, 'utf-8');
    }

    // 2. EXTF_Personenkonten_<YYYYMMDD>_<HHMMSS>_<YEAR>.csv
    if (params.personenkontenCsvContent && params.personenkontenCsvFileName) {
      fs.writeFileSync(path.join(csvDir, params.personenkontenCsvFileName), params.personenkontenCsvContent, 'utf-8');
    }

    // 3. EXTF_Sachkonten_<YYYYMMDD>_<HHMMSS>_<YEAR>.csv
    if (params.sachkontenCsvContent && params.sachkontenCsvFileName) {
      fs.writeFileSync(path.join(csvDir, params.sachkontenCsvFileName), params.sachkontenCsvContent, 'utf-8');
    }

    const relativePath = path.join(
      FOLDER_SHARED_WITH_ME,
      FOLDER_INBOX,
      FOLDER_CLIENTS,
      clientFolderName,
      CLIENT_FOLDER_FIBU,
      params.year,
      normalizedMonth,
      params.originalFilename
    );
    const csvRelativePath = path.join(
      FOLDER_SHARED_WITH_ME,
      FOLDER_INBOX,
      FOLDER_CLIENTS,
      clientFolderName,
      CLIENT_FOLDER_FIBU,
      params.year,
      normalizedMonth,
      MONTH_FOLDER_CSV,
      params.singleCsvFileName
    );

    return {
      storedPath: targetDocPath,
      relativePath,
      csvRelativePath,
    };
  },

  /**
   * Helper to recursively build a FolderNode tree with directories sorted first (so 00_CSV is always above PDFs)
   */
  buildDirectoryTree(dirPath: string, name: string): FolderNode {
    const stat = fs.statSync(dirPath);
    const vaultRoot = this.getVaultRootDir();
    const relPath = path.relative(vaultRoot, dirPath).replace(/\\/g, '/');

    if (!stat.isDirectory()) {
      return {
        name,
        path: dirPath,
        relativePath: relPath,
        type: 'file',
        sizeBytes: stat.size,
      };
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).filter(
      (e) => e.name !== 'desktop.ini' && !e.name.startsWith('.')
    );

    // Sort directories first, then alphabetically (so 00_CSV appears before PDF files in month folders)
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    let totalFiles = 0;
    const children: FolderNode[] = [];

    for (const entry of entries) {
      const fullChildPath = path.join(dirPath, entry.name);
      const childNode = this.buildDirectoryTree(fullChildPath, entry.name);
      if (childNode.type === 'file') {
        totalFiles += 1;
      } else if (childNode.fileCount) {
        totalFiles += childNode.fileCount;
      }
      children.push(childNode);
    }

    return {
      name,
      path: dirPath,
      relativePath: relPath,
      type: 'directory',
      children,
      fileCount: totalFiles,
    };
  },

  /**
   * Returns the complete "Shared with me > _INBOX" tree.
   * If filterClientIdOrName is provided (and not 'ALL'), 01_Clients can either show all clients or highlight the active client.
   */
  getInboxFolderTree(filterClientIdOrName?: string): FolderNode {
    this.getInboxDir();
    this.ensureDemoReferenceClient();

    if (filterClientIdOrName && filterClientIdOrName !== 'ALL') {
      const resolvedName = this.resolveClientFolderName(filterClientIdOrName);
      this.ensureClientFolderTree(resolvedName);
    }

    const sharedDir = this.getSharedWithMeDir();
    return this.buildDirectoryTree(sharedDir, FOLDER_SHARED_WITH_ME);
  },

  /**
   * Recursively reads a client folder to return a tree for the UI
   */
  getClientFolderTree(clientIdOrName: string): FolderNode {
    const clientFolderName = this.resolveClientFolderName(clientIdOrName);
    const clientBase = this.ensureClientFolderTree(clientFolderName);
    return this.buildDirectoryTree(clientBase, clientFolderName);
  },

  /**
   * List all client folder names present in Shared with me / _INBOX / 01_Clients
   */
  listAllClients(): string[] {
    this.ensureDemoReferenceClient();
    const base = this.getBaseStorageDir();
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base)
      .filter((item) => {
        const full = path.join(base, item);
        return fs.statSync(full).isDirectory() && !item.startsWith('user_');
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  },
};
