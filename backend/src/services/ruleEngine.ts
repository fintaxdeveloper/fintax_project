/**
 * ONE PLACE FOR RULES
 * -------------------
 * Every account decision (Gegenkonto + BU-Schlüssel) of the whole system is made in
 * `decideAccount()` – nowhere else. Callers (bank statement parser, export normalisation)
 * only collect facts (text, amount, matched Beleg, month context) and apply the result.
 *
 * Fixed order:
 *   a) Beleg taxClause      (invoice §25a → 8193, EU → 8125, 19% → 8400)
 *   b) special rules        (Stammkapital / company formation, loans)
 *   c) owner rule           → 0730, ONLY for debits (money going out)
 *   d) vendor rules         (client rules JSON, then the generic vendor / keyword rules)
 *   e) nothing matched      → review question (never guess)
 *
 * Direction: `sh` is the side on the bank/cash account. 'S' = money comes in, 'H' = money goes out.
 * No customer, VIN or amount of a real document may be hard-coded here – client data lives in
 * storage/rules/<client>.json.
 */
import { clientRulesService } from './clientRulesService.js';
import { supplierMemoryService } from './supplierMemoryService.js';
import { skr03Mapper } from './skr03Mapper.js';
import { extractVinFromText, areVinsFuzzyEqual } from './belegIndexService.js';

export type RuleStep = 'a-beleg' | 'b-special' | 'c-owner' | 'd-vendor' | 'e-review';
export type ReviewKind = 'VIN_SALE' | 'UNKNOWN' | 'STAMMKAPITAL' | 'MISSING_BELEG_INCOMING';

/** Accounts that never carry a BU key (no automatic input/output VAT). */
export const NO_BU_ACCOUNTS = new Set([
  '1200', '1000', '1360', '1410', '0730', '0800', '1800', '1890', '3200', '4970', '8193', '8125',
  '4520', '4510', '4910', '4390', '4210',
]);

export interface BelegEvidence {
  type?: string;
  taxClause?: string | null;
  skr03Account?: string | null;
  buCode?: string | null;
  partner?: string | null;
  vin?: string | null;
  invoiceNo?: string | null;
  id?: string;
  matchedBy?: string;
}

export interface TaxMaps {
  vin: Map<string, string>;
  invoice: Map<string, string>;
  payee: Map<string, string>;
}

export interface StammkapitalContext {
  /** Statement holder is a company in formation ("i.Gr.") */
  holderInGruendung: boolean;
  /** First credit of the statement and the opening balance is 0,00 */
  isFirstCreditAfterZeroOpening: boolean;
  /** Sum already booked on the capital account (earlier months + earlier lines of this month) */
  earlierBooked: number;
}

export interface MonthLinks {
  purchaseVins: Set<string>;
  purchasePayee: Map<string, string>;
  salePayee: Map<string, string>;
}

export interface RuleInput {
  clientId?: string;
  /** 'parse' = first classification of a bank line; 'normalize' = re-decision before export */
  phase: 'parse' | 'normalize';
  konto: string;
  sh: 'S' | 'H';
  amount: number;
  text: string;
  belegfeld1?: string;
  txType?: string;
  counterparty?: string;
  purpose?: string;
  currentAccount?: string;
  beleg?: BelegEvidence | null;
  taxMaps?: TaxMaps;
  stammkapital?: StammkapitalContext;
  links?: MonthLinks;
}

export interface RuleDecision {
  account: string;
  buCode: string;
  step: RuleStep;
  reason: string;
  needsReview: boolean;
  reviewKind?: ReviewKind;
  question?: string;
  linkedPayee?: string;
}

// ───────────────────────── shared helpers (used by callers, too) ─────────────────────────

export const normalizeKey = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const extractPayeePrefix = (text: string): string => {
  const beforeDash = (text || '').split(/\s+-\s+|\s+PN:|\s{2,}/)[0].toLowerCase().replace(/[^a-zäöüß0-9\s]/gi, ' ').trim();
  const legalStop = /^(gmbh|mbh|ug|ag|kg|ohg|gbr|unipessoal|lda|ltda|sarl|srl|sas|bv|nv|oy|ab|aps|inc|llc|co|ltd|firma|herr|frau)$/;
  const words = beforeDash.split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !legalStop.test(w));
  return words.slice(0, 2).join(' ');
};

