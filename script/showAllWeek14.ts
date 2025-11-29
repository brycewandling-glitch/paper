import { getSheetRawValues } from '../server/googleSheets';

async function showAllWeek14Data() {
  const rows = await getSheetRawValues('Season 4');
  const week14Row = rows[14];
  
  console.log('Week 14 complete data (all columns):');
  week14Row.forEach((val, idx) => {
    if (val) console.log(`[${idx}]: ${val}`);
  });
}

showAllWeek14Data().catch(console.error);
