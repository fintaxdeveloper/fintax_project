import fs from 'fs';
import { GoldenFile, compareLines, computeMonth, goldenPath, listGoldenNames } from './goldenLib.js';

/**
 * npm run test:months
 * Re-processes EVERY month that has a golden file (testdata/golden/<year>_<month>.json) with the current
 * code and rules and compares Umsatz, S/H, Konto, Gegenkonto, BU and Datum line by line.
 * Any difference, missing or extra line = FAIL.
 */
function main() {
  console.log('====================================================');
  console.log(' FinTax golden month check (npm run test:months)');
  console.log('====================================================');

  const names = listGoldenNames();
  if (names.length === 0) {
    console.log('No golden files found in testdata/golden/. Nothing to check.');
    process.exitCode = 1;
    return;
  }

  const quiet = console.log;
  let allPass = true;
  const summary: string[] = [];
  const accuracyReports: NonNullable<ReturnType<typeof computeMonth>['accuracy']>[] = [];
  const evaluatedPeriods = new Set<string>();

  for (const name of names) {
    const golden: GoldenFile = JSON.parse(fs.readFileSync(goldenPath(name), 'utf-8'));
    let problems: string[] = [];
    let info = '';
    try {
      // The engine prints decision traces while it works – keep them out of the result table
      console.log = () => {};
      const res = computeMonth(golden.client_id, golden.year, golden.month);
      console.log = quiet;
      if (res.accuracy) {
        accuracyReports.push(res.accuracy);
        evaluatedPeriods.add(`${golden.client_id}|${golden.year}_${String(golden.month).padStart(2, '0')}`);
      }
      problems = compareLines(golden.bookings, res.lines);
      for (const fc of res.failedChecks) problems.push(`CONTROL CHECK FAILED  ${fc.id}: ${fc.value} (expected ${fc.expected})`);
      info = `${res.lines.length} lines, open critical ${res.openCritical}, warnings ${res.openWarnings}, gate ${res.blocked ? 'BLOCKED' : 'OPEN'}`;
    } catch (err: any) {
      console.log = quiet;
      problems.push(`ERROR  ${err.message}`);
    }

    const pass = problems.length === 0;
    if (!pass) allPass = false;
    console.log(`\n--- ${name} (${golden.client_id}) : ${pass ? 'PASS ✅' : 'FAIL ❌'} ${info ? '— ' + info : ''}`);
    for (const p of problems) console.log('   ' + p);
    summary.push(`${name}: ${pass ? 'PASS' : 'FAIL'}`);
  }

  // Also refresh & include accuracy reports for active QA24 & Pizza Amore months
  for (const [cid, yr, mo] of [
    ['user_qa24_704', 2024, 2],
    ['user_qa24_704', 2024, 3],
    ['user_qa24_704', 2024, 4],
    ['user_pizza_amore', 2026, 6],
  ] as const) {
    const pKey = `${cid}|${yr}_${String(mo).padStart(2, '0')}`;
    if (evaluatedPeriods.has(pKey)) continue;
    try {
      console.log = () => {};
      const r = computeMonth(cid, yr, mo);
      console.log = quiet;
      if (r.accuracy) {
        accuracyReports.push(r.accuracy);
        evaluatedPeriods.add(pKey);
      }
    } catch {
      console.log = quiet;
    }
  }

  if (accuracyReports.length > 0) {
    console.log('\n===================================================================================================================================');
    console.log(' FinTax Monthly Accuracy Report (storage/accuracy/<client>_<YYYY_MM>.json & .first_run.json)');
    console.log(' Goal: user-changed = 0  AND  current accuracy ≥ 97.0%');
    console.log('-----------------------------------------------------------------------------------------------------------------------------------');
    console.log(
      ' Client           | Month    | Total | First-Run Accuracy | Current Accuracy | Resolved by Q | Questions (Beleg/Ent/Unl) | User-Changed | Goal'
    );
    console.log('---------------------------------------------------------------------------------------------------------------------------------------------------');
    for (const acc of accuracyReports) {
      const firstStr = `${acc.first_run_correct}/${acc.total_bookings} (${acc.first_run_accuracy_pct.toFixed(1)}%)`.padEnd(18);
      const currStr = `${acc.auto_correct}/${acc.total_bookings} (${acc.current_accuracy_pct.toFixed(1)}%)`.padEnd(16);
      const resStr = String(acc.resolved_by_question).padStart(13);
      const qbt = acc.questions_by_type;
      const qStr = `${String(acc.questions_asked).padStart(2)} (${qbt.beleg_fehlt} / ${qbt.entscheidung} / ${qbt.unreadable})`.padEnd(25);
      const ucStr = String(acc.user_changed).padStart(12);
      const goalStr = acc.goal_met ? 'PASS ✅' : 'FAIL ❌';
      console.log(
        ` ${(acc.client_id || '').padEnd(16)} | ${acc.period.padEnd(8)} | ${String(acc.total_bookings).padStart(5)} | ${firstStr} | ${currStr} | ${resStr} | ${qStr} | ${ucStr} | ${goalStr}`
      );
      if (acc.error_list.length > 0) {
        for (const err of acc.error_list) {
          console.log(
            `    ↳ [${err.category}] ${err.date} ${err.amount.toFixed(2)} € "${err.text.slice(0, 35)}" (${err.proposedAccount} -> ${err.finalAccount}): ${err.cause}`
          );
        }
      }
    }
    console.log('===================================================================================================================================');
  }

  console.log('\n====================================================');
  console.log(' ' + summary.join('   |   '));
  console.log(` RESULT: ${allPass ? 'ALL MONTHS PASS ✅' : 'FAILED ❌'}`);
  console.log('====================================================');
  if (!allPass) process.exitCode = 1;
}

main();
