import { ensureWeekRowExists } from '../server/weekManager';

async function main() {
  const sheetName = process.argv[2] || 'Season 4';
  const weekArg = process.argv[3];
  if (!weekArg) {
    console.error('Usage: tsx script/backfillWeek.ts "Season 4" 16');
    process.exit(1);
  }

  const weekNumber = Number(weekArg);
  if (!Number.isFinite(weekNumber) || weekNumber <= 0) {
    console.error(`Invalid week value: ${weekArg}`);
    process.exit(1);
  }

  console.log(`[backfillWeek] Ensuring week ${weekNumber} exists for ${sheetName}...`);
  await ensureWeekRowExists({ sheetName, targetWeek: weekNumber });
  console.log('[backfillWeek] Done.');
}

main().catch(err => {
  console.error('[backfillWeek] Failed:', err);
  process.exit(1);
});