const vinRegex = /(?<![A-Z0-9])([A-HJ-NPR-Z]{2,3}[A-HJ-NPR-Z0-9]{8,9}\d{5,6})(?![0-9])/g;
export const extractAllVins = (s: string): string[] => {
  const set = new Set<string>();
  const v = extractVinFromText(s);
  if (v) set.add(v);
  const cleaned = (s || '')
    .toUpperCase()
    .replace(/\bIBAN\s*[:.]?\s*[A-Z]{2}\s*\d{2}(?:\s*[A-Z0-9]){11,30}/g, ' ')
    .replace(/\b[A-Z]{2}\d{2}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,4}\b/g, ' ')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, (m) => (m.length !== 17 || /^[A-Z]{2}\d{15}$/.test(m) ? ' ' : m));
  const m = cleaned.match(vinRegex);
  if (m) {
    m.forEach((x) => {
      if (!/^[A-Z]{2}\d{15}$/.test(x) && !/^DE\d{8}/.test(x)) set.add(x);
    });
  }
  return [...set];
};

const hasVin = (text: string): boolean => {
  const cleaned = (text || '')
    .toUpperCase()
    .replace(/\bIBAN\s*[:.]?\s*[A-Z]{2}\s*\d{2}(?:\s*[A-Z0-9]){11,30}/g, ' ')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, ' ')
    .replace(/\bEREF\s*[:.]?\s*[A-Z0-9]{12,40}/g, ' ')
    .replace(/\bGIROPAY\d+/g, ' ');
  return (
    Boolean(extractVinFromText(cleaned)) ||
    /(?<![A-Z0-9])[A-HJ-NPR-Z1-57][A-HJ-NPR-Z]{1,2}[A-HJ-NPR-Z0-9]{8,9}\d{5,6}(?![0-9])/i.test(cleaned)
  );
};

const SALE_ACCOUNTS = ['8193', '8400', '8125'];
const CARD_FEE_WORDS = /debitkarte|bankcard|kreditkarte|kartengebühr|depotgebühr|kontoführung/i;

type Tax = '8193' | '8400' | '8125';

// ───────────────────────── step a: Beleg taxClause ─────────────────────────

