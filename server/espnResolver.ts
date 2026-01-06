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
    name?: string;
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
  homeTeamOdds?: { favorite: boolean; spreadOdds?: number; moneyLine?: number };
  awayTeamOdds?: { favorite: boolean; spreadOdds?: number; moneyLine?: number };
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

interface ESPNProbabilitySnapshot {
  homeWinPercentage?: number;
  awayWinPercentage?: number;
  tiePercentage?: number;
}

interface ESPNLastPlaySummary {
  probability?: ESPNProbabilitySnapshot;
  team?: {
    id?: string;
  };
  text?: string;
}

interface ESPNSituation {
  possession?: string;
  down?: number;
  distance?: number;
  downDistanceText?: string;
  shortDownDistanceText?: string;
  possessionText?: string;
  isRedZone?: boolean;
  homeTimeouts?: number;
  awayTimeouts?: number;
  lastPlay?: ESPNLastPlaySummary;
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
  situation?: ESPNSituation;
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
  displayClock?: string;
  clockSeconds?: number;
  period?: number;
  regulationPeriods?: number;
  regulationPeriodSeconds?: number;
  gameProgress?: number;
  secondsRemaining?: number;
  possession?: 'home' | 'away';
  possessionTeamId?: string;
  possessionText?: string;
  
  // Scores (if game has started)
  homeScore?: number;
  awayScore?: number;
  
  // Betting info
  spread?: number;
  overUnder?: number;
  favoriteTeam?: string;
  homeSpreadOdds?: number;
  awaySpreadOdds?: number;
  homeMoneylineOdds?: number;
  awayMoneylineOdds?: number;
  
  // Matched info from pick
  matchedTeam: string;
  resolvedText: string;       // The text to put in Resolved column
  winProbability?: number;
  probabilitySource?: ProbabilitySource;
  winConfidence?: 'likely_win' | 'coin_flip' | 'likely_loss';
  coverMargin?: number;
  projectedTotal?: number;
  betType?: BetType;
}

// Sport endpoints for ESPN API
const SPORT_ENDPOINTS: Record<string, string> = {
  'nfl': 'football/nfl',
  'ncaaf': 'football/college-football',
  'cfb': 'football/college-football',
  'college football': 'football/college-football',
  'fcs': 'football/fcs',  // FCS (Division I-AA) football
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

// Sports that should also check FCS endpoint
const SPORTS_WITH_FCS_FALLBACK = ['ncaaf', 'cfb', 'college football'];

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
  'Texas A&M': ['texas a&m', 'aggies', 'tamu', 'tam', 'texas am', 'texasam', 'a&m'],
  'Texas Tech': ['texas tech', 'tt', 'red raiders', 'tech', 'ttu'],
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
  'Vanderbilt': ['vanderbilt', 'vandy', 'vandy baby', 'vandy baby!', 'commodores'],
  'UC San Diego Tritons': ['uc san diego', 'ucsd', 'san diego tritons', 'uc san diego tritons', 'university of california san diego'],
  // Additional college teams for bowl games
  'UNLV': ['unlv', 'rebels', 'unlv rebels', 'las vegas rebels'],
  'Ohio': ['ohio', 'ohio bobcats', 'bobcats', 'ohio university', 'ohio u'],
  'Utah State': ['utah state', 'utah st', 'usu'],
  'Army': ['army', 'black knights', 'army west point'],
  'Navy': ['navy', 'midshipmen'],
  'Air Force': ['air force', 'falcons'],
  'Boise State': ['boise state', 'boise', 'broncos'],
  'Memphis': ['memphis', 'tigers'],
  'SMU': ['smu', 'mustangs', 'southern methodist'],
  'Tulane': ['tulane', 'green wave'],
  'James Madison': ['james madison', 'jmu', 'dukes'],
  'Liberty': ['liberty', 'flames'],
  'Marshall': ['marshall', 'thundering herd'],
  'Louisiana': ['louisiana', 'ragin cajuns', 'ul', 'louisiana ragin cajuns'],
  'App State': ['app state', 'appalachian state', 'mountaineers'],
  'Coastal Carolina': ['coastal carolina', 'chanticleers', 'coastal'],
  'Georgia Southern': ['georgia southern', 'eagles'],
  'Georgia State': ['georgia state', 'panthers'],
  'Troy': ['troy', 'trojans'],
  'South Alabama': ['south alabama', 'jaguars', 'usa'],
  'Texas State': ['texas state', 'bobcats'],
  'Arkansas State': ['arkansas state', 'red wolves'],
  'UL Monroe': ['ul monroe', 'ulm', 'warhawks'],
  'Southern Miss': ['southern miss', 'usm', 'golden eagles'],
  'Old Dominion': ['old dominion', 'odu', 'monarchs'],
  'Middle Tennessee': ['middle tennessee', 'mtsu', 'blue raiders'],
  'Western Kentucky': ['western kentucky', 'wku', 'hilltoppers'],
  'Charlotte': ['charlotte', '49ers'],
  'FIU': ['fiu', 'florida international', 'panthers'],
  'FAU': ['fau', 'florida atlantic', 'owls'],
  'Rice': ['rice', 'owls'],
  'North Texas': ['north texas', 'unt', 'mean green'],
  'UTSA': ['utsa', 'roadrunners', 'san antonio'],
  'UTEP': ['utep', 'miners'],
  'New Mexico': ['new mexico', 'lobos', 'unm'],
  'New Mexico State': ['new mexico state', 'nmsu', 'aggies'],
  'San Jose State': ['san jose state', 'sjsu', 'spartans'],
  'Fresno State': ['fresno state', 'fresno', 'bulldogs'],
  'San Diego State': ['san diego state', 'sdsu', 'aztecs'],
  'Hawaii': ['hawaii', 'rainbow warriors', 'warriors'],
  'Nevada': ['nevada', 'wolf pack'],
  'Wyoming': ['wyoming', 'cowboys'],
  'Colorado State': ['colorado state', 'csu', 'rams'],
  'Bowling Green': ['bowling green', 'bgsu', 'falcons'],
  'Toledo': ['toledo', 'rockets'],
  'Miami (OH)': ['miami ohio', 'miami oh', 'redhawks'],
  'Kent State': ['kent state', 'golden flashes'],
  'Akron': ['akron', 'zips'],
  'Buffalo': ['buffalo', 'bulls', 'ub'],
  'Ball State': ['ball state', 'cardinals'],
  'Central Michigan': ['central michigan', 'cmu', 'chippewas'],
  'Eastern Michigan': ['eastern michigan', 'emu', 'eagles'],
  'Northern Illinois': ['northern illinois', 'niu', 'huskies'],
  'Western Michigan': ['western michigan', 'wmu', 'broncos'],
  // FCS teams (for rivalry games)
  'Montana': ['montana', 'grizzlies', 'griz'],
  'Montana State': ['montana state', 'montana st', 'bobcats', 'msu bobcats'],
  'North Dakota State': ['north dakota state', 'ndsu', 'bison'],
  'South Dakota State': ['south dakota state', 'jackrabbits'],
  'Villanova': ['villanova', 'wildcats', 'nova'],
  'Delaware': ['delaware', 'blue hens'],
  'UC Davis': ['uc davis', 'aggies'],
  'Weber State': ['weber state', 'wildcats'],
  'Eastern Washington': ['eastern washington', 'ewu', 'eagles'],
  'Sacramento State': ['sacramento state', 'sac state', 'hornets'],
};

