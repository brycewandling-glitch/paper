/**
 * Game Archiver Service
 * Archives completed game data to Google Sheets for permanent storage
 * This runs automatically 8 days after each week's submission deadline
 */

import { getSheetData, getSheetRawValues, updateSheetCellValue } from './googleSheets';
import { lookupGameByResolvedText, detectSport, type GameDetails } from './espnResolver';
import { log } from './logger';

// Player order for columns AQ through AZ (indices 42-51)
export const PLAYER_ORDER = ['Mitch', 'Phil', 'Bryce', 'Cory', 'JB', 'Ethan', 'Jaime', 'Nathan', 'Evan', 'Brandon'];
export const GAME_DATA_START_COLUMN = 42; // Column AQ = index 42

// Minimum week/season to archive (Season 4, Week 20)
const MIN_ARCHIVE_SEASON = 4;
const MIN_ARCHIVE_WEEK = 20;

// Days after deadline to lock the game data
const DAYS_AFTER_DEADLINE = 8;

// Track archived weeks to avoid re-archiving
const archivedWeeks = new Set<string>();

interface ArchiveResult {
  week: number;
  season: number;
  archivedAt: Date;
  players: { player: string; gameData: string; success: boolean }[];
}

/**
 * Parse archived game data string back into a partial GameDetails object
 * Format: "AwayTeam Score @ HomeTeam Score (Bet)"
 * Example: "Kentucky Wildcats 74 @ Alabama Crimson Tide 89 (-5.5)"
 */
export function parseArchivedGameData(archivedData: string): Partial<GameDetails> | null {
  if (!archivedData || archivedData.startsWith('Tail') || archivedData.startsWith('Reverse Tail')) {
    return null;
  }
  
  // Pattern: "AwayTeam Score @ HomeTeam Score (Bet)"
  // Example: "Kentucky Wildcats 74 @ Alabama Crimson Tide 89 (-5.5)"
  // Example: "Illinois State Redbirds 34 @ Montana State Bobcats 35 (Over 56.5)"
  const match = archivedData.match(/^(.+?)\s+(\d+)\s+@\s+(.+?)\s+(\d+)\s*(?:\((.+?)\))?$/);
  
  if (!match) {
    return null;
  }
  
  const [, awayTeam, awayScoreStr, homeTeam, homeScoreStr, betInfo] = match;
  const awayScore = parseInt(awayScoreStr, 10);
  const homeScore = parseInt(homeScoreStr, 10);
  
  // Parse bet info
  let spread: number | undefined;
  let overUnder: number | undefined;
  let betType: 'spread' | 'total' | 'moneyline' | undefined;
  
  if (betInfo) {
    const ouMatch = betInfo.match(/(Over|Under)\s+(\d+(?:\.\d+)?)/i);
    const spreadMatch = betInfo.match(/^([+-]?\d+(?:\.\d+)?)$/);
    
    if (ouMatch) {
      overUnder = parseFloat(ouMatch[2]);
      betType = 'total';
    } else if (spreadMatch) {
      spread = parseFloat(spreadMatch[1]);
      betType = 'spread';
    } else if (betInfo === 'ML') {
      betType = 'moneyline';
    }
  }
  
  // Calculate cover margin for spread bets
  let coverMargin: number | undefined;
  if (betType === 'spread' && spread !== undefined) {
    // Assuming the bet was on the home team if spread is negative, away if positive
    // This is a simplification - the actual bet team is in the resolved text
    const scoreDiff = homeScore - awayScore;
    coverMargin = scoreDiff + spread;
  }
  
  // Calculate projected total for O/U bets
  let projectedTotal: number | undefined;
  if (betType === 'total') {
    projectedTotal = homeScore + awayScore;
  }
  
  return {
    awayTeam,
    homeTeam,
    awayScore,
    homeScore,
    spread,
    overUnder,
    betType,
    coverMargin,
    projectedTotal,
    status: 'final',
    statusDetail: 'Final',
    gameProgress: 1,
    secondsRemaining: 0,
  };
}

/**
 * Get archived game data for a specific week
 * Returns a map of player name -> archived game data string
 */
