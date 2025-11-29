import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getSheetData, appendToSheet } from "./googleSheets";
import { resolvePickToGameServer } from './pickResolver';
import { getSheetRawValues, updateSheetValues } from './googleSheets';
import { resolvePickFromESPN, getWeekDate, lookupGameByResolvedText, detectSport, type GameDetails } from './espnResolver';

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Get data from Google Sheet
  app.get("/api/data", async (req, res) => {
    try {
      const sheet = typeof req.query.sheet === "string" ? req.query.sheet : undefined;
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
      const weekNumber = req.body?.week;
      const division = req.body?.division; // legends or leaders
      const isTail = req.body?.isTail; // Is this a tail pick?
      const isReverseTail = req.body?.isReverseTail; // Is this a reverse tail?
      const tailedPlayerName = req.body?.tailedPlayerName; // Name of player being tailed/faded
      
      if (!playerName || betAmount === undefined || !pickText || !weekNumber) {
        return res.status(400).json({ error: "Missing required fields: playerName, betAmount, pickText, week" });
      }

      // Fetch raw values
      const raw = await getSheetRawValues(String(sheet));
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
            const seasonData = await getSheetData(String(sheet));
            const weekDate = await getWeekDate(seasonData, weekNumber);
            
            if (weekDate) {
              console.log(`[submit-pick] Resolving pick "${pickText}" for week ${weekNumber}, date: ${weekDate.toDateString()}`);
              
              // Try ESPN resolver first
              const espnResult = await resolvePickFromESPN(weekDate, pickText);
              
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
              const candidates = await resolvePickToGameServer(String(sheet), weekNumber, formattedPick, null);
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
            let cleanPick = pickText.replace(/\s*\((legends|leaders)\)\s*/gi, '').trim();
            
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
        
        rows[weekRowIndex][resolvedCol] = resolvedText;
      }

      // Rebuild the full values array
      const newValues = [headers, ...rows];
      
      // Update the sheet
      await updateSheetValues(String(sheet), newValues);
      
      res.json({ 
        success: true,
        sheet, 
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
      const sport = typeof req.query.sport === "string" ? req.query.sport : "nfl";
      
      if (!resolvedText) {
        return res.status(400).json({ error: "Missing 'resolved' query parameter" });
      }
      
      console.log(`[game-details] Looking up: "${resolvedText}" (sport: ${sport})`);
      
      const gameDetails = await lookupGameByResolvedText(resolvedText, sport);
      
      if (gameDetails) {
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
      
      // Extract player picks and their resolved values
      const picks: Array<{
        player: string;
        pick: string;
        resolved: string;
        betAmount: string;
        gameDetails?: GameDetails;
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
        
        // Look up game details if we have a resolved value
        let gameDetails: GameDetails | undefined;
        if (resolved && !resolved.startsWith('Tail') && !resolved.startsWith('Reverse Tail')) {
          try {
            // Detect sport from the resolved text
            const sport = detectSport(resolved);
            const details = await lookupGameByResolvedText(resolved, sport);
            if (details) {
              gameDetails = details;
            }
          } catch (e) {
            console.error(`Failed to lookup game for ${playerName}:`, e);
          }
        }
        
        picks.push({
          player: playerName,
          pick: pickText,
          resolved,
          betAmount,
          gameDetails
        });
      }
      
      res.json({ week: weekNumber, picks });
    } catch (error) {
      console.error("API /week-picks error:", error);
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

  return httpServer;
}
