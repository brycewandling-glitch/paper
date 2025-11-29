import { getSheetRawValues } from '../server/googleSheets';

async function checkHeaders() {
  const rows = await getSheetRawValues('Season 4');
  const headers = rows[0];
  
  console.log('All headers:');
  headers.forEach((h, i) => {
    console.log(`[${i}]: ${h}`);
  });
}

checkHeaders().catch(console.error);
