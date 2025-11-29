#!/usr/bin/env tsx
import { getSheetData } from '../server/googleSheets';

async function run() {
  const sheet = process.argv[2] || 'Season 4';
  const team = (process.argv[3] || 'kansas').toLowerCase();
  const rows = await getSheetData(sheet);
  if (!rows || rows.length === 0) {
    console.log('no rows');
    return;
  }
  const matches: any[] = [];
  rows.forEach((row, idx) => {
    for (const [k, v] of Object.entries(row)) {
      if (!v) continue;
      const s = String(v).toLowerCase();
      if (s.includes(team)) {
        matches.push({ week: row['Week'] ?? (idx+1), column: k, text: v });
      }
    }
  });
  console.log(JSON.stringify(matches, null, 2));
}

run().catch(e => { console.error(e); process.exit(2); });
