import { getSheetRawValues, getSheetData, updateSheetValues } from '../server/googleSheets';
import { findGame, formatGame } from '../server/cfbSchedule2025';

function parsePickText(pick: string): { team: string; spread: number | null } {
  const m = String(pick ?? '').match(/^([^-\d()]+?)\s*(-?\d+(?:\.\d+)?)?/i);
  const team = m ? m[1].trim() : '';
  const spread = m && m[2] ? Number(m[2]) : null;
  return { team, spread };
}

async function main() {
  const sheet = process.argv[2] || 'Season 4';
  console.log('Resolving Mitch picks for', sheet);

  const raw = await getSheetRawValues(sheet);
  if (!raw || raw.length === 0) {
    console.error('no rows');
    process.exit(1);
  }

  const headers = raw[0].map((h: any) => String(h ?? '').trim());
  const mitchIdx = headers.indexOf('Mitch');
  const mitchResolvedIdx = headers.indexOf('Mitch Resolved');

  if (mitchIdx < 0) {
    console.error('no Mitch column found');
    process.exit(1);
  }

  if (mitchResolvedIdx < 0) {
    console.error('no Mitch Resolved column found');
    process.exit(1);
  }

  const weekIdx = headers.findIndex(h => /^week$/i.test(h));
  const dateIdx = headers.findIndex(h => /\bdate\b/i.test(h));

  // Read parsed data to get dates + week numbers
  const data = await getSheetData(sheet);
  if (!data || data.length === 0) {
    console.error('no parsed data');
    process.exit(1);
  }

  // Build new raw values
  const newRaw = raw.map(r => [...r]); // shallow copy

  let resolved = 0;
  for (let r = 1; r < newRaw.length; r++) {
    const row = newRaw[r];
    const parsedRow = data[r - 1];
    const pickText = String(row[mitchIdx] ?? '').trim();
    if (!pickText) continue;

    const parsed = parsePickText(pickText);
    const weekNum = weekIdx >= 0 ? Number(parsedRow['Week'] || r) : r;
    const dateStr = dateIdx >= 0 ? String(parsedRow['Date'] || '') : null;

    const game = findGame(parsed.team, parsed.spread, dateStr, weekNum);
    if (game) {
      const resolved_str = formatGame(game);
      row[mitchResolvedIdx] = resolved_str;
      console.log(`Week ${weekNum}: "${pickText}" → "${resolved_str}"`);
      resolved++;
    } else {
      console.log(`Week ${weekNum}: "${pickText}" → NO MATCH`);
    }
  }

  // Write back
  console.log(`\nUpdating sheet: resolved ${resolved} picks`);
  try {
    await updateSheetValues(sheet, newRaw);
    console.log('Update complete');
  } catch (e: any) {
    console.error('error:', e?.message || e);
    process.exit(1);
  }
}

main().catch((err: any) => {
  console.error(err);
  process.exit(1);
});