export async function getArchivedGameData(
  sheetName: string,
  weekNumber: number
): Promise<Map<string, string> | null> {
  try {
    const raw = await getSheetRawValues(sheetName);
    if (!raw || raw.length < 2) return null;
    
    const headers = raw[0];
    const weekColIndex = headers.findIndex(h => /^week$/i.test(String(h).trim()));
    if (weekColIndex === -1) return null;
    
    // Find the week row
    const weekRowIndex = raw.findIndex((row, idx) => {
      if (idx === 0) return false; // Skip header
      const weekVal = row[weekColIndex];
      const n = typeof weekVal === 'number' ? weekVal : parseInt(String(weekVal).replace(/[^0-9]/g, ''), 10);
      return n === weekNumber;
    });
    
    if (weekRowIndex === -1) return null;
    
    const weekRow = raw[weekRowIndex];
    
    // Check if archived data exists (column AQ = index 42)
    const firstArchivedCell = weekRow[GAME_DATA_START_COLUMN];
    if (!firstArchivedCell || !String(firstArchivedCell).trim()) {
      return null; // No archived data
    }
    
    // Build the map
    const archivedMap = new Map<string, string>();
    for (let i = 0; i < PLAYER_ORDER.length; i++) {
      const player = PLAYER_ORDER[i];
      const colIndex = GAME_DATA_START_COLUMN + i;
      const data = weekRow[colIndex];
      if (data && String(data).trim()) {
        archivedMap.set(player, String(data).trim());
      }
    }
    
    return archivedMap.size > 0 ? archivedMap : null;
  } catch (e) {
    log(`Error getting archived data for week ${weekNumber}: ${e}`, 'archiver');
    return null;
  }
}

/**
 * Format game data for storage in the sheet
 * Format: "AwayTeam Score @ HomeTeam Score (Bet)"
 * Example: "Navy Midshipmen 35 @ Cincinnati Bearcats 13 (-7)" or "Oregon Ducks 23 @ Texas Tech Red Raiders 0 (Over 52.5)"
 */
function formatGameData(gameDetails: GameDetails | undefined, resolved: string, pickText: string): string {
  if (!gameDetails) {
    // If no game details, just store the resolved text
    return resolved || pickText || '';
  }

  const { awayTeam, homeTeam, awayScore, homeScore, betType } = gameDetails;
  
  // Build score string with full team names
  let scoreStr = '';
  if (awayScore !== undefined && homeScore !== undefined) {
    scoreStr = `${awayTeam} ${awayScore} @ ${homeTeam} ${homeScore}`;
  } else {
    scoreStr = `${awayTeam} @ ${homeTeam}`;
  }
  
  // Extract bet info from resolved text since gameDetails may not have it
  let betStr = '';
  
  // Check for spread in resolved text (e.g., "-5.5", "+7")
  const spreadMatch = resolved.match(/([+-]\d+(?:\.\d+)?)\s*\)/);
  // Check for over/under in resolved text (e.g., "Over 56.5", "Under 52.5")
  const ouMatch = resolved.match(/\((Over|Under)\s+(\d+(?:\.\d+)?)\)/i);
  
  if (ouMatch) {
    betStr = `(${ouMatch[1]} ${ouMatch[2]})`;
  } else if (spreadMatch) {
    betStr = `(${spreadMatch[1]})`;
  } else if (betType === 'moneyline') {
    betStr = '(ML)';
  }
  
  return betStr ? `${scoreStr} ${betStr}` : scoreStr;
}

/**
 * Parse date from sheet format (MM/DD/YYYY)
 */
function parseSheetDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = parseInt(match[1], 10) - 1;
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  return new Date(year, month, day);
}

/**
 * Check if a week should be archived based on its deadline date
 */
function shouldArchiveWeek(deadlineDate: Date, now: Date = new Date()): boolean {
  const lockDate = new Date(deadlineDate);
  lockDate.setDate(lockDate.getDate() + DAYS_AFTER_DEADLINE);
  lockDate.setHours(0, 0, 0, 0);
  
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  return today >= lockDate;
}

/**
 * Get season number from sheet name (e.g., "Season 4" -> 4)
 */
