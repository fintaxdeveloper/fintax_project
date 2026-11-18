import fs from 'fs';
import path from 'path';
import { exportService } from '../src/services/exportService.js';
import { dbService } from '../src/services/dbService.js';
import { belegIndexService } from '../src/services/belegIndexService.js';

/**
 * Test harness: Validates accounting integrity and export readiness across test months 06-09/2024.
 */
async function main() {
  console.log('====================================================');
  console.log(' FinTax Accounting Engine Multi-Month Verification');
  console.log('====================================================\n');

  const targetClientId = 'user_1794302469947_o180';
  const allDocs = dbService.getAll();
  const clientDocs = allDocs.filter((d) => d.client_id === targetClientId);
  console.log(`Loaded ${allDocs.length} total doc(s), ${clientDocs.length} for ${targetClientId}.`);

  console.log('Ensuring offline CPU OCR BelegIndex is warm for client...');
  await belegIndexService.ensureClientIndexed(targetClientId, clientDocs);
  const idxRecords = belegIndexService.getClientIndex(targetClientId, 2024, 9, 12);
  console.log(`BelegIndex ready: ${idxRecords.length} grouped receipt/contract/invoice records.`);

  const monthsToTest = [6, 7, 8, 9];
  const year = 2024;
  let allCriticalPassed = true;

  for (const m of monthsToTest) {
    const mPadded = String(m).padStart(2, '0');
    console.log(`\n--- Testing Month ${mPadded}/${year} ---`);

    const primaryDoc =
      clientDocs.find((d) => {
        const fn = (d.original_filename || '').toLowerCase();
        return fn.includes(`bank-${mPadded}`) || fn.includes(`_${mPadded}`) || fn.includes(`-${mPadded}`) || fn.includes(`${mPadded}2026`) || fn.includes(`${mPadded}2024`);
      }) || clientDocs[0];

    if (!primaryDoc) {
      console.log(`No documents found for Month ${mPadded}. Skipping.`);
      continue;
    }

    try {
      const batchResult = exportService.generateDocumentAndMonthlySKR03Csv(primaryDoc, clientDocs, year, m, {
        writeFiles: false,
      });
      const report = batchResult.reviewReport;

      const bankCheck = report.checks.find((c) => c.id === 'BANK_BALANCE');
      const transitCheck = report.checks.find((c) => c.id === 'TRANSIT_1360');
      const kasseCheck = report.checks.find((c) => c.id === 'KASSE_PLAUSIBLE');

      console.log(`Bookings: ${report.total_bookings} total (${report.auto_booked} auto-verified)`);
      console.log(`Open Critical: ${report.open_critical} | Warnings: ${report.open_warnings}`);
      console.log(`CHECK BANK_BALANCE:    ${bankCheck?.status || 'MISSING'} (${bankCheck?.value || ''} vs ${bankCheck?.expected || ''})`);
      console.log(`CHECK TRANSIT_1360:    ${transitCheck?.status || 'MISSING'} (${transitCheck?.value || ''})`);
      console.log(`CHECK KASSE_PLAUSIBLE: ${kasseCheck?.status || 'MISSING'} (${kasseCheck?.value || ''})`);

      if (bankCheck?.status !== 'PASS' || transitCheck?.status !== 'PASS' || kasseCheck?.status !== 'PASS') {
        allCriticalPassed = false;
      }

      const openIssues = report.issues.filter((i) => !i.resolved);
      console.log(`Open Issues (${openIssues.length}):`);
      for (const iss of openIssues) {
        const grp = iss.relatedBookings ? ` [GROUPED ${iss.relatedBookings.length}x]` : '';
        const matchInfo = iss.matchedBeleg ? ` [Beleg: ${iss.matchedBeleg.partner} | ${iss.matchedBeleg.taxClause || ''}]` : '';
        console.log(
          `  - [${iss.categoryTab || 'DECISION'}] ${iss.type}${grp}: ${iss.booking.amount.toFixed(2)} € (${iss.booking.sh} ${iss.booking.konto}->${iss.booking.gegenkonto}) | ${iss.booking.text}${matchInfo}`
        );
      }

      // Spot-check auto-resolved bookings reported by CSV/bookings
      const checkBookings = report.bookings.filter((b: any) =>
        /(monteiro|talamona|fortia|drive4ever|van hove|goebel|eha|roth|buffalo|birlik|siegel|digitaldrive|epper|marzal)/i.test(
          `${b.buchungstext || ''} ${b.belegfeld1 || ''}`
        )
      );
      if (checkBookings.length > 0) {
        console.log(`Spot-check key bookings:`);
        for (const cb of checkBookings) {
          console.log(`  * ${cb.belegdatum} ${cb.sh} ${cb.konto}->${cb.gegenkonto} (BU:${cb.buCode || '-'}) ${Number(cb.amount).toFixed(2)} € | ${cb.buchungstext}`);
        }
      }
    } catch (err: any) {
      allCriticalPassed = false;
      console.error(`Error analyzing month ${mPadded}:`, err.stack || err.message);
    }
  }

  console.log(`\nVerification complete. Core controls: ${allCriticalPassed ? 'ALL PASS ✅' : 'FAILED ❌'}`);
  if (!allCriticalPassed) process.exitCode = 1;
}

main().catch(console.error);
