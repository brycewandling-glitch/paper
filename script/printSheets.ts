#!/usr/bin/env tsx
import { getSheetData } from '../server/googleSheets';

async function show(sheet: string) {
  try {
    const rows = await getSheetData(sheet);
    console.log('---', sheet, 'rows:', rows.length);
    if (rows && rows.length > 0) {
      console.log('headers:', Object.keys(rows[0]));
      console.log('preview:', JSON.stringify(rows.slice(0,2), null, 2));
    }
  } catch (e) {
    console.error('error fetching', sheet, e?.message ?? e);
  }
}

(async () => {
  const candidates = ['Season 4', 'Season 4 Schedule', 'Schedule', 'Games', 'Game Schedule', 'Season Schedule', 'Master Schedule'];
  for (const s of candidates) {
    await show(s);
  }
})();