function getSeasonNumber(sheetName: string): number {
  const match = sheetName.match(/season\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Archive game data for a specific week to the Google Sheet
 */
export async function archiveWeekGameData(
  sheetName: string,
  weekNumber: number,
  force: boolean = false
): Promise<ArchiveResult | null> {
  const seasonNumber = getSeasonNumber(sheetName);
  const archiveKey = `${sheetName}:${weekNumber}`;
  
  // Check if already archived (unless forced)
  if (!force && archivedWeeks.has(archiveKey)) {
    log(`Week ${weekNumber} of ${sheetName} already archived, skipping`, 'archiver');
    return null;
  }
  
  // Check minimum season/week requirements
  if (seasonNumber < MIN_ARCHIVE_SEASON) {
    log(`Season ${seasonNumber} is before minimum archive season ${MIN_ARCHIVE_SEASON}, skipping`, 'archiver');
    return null;
  }
  if (seasonNumber === MIN_ARCHIVE_SEASON && weekNumber < MIN_ARCHIVE_WEEK) {
    log(`Week ${weekNumber} is before minimum archive week ${MIN_ARCHIVE_WEEK} for season ${seasonNumber}, skipping`, 'archiver');
    return null;
  }
  
  // Get sheet data
  const data = await getSheetData(sheetName);
  if (!data || data.length === 0) {
    log(`No data found for ${sheetName}`, 'archiver');
    return null;
  }
  
  // Find the week row
  const weekKey = Object.keys(data[0]).find(h => /^week$/i.test(h.trim()));
  if (!weekKey) {
    log(`Week column not found in ${sheetName}`, 'archiver');
    return null;
  }
  
  const weekRowIndex = data.findIndex((row: Record<string, any>) => {
    const v = row[weekKey];
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9]/g, ''), 10);
    return n === weekNumber;
  });
  
  if (weekRowIndex === -1) {
    log(`Week ${weekNumber} not found in ${sheetName}`, 'archiver');
    return null;
  }
  
  const weekRow = data[weekRowIndex];
  
  // Check deadline date
  const dateKey = Object.keys(weekRow).find(h => /^date$/i.test(h.trim()));
  if (dateKey) {
    const deadlineDate = parseSheetDate(String(weekRow[dateKey] || ''));
    if (deadlineDate && !force && !shouldArchiveWeek(deadlineDate)) {
      log(`Week ${weekNumber} deadline not yet passed (${weekRow[dateKey]}), skipping`, 'archiver');
      return null;
    }
  }
  
  // Check if game data column already has data (avoid overwriting)
  const raw = await getSheetRawValues(sheetName);
  if (!raw || raw.length === 0) return null;
  
  const dataRowNumber = weekRowIndex + 2; // +1 for header row, +1 for 1-based
  const existingRow = raw[weekRowIndex + 1] || [];
  
  // Check if first player's game data column already has data
  const firstGameDataCell = existingRow[GAME_DATA_START_COLUMN];
  if (firstGameDataCell && String(firstGameDataCell).trim() && !force) {
    log(`Week ${weekNumber} already has game data archived, skipping (use force=true to overwrite)`, 'archiver');
    archivedWeeks.add(archiveKey);
    return null;
  }
  
  log(`Archiving game data for Week ${weekNumber} of ${sheetName}...`, 'archiver');
  
  const results: { player: string; gameData: string; success: boolean }[] = [];
  
  // Archive each player's game data
  for (let i = 0; i < PLAYER_ORDER.length; i++) {
    const player = PLAYER_ORDER[i];
    const columnIndex = GAME_DATA_START_COLUMN + i;
    
    // Get pick and resolved text
    const pickKey = Object.keys(weekRow).find(h => h.toLowerCase().trim() === player.toLowerCase());
    const resolvedKey = Object.keys(weekRow).find(h => 
      h.toLowerCase().trim() === `${player.toLowerCase()} resolved`
    );
    
    const pickText = pickKey ? String(weekRow[pickKey] || '').trim() : '';
    const resolved = resolvedKey ? String(weekRow[resolvedKey] || '').trim() : '';
    
    if (!pickText && !resolved) {
      results.push({ player, gameData: '', success: true });
      continue;
    }
    
    // Check for tail picks (don't look up game details)
    if (resolved.startsWith('Tail') || resolved.startsWith('Reverse Tail')) {
      const gameData = resolved;
      try {
        await updateSheetCellValue(sheetName, dataRowNumber, columnIndex, gameData);
        results.push({ player, gameData, success: true });
        log(`Archived ${player}: ${gameData}`, 'archiver');
      } catch (e) {
        log(`Failed to archive ${player}: ${e}`, 'archiver');
        results.push({ player, gameData, success: false });
      }
      continue;
    }
    
    // Look up game details
    let gameDetails: GameDetails | undefined;
    try {
      const sport = detectSport(resolved || pickText);
      gameDetails = await lookupGameByResolvedText(resolved, sport, pickText) || undefined;
    } catch (e) {
      log(`Failed to lookup game for ${player}: ${e}`, 'archiver');
    }
    
    // Format and write game data
    const gameData = formatGameData(gameDetails, resolved, pickText);
    
    try {
      await updateSheetCellValue(sheetName, dataRowNumber, columnIndex, gameData);
      results.push({ player, gameData, success: true });
      log(`Archived ${player}: ${gameData}`, 'archiver');
    } catch (e) {
      log(`Failed to archive ${player}: ${e}`, 'archiver');
      results.push({ player, gameData, success: false });
    }
  }
  
  archivedWeeks.add(archiveKey);
  
  return {
    week: weekNumber,
    season: seasonNumber,
    archivedAt: new Date(),
    players: results,
  };
}

