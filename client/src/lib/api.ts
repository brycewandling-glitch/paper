import { Player, Pick } from './mockData';

export type SeasonStats = {
  parlaysHit: number;
  overallWinPercentage: number;
  totalWeeks: number;
  seasonWins: number;
  longestWinStreak: { player: string; length: number };
  longestLoseStreak: { player: string; length: number };
  longestPushStreak?: { player: string; length: number };
};

export type SeasonData = {
  players: Player[];
  stats: SeasonStats;
};

function parseNumber(value: any, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, '_');
}

type WeeklyRow = Record<string, any>;

function computeStreak(results: string[]): string {
  // results is most-recent-first array like ['W','W','L','W']
  if (!results || results.length === 0) return 'W0';
  let count = 0;
  let current: 'W' | 'L' | 'P' | null = null;
  for (const r of results) {
    if (!r) continue; // skip empty/incomplete weeks
    const code = String(r).trim().toUpperCase();
    let outcome: 'W' | 'L' | 'P' | null = null;
    if (code.startsWith('W')) outcome = 'W';
    else if (code.startsWith('L')) outcome = 'L';
    else if (code.startsWith('P') || code.includes('PUSH')) outcome = 'P';
    else continue; // skip unknown tokens

    if (current === null) {
      current = outcome;
      count = 1;
    } else if (outcome === current) {
      count++;
    } else {
      break;
    }
  }
  return `${current ?? 'W'}${count}`;
}

