import { getSheetRawValues, updateSheetValues } from '../server/googleSheets';

function normalizeTeamName(name: string): string {
  return name.toLowerCase()
    .replace(/university of /g, '')
    .replace(/u\.?s\.? /g, 'us ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMatchingGame(pickText: string, gamesThisWeek: string[]): string | null {
  const pickLower = pickText.toLowerCase();
  const normalized = normalizeTeamName(pickText);
  
  for (const game of gamesThisWeek) {
    const gameLower = game.toLowerCase();
    
    // Check if pick text appears anywhere in the game
    if (gameLower.includes(pickLower)) {
      return game;
    }
    
    // Check if normalized version appears
    if (gameLower.includes(normalized)) {
      return game;
    }
    
    // Try partial word matching for abbreviations and team names
    const words = normalized.split(' ').filter(w => w.length > 2);
    for (const word of words) {
      if (gameLower.includes(word)) {
        return game;
      }
    }
  }
  
  return null;
}

// Manual resolutions for picks that need specific game info
const MANUAL_RESOLUTIONS: { [key: string]: string } = {
  // Tail picks - will be resolved in main logic
  'jb (legends)': 'Tail JB',
  'mitch (legends)': 'Tail Mitch',
  'ethan (legends)': 'Tail Ethan',
  'bryce (leaders)': 'Tail Bryce',
  'nate (legends)': 'Tail Nathan',
  'brandon (leaders)': 'Tail Brandon',
  'tail cory (legends)': 'Tail Cory',
  
  // Special cases that need lookup or aren't team/game names
  'ku/fresno o50 (leaders)': 'University of Kansas @ Fresno State University (Over 50)',
  'vikes': 'Minnesota Vikings (Minnesota Vikings)',
  'navy  (legends)': 'United States Naval Academy (United States Naval Academy)',
  'eagles (leaders)': 'Philadelphia Eagles (Philadelphia Eagles)',
  'wisconsin +17.5 (legends)': 'University of Wisconsin (University of Wisconsin +17.5)',
  'unlv (leaders)': 'University of Nevada Las Vegas (University of Nevada Las Vegas)',
  'oklahoma+2.5 (leaders)': 'University of Oklahoma (University of Oklahoma +2.5)',
  'byu (legends)': 'Brigham Young University (Brigham Young University)',
  'byu -3 (leaders)': 'Brigham Young University (Brigham Young University -3)',
  'vandy (legends)': 'Vanderbilt University (Vanderbilt University)',
  'lar (legends)': 'Los Angeles Rams (Los Angeles Rams)',
  'texans (legends)': 'Houston Texans (Houston Texans)',
  'indiana (legends)': 'Indiana University (Indiana University)',
  'brandon (legends)': 'Tail Brandon',
  'usf (leaders)': 'San Jose State University @ University of South Florida (University of South Florida)',
};

async function main() {
  const sheet = 'Season 4';
  console.log('Resolving all player picks for Season 4...\n');

  const raw = await getSheetRawValues(sheet);
  const headers = raw[0].map((h: any) => String(h ?? '').trim());

  const dateIdx = headers.indexOf('Date');
  const mitchIdx = headers.indexOf('Mitch');
  const mitchResolvedIdx = headers.indexOf('Mitch Resolved');
  
  const players = ['Mitch', 'Phil', 'Bryce', 'Cory', 'JB', 'Ethan', 'Jaime', 'Nathan', 'Evan', 'Brandon'];
  const playerIndices = new Map<string, { pickIdx: number; resolvedIdx: number }>();

  for (const player of players) {
    const pickIdx = headers.indexOf(player);
    const resolvedIdx = headers.indexOf(`${player} Resolved`);
    if (pickIdx >= 0 && resolvedIdx >= 0) {
      playerIndices.set(player, { pickIdx, resolvedIdx });
    }
  }

  // Build a game lookup map from ALL existing resolutions, not just Mitch
  const gamesByDate = new Map<string, Set<string>>();
  
  console.log('Building games map from all existing resolutions...');
  for (let r = 1; r < raw.length; r++) {
    const date = String(raw[r][dateIdx] ?? '').trim();
    if (!date) continue;
    
    if (!gamesByDate.has(date)) {
      gamesByDate.set(date, new Set());
    }
    
    // Collect all resolved picks from this week (from any player)
    for (const player of players) {
      const resolvedIdx = headers.indexOf(`${player} Resolved`);
      const resolved = String(raw[r][resolvedIdx] ?? '').trim();
      // Only add non-tail resolutions
      if (resolved && !resolved.includes('Tail')) {
        gamesByDate.get(date)!.add(resolved);
      }
    }
  }
  
  console.log(`Found ${gamesByDate.size} dates with games\n`);

  const newRaw = raw.map(r => [...r]);
  let totalResolved = 0;
  const unresolved: { row: number; player: string; pick: string }[] = [];

  for (let r = 1; r < newRaw.length; r++) {
    const row = newRaw[r];
    const date = String(row[dateIdx] ?? '').trim();
    const gamesThisWeek = Array.from(gamesByDate.get(date) || []);

    for (const player of players) {
      const indices = playerIndices.get(player);
      if (!indices) continue;

      const pickText = String(row[indices.pickIdx] ?? '').trim();
      if (!pickText) continue;
      
      // Skip if empty pick
      if (!pickText) continue;
      
      // Always resolve, even if already has a value
      const pickLower = pickText.toLowerCase();
      
      // Special case: tail picks
      if (pickLower.includes('tail')) {
        const tailTarget = pickText.replace(/tail\s*/i, '').trim();
        row[indices.resolvedIdx] = `Tail ${tailTarget}`;
        totalResolved++;
        continue;
      }

      // Try to find matching game this week
      let resolved = findMatchingGame(pickText, gamesThisWeek);
      
      // Fallback to manual resolutions
      if (!resolved) {
        resolved = MANUAL_RESOLUTIONS[pickLower];
      }
      
      if (resolved) {
        row[indices.resolvedIdx] = resolved;
        totalResolved++;
      } else {
        unresolved.push({ row: r, player, pick: pickText });
      }
    }
  }

  console.log(`Writing ${totalResolved} resolved picks...`);
  if (unresolved.length > 0) {
    console.log(`\nUnresolved picks (${unresolved.length}):`);
    unresolved.slice(0, 30).forEach(u => {
      console.log(`  Week ${u.row}, ${u.player}: "${u.pick}"`);
    });
  }

  await updateSheetValues(sheet, newRaw);
  console.log('Done!');
}

main().catch((e: any) => {
  console.error(e?.message || e);
  process.exit(1);
});
