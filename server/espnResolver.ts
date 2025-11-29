/**
 * ESPN Game Resolver
 * Fetches game data from ESPN APIs and resolves picks to actual games
 */

interface ESPNBroadcast {
  market: string;
  names: string[];
}

interface ESPNCompetitor {
  homeAway: 'home' | 'away';
  team: {
    id: string;
    name: string;
    abbreviation: string;
    displayName: string;
    shortDisplayName: string;
    logo?: string;
  };
  score?: string;
  winner?: boolean;
  records?: Array<{ summary: string }>;
}

interface ESPNOdds {
  details: string;
  overUnder: number;
  spread: number;
  homeTeamOdds?: { favorite: boolean; spreadOdds: number };
  awayTeamOdds?: { favorite: boolean; spreadOdds: number };
}

interface ESPNStatus {
  clock: number;
  displayClock: string;
  period: number;
  type: {
    id: string;
    name: string;
    state: 'pre' | 'in' | 'post';
    completed: boolean;
    description: string;
    detail: string;
    shortDetail: string;
  };
}

interface ESPNCompetition {
  id: string;
  date: string;
  venue?: {
    fullName: string;
    city: string;
    state?: string;
    address?: { city: string; state: string };
  };
  competitors: ESPNCompetitor[];
  odds?: ESPNOdds[];
  broadcasts?: ESPNBroadcast[];
  status: ESPNStatus;
  notes?: Array<{ headline: string }>;
}

interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  date: string;
  competitions: ESPNCompetition[];
  status: ESPNStatus;
  links?: Array<{ href: string; text: string }>;
}

interface ESPNResponse {
  events: ESPNEvent[];
}

// Full game details returned after resolution
export interface GameDetails {
  // Game identification
  gameId: string;
  gameName: string;           // e.g., "Chicago Bears at Detroit Lions"
  shortName: string;          // e.g., "CHI @ DET"
  
  // Teams
  homeTeam: string;
  awayTeam: string;
  homeAbbrev: string;
  awayAbbrev: string;
  
  // Date/Time
  gameDate: string;           // ISO date string
  gameDateFormatted: string;  // e.g., "Thu, Nov 28, 2:30 PM"
  
  // Venue
  venue?: string;
  city?: string;
  state?: string;
  
  // Broadcast info
  broadcasts: string[];       // e.g., ["CBS", "FOX", "ESPN+"]
  
  // Game status
  status: 'scheduled' | 'live' | 'final';
  statusDetail: string;       // e.g., "Final", "3rd Quarter 5:32", "Thu 2:30 PM"
  
  // Scores (if game has started)
  homeScore?: number;
  awayScore?: number;
  
  // Betting info
  spread?: number;
  overUnder?: number;
  favoriteTeam?: string;
  
  // Matched info from pick
  matchedTeam: string;
  resolvedText: string;       // The text to put in Resolved column
}

// Sport endpoints for ESPN API
const SPORT_ENDPOINTS: Record<string, string> = {
  'nfl': 'football/nfl',
  'ncaaf': 'football/college-football',
  'cfb': 'football/college-football',
  'college football': 'football/college-football',
  'nba': 'basketball/nba',
  'ncaab': 'basketball/mens-college-basketball',
  'cbb': 'basketball/mens-college-basketball',
  'college basketball': 'basketball/mens-college-basketball',
  'mlb': 'baseball/mlb',
  'nhl': 'hockey/nhl',
  'soccer': 'soccer/usa.1',
  'mls': 'soccer/usa.1',
  'epl': 'soccer/eng.1',
  'premier league': 'soccer/eng.1',
};