export async function fetchSeasonPlayers(sheetName = 'Season 1', winPctIncludePushes = false): Promise<Player[]> {
  const res = await fetch(`/api/data?sheet=${encodeURIComponent(sheetName)}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch sheet data: ${res.status} ${txt}`);
  }

  const rows: WeeklyRow[] = await res.json();
  if (!rows || rows.length === 0) return [];

  // headers come from the object keys of each row
  const headers = Object.keys(rows[0]);

  // Detect weekly layout by presence of "Week" and any "Bet Amount" header
  const hasWeek = headers.some(h => /week/i.test(h));
  const hasBetAmount = headers.some(h => /bet amount/i.test(h));

  if (!hasWeek || !hasBetAmount) {
    // Fallback: assume each row is already a player summary
    // Map object keys to Player fields using previous flexible mapping
    return rows.map(r => {
      const keyed: Record<string, any> = {};
      Object.keys(r).forEach(k => keyed[normalizeKey(k)] = r[k]);
      return {
        id: parseNumber(keyed['id'] ?? keyed['player_id'] ?? 0),
        name: String(keyed['name'] ?? keyed['player'] ?? 'Unknown'),
        division: (String(keyed['division'] ?? 'Leaders') as any) || 'Leaders',
        seasonBetTotal: parseNumber(keyed['season_bet_total'] ?? keyed['total'] ?? 0),
        seasonRecord: String(keyed['season_record'] ?? keyed['record'] ?? '0-0-0'),
        wins: parseNumber(keyed['wins'] ?? 0),
        losses: parseNumber(keyed['losses'] ?? 0),
        pushes: parseNumber(keyed['pushes'] ?? 0),
        winPercentage: parseNumber(keyed['win_percentage'] ?? keyed['winpct'] ?? 0),
        currentStreak: String(keyed['current_streak'] ?? 'W0')
      } as Player;
    });
  }

  type PlayerMeta = {
    initialDivision: 'Legends' | 'Leaders';
    last10WinPct: number;
    last10Wins: number;
    last10Losses: number;
    allTimeWinPct: number;
  };

  const playerMeta = new Map<string, PlayerMeta>();

  // Track per-player "Totals" columns (e.g. "Mitch Totals") so we can pull all-time metrics when available
  const totalsColumnByPlayer = new Map<string, string>();
  for (const header of headers) {
    const totalsMatch = header.match(/^(.+)\s+Totals$/i);
    if (totalsMatch) {
      totalsColumnByPlayer.set(totalsMatch[1].trim(), header);
    }
  }

  // Locate the most recent totals row that reports win percentages
  let winPercentageTotalsRow: WeeklyRow | undefined;
  for (const row of rows) {
    const totalsLabel = String(row['TOTALS'] ?? '').toLowerCase();
    if (totalsLabel.includes('win percentage')) {
      winPercentageTotalsRow = row;
    }
  }

  const allTimeWinPctMap = new Map<string, number>();
  if (winPercentageTotalsRow) {
    for (const [playerName, totalsCol] of totalsColumnByPlayer.entries()) {
      const raw = winPercentageTotalsRow[totalsCol];
      if (raw === undefined || raw === null || raw === '') continue;
      const parsed = parseNumber(raw, NaN);
      if (!Number.isNaN(parsed)) {
        allTimeWinPctMap.set(playerName, parsed);
      }
    }
  }

  const totalsRowByLabel = new Map<string, WeeklyRow>();
  for (const row of rows) {
    const label = String(row['TOTALS'] ?? '').trim().toLowerCase();
    if (label) {
      totalsRowByLabel.set(label, row);
    }
  }

  const totalWinsRow = totalsRowByLabel.get('total wins');
  const totalLossesRow = totalsRowByLabel.get('total losses');
  const totalPushesRow = totalsRowByLabel.get('total pushes');
  const winPctRow = totalsRowByLabel.get('win percentage');

  // Build player definitions by scanning headers for '<Name> Bet Amount' pattern
  const playersDefs: {
    name: string;
    betKey: string | null;
    resultKey: string | null;
    altBetKey: string | null;
  }[] = [];

  const headerSet = new Set(headers.map(h => h.trim()));

  for (const h of headers) {
    const m = h.match(/(.+)\s+Bet Amount/i);
    if (m) {
      const name = m[1].trim();
      // find result column for this player: try exact match first, then flexible match
      const possibleResult = `${name} Win/Lose/Push`;
      let resultKey: string | null = null;
      if (headerSet.has(possibleResult)) {
        resultKey = possibleResult;
      } else {
        // flexible match: find any header that starts with the player name and contains win/lose/push
        const found = headers.find(x => {
          const lower = x.toLowerCase();
          const nameLower = name.toLowerCase();
          return lower.startsWith(nameLower) && /win|lose|push/.test(lower);
        });
        resultKey = found ?? null;
      }
      // alt bet key could be a column equal to the player's name
      const altBetKey = headerSet.has(name) ? name : null;
      playersDefs.push({ name, betKey: h, resultKey, altBetKey });
    }
  }

  // Force-include known players if their headers exist but weren't matched
  function ensurePlayer(name: string) {
    const betHeader = headers.find(h => h.toLowerCase() === `${name.toLowerCase()} bet amount`);
    if (!betHeader) return;
    const already = playersDefs.some(pd => pd.name.toLowerCase() === name.toLowerCase());
    if (already) return;
    const possibleResult = `${name} Win/Lose/Push`;
    const resultKey = headers.find(h => h.toLowerCase() === possibleResult.toLowerCase())
      || headers.find(h => h.toLowerCase().startsWith(name.toLowerCase()) && /win|lose|push/.test(h.toLowerCase()))
      || null;
    const altBetKey = headers.find(h => h.trim().toLowerCase() === name.toLowerCase()) || null;
    playersDefs.push({ name, betKey: betHeader, resultKey, altBetKey });
  }

  ensurePlayer('Brandon');
  ensurePlayer('Evan');

  // Define players to exclude per season
  const excludedPlayers: Record<string, string[]> = {
    'Season 1': ['Nathan', 'Jaime', 'Brandon', 'Evan'],
    'Season 2': ['Nathan', 'Jaime', 'Brandon', 'Evan'],
    'Season 3': ['Nathan', 'Brandon', 'Evan']
  };
  const excluded = excludedPlayers[sheetName] || [];

  // Aggregate per player
  const playersAgg: Player[] = playersDefs
    .filter(pd => !excluded.includes(pd.name))
    .map((pd, idx) => {
      let totalBet = 0;
      let wins = 0;
      let losses = 0;
      let pushes = 0;
      const recentResults: string[] = [];
      let currentDivision: 'Legends' | 'Leaders' = 'Leaders';

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        // prefer betKey, else altBetKey
        const betVal = pd.betKey && row[pd.betKey] !== undefined ? row[pd.betKey] : (pd.altBetKey && row[pd.altBetKey] !== undefined ? row[pd.altBetKey] : null);
        totalBet += parseNumber(betVal, 0);

        const resVal = pd.resultKey ? row[pd.resultKey] : null;
        const code = String(resVal ?? '').trim().toUpperCase();
        if (code.startsWith('W')) wins++;
        else if (code.startsWith('L')) losses++;
        else if (code.startsWith('P')) pushes++;
        // collect for streak calculation (we'll reverse later)
        recentResults.push(code ? (code.startsWith('W') ? 'W' : code.startsWith('L') ? 'L' : code.startsWith('P') ? 'P' : '') : '');

        // For Season 4, extract division from bet description (most recent week determines current division)
        if (sheetName === 'Season 4' && pd.altBetKey) {
          const betDesc = String(row[pd.altBetKey] ?? '').toLowerCase();
          if (betDesc.includes('(legends)')) {
            currentDivision = 'Legends';
          } else if (betDesc.includes('(leaders)')) {
            currentDivision = 'Leaders';
          }
        }
      }

      // compute streak from most recent weeks: reverse recentResults
      const streak = computeStreak(recentResults.slice().reverse());

      const winDenom = winPctIncludePushes ? (wins + losses + pushes) : (wins + losses);
      const winPct = winDenom > 0 ? Math.round((wins / winDenom) * 1000) / 10 : 0;

      const chronologicalResults = recentResults.filter(r => r === 'W' || r === 'L' || r === 'P');
      const lastTen = chronologicalResults.slice(-10);
      const lastTenWL = lastTen.filter(r => r === 'W' || r === 'L');
      const last10Wins = lastTenWL.filter(r => r === 'W').length;
      const last10Losses = lastTenWL.filter(r => r === 'L').length;
      const last10Games = lastTenWL.length;
      const last10WinPct = last10Games > 0 ? Math.round((last10Wins / last10Games) * 1000) / 1000 : 0;
      const allTimeWinPct = allTimeWinPctMap.get(pd.name) ?? winPct;

      playerMeta.set(pd.name, {
        initialDivision: currentDivision,
        last10WinPct,
        last10Wins,
        last10Losses,
        allTimeWinPct,
      });

      return {
        id: idx + 1,
        name: pd.name,
        division: currentDivision,
        seasonBetTotal: totalBet,
        seasonRecord: `${wins}-${losses}-${pushes}`,
        wins,
        losses,
        pushes,
        winPercentage: winPct,
        currentStreak: streak
      } as Player;
    });

  // Fall back to totals rows when weekly win/loss/push columns contain errors (#NAME?, etc.)
  if (totalWinsRow || totalLossesRow || totalPushesRow || winPctRow) {
    for (const player of playersAgg) {
      const totalsCol = totalsColumnByPlayer.get(player.name);
      if (!totalsCol) continue;

      const winsFromTotals = totalWinsRow ? parseNumber(totalWinsRow[totalsCol], NaN) : NaN;
      const lossesFromTotals = totalLossesRow ? parseNumber(totalLossesRow[totalsCol], NaN) : NaN;
      const pushesFromTotals = totalPushesRow ? parseNumber(totalPushesRow[totalsCol], NaN) : NaN;
      const pctFromTotals = winPctRow ? parseNumber(winPctRow[totalsCol], NaN) : NaN;

      const totalsSum = (Number.isNaN(winsFromTotals) ? 0 : winsFromTotals)
        + (Number.isNaN(lossesFromTotals) ? 0 : lossesFromTotals)
        + (Number.isNaN(pushesFromTotals) ? 0 : pushesFromTotals);
      const computedSum = player.wins + player.losses + player.pushes;

      const hasTotalsData = !Number.isNaN(winsFromTotals) || !Number.isNaN(lossesFromTotals) || !Number.isNaN(pushesFromTotals);
      const shouldOverride = hasTotalsData && totalsSum > 0 && computedSum === 0;
      if (!shouldOverride) continue;

      if (!Number.isNaN(winsFromTotals)) player.wins = winsFromTotals;
      if (!Number.isNaN(lossesFromTotals)) player.losses = lossesFromTotals;
      if (!Number.isNaN(pushesFromTotals)) player.pushes = pushesFromTotals;

      const denom = player.wins + player.losses + (winPctIncludePushes ? player.pushes : 0);
      if (!Number.isNaN(pctFromTotals)) {
        player.winPercentage = pctFromTotals;
      } else if (denom > 0) {
        player.winPercentage = Math.round((player.wins / denom) * 1000) / 10;
      }

      player.seasonRecord = `${player.wins}-${player.losses}-${player.pushes}`;
    }
  }

  // Count completed weeks (rows with at least one recorded result) to know when promotion rules apply
  let weeksWithResults = 0;
  for (const row of rows) {
    const hasResult = playersDefs.some(pd => {
      if (!pd.resultKey) return false;
      const code = String(row[pd.resultKey] ?? '').trim().toUpperCase();
      return code.startsWith('W') || code.startsWith('L') || code.startsWith('P');
    });
    if (hasResult) {
      weeksWithResults++;
    }
  }

  const probationWeeks = 4;
  const totalPlayers = playersAgg.length;
  const legendsSlots = Math.min(6, totalPlayers);

  if (weeksWithResults > probationWeeks && legendsSlots > 0 && totalPlayers > legendsSlots) {
    type RankedPlayer = {
      player: Player;
      idx: number;
      meta: PlayerMeta;
    };

    const ranked: RankedPlayer[] = playersAgg.map((player, idx) => ({
      player,
      idx,
      meta: playerMeta.get(player.name) ?? {
        initialDivision: player.division,
        last10WinPct: 0,
        last10Wins: 0,
        last10Losses: 0,
        allTimeWinPct: player.winPercentage,
      },
    }));

    ranked.sort((a, b) => {
      if (b.player.winPercentage !== a.player.winPercentage) {
        return b.player.winPercentage - a.player.winPercentage;
      }

      if (a.meta.initialDivision !== b.meta.initialDivision) {
        return a.meta.initialDivision === 'Legends' ? -1 : 1;
      }

      if (b.meta.last10WinPct !== a.meta.last10WinPct) {
        return b.meta.last10WinPct - a.meta.last10WinPct;
      }
      if (b.meta.last10Wins !== a.meta.last10Wins) {
        return b.meta.last10Wins - a.meta.last10Wins;
      }
      if (a.meta.last10Losses !== b.meta.last10Losses) {
        return a.meta.last10Losses - b.meta.last10Losses;
      }
      if (b.meta.allTimeWinPct !== a.meta.allTimeWinPct) {
        return b.meta.allTimeWinPct - a.meta.allTimeWinPct;
      }
      return a.idx - b.idx;
    });

    ranked.forEach((entry, idx) => {
      entry.player.division = idx < legendsSlots ? 'Legends' : 'Leaders';
    });

    return ranked.map(entry => entry.player);
  }

  return playersAgg;
}

