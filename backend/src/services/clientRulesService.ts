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
  client_ids?: string[];
  mandanten_nr?: string;
  berater_name?: string;
  company_name?: string;
  own_issuer_keywords?: string[];
  supplier_headers?: Record<string, string>;
  owners?: string[];
  eu_dealers?: string[];
  foreign_client_keywords?: string[];
  private_account?: string;
  private_deposit_account?: string;
}

export interface ClientRules {
  client_id: string;
  client_aliases?: string[];
  client_settings?: ClientSettings;
  client_name?: string;
  chart_of_accounts?: string;
  industry?: string;
  business_type?: 'restaurant' | 'car_dealer' | string;
  legal_form?: 'Einzelunternehmer' | 'GmbH' | 'UG' | string;
  mandant_nr?: string;
  tax_mode?: 'Ist' | 'Soll' | string;
  private_keywords?: string[];
  vehicle_registry?: Record<string, VehicleRule>;
  payee_tax_mappings?: Record<string, '8193' | '8400' | '8125' | '3200'>;
  vendor_account_rules?: VendorAccountRule[];
  starting_balances?: Record<string, Record<string, number>>;
  stammkapital?: { total: number; account: string };
}

class ClientRulesService {
  private rulesCache: Map<string, ClientRules> = new Map();
  private filePaths: Map<string, string> = new Map();
  private loaded = false;
  private rulesDirCandidates: string[] = [
    ...(process.env.FINTAX_STORAGE_DIR ? [path.resolve(process.env.FINTAX_STORAGE_DIR, 'rules')] : []),
    path.resolve(process.cwd(), 'storage/rules'),
    path.resolve(process.cwd(), '../storage/rules'),
    path.resolve(process.cwd(), '../../storage/rules'),
  ];
  private lastRulesMtime = 0;

  constructor() {
    this.reloadAllRules();
  }

  public getRulesDir(): string | null {
    return this.rulesDirCandidates.find((d) => fs.existsSync(d)) || null;
  }

  public checkRulesFreshness(): void {
    const dir = this.getRulesDir();
    if (!dir || !fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      let maxMtime = 0;
      for (const f of files) {
        const stat = fs.statSync(path.join(dir, f));
        if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
      }
      if (maxMtime > this.lastRulesMtime) {
        this.lastRulesMtime = maxMtime;
        this.reloadAllRules(true);
      }
    } catch {
      // ignore
    }
  }

  public reloadAllRules(force = false): void {
    if (this.loaded && !force) return;
    this.loaded = true;
    this.rulesCache.clear();
    this.filePaths.clear();
    const clientIdToFile: Map<string, string> = new Map();

    const dir = this.getRulesDir();
    if (!dir) return;

    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const rules: ClientRules = JSON.parse(content);
        const key = rules.client_id || path.basename(file, '.json');
        const keysToMap = Array.from(
          new Set([key, ...(rules.client_aliases || []), ...(rules.client_settings?.client_ids || [])])
        );

        for (const k of keysToMap) {
          const lower = k.toLowerCase();
          const alpha = lower.replace(/[^a-z0-9]/g, '');

          const existingLowerFile = clientIdToFile.get(lower);
          const existingAlphaFile = clientIdToFile.get(alpha);
          if (
            (existingLowerFile && existingLowerFile !== fullPath) ||
            (existingAlphaFile && existingAlphaFile !== fullPath)
          ) {
            const conflictingFile =
              existingLowerFile && existingLowerFile !== fullPath ? existingLowerFile : existingAlphaFile!;
            throw new Error(
              `[ClientRules] Conflict: client_id "${k}" in ${file} is already mapped by ${path.basename(conflictingFile)}`
            );
          }

          clientIdToFile.set(lower, fullPath);
          clientIdToFile.set(alpha, fullPath);
          this.rulesCache.set(lower, rules);
          this.rulesCache.set(alpha, rules);
          this.filePaths.set(lower, fullPath);
          this.filePaths.set(alpha, fullPath);
        }
        console.log(`[ClientRules] Loaded ${file} -> client_ids: [${keysToMap.join(', ')}]`);
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith('[ClientRules] Conflict:')) {
        throw err;
      }
      console.warn(`[ClientRules] Error loading rules from ${dir}:`, err.message);
    }
  }

  /**
   * Returns ONLY the rules explicitly mapped to this client (via client_id, client_aliases or client_settings.client_ids).
   * No cross-client fallback: a client without its own rules file gets null (never another client's rules).
   */
  public getRules(clientId?: string): ClientRules | null {
    if (!clientId) return null;
    const cleanId = clientId.toLowerCase();
    const cleanAlpha = cleanId.replace(/[^a-z0-9]/g, '');
    return this.rulesCache.get(cleanId) || this.rulesCache.get(cleanAlpha) || null;
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
  public getStammkapital(clientId: string | undefined): { total: number; account: string } | null {
    const s = this.getRules(clientId)?.stammkapital;
    if (!s || !(Number(s.total) > 0) || !s.account) return null;
    return { total: Number(s.total), account: String(s.account) };
  }

  public getStartingBalance(clientId: string | undefined, year: number, account: string): number | null {
    const rules = this.getRules(clientId);
    if (!rules || !rules.starting_balances) return null;

    const yStr = String(year);
    if (rules.starting_balances[yStr] && rules.starting_balances[yStr][account] !== undefined) {
      return rules.starting_balances[yStr][account];
    }
    return null;
  }

  /**
   * Returns this client's own rules, creating an empty rules object (own file) on first save.
   * Never borrows another client's rules.
   */
  private ensureRules(clientId?: string): ClientRules | null {
    if (!clientId) return null;
    const existing = this.getRules(clientId);
    if (existing) return existing;
    const fresh: ClientRules = { client_id: clientId, client_settings: { client_ids: [clientId] } };
    const lower = clientId.toLowerCase();
    const safeName = clientId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const defaultRulesDir = this.getRulesDir() || path.resolve(process.cwd(), '../storage/rules');
    this.rulesCache.set(lower, fresh);
    this.filePaths.set(lower, path.join(defaultRulesDir, `${safeName}.json`));
    return fresh;
  }

  private persistRules(clientId?: string): void {
    const rules = this.getRules(clientId);
    if (!rules || !clientId) return;
    const key = clientId.toLowerCase();
    const defaultRulesDir = this.getRulesDir() || path.resolve(process.cwd(), '../storage/rules');
    const fp =
      this.filePaths.get(key) ||
      this.filePaths.get(key.replace(/[^a-z0-9]/g, '')) ||
      path.join(defaultRulesDir, `${(rules.client_id || clientId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    try {
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, JSON.stringify(rules, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[ClientRules] Failed to persist rules:', e?.message);
    }
  }

  public saveVinRule(clientId: string | undefined, vin: string, taxKey: '8193' | '8400' | '8125' | '3200', meta?: { model?: string; customer?: string }): void {
    const rules = this.ensureRules(clientId);
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
    // A "Remember vendor" rule may never default to 3200 (vehicle purchases are per-VIN/contract)
    if (taxKey === '3200') return;
    const rules = this.ensureRules(clientId);
    if (!rules || !payee || payee.trim().length < 4) return;
    rules.payee_tax_mappings = rules.payee_tax_mappings || {};
    rules.payee_tax_mappings[payee.toLowerCase().trim()] = taxKey;
    this.persistRules(clientId);
  }

  public saveVendorRule(clientId: string | undefined, pattern: string, account: string, buCode: string): void {
    // A "Remember vendor" rule may never default to 3200
    if (account === '3200') return;
    const rules = this.ensureRules(clientId);
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
