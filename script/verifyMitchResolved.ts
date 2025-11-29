import { getSheetData } from '../server/googleSheets';

async function main() {
  const data = await getSheetData('Season 4');
  console.log('Mitch picks verification (Week | Original Pick | Resolved):\n');
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const week = row['Week'] || (i + 1);
    const orig = row['Mitch'] || '';
    const resolved = row['Mitch Resolved'] || '';
    
    if (orig) {
      console.log(`Week ${week}:`);
      console.log(`  Original: "${orig}"`);
      console.log(`  Resolved: "${resolved}"`);
      
      // Check if both teams are present (@ symbol indicates away @ home format)
      if (!resolved.includes('@')) {
        console.log(`  ⚠️  WARNING: Missing opponent team`);
      }
      // Check if bet is in parentheses
      if (!resolved.includes('(') || !resolved.includes(')')) {
        console.log(`  ⚠️  WARNING: Missing bet in parentheses`);
      }
      console.log();
    }
  }
}

main().catch(console.error);
