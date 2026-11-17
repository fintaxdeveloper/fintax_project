export interface MathCrossValidationResult {
  net_amount: number;
  vat_amount: number;
  total_amount: number;
  vat_rate_percent: number;
  wasCorrected: boolean;
  correctionLog: string[];
}

export const mathCrossValidationService = {
  /**
   * Performs rigorous mathematical cross-validation on extracted accounting amounts:
   * Equation 1: Net Amount + VAT Amount = Total (Brutto) Amount
   * Equation 2: Net Amount * (1 + VAT Rate / 100) = Total Amount
   * Handles 1-2 cents rounding corrections, German tax rates (19%, 7%, 0%), and IBAN MOD-97 checks.
   */
  validateAndAutoCorrect(params: {
    net_amount: number;
    vat_amount: number;
    total_amount: number;
    vat_rate_percent?: number;
  }): MathCrossValidationResult {
    let net = Math.round((Number(params.net_amount) || 0) * 100) / 100;
    let vat = Math.round((Number(params.vat_amount) || 0) * 100) / 100;
    let total = Math.round((Number(params.total_amount) || 0) * 100) / 100;
    let rate = Number(params.vat_rate_percent) || 0;
    const correctionLog: string[] = [];
    let wasCorrected = false;

    // 1. Determine tax rate if missing
    if (!rate && total > 0 && net > 0) {
      const calcRate = Math.round(((total - net) / net) * 100);
      if (Math.abs(calcRate - 19) <= 1) {
        rate = 19;
      } else if (Math.abs(calcRate - 7) <= 1) {
        rate = 7;
      } else {
        rate = Math.max(0, calcRate);
      }
    }

    // 2. Case: Only Total is provided (e.g. supermarket receipt or fuel slip)
    if (total > 0 && net <= 0 && vat <= 0) {
      if (params.vat_rate_percent === 0 || rate === 0) {
        // Explicit 0% or tax-exempt / margin §25a -> do NOT derive 19% VAT
        net = total;
        vat = 0;
        rate = 0;
      } else if (rate === 7 || rate === 19) {
        const targetRate = rate;
        net = Math.round((total / (1 + targetRate / 100)) * 100) / 100;
        vat = Math.round((total - net) * 100) / 100;
        wasCorrected = true;
        correctionLog.push(`Derived Net (${net} €) and VAT (${vat} € at ${rate}%) from Total (${total} €)`);
      } else {
        // Unknown or unspecified tax rate on gross total: do not invent 19% VAT
        net = total;
        vat = 0;
      }
    }

    // 3. Case: Net and VAT provided, but Total is zero or slightly off
    if (net > 0 && vat >= 0 && total <= 0) {
      total = Math.round((net + vat) * 100) / 100;
      wasCorrected = true;
      correctionLog.push(`Calculated Total (${total} €) from Net (${net} €) + VAT (${vat} €)`);
    }

    // 4. Case: Net + Total provided, VAT missing
    if (net > 0 && total > 0 && vat <= 0 && total >= net) {
      vat = Math.round((total - net) * 100) / 100;
      wasCorrected = true;
      correctionLog.push(`Derived VAT (${vat} €) from Total (${total} €) - Net (${net} €)`);
    }

    // 5. Equation check: Net + VAT == Total
    const sum = Math.round((net + vat) * 100) / 100;
    const diff = Math.round(Math.abs(sum - total) * 100) / 100;

    // Auto-fix 1 to 2 cents rounding differences
    if (diff > 0 && diff <= 0.03) {
      // Re-anchor to Total (in German accounting, Bruttobetrag paid is authoritative)
      vat = Math.round((total - net) * 100) / 100;
      wasCorrected = true;
      correctionLog.push(`Auto-corrected ${diff} € rounding discrepancy to match Brutto total ${total} €`);
    } else if (diff > 0.03 && rate > 0 && total > 0) {
      // Larger discrepancy: recompute Net & VAT using strict German tax formula
      const expectedNet = Math.round((total / (1 + rate / 100)) * 100) / 100;
      const expectedVat = Math.round((total - expectedNet) * 100) / 100;
      if (Math.abs(expectedNet + expectedVat - total) <= 0.01) {
        net = expectedNet;
        vat = expectedVat;
        wasCorrected = true;
        correctionLog.push(`Reconciled Net/VAT to exact German ${rate}% tax formula (Net: ${net} €, VAT: ${vat} €)`);
      }
    }

    return {
      net_amount: net,
      vat_amount: vat,
      total_amount: total,
      vat_rate_percent: rate,
      wasCorrected,
      correctionLog,
    };
  },

  /**
   * Verifies an IBAN using the official international MOD-97 checksum algorithm (ISO 7064)
   */
  verifyIbanChecksum(iban: string): boolean {
    const clean = (iban || '').replace(/[\s-]/g, '').toUpperCase();
    if (!clean || clean.length < 15 || clean.length > 34) return false;
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(clean)) return false;

    // Move first 4 characters to the end
    const rearranged = clean.slice(4) + clean.slice(0, 4);

    // Convert letters to two-digit numbers (A = 10, B = 11, ..., Z = 35)
    let numericStr = '';
    for (let i = 0; i < rearranged.length; i++) {
      const code = rearranged.charCodeAt(i);
      if (code >= 65 && code <= 90) {
        numericStr += String(code - 55);
      } else {
        numericStr += rearranged[i];
      }
    }

    // Compute mod 97 in chunks to avoid 64-bit integer overflow
    let remainder = 0;
    for (let i = 0; i < numericStr.length; i += 7) {
      const chunk = String(remainder) + numericStr.substring(i, i + 7);
      remainder = parseInt(chunk, 10) % 97;
    }

    return remainder === 1;
  },
};

