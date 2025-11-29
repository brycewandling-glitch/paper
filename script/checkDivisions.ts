import { getSheetRawValues } from '../server/googleSheets';

async function checkSheet() {
  const rows = await getSheetRawValues('Season 4');
  
  console.log('First few rows to find player division info:');
  rows.slice(0, 3).forEach((row, i) => {
    console.log(`Row ${i}:`, row.slice(0, 25));
  });
}

checkSheet().catch(console.error);