function stepA(inp: RuleInput, txt: string): RuleDecision | null {
  if (inp.sh !== 'S' || (inp.konto !== '1200' && inp.konto !== '1000')) return null;
  const clientId = inp.clientId;
  const rules = clientRulesService.getRules(clientId);
  if (rules?.business_type && rules.business_type !== 'car_dealer') return null;
  const r = inp.beleg || null;

  // a1) matched sales Beleg with a tax clause is FINAL
  if (r) {
    const isSale = r.type === 'QA24_SALE' || r.type === 'CONTRACT' || r.skr03Account === '8193' || r.skr03Account === '8125';
    if (isSale && (r.taxClause === '25a' || r.taxClause === 'EU' || r.taxClause === '19' || r.skr03Account)) {
      const acc: Tax =
        r.taxClause === 'EU' || r.skr03Account === '8125' || clientRulesService.isEuDealer(clientId, `${r.partner || ''} ${inp.text}`)
          ? '8125'
          : r.taxClause === '25a' || r.skr03Account === '8193'
          ? '8193'
          : '8400';
      return {
        account: acc, buCode: '', step: 'a-beleg', needsReview: false,
        reason: `matched ${r.type || 'sales'} Beleg ${r.id || ''} with taxClause '${r.taxClause || 'none'}'`,
      };
    }
  }

  // In normalize phase only sale-like lines are examined (avoid payee-name false positives on refunds, fees ...)
  const saleLike =
    inp.phase === 'parse' ||
    SALE_ACCOUNTS.includes(inp.currentAccount || '') ||
    inp.currentAccount === '4900' ||
    hasVin(txt);
  if (!saleLike) return null;

  const maps = inp.taxMaps;
  const upperTxt = txt.toUpperCase();
  const vins = extractAllVins(upperTxt);
  let tax: Tax | undefined;
  let why = '';

  if (clientRulesService.isEuDealer(clientId, txt)) { tax = '8125'; why = 'EU dealer registry'; }

  if (!tax && vins.length > 0) {
    for (const vin of vins) {
      let acc = maps?.vin.get(vin) || (clientRulesService.lookupVin(clientId, vin)?.taxKey as string | undefined);
      if (!acc && maps) {
        for (const [kVin, kAcc] of maps.vin.entries()) {
          if (areVinsFuzzyEqual(vin, kVin, 2)) {
            acc = kAcc;
            break;
          }
        }
      }
      if (acc && acc !== '3200') { tax = acc as Tax; why = `VIN ${vin} mapped to ${acc}`; break; }
    }
  }
  if (!tax) {
    const words = upperTxt.split(/[^A-Z0-9]/).filter((w) => w.length >= 6 && w.length <= 10 && /\d/.test(w) && /[A-Z]/.test(w));
    for (const w of words) {
      const m = clientRulesService.lookupVin(clientId, w);
      if (m && m.taxKey !== '3200') { tax = m.taxKey as Tax; why = `short VIN ${w} mapped to ${m.taxKey}`; break; }
    }
  }
  if (!tax && r) {
    if (r.taxClause === 'EU' || r.skr03Account === '8125' || clientRulesService.isEuDealer(clientId, r.partner || '')) { tax = '8125'; why = 'Beleg taxClause EU'; }
    else if (r.taxClause === '25a' || (r.type === 'QA24_PURCHASE' && r.taxClause !== '19') || r.skr03Account === '8193') { tax = '8193'; why = 'Beleg taxClause 25a'; }
    else if (r.taxClause === '19') { tax = '8400'; why = 'Beleg taxClause 19%'; }
    else if (r.vin && maps?.vin.has(r.vin.toUpperCase())) { tax = maps.vin.get(r.vin.toUpperCase()) as Tax; why = `Beleg VIN ${r.vin} purchase map`; }
  }
  if (!tax) {
    const payee = extractPayeePrefix(inp.text);
    if (payee && maps?.payee.has(payee)) { tax = maps.payee.get(payee) as Tax; why = `payee prefix ${payee}`; }
    else {
      const rule = clientRulesService.lookupPayee(clientId, txt);
      if (rule && rule !== '3200') { tax = rule as Tax; why = `payee rule ${rule}`; }
      else if (maps) {
        for (const [pKey, acc] of maps.payee.entries()) {
          if (pKey.length >= 4 && txt.includes(pKey)) { tax = acc as Tax; why = `payee match ${pKey}`; break; }
        }
      }
    }
  }
  if (!tax && maps) {
    const invMatch = inp.text.match(/(?:rechnungsnummer|rechnung|rg|rn|beleg)[:\s]*([a-z0-9/-]+)/i);
    const rawInv = invMatch ? invMatch[1] : inp.belegfeld1;
    if (rawInv && maps.invoice.has(normalizeKey(rawInv))) { tax = maps.invoice.get(normalizeKey(rawInv)) as Tax; why = `invoice number ${normalizeKey(rawInv)}`; }
  }
  if (!tax) {
    if (/(differenzbesteuerung|25a|gebrauchtgegenst|sonderregelung|differenzbesteuert)/i.test(txt)) { tax = '8193'; why = 'keyword §25a'; }
    else if (/(innergemeinschaftliche|eu-lieferung|steuerfrei\s*§?\s*4|ig\.?\s*lieferung)/i.test(txt)) { tax = '8125'; why = 'keyword EU-Lieferung'; }
  }
  if (tax) return { account: tax, buCode: '', step: 'a-beleg', reason: why, needsReview: false };
  return null;
}

// ───────────────────────── step b: special rules ─────────────────────────

