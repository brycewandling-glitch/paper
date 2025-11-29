import { getSheetRawValues } from '../server/googleSheets';

async function main() {
  const raw = await getSheetRawValues('Season 4');
  const headers = raw[0].map((h: any) => String(h ?? '').trim());
  const dateIdx = headers.indexOf('Date');
  
  const players = ['Mitch', 'Phil', 'Bryce', 'Cory', 'JB', 'Ethan', 'Jaime', 'Nathan', 'Evan', 'Brandon'];
  const playerIndices = new Map<string, number>();
  
  for (const player of players) {
    const idx = headers.indexOf(player);
    if (idx >= 0) playerIndices.set(player, idx);
  }

  // Show all picks with their dates
  console.log('All picks with dates:\n');
  
  for (let r = 1; r < raw.length; r++) {
    const date = String(raw[r][dateIdx] ?? '').trim();
    console.log(`Week ${r} (${date}):`);
    
    for (const player of players) {
      const idx = playerIndices.get(player);
      if (idx === undefined) continue;
      const pick = String(raw[r][idx] ?? '').trim();
      if (pick) {
        console.log(`  ${player}: ${pick}`);
      }
    }
    console.log();
  }
}

main().catch(console.error);
