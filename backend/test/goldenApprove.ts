import fs from 'fs';
import { GoldenFile, GOLDEN_DIR, computeMonth, goldenPath } from './goldenLib.js';
import { monthLockService } from '../src/services/monthLockService.js';

/**
 * npm run golden:approve -- <client> <YYYY_MM>  (or <YYYY_MM> [client])
 * Saves the CURRENT output of a month as its golden file AND marks the month as locked.
 * A month with open critical items or failed control checks can NEVER be golden.
 */
const arg1 = process.argv[2] || '';
const arg2 = process.argv[3] || '';
let clientId = process.env.GOLDEN_CLIENT || 'user_qa24_704';
let periodArg = arg1;
if (/^\d{4}_\d{1,2}$/.test(arg2)) {
  clientId = arg1;
  periodArg = arg2;
} else if (arg2) {
  clientId = arg2;
}
const m = periodArg.match(/^(\d{4})_(\d{1,2})$/);
if (!m) {
  console.error('Usage: npm run golden:approve -- <client> <YYYY_MM>   e.g. npm run golden:approve -- user_pizza_amore 2026_06');
  process.exit(1);
}
const year = Number(m[1]);
const month = Number(m[2]);

const quiet = console.log;
console.log = () => {};
const res = computeMonth(clientId, year, month);
console.log = quiet;

if (res.openCritical > 0 || res.blocked) {
  console.error(`Refusing to approve – month has ${res.openCritical} open critical item(s) (gate ${res.blocked ? 'BLOCKED' : 'OPEN'}). A month with open critical items can never be golden.`);
  process.exit(1);
}
if (res.failedChecks.length > 0) {
  console.error('Refusing to approve – control checks failed:');
  for (const c of res.failedChecks) console.error(`  ${c.id}: ${c.value} (expected ${c.expected})`);
  process.exit(1);
}

const file: GoldenFile = { client_id: clientId, year, month, note: `approved ${new Date().toISOString()}`, bookings: res.lines };
if (!fs.existsSync(GOLDEN_DIR)) fs.mkdirSync(GOLDEN_DIR, { recursive: true });
const target = clientId === 'user_qa24_704'
  ? goldenPath(`${year}_${String(month).padStart(2, '0')}`)
  : goldenPath(`${clientId}_${year}_${String(month).padStart(2, '0')}`);
fs.writeFileSync(target, JSON.stringify(file, null, 2) + '\n', 'utf-8');
monthLockService.lockMonth(clientId, year, month, {
  bookings: res.rawBookings,
  opening_balance: res.openingBalance,
  closing_balance: res.closingBalance,
  locked_by: 'golden:approve',
});
console.log(`Golden file written & month LOCKED: ${target}  (${res.lines.length} lines)`);