function stepB(inp: RuleInput, lower: string): RuleDecision | null {
  const clientId = inp.clientId;
  const rules = clientRulesService.getRules(clientId);
  const isEinzel = rules?.legal_form === 'Einzelunternehmer';

  // Einzelunternehmer: private keywords always go to 1800 (Privatentnahme) / 1890 (Privateinlage)
  if (isEinzel) {
    const privWithdrawAcc = rules?.client_settings?.private_account || '1800';
    const privDepositAcc = rules?.client_settings?.private_deposit_account || '1890';
    if (rules?.private_keywords?.some((kw) => kw && lower.includes(kw.toLowerCase()))) {
      return { account: inp.sh === 'S' ? privDepositAcc : privWithdrawAcc, buCode: '', step: 'b-special', needsReview: false, reason: 'Einzelunternehmer private keyword' };
    }
    if (inp.sh === 'S' && clientRulesService.isOwner(clientId, lower) && !/\b(lohn|gehalt)\b/i.test(lower) && !CARD_FEE_WORDS.test(lower)) {
      return { account: privDepositAcc, buCode: '', step: 'b-special', needsReview: false, reason: 'Einzelunternehmer owner credit (Privateinlage 1890)' };
    }
  }

  const cfg = clientRulesService.getStammkapital(clientId);
  const capitalAccount = cfg?.account || '0800';

  if (inp.sh === 'S' && /stammkapital|stammeinlage|kapitaleinzahlung|gründungskapital|gesellschaftsvertrag/i.test(lower)) {
    return { account: capitalAccount, buCode: '', step: 'b-special', needsReview: false, reason: 'capital keyword in text' };
  }

  // Credit from an owner on the bank: capital contribution or private deposit
  if (
    inp.sh === 'S' && inp.konto === '1200' &&
    clientRulesService.isOwner(clientId, lower) &&
    !/\b(lohn|gehalt)\b/i.test(lower) && !CARD_FEE_WORDS.test(lower)
  ) {
    const sk = inp.stammkapital;
    if (sk?.holderInGruendung) {
      return { account: capitalAccount, buCode: '', step: 'b-special', needsReview: false, reason: 'owner credit, statement holder is "i.Gr."' };
    }
    if (sk?.isFirstCreditAfterZeroOpening) {
      return { account: capitalAccount, buCode: '', step: 'b-special', needsReview: false, reason: 'owner credit = first credit after opening balance 0' };
    }
    if (cfg && sk && inp.amount + sk.earlierBooked <= cfg.total + 0.005) {
      return {
        account: capitalAccount, buCode: '', step: 'b-special', needsReview: false,
        reason: `owner credit ${inp.amount.toFixed(2)} + earlier ${sk.earlierBooked.toFixed(2)} <= Stammkapital ${cfg.total.toFixed(2)}`,
      };
    }
    return {
      account: '0730', buCode: '', step: 'b-special', needsReview: true, reviewKind: 'STAMMKAPITAL',
      question: `Stammkapital ${capitalAccount} oder Privateinlage 0730?`,
      reason: 'owner credit, capital limit exceeded or unknown → question',
    };
  }

  if (/\b(darlehen|kredit)\b/i.test(lower)) {
    return { account: '1520', buCode: '', step: 'b-special', needsReview: false, reason: 'loan keyword' };
  }
  return null;
}

// ───────────────────────── step c: owner (debits only) ─────────────────────────

function stepC(inp: RuleInput, lower: string): RuleDecision | null {
  if (inp.sh !== 'H') return null; // money coming in from an owner is never decided here
  if (!clientRulesService.isOwner(inp.clientId, lower)) return null;
  if (/\b(lohn|gehalt|stammkapital|stammeinlage)\b/i.test(lower) || CARD_FEE_WORDS.test(lower)) return null;
  const rules = clientRulesService.getRules(inp.clientId);
  const acc = rules?.legal_form === 'Einzelunternehmer' ? (rules.client_settings?.private_account || '1800') : '0730';
  return { account: acc, buCode: '', step: 'c-owner', needsReview: false, reason: 'owner rule (debit)' };
}

// ───────────────────────── step d: vendor rules ─────────────────────────

function tryLinks(inp: RuleInput, lower: string): RuleDecision | null {
  const links = inp.links;
  if (!links) return null;
  const vins = extractAllVins(`${inp.text} ${inp.belegfeld1 || ''}`);
  if (inp.sh === 'H' && vins.some((v) => links.purchaseVins.has(v))) {
    return { account: '3200', buCode: '', step: 'd-vendor', needsReview: false, reason: 'same VIN as an earlier vehicle purchase this month' };
  }
  if (/\b(rest|restzahlung|restbetrag|anzahlung|teil\s*\d+)\b/i.test(lower)) {
    const prefix = extractPayeePrefix(inp.text);
    if (prefix) {
      if (inp.sh === 'H' && links.purchasePayee.has(prefix)) {
        return { account: links.purchasePayee.get(prefix)!, buCode: '', step: 'd-vendor', needsReview: false, reason: `follow-up payment to same payee ${prefix}` };
      }
      if (inp.sh === 'S' && links.salePayee.has(prefix)) {
        return { account: links.salePayee.get(prefix)!, buCode: '', step: 'd-vendor', needsReview: false, reason: `follow-up payment from same buyer ${prefix}`, linkedPayee: prefix };
      }
    }
  }
  return null;
}

