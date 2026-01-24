import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getSheetData, appendToSheet, getSheetRawValues, updateSheetValues, updateSheetCellValue } from "./googleSheets";
import { resolvePickToGameServer } from './pickResolver';
import { resolvePickFromESPN, getWeekDate, lookupGameByResolvedText, detectSport, type GameDetails } from './espnResolver';
import { ensureWeekRowExists } from './weekManager';
import { archiveWeekGameData, checkAndArchiveReadyWeeks, getArchivedGameData, parseArchivedGameData } from './gameArchiver';

/**
 * Extract potential team name hints from pick text.
 * Returns lowercase team hints for comparison.
 * Also returns whether this appears to be a two-team pick.
 */
function extractTeamHintsFromPick(pickText: string): { hints: string[], isTwoTeamPick: boolean } {
  if (!pickText) return { hints: [], isTwoTeamPick: false };
  
  // Check if this is a two-team pick (has / or space-separated teams before over/under)
  const isTwoTeamPick = /\w+\s*\/\s*\w+/.test(pickText) || 
                        /^\s*\w+\s+\w+\s*\|?\s*(over|under)/i.test(pickText);
  
  // Remove bet type indicators and special markers
  let cleaned = pickText
    .replace(/\((NCAAB|NBA|NFL|FCS|NCAAF|CFB|NHL|MLB|leaders?|dogs?|favorites?|legends?)\)/gi, '')
    .replace(/\b(over|under|ml|moneyline|spread)\b/gi, '')
    .replace(/[+-]?\d+\.?\d*/g, '') // Remove numbers (spreads, totals)
    .replace(/\|/g, ' ') // Replace pipe with space
    .replace(/\//g, ' ') // Replace slash with space  
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  
  // Split into potential team names and filter out empty/short strings
  const hints = cleaned.split(/\s+/).filter(w => w.length >= 2);
  return { hints, isTwoTeamPick };
}

/**
 * Check if pick text team hints are present in resolved text.
 * For two-team picks (like "UMN/NE"), BOTH teams must appear in resolved.
 * For single team picks, at least one hint must match.
 */
function pickMatchesResolved(pickText: string, resolvedText: string): boolean {
  const { hints: pickHints, isTwoTeamPick } = extractTeamHintsFromPick(pickText);
  const resolvedLower = resolvedText.toLowerCase();
  
  // Known team name keywords that should match
  const significantMatches = pickHints.filter(hint => {
    // Skip common non-team words
    if (['the', 'and', 'state', 'university'].includes(hint)) return false;
    return resolvedLower.includes(hint);
  });
  
  // For two-team picks (over/under with both teams), require ALL team hints to match
  // For single team picks, require at least one significant hint to match
  if (isTwoTeamPick) {
    // Filter to just the significant hints (exclude common words)
    const significantHints = pickHints.filter(h => !['the', 'and', 'state', 'university'].includes(h));
    // All significant hints must match
    return significantHints.length > 0 && significantMatches.length === significantHints.length;
  }
  
  return significantMatches.length > 0;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Get data from Google Sheet
  app.get("/api/data", async (req, res) => {
    try {
      const sheet = typeof req.query.sheet === "string" ? req.query.sheet : "Season 4";
      const ensureWeekRaw = typeof req.query.ensureWeek === 'string'
        ? req.query.ensureWeek
        : (typeof req.query.week === 'string' ? req.query.week : undefined);
      const ensureWeekParam = ensureWeekRaw !== undefined ? Number(ensureWeekRaw) : undefined;
      const ensureWeek = Number.isFinite(ensureWeekParam) ? ensureWeekParam : undefined;
      await ensureWeekRowExists({ sheetName: sheet, targetWeek: ensureWeek });
      const data = await getSheetData(sheet);
      res.json(data);
    } catch (error) {
      console.error("API /data error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Append data to Google Sheet
  app.post("/api/data", async (req, res) => {
    try {
      const { values } = req.body;
      if (!values || !Array.isArray(values)) {
        return res.status(400).json({ error: "Invalid data format" });
      }
      const sheet = typeof req.query.sheet === "string" ? req.query.sheet : req.body.sheet;
      const result = await appendToSheet(values, sheet);
      res.json(result);
    } catch (error) {
      console.error("API /data append error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Debug endpoint: show headers and first 2 rows for a sheet
  app.get("/api/debug/headers", async (req, res) => {
    try {
      const sheet = typeof req.query.sheet === "string" ? req.query.sheet : "Season 4";
      const data = await getSheetData(sheet);
      if (!data || data.length === 0) {
        return res.json({ sheet, headers: [], rows: [] });
      }
      const headers = Object.keys(data[0]);
      const preview = data.slice(0, 2);
      res.json({ sheet, headers, rowCount: data.length, preview });
    } catch (error) {
      console.error("API /debug/headers error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Submit a pick for a player - writes bet amount, pick text, and resolved pick
  app.post("/api/submit-pick", async (req, res) => {
    try {
      const sheet = typeof req.query.sheet === "string" ? req.query.sheet : (req.body?.sheet || "Season 4");
      const playerName = req.body?.playerName;
      const betAmount = req.body?.betAmount;
      const pickText = req.body?.pickText; // The actual pick/bet text
      const weekNumber = Number(req.body?.week);
      const division = req.body?.division; // legends or leaders
      const isTail = req.body?.isTail; // Is this a tail pick?
      const isReverseTail = req.body?.isReverseTail; // Is this a reverse tail?
      const tailedPlayerName = req.body?.tailedPlayerName; // Name of player being tailed/faded
      const bodySport = typeof req.body?.sport === 'string' ? req.body.sport.trim().toLowerCase() : undefined;
      const providedSport = bodySport && bodySport !== 'other' ? bodySport : undefined;
      
      if (!playerName || betAmount === undefined || !pickText || Number.isNaN(weekNumber) || weekNumber <= 0) {
        return res.status(400).json({ error: "Missing required fields: playerName, betAmount, pickText, week" });
      }

      const sheetName = String(sheet);

      // Ensure the new week exists (creates it once the Monday threshold is met)
      const raw = await ensureWeekRowExists({ sheetName, targetWeek: weekNumber });
      if (!raw || raw.length === 0) {
        return res.status(400).json({ error: "Empty sheet" });
      }

      const headers = raw[0].map(String);
      const rows = raw.slice(1).map(r => r.map(c => (c === undefined ? '' : c)));

      // Find the week row
      const weekColumnIndex = headers.findIndex(h => /^week$/i.test(h.trim()));
      if (weekColumnIndex === -1) {
        return res.status(400).json({ error: "Week column not found" });
      }

      // Find the row for the target week
      const weekRowIndex = rows.findIndex(row => {
        const weekVal = String(row[weekColumnIndex]).trim();
        return weekVal === String(weekNumber) || parseInt(weekVal) === weekNumber;
      });

      if (weekRowIndex === -1) {
        return res.status(400).json({ error: `Week ${weekNumber} not found` });
      }

      // Find the player's columns - format is: "<Name> Bet Amount", "<Name>", "<Name> Resolved"
      const betAmountCol = headers.findIndex(h => 
        h.toLowerCase().trim() === `${playerName.toLowerCase()} bet amount`
      );
      const pickCol = headers.findIndex(h => 
        h.toLowerCase().trim() === playerName.toLowerCase()
      );
      const resolvedCol = headers.findIndex(h => 
        h.toLowerCase().trim() === `${playerName.toLowerCase()} resolved`
      );

      if (betAmountCol === -1 || pickCol === -1) {
        return res.status(400).json({ 
          error: `Columns not found for player ${playerName}`,
          debug: { betAmountCol, pickCol, resolvedCol, headers: headers.slice(0, 20) }
        });
      }

      // Format the pick text with division tag if provided
      const formattedPick = division 
        ? `${pickText} (${division.toLowerCase()})`
        : pickText;

      // Ensure the row is wide enough
      const maxCol = Math.max(betAmountCol, pickCol, resolvedCol);
      while (rows[weekRowIndex].length <= maxCol) {
        rows[weekRowIndex].push('');
      }

      // Write bet amount (with $ prefix)
      rows[weekRowIndex][betAmountCol] = `$${betAmount}`;
      
      // Write pick text
      rows[weekRowIndex][pickCol] = formattedPick;

      // Generate resolved text
      let resolvedText = '';
      
      if (resolvedCol >= 0) {
        // Handle tail picks
        if (isTail && tailedPlayerName) {
          resolvedText = `Tail ${tailedPlayerName}`;
        }
        // Handle reverse tail picks
        else if (isReverseTail && tailedPlayerName) {
          resolvedText = `Reverse Tail ${tailedPlayerName}`;
        }
        // Regular pick - try to resolve via ESPN API
        else {
          try {
            // Get the week's date from the sheet data
            const seasonData = await getSheetData(sheetName);
            const weekDate = await getWeekDate(seasonData, weekNumber);
            
            if (weekDate) {
              console.log(`[submit-pick] Resolving pick "${pickText}" for week ${weekNumber}, date: ${weekDate.toDateString()}`);
              
              // Try ESPN resolver first
              const espnResult = await resolvePickFromESPN(weekDate, pickText, providedSport);
              
              if (espnResult) {
                resolvedText = espnResult.resolvedText;
                console.log(`[submit-pick] ESPN resolved: ${resolvedText}`);
              }
            }
          } catch (resolveError) {
            console.error('ESPN resolution failed:', resolveError);
          }
          
          // If ESPN didn't find it, try the local schedule resolver
          if (!resolvedText) {
            try {
              const candidates = await resolvePickToGameServer(sheetName, weekNumber, formattedPick, null);
              if (candidates && candidates.length > 0) {
                const c = candidates[0];
                const home = c.home ?? '';
                const away = c.away ?? '';
                
                if (home && away) {
                  resolvedText = `${away} @ ${home}`;
                } else if (home || away) {
                  resolvedText = home || away;
                }
                
                if (c.spread !== undefined) {
                  const spreadStr = c.spread > 0 ? `+${c.spread}` : String(c.spread);
                  resolvedText = `${resolvedText} (${spreadStr})`;
                }
              }
            } catch (localError) {
              console.error('Local resolution failed:', localError);
            }
          }
          
          // If still no resolution, create a formatted resolved text from pick
          if (!resolvedText) {
            let cleanPick = pickText
              .replace(/\s*\((legends|leaders)\)\s*/gi, '')
              .replace(/\s*\((nfl|nba|mlb|nhl|ncaaf|cfb|ncaab|cbb)\)\s*/gi, '')
              .replace(/\s*\|\s*/g, ' ')
              .trim();
            
            // Handle duplicate over/under (e.g., "team over over 53.5" -> "team over 53.5")
            cleanPick = cleanPick.replace(/\b(over|under)\s+(over|under)\s+/gi, '$2 ');
            
            // Check for two-team picks with slash (e.g., "Montana/Montana St over 53.5")
            const twoTeamMatch = cleanPick.match(/^(.+?)\/(.+?)\s+(over|under)\s*(\d+\.?\d*)?\s*$/i);
            if (twoTeamMatch) {
              const team1 = twoTeamMatch[1].trim();
              const team2 = twoTeamMatch[2].trim();
              const ouType = twoTeamMatch[3].toLowerCase().startsWith('o') ? 'Over' : 'Under';
              const total = twoTeamMatch[4];
              if (total) {
                resolvedText = `${team1} @ ${team2} (${ouType} ${total})`;
              } else {
                resolvedText = `${team1} @ ${team2} (${ouType})`;
              }
            } else {
              const spreadMatch = cleanPick.match(/(.+?)\s*([+-]?\d+\.?\d*)\s*$/);
              const overUnderMatch = cleanPick.match(/(.+?)\s*(over|under|o|u)\s*(\d+\.?\d*)\s*$/i);
              
              if (overUnderMatch) {
                const team = overUnderMatch[1].trim();
                const type = overUnderMatch[2].toLowerCase().startsWith('o') ? 'Over' : 'Under';
                const total = overUnderMatch[3];
                resolvedText = `${team} (${type} ${total})`;
              } else if (spreadMatch) {
                const team = spreadMatch[1].trim();
                const spread = spreadMatch[2];
                const spreadNum = parseFloat(spread);
                const spreadStr = spreadNum > 0 ? `+${spread}` : spread;
                resolvedText = `${team} (${team} ${spreadStr})`;
              } else {
                // Just use the clean pick without duplicating it
                resolvedText = cleanPick;
              }
            }
          }
        }
        
        rows[weekRowIndex][resolvedCol] = resolvedText;
      }

      // Rebuild the full values array
      const newValues = [headers, ...rows];
      
      // Update the sheet
      await updateSheetValues(sheetName, newValues);
      
      res.json({ 
        success: true,
        sheet: sheetName, 
        week: weekNumber, 
        player: playerName,
        betAmount,
        pick: formattedPick,
        resolved: resolvedText
      });
    } catch (error) {
      console.error("API /submit-pick error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Look up game details from ESPN by resolved text
  // This can be used to get live scores, broadcast info, etc.
  app.get("/api/game-details", async (req, res) => {
    try {
      const resolvedText = typeof req.query.resolved === "string" ? req.query.resolved : "";
      const sportParam = typeof req.query.sport === "string" && req.query.sport.trim()
        ? req.query.sport.trim()
        : undefined;
      const lookupSport = sportParam || 'nfl';
      const sheetName = typeof req.query.sheet === "string" ? req.query.sheet : undefined;
      const pickText = typeof req.query.pickText === "string" ? req.query.pickText : undefined;
      const weekParam = typeof req.query.week === "string" || typeof req.query.week === "number"
        ? Number(req.query.week)
        : undefined;
      
      if (!resolvedText) {
        return res.status(400).json({ error: "Missing 'resolved' query parameter" });
      }
      
      console.log(`[game-details] Looking up: "${resolvedText}" (sport: ${lookupSport})`);
      
      let gameDetails: GameDetails | null = null;
      const hasMatchupFormatting = /@/.test(resolvedText);
      
      // Check for golf bet first (doesn't have @ formatting)
      const isGolfBet = /golf|pga|to\s*win|scheffler|mcilroy|rahm|koepka/i.test(resolvedText) || 
                        /golf|pga|to\s*win|scheffler|mcilroy|rahm|koepka/i.test(pickText || '');
      
      // Check if pick text teams match resolved text teams
      // If they don't match, the resolved text is probably wrong - try resolving from pickText first
      const hasValidWeek = typeof weekParam === 'number' && Number.isFinite(weekParam) && weekParam > 0;
      const teamsMatch = pickText ? pickMatchesResolved(pickText, resolvedText) : true;
      
      if (!teamsMatch && pickText && sheetName && hasValidWeek) {
        console.log(`[game-details] Teams mismatch detected: pick="${pickText}" vs resolved="${resolvedText}". Resolving from pick text.`);
        try {
          const sheetData = await getSheetData(sheetName);
          const weekDate = await getWeekDate(sheetData, weekParam);
          if (weekDate) {
            // Use sport from pickText since resolved text is wrong
            const pickSport = detectSport(pickText);
            gameDetails = await resolvePickFromESPN(weekDate, pickText, pickSport);
            if (gameDetails) {
              console.log(`[game-details] Re-resolved to: ${gameDetails.gameName}`);
            }
          }
        } catch (mismatchError) {
          console.error("[game-details] Mismatch resolution failed:", mismatchError);
        }
      }
      
      // If no mismatch or mismatch resolution failed, try normal lookup
      if (!gameDetails) {
        if (isGolfBet) {
          // Use the golf lookup directly
          gameDetails = await lookupGameByResolvedText(resolvedText, 'pga', pickText);
        } else if (hasMatchupFormatting) {
          gameDetails = await lookupGameByResolvedText(resolvedText, lookupSport, pickText);
        } else {
          // No @ formatting - could be soccer or other sport with simple team name
          // Try lookupGameByResolvedText which handles soccer detection
          gameDetails = await lookupGameByResolvedText(resolvedText, lookupSport, pickText);
        }
      }

      if (!gameDetails && sheetName && pickText && hasValidWeek) {
        try {
          const sheetData = await getSheetData(sheetName);
          const weekDate = await getWeekDate(sheetData, weekParam);
          if (weekDate) {
            console.log(`[game-details] Fallback ESPN resolve for week ${weekParam} pick "${pickText}"`);
            gameDetails = await resolvePickFromESPN(weekDate, pickText, sportParam);
          }
        } catch (fallbackError) {
          console.error("[game-details] Fallback resolution failed:", fallbackError);
        }
      }

      if (gameDetails) {
        if (gameDetails && typeof gameDetails === 'object' && gameDetails.gameName && gameDetails.gameName.toLowerCase().includes('montana')) {
          console.log('[DEBUG] Montana GameDetails:', JSON.stringify(gameDetails, null, 2));
        }
        res.json(gameDetails);
      } else {
        res.status(404).json({ error: "Game not found", resolved: resolvedText });
      }
    } catch (error) {
      console.error("API /game-details error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Get all picks for a week with their game details
  app.get("/api/week-picks", async (req, res) => {
    try {
      const sheet = typeof req.query.sheet === "string" ? req.query.sheet : "Season 4";
      await ensureWeekRowExists({ sheetName: sheet });
      const weekNumber = parseInt(String(req.query.week || "1"));
      
      const data = await getSheetData(sheet);
      if (!data || data.length === 0) {
        return res.json({ week: weekNumber, picks: [] });
      }
      
      // Find the week row
      const weekKey = Object.keys(data[0]).find(h => /^week$/i.test(h.trim()));
      if (!weekKey) {
        return res.status(400).json({ error: "Week column not found" });
      }
      
      const weekRow = data.find((row: Record<string, any>) => {
        const v = row[weekKey];
        const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9]/g, ''));
        return n === weekNumber;
      });
      
      if (!weekRow) {
        return res.status(404).json({ error: `Week ${weekNumber} not found` });
      }
      
      // Check for archived game data first
      const archivedData = await getArchivedGameData(sheet, weekNumber);
      const hasArchivedData = archivedData && archivedData.size > 0;
      
      // Extract player picks and their resolved values
      const picks: Array<{
        player: string;
        pick: string;
        resolved: string;
        betAmount: string;
        gameDetails?: GameDetails;
        fromArchive?: boolean;
      }> = [];
      
      // Known player names (these should have corresponding bet amount and resolved columns)
      const knownPlayers = ['Ethan', 'Mitch', 'Phil', 'Bryce', 'Cory', 'JB', 'Alex', 'Lucas', 'Kyle', 'Matt', 'Cole', 'Tyler', 'Carley', 'Jon', 'Nathan', 'Jaime', 'Evan', 'Brandon'];
      
      // Get list of players from headers
      const headers = Object.keys(weekRow);
      const playerColumns = headers.filter(h => {
        const lower = h.toLowerCase().trim();
        // Check if it's a known player name (exact match)
        return knownPlayers.some(p => p.toLowerCase() === lower);
      });
      
      for (const playerCol of playerColumns) {
        const playerName = playerCol.trim();
        const pickText = String(weekRow[playerCol] || '').trim();
        const resolvedCol = headers.find(h => 
          h.toLowerCase().trim() === `${playerName.toLowerCase()} resolved`
        );
        const betAmountCol = headers.find(h => 
          h.toLowerCase().trim() === `${playerName.toLowerCase()} bet amount`
        );
        
        if (!pickText) continue;
        
        const resolved = resolvedCol ? String(weekRow[resolvedCol] || '').trim() : '';
        const betAmount = betAmountCol ? String(weekRow[betAmountCol] || '').trim() : '';
        
        // Look up game details - first check archived data, then ESPN
        let gameDetails: GameDetails | undefined;
        let fromArchive = false;
        
        if (resolved && !resolved.startsWith('Tail') && !resolved.startsWith('Reverse Tail')) {
          // Check archived data first
          if (hasArchivedData && archivedData!.has(playerName)) {
            const archivedStr = archivedData!.get(playerName)!;
            const parsed = parseArchivedGameData(archivedStr);
            if (parsed) {
              // Merge with resolved text info
              gameDetails = {
                gameId: 'archived',
                gameName: `${parsed.awayTeam} at ${parsed.homeTeam}`,
                shortName: `${parsed.awayTeam?.split(' ').pop()} @ ${parsed.homeTeam?.split(' ').pop()}`,
                homeTeam: parsed.homeTeam || '',
                awayTeam: parsed.awayTeam || '',
                homeAbbrev: parsed.homeTeam?.split(' ').pop()?.toUpperCase().slice(0, 4) || '',
                awayAbbrev: parsed.awayTeam?.split(' ').pop()?.toUpperCase().slice(0, 4) || '',
                gameDate: '',
                gameDateFormatted: '',
                broadcasts: [],
                status: 'final',
                statusDetail: 'Final',
                homeScore: parsed.homeScore,
                awayScore: parsed.awayScore,
                matchedTeam: parsed.homeTeam || parsed.awayTeam || '',
                resolvedText: resolved,
                spread: parsed.spread,
                overUnder: parsed.overUnder,
                betType: parsed.betType,
                coverMargin: parsed.coverMargin,
                projectedTotal: parsed.projectedTotal,
                gameProgress: 1,
                secondsRemaining: 0,
                winProbability: parsed.coverMargin !== undefined ? (parsed.coverMargin > 0 ? 0.995 : 0.005) : 
                               parsed.projectedTotal !== undefined && parsed.overUnder !== undefined ? 
                               (resolved.toLowerCase().includes('over') ? 
                                 (parsed.projectedTotal > parsed.overUnder ? 0.995 : 0.005) :
                                 (parsed.projectedTotal < parsed.overUnder ? 0.995 : 0.005)) : 0.5,
                probabilitySource: 'heuristic',
                winConfidence: parsed.coverMargin !== undefined ? (parsed.coverMargin > 0 ? 'likely_win' : parsed.coverMargin < 0 ? 'likely_loss' : 'coin_flip') :
                              parsed.projectedTotal !== undefined && parsed.overUnder !== undefined ?
                              (resolved.toLowerCase().includes('over') ?
                                (parsed.projectedTotal > parsed.overUnder ? 'likely_win' : 'likely_loss') :
                                (parsed.projectedTotal < parsed.overUnder ? 'likely_win' : 'likely_loss')) : 'coin_flip',
              };
              fromArchive = true;
            }
          }
          
          // Fall back to ESPN if no archived data
          if (!gameDetails) {
            try {
              // Detect sport from resolved text first, then pick text as fallback
              let sport = detectSport(resolved);
              if (sport === 'nfl' && pickText) {
                // If defaulting to NFL, check if pick text specifies a different sport
                const pickSport = detectSport(pickText);
                if (pickSport !== 'nfl') {
                  sport = pickSport;
                }
              }
              
              // Check if pick text teams match resolved text teams
              // If they don't match, the resolved text is probably wrong - re-resolve from pickText
              const teamsMatch = pickText ? pickMatchesResolved(pickText, resolved) : true;
              
              if (!teamsMatch && pickText) {
                // When teams mismatch, always use sport from pickText since resolved is wrong
                const pickSport = detectSport(pickText);
                console.log(`[Week-Picks] Teams mismatch detected for ${playerName}: pick="${pickText}" vs resolved="${resolved}". Re-resolving from pick text with sport: ${pickSport}`);
                const weekDate = await getWeekDate(data, weekNumber);
                if (weekDate) {
                  const freshDetails = await resolvePickFromESPN(weekDate, pickText, pickSport);
                  if (freshDetails) {
                    gameDetails = freshDetails;
                    console.log(`[Week-Picks] Re-resolved to: ${freshDetails.gameName}`);
                  }
                }
              }
              
              // If still no details (or teams matched), use normal lookup
              if (!gameDetails) {
                const details = await lookupGameByResolvedText(resolved, sport, pickText);
                if (details) {
                  gameDetails = details;
                }
              }
            } catch (e) {
              console.error(`Failed to lookup game for ${playerName}:`, e);
            }
          }
        }
        
        picks.push({
          player: playerName,
          pick: pickText,
          resolved,
          betAmount,
          gameDetails,
          fromArchive
        });
      }
      
      res.json({ week: weekNumber, picks, hasArchivedData });
    } catch (error) {
      console.error("API /week-picks error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/pick-result', async (req, res) => {
    try {
      const sheet = typeof req.body?.sheet === 'string'
        ? req.body.sheet
        : (typeof req.query.sheet === 'string' ? req.query.sheet : 'Season 4');
      const weekNumber = Number(req.body?.week);
      const playerName = typeof req.body?.playerName === 'string' ? req.body.playerName.trim() : '';
      const resultInput = typeof req.body?.result === 'string' ? req.body.result.trim() : '';

      if (!playerName || !weekNumber || Number.isNaN(weekNumber)) {
        return res.status(400).json({ error: 'playerName and week are required' });
      }

      const normalizedResult = resultInput.toLowerCase();
      let resultLetter: 'W' | 'L' | 'P' | null = null;
      if (normalizedResult.startsWith('w')) resultLetter = 'W';
      else if (normalizedResult.startsWith('l')) resultLetter = 'L';
      else if (normalizedResult.startsWith('p')) resultLetter = 'P';

      if (!resultLetter) {
        return res.status(400).json({ error: `Invalid result value: ${resultInput}` });
      }

      const raw = await getSheetRawValues(String(sheet));
      if (!raw || raw.length === 0) {
        return res.status(400).json({ error: 'Empty sheet data' });
      }

      const headers = raw[0].map(String);
      const rows = raw.slice(1);

      const weekColumnIndex = headers.findIndex(h => /week/i.test(String(h)));
      if (weekColumnIndex === -1) {
        return res.status(400).json({ error: 'Week column not found' });
      }

      const weekRowIndex = rows.findIndex(row => {
        const rawValue = row[weekColumnIndex];
        if (rawValue === undefined || rawValue === null) return false;
        const numeric = Number(String(rawValue).replace(/[^0-9]/g, ''));
        return numeric === weekNumber;
      });

      if (weekRowIndex === -1) {
        return res.status(404).json({ error: `Week ${weekNumber} not found` });
      }

      const playerLower = playerName.toLowerCase();
      const exactHeader = headers.findIndex(h => String(h).toLowerCase().trim() === `${playerLower} win/lose/push`);
      const fuzzyHeader = headers.findIndex(h => {
        const lower = String(h).toLowerCase().trim();
        if (!lower.startsWith(playerLower)) return false;
        return lower.includes('win') || lower.includes('lose') || lower.includes('push');
      });
      const resultColIndex = exactHeader >= 0 ? exactHeader : fuzzyHeader;

      if (resultColIndex === -1) {
        return res.status(404).json({ error: `Result column not found for ${playerName}` });
      }

      const existingRaw = rows[weekRowIndex][resultColIndex];
      const existingLetter = String(existingRaw ?? '').trim().toUpperCase();
      if (existingLetter.startsWith(resultLetter)) {
        return res.json({ updated: false, alreadySet: true, value: existingLetter });
      }

      const sheetRowNumber = weekRowIndex + 2; // +1 for header row, +1 for 1-based rows
      await updateSheetCellValue(String(sheet), sheetRowNumber, resultColIndex, resultLetter);

      res.json({ updated: true, sheet, week: weekNumber, playerName, value: resultLetter });
    } catch (error) {
      console.error('API /pick-result error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Update current bet amounts for players (legacy endpoint)
  app.post("/api/update-player-bets", async (req, res) => {
    try {
      const sheet = typeof req.query.sheet === "string" ? req.query.sheet : (req.body?.sheet || "Season 4");
      const betUpdates = req.body?.betUpdates; // { [playerName]: betAmount }
      const weekNumber = req.body?.week; // which week to update
      
      if (!betUpdates || typeof betUpdates !== 'object') {
        return res.status(400).json({ error: "Invalid betUpdates format" });
      }

      if (!weekNumber) {
        return res.status(400).json({ error: "Week number required" });
      }

      // Fetch raw values
      const raw = await getSheetRawValues(String(sheet));
      if (!raw || raw.length === 0) {
        return res.status(400).json({ error: "Empty sheet" });
      }

      const headers = raw[0].map(String);
      const rows = raw.slice(1).map(r => r.map(c => (c === undefined ? '' : c)));

      // Find the week row
      const weekColumnIndex = headers.findIndex(h => /week/i.test(h));
      if (weekColumnIndex === -1) {
        return res.status(400).json({ error: "Week column not found" });
      }

      // Find the row for the target week
      const weekRowIndex = rows.findIndex(row => {
        const weekVal = row[weekColumnIndex];
        return String(weekVal).includes(String(weekNumber)) || parseInt(String(weekVal)) === weekNumber;
      });

      if (weekRowIndex === -1) {
        return res.status(400).json({ error: `Week ${weekNumber} not found` });
      }

      // Update bet amounts for each player in that week row
      for (const [playerName, betAmount] of Object.entries(betUpdates)) {
        // Find the player's column by looking for "<PlayerName> Bet Amount" or similar
        const playerBetColumnIndex = headers.findIndex(h => 
          String(h).toLowerCase().includes(String(playerName).toLowerCase()) && 
          /bet.*amount|amount|bet/i.test(h)
        );
        
        if (playerBetColumnIndex >= 0) {
          // Ensure the row is wide enough
          while (rows[weekRowIndex].length <= playerBetColumnIndex) {
            rows[weekRowIndex].push('');
          }
          rows[weekRowIndex][playerBetColumnIndex] = String(betAmount);
        }
      }

      // Rebuild the full values array
      const newValues = [headers, ...rows];
      
      // Update the sheet
      await updateSheetValues(String(sheet), newValues);
      
      res.json({ sheet, week: weekNumber, updated: Object.keys(betUpdates).length, betUpdates });
    } catch (error) {
      console.error("API /update-player-bets error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Resolve a pick to a schedule/game using the week's date window
  app.get('/api/resolve-pick', async (req, res) => {
    try {
      const sheet = typeof req.query.sheet === 'string' ? req.query.sheet : 'Season 4';
      const week = typeof req.query.week === 'string' ? Number(req.query.week) : Number(req.query.week ?? 1);
      const pick = typeof req.query.pick === 'string' ? req.query.pick : String(req.query.pick ?? '');
      const scheduleSheets = typeof req.query.scheduleSheets === 'string' ? req.query.scheduleSheets.split(',').map(s => s.trim()).filter(Boolean) : null;
      const results = await resolvePickToGameServer(sheet, Number(week), pick, scheduleSheets);
      res.json({ sheet, week, pick, candidates: results });
    } catch (error) {
      console.error('API /resolve-pick error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Annotate a season sheet by inserting "<Player> Resolved" columns to the right of each player's name column
  // and filling with the resolver's best guess (falls back to scanning other cells in the same week row).
  app.post('/api/annotate-season', async (req, res) => {
    try {
      const sheet = typeof req.query.sheet === 'string' ? req.query.sheet : (req.body?.sheet || 'Season 4');

      // fetch raw values (including header row)
      const raw = await getSheetRawValues(String(sheet));
      if (!raw || raw.length === 0) return res.status(400).json({ error: 'empty sheet' });

      const headers: string[] = raw[0].map(String);
      const rows = raw.slice(1).map(r => r.map(c => (c === undefined ? '' : c)));

      // find player names from headers that have a corresponding "<Name> Bet Amount" header
      const betAmountNames: string[] = [];
      for (const h of headers) {
        const m = String(h).match(/(.+)\s+Bet Amount/i);
        if (m) betAmountNames.push(m[1].trim());
      }

      // For each bet name, if a plain name column exists, plan an insertion of a resolved column after it
      const headerCopy = headers.slice();
      const resolvedInsertPositions: { name: string; insertIndex: number }[] = [];
      for (const name of betAmountNames) {
        const idx = headerCopy.findIndex(h => String(h).trim() === name);
        if (idx >= 0) {
          const insertAt = idx + 1;
          // shift subsequent indices by one in headerCopy as we insert
          headerCopy.splice(insertAt, 0, `${name} Resolved`);
          resolvedInsertPositions.push({ name, insertIndex: insertAt });
        }
      }

      // Build new 2D values: headers then each row with inserted resolved cells
      const newValues: (string | number | null)[][] = [];
      newValues.push(headerCopy);

      // helper to find week number in a row
      const weekIndex = headers.findIndex(h => /week/i.test(h));

      for (let r = 0; r < rows.length; r++) {
        const orig = rows[r].slice();
        // Build a mutable array of the current row values and insert resolved placeholders
        const out: (string | number | null)[] = orig.slice();
        // perform insertions in ascending order so indices remain valid
        resolvedInsertPositions.sort((a,b) => a.insertIndex - b.insertIndex);
        for (const pos of resolvedInsertPositions) {
          // ensure out has at least pos.insertIndex elements (pad with empty strings)
          while (out.length < pos.insertIndex) out.push('');

          // find the player's pick text from the original row using the name column
          const nameColIdx = headers.findIndex(h => String(h).trim() === pos.name);
          const pickText = nameColIdx >= 0 ? String(orig[nameColIdx] ?? '').trim() : '';
          const weekVal = weekIndex >= 0 ? orig[weekIndex] : (r+1);
          const weekNum = Number(String(weekVal).replace(/[^0-9]/g, '')) || (r+1);

          // Try server resolver first
          let resolvedStr = '';
          try {
            const candidates = await resolvePickToGameServer(String(sheet), weekNum, pickText, null);
            if (candidates && candidates.length > 0) {
              const c = candidates[0];
              const home = c.home ?? '';
              const away = c.away ?? '';
              const date = c.parsedDate ? new Date(c.parsedDate).toLocaleDateString('en-US') : '';
              const spread = c.spread !== undefined ? (c.spread > 0 ? `-${Math.abs(c.spread)}` : `${c.spread}`) : '';
              resolvedStr = `${home || away || ''} vs ${away || home || ''}`.replace(/\s+vs\s+\s*$/, '').trim();
              if (resolvedStr === 'vs') resolvedStr = '';
              if (!resolvedStr) resolvedStr = pickText;
              if (date) resolvedStr = `${resolvedStr} (${date})`;
              if (spread) resolvedStr = `${resolvedStr} ${spread}`;
            }
          } catch (e) {
            // ignore
          }

          // Fallback: scan other columns in the same original row for opponent hints
          if (!resolvedStr) {
            const lowerPick = String(pickText).toLowerCase();
            // try to find another cell in the same row that mentions a team other than this player's pick
            let inferredOpponent: string | null = null;
            for (let ci = 0; ci < orig.length; ci++) {
              if (ci === nameColIdx) continue;
              const cell = String(orig[ci] ?? '').toLowerCase();
              if (!cell) continue;
              // prefer tokens like 'fresno', 'ku', 'kansas', 'kansas state', 'ksu', etc.
              if (cell.includes('fresno') || cell.includes('ku') || cell.includes('kansas state') || cell.includes('kansas st') || cell.includes('kansas')) {
                inferredOpponent = String(orig[ci]);
                break;
              }
            }
            if (inferredOpponent) {
              // format inferred opponent string succinctly
              resolvedStr = `${pickText} -> likely vs ${inferredOpponent}`;
            }
          }

          // final fallback: copy original pick text
          if (!resolvedStr) resolvedStr = pickText || '';

          // insert into out at position
          out.splice(pos.insertIndex, 0, resolvedStr);
        }

        newValues.push(out);
      }

      // Write the new sheet back (this will overwrite starting at A1)
      await updateSheetValues(String(sheet), newValues);

      res.json({ sheet, createdColumns: resolvedInsertPositions.map(p => p.name + ' Resolved'), rowsWritten: newValues.length - 1 });
    } catch (error) {
      console.error('/api/annotate-season error', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Archive game data for a specific week
  app.post("/api/archive-week", async (req, res) => {
    try {
      const sheet = typeof req.body?.sheet === 'string' ? req.body.sheet : 'Season 4';
      const weekNumber = Number(req.body?.week);
      const force = Boolean(req.body?.force);
      
      if (!weekNumber || Number.isNaN(weekNumber) || weekNumber <= 0) {
        return res.status(400).json({ error: 'Valid week number is required' });
      }
      
      const result = await archiveWeekGameData(sheet, weekNumber, force);
      
      if (result) {
        res.json({ 
          success: true, 
          message: `Archived game data for Week ${weekNumber}`,
          result 
        });
      } else {
        res.json({ 
          success: false, 
          message: `Week ${weekNumber} was not archived (may already be archived, not ready, or before minimum week)` 
        });
      }
    } catch (error) {
      console.error('/api/archive-week error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Check and archive all ready weeks
  app.post("/api/archive-all-ready", async (req, res) => {
    try {
      const results = await checkAndArchiveReadyWeeks();
      res.json({
        success: true,
        message: `Archived ${results.length} weeks`,
        results
      });
    } catch (error) {
      console.error('/api/archive-all-ready error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  return httpServer;
}
