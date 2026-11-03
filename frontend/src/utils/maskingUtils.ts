/**
 * GDPR & Data Protection Masking Utilities (Frontend)
 * Per FinTax specification & German DSGVO guidelines.
 */

export const maskIban = (iban?: string): string => {
  if (!iban || iban.trim().length < 8) return iban || '';
  const clean = iban.replace(/\s+/g, '');
  const prefix = clean.substring(0, 4);
  const suffix = clean.substring(clean.length - 4);
  return `${prefix} •••• •••• •••• ••${suffix}`;
};

export const maskTaxId = (taxId?: string): string => {
  if (!taxId || taxId.trim().length < 6) return taxId || '';
  const clean = taxId.trim();
  const prefix = clean.substring(0, 2);
  const suffix = clean.substring(clean.length - 4);
  return `${prefix}••••••${suffix}`;
};

export const maskEmiratesId = (id?: string): string => {
  if (!id || id.trim().length < 8) return id || '';
  const parts = id.split('-');
  if (parts.length === 4) {
    return `${parts[0]}-••••-••••${parts[2].slice(-2)}-${parts[3]}`;
  }
  const clean = id.replace(/[^0-9]/g, '');
  if (clean.length >= 15) {
    return `784-••••-••••${clean.slice(-3, -1)}-${clean.slice(-1)}`;
  }
  return `${id.substring(0, 3)}••••${id.slice(-2)}`;
};

export const maskPassport = (passport?: string): string => {
  if (!passport || passport.trim().length < 5) return passport || '';
  const clean = passport.trim();
  return `${clean.substring(0, 2)}•••••${clean.substring(clean.length - 2)}`;
};