function stepD(inp: RuleInput, lower: string): RuleDecision | null {
  const { sh, amount, clientId } = inp;
  const counterparty = inp.counterparty ?? inp.text.split(/\s+-\s+/)[0].trim();
  const purpose = inp.purpose ?? '';
  const txType = inp.txType ?? inp.text;
  const combined = inp.text;
  const hasVinInText = hasVin(combined);
  const isBank = inp.konto === '1200';
  const ok = (account: string, buCode: string, reason: string): RuleDecision =>
    ({ account, buCode, step: 'd-vendor', reason, needsReview: false });

  const isCostRefund =
    sh === 'S' && /(storno|rückbuchung|rueckbuchung|rückerstattung|rueckerstattung|erstattung)/i.test(lower) &&
    /\b(fintax|steuerberat|rechtsanwalt|fibu|buchhaltung)\b/i.test(lower);
  if (isCostRefund) return ok('4955', '9', 'refund of accounting/legal cost');

  if (/\b(arag|signal iduna|allianz|huk|axa|gothaer|provinzial|zurich|lvm|devk|continentale|barmenia|ergo|dkv|debeka|generali|vgh|helvetia|basler|kfz-versicherung|versicherung)\b/i.test(lower) && !/garantie/i.test(lower)) {
    return ok('4520', '', 'insurance');
  }

  const rules = clientRulesService.getRules(clientId);
  const isCarDealer = !rules?.business_type || rules.business_type === 'car_dealer';

  const isEuCarDealer = isCarDealer && clientRulesService.isEuDealer(clientId, lower);
  const isCustomerRefundOrStorno =
    isCarDealer &&
    sh === 'H' && (
      /(storno|rückzahlung|rueckzahlung|überzahlung|ueberzahlung|erstattung|widerruf|rückabwicklung|reklamation|refund)/i.test(lower) ||
      /(?:kaufvertrag|anzahlung|rechnung).*(?:storno|rückzahlung|rueckzahlung|überzahlung|ueberzahlung)/i.test(lower)
    );
  if (isCustomerRefundOrStorno) return ok(isEuCarDealer ? '3200' : '8400', '', 'customer refund / storno');

  if (isCarDealer && sh === 'S' && /\b(bank11|santander|bdk|autofinanzierung)\b/i.test(lower)) return ok('8400', '', 'car financing payout');
  if (isEuCarDealer && sh === 'S') return ok('8125', '', 'EU dealer registry (credit)');
  if (isEuCarDealer && sh === 'H') return ok('3200', '', 'EU dealer registry (debit)');
  if (isCarDealer && /\b(bank deutsches kraftfahrzeuggewerbe|bdk|toyota financial|santander consumer|akf bank|targo bank)\b/i.test(lower)) return ok('3200', '', 'financing payoff of purchased vehicle');

  const isUsedCarPurchase =
    isCarDealer &&
    sh === 'H' && (
      /\b(kauf tesla|kauf audi|kauf vw|kauf bmw|kauf pkw|fahrzeugankauf|ankaufvertrag|kaufvertrag)\b/i.test(lower) ||
      clientRulesService.lookupPayee(clientId, lower) === '3200' ||
      (/\b(kauf|anzahlung|restzahlung)\b/i.test(lower) && hasVinInText && amount >= 200) ||
      (isBank && hasVinInText && amount >= 500)
    );
  if (isUsedCarPurchase) return ok('3200', '', 'outgoing vehicle purchase payment');

  const isCashTransit =
    !hasVinInText &&
    !(/\bentgelt\b/i.test(lower) && amount < 25) &&
    !/bank11|finanzierung|darlehen|auszahlung fuer|auszahlung für/i.test(lower) && (
      /bar-auszahlung|auszahlung girocard|bareinzahlung|geldautomat\b|bargeldeinzahl\w*|sb\.?einzahlung|barauszahlung/i.test(txType) ||
      /bar-auszahlung|bareinzahlung|bargeldeinzahl\w*|sb\.?einzahlung|geldautomat\b/i.test(counterparty) ||
      /bar-auszahlung|bareinzahlung|bargeldeinzahl\w*|sb\.?einzahlung|geldautomat\b/i.test(lower) ||
      /crs weilbach|bad soden gaa|gaa \d/i.test(combined)
    );
  if (isCashTransit) return ok('1360', '', 'cash withdrawal / transit');

  if (isCarDealer && sh === 'S' && (/siehe anlage 1/i.test(lower) || /differenzbesteuerung/i.test(lower) || /25a/i.test(lower) || clientRulesService.lookupPayee(clientId, lower) === '8193')) {
    return ok('8193', '', '§25a keyword / payee rule');
  }

  const vRule = clientRulesService.matchVendorRule(clientId, lower, amount);
  if (vRule) return ok(vRule.account, vRule.buCode, 'client vendor rule');

  const isBankFeeVat =
    (/^siehe anlage/i.test(lower) || (/pn:905/i.test(lower) && !/abschluss/i.test(lower)) || /entgeltabrechnung/i.test(lower)) &&
    !/abschluss/i.test(lower) && amount < 25;
  if (isBankFeeVat) return ok('1576', '', 'VAT part of bank fees');
  const isBankFee =
    (
      /abschluss|abrechnung\s+\d{2}\.\d{2}\.\d{4}|kontoführung|bankgebühr|depotgebühr|jahrespreis|bankcard|debitkarte|kreditkarte|kartengebühr\b/i.test(txType.toLowerCase()) ||
      (/abschluss|abrechnung\s+\d{2}\.\d{2}\.\d{4}|kontoführung|bankgebühr|depotgebühr|jahrespreis|kartengebühr|(?:echtzeit-überweisung|auszahlung|geldautomat)\s+entgelt\b/i.test(lower) && amount < 150) ||
      (/^siehe anlage/i.test(lower) && amount < 150)
    ) && !/kauf|fahrzeug|pkw|auto|storno|rückzahlung|rechnung|anzahlung/i.test(lower);
  if (isBankFee) return ok('4970', '', 'bank fees');

  if (/\b(aral|shell|esso|total|jet|avia|omv|tank\s*stel\s*le|jank\s*stel\s*le|agip|bft|minera|kraftstoff|super\s*e1[0o]|diesel|benzin|schnellpflege|couche-tard|circle k|westfalen|star tankstelle|hem\b|sprint|sb-tank|selgros)\b/i.test(lower)) return ok('4530', '9', 'fuel');
  if (
    /\b(tüv|tuev|dekra|fsp|gtü|küs|hauptuntersuchung|hu\s*\/\s*au|fahrzeuguntersuchung|stvzo|garantie|gutachten|prüfstelle|prüfbericht|stahlgruber|autoteile|auto-teile|kfz-teile|ersatzteile|werkstatt|reparatur|autoglas|autoverglasung|frontscheibe|reifen[-\s]*\w*|remante|dastgir|instandsetzung|austauschgetriebe|austauschmotor|turbolader|steuergerät|vergölst|atu|olwechsel|ölwechsel|porsche zentrum|audi zentrum|bmw autohaus|mercedes-benz autohaus)\b/i.test(lower) ||
    (/\b(inspektion|wartung|service)\b/i.test(lower) && amount < 2000)
  ) {
    return ok('4540', /garantie|versicherung|allianz|huk|arag/i.test(lower) ? '' : '9', 'vehicle repair / inspection');
  }
  if (
    sh === 'H' &&
    /\b(logistics|logistik|spedition|fahrzeugtransport|fahrzeugüberführung|ueberfuehrung|fracht|transportkosten|bezugsnebenkosten)\b/i.test(lower)
  ) {
    return ok('3800', '9', 'vehicle transport / logistics (Bezugsnebenkosten)');
  }
  if (sh === 'S' && /(storno|rückbuchung|rueckbuchung|erstattung|refund|gutschrift)/i.test(lower) && /\bebay\b/i.test(lower)) return ok('4540', '9', 'refund of spare parts');
  if (/\b(ebay by adyen|ebay|klarna.*ebay|globus sbw|galaxus|baumarkt|hornbach|bauhaus|action deutschland|tedi\b)\b/i.test(lower)) return ok('4980', '9', 'operating supplies');
  if (/\b(penny|rewe|aldi|edeka|lidl|netto|kaufland)\b/i.test(lower) && amount < 500 && sh === 'H') return ok('4673', '8', 'groceries / small purchases');
  if (/\b(db\s+vertrieb|dz\s+bank-db\s+vertrieb|deutsche\s+bahn|db\s+fernverkehr|bahncard|bahnbonus|einfache\s+fa[hy]rt|lufthansa|flixbus|flixtrain|hotel|hotels|h\+\s*hotel|übernachtung|uebernachtung|thr\s+muenchen|hotelbuchung|airbnb|taxi\b|funktaxen\w*|taxen\w*|fluggast)\b/i.test(lower)) return ok('4673', '8', 'travel / hotel');
  if (/\b(notar|notariat)\b/i.test(lower)) return ok('4950', '9', 'notary');
  if (/\b(rechtsanwalt|anwalt|steuerberat|fintax|fibu|buchhaltung)\b/i.test(lower)) return ok('4955', '9', 'legal / tax advisor');
  if (
    sh === 'H' &&
    amount < 500 &&
    !/kauf\b|fahrzeug|pkw|opel|audi|bmw|tesla|mercedes|\bvw\b|volkswagen|ford|miete|pacht|ebay/i.test(lower) &&
    (
      /\b(amtsgericht|handelsregister|gerichtskasse|justizkasse|landgericht|zentrale mahnabteilung|gerichtsvollzieher|dr\s*ii)\b/i.test(lower) ||
      /\b(buergerbuero|bürgerbüro|magistrat|stadtkasse|gewerbeamt|gewerbeanmeldung|gebührenliste|gebuehrenliste|gebühr\w*|verwaltungsgeb\w*|kfz[-\s]*zulassung|i-?kfz|kreisverwaltung|kreisausschuss|landratsamt|landeshauptstadt|gemeindekasse|gemeinde|ihk|handwerkskammer|berufsgenossenschaft|stadtverwaltung|verkehrsabteilung|polizei|bussgeld|ordnungswidrigkeit)\b/i.test(lower) ||
      /(?:^|[\s.-])[a-zäöüß-]+kreis\b/i.test(lower) ||
      /\bstadt\s+[a-zäöüß-]{3,}/i.test(lower)
    )
  ) {
    return ok('4390', '', 'court / authority fees');
  }
  if (/\b(adobe|google|microsoft|apple|openai|chatgpt|canva|lexware|datev|sevdesk|fastbill|hostinger|strato|ionos|hetzner|godaddy|aws|github)\b/i.test(lower)) return ok('4964', '9', 'software / cloud');
  if (/\b(vattenfall|stadtwerke|enbw|e\.on|rwe|strom|gas|energie|rabot)\b/i.test(lower) && !/ökostrom|okostrom|db\s+fernverkehr|deutsche\s+bahn/i.test(lower)) return ok('4240', '9', 'energy');
  if (/\b(miete|pacht|immobilien)\b/i.test(lower)) return ok('4210', '', 'rent');
  if (/\b(mobile\.de|autoscout24|kleinanzeigen|werbung|vistaprint|inserat)\b/i.test(lower)) return ok('4600', '9', 'advertising');
  if (/\b(vodafone|telekom|telefonica|o2|1&1|congstar|internet|telefon)\b/i.test(lower)) return ok('4920', '9', 'telecom');
  if (/\b(deutsche post|dhl|hermes|dpd|ups|gls|porto|briefmarke)\b/i.test(lower)) return ok('4910', '', 'postage');
  if (/\b(lohn|gehalt|minijob|knappschaft|aok|tk |barmer|dak )\b/i.test(lower)) return ok('1740', '', 'payroll');
  if (/\b(hauptzollamt|kfz-steuer)\b/i.test(lower)) return ok('4510', '', 'vehicle tax');
  if (isCarDealer && /\bdifferenzbetrag\b/i.test(lower) && sh === 'H') return ok('3200', '', 'Differenzbetrag vehicle purchase');

  const isVehicleLike =
    isCarDealer && (
      /\b(kauf|anzahlung|restzahlung|differenzbetrag|fahrzeug|auto|pkw|kfz|polo|tesla|adam|vito|fiat|golf|corsa|astra|passat|audi|bmw|mercedes|opel|volkswagen|cupra|skoda|seat|porsche|land\s*rover|range\s*rover|rangrover)\b/i.test(lower) ||
      hasVinInText || /auto-|kfz-|car-/i.test(lower)
    );
  if (isVehicleLike && sh === 'H' && amount >= 1500) return ok('3200', '', 'vehicle purchase >= 1500');
  if (isVehicleLike && sh === 'S') {
    const linked = tryLinks(inp, lower);
    if (linked) return linked;
    if (!inp.beleg && !hasVinInText) {
      const isDeposit = /\banzahlung\b/i.test(lower);
      return {
        account: isDeposit ? '1718' : '8193',
        buCode: '',
        step: 'e-review',
        needsReview: true,
        reviewKind: 'MISSING_BELEG_INCOMING',
        question: isDeposit
          ? 'Kunden-Anzahlung ohne zugeordnete Rechnung — auf 1718 (Erhaltene Anzahlungen) buchen oder Rechnung hochladen?'
          : 'Für diesen Geldeingang wurde keine QA24-Rechnung gefunden. Bitte Beleg hochladen oder Konto bestätigen.',
        reason: isDeposit
          ? 'incoming customer deposit (Anzahlung) with no QA24 invoice → suggest 1718'
          : 'incoming bank payment with no QA24 invoice or VIN → Beleg fehlt question',
      };
    }
    return {
      account: '8400', buCode: '', step: 'e-review', needsReview: true, reviewKind: 'VIN_SALE',
      reason: 'vehicle sale without Beleg / purchase history → question (8193 / 8400 / 8125)',
    };
  }

  // Dictionary fallbacks (learned suppliers, matched purchase Beleg, SKR03 keyword dictionary)
  // Never keep a stale 3200 without matching an explicit vehicle purchase rule above
  const weakCurrent = ['4900', '4930', '3200'];
  const learned = supplierMemoryService.lookupSupplier(counterparty);
  if (learned && learned.skr03Account && !['1000', '1200', '3200', '3300', '4900'].includes(learned.skr03Account)) {
    return ok(learned.skr03Account, learned.buSchluessel || '', 'learned supplier');
  }
  const bAcc = inp.beleg?.skr03Account;
  if (sh === 'H' && bAcc && !['1000', '1200', '4900'].includes(bAcc)) {
    return ok(bAcc, inp.beleg?.buCode ?? '', 'account of the matched purchase Beleg');
  }
  if (inp.phase === 'normalize' && inp.currentAccount && !weakCurrent.includes(inp.currentAccount)) {
    return ok(inp.currentAccount, '', 'kept the decision made when the line was first classified');
  }
  const general = skr03Mapper.suggestAccount(counterparty, purpose, 19);
  if (general && general.code && !['1000', '1200', '1400', '1600', '4900'].includes(general.code)) {
    return ok(general.code, general.code.startsWith('4') ? '9' : '', 'SKR03 keyword dictionary');
  }
  return null;
}

