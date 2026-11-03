export const maskingService = {
  /**
   * Masks German or International IBAN
   * Example: DE89 3704 0044 0532 0130 00 -> DE89 **** **** **** **30 00
   */
  maskIban(iban?: string): string {
    if (!iban || iban.trim().length < 8) return iban || '';
    const clean = iban.replace(/\s+/g, '');
    const prefix = clean.substring(0, 4);
    const suffix = clean.substring(clean.length - 4);
    return `${prefix} **** **** **** **${suffix}`;
  },

  /**
   * Masks UAE Emirates ID (Standard: 784-YYYY-XXXXXXX-Z)
   * Example: 784-1985-1234567-1 -> 784-****-*****67-1
   */
  maskEmiratesId(id?: string): string {
    if (!id || id.trim().length < 8) return id || '';
    const parts = id.split('-');
    if (parts.length === 4) {
      return `${parts[0]}-****-****${parts[2].slice(-2)}-${parts[3]}`;
    }
    const clean = id.replace(/[^0-9]/g, '');
    if (clean.length >= 15) {
      return `784-****-****${clean.slice(-3, -1)}-${clean.slice(-1)}`;
    }
    return `${id.substring(0, 3)}****${id.slice(-2)}`;
  },

  /**
   * Masks Passport number
   * Example: C48920194 -> C4*****94
   */
  maskPassport(passport?: string): string {
    if (!passport || passport.trim().length < 5) return passport || '';
    const clean = passport.trim();
    return `${clean.substring(0, 2)}*****${clean.substring(clean.length - 2)}`;
  },

  /**
   * Masks Tax ID (Steuernummer or USt-IdNr)
   * Example: DE123456789 -> DE***56789
   */
  maskTaxId(taxId?: string): string {
    if (!taxId || taxId.trim().length < 6) return taxId || '';
    const clean = taxId.trim();
    const prefix = clean.substring(0, 2);
    const suffix = clean.substring(clean.length - 4);
    return `${prefix}***${suffix}`;
  },
};
