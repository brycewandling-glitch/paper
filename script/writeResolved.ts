import { getSheetRawValues, getSheetData, updateSheetValues } from '../server/googleSheets';

function cleanSpread(s: any) {
  if (s === undefined || s === null) return '';
  const m = String(s).match(/(-?\d+(?:\.\d+)?)/);
  return m ? m[1] : '';
}

function formatCandidate(c: any) {
  const home = c.home || c.away || '';
  const away = c.away || c.home || '';
  const spread = c.spread !== undefined && c.spread !== null ? cleanSpread(c.spread) : '';
  const date = c.parsedDate ? String(c.parsedDate).slice(0,10) : '';
  const parts = [] as string[];
  if (home && away) parts.push(`${home} vs ${away}`);
  if (spread) parts.push(`spread:${spread}`);
  if (date) parts.push(date);
  return parts.join(' ');
}

async function main() {
  const sheet = process.argv[2] || 'Season 4';
  console.log('Writing resolved columns for', sheet);

  const raw = await getSheetRawValues(sheet);
  if (!raw || raw.length === 0) {
    console.error('no rows'); process.exit(1);
  }

  const headers = raw[0].map((h: any) => String(h ?? '').trim());

  // detect players by pattern: '<Name> Bet Amount' followed by '<Name> Win/Lose/Push' and '<Name>'
  const players: { name: string; nameIndex: number }[] = [];
  for (let i = 0; i < headers.length; i++) {
    const m = headers[i].match(/^(.+)\s+Bet Amount$/);
    if (m && headers[i + 1] && headers[i + 2]) {
      const maybeName = headers[i + 2];
      if (maybeName === m[1]) players.push({ name: maybeName, nameIndex: i + 2 });
    }
  }

  // Build new headers with '<Name> Resolved' inserted after each player name if missing
  const newHeaders: string[] = [];
  const resolvedHeaderByPlayer = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    newHeaders.push(h);
    const p = players.find(p => p.nameIndex === i);
    if (p) {
      const resolvedName = `${p.name} Resolved`;
      const nextHeader = headers[i + 1] ?? '';
      // avoid duplicating if already present immediately after
      if (nextHeader !== resolvedName && (newHeaders[newHeaders.length - 1] !== resolvedName)) {
        newHeaders.push(resolvedName);
        resolvedHeaderByPlayer.set(p.name, newHeaders.length - 1);
      } else {
        // if it's already present, find its index in newHeaders
        const idx = newHeaders.indexOf(resolvedName);
        if (idx >= 0) resolvedHeaderByPlayer.set(p.name, idx);
      }
    }
  }

  // For safety: if no players found, bail
  if (players.length === 0) {
    console.error('no players detected in headers'); process.exit(1);
  }

  // map existing rows (parsed) to resolve picks
  const parsed = await getSheetData(sheet);
  const weekKey = Object.keys(parsed[0] || {}).find(k => /week/i.test(k));

  const newValues: (string | number | null)[][] = [];
  newValues.push(newHeaders);

  for (let r = 0; r < parsed.length; r++) {
    const row = parsed[r];
    const outRow: (string | number | null)[] = [];
    // build a map of header->value for quick lookup
    const headerToValue = new Map<string, any>();
    Object.keys(row).forEach(k => headerToValue.set(k, row[k]));

    // compute resolved for each player: use fallback heuristic (no schedule sheets available)
    const resolvedByPlayer = new Map<string, string>();
    for (const p of players) {
      const pickText = row[p.name];
      let resolved = '';

      // fallback: search other picks in this row for 'A/B' style matchups
      const allPicks = Array.from(headerToValue.values()).map(v => String(v ?? '').trim());
      let fb: string | null = null;
      for (const other of allPicks) {
        const m = other.match(/([A-Za-z0-9 .'-]+)\s*\/\s*([A-Za-z0-9 .'-]+)(.*)/i);
        if (m) {
          const a = m[1].trim();
          const b = m[2].trim();
          const tp = String(pickText ?? '').toLowerCase();
          if (!tp) continue;
          if (tp.includes(a.toLowerCase()) || tp.includes(b.toLowerCase())) {
            const opponent = tp.includes(a.toLowerCase()) ? b : a;
            const team = tp.split(/\s+\-?\d/)[0].trim();
            fb = `${team} vs ${opponent}` + (m[3] ? ` ${m[3].trim()}` : '');
            break;
          }
        }
      }
      if (fb) resolved = fb;

      resolvedByPlayer.set(p.name, resolved || '');
    }

    // now iterate through original raw headers and copy values, inserting resolved columns where needed
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const v = row[h];
      outRow.push(v ?? '');
      const p = players.find(p => p.nameIndex === i);
      if (p) {
        const resolvedVal = resolvedByPlayer.get(p.name) ?? '';
        outRow.push(resolvedVal);
      }
    }

    // If newHeaders is longer than outRow, pad
    while (outRow.length < newHeaders.length) outRow.push('');
    newValues.push(outRow);
  }

  // write back
  try {
    console.log('Updating sheet with', newHeaders.length, 'columns and', newValues.length - 1, 'data rows');
    await updateSheetValues(sheet, newValues);
    console.log('Update complete');
  } catch (e) {
    console.error('error writing sheet:', e?.message || e);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