// Teams that require direct ESPN team-id lookups (scoreboard may omit them)
// These are typically FCS teams or smaller programs not in the main scoreboard
const TEAM_ID_OVERRIDES: Record<string, { teamId: string }> = {
  'UC San Diego Tritons': { teamId: '28' },
  // FCS teams (ESPN FCS scoreboard endpoint is broken, so we use team schedules)
  'Montana': { teamId: '149' },
  'Montana State': { teamId: '147' },
  'North Dakota State': { teamId: '2449' },
  'South Dakota State': { teamId: '2571' },
  'James Madison': { teamId: '256' },
  'Eastern Washington': { teamId: '331' },
  'Weber State': { teamId: '2692' },
  'Sacramento State': { teamId: '16' },
  'UC Davis': { teamId: '302' },
  'Villanova': { teamId: '222' },
  'Delaware': { teamId: '48' },
};


const TEAM_NAME_CORRECTIONS: Record<string, string> = {
  'virgina': 'virginia',
  'virgina tech': 'virginia tech',
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyTeamNameCorrections(value: string): string {
  let output = value;
  for (const [misspelling, correction] of Object.entries(TEAM_NAME_CORRECTIONS)) {
    if (!output.toLowerCase().includes(misspelling)) continue;
    const regex = new RegExp(`\\b${escapeRegExp(misspelling)}\\b`, 'gi');
    output = output.replace(regex, correction);
  }
  return output;
}

function getSeasonYearForSport(date: Date, sport: string): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (sport.toLowerCase() === 'ncaab' || sport.toLowerCase() === 'cbb' || sport.toLowerCase() === 'college basketball') {
    return month >= 6 ? year + 1 : year;
  }
  return year;
}

