import { getSheetRawValues, getSheetData } from '../server/googleSheets';
import { resolvePickToGameServer } from '../server/pickResolver';

async function main() {
  const sheet = process.argv[2] || 'Season 4';
  const weekNum = Number(process.argv[3] || '1');

  const raw = await getSheetRawValues(sheet);
  if (!raw || raw.length === 0) {
    console.error('no rows');
    process.exit(1);
  }

  const headers = raw[0].map((h: any) => String(h ?? '').trim());

  // find player names by the pattern: "<Name> Bet Amount", "<Name> Win/Lose/Push", "<Name>"
  const players: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const m = headers[i].match(/^(.+)\s+Bet Amount$/);
    if (m && headers[i + 1] && headers[i + 2]) {
      const maybeName = headers[i + 2];
      if (maybeName === m[1]) players.push(m[1]);
    }
  }

  const data = await getSheetData(sheet);
  if (!data || data.length === 0) {
    console.error('no parsed rows');
    process.exit(1);
  }

  // find row for the requested week
  const weekKey = Object.keys(data[0]).find(k => /week/i.test(k));
  let targetRow = data.find(r => {
    if (!weekKey) return false;
    const v = r[weekKey];
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9]/g, ''));
    return Number(n) === Number(weekNum);
  });
  if (!targetRow) targetRow = data[0];

  console.log(`Sheet: ${sheet}  Week: ${weekNum}`);
  for (const p of players) {
    const pickText = targetRow[p];
    console.log('\n-- ' + p + ' --');
    console.log('pickText:', pickText);
    try {
      const res = await resolvePickToGameServer(sheet, weekNum, pickText as any);
      if (!res || res.length === 0) {
        // attempt heuristic fallback: look for a teammate's pick that encodes a matchup like "KU/Fresno"
        const allPicks = Object.values(targetRow).map(v => String(v ?? '').toLowerCase());
        let fallback: string | null = null;
        for (const other of allPicks) {
          const m = other.match(/([A-Za-z0-9 .'-]+)\s*\/\s*([A-Za-z0-9 .'-]+)(.*)/i);
          if (m) {
            const a = m[1].trim();
            const b = m[2].trim();
            const tp = String(pickText ?? '').toLowerCase();
            if (tp.includes(a.toLowerCase()) || tp.includes(b.toLowerCase())) {
              const opponent = tp.includes(a.toLowerCase()) ? b : a;
              fallback = `${tp.split(/\s+\-?\d/)[0].trim()} vs ${opponent} (${m[3].trim()})`;
              break;
            }
          }
        }
        if (fallback) console.log('  fallback:', fallback);
        else console.log('  no candidates found');
      } else {
        for (const c of res) {
          console.log(`  sheet=${c.sheet} home=${c.home} away=${c.away} spread=${c.spread} date=${c.parsedDate}`);
        }
      }
    } catch (e) {
      console.error('  error resolving:', e?.message || e);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