// Team name aliases and abbreviations
const TEAM_ALIASES: Record<string, string[]> = {
  // NFL Teams
  'Arizona Cardinals': ['cardinals', 'arizona', 'ari', 'cards'],
  'Atlanta Falcons': ['falcons', 'atlanta', 'atl'],
  'Baltimore Ravens': ['ravens', 'baltimore', 'bal', 'balt'],
  'Buffalo Bills': ['bills', 'buffalo', 'buf'],
  'Carolina Panthers': ['panthers', 'carolina', 'car'],
  'Chicago Bears': ['bears', 'chicago', 'chi'],
  'Cincinnati Bengals': ['bengals', 'cincinnati', 'cin', 'cincy'],
  'Cleveland Browns': ['browns', 'cleveland', 'cle'],
  'Dallas Cowboys': ['cowboys', 'dallas', 'dal'],
  'Denver Broncos': ['broncos', 'denver', 'den'],
  'Detroit Lions': ['lions', 'detroit', 'det'],
  'Green Bay Packers': ['packers', 'green bay', 'gb', 'greenbay'],
  'Houston Texans': ['texans', 'houston', 'hou'],
  'Indianapolis Colts': ['colts', 'indianapolis', 'ind', 'indy'],
  'Jacksonville Jaguars': ['jaguars', 'jacksonville', 'jax', 'jags'],
  'Kansas City Chiefs': ['chiefs', 'kansas city', 'kc'],
  'Las Vegas Raiders': ['raiders', 'las vegas', 'lv', 'vegas'],
  'Los Angeles Chargers': ['chargers', 'la chargers', 'lac'],
  'Los Angeles Rams': ['rams', 'la rams', 'lar'],
  'Miami Dolphins': ['dolphins', 'miami', 'mia'],
  'Minnesota Vikings': ['vikings', 'minnesota', 'min', 'vikes'],
  'New England Patriots': ['patriots', 'new england', 'ne', 'pats'],
  'New Orleans Saints': ['saints', 'new orleans', 'no', 'nola'],
  'New York Giants': ['giants', 'ny giants', 'nyg'],
  'New York Jets': ['jets', 'ny jets', 'nyj'],
  'Philadelphia Eagles': ['eagles', 'philadelphia', 'phi', 'philly'],
  'Pittsburgh Steelers': ['steelers', 'pittsburgh', 'pit', 'pitt'],
  'San Francisco 49ers': ['49ers', 'san francisco', 'sf', 'niners', 'san fran'],
  'Seattle Seahawks': ['seahawks', 'seattle', 'sea'],
  'Tampa Bay Buccaneers': ['buccaneers', 'tampa bay', 'tb', 'bucs', 'tampa'],
  'Tennessee Titans': ['titans', 'tennessee', 'ten'],
  'Washington Commanders': ['commanders', 'washington', 'was', 'wsh'],
  // Common college teams
  'Alabama': ['alabama', 'bama', 'crimson tide', 'tide'],
  'Ohio State': ['ohio state', 'osu', 'buckeyes'],
  'Georgia': ['georgia', 'uga', 'bulldogs', 'dawgs'],
  'Michigan': ['michigan', 'wolverines', 'um'],
  'Texas': ['texas', 'longhorns', 'ut'],
  'USC': ['usc', 'trojans', 'southern cal'],
  'Notre Dame': ['notre dame', 'irish', 'nd'],
  'Oregon': ['oregon', 'ducks'],
  'Penn State': ['penn state', 'psu', 'nittany lions'],
  'Clemson': ['clemson', 'tigers'],
  'LSU': ['lsu', 'tigers', 'louisiana state'],
  'Florida': ['florida', 'gators', 'uf'],
  'Oklahoma': ['oklahoma', 'sooners', 'ou', 'ok'],
  'Tennessee': ['tennessee', 'vols', 'volunteers'],
  'Wisconsin': ['wisconsin', 'badgers'],
  'Iowa': ['iowa', 'hawkeyes'],
  'Michigan State': ['michigan state', 'msu', 'spartans'],
  'Auburn': ['auburn', 'tigers'],
  'Texas A&M': ['texas a&m', 'aggies', 'tamu'],
  'Florida State': ['florida state', 'fsu', 'seminoles', 'noles'],
  'Miami': ['miami', 'hurricanes', 'canes', 'u'],
  'Nebraska': ['nebraska', 'cornhuskers', 'huskers'],
  'Colorado': ['colorado', 'buffaloes', 'buffs', 'cu'],
  'BYU': ['byu', 'brigham young', 'cougars'],
  'Utah': ['utah', 'utes'],
  'Arizona': ['arizona', 'wildcats'],
  'UCLA': ['ucla', 'bruins'],
  'Stanford': ['stanford', 'cardinal'],
  'Washington': ['washington', 'huskies', 'uw'],
  'Duke': ['duke', 'blue devils'],
  'North Carolina': ['north carolina', 'unc', 'tar heels'],
  'Kentucky': ['kentucky', 'wildcats', 'uk'],
  'Kansas': ['kansas', 'jayhawks', 'ku'],
  'Indiana': ['indiana', 'hoosiers', 'iu'],
  'Illinois': ['illinois', 'illini'],
  'Purdue': ['purdue', 'boilermakers'],
  'Northwestern': ['northwestern', 'wildcats', 'nw'],
  'Minnesota': ['minnesota', 'golden gophers', 'gophers'],
  'Rutgers': ['rutgers', 'scarlet knights'],
  'Maryland': ['maryland', 'terrapins', 'terps'],
};

