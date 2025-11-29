import { getSheetData } from '../server/googleSheets';

async function main() {
  const data = await getSheetData('Season 4');
  
  const players = ['Mitch', 'Phil', 'Bryce', 'Cory', 'JB', 'Ethan', 'Jaime', 'Nathan', 'Evan', 'Brandon'];
  const allPicks = new Map<string, { player: string; weeks: number[] }>();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const week = row['Week'] || (i + 1);

    for (const player of players) {
      const pick = String(row[player] || '').trim();
      if (!pick) continue;

      const key = pick.toLowerCase();
      if (!allPicks.has(key)) {
        allPicks.set(key, { player, weeks: [] });
      }
      allPicks.get(key)!.weeks.push(week);
    }
  }

  console.log('All unique picks by player:\n');
  const byPlayer = new Map<string, Set<string>>();
  
  for (const [pick, info] of allPicks) {
    if (!byPlayer.has(info.player)) {
      byPlayer.set(info.player, new Set());
    }
    byPlayer.get(info.player)!.add(pick);
  }

  for (const player of players) {
    const picks = byPlayer.get(player);
    if (!picks || picks.size === 0) continue;
    
    console.log(`${player} (${picks.size} unique picks):`);
    for (const pick of Array.from(picks).sort()) {
      console.log(`  - ${pick}`);
    }
    console.log();
  }
}

main().catch(console.error);
