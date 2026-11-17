import fs from 'fs';
import path from 'path';

export interface VehicleRule {
  tax_key: '8193' | '8400' | '8125' | '3200';
  model?: string;
  customer?: string;
  supplier?: string;
  regime?: string;
}

export interface VendorAccountRule {
  pattern: string;
  min_amount?: number;
  max_amount?: number;
  account: string;
  bu_code?: string;
}

export interface ClientRules {
  client_id: string;
  client_name?: string;
  chart_of_accounts?: string;
  industry?: string;
  vehicle_registry?: Record<string, VehicleRule>;
  payee_tax_mappings?: Record<string, '8193' | '8400' | '8125' | '3200'>;
  vendor_account_rules?: VendorAccountRule[];
  starting_balances?: Record<string, Record<string, number>>;
}

class ClientRulesService {
  private rulesCache: Map<string, ClientRules> = new Map();
  private rulesDirCandidates: string[] = [
    path.resolve(process.cwd(), 'storage/rules'),
    path.resolve(process.cwd(), '../storage/rules'),
    path.resolve(process.cwd(), '../../storage/rules'),
    'C:/Users/sh/Desktop/fintax_project-main/storage/rules',
  ];

  constructor() {
    this.reloadAllRules();
  }

  public reloadAllRules(): void {
    this.rulesCache.clear();
    for (const dir of this.rulesDirCandidates) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
          for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const rules: ClientRules = JSON.parse(content);
              const key = rules.client_id || path.basename(file, '.json');
              this.rulesCache.set(key.toLowerCase(), rules);
              // Also map normalized key
              this.rulesCache.set(key.replace(/[^a-z0-9]/gi, '').toLowerCase(), rules);
            } catch (err: any) {
              console.warn(`[ClientRules] Error loading ${fullPath}:`, err.message);
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  public getRules(clientId?: string): ClientRules | null {
    if (!clientId) {
      // Return default QA24 if available
      return this.rulesCache.get('704_qa24') || this.rulesCache.get('704qa24') || null;
    }
    const cleanId = clientId.toLowerCase();
    const cleanAlpha = cleanId.replace(/[^a-z0-9]/g, '');
    return this.rulesCache.get(cleanId) || this.rulesCache.get(cleanAlpha) || this.rulesCache.get('704_qa24') || null;
  }

  /**
   * Looks up a VIN in client registry.
   * Supports both 17-character full VIN and 7-character suffix match (e.g. Stern Wagen short VINs).
   */
  public lookupVin(clientId: string | undefined, vin: string): { taxKey: '8193' | '8400' | '8125' | '3200'; fullVin?: string; rule?: VehicleRule } | null {
    if (!vin || vin.length < 5) return null;
    const rules = this.getRules(clientId);
    if (!rules || !rules.vehicle_registry) return null;

    const upperVin = vin.toUpperCase().trim();

    // 1. Exact VIN match
    if (rules.vehicle_registry[upperVin]) {
      const r = rules.vehicle_registry[upperVin];
      return { taxKey: r.tax_key, fullVin: upperVin, rule: r };
    }

    // 2. Suffix match (last 6-7 characters, common on German bank statements e.g. Stern Wagen)
    const suffix = upperVin.slice(-7);
    if (suffix.length >= 6) {
      for (const [fullVin, r] of Object.entries(rules.vehicle_registry)) {
        if (fullVin.toUpperCase().endsWith(suffix)) {
          return { taxKey: r.tax_key, fullVin, rule: r };
        }
      }
    }

    return null;
  }

  /**
   * Looks up a payee / counterparty in client rules.
   */
  public lookupPayee(clientId: string | undefined, text: string): '8193' | '8400' | '8125' | '3200' | null {
    if (!text) return null;
    const rules = this.getRules(clientId);
    if (!rules || !rules.payee_tax_mappings) return null;

    const lower = text.toLowerCase();
    for (const [key, taxKey] of Object.entries(rules.payee_tax_mappings)) {
      if (lower.includes(key.toLowerCase())) {
        return taxKey;
      }
    }
    return null;
  }

  /**
   * Matches vendor-specific SKR03 account rules from client configuration.
   */
  public matchVendorRule(clientId: string | undefined, text: string, amount: number): { account: string; buCode: string } | null {
    if (!text) return null;
    const rules = this.getRules(clientId);
    if (!rules || !rules.vendor_account_rules) return null;

    const lower = text.toLowerCase();
    for (const r of rules.vendor_account_rules) {
      const regex = new RegExp(`\\b(${r.pattern})\\b`, 'i');
      if (regex.test(lower)) {
        if (r.min_amount !== undefined && amount < r.min_amount) continue;
        if (r.max_amount !== undefined && amount > r.max_amount) continue;
        return {
          account: r.account,
          buCode: r.bu_code || '',
        };
      }
    }
    return null;
  }

  /**
   * Gets starting balance for an account (e.g. 1000 Kasse, 1200 Bank) for a given year.
   */
  public getStartingBalance(clientId: string | undefined, year: number, account: string): number | null {
    const rules = this.getRules(clientId);
    if (!rules || !rules.starting_balances) return null;

    const yStr = String(year);
    if (rules.starting_balances[yStr] && rules.starting_balances[yStr][account] !== undefined) {
      return rules.starting_balances[yStr][account];
    }
    return null;
  }
}

export const clientRulesService = new ClientRulesService();
