import fs from 'fs';
import path from 'path';

export interface LearnedSupplierRule {
  supplierNormalized: string;
  originalName: string;
  skr03Account: string;
  skr03AccountName?: string;
  vatRatePercent: number;
  buSchluessel?: string;
  category?: string;
  lastUsedAt: string;
  usageCount: number;
}

class SupplierMemoryService {
  private memoryFilePath: string;
  private memoryMap: Map<string, LearnedSupplierRule> = new Map();

  constructor() {
    this.memoryFilePath = path.resolve(process.cwd(), '../storage/learned_suppliers.json');
    this.loadMemory();
  }

  private normalizeName(name: string): string {
    return (name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9äöüß]/g, '');
  }

  private loadMemory() {
    try {
      if (fs.existsSync(this.memoryFilePath)) {
        const raw = fs.readFileSync(this.memoryFilePath, 'utf-8');
        const list: LearnedSupplierRule[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const rule of list) {
            if (rule.supplierNormalized) {
              this.memoryMap.set(rule.supplierNormalized, rule);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[SupplierMemory] Warning loading learned suppliers:', e);
    }
  }

  private saveMemory() {
    try {
      const dir = path.dirname(this.memoryFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.memoryMap.values());
      fs.writeFileSync(this.memoryFilePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[SupplierMemory] Warning saving learned suppliers:', e);
    }
  }

  /**
   * Looks up a vendor in the learned memory table
   */
  lookupSupplier(supplierName: string): LearnedSupplierRule | null {
    if (!supplierName) return null;
    const norm = this.normalizeName(supplierName);
    if (!norm) return null;

    // Exact normalized match
    if (this.memoryMap.has(norm)) {
      return this.memoryMap.get(norm)!;
    }

    // Substring match for robust recognition (e.g. "Shell Furtwangen Tanken" -> "shell")
    for (const [key, rule] of this.memoryMap.entries()) {
      if (key.length >= 4 && (norm.includes(key) || key.includes(norm))) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Learns or updates a supplier's SKR03 mapping
   */
  learnSupplier(rule: {
    supplierName: string;
    skr03Account: string;
    skr03AccountName?: string;
    vatRatePercent?: number;
    buSchluessel?: string;
    category?: string;
  }) {
    if (!rule.supplierName || !rule.skr03Account) return;
    const norm = this.normalizeName(rule.supplierName);
    if (!norm) return;

    const existing = this.memoryMap.get(norm);
    const updated: LearnedSupplierRule = {
      supplierNormalized: norm,
      originalName: rule.supplierName.trim(),
      skr03Account: rule.skr03Account.trim(),
      skr03AccountName: rule.skr03AccountName || existing?.skr03AccountName || '',
      vatRatePercent: rule.vatRatePercent !== undefined ? rule.vatRatePercent : (existing?.vatRatePercent || 19),
      buSchluessel: rule.buSchluessel || (rule.vatRatePercent === 19 ? '9' : rule.vatRatePercent === 7 ? '8' : ''),
      category: rule.category || existing?.category,
      lastUsedAt: new Date().toISOString(),
      usageCount: (existing?.usageCount || 0) + 1,
    };

    this.memoryMap.set(norm, updated);
    this.saveMemory();
  }

  getAllRules(): LearnedSupplierRule[] {
    return Array.from(this.memoryMap.values());
  }
}

export const supplierMemoryService = new SupplierMemoryService();

