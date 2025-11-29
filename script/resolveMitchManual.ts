import { getSheetRawValues, getSheetData, updateSheetValues } from '../server/googleSheets';

async function main() {
  const sheet = 'Season 4';
  console.log('Building Mitch pick resolution map...\n');

  const raw = await getSheetRawValues(sheet);
  const headers = raw[0].map((h: any) => String(h ?? '').trim());
  const mitchIdx = headers.indexOf('Mitch');
  const mitchResolvedIdx = headers.indexOf('Mitch Resolved');

  if (mitchIdx < 0 || mitchResolvedIdx < 0) {
    console.error('Missing Mitch or Mitch Resolved column');
    process.exit(1);
  }

  const data = await getSheetData(sheet);

  // Manual mapping of Mitch's picks to exact games with ESPN-style format
  const resolutions: { [key: string]: string } = {
    'Kansas -14 (legends)': 'Fresno State University @ University of Kansas (University of Kansas -14)',
    'Alabama -13.5 (legends)': 'University of Texas @ University of Alabama (University of Alabama -13.5)',
    'Ole Miss 1H (legends)': 'North Carolina State @ University of Mississippi (University of Mississippi -7, 1st Half)',
    'Steelers (legends)': 'Cincinnati Bengals @ Pittsburgh Steelers (Pittsburgh Steelers)',
    'JB (legends)': 'Tail JB',
    'Ethan (legends)': 'Tail Ethan',
    'Miami/FSU over (leaders)': 'University of Miami @ Florida State University (Over)',
    'Oregon (quack quack quack) (leaders)': 'University of Washington @ University of Oregon (University of Oregon)',
    'Bryce (leaders)': 'Tail Bryce',
    'USF (leaders)': 'San Jose State University @ University of South Florida (University of South Florida)',
    'georgia tech - tail JB (leaders)': 'Duke University @ Georgia Institute of Technology (Georgia Institute of Technology, Tail JB)',
    'Wake Forest  (leaders)': 'Stanford University @ Wake Forest University (Wake Forest University)',
    'San Jose St. (leaders)': 'University of Nevada Las Vegas @ San Jose State University (San Jose State University)',
    'Ole Miss (team Cory)': 'Texas State University @ University of Mississippi (University of Mississippi, Team Cory)',
  };

  console.log('Mitch picks found:');
  const newRaw = raw.map(r => [...r]);
  let count = 0;

  for (let i = 1; i < newRaw.length; i++) {
    const row = newRaw[i];
    const pickText = String(row[mitchIdx] ?? '').trim();
    
    if (!pickText) continue;

    const resolved = resolutions[pickText];
    if (resolved) {
      row[mitchResolvedIdx] = resolved;
      console.log(`Week ${i}: "${pickText}" → "${resolved}"`);
      count++;
    } else {
      console.log(`Week ${i}: "${pickText}" → NOT MAPPED (add to resolutions object)`);
    }
  }

  console.log(`\nWriting ${count} resolved picks...`);
  await updateSheetValues(sheet, newRaw);
  console.log('Done!');
}

main().catch((e: any) => {
  console.error(e?.message || e);
  process.exit(1);
});
