import { getSheetRawValues } from '../server/googleSheets';

async function checkPicksReturnedForWeek14() {
  const rows = await getSheetRawValues('Season 4');
  
  console.log('Row 0 (headers):', rows[0].slice(0, 40));
  console.log('\nRow 0 type:', typeof rows[0]);
  console.log('Row 0 keys:', Object.keys(rows[0]).slice(0, 40));
}

checkPicksReturnedForWeek14().catch(console.error);