export async function fetchSeasonData(sheetName = 'Season 1', winPctIncludePushes = false): Promise<SeasonData> {
  const res = await fetch(`/api/data?sheet=${encodeURIComponent(sheetName)}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch sheet data: ${res.status} ${txt}`);
  }

  const rows: WeeklyRow[] = await res.json();
  if (!rows || rows.length === 0) {
    return {
      players: [],
      stats: { parlaysHit: 0, overallWinPercentage: 0, totalWeeks: 0, seasonWins: 0, longestWinStreak: { player: '', length: 0 }, longestLoseStreak: { player: '', length: 0 }, longestPushStreak: { player: '', length: 0 } }
    };
  }

  // Get players using existing logic
  const players = await fetchSeasonPlayers(sheetName, winPctIncludePushes);

  // Calculate season stats
  const headers = Object.keys(rows[0]);
  
  // Build player definitions again to check weekly results
  const playersDefs: {
    name: string;
    resultKey: string | null;
    altBetKey: string | null;
  }[] = [];

  const headerSet = new Set(headers.map(h => h.trim()));

  for (const h of headers) {
    const m = h.match(/(.+)\s+Bet Amount/i);
    if (m) {
      const name = m[1].trim();
      const possibleResult = `${name} Win/Lose/Push`;
      let resultKey: string | null = null;
      if (headerSet.has(possibleResult)) {
        resultKey = possibleResult;
      } else {
        const found = headers.find(x => {
          const lower = x.toLowerCase();
          const nameLower = name.toLowerCase();
          return lower.startsWith(nameLower) && /win|lose|push/.test(lower);
        });
        resultKey = found ?? null;
      }
      // alt bet key is the column with just the player's name (contains bet description with division)
      const altBetKey = headerSet.has(name) ? name : null;
      playersDefs.push({ name, resultKey, altBetKey });
    }
  }

  // Apply exclusions
  const excludedPlayers: Record<string, string[]> = {
    'Season 1': ['Nathan', 'Jaime', 'Brandon', 'Evan'],
    'Season 2': ['Nathan', 'Jaime', 'Brandon', 'Evan'],
    'Season 3': ['Nathan', 'Brandon', 'Evan']
  };
  const excluded = excludedPlayers[sheetName] || [];
  const activePlayers = playersDefs.filter(pd => !excluded.includes(pd.name));

  // Calculate stats
  let parlaysHit = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalPushes = 0;
  let completedWeeks = 0;
  let seasonWins = 0;
  let bestWin = { player: '', length: 0 };
  let bestLose = { player: '', length: 0 };

  // Check each week for division wins and parlay hits
  for (const row of rows) {
    let allWonOrPushed = true; // No losses allowed
    let hasData = false;
    let legendsWinOrPush = true;
    let leadersWinOrPush = true;
    let hasLegendsData = false;
    let hasLeadersData = false;

    for (const pd of activePlayers) {
      if (!pd.resultKey) continue;
      const resVal = row[pd.resultKey];
      if (resVal !== null && resVal !== undefined && resVal !== '') {
        hasData = true;
        const code = String(resVal).trim().toUpperCase();
        
        // Determine division for this player in this week (for Season 4)
        let playerDivision = 'Leaders';
        if (sheetName === 'Season 4' && pd.altBetKey) {
          const betDesc = String(row[pd.altBetKey] ?? '').toLowerCase();
          if (betDesc.includes('(legends)')) {
            playerDivision = 'Legends';
            hasLegendsData = true;
          } else if (betDesc.includes('(leaders)')) {
            playerDivision = 'Leaders';
            hasLeadersData = true;
          }
        }
        
        // Check if player lost (not win or push)
        if (!code.startsWith('W') && !code.startsWith('P')) {
          allWonOrPushed = false;
          if (playerDivision === 'Legends') {
            legendsWinOrPush = false;
          } else {
            leadersWinOrPush = false;
          }
        }
        
        // Count overall results
        if (code.startsWith('W')) totalWins++;
        else if (code.startsWith('L')) totalLosses++;
        else if (code.startsWith('P')) totalPushes++;
      }
    }

    if (hasData) {
      completedWeeks++;
      
      // For Season 4, parlay hit = either division has all wins/pushes
      // For earlier seasons, parlay hit = all players won or pushed
      if (sheetName === 'Season 4') {
        if ((hasLegendsData && legendsWinOrPush) || (hasLeadersData && leadersWinOrPush)) {
          parlaysHit++;
          seasonWins++;
        }
      } else {
        // For earlier seasons, parlay/season win = all players won or pushed (no losses)
        if (allWonOrPushed) {
          parlaysHit++;
          seasonWins++;
        }
      }
    }
  }

  // Compute longest win/lose streaks across the season for each active player
  for (const pd of activePlayers) {
    let curW = 0;
    let curL = 0;
    for (const row of rows) {
      if (!pd.resultKey) continue;
      const resVal = row[pd.resultKey];
      const code = String(resVal ?? '').trim().toUpperCase();
      if (code.startsWith('W')) {
        curW++;
        if (curW > bestWin.length) bestWin = { player: pd.name, length: curW };
        curL = 0;
      } else if (code.startsWith('L')) {
        curL++;
        if (curL > bestLose.length) bestLose = { player: pd.name, length: curL };
        curW = 0;
      } else {
        // Push or empty resets both win/lose streak counters
        curW = 0;
        curL = 0;
      }
    }
  }

  const totalBets = totalWins + totalLosses;
  const overallWinPercentage = totalBets > 0 ? Math.round((totalWins / totalBets) * 1000) / 10 : 0;

  return {
    players,
    stats: {
      parlaysHit,
      overallWinPercentage,
      totalWeeks: completedWeeks,
      seasonWins,
      longestWinStreak: bestWin,
      longestLoseStreak: bestLose,
      longestPushStreak: { player: '', length: 0 }
    }
  };
}

