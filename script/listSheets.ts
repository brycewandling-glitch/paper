import { google } from "googleapis";
import fs from "fs";
import path from "path";

const SHEET_ID = "1ofqCoqK5C5aZG2HzFaS7ZmlJoF_YbIziHhqX5cq9SW4";

async function main() {
  const credentialsPath = path.resolve(
    import.meta.dirname,
    "..",
    ".env.google.json"
  );
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });

  console.log("Available sheets:");
  response.data.sheets?.forEach((s: any) => {
    console.log(`  - ${s.properties?.title}`);
  });
}

main().catch(console.error);
