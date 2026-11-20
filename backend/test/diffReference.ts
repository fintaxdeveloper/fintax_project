import fs from 'fs';
import path from 'path';
import { computeMonth, GoldenLine } from './goldenLib.js';

const argPeriod = (process.argv[2] || '2024_06').trim();
const m = argPeriod.match(/^(\d{4})_(\d{1,2})$/);
if (!m) {
  console.error('Usage: npm run reftest -- <YYYY_MM>  (e.g. npm run reftest -- 2024_06)');
  process.exit(1);
}
const year = Number(m[1]);
const month = Number(m[2]);
const padded = `${year}_${String(month).padStart(2, '0')}`;
const REF_PATH = path.resolve(process.cwd(), `../testdata/reference/${padded}.csv`);

function parseReferenceCsv(csvText: string): GoldenLine[] {
  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const dataLines = lines.slice(2);
  const out: GoldenLine[] = [];
  for (const raw of dataLines) {
    const cols = raw.split(';').map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 10) continue;
    const amt = parseFloat((cols[0] || '0').replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(amt) || amt === 0) continue;
    out.push({
      amount: amt.toFixed(2).replace('.', ','),
      sh: (cols[1] as 'S' | 'H') || 'S',
      konto: cols[6] || '',
      gegenkonto: cols[7] || '',
      buCode: cols[8] || '',
      belegdatum: cols[9] || '',
      buchungstext: cols[13] || '',
    });
  }
  return out;
}

function main() {
  if (!fs.existsSync(REF_PATH)) {
    console.error(`[reftest] Reference file not found: ${REF_PATH}`);
    console.error('Place the QA24 reference CSV there and re-run: npm run reftest -- ' + padded);
    process.exit(1);
  }

  const refLines = parseReferenceCsv(fs.readFileSync(REF_PATH, 'utf-8'));
  const res = computeMonth('user_qa24_704', year, month);
  const gotLines = res.lines;

  const exactKey = (l: GoldenLine) => `${l.belegdatum}|${l.amount}|${l.konto}|${l.gegenkonto}|${l.buCode}`;
  const amtDateKey = (l: GoldenLine) => `${l.belegdatum}|${l.amount}|${l.konto}`;

  const refPool = refLines.map((r, i) => ({ r, used: false, i }));
  const gotPool = gotLines.map((g, i) => ({ g, used: false, i }));

  let matchedCount = 0;
  for (const gp of gotPool) {
    const k = exactKey(gp.g);
    const hit = refPool.find((rp) => !rp.used && exactKey(rp.r) === k);
    if (hit) {
      hit.used = true;
      gp.used = true;
      matchedCount++;
    }
  }

  const differentLines: string[] = [];
  for (const gp of gotPool) {
    if (gp.used) continue;
    const k = amtDateKey(gp.g);
    const hit = refPool.find((rp) => !rp.used && amtDateKey(rp.r) === k);
    if (hit) {
      hit.used = true;
      gp.used = true;
      differentLines.push(
        `DIFF    ${gp.g.belegdatum} ${gp.g.amount} ${gp.g.konto}: got ${gp.g.gegenkonto} (BU ${gp.g.buCode || '-'}) vs ref ${hit.r.gegenkonto} (BU ${hit.r.buCode || '-'}) "${gp.g.buchungstext}"`
      );
    }
  }

  const extraLines = gotPool
    .filter((gp) => !gp.used)
    .map((gp) => `EXTRA   ${exactKey(gp.g)} "${gp.g.buchungstext}"`);
  const missingLines = refPool
    .filter((rp) => !rp.used)
    .map((rp) => `MISSING ${exactKey(rp.r)} "${rp.r.buchungstext}"`);

  console.log(`=== Reference Test ${padded} ===`);
  console.log(`matched lines:   ${matchedCount}`);
  console.log(`different lines: ${differentLines.length}`);
  console.log(`missing lines:   ${missingLines.length}`);
  console.log(`extra lines:     ${extraLines.length}`);
  console.log(`open questions:  ${res.openCritical} critical, ${res.openWarnings} warnings`);

  for (const d of differentLines) console.log('  ' + d);
  for (const mLine of missingLines) console.log('  ' + mLine);
  for (const eLine of extraLines) console.log('  ' + eLine);

  if (differentLines.length > 0 || missingLines.length > 0 || extraLines.length > 0) {
    process.exit(1);
  }
}

main();