// ───────────────────────── the one function ─────────────────────────

export function decideAccount(inp: RuleInput): RuleDecision {
  const lower = inp.text.toLowerCase();
  const txt = `${inp.text} ${inp.belegfeld1 || ''}`.toLowerCase();

  let d: RuleDecision | null =
    stepA(inp, txt) ||
    stepB(inp, lower) ||
    stepC(inp, lower) ||
    stepD(inp, lower);

  if (!d) {
    // e) nothing matched – try follow-up linking, otherwise ask. Never guess.
    const rules = clientRulesService.getRules(inp.clientId);
    const isCarDealer = !rules?.business_type || rules.business_type === 'car_dealer';
    d =
      tryLinks(inp, lower) || {
        account: '4900',
        buCode: '',
        step: 'e-review',
        needsReview: true,
        reviewKind:
          inp.sh === 'S' && inp.konto === '1200' && !inp.beleg && !hasVin(txt) && inp.amount >= 500
            ? 'MISSING_BELEG_INCOMING'
            : 'UNKNOWN',
        ...(inp.sh === 'S' && inp.konto === '1200' && !inp.beleg && !hasVin(txt) && inp.amount >= 500
          ? { question: isCarDealer ? 'Für diesen Geldeingang wurde keine QA24-Rechnung gefunden. Bitte Beleg hochladen oder Konto bestätigen.' : 'Für diesen Geldeingang wurde kein Beleg gefunden. Bitte Beleg hochladen oder Konto bestätigen.' }
          : {}),
        reason: 'no rule matched → review question',
      };
  }
  if (NO_BU_ACCOUNTS.has(d.account)) d.buCode = '';
  return d;
}