/**
 * Detect the sport from the pick text
 */
export function detectSport(pickText: string): string {
  const text = pickText.toLowerCase();
  
  // Check for explicit sport mentions
  if (text.includes('(nfl)') || text.includes('nfl ')) return 'nfl';
  if (text.includes('(nba)') || text.includes('nba ')) return 'nba';
  if (text.includes('(mlb)') || text.includes('mlb ')) return 'mlb';
  if (text.includes('(nhl)') || text.includes('nhl ')) return 'nhl';
  if (text.includes('(ncaaf)') || text.includes('(cfb)') || text.includes('college football')) return 'ncaaf';
  if (text.includes('(ncaab)') || text.includes('(cbb)') || text.includes('college basketball')) return 'ncaab';
  
  // Check for college team indicators that would otherwise match NFL teams
  // These are college teams that share nicknames with NFL teams
  const collegeOverrides = [
    'baylor bears',     // vs Chicago Bears (NFL)
    'arizona cardinals' // this is NFL, but "arizona wildcats" or "louisville cardinals" is college
  ];
  
  // College team names that might conflict - check these first
  const collegeKeywords = [
    'baylor', 'houston cougars', 'cougars', 'longhorns', 'aggies', 'sooners', 'seminoles',
    'crimson tide', 'tide', 'bulldogs', 'volunteers', 'gators', 'wolverines', 'buckeyes',
    'tigers', 'wildcats', 'fighting illini', 'illini', 'hawkeyes', 'badgers', 'spartans',
    'nittany lions', 'hoosiers', 'boilermakers', 'cornhuskers', 'jayhawks', 'cyclones',
    'mountaineers', 'horned frogs', 'red raiders', 'gamecocks', 'commodores', 'rebels',
    'razorbacks', 'huskies', 'ducks', 'beavers', 'bruins', 'trojans', 'sun devils',
    'buffaloes', 'utes', 'cougar', 'golden bears', 'cardinal', 'fighting irish',
    'tar heels', 'cavaliers', 'hokies', 'demon deacons', 'blue devils', 'wolfpack',
    'yellow jackets', 'hurricanes', 'orange', 'owls', 'mustangs', 'bearcats',
    'memphis', 'tulane', 'tulsa', 'smu', 'ucf', 'usf', 'cincinnati', 'louisville',
    'pitt', 'boston college', 'syracuse', 'duke', 'wake forest', 'virginia tech',
    'georgia tech', 'miami hurricanes', 'florida state', 'nc state', 'northwestern',
    'purdue', 'indiana', 'maryland', 'rutgers', 'minnesota', 'iowa', 'wisconsin',
    'illinois', 'nebraska', 'kansas', 'kansas state', 'oklahoma state', 'west virginia',
    'tcu', 'texas tech', 'colorado', 'utah', 'arizona state', 'ucla', 'usc', 'cal',
    'stanford', 'washington state', 'oregon state'
  ];
  
  for (const keyword of collegeKeywords) {
    if (text.includes(keyword)) return 'ncaaf';
  }
  
  // Check for NFL team names (only if no college match found)
  const nflTeams = ['cardinals', 'falcons', 'ravens', 'bills', 'panthers', 'bears', 'bengals', 
    'browns', 'cowboys', 'broncos', 'lions', 'packers', 'texans', 'colts', 'jaguars', 
    'chiefs', 'raiders', 'chargers', 'rams', 'dolphins', 'vikings', 'patriots', 'saints',
    'giants', 'jets', 'eagles', 'steelers', '49ers', 'seahawks', 'buccaneers', 'titans', 'commanders'];
  
  for (const team of nflTeams) {
    if (text.includes(team)) return 'nfl';
  }
  
  // Default to college football for now (most common in the data)
  return 'ncaaf';
}

