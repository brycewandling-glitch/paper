import { getSheetData } from '../server/googleSheets';

async function main() {
  const seasons = ['Season 1', 'Season 2', 'Season 3', 'Season 4'];
  
  for (const season of seasons) {
    try {
      const data = await getSheetData(season);
      console.log(`\n=== ${season} ===`);
      console.log('Sample picks (first 5 weeks):');
      
      for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i];
        const week = row['Week'] || row['week'] || (i + 1);
        const date = row['Date'] || row['date'] || '';
        
        console.log(`\nWeek ${week} (${date}):`);
        
        // Get all pick columns (player names)
        const pickCols = Object.keys(row).filter(k => 
          !k.includes('Bet') && !k.includes('Totals') && 
          !k.includes('Team') && !k.includes('Legend') && 
          !k.includes('Leader') && !k.includes('Payout') &&
          !k.includes('Win') && !k.includes('To Win') &&
          !k.includes('TOTAL') && k.trim().length > 0
        );
        
        for (const col of pickCols) {
          const pick = row[col];
          if (pick && String(pick).trim()) {
            console.log(`  ${col}: ${pick}`);
          }
        }
      }
    } catch (e) {
      console.log(`Could not read ${season}`);
    }
  }
}

main().catch(console.error);