function parseScoreValue(rawScore: unknown): number | undefined {
  if (rawScore === null || rawScore === undefined) return undefined;
  if (typeof rawScore === 'number' && Number.isFinite(rawScore)) {
    return rawScore;
  }
  if (typeof rawScore === 'string') {
    const parsed = parseInt(rawScore, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  if (typeof rawScore === 'object') {
    const scoreObj = rawScore as { value?: unknown; displayValue?: unknown };
    if (typeof scoreObj.value === 'number' && Number.isFinite(scoreObj.value)) {
      return scoreObj.value;
    }
    if (typeof scoreObj.displayValue === 'string') {
      const parsed = parseInt(scoreObj.displayValue, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
  }

  return undefined;
}

type ProbabilitySource = 'espn' | 'heuristic';

type BetType = 'spread' | 'total' | 'moneyline';

interface WinProbabilityResult {
  winProbability?: number;
  probabilitySource?: ProbabilitySource;
  winConfidence?: 'likely_win' | 'coin_flip' | 'likely_loss';
  coverMargin?: number;
  projectedTotal?: number;
  betType?: BetType;
}

type GameTimingMeta = {
  regulationPeriods: number;
  secondsPerPeriod: number;
  totalSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  progress: number;
  period?: number;
  clockSeconds?: number;
  displayClock?: string;
};

const SPORT_TIMING_CONFIG: Record<string, { regulationPeriods: number; secondsPerPeriod: number }> = {
  nfl: { regulationPeriods: 4, secondsPerPeriod: 900 },
  ncaaf: { regulationPeriods: 4, secondsPerPeriod: 900 },
  cfb: { regulationPeriods: 4, secondsPerPeriod: 900 },
  nba: { regulationPeriods: 4, secondsPerPeriod: 720 },
  ncaab: { regulationPeriods: 2, secondsPerPeriod: 1200 },
  cbb: { regulationPeriods: 2, secondsPerPeriod: 1200 },
  nhl: { regulationPeriods: 3, secondsPerPeriod: 1200 },
  soccer: { regulationPeriods: 2, secondsPerPeriod: 2700 },
  mls: { regulationPeriods: 2, secondsPerPeriod: 2700 },
};

const DEFAULT_TIMING = { regulationPeriods: 4, secondsPerPeriod: 900 };

function normalizeSportKey(value?: string): string {
  if (!value) return 'ncaaf';
  const lowered = value.toLowerCase();
  if (lowered === 'college football') return 'ncaaf';
  if (lowered === 'college basketball') return 'ncaab';
  return lowered;
}

function getTimingConfigForSport(sport?: string) {
  const key = normalizeSportKey(sport);
  return SPORT_TIMING_CONFIG[key] || DEFAULT_TIMING;
}

function computeGameTimingMeta(status: ESPNStatus | undefined, sport: string): GameTimingMeta {
  const config = getTimingConfigForSport(sport);
  const totalSeconds = config.regulationPeriods * config.secondsPerPeriod;
  const period = status?.period ?? 1;
  const clockSeconds = typeof status?.clock === 'number' ? Math.max(0, status.clock) : undefined;
  const displayClock = status?.displayClock;
  const state = status?.type?.state;

  if (state === 'pre') {
    return { regulationPeriods: config.regulationPeriods, secondsPerPeriod: config.secondsPerPeriod, totalSeconds, elapsedSeconds: 0, remainingSeconds: totalSeconds, progress: 0, period, clockSeconds, displayClock };
  }

  if (state === 'post') {
    return { regulationPeriods: config.regulationPeriods, secondsPerPeriod: config.secondsPerPeriod, totalSeconds, elapsedSeconds: totalSeconds, remainingSeconds: 0, progress: 1, period, clockSeconds, displayClock };
  }

  const perPeriod = config.secondsPerPeriod;
  let elapsedSeconds = 0;
  if (perPeriod > 0 && clockSeconds !== undefined) {
    const completedPeriods = Math.max(0, period - 1);
    const clampedClock = Math.min(perPeriod, clockSeconds);
    elapsedSeconds = (completedPeriods * perPeriod) + (perPeriod - clampedClock);
  } else {
    elapsedSeconds = Math.max(0, (period - 1) * perPeriod);
  }

  elapsedSeconds = Math.min(totalSeconds, Math.max(0, elapsedSeconds));
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const progress = totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0;

  return { regulationPeriods: config.regulationPeriods, secondsPerPeriod: config.secondsPerPeriod, totalSeconds, elapsedSeconds, remainingSeconds, progress, period, clockSeconds, displayClock };
}

function logistic(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return 1 / (1 + Math.exp(-value));
}

function clampProbability(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.min(0.995, Math.max(0.005, value));
}

function deriveConfidence(probability?: number): 'likely_win' | 'coin_flip' | 'likely_loss' | undefined {
  if (probability === undefined) return undefined;
  if (probability >= 0.6) return 'likely_win';
  if (probability <= 0.4) return 'likely_loss';
  return 'coin_flip';
}

function determineTeamSide(matchedTeam: string, homeTeam: ESPNCompetitor['team'], awayTeam: ESPNCompetitor['team']): 'home' | 'away' | null {
  if (teamsMatch(matchedTeam, homeTeam)) return 'home';
  if (teamsMatch(matchedTeam, awayTeam)) return 'away';
  return null;
}

function derivePossessionInfo(
  situation: ESPNSituation | undefined,
  homeTeam?: ESPNCompetitor['team'],
  awayTeam?: ESPNCompetitor['team']
): { possessionTeamId?: string; possession?: 'home' | 'away'; possessionText?: string } {
  if (!situation) return {};
  const possessionTeamId = situation.possession || situation.lastPlay?.team?.id;
  if (!homeTeam || !awayTeam || !possessionTeamId) {
    return {
      possessionTeamId,
      possessionText: situation.downDistanceText || situation.possessionText,
    };
  }

  const possession = homeTeam.id === possessionTeamId ? 'home' : awayTeam.id === possessionTeamId ? 'away' : undefined;
  return {
    possessionTeamId,
    possession,
    possessionText: situation.downDistanceText || situation.possessionText,
  };
}

function computeBetWinProbability(params: {
  parsedPick: ParsedPick;
  matchedTeam: string;
  homeTeam: ESPNCompetitor['team'];
  awayTeam: ESPNCompetitor['team'];
  homeScore?: number;
  awayScore?: number;
  appliedSpread?: number;
  overUnder?: number;
  status: 'scheduled' | 'live' | 'final';
  timing: GameTimingMeta;
  situation?: ESPNSituation;
  sport: string;
  possessionTeamId?: string;
}): WinProbabilityResult {
  const hasTotalBet = params.parsedPick.isOver !== undefined || typeof params.parsedPick.overUnder === 'number';
  const appliedSpread = typeof params.appliedSpread === 'number' ? params.appliedSpread : undefined;
  const betType: BetType = hasTotalBet ? 'total' : (appliedSpread !== undefined && appliedSpread !== 0 ? 'spread' : 'moneyline');

  if (params.status === 'scheduled') {
    return { betType };
  }

  const homeScore = typeof params.homeScore === 'number' ? params.homeScore : undefined;
  const awayScore = typeof params.awayScore === 'number' ? params.awayScore : undefined;

  if (params.status === 'final' && homeScore !== undefined && awayScore !== undefined) {
    if (betType === 'total') {
      const threshold = typeof params.overUnder === 'number' ? params.overUnder : undefined;
      if (threshold !== undefined) {
        const totalPoints = homeScore + awayScore;
        const comparison = params.parsedPick.isOver === false ? threshold - totalPoints : totalPoints - threshold;
        const isPush = Math.abs(totalPoints - threshold) < 0.0001;
        const winProbability = clampProbability(isPush ? 0.5 : comparison > 0 ? 1 : 0);
        return {
          betType,
          winProbability,
          probabilitySource: 'heuristic',
          winConfidence: deriveConfidence(winProbability),
          projectedTotal: totalPoints,
        };
      }
    } else {
      const teamSide = determineTeamSide(params.matchedTeam, params.homeTeam, params.awayTeam);
      if (teamSide) {
        const teamScore = teamSide === 'home' ? homeScore : awayScore;
        const oppScore = teamSide === 'home' ? awayScore : homeScore;
        const spreadToUse = appliedSpread ?? 0;
        const coverMargin = (teamScore + spreadToUse) - oppScore;
        const isPush = Math.abs(coverMargin) < 0.0001;
        const winProbability = clampProbability(isPush ? 0.5 : coverMargin > 0 ? 1 : 0);
        return {
          betType,
          winProbability,
          probabilitySource: 'heuristic',
          winConfidence: deriveConfidence(winProbability),
          coverMargin,
        };
      }
    }
    return { betType };
  }

  if (params.status !== 'live' || homeScore === undefined || awayScore === undefined) {
    return { betType };
  }

  if (betType === 'total') {
    const threshold = typeof params.overUnder === 'number' ? params.overUnder : undefined;
    if (threshold === undefined) {
      return { betType };
    }

    const totalPoints = homeScore + awayScore;
    const elapsed = params.timing.elapsedSeconds;
    const remaining = params.timing.remainingSeconds;
    const totalSeconds = params.timing.totalSeconds || 1;
    const scoringRate = elapsed > 0 ? totalPoints / elapsed : 0;
    const projectedTotal = totalPoints + (scoringRate * remaining);
    const remainingFraction = totalSeconds > 0 ? remaining / totalSeconds : 1;
    const margin = (params.parsedPick.isOver === false ? threshold - projectedTotal : projectedTotal - threshold);
    const dampener = 6 + (12 * remainingFraction);
    let probability = logistic(margin / Math.max(2, dampener));

    const inertia = Math.min(0.85, Math.pow(params.timing.progress, 0.6));
    probability = 0.5 + (probability - 0.5) * (0.3 + 0.7 * inertia);

    const winProbability = clampProbability(probability);
    return {
      betType,
      winProbability,
      probabilitySource: 'heuristic',
      winConfidence: deriveConfidence(winProbability),
      projectedTotal,
    };
  }

  const teamSide = determineTeamSide(params.matchedTeam, params.homeTeam, params.awayTeam);
  if (!teamSide) {
    return { betType };
  }

  const teamScore = teamSide === 'home' ? homeScore : awayScore;
  const oppScore = teamSide === 'home' ? awayScore : homeScore;
  if (teamScore === undefined || oppScore === undefined) {
    return { betType };
  }

  const spreadToUse = appliedSpread ?? 0;
  const coverMargin = (teamScore + spreadToUse) - oppScore;
  const remainingFraction = Math.max(0.02, 1 - params.timing.progress);
  const dampener = 3 + (12 * remainingFraction);
  let probability = logistic(coverMargin / Math.max(1.5, dampener));

  const scoreboardProb = params.situation?.lastPlay?.probability;
  if (spreadToUse === 0 && scoreboardProb) {
    const espnProb = teamSide === 'home' ? scoreboardProb.homeWinPercentage : scoreboardProb.awayWinPercentage;
    if (typeof espnProb === 'number') {
      probability = (probability + espnProb) / 2;
    }
  }

  const possessionTeamId = params.possessionTeamId;
  const teamId = teamSide === 'home' ? params.homeTeam.id : params.awayTeam.id;
  if (possessionTeamId && teamId) {
    if (possessionTeamId === teamId) {
      probability += 0.03;
    } else if (possessionTeamId !== teamId) {
      probability -= 0.03;
    }
  }

  const winProbability = clampProbability(probability);
  return {
    betType,
    winProbability,
    probabilitySource: scoreboardProb ? 'espn' : 'heuristic',
    winConfidence: deriveConfidence(winProbability),
    coverMargin,
  };
}

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
async function fetchESPNGamesByDay(sport: string, startDate: Date, endDate: Date): Promise<ESPNEvent[]> {
  const endpoint = SPORT_ENDPOINTS[sport.toLowerCase()] || SPORT_ENDPOINTS['ncaaf'];
  const events: ESPNEvent[] = [];

  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };

  const cursor = new Date(startDate.getTime());
  const endTime = endDate.getTime();

  while (cursor.getTime() <= endTime) {
    const dateStr = formatDate(cursor);
    const url = `https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${dateStr}`;
    console.log(`[ESPN] Fetching games (daily) from: ${url}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[ESPN] Daily fetch error ${response.status} for ${dateStr}`);
      } else {
        const data = await response.json() as ESPNResponse;
        if (data.events?.length) {
          events.push(...data.events);
        }
      }
    } catch (error) {
      console.error(`[ESPN] Daily fetch exception for ${dateStr}:`, error);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  console.log(`[ESPN] Combined daily events: ${events.length}`);
  return events;
}

async function fetchESPNGames(sport: string, startDate: Date, endDate: Date): Promise<ESPNEvent[]> {
  const sportLower = sport.toLowerCase();
  const endpoint = SPORT_ENDPOINTS[sportLower] || SPORT_ENDPOINTS['ncaaf'];
  
  // Format dates as YYYYMMDD
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };
  
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  
  let allEvents: ESPNEvent[] = [];
  
  // Fetch from primary endpoint
  const rangeUrl = `https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${start}-${end}`;
  
  console.log(`[ESPN] Fetching games from: ${rangeUrl}`);
  
  try {
    const response = await fetch(rangeUrl);
    if (response.ok) {
      const data = await response.json() as ESPNResponse;
      console.log(`[ESPN] Found ${data.events?.length || 0} events`);
      allEvents = data.events || [];
    } else {
      console.warn(`[ESPN] Range fetch error ${response.status} ${response.statusText}; falling back to daily fetch`);
      allEvents = await fetchESPNGamesByDay(sport, startDate, endDate);
    }
  } catch (error) {
    console.error('[ESPN] Fetch error during range request:', error);
    allEvents = await fetchESPNGamesByDay(sport, startDate, endDate);
  }
  
  // For college football, also check FCS endpoint for FCS games
  if (SPORTS_WITH_FCS_FALLBACK.includes(sportLower)) {
    try {
      const fcsEndpoint = SPORT_ENDPOINTS['fcs'];
      const fcsUrl = `https://site.api.espn.com/apis/site/v2/sports/${fcsEndpoint}/scoreboard?dates=${start}-${end}`;
      console.log(`[ESPN] Also checking FCS games from: ${fcsUrl}`);
      
      const fcsResponse = await fetch(fcsUrl);
      if (fcsResponse.ok) {
        const fcsData = await fcsResponse.json() as ESPNResponse;
        const fcsEvents = fcsData.events || [];
        console.log(`[ESPN] Found ${fcsEvents.length} FCS events`);
        
        // Add FCS events that aren't already in our list (by game ID)
        const existingIds = new Set(allEvents.map(e => e.id));
        for (const event of fcsEvents) {
          if (!existingIds.has(event.id)) {
            allEvents.push(event);
          }
        }
      }
    } catch (fcsError) {
      console.warn('[ESPN] FCS fetch error:', fcsError);
    }
  }
  
  return allEvents;
}

// Enhanced fallback: Try both teams' schedules and fetch summary if not found in scoreboards
async function findGameViaTeamSchedules({ sport, seasonYear, teamIds, opponentName, gameDate }: { sport: string, seasonYear: number, teamIds: string[], opponentName: string, gameDate: string }) {
  for (const teamId of teamIds) {
    const scheduleEvents = await fetchTeamScheduleEvents(sport, teamId, seasonYear);
    for (const event of scheduleEvents) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      // Check if opponent matches
      const opp = comp.competitors.find(c => c.team.id !== teamId);
      if (!opp) continue;
      const oppName = opp.team.displayName?.toLowerCase() || '';
      if (oppName.includes(opponentName.toLowerCase())) {
        // Check date match (allowing for timezone differences)
        const eventDate = new Date(event.date);
        const targetDate = new Date(gameDate);
        if (Math.abs(eventDate.getTime() - targetDate.getTime()) < 36 * 3600 * 1000) { // within 36 hours
          console.log(`[ESPN] Fallback: Found possible game in team ${teamId} schedule vs ${oppName} on ${event.date}`);
          // Fetch summary for live status/score
          const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_ENDPOINTS[sport.toLowerCase()]}/summary?event=${event.id}`;
          console.log(`[ESPN] Fallback: Fetching summary from: ${summaryUrl}`);
          try {
            const resp = await fetch(summaryUrl);
            if (resp.ok) {
              const data = await resp.json();
              return { event, summary: data };
            }
          } catch (e) {
            console.warn(`[ESPN] Fallback: Error fetching summary for event ${event.id}:`, e);
          }
        }
      }
    }
  }
  return null;
}

async function fetchTeamScheduleEvents(sport: string, teamId: string, seasonYear: number): Promise<ESPNEvent[]> {
  const endpoint = SPORT_ENDPOINTS[sport.toLowerCase()] || SPORT_ENDPOINTS['ncaaf'];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${endpoint}/teams/${teamId}/schedule?season=${seasonYear}`;
  console.log(`[ESPN] Fetching team schedule from: ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[ESPN] Team schedule fetch error ${response.status} for team ${teamId}`);
      return [];
    }
    const data = await response.json() as { events?: ESPNEvent[] };
    return data.events || [];
  } catch (error) {
    console.error(`[ESPN] Team schedule fetch exception for team ${teamId}:`, error);
    return [];
  }
}

// Fetch odds data from game summary API (used when schedule doesn't include odds)
async function fetchGameOdds(sport: string, gameId: string): Promise<ESPNOdds | null> {
  const endpoint = SPORT_ENDPOINTS[sport.toLowerCase()] || SPORT_ENDPOINTS['ncaaf'];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${endpoint}/summary?event=${gameId}`;
  console.log(`[ESPN] Fetching game odds from: ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[ESPN] Game summary fetch error ${response.status} for game ${gameId}`);
      return null;
    }
    const data = await response.json() as { pickcenter?: ESPNOdds[] };
    if (data.pickcenter && data.pickcenter.length > 0) {
      console.log(`[ESPN] Found odds for game ${gameId}: o/u ${data.pickcenter[0].overUnder}, spread ${data.pickcenter[0].spread}`);
      return data.pickcenter[0];
    }
    return null;
  } catch (error) {
    console.error(`[ESPN] Game summary fetch exception for game ${gameId}:`, error);
    return null;
  }
}

// Enrich schedule events with odds data from game summaries
async function enrichEventsWithOdds(events: ESPNEvent[], sport: string): Promise<ESPNEvent[]> {
  const enrichedEvents: ESPNEvent[] = [];
  for (const event of events) {
    const competition = event.competitions?.[0];
    if (competition && (!competition.odds || competition.odds.length === 0)) {
      // Fetch odds from game summary
      const odds = await fetchGameOdds(sport, event.id);
      if (odds) {
        competition.odds = [odds];
      }
    }
    enrichedEvents.push(event);
  }
  return enrichedEvents;
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
function teamsMatch(searchTeam: string, espnTeam: { name?: string; displayName: string; shortDisplayName?: string; abbreviation?: string }): boolean {
  const search = searchTeam.toLowerCase().trim();
  const displayName = espnTeam.displayName || espnTeam.name || '';
  const espnLower = displayName.toLowerCase();
  const espnNameLower = (espnTeam.name || displayName).toLowerCase();
  const espnShortLower = (espnTeam.shortDisplayName || displayName).toLowerCase();
  const espnAbbrevLower = (espnTeam.abbreviation || '').toLowerCase();
  
  // Direct exact matches first
  if (espnLower === search) return true;
  if (espnNameLower === search) return true;
  if (espnShortLower === search) return true;
  if (espnAbbrevLower && espnAbbrevLower === search) return true;
  
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
    .replace(/\s*\|\s*/g, ' ')
    .trim();
  text = applyTeamNameCorrections(text);
  
  // Pre-process: Handle duplicate over/under keywords (e.g., "Team under under 65.5" -> "Team under 65.5")
  text = text.replace(/\b(over|under)\s+(over|under)\s+/gi, (match, first, second) => {
    // Use the second keyword (the one closest to the number)
    return `${second} `;
  });
  
  // Check for over/under bets in multiple formats
  // 1. Explicit totals: "Team Over 54.5" or "Team1/Team2 Under 65.5"
  const explicitTotalMatch = text.match(/(.+?)\s+(over|under)\s+(\d+\.?\d*)\s*(?:[+-]\d+)?$/i);
  if (explicitTotalMatch) {
    const [, primaryTeamRaw, ouWord, total] = explicitTotalMatch;
    const primaryTeam = applyTeamNameCorrections(primaryTeamRaw.trim());
    return {
      team: primaryTeam,
      overUnder: parseFloat(total),
      isOver: ouWord.toLowerCase().startsWith('o')
    };
  }

  // 2. Team vs Team totals: "Houston over Baylor -110" or "OK/LSU Over"
  const keywordMatch = text.match(/(.+?)\s+(over|under)\s+(.+)/i);
  if (keywordMatch) {
    const primaryTeam = applyTeamNameCorrections(keywordMatch[1].trim());
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
      const secondaryTeam = applyTeamNameCorrections(remainder.replace(/\s*\(.*\)$/,'').trim());
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
  
  // 3. Handle "Team1/Team2 over" or "Team over" at end of string (no total specified)
  const trailingOverUnderMatch = text.match(/(.+?)\s+(over|under)\s*$/i);
  if (trailingOverUnderMatch) {
    const teamPart = applyTeamNameCorrections(trailingOverUnderMatch[1].trim());
    const ouWord = trailingOverUnderMatch[2].toLowerCase();
    return {
      team: teamPart,
      overUnder: undefined,
      isOver: ouWord.startsWith('o')
    };
  }
  
  // Check for spread (e.g., "Vikings +3" or "Chiefs -7.5")
  const spreadMatch = text.match(/(.+?)\s*([+-]\d+\.?\d*)\s*$/);
  if (spreadMatch) {
    const teamName = applyTeamNameCorrections(spreadMatch[1].trim());
    return {
      team: teamName,
      spread: parseFloat(spreadMatch[2])
    };
  }
  
  // Just team name
  return { team: applyTeamNameCorrections(text) };
}

type ParsedPick = ReturnType<typeof parsePickText>;

/**
 * Format date for display in Central time
 */
function formatGameDate(dateStr: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
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
  parsedPick: { spread?: number; overUnder?: number; isOver?: boolean },
  sport: string
): GameDetails {
  const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home')!;
  const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away')!;
  const homeTeam = homeCompetitor.team;
  const awayTeam = awayCompetitor.team;

  // Get odds if available
  let spread: number | undefined;
  let overUnder: number | undefined;
  let favoriteTeam: string | undefined;
  let homeSpreadOdds: number | undefined;
  let awaySpreadOdds: number | undefined;
  let homeMoneylineOdds: number | undefined;
  let awayMoneylineOdds: number | undefined;

  if (competition.odds && competition.odds.length > 0) {
    const odds = competition.odds[0];
    spread = odds.spread;
    overUnder = odds.overUnder;
    homeSpreadOdds = odds.homeTeamOdds?.spreadOdds;
    awaySpreadOdds = odds.awayTeamOdds?.spreadOdds;
    homeMoneylineOdds = odds.homeTeamOdds?.moneyLine;
    awayMoneylineOdds = odds.awayTeamOdds?.moneyLine;

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
  const homeScore = parseScoreValue(homeCompetitor.score);
  const awayScore = parseScoreValue(awayCompetitor.score);

  const timingMeta = computeGameTimingMeta(competition.status || event.status, sport);
  const possessionInfo = derivePossessionInfo(competition.situation, homeTeam, awayTeam);

  // Build resolved text (the game name for the Resolved column)
  let resolvedText = `${awayTeam.displayName} @ ${homeTeam.displayName}`;
  const overUnderTarget = parsedPick.overUnder ?? overUnder;
  let appliedSpread: number | undefined = parsedPick.spread;

  if (appliedSpread === undefined && typeof spread === 'number' && favoriteTeam) {
    const favoriteAbbrev = favoriteTeam.toUpperCase();
    const matchedAbbrev = matchedTeam === homeTeam.displayName
      ? homeTeam.abbreviation.toUpperCase()
      : matchedTeam === awayTeam.displayName
        ? awayTeam.abbreviation.toUpperCase()
        : undefined;

    if (matchedAbbrev) {
      const absoluteSpread = Math.abs(spread);
      const isFavorite = matchedAbbrev === favoriteAbbrev;
      appliedSpread = isFavorite ? -absoluteSpread : absoluteSpread;
    }
  }

  // Add spread or over/under info from the pick
  // For over/under bets, use the pick's total if provided, otherwise use ESPN's game total
  if (parsedPick.isOver !== undefined) {
    const ouType = parsedPick.isOver ? 'Over' : 'Under';
    // Use the pick's over/under total if specified, otherwise use ESPN's game total
    const total = overUnderTarget;
    if (total !== undefined) {
      resolvedText = `${resolvedText} (${ouType} ${total})`;
    } else {
      resolvedText = `${resolvedText} (${ouType})`;
    }
  } else {
    if (appliedSpread !== undefined) {
      const spreadStr = appliedSpread > 0 ? `+${appliedSpread}` : String(appliedSpread);
      resolvedText = `${resolvedText} (${matchedTeam} ${spreadStr})`;
    } else {
      resolvedText = `${resolvedText} (${matchedTeam})`;
    }
  }

  const probabilityInfo = computeBetWinProbability({
    parsedPick,
    matchedTeam,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    appliedSpread,
    overUnder: overUnderTarget,
    status,
    timing: timingMeta,
    situation: competition.situation,
    sport,
    possessionTeamId: possessionInfo.possessionTeamId,
  });

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
    homeSpreadOdds,
    awaySpreadOdds,
    homeMoneylineOdds,
    awayMoneylineOdds,
    matchedTeam,
    resolvedText,
    displayClock: timingMeta.displayClock,
    clockSeconds: timingMeta.clockSeconds,
    period: timingMeta.period,
    regulationPeriods: timingMeta.regulationPeriods,
    regulationPeriodSeconds: timingMeta.secondsPerPeriod,
    gameProgress: timingMeta.progress,
    secondsRemaining: timingMeta.remainingSeconds,
    possession: possessionInfo.possession,
    possessionTeamId: possessionInfo.possessionTeamId,
    possessionText: possessionInfo.possessionText,
    winProbability: probabilityInfo.winProbability,
    probabilitySource: probabilityInfo.probabilitySource,
    winConfidence: probabilityInfo.winConfidence,
    coverMargin: probabilityInfo.coverMargin,
    projectedTotal: probabilityInfo.projectedTotal,
    betType: probabilityInfo.betType,
  };
}

function matchGameFromEvents(
  events: ESPNEvent[],
  parsed: ParsedPick,
  teamParts: string[],
  isTwoTeamPick: boolean,
  sport: string,
  dateFilter?: { start: Date; end: Date }
): GameDetails | null {
  for (const event of events) {
    if (!event.competitions || event.competitions.length === 0) continue;

    if (dateFilter) {
      const eventDate = new Date(event.date);
      if (eventDate < dateFilter.start || eventDate > dateFilter.end) {
        continue;
      }
    }

    const competition = event.competitions[0];
    const homeTeam = competition.competitors.find(c => c.homeAway === 'home')?.team;
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away')?.team;

    if (!homeTeam || !awayTeam) continue;

    if (isTwoTeamPick) {
      let matchCount = 0;
      for (const part of teamParts) {
        if (!part) continue;
        if (teamsMatch(part, homeTeam) || teamsMatch(part, awayTeam)) {
          matchCount++;
        }
      }
      if (matchCount >= 2) {
        const matchedTeam = parsed.isOver ? 'Over' : (parsed.overUnder !== undefined ? 'Under' : homeTeam.displayName);
        console.log(`[ESPN] Found match (both teams): ${awayTeam.displayName} @ ${homeTeam.displayName}`);
        return extractGameDetails(event, competition, matchedTeam, parsed, sport);
      }
      continue;
    }

    const homeMatch = teamsMatch(parsed.team, homeTeam);
    const awayMatch = teamsMatch(parsed.team, awayTeam);

    if (homeMatch || awayMatch) {
      const matchedTeam = homeMatch ? homeTeam.displayName : awayTeam.displayName;
      console.log(`[ESPN] Found match: ${awayTeam.displayName} @ ${homeTeam.displayName}`);
      return extractGameDetails(event, competition, matchedTeam, parsed, sport);
    }
  }

  return null;
}

/**
 * Resolve a pick to an ESPN game - returns full game details
 */
export async function resolvePickFromESPN(
  weekDate: Date,
  pickText: string,
  providedSport?: string
): Promise<GameDetails | null> {
  // Parse the pick
  const parsed = parsePickText(pickText);
  console.log(`[ESPN] Parsing pick: "${pickText}" -> team: "${parsed.team}", spread: ${parsed.spread}, o/u: ${parsed.overUnder}`);

  if (!parsed.team) return null;

  const canonicalTeamMatch = findTeamMatch(parsed.team);
  const providedSportKey = providedSport?.toLowerCase();
  const hasProvidedSport = Boolean(providedSportKey && SPORT_ENDPOINTS[providedSportKey]);
  const sport = hasProvidedSport && providedSportKey ? providedSportKey : detectSport(pickText);
  console.log(`[ESPN] ${hasProvidedSport ? 'Using provided sport' : 'Detected sport'}: ${sport}`);
  
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

  const scoreboardMatch = matchGameFromEvents(events, parsed, teamParts, isTwoTeamPick, sport);
  if (scoreboardMatch) {
    return scoreboardMatch;
  }

  // Try team schedule fallback for teams that need direct lookup (FCS, small programs)
  // For two-team picks, try looking up either team's schedule
  const teamsToCheck = isTwoTeamPick
    ? teamParts.map(t => findTeamMatch(t)).filter(Boolean) as string[]
    : canonicalTeamMatch ? [canonicalTeamMatch] : [];

  let foundFallback = false;
  for (const teamKey of teamsToCheck) {
    const overrideConfig = TEAM_ID_OVERRIDES[teamKey];
    if (overrideConfig) {
      console.log(`[ESPN] Attempting team-schedule fallback for ${teamKey} (team ID: ${overrideConfig.teamId})`);
      const seasonYear = getSeasonYearForSport(weekDate, sport);
      let scheduleEvents = await fetchTeamScheduleEvents(sport, overrideConfig.teamId, seasonYear);
      // Enrich with odds data since schedule API doesn't include odds
      scheduleEvents = await enrichEventsWithOdds(scheduleEvents, sport);
      const fallbackMatch = matchGameFromEvents(scheduleEvents, parsed, teamParts, isTwoTeamPick, sport, { start: startDate, end: endDate });
      if (fallbackMatch) {
        console.log(`[ESPN] Match resolved via team schedule for ${teamKey}`);
        return fallbackMatch;
      }
      foundFallback = true;
    }
  }

  // Enhanced fallback: If not found, try both teams' schedules and fetch summary for matching games
  if (teamsToCheck.length === 2) {
    const [teamA, teamB] = teamsToCheck;
    const teamAId = TEAM_ID_OVERRIDES[teamA]?.teamId;
    const teamBId = TEAM_ID_OVERRIDES[teamB]?.teamId;
    if (teamAId && teamBId) {
      const seasonYear = getSeasonYearForSport(weekDate, sport);
      const fallbackResult = await findGameViaTeamSchedules({
        sport,
        seasonYear,
        teamIds: [teamAId, teamBId],
        opponentName: teamB,
        gameDate: startDate.toISOString(),
      });
      if (fallbackResult && fallbackResult.summary) {
        console.log(`[ESPN] Enhanced fallback: Found game via team schedules and summary endpoint.`);
        // Extract live score, status, and win probability from summary
        const summary = fallbackResult.summary;
        console.log('[ESPN] Fallback summary data:', JSON.stringify(summary, null, 2));
        const event = fallbackResult.event;
        const comp = event.competitions?.[0];
        const home = comp?.competitors.find(c => c.homeAway === 'home');
        const away = comp?.competitors.find(c => c.homeAway === 'away');
        const status = comp?.status?.type?.state === 'in' ? 'live' : (comp?.status?.type?.state === 'post' ? 'final' : 'scheduled');
        const statusDetail = comp?.status?.type?.shortDetail || comp?.status?.type?.detail || '';
        const displayClock = comp?.status?.displayClock;
        const period = comp?.status?.period;
        const homeScore = parseScoreValue(home?.score);
        const awayScore = parseScoreValue(away?.score);
        // Try to extract win probability from summary
        let winProbability: number | undefined = undefined;
        if (summary.winprobability && Array.isArray(summary.winprobability) && summary.winprobability.length > 0) {
          // ESPN winprobability array: last item is most recent
          const last = summary.winprobability[summary.winprobability.length - 1];
          if (last && typeof last.homeWinPercentage === 'number' && home && away) {
            // Assign to home or away depending on matched team
            winProbability = last.homeWinPercentage;
          }
        }
        return {
          gameId: event.id,
          gameName: event.name,
          shortName: event.shortName,
          homeTeam: home?.team.displayName || '',
          awayTeam: away?.team.displayName || '',
          homeAbbrev: home?.team.abbreviation || '',
          awayAbbrev: away?.team.abbreviation || '',
          gameDate: event.date,
          gameDateFormatted: event.date,
          venue: comp?.venue?.fullName,
          city: comp?.venue?.city,
          state: comp?.venue?.state,
          broadcasts: comp?.broadcasts?.flatMap(b => b.names) || [],
          status,
          statusDetail,
          displayClock,
          period,
          homeScore,
          awayScore,
          matchedTeam: '',
          resolvedText: event.name,
          winProbability,
        };
      }
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
  sport: string = 'nfl',
  pickText?: string
): Promise<GameDetails | null> {
  // Parse the resolved text to extract team names
  // Expected format: "Away Team @ Home Team (pick details)"
  const match = resolvedText.match(/^(.+?)\s*@\s*(.+?)(?:\s*\(|$)/);
  if (!match) {
    // Fallback: try to extract team name from format like "Team (Team -4.5)"
    const teamOnlyMatch = resolvedText.match(/^(.+?)\s*\(/);
    if (teamOnlyMatch) {
      const teamName = teamOnlyMatch[1].trim();
      const canonicalTeam = findTeamMatch(teamName);
      if (canonicalTeam) {
        console.log(`[ESPN] Fallback lookup for team: ${canonicalTeam} (from "${teamName}")`);
        // Try to find this team's game using resolvePickFromESPN logic
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 10);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
        
        const events = await fetchESPNGames(sport, startDate, endDate);
        for (const event of events) {
          if (!event.competitions || event.competitions.length === 0) continue;
          const competition = event.competitions[0];
          const homeTeam = competition.competitors.find(c => c.homeAway === 'home')?.team;
          const awayTeam = competition.competitors.find(c => c.homeAway === 'away')?.team;
          if (!homeTeam || !awayTeam) continue;
          
          if (teamsMatch(canonicalTeam, homeTeam) || teamsMatch(canonicalTeam, awayTeam)) {
            const matchedTeam = teamsMatch(canonicalTeam, homeTeam) ? homeTeam.displayName : awayTeam.displayName;
            console.log(`[ESPN] Found game for ${canonicalTeam}: ${awayTeam.displayName} @ ${homeTeam.displayName}`);
            const parsed = pickText ? parsePickText(pickText) : { team: matchedTeam };
            return extractGameDetails(event, competition, matchedTeam, parsed, sport);
          }
        }
      }
    }
    console.log(`[ESPN] Cannot parse resolved text: "${resolvedText}"`);
    return null;
  }

  const awayTeamRaw = match[1].trim();
  const homeTeamRaw = match[2].trim();
  
  // Expand team aliases (e.g., "tt" -> "Texas Tech")
  const awayTeamCanonical = findTeamMatch(awayTeamRaw);
  const homeTeamCanonical = findTeamMatch(homeTeamRaw);
  const awayTeamName = awayTeamCanonical || awayTeamRaw;
  const homeTeamName = homeTeamCanonical || homeTeamRaw;

  console.log(`[ESPN] Looking up game: ${awayTeamName} @ ${homeTeamName} (raw: ${awayTeamRaw} @ ${homeTeamRaw})`);

  // Fetch recent/upcoming games (last 10 days to next 7 days)
  // Extended window to cover bowl games that may have been played earlier in the week
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 10);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

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
      const fallbackMatched = pickMatch ? pickMatch[1] : homeTeam.displayName;
      const parsedContext = pickText
        ? parsePickText(pickText)
        : pickMatch
          ? parsePickText(pickMatch[1])
          : { team: fallbackMatched } as ParsedPick;

      let matchedPickLabel = fallbackMatched;

      if (parsedContext.isOver !== undefined) {
        matchedPickLabel = parsedContext.isOver ? 'Over' : 'Under';
      } else if (parsedContext.team) {
        if (teamsMatch(parsedContext.team, homeTeam)) {
          matchedPickLabel = homeTeam.displayName;
        } else if (teamsMatch(parsedContext.team, awayTeam)) {
          matchedPickLabel = awayTeam.displayName;
        }
      }

      return extractGameDetails(event, competition, matchedPickLabel, parsedContext, sport);
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
