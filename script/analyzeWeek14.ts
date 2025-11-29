import { getSheetRawValues } from '../server/googleSheets';

async function analyzeWeek14() {
  const rows = await getSheetRawValues('Season 4');
  const week14Row = rows[14];
  const headers = rows[0];
  
  console.log('Week 14 - Raw picks vs Resolved:');
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (header && header.includes('Bet Amount')) continue;
    if (header && header.includes('Win/Lose/Push')) continue;
    if (!header || !week14Row[i]) continue;
    
    if (header.includes('Resolved')) {
      const rawHeader = header.replace(' Resolved', '');
      const rawIdx = headers.indexOf(rawHeader);
      if (rawIdx >= 0) {
        console.log(`\n${header.replace(' Resolved', '')}:`);
        console.log(`  Raw: ${week14Row[rawIdx]}`);
        console.log(`  Resolved: ${week14Row[i]}`);
      }
    }
  }
}

analyzeWeek14().catch(console.error);
