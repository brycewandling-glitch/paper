import { getSheetRawValues, updateSheetCellValue } from '../server/googleSheets';
import {
  BASE_BET_AMOUNT,
  computeNextBetAmount,
  extractPlayerColumns,
  formatBetAmount,
  parseBetAmount,
} from '../server/betAmounts';

function parseWeekNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const match = str.match(/\d+/);
  if (!match) return null;
  const week = Number(match[0]);
  return Number.isFinite(week) ? week : null;
}

async function backfillBetAmounts(sheetName: string) {
  const rows = await getSheetRawValues(sheetName);
  if (!rows || rows.length === 0) {
    console.log(`[backfill] no rows found for ${sheetName}`);
    return;
  }

  const headers = rows[0].map((cell) => String(cell ?? ''));
  const weekCol = headers.findIndex((h) => /week/i.test(h));
  if (weekCol === -1) {
    throw new Error('Week column not found in sheet');
  }

  const playerColumns = extractPlayerColumns(headers);
  if (playerColumns.length === 0) {
    console.warn('[backfill] No player bet columns found. Nothing to update.');
    return;
  }

  const updates: { rowNumber: number; columnIndex: number; value: string }[] = [];

  for (const player of playerColumns) {
    let trackedAmount: number | null = null;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const weekNumber = parseWeekNumber(row[weekCol]);
      if (weekNumber === null) {
        continue; // skip totals or blank rows
      }

      if (weekNumber === 1) {
        const startingAmount = parseBetAmount(row[player.betCol]);
        trackedAmount = startingAmount ?? BASE_BET_AMOUNT;
      } else {
        if (trackedAmount === null) trackedAmount = BASE_BET_AMOUNT;
        const desiredValue = formatBetAmount(trackedAmount);
        const currentValue = String(row[player.betCol] ?? '').trim();
        if (currentValue !== desiredValue) {
          updates.push({ rowNumber: r + 1, columnIndex: player.betCol, value: desiredValue });
        }
      }

      if (trackedAmount === null) {
        trackedAmount = BASE_BET_AMOUNT;
      }
      trackedAmount = computeNextBetAmount(trackedAmount, row[player.resultCol]);
    }
  }

  console.log(`[backfill] Prepared ${updates.length} updates for ${sheetName}`);

  for (const update of updates) {
    await updateSheetCellValue(sheetName, update.rowNumber, update.columnIndex, update.value);
  }

  console.log(`[backfill] Completed ${updates.length} updates for ${sheetName}`);
}

async function main() {
  const sheetName = process.argv[2] ?? 'Season 4';
  try {
    await backfillBetAmounts(sheetName);
  } catch (error) {
    console.error('[backfill] Failed:', error);
    process.exitCode = 1;
  }
}

void main();
