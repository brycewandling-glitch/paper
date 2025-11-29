import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SHEET_ID = "1ofqCoqK5C5aZG2HzFaS7ZmlJoF_YbIziHhqX5cq9SW4";
const DEFAULT_SHEET_NAME = "season 1";
const DEFAULT_RANGE_END = "ZZ1000"; // Extend range to include columns beyond Z (AA, AB, ...)

function sheetRangeFor(sheetName = DEFAULT_SHEET_NAME) {
  // Safely wrap sheet name in single quotes and escape existing single quotes
  const safe = String(sheetName).replace(/'/g, "''");
  return `'${safe}'!A1:${DEFAULT_RANGE_END}`;
}

let authClient: any = null;

async function getAuthClient() {
  if (authClient) return authClient;

  const resolvedDir = typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

  const defaultCredentialsPath = path.resolve(
    resolvedDir,
    "..",
    ".env.google.json"
  );

  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH
    ? path.resolve(process.env.GOOGLE_CREDENTIALS_PATH)
    : defaultCredentialsPath;

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials file not found at ${credentialsPath}`
    );
  }

  const credentials = JSON.parse(
    fs.readFileSync(credentialsPath, "utf-8")
  );

  authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return authClient;
}

// Simple in-memory cache to reduce read requests and avoid hitting Sheets quota bursts.
const sheetCache = new Map<string, { ts: number; rows: string[][] }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sheetsGetWithRetry(sheets: any, params: any) {
  const maxAttempts = 5;
  let attempt = 0;
  let backoff = 300; // ms
  while (attempt < maxAttempts) {
    try {
      return await sheets.spreadsheets.values.get(params);
    } catch (err: any) {
      attempt++;
      const message = String(err?.message || err);
      // Retry on rate/quota errors (429) or quota messages in the body
      const isQuota = /quota exceeded|rate.*limit|429|RESOURCE_EXHAUSTED/i.test(message);
      if (!isQuota || attempt >= maxAttempts) throw err;
      // wait and retry
      await sleep(backoff);
      backoff *= 2;
    }
  }
  // should never reach here
  throw new Error('sheetsGetWithRetry: exhausted retries');
}

export async function getSheetData(sheetName?: string) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const range = sheetRangeFor(sheetName);

  // cache key by range
  const cacheKey = range;
  const cached = sheetCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    const rows = cached.rows;
    if (rows.length === 0) return [];

    const headers = rows[0] as string[];
    const data = rows.slice(1).map((row: string[]) => {
      const obj: Record<string, any> = {};
      headers.forEach((header: string, index: number) => {
        obj[header] = row[index] ?? null;
      });
      return obj;
    });
    return data;
  }

  try {
    const response = await sheetsGetWithRetry(sheets, { spreadsheetId: SHEET_ID, range });
    const rows = response.data.values || [];
    if (rows.length === 0) {
      return [];
    }

    // First row is headers
    const headers = rows[0] as string[];
    const data = rows.slice(1).map((row: string[]) => {
      const obj: Record<string, any> = {};
      headers.forEach((header: string, index: number) => {
        obj[header] = row[index] ?? null;
      });
      return obj;
    });

    // store in cache
    try { sheetCache.set(cacheKey, { ts: Date.now(), rows }); } catch (_) {}

    return data;
  } catch (error) {
    console.error("Error reading from Google Sheets:", error);
    throw error;
  }
}

export async function getSheetRawValues(sheetName?: string) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const range = sheetRangeFor(sheetName);

  const cacheKey = range;
  const cached = sheetCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.ts) < CACHE_TTL_MS) return cached.rows;

  try {
    const response = await sheetsGetWithRetry(sheets, { spreadsheetId: SHEET_ID, range });
    const rows = response.data.values || [];
    try { sheetCache.set(cacheKey, { ts: Date.now(), rows }); } catch (_) {}
    return rows as string[][];
  } catch (error) {
    console.error('Error reading from Google Sheets:', error);
    throw error;
  }
}

export async function updateSheetValues(sheetName: string, values: (string | number | null)[][]) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  // update starting at A1 with provided values
  const range = `'${String(sheetName).replace(/'/g, "''")}'!A1`;
  try {
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error updating Google Sheets:', error);
    throw error;
  }
}

export async function appendToSheet(values: any[], sheetName?: string) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const range = sheetRangeFor(sheetName);

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [values],
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error appending to Google Sheets:", error);
    throw error;
  }
}
