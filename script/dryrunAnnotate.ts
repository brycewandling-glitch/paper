#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { getSheetRawValues } from '../server/googleSheets';
import { resolvePickToGameServer } from '../server/pickResolver';

async function dryrun(sheetName: string) {
  const raw = await getSheetRawValues(sheetName);
  if (!raw || raw.length === 0) {
    console.error('empty sheet');
    return;
  }
  const headers: string[] = raw[0].map(String);
  const rows = raw.slice(1).map(r => r.map(c => (c === undefined ? '' : String(c))));

  const betAmountNames: string[] = [];
  for (const h of headers) {
    const m = String(h).match(/(.+)\s+Bet Amount/i);
    if (m) betAmountNames.push(m[1].trim());
  }

  const headerCopy = headers.slice();
  const resolvedInsertPositions: { name: string; insertIndex: number }[] = [];
  for (const name of betAmountNames) {
    const idx = headerCopy.findIndex(h => String(h).trim() === name);
    if (idx >= 0) {
      const insertAt = idx + 1;
      headerCopy.splice(insertAt, 0, `${name} Resolved`);
      resolvedInsertPositions.push({ name, insertIndex: insertAt });
    }
  }

  const annotated: any[] = [];
  annotated.push(headerCopy);

  const weekIndex = headers.findIndex(h => /week/i.test(h));

  for (let r = 0; r < rows.length; r++) {
    const orig = rows[r].slice();
    const out = orig.slice();
    resolvedInsertPositions.sort((a,b) => a.insertIndex - b.insertIndex);
    for (const pos of resolvedInsertPositions) {
      while (out.length < pos.insertIndex) out.push('');
      const nameColIdx = headers.findIndex(h => String(h).trim() === pos.name);
      const pickText = nameColIdx >= 0 ? String(orig[nameColIdx] ?? '').trim() : '';
      const weekVal = weekIndex >= 0 ? orig[weekIndex] : (r+1);
      const weekNum = Number(String(weekVal).replace(/[^0-9]/g, '')) || (r+1);

      let resolvedStr = '';
      try {
        const candidates = await resolvePickToGameServer(String(sheetName), weekNum, pickText, null);
        if (candidates && candidates.length > 0) {
          const c = candidates[0];
          const home = c.home ?? '';
          const away = c.away ?? '';
          const date = c.parsedDate ? new Date(c.parsedDate).toLocaleDateString('en-US') : '';
          const spread = c.spread !== undefined ? (c.spread > 0 ? `-${Math.abs(c.spread)}` : `${c.spread}`) : '';
          let label = '';
          if (home && away) label = `${away} at ${home}`;
          else label = home || away || '';
          if (!label) label = pickText;
          if (date) label = `${label} (${date})`;
          if (spread) label = `${label} ${spread}`;
          resolvedStr = label;
        }
      } catch (e) {
        // ignore
      }

      if (!resolvedStr) {
        const lowerPick = String(pickText).toLowerCase();
        let inferredOpponent: string | null = null;
        for (let ci = 0; ci < orig.length; ci++) {
          if (ci === nameColIdx) continue;
          const cell = String(orig[ci] ?? '').toLowerCase();
          if (!cell) continue;
          if (cell.includes('fresno') || cell.includes('ku') || cell.includes('kansas state') || cell.includes('kansas st') || cell.includes('kansas')) {
            inferredOpponent = String(orig[ci]);
            break;
          }
        }
        if (inferredOpponent) resolvedStr = `${pickText} -> likely vs ${inferredOpponent}`;
      }

      if (!resolvedStr) resolvedStr = pickText || '';
      out.splice(pos.insertIndex, 0, resolvedStr);
    }
    annotated.push(out);
  }

  // write backup and preview
  const outDir = path.resolve(process.cwd(), 'script', 'backups');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const backupPath = path.join(outDir, `${sheetName.replace(/\s+/g,'_')}_backup.json`);
  const previewPath = path.join(outDir, `${sheetName.replace(/\s+/g,'_')}_annotated_preview.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ headers, rows }, null, 2));
  fs.writeFileSync(previewPath, JSON.stringify({ annotated: annotated.slice(0, 11) }, null, 2));

  console.log('Backup written to', backupPath);
  console.log('Preview (first 10 rows) written to', previewPath);
}

(async () => {
  const sheet = process.argv[2] || 'Season 4';
  await dryrun(sheet);
})();
