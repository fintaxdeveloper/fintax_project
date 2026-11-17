import fs from 'fs';
import path from 'path';
import { exportService } from '../src/services/exportService.js';
import { dbService } from '../src/services/dbService.js';
import { reviewService } from '../src/services/reviewService.js';

/**
 * Test harness: Validates accounting integrity and export readiness across test months.
 */
async function main() {
  console.log('====================================================');
  console.log(' FinTax Accounting Engine Multi-Month Verification');
  console.log('====================================================\n');

  const allDocs = dbService.getAll();
  console.log(`Loaded ${allDocs.length} registered document(s) from database.`);

  const monthsToTest = [6, 7, 8, 9];
  const year = 2024;

  for (const m of monthsToTest) {
    const mPadded = String(m).padStart(2, '0');
    console.log(`\n--- Testing Month ${mPadded}/${year} ---`);

    const monthlyDocs = allDocs.filter(d => {
      const fn = (d.original_filename || '').toLowerCase();
      return fn.includes(`_${mPadded}`) || fn.includes(`-${mPadded}`) || fn.includes(`0${m}2026`) || fn.includes(`0${m}2024`);
    });

    if (monthlyDocs.length === 0) {
      console.log(`No documents found for Month ${mPadded}. Skipping.`);
      continue;
    }

    try {
      const primaryDoc = monthlyDocs[0];
      const batchResult = await exportService.generateDocumentAndMonthlySKR03Csv(primaryDoc, allDocs);
      const report = batchResult.reviewReport;

      console.log(`Bookings: ${report.total_bookings} total (${report.auto_booked} auto-verified)`);
      console.log(`Open Critical: ${report.open_critical} | Warnings: ${report.open_warnings}`);
      console.log(`Bank 1200 Net: ${report.totals.bank_net.toFixed(2)} € (${report.totals.bank_rows} rows)`);
      console.log(`Kasse 1000 Net: ${report.totals.kasse_net.toFixed(2)} €`);
      console.log(`Transit 1360: ${report.totals.transit_net.toFixed(2)} € (Target: 0.00 €)`);
      console.log(`Export Status: ${report.blocked ? 'BLOCKED (' + report.open_critical + ' items need review)' : 'READY FOR DATEV EXPORT ✅'}`);
    } catch (err: any) {
      console.error(`Error analyzing month ${mPadded}:`, err.message);
    }
  }

  console.log('\nVerification complete.');
}

main().catch(console.error);
