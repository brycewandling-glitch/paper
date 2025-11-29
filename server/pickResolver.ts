import { getSheetData } from './googleSheets';

type Row = Record<string, any>;

function tryParseDate(raw: any): Date | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  const p = Date.parse(s);
  if (!Number.isNaN(p)) return new Date(p);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let yyyy = Number(m[3]); if (yyyy < 100) yyyy += 2000;
    return new Date(yyyy, Number(m[1]) - 1, Number(m[2]));
  }
  return null;
}

function findSpreadInRow(row: Row): number | null {
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v === undefined || v === null) continue;
    const m = String(v).match(/(-?\d+(?:\.\d+)?)/);
    if (m) return Number(m[1]);
  }
  return null;
}

export async function resolvePickToGameServer(
  sheetName: string,
  weekNumber: number,
  pickText: string,
  scheduleSheetNames: string[] | null = null
): Promise<Array<{ sheet: string; row: Row; parsedDate?: string; spread?: number; home?: string; away?: string }>> {
  const txt = String(pickText ?? '').trim();
  if (!txt) return [];

  const spreadMatch = txt.match(/(-?\d+(?:\.\d+)?)/);
  const spreadVal = spreadMatch ? Number(spreadMatch[1]) : null;
  let teamPart = txt;
  if (spreadMatch) teamPart = txt.substring(0, spreadMatch.index).trim();
  teamPart = teamPart.replace(/[\(\)\[\]\-–—:]$/g, '').trim();

  // fetch season sheet and find the week row
  const seasonRows = await getSheetData(sheetName);
  if (!seasonRows || seasonRows.length === 0) return [];
  const headers = Object.keys(seasonRows[0]);
  const weekKey = headers.find(h => /week/i.test(h)) || null;
  const dateKey = headers.find(h => /\bdate\b|game date|game_date/i.test(h)) || null;

  let targetRow: Row | undefined;
  if (weekKey) {
    targetRow = seasonRows.find((r: Row) => {
      const v = r[weekKey];
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9]/g, ''));
      return Number(n) === Number(weekNumber);
    });
  }
  if (!targetRow) {
    if (weekNumber - 1 >= 0 && weekNumber - 1 < seasonRows.length) targetRow = seasonRows[weekNumber - 1];
  }
  if (!targetRow) return [];

  let weekDate: Date | null = null;
  if (dateKey && targetRow[dateKey]) {
    weekDate = tryParseDate(targetRow[dateKey]);
  }

  let windowStart: number | null = null;
  let windowEnd: number | null = null;
  if (weekDate) {
    const s = new Date(weekDate); s.setHours(0,0,0,0);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    windowStart = s.getTime();
    windowEnd = e.getTime();
  }

  const candidates = scheduleSheetNames && scheduleSheetNames.length > 0
    ? scheduleSheetNames
    : [
      `${sheetName} Schedule`,
      'Schedule',
      'Games',
      'Game Schedule',
      'Season Schedule',
    ];

  const results: Array<{ sheet: string; row: Row; parsedDate?: string; spread?: number; home?: string; away?: string }> = [];

  for (const sname of candidates) {
    try {
      const srows = await getSheetData(sname);
      if (!srows || srows.length === 0) continue;
      const sheaders = Object.keys(srows[0]);
      const dateKeys = sheaders.filter(h => /\bdate\b|game_date|game date/i.test(h));
      const homeKeys = sheaders.filter(h => /home|visitor|away|team1|team_home|team/i.test(h));
      const awayKeys = sheaders.filter(h => /away|visitor|opponent|team2|team_away/i.test(h));
      const spreadKeys = sheaders.filter(h => /spread|line|pointspread|odds|total/i.test(h));

      for (const row of srows) {
        let parsedDate: Date | null = null;
        for (const dk of dateKeys) {
          parsedDate = tryParseDate(row[dk]);
          if (parsedDate) break;
        }

        if (windowStart && windowEnd && parsedDate) {
          const t = new Date(parsedDate); t.setHours(0,0,0,0);
          const tt = t.getTime();
          if (tt < windowStart || tt >= windowEnd) continue;
        }

        let home: string | undefined;
        let away: string | undefined;
        for (const hk of homeKeys) {
          const v = row[hk]; if (v && String(v).trim()) { home = String(v).trim(); break; }
        }
        for (const ak of awayKeys) {
          const v = row[ak]; if (v && String(v).trim()) { away = String(v).trim(); break; }
        }
        if ((!home || !away) && Object.keys(row).length > 0) {
          const vals = Object.values(row).map(v => String(v ?? '').trim()).filter(Boolean);
          for (const v of vals) {
            const m = v.match(/(.+)\s+at\s+(.+)/i) || v.match(/(.+)\s+vs\.?\s+(.+)/i) || v.match(/(.+)\s+v\s+(.+)/i);
            if (m) { home = m[2].trim(); away = m[1].trim(); break; }
          }
        }

        const tp = teamPart.toLowerCase();
        let teamMatch = false;
        if (home && home.toLowerCase().includes(tp)) teamMatch = true;
        if (away && away.toLowerCase().includes(tp)) teamMatch = true;
        if (!teamMatch) {
          for (const v of Object.values(row)) {
            if (!v) continue;
            if (String(v).toLowerCase().includes(tp)) { teamMatch = true; break; }
          }
        }
        if (!teamMatch) continue;

        let rowSpread: number | null = null;
        for (const sk of spreadKeys) {
          const v = row[sk]; if (v === undefined || v === null) continue;
          const m = String(v).match(/(-?\d+(?:\.\d+)?)/);
          if (m) { rowSpread = Number(m[1]); break; }
        }
        if (rowSpread === null) rowSpread = findSpreadInRow(row);

        if (spreadVal !== null && rowSpread !== null) {
          if (Math.abs(Math.abs(spreadVal) - Math.abs(rowSpread)) > 1.0) continue;
        }

        results.push({ sheet: sname, row, parsedDate: parsedDate ? parsedDate.toISOString() : undefined, spread: rowSpread ?? undefined, home, away });
      }
    } catch (e) {
      continue;
    }
  }

  return results;
}