export const ruleEngine = { decideAccount, NO_BU_ACCOUNTS };

// ───────────────────────── month context helpers ─────────────────────────

/** Sum already booked on the capital account (bank credits) in statements of earlier months of the same year. */
export function priorCapitalBooked(
  docs: Array<{ id?: string; client_id?: string; file_checksum?: string; original_filename?: string; extracted_data?: any }>,
  clientId: string | undefined,
  year: number,
  month: number
): number {
  const cfg = clientRulesService.getStammkapital(clientId);
  const account = cfg?.account || '0800';
  const seen = new Set<string>();
  let sum = 0;
  for (const d of docs) {
    if (clientId && d.client_id !== clientId) continue;
    const ed = d.extracted_data;
    if (!ed || ed.document_type !== 'BANK_STATEMENT' || !Array.isArray(ed.bookings)) continue;
    const m = String(ed.invoice_date || '').match(/^(\d{4})-(\d{2})/);
    if (!m || Number(m[1]) !== year || Number(m[2]) >= month) continue;
    const key = d.file_checksum || `${m[1]}-${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const b of ed.bookings) {
      if (b.konto === '1200' && b.sh === 'S' && b.gegenkonto === account) sum += Number(b.amount) || 0;
    }
  }
  return Math.round(sum * 100) / 100;
}