/**
 * Check all weeks and archive those that are ready
 * This should be called on a schedule (e.g., daily)
 */
export async function checkAndArchiveReadyWeeks(): Promise<ArchiveResult[]> {
  const results: ArchiveResult[] = [];
  
  // Get list of season sheets to check
  const sheetsToCheck = ['Season 4']; // Add more as needed, or dynamically fetch
  
  for (const sheetName of sheetsToCheck) {
    const seasonNumber = getSeasonNumber(sheetName);
    if (seasonNumber < MIN_ARCHIVE_SEASON) continue;
    
    try {
      const data = await getSheetData(sheetName);
      if (!data || data.length === 0) continue;
      
      const weekKey = Object.keys(data[0]).find(h => /^week$/i.test(h.trim()));
      const dateKey = Object.keys(data[0]).find(h => /^date$/i.test(h.trim()));
      if (!weekKey || !dateKey) continue;
      
      // Check each week
      for (const row of data) {
        const weekValue = row[weekKey];
        const weekNumber = typeof weekValue === 'number' 
          ? weekValue 
          : parseInt(String(weekValue).replace(/[^0-9]/g, ''), 10);
        
        if (isNaN(weekNumber) || weekNumber <= 0) continue;
        
        // Check minimum requirements
        if (seasonNumber === MIN_ARCHIVE_SEASON && weekNumber < MIN_ARCHIVE_WEEK) continue;
        
        // Check if ready to archive
        const dateValue = String(row[dateKey] || '');
        const deadlineDate = parseSheetDate(dateValue);
        if (!deadlineDate) continue;
        
        if (shouldArchiveWeek(deadlineDate)) {
          const result = await archiveWeekGameData(sheetName, weekNumber);
          if (result) {
            results.push(result);
          }
        }
      }
    } catch (e) {
      log(`Error checking ${sheetName} for archiving: ${e}`, 'archiver');
    }
  }
  
  return results;
}

/**
 * Start the archiver scheduler
 * Runs once daily to check for weeks that need archiving
 */
let archiverInterval: NodeJS.Timeout | null = null;

export function startArchiver(): void {
  if (archiverInterval) {
    log('Archiver already running', 'archiver');
    return;
  }
  
  log('Starting game archiver scheduler...', 'archiver');
  
  // Run immediately on startup
  setTimeout(async () => {
    log('Running initial archive check...', 'archiver');
    try {
      const results = await checkAndArchiveReadyWeeks();
      if (results.length > 0) {
        log(`Archived ${results.length} weeks on startup`, 'archiver');
      } else {
        log('No weeks ready for archiving', 'archiver');
      }
    } catch (e) {
      log(`Error during initial archive check: ${e}`, 'archiver');
    }
  }, 10000); // Wait 10 seconds after startup
  
  // Then run every 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  archiverInterval = setInterval(async () => {
    log('Running scheduled archive check...', 'archiver');
    try {
      const results = await checkAndArchiveReadyWeeks();
      if (results.length > 0) {
        log(`Archived ${results.length} weeks`, 'archiver');
      }
    } catch (e) {
      log(`Error during scheduled archive: ${e}`, 'archiver');
    }
  }, TWENTY_FOUR_HOURS);
}

export function stopArchiver(): void {
  if (archiverInterval) {
    clearInterval(archiverInterval);
    archiverInterval = null;
    log('Archiver scheduler stopped', 'archiver');
  }
}