export async function fetchPicksByWeek(sheetName = 'Season 1', weekNumber: number): Promise<Pick[]> {
  const res = await fetch(`/api/data?sheet=${encodeURIComponent(sheetName)}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch sheet data: ${res.status} ${txt}`);
  }

  const rows: WeeklyRow[] = await res.json();
  if (!rows || rows.length === 0) return [];

  // find week column
  const headers = Object.keys(rows[0]);
  const weekKey = headers.find(h => /week/i.test(h)) || null;

  // build player defs similar to other functions
  const playersDefs: { name: string; betKey: string | null; resultKey: string | null; altBetKey: string | null; resolvedKey: string | null }[] = [];
  const headerSet = new Set(headers.map(h => h.trim()));
  for (const h of headers) {
    const m = h.match(/(.+)\s+Bet Amount/i);
    if (m) {
      const name = m[1].trim();
      const possibleResult = `${name} Win/Lose/Push`;
      let resultKey: string | null = null;
      if (headerSet.has(possibleResult)) resultKey = possibleResult;
      else {
        const found = headers.find(x => {
          const lower = x.toLowerCase();
          const nameLower = name.toLowerCase();
          return lower.startsWith(nameLower) && /win|lose|push/.test(lower);
        });
        resultKey = found ?? null;
      }
      const altBetKey = headerSet.has(name) ? name : null;
      
      // Find the Resolved column for this player
      const possibleResolved = `${name} Resolved`;
      let resolvedKey: string | null = null;
      if (headerSet.has(possibleResolved)) resolvedKey = possibleResolved;
      else {
        const found = headers.find(x => {
          const lower = x.toLowerCase();
          const nameLower = name.toLowerCase();
          return lower === `${nameLower} resolved`;
        });
        resolvedKey = found ?? null;
      }
      
      playersDefs.push({ name, betKey: h, resultKey, altBetKey, resolvedKey });
    }
  }

  // locate the row for the requested week
  let targetRow: WeeklyRow | undefined;
  if (weekKey) {
    targetRow = rows.find(r => {
      const v = r[weekKey];
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9]/g, ''));
      return Number(n) === Number(weekNumber);
    });
  }
  // fallback: if weekKey missing, use index (1-based)
  if (!targetRow) {
    if (weekNumber - 1 >= 0 && weekNumber - 1 < rows.length) targetRow = rows[weekNumber - 1];
  }

  if (!targetRow) return [];

  // get players list to map names to ids
  const seasonPlayers = await fetchSeasonPlayers(sheetName);

  const picks: Pick[] = [];
  for (const pd of playersDefs) {
    // find matching season player (may be excluded earlier)
    const player = seasonPlayers.find(p => p.name.toLowerCase() === pd.name.toLowerCase());
    if (!player) continue;

    const betVal = pd.betKey && targetRow[pd.betKey] !== undefined ? targetRow[pd.betKey] : (pd.altBetKey && targetRow[pd.altBetKey] !== undefined ? targetRow[pd.altBetKey] : null);
    const amt = parseNumber(betVal, 0);

    // team/description often sits in altBetKey column
    const teamDesc = pd.altBetKey ? String(targetRow[pd.altBetKey] ?? '').trim() : '';
    
    // Get the resolved team/game name from the Resolved column
    const resolvedTeam = pd.resolvedKey ? String(targetRow[pd.resolvedKey] ?? '').trim() : '';

    const resVal = pd.resultKey ? String(targetRow[pd.resultKey] ?? '').trim().toUpperCase() : '';
    let result: Pick['result'] = 'Pending';
    if (resVal.startsWith('W')) result = 'Win';
    else if (resVal.startsWith('L')) result = 'Loss';
    else if (resVal.startsWith('P')) result = 'Push';

    picks.push({
      id: Math.random(),
      week: Number(weekNumber),
      playerId: player.id,
      team: teamDesc || '',
      resolvedTeam: resolvedTeam || undefined,
      odds: '',
      amount: amt,
      result,
      isTail: false,
      isReverseTail: false,
      finalScore: undefined,
      startTime: undefined,
      tvChannel: undefined,
      tailingPlayerId: undefined
    });
  }

  // Post-process picks to resolve tailing: if a pick's team/description equals another player's name,
  // treat it as tailing that player's pick and show the tailed player's bet instead.
  // Build a map of name variants -> playerId to make tail detection flexible
  const nameToPlayerId = new Map<string, number>();
  function addVariants(name: string, id: number) {
    const raw = String(name).trim();
    const lower = raw.toLowerCase();
    nameToPlayerId.set(lower, id);
    // stripped (remove punctuation)
    nameToPlayerId.set(lower.replace(/[^a-z0-9]/g, ''), id);
    // initials (e.g., "John B" -> "jb")
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 1) {
      nameToPlayerId.set(parts[0].toLowerCase(), id); // first name
      nameToPlayerId.set(parts[parts.length - 1].toLowerCase(), id); // last name
      const initials = parts.map(p => p[0]).join('').toLowerCase();
      nameToPlayerId.set(initials, id);
    }
  }
  seasonPlayers.forEach(sp => addVariants(sp.name, sp.id));
  const playerIdToPick = new Map<number, Pick>();
  picks.forEach(pk => playerIdToPick.set(pk.playerId, pk));

  for (const pk of picks) {
    const raw = String(pk.team ?? '').trim();
    const lower = raw.toLowerCase();
    const stripped = lower.replace(/[^a-z0-9]/g, '');
    
    // Extract the division tag from the original pick before processing
    const originalDivisionMatch = raw.match(/\((legends|leaders)\)/i);
    const originalDivisionTag = originalDivisionMatch ? `(${originalDivisionMatch[1].toLowerCase()})` : '';
    
    // Try exact matches first, then stripped, then contained forms
    let targetId: number | undefined = nameToPlayerId.get(lower) ?? nameToPlayerId.get(stripped);
    if (!targetId) {
      // try initials / exact token match
      const token = lower.split(/\s+/)[0];
      targetId = nameToPlayerId.get(token) ?? undefined;
    }
    if (targetId) {
      // resolved targetId
      const targetPick = playerIdToPick.get(targetId);
      if (targetPick) {
        pk.isTail = true;
        pk.tailingPlayerId = targetId;
        // adopt the target player's displayed bet (team, odds, amount, etc.)
        pk.team = targetPick.team;
        pk.odds = targetPick.odds ?? pk.odds;
        pk.amount = pk.amount || targetPick.amount;
        pk.startTime = targetPick.startTime ?? pk.startTime;
        pk.tvChannel = targetPick.tvChannel ?? pk.tvChannel;
        
        // Preserve the original division tag from the tail pick
        // Remove any existing division tags first, then append the original
        if (originalDivisionTag) {
          pk.team = pk.team.replace(/\s*\((legends|leaders)\)\s*$/i, '').trim();
          pk.team = `${pk.team} ${originalDivisionTag}`;
        }
      } else {
        // target player has no pick for this week — leave as-is but mark as tailing
        pk.isTail = true;
        pk.tailingPlayerId = targetId;
      }
    }
  }

  return picks;
}