/**
 * Fetch games from ESPN API for a date range
 */
async function fetchESPNGames(sport: string, startDate: Date, endDate: Date): Promise<ESPNEvent[]> {
  const endpoint = SPORT_ENDPOINTS[sport.toLowerCase()] || SPORT_ENDPOINTS['ncaaf'];
  
  // Format dates as YYYYMMDD
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };
  
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  
  const url = `https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${start}-${end}`;
  
  console.log(`[ESPN] Fetching games from: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[ESPN] API error: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json() as ESPNResponse;
    console.log(`[ESPN] Found ${data.events?.length || 0} events`);
    return data.events || [];
  } catch (error) {
    console.error('[ESPN] Fetch error:', error);
    return [];
  }
}

/**
 * Find matching team in aliases
 * Prioritizes exact matches and longer alias matches over partial matches
 */
function findTeamMatch(searchText: string): string | null {
  const search = searchText.toLowerCase().trim();
  
  // First pass: look for exact matches on full name or alias
  for (const [fullName, aliases] of Object.entries(TEAM_ALIASES)) {
    if (fullName.toLowerCase() === search) return fullName;
    for (const alias of aliases) {
      if (alias === search) {
        return fullName;
      }
    }
  }
  
  // Second pass: look for aliases that are contained in the search text
  // But prioritize longer matches (e.g., "ohio state" over "ohio")
  let bestMatch: string | null = null;
  let bestMatchLength = 0;
  
  for (const [fullName, aliases] of Object.entries(TEAM_ALIASES)) {
    for (const alias of aliases) {
      // Check if the alias is contained in the search (e.g., search="ohio state", alias="ohio state")
      if (search.includes(alias) && alias.length > bestMatchLength) {
        bestMatch = fullName;
        bestMatchLength = alias.length;
      }
    }
  }
  
  return bestMatch;
}

/**
 * Check if a team name matches an ESPN team
 */
function teamsMatch(searchTeam: string, espnTeam: { name: string; displayName: string; shortDisplayName: string; abbreviation: string }): boolean {
  const search = searchTeam.toLowerCase().trim();
  const espnLower = espnTeam.displayName.toLowerCase();
  const espnNameLower = espnTeam.name.toLowerCase();
  const espnShortLower = espnTeam.shortDisplayName.toLowerCase();
  
  // Direct exact matches first
  if (espnLower === search) return true;
  if (espnNameLower === search) return true;
  if (espnShortLower === search) return true;
  if (espnTeam.abbreviation.toLowerCase() === search) return true;
  
  // Check against known aliases FIRST - this is important for disambiguation
  // If "alabama" matches to "Alabama" alias, we should ONLY match "Alabama Crimson Tide"
  // not "South Alabama" which also contains "alabama"
  const matchedFullName = findTeamMatch(search);
  if (matchedFullName) {
    const fullLower = matchedFullName.toLowerCase();
    // The ESPN team name must START with the full team name (e.g., "alabama" -> "Alabama Crimson Tide")
    // This prevents "South Alabama" from matching when user just types "alabama"
    if (espnLower.startsWith(fullLower) || espnNameLower.startsWith(fullLower)) return true;
    if (espnLower === fullLower || espnNameLower === fullLower) return true;
    
    // Check exact alias matches
    for (const alias of TEAM_ALIASES[matchedFullName] || []) {
      if (espnLower.startsWith(alias) || espnNameLower.startsWith(alias)) return true;
    }
    
    // If we found an alias match, don't fall through to substring matching
    // This prevents "alabama" from matching "South Alabama"
    return false;
  }
  
  // Only do substring matching if there's no alias match
  // This handles teams not in our alias list
  if (espnLower.includes(search)) return true;
  if (espnNameLower.includes(search)) return true;
  
  return false;
}

/**
 * Parse pick text to extract team and bet info
 */
function parsePickText(pickText: string): { team: string; spread?: number; overUnder?: number; isOver?: boolean } {
  let text = pickText
    .replace(/\s*\((legends|leaders)\)\s*/gi, '')
    .replace(/\s*\((nfl|nba|mlb|nhl|ncaaf|cfb|ncaab|cbb)\)\s*/gi, '')
    .trim();
  
  // Check for over/under bets in multiple formats
  // 1. Explicit totals: "Team Over 54.5"
  const explicitTotalMatch = text.match(/(.+?)\s+(over|under)\s+(\d+\.?\d*)\s*(?:[+-]\d+)?$/i);
  if (explicitTotalMatch) {
    const [, primaryTeam, ouWord, total] = explicitTotalMatch;
    return {
      team: primaryTeam.trim(),
      overUnder: parseFloat(total),
      isOver: ouWord.toLowerCase().startsWith('o')
    };
  }

  // 2. Team vs Team totals: "Houston over Baylor -110" or "OK/LSU Over"
  const keywordMatch = text.match(/(.+?)\s+(over|under)\s+(.+)/i);
  if (keywordMatch) {
    const primaryTeam = keywordMatch[1].trim();
    const ouWord = keywordMatch[2].toLowerCase();
    let remainder = keywordMatch[3].trim();

    // Remove trailing odds (e.g., -110)
    const trailingOdds = remainder.match(/(.+?)\s+([+-]\d+\.?\d*)$/);
    if (trailingOdds) {
      remainder = trailingOdds[1].trim();
    }

    // If remainder is numeric, treat it as the total; otherwise treat it as the opponent/team
    const numericMatch = remainder.match(/^(\d+\.?\d*)$/);
    if (numericMatch) {
      return {
        team: primaryTeam,
        overUnder: parseFloat(numericMatch[1]),
        isOver: ouWord.startsWith('o')
      };
    }

    if (remainder) {
      const secondaryTeam = remainder.replace(/\s*\(.*\)$/,'').trim();
      const combinedTeams = `${primaryTeam} / ${secondaryTeam}`;
      return {
        team: combinedTeams,
        overUnder: undefined,
        isOver: ouWord.startsWith('o')
      };
    }

    return {
      team: primaryTeam,
      overUnder: undefined,
      isOver: ouWord.startsWith('o')
    };
  }
  
  // Check for spread (e.g., "Vikings +3" or "Chiefs -7.5")
  const spreadMatch = text.match(/(.+?)\s*([+-]\d+\.?\d*)\s*$/);
  if (spreadMatch) {
    return {
      team: spreadMatch[1].trim(),
      spread: parseFloat(spreadMatch[2])
    };
  }
  
  // Just team name
  return { team: text };
}

/**
 * Format date for display
 */
function formatGameDate(dateStr: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  };
  return date.toLocaleString('en-US', options);
}

/**
 * Extract game details from an ESPN event
 */
function extractGameDetails(
  event: ESPNEvent,
  competition: ESPNCompetition,
  matchedTeam: string,
  parsedPick: { spread?: number; overUnder?: number; isOver?: boolean }
): GameDetails {
  const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home')!;
  const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away')!;
  const homeTeam = homeCompetitor.team;
  const awayTeam = awayCompetitor.team;

  // Get odds if available
  let spread: number | undefined;
  let overUnder: number | undefined;
  let favoriteTeam: string | undefined;

  if (competition.odds && competition.odds.length > 0) {
    const odds = competition.odds[0];
    spread = odds.spread;
    overUnder = odds.overUnder;

    // Determine favorite from odds details (e.g., "KC -7.5")
    if (odds.details) {
      const detailsMatch = odds.details.match(/([A-Z]+)\s*(-?\d+\.?\d*)/);
      if (detailsMatch) {
        favoriteTeam = detailsMatch[1];
      }
    }
  }

  // Get broadcasts
  const broadcasts: string[] = [];
  if (competition.broadcasts) {
    for (const broadcast of competition.broadcasts) {
      if (broadcast.names) {
        broadcasts.push(...broadcast.names);
      }
    }
  }

  // Determine game status
  let status: 'scheduled' | 'live' | 'final' = 'scheduled';
  const statusState = competition.status?.type?.state || event.status?.type?.state;
  if (statusState === 'post') {
    status = 'final';
  } else if (statusState === 'in') {
    status = 'live';
  }

  const statusDetail = competition.status?.type?.shortDetail || 
                       event.status?.type?.shortDetail || 
                       formatGameDate(event.date);

  // Get scores if available
  const homeScore = homeCompetitor.score ? parseInt(homeCompetitor.score) : undefined;
  const awayScore = awayCompetitor.score ? parseInt(awayCompetitor.score) : undefined;

  // Build resolved text (the game name for the Resolved column)
  let resolvedText = `${awayTeam.displayName} @ ${homeTeam.displayName}`;

  // Add spread or over/under info from the pick
  // For over/under bets, use the pick's total if provided, otherwise use ESPN's game total
  if (parsedPick.isOver !== undefined) {
    const ouType = parsedPick.isOver ? 'Over' : 'Under';
    // Use the pick's over/under total if specified, otherwise use ESPN's game total
    const total = parsedPick.overUnder ?? overUnder;
    if (total !== undefined) {
      resolvedText = `${resolvedText} (${ouType} ${total})`;
    } else {
      resolvedText = `${resolvedText} (${ouType})`;
    }
  } else {
    // Determine which spread to display. Prefer the pick's explicit spread, otherwise derive from ESPN odds
    let displaySpread: number | undefined = parsedPick.spread;

    if (displaySpread === undefined && typeof spread === 'number' && favoriteTeam) {
      const favoriteAbbrev = favoriteTeam.toUpperCase();
      const matchedAbbrev = matchedTeam === homeTeam.displayName
        ? homeTeam.abbreviation.toUpperCase()
        : matchedTeam === awayTeam.displayName
          ? awayTeam.abbreviation.toUpperCase()
          : undefined;

      if (matchedAbbrev) {
        const absoluteSpread = Math.abs(spread);
        const isFavorite = matchedAbbrev === favoriteAbbrev;
        displaySpread = isFavorite ? -absoluteSpread : absoluteSpread;
      }
    }

    if (displaySpread !== undefined) {
      const spreadStr = displaySpread > 0 ? `+${displaySpread}` : String(displaySpread);
      resolvedText = `${resolvedText} (${matchedTeam} ${spreadStr})`;
    } else {
      resolvedText = `${resolvedText} (${matchedTeam})`;
    }
  }

  return {
    gameId: event.id,
    gameName: event.name,
    shortName: event.shortName,
    homeTeam: homeTeam.displayName,
    awayTeam: awayTeam.displayName,
    homeAbbrev: homeTeam.abbreviation,
    awayAbbrev: awayTeam.abbreviation,
    gameDate: event.date,
    gameDateFormatted: formatGameDate(event.date),
    venue: competition.venue?.fullName,
    city: competition.venue?.city,
    state: competition.venue?.state || competition.venue?.address?.state,
    broadcasts,
    status,
    statusDetail,
    homeScore,
    awayScore,
    spread,
    overUnder,
    favoriteTeam,
    matchedTeam,
    resolvedText
  };
}

/**
 * Resolve a pick to an ESPN game - returns full game details
 */
export async function resolvePickFromESPN(
  weekDate: Date,
  pickText: string
): Promise<GameDetails | null> {
  // Parse the pick
  const parsed = parsePickText(pickText);
  console.log(`[ESPN] Parsing pick: "${pickText}" -> team: "${parsed.team}", spread: ${parsed.spread}, o/u: ${parsed.overUnder}`);
  
  if (!parsed.team) return null;
  
  // Detect sport
  const sport = detectSport(pickText);
  console.log(`[ESPN] Detected sport: ${sport}`);
  
  // Set date window (week date + 7 days)
  const startDate = new Date(weekDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  
  // Fetch games
  const events = await fetchESPNGames(sport, startDate, endDate);
  
  // Check if the team string contains a slash (e.g., "OK/LSU" for a game between two teams)
  // This is common for over/under bets where both teams are mentioned
  const teamParts = parsed.team.split('/').map(t => t.trim()).filter(Boolean);
  const isTwoTeamPick = teamParts.length >= 2;
  
  // Find matching game
  for (const event of events) {
    if (!event.competitions || event.competitions.length === 0) continue;
    
    const competition = event.competitions[0];
    const homeTeam = competition.competitors.find(c => c.homeAway === 'home')?.team;
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away')?.team;
    
    if (!homeTeam || !awayTeam) continue;
    
    // If we have two team parts (e.g., "OK/LSU"), check if BOTH teams are in this game
    if (isTwoTeamPick) {
      let matchCount = 0;
      for (const part of teamParts) {
        if (teamsMatch(part, homeTeam) || teamsMatch(part, awayTeam)) {
          matchCount++;
        }
      }
      // If both parts match teams in this game, we found it
      if (matchCount >= 2) {
        const matchedTeam = parsed.isOver ? 'Over' : (parsed.overUnder !== undefined ? 'Under' : homeTeam.displayName);
        console.log(`[ESPN] Found match (both teams): ${awayTeam.displayName} @ ${homeTeam.displayName}`);
        return extractGameDetails(event, competition, matchedTeam, parsed);
      }
      // For two-team picks, DON'T fall through to single-team matching
      // Just continue to the next event
      continue;
    }
    
    // Standard single-team matching (only for single-team picks)
    const homeMatch = teamsMatch(parsed.team, homeTeam);
    const awayMatch = teamsMatch(parsed.team, awayTeam);
    
    if (homeMatch || awayMatch) {
      const matchedTeam = homeMatch ? homeTeam.displayName : awayTeam.displayName;
      console.log(`[ESPN] Found match: ${awayTeam.displayName} @ ${homeTeam.displayName}`);
      
      return extractGameDetails(event, competition, matchedTeam, parsed);
    }
  }
  
  console.log(`[ESPN] No match found for team: "${parsed.team}"`);
  return null;
}

/**
 * Look up a game by its resolved text to get current/final data
 * This is used to refresh game data after initial resolution
 */
export async function lookupGameByResolvedText(
  resolvedText: string,
  sport: string = 'nfl'
): Promise<GameDetails | null> {
  // Parse the resolved text to extract team names
  // Expected format: "Away Team @ Home Team (pick details)"
  const match = resolvedText.match(/^(.+?)\s*@\s*(.+?)(?:\s*\(|$)/);
  if (!match) {
    console.log(`[ESPN] Cannot parse resolved text: "${resolvedText}"`);
    return null;
  }

  const awayTeamName = match[1].trim();
  const homeTeamName = match[2].trim();

  console.log(`[ESPN] Looking up game: ${awayTeamName} @ ${homeTeamName}`);

  // Fetch recent/upcoming games (last 3 days to next 7 days)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 3);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

  const sportEndpoint = SPORT_ENDPOINTS[sport.toLowerCase()] || SPORT_ENDPOINTS['nfl'];
  const events = await fetchESPNGames(sport, startDate, endDate);

  for (const event of events) {
    if (!event.competitions || event.competitions.length === 0) continue;

    const competition = event.competitions[0];
    const homeTeam = competition.competitors.find(c => c.homeAway === 'home')?.team;
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away')?.team;

    if (!homeTeam || !awayTeam) continue;

    // Check if both teams match
    const homeMatch = teamsMatch(homeTeamName, homeTeam);
    const awayMatch = teamsMatch(awayTeamName, awayTeam);

    if (homeMatch && awayMatch) {
      console.log(`[ESPN] Found exact game match`);
      // Extract pick details from resolved text for the return
      const pickMatch = resolvedText.match(/\(([^)]+)\)$/);
      const pickDetails = pickMatch ? pickMatch[1] : homeTeam.displayName;
      
      return extractGameDetails(event, competition, pickDetails, {});
    }
  }

  console.log(`[ESPN] Game not found for: ${awayTeamName} @ ${homeTeamName}`);
  return null;
}

/**
 * Get the week date from the season sheet data
 */
export async function getWeekDate(sheetData: Record<string, any>[], weekNumber: number): Promise<Date | null> {
  const weekKey = Object.keys(sheetData[0] || {}).find(h => /^week$/i.test(h.trim()));
  const dateKey = Object.keys(sheetData[0] || {}).find(h => /\bdate\b/i.test(h));
  
  if (!weekKey || !dateKey) return null;
  
  const weekRow = sheetData.find(row => {
    const v = row[weekKey];
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9]/g, ''));
    return n === weekNumber;
  });
  
  if (!weekRow || !weekRow[dateKey]) return null;
  
  // Parse the date
  const dateStr = String(weekRow[dateKey]).trim();
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) return new Date(parsed);
  
  // Try other formats
  const match = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    let year = parseInt(match[3]);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
  }
  
  return null;
}
