import fs from 'fs';
import path from 'path';

export type FolderCategory = '00_Schriftverkehr' | '01_FiBu' | '02_LoBu' | '03_Agenda';

export const FOLDER_CATEGORIES: Record<FolderCategory, { nameDe: string; nameEn: string; description: string }> = {
  '00_Schriftverkehr': {
    nameDe: 'Schriftverkehr & Behörden',
    nameEn: 'Correspondence & Authorities',
    description: 'Finanzamt, IHK, Krankenkassen, Verträge & Handelsregister',
  },
  '01_FiBu': {
    nameDe: 'Finanzbuchhaltung (FiBu)',
    nameEn: 'Financial Accounting (FiBu)',
    description: 'Eingangsrechnungen, Ausgangsrechnungen, Kassenbücher & Belege',
  },
  '02_LoBu': {
    nameDe: 'Lohnbuchhaltung (LoBu)',
    nameEn: 'Payroll Accounting (LoBu)',
    description: 'Personalfragebögen, Arbeitsunfähigkeiten, Stundenzettel & Lohnabrechnungen',
  },
  '03_Agenda': {
    nameDe: 'Agenda SKR03 Übergabe',
    nameEn: 'Agenda SKR03 Exports',
    description: 'Exportierte Buchungsstapel, Importdateien & Übergabeprotokolle',
  },
};

const MONTH_NAMES_DE = [
  '01_Januar', '02_Februar', '03_Maerz', '04_April',
  '05_Mai', '06_Juni', '07_Juli', '08_August',
  '09_September', '10_Oktober', '11_November', '12_Dezember'
];

export interface FolderNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  sizeBytes?: number;
  category?: FolderCategory;
  children?: FolderNode[];
  fileCount?: number;
}

export const clientFolderService = {
  getBaseStorageDir(): string {
    const base = path.resolve(process.cwd(), '../storage/vault/clients');
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true });
    }
    return base;
  },

  sanitizeFolderName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  },

  /**
   * Initializes the standard 4-folder structure for a client with current year/month
   */
  ensureClientFolderTree(clientId: string, year = new Date().getFullYear(), month = new Date().getMonth() + 1): string {
    const safeClientId = this.sanitizeFolderName(clientId);
    const clientBase = path.join(this.getBaseStorageDir(), safeClientId);

    const monthFolder = MONTH_NAMES_DE[month - 1] || `${month.toString().padStart(2, '0')}_Monat`;
    const yearFolder = year.toString();

    const categories: FolderCategory[] = ['00_Schriftverkehr', '01_FiBu', '02_LoBu', '03_Agenda'];

    categories.forEach((cat) => {
      const fullPath = path.join(clientBase, cat, yearFolder, monthFolder);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });

    return clientBase;
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
    const safeClientId = this.sanitizeFolderName(clientId);
    let date = new Date();
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    const year = date.getFullYear().toString();
    const monthIndex = date.getMonth();
    const month = MONTH_NAMES_DE[monthIndex] || '10_Oktober';

    const clientBase = path.join(this.getBaseStorageDir(), safeClientId);
    const relativeDir = path.join(safeClientId, category, year, month);
    const absoluteDir = path.join(clientBase, category, year, month);

    if (!fs.existsSync(absoluteDir)) {
      fs.mkdirSync(absoluteDir, { recursive: true });
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

    // Sanitize filename and avoid collisions
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now().toString().slice(-6);
    const fileName = `${baseName}_${timestamp}${ext}`;

    const storedPath = path.join(absoluteDir, fileName);
    const relativePath = path.join(relativeDir, fileName);

    fs.copyFileSync(sourceFilePath, storedPath);

    return { storedPath, relativePath, fileName };
  },

  /**
   * Recursively reads a client folder to return a tree for the UI
   */
  getClientFolderTree(clientId: string): FolderNode {
    const safeClientId = this.sanitizeFolderName(clientId);
    const clientBase = path.join(this.getBaseStorageDir(), safeClientId);

    // Make sure initial tree exists
    this.ensureClientFolderTree(safeClientId);

    function buildTree(dirPath: string, name: string): FolderNode {
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        return {
          name,
          path: dirPath,
          type: 'file',
          sizeBytes: stat.size,
        };
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      let totalFiles = 0;
      const children: FolderNode[] = [];

      for (const entry of entries) {
        const fullChildPath = path.join(dirPath, entry.name);
        const childNode = buildTree(fullChildPath, entry.name);
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
        type: 'directory',
        children,
        fileCount: totalFiles,
      };
    }

    const tree = buildTree(clientBase, safeClientId);
    return tree;
  },

  /**
   * List all client IDs present in storage
   */
  listAllClients(): string[] {
    const base = this.getBaseStorageDir();
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base).filter((item) => {
      return fs.statSync(path.join(base, item)).isDirectory();
    });
  },
};