export async function syncPickResultToSheet(params: {
  sheetName: string;
  weekNumber: number;
  playerName: string;
  result: 'Win' | 'Loss' | 'Push';
}): Promise<void> {
  const { sheetName, weekNumber, playerName, result } = params;
  const res = await fetch('/api/pick-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sheet: sheetName,
      week: weekNumber,
      playerName,
      result,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to sync result for ${playerName}: ${res.status} ${text}`);
  }
}

export async function fetchSeasonWeekCount(sheetName = 'Season 1'): Promise<number> {
  const res = await fetch(`/api/data?sheet=${encodeURIComponent(sheetName)}`);
  if (!res.ok) {
    return 0;
  }
  const rows: WeeklyRow[] = await res.json();
  if (!rows || rows.length === 0) return 0;

  // Try to find a date column header (e.g. 'Date' or 'Game Date')
  const headers = Object.keys(rows[0]);
  const dateKey = headers.find(h => /\bdate\b|game date|game_date/i.test(h));
  if (!dateKey) {
    // no explicit date column — fall back to reporting number of rows
    return rows.length;
  }

  const today = new Date();
  // Count rows where the date cell is present and <= today
  let count = 0;
  for (const row of rows) {
    const raw = row[dateKey];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    // Try to parse date intelligently
    let d: Date | null = null;
    const s = String(raw).trim();
    // Try ISO / Date.parse
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) d = new Date(parsed);
    else {
      // Try common US format MM/DD/YYYY or M/D/YY
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) {
        const mm = Number(m[1]) - 1;
        const dd = Number(m[2]);
        let yyyy = Number(m[3]);
        if (yyyy < 100) yyyy += 2000;
        d = new Date(yyyy, mm, dd);
      }
    }

    if (!d) continue;
    // Normalize time to midnight for comparison
    d.setHours(0,0,0,0);
    const t = new Date(today);
    t.setHours(0,0,0,0);
    if (d.getTime() <= t.getTime()) count++;
  }

  // If no dated rows are <= today, fall back to rows.length to avoid hiding weeks
  return count > 0 ? count : rows.length;
}

export async function fetchAllTimePlayers(winPctIncludePushes = false): Promise<Player[]> {
  // Fetch all seasons in parallel
  const seasons = ['Season 1', 'Season 2', 'Season 3', 'Season 4'];
  const allSeasonData = await Promise.all(
    seasons.map(season => fetchSeasonPlayers(season, winPctIncludePushes).catch(() => []))
  );

  // Aggregate by player name
  const playerMap = new Map<string, {
    totalBet: number;
    wins: number;
    losses: number;
    pushes: number;
    allResults: string[];
  }>();

  for (const seasonPlayers of allSeasonData) {
    for (const player of seasonPlayers) {
      const existing = playerMap.get(player.name);
      if (existing) {
        existing.totalBet += player.seasonBetTotal;
        existing.wins += player.wins;
        existing.losses += player.losses;
        existing.pushes += player.pushes;
        // Add results for this season to the all-time results
        const [w, l, p] = player.seasonRecord.split('-').map(Number);
        for (let i = 0; i < w; i++) existing.allResults.push('W');
        for (let i = 0; i < l; i++) existing.allResults.push('L');
        for (let i = 0; i < p; i++) existing.allResults.push('P');
      } else {
        playerMap.set(player.name, {
          totalBet: player.seasonBetTotal,
          wins: player.wins,
          losses: player.losses,
          pushes: player.pushes,
          allResults: []
        });
        // Initialize with current season results
        const [w, l, p] = player.seasonRecord.split('-').map(Number);
        const results = playerMap.get(player.name)!.allResults;
        for (let i = 0; i < w; i++) results.push('W');
        for (let i = 0; i < l; i++) results.push('L');
        for (let i = 0; i < p; i++) results.push('P');
      }
    }
  }

  // Convert map to Player array
  const allTimePlayers: Player[] = Array.from(playerMap.entries()).map(([name, data], idx) => {
    const winDenom = winPctIncludePushes ? (data.wins + data.losses + data.pushes) : (data.wins + data.losses);
    const winPct = winDenom > 0 ? Math.round((data.wins / winDenom) * 1000) / 10 : 0;

    // Note: For all-time, we don't have a meaningful "current streak" across seasons
    // We'll use the most recent season's streak or compute from all results
    const streak = computeStreak(data.allResults.slice(-20).reverse());

    return {
      id: idx + 1,
      name,
      division: 'Leaders',
      seasonBetTotal: data.totalBet,
      seasonRecord: `${data.wins}-${data.losses}-${data.pushes}`,
      wins: data.wins,
      losses: data.losses,
      pushes: data.pushes,
      winPercentage: winPct,
      currentStreak: streak
    } as Player;
  });

  return allTimePlayers;
}

export async function fetchAllTimeData(winPctIncludePushes = false): Promise<SeasonData> {
  // Fetch all seasons in parallel
  const seasons = ['Season 1', 'Season 2', 'Season 3', 'Season 4'];
  const allSeasonData = await Promise.all(
    seasons.map(season => fetchSeasonData(season, winPctIncludePushes).catch(() => ({ players: [], stats: { parlaysHit: 0, overallWinPercentage: 0, totalWeeks: 0, seasonWins: 0, longestWinStreak: { player: '', length: 0 }, longestLoseStreak: { player: '', length: 0 } } })))
  );

  // Aggregate players
  const players = await fetchAllTimePlayers(winPctIncludePushes);

  // Aggregate stats
  let totalParlaysHit = 0;
  let totalSeasonWins = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalWeeks = 0;

  for (const seasonData of allSeasonData) {
    totalParlaysHit += seasonData.stats.parlaysHit;
    totalSeasonWins += seasonData.stats.seasonWins;
    totalWeeks += seasonData.stats.totalWeeks;
    // Calculate wins/losses from players in each season
    for (const player of seasonData.players) {
      totalWins += player.wins;
      totalLosses += player.losses;
    }
  }

  const totalBets = totalWins + totalLosses;
  const overallWinPercentage = totalBets > 0 ? Math.round((totalWins / totalBets) * 1000) / 10 : 0;

  // Compute all-time longest push streak by scanning weekly rows across seasons
  type PD = { name: string; resultKey: string | null };
  function buildPlayerDefs(headers: string[]) {
    const headerSet = new Set(headers.map(h => h.trim()));
    const defs: PD[] = [];
    for (const h of headers) {
      const m = h.match(/(.+)\s+Bet Amount/i);
      if (m) {
        const name = m[1].trim();
        const possibleResult = `${name} Win/Lose/Push`;
        let resultKey: string | null = null;
        if (headerSet.has(possibleResult)) {
          resultKey = possibleResult;
        } else {
          const found = headers.find(x => {
            const lower = x.toLowerCase();
            const nameLower = name.toLowerCase();
            return lower.startsWith(nameLower) && /win|lose|push/.test(lower);
          });
          resultKey = found ?? null;
        }
        defs.push({ name, resultKey });
      }
    }
    return defs;
  }

  const excludedPlayers: Record<string, string[]> = {
    'Season 1': ['Nathan', 'Jaime', 'Brandon', 'Evan'],
    'Season 2': ['Nathan', 'Jaime', 'Brandon', 'Evan'],
    'Season 3': ['Nathan', 'Brandon', 'Evan']
  };

  const pushStreakMap = new Map<string, { current: number; best: number }>();
  const winStreakMap = new Map<string, { current: number; best: number }>();
  const loseStreakMap = new Map<string, { current: number; best: number }>();

  // Fetch raw rows for each season sequentially to maintain chronology
  for (const season of seasons) {
    const res = await fetch(`/api/data?sheet=${encodeURIComponent(season)}`);
    if (!res.ok) continue;
    const rows = (await res.json()) as WeeklyRow[];
    if (!rows || rows.length === 0) continue;
    const headers = Object.keys(rows[0]);
    // Build per-season defs and apply exclusions
    let defs = buildPlayerDefs(headers);
    const excluded = excludedPlayers[season] || [];
    defs = defs.filter(d => !excluded.includes(d.name));

    // Advance streaks across this season's weeks in order
    for (const row of rows) {
      for (const d of defs) {
        if (!d.resultKey) continue;
        const raw = row[d.resultKey];
        const code = String(raw ?? '').trim().toUpperCase();
        const isPush = code.startsWith('P');
        const isWin = code.startsWith('W');
        const isLose = code.startsWith('L');
        const entry = pushStreakMap.get(d.name) || { current: 0, best: 0 };
        if (isPush) {
          entry.current += 1;
          if (entry.current > entry.best) entry.best = entry.current;
        } else if (code) {
          // Any non-empty non-push result breaks the push streak
          entry.current = 0;
        } else {
          // Empty cell (future week) also breaks continuity for push streak
          entry.current = 0;
        }
        pushStreakMap.set(d.name, entry);

        // win streak tracking
        const wentry = winStreakMap.get(d.name) || { current: 0, best: 0 };
        if (isWin) {
          wentry.current += 1;
          if (wentry.current > wentry.best) wentry.best = wentry.current;
        } else if (code) {
          wentry.current = 0;
        } else {
          wentry.current = 0;
        }
        winStreakMap.set(d.name, wentry);

        // lose streak tracking
        const lentry = loseStreakMap.get(d.name) || { current: 0, best: 0 };
        if (isLose) {
          lentry.current += 1;
          if (lentry.current > lentry.best) lentry.best = lentry.current;
        } else if (code) {
          lentry.current = 0;
        } else {
          lentry.current = 0;
        }
        loseStreakMap.set(d.name, lentry);
      }
    }
  }

  let longestPushStreak = { player: '', length: 0 };
  for (const [name, val] of Array.from(pushStreakMap.entries())) {
    if (val.best > longestPushStreak.length) {
      longestPushStreak = { player: name, length: val.best };
    }
  }

  let longestWinStreak = { player: '', length: 0 };
  for (const [name, val] of Array.from(winStreakMap.entries())) {
    if (val.best > longestWinStreak.length) {
      longestWinStreak = { player: name, length: val.best };
    }
  }

  let longestLoseStreak = { player: '', length: 0 };
  for (const [name, val] of Array.from(loseStreakMap.entries())) {
    if (val.best > longestLoseStreak.length) {
      longestLoseStreak = { player: name, length: val.best };
    }
  }

  return {
    players,
    stats: {
      parlaysHit: totalParlaysHit,
      overallWinPercentage,
      totalWeeks,
      seasonWins: totalSeasonWins,
      longestWinStreak,
      longestLoseStreak,
      longestPushStreak
    }
  };
}

/**
 * Try to resolve a freeform pick text (e.g. "Kansas -14") for a given season week
 * into a specific game by using the week's date and searching nearby schedule sheets.
 * Returns an array of candidate matches with parsed schedule row, date and spread if found.
 */
export async function resolvePickToGame(
  sheetName: string = 'Season 1',
  weekNumber: number,
  pickText: string,
  scheduleSheetNames: string[] | null = null
): Promise<Array<{ sheet: string; row: Record<string, any>; parsedDate?: string; spread?: number; home?: string; away?: string }>> {
  // Normalize pick text
  const txt = String(pickText ?? '').trim();
  if (!txt) return [];

  // Extract numeric spread (e.g. -14, 14.5)
  const spreadMatch = txt.match(/(-?\d+(?:\.\d+)?)/);
  const spreadVal = spreadMatch ? Number(spreadMatch[1]) : null;

  // Extract team token(s) before the spread (common format: "Team -14" or "Team +3")
  let teamPart = txt;
  if (spreadMatch) teamPart = txt.substring(0, spreadMatch.index).trim();
  // remove trailing punctuation
  teamPart = teamPart.replace(/[\(\)\[\]\-–—:]$/g, '').trim();

  // Determine the week's date from the season sheet (use date column if present)
  const res = await fetch(`/api/data?sheet=${encodeURIComponent(sheetName)}`);
  if (!res.ok) return [];
  const rows: WeeklyRow[] = await res.json();
  if (!rows || rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  // try to find a Week column and a Date column
  const weekKey = headers.find(h => /week/i.test(h)) || null;
  const dateKey = headers.find(h => /\bdate\b|game date|game_date/i.test(h)) || null;

  let targetRow: WeeklyRow | undefined;
  if (weekKey) {
    targetRow = rows.find(r => {
      const v = r[weekKey];
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9]/g, ''));
      return Number(n) === Number(weekNumber);
    });
  }
  if (!targetRow) {
    if (weekNumber - 1 >= 0 && weekNumber - 1 < rows.length) targetRow = rows[weekNumber - 1];
  }
  if (!targetRow) return [];

  // parse the week's date; if no date column, fall back to the row index and no date-window filtering
  let weekDate: Date | null = null;
  if (dateKey && targetRow[dateKey]) {
    const raw = String(targetRow[dateKey]).trim();
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) weekDate = new Date(parsed);
    else {
      const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) {
        let yyyy = Number(m[3]);
        if (yyyy < 100) yyyy += 2000;
        weekDate = new Date(yyyy, Number(m[1]) - 1, Number(m[2]));
      }
    }
  }

  // Build search window: from weekDate (inclusive) to weekDate + 7 days (exclusive)
  let windowStart: number | null = null;
  let windowEnd: number | null = null;
  if (weekDate) {
    const s = new Date(weekDate);
    s.setHours(0,0,0,0);
    const e = new Date(s);
    e.setDate(e.getDate() + 7);
    windowStart = s.getTime();
    windowEnd = e.getTime();
  }

  // candidate schedule sheet names to try
  const candidates = scheduleSheetNames && scheduleSheetNames.length > 0
    ? scheduleSheetNames
    : [
      `${sheetName} Schedule`,
      'Schedule',
      'Games',
      'Game Schedule',
      'Season Schedule',
    ];

  const results: Array<{ sheet: string; row: Record<string, any>; parsedDate?: string; spread?: number; home?: string; away?: string }> = [];

  // helper to parse date-like cells
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

  // helper to find numeric spread in a row
  function findSpreadInRow(row: Record<string, any>): number | null {
    for (const k of Object.keys(row)) {
      const v = row[k];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      const m = s.match(/(-?\d+(?:\.\d+)?)/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  // For each candidate schedule sheet, fetch and try to match
  for (const sheet of candidates) {
    try {
      const r = await fetch(`/api/data?sheet=${encodeURIComponent(sheet)}`);
      if (!r.ok) continue;
      const srows: Record<string, any>[] = await r.json();
      if (!srows || srows.length === 0) continue;

      // find likely date/home/away/team/spread keys
      const sheaders = Object.keys(srows[0]);
      const dateKeys = sheaders.filter(h => /\bdate\b|game_date|game date/i.test(h));
      const homeKeys = sheaders.filter(h => /home|visitor|away|team1|team_home|team/i.test(h));
      const awayKeys = sheaders.filter(h => /away|visitor|opponent|team2|team_away/i.test(h));
      const spreadKeys = sheaders.filter(h => /spread|line|pointspread|odds|total/i.test(h));

      for (const row of srows) {
        // parse date if available
        let parsedDate: Date | null = null;
        for (const dk of dateKeys) {
          parsedDate = tryParseDate(row[dk]);
          if (parsedDate) break;
        }

        if (windowStart && windowEnd && parsedDate) {
          const t = new Date(parsedDate);
          t.setHours(0,0,0,0);
          const tt = t.getTime();
          if (tt < windowStart || tt >= windowEnd) continue; // out of week window
        }

        // locate home/away/team strings
        let home: string | undefined;
        let away: string | undefined;
        for (const hk of homeKeys) {
          const v = row[hk]; if (v && String(v).trim()) { home = String(v).trim(); break; }
        }
        for (const ak of awayKeys) {
          const v = row[ak]; if (v && String(v).trim()) { away = String(v).trim(); break; }
        }
        // if only one team column exists, try to split by ' at ' or ' vs '
        if ((!home || !away) && Object.keys(row).length > 0) {
          const vals = Object.values(row).map(v => String(v ?? '').trim()).filter(Boolean);
          for (const v of vals) {
            const m = v.match(/(.+)\s+at\s+(.+)/i) || v.match(/(.+)\s+vs\.?\s+(.+)/i) || v.match(/(.+)\s+v\s+(.+)/i);
            if (m) { home = m[2].trim(); away = m[1].trim(); break; }
          }
        }

        // match team name substring (teamPart) against home or away
        const tp = teamPart.toLowerCase();
        let teamMatch = false;
        if (home && home.toLowerCase().includes(tp)) teamMatch = true;
        if (away && away.toLowerCase().includes(tp)) teamMatch = true;
        // also try to match against any cell value
        if (!teamMatch) {
          for (const v of Object.values(row)) {
            if (!v) continue;
            if (String(v).toLowerCase().includes(tp)) { teamMatch = true; break; }
          }
        }

        if (!teamMatch) continue;

        // Try to find a spread value in the row to compare
        let rowSpread: number | null = null;
        for (const sk of spreadKeys) {
          const v = row[sk]; if (v === undefined || v === null) continue;
          const m = String(v).match(/(-?\d+(?:\.\d+)?)/);
          if (m) { rowSpread = Number(m[1]); break; }
        }
        if (rowSpread === null) {
          // try any numeric in the row
          rowSpread = findSpreadInRow(row);
        }

        // If the pick had a spread, compare magnitude (allow small rounding differences)
        if (spreadVal !== null && rowSpread !== null) {
          if (Math.abs(Math.abs(spreadVal) - Math.abs(rowSpread)) > 1.0) {
            // spread mismatch — skip
            continue;
          }
        }

        results.push({ sheet, row, parsedDate: parsedDate ? parsedDate.toISOString() : undefined, spread: rowSpread ?? undefined, home, away });
      }
    } catch (e) {
      // ignore fetch/parsing errors for candidate sheet and continue
      continue;
    }
  }

  return results;
}

/**
 * Fetch game details from ESPN for a resolved pick
 */
export interface GameDetails {
  gameId: string;
  gameName: string;
  shortName: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbrev: string;
  awayAbbrev: string;
  gameDate: string;
  gameDateFormatted: string;
  venue?: string;
  city?: string;
  state?: string;
  broadcasts: string[];
  status: 'scheduled' | 'live' | 'final';
  statusDetail: string;
  homeScore?: number;
  awayScore?: number;
  spread?: number;
  overUnder?: number;
  favoriteTeam?: string;
  matchedTeam: string;
  resolvedText: string;
}

export async function fetchGameDetails(resolvedText: string, sport: string = 'nfl'): Promise<GameDetails | null> {
  if (!resolvedText) return null;
  
  try {
    const res = await fetch(`/api/game-details?resolved=${encodeURIComponent(resolvedText)}&sport=${encodeURIComponent(sport)}`);
    if (!res.ok) {
      console.error('Failed to fetch game details:', res.status);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error('Error fetching game details:', error);
    return null;
  }
}

export default { fetchSeasonPlayers, fetchAllTimePlayers, fetchSeasonData, fetchAllTimeData };
