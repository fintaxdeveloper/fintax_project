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

export interface ClientSettings {
  mandanten_nr?: string;
  berater_name?: string;
  company_name?: string;
  owners?: string[];
  eu_dealers?: string[];
  foreign_client_keywords?: string[];
}

export interface ClientRules {
  client_id: string;
  client_aliases?: string[];
  client_settings?: ClientSettings;
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
  private filePaths: Map<string, string> = new Map();
  private rulesDirCandidates: string[] = [
    path.resolve(process.cwd(), 'storage/rules'),
    path.resolve(process.cwd(), '../storage/rules'),
    path.resolve(process.cwd(), '../../storage/rules'),
    'C:/Users/sh/Desktop/fintax_project-main/fintax_project-main/storage/rules',
    'C:/Users/sh/Desktop/fintax_project-main/storage/rules',
  ];

  constructor() {
    this.reloadAllRules();
  }

  public reloadAllRules(): void {
    this.rulesCache.clear();
    this.filePaths.clear();
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
              const keysToMap = [key, ...(rules.client_aliases || [])];
              for (const k of keysToMap) {
                const lower = k.toLowerCase();
                const alpha = lower.replace(/[^a-z0-9]/g, '');
                if (!this.rulesCache.has(lower)) {
                  this.rulesCache.set(lower, rules);
                  this.filePaths.set(lower, fullPath);
                }
                if (!this.rulesCache.has(alpha)) {
                  this.rulesCache.set(alpha, rules);
                  this.filePaths.set(alpha, fullPath);
                }
              }
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
      return this.rulesCache.get('704_qa24') || this.rulesCache.get('704qa24') || null;
    }
    const cleanId = clientId.toLowerCase();
    const cleanAlpha = cleanId.replace(/[^a-z0-9]/g, '');
    return this.rulesCache.get(cleanId) || this.rulesCache.get(cleanAlpha) || this.rulesCache.get('704_qa24') || null;
  }

  public getClientSettings(clientId?: string): ClientSettings {
    return this.getRules(clientId)?.client_settings || {};
  }

  public isEuDealer(clientId: string | undefined, text: string): boolean {
    if (!text) return false;
    const dealers = this.getClientSettings(clientId).eu_dealers || [];
    const lower = text.toLowerCase();
    return dealers.some(d => d.length >= 4 && lower.includes(d.toLowerCase()));
  }

  public isOwner(clientId: string | undefined, text: string): boolean {
    if (!text) return false;
    const owners = this.getClientSettings(clientId).owners || [];
    const lower = text.toLowerCase();
    return owners.some(o => o.length >= 4 && lower.includes(o.toLowerCase()));
  }

  public isForeignClient(clientId: string | undefined, text: string): boolean {
    if (!text) return false;
    const keywords = this.getClientSettings(clientId).foreign_client_keywords || [];
    const lower = text.toLowerCase();
    return keywords.some(k => k.length >= 4 && lower.includes(k.toLowerCase()));
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
      try {
        const regex = new RegExp(`(?:^|[^a-zäöüß0-9])(${r.pattern})(?:$|[^a-zäöüß0-9])`, 'i');
        if (regex.test(lower)) {
          if (r.min_amount !== undefined && amount < r.min_amount) continue;
          if (r.max_amount !== undefined && amount > r.max_amount) continue;
          return {
            account: r.account,
            buCode: r.bu_code || '',
          };
        }
      } catch {
        if (lower.includes(r.pattern.toLowerCase())) {
          return { account: r.account, buCode: r.bu_code || '' };
        }
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

  private persistRules(clientId?: string): void {
    const rules = this.getRules(clientId);
    if (!rules) return;
    const key = (clientId || rules.client_id || '704_qa24').toLowerCase();
    const fp =
      this.filePaths.get(key) ||
      this.filePaths.get('704_qa24') ||
      'C:/Users/sh/Desktop/fintax_project-main/fintax_project-main/storage/rules/704_QA24.json';
    try {
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, JSON.stringify(rules, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[ClientRules] Failed to persist rules:', e?.message);
    }
  }

  public saveVinRule(clientId: string | undefined, vin: string, taxKey: '8193' | '8400' | '8125' | '3200', meta?: { model?: string; customer?: string }): void {
    const rules = this.getRules(clientId);
    if (!rules || !vin || vin.length < 7) return;
    rules.vehicle_registry = rules.vehicle_registry || {};
    rules.vehicle_registry[vin.toUpperCase()] = {
      tax_key: taxKey,
      model: meta?.model,
      customer: meta?.customer,
      regime: taxKey === '8193' ? 'margin_25a' : taxKey === '8125' ? 'eu_b2b_0' : 'regular_19',
    };
    this.persistRules(clientId);
  }

  public savePayeeRule(clientId: string | undefined, payee: string, taxKey: '8193' | '8400' | '8125' | '3200'): void {
    const rules = this.getRules(clientId);
    if (!rules || !payee || payee.trim().length < 4) return;
    rules.payee_tax_mappings = rules.payee_tax_mappings || {};
    rules.payee_tax_mappings[payee.toLowerCase().trim()] = taxKey;
    this.persistRules(clientId);
  }

  public saveVendorRule(clientId: string | undefined, pattern: string, account: string, buCode: string): void {
    const rules = this.getRules(clientId);
    if (!rules || !pattern || pattern.trim().length < 4) return;
    const escaped = pattern.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rules.vendor_account_rules = rules.vendor_account_rules || [];
    const existing = rules.vendor_account_rules.find((r) => r.pattern === escaped);
    if (existing) {
      existing.account = account;
      existing.bu_code = buCode;
    } else {
      rules.vendor_account_rules.unshift({ pattern: escaped, account, bu_code: buCode });
    }
    this.persistRules(clientId);
  }
}

export const clientRulesService = new ClientRulesService();
