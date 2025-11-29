export interface Player {
  id: number;
  name: string;
  division: 'Legends' | 'Leaders';
  seasonBetTotal: number;
  seasonRecord: string;
  wins: number;
  losses: number;
  pushes: number;
  winPercentage: number;
  currentStreak: string; // e.g., "W5" or "L2"
}

export interface Pick {
  id: number;
  week: number;
  playerId: number;
  team: string;
  resolvedTeam?: string; // The full resolved game/match name from ESPN
  odds: string;
  amount: number;
  result: 'Win' | 'Loss' | 'Push' | 'Pending';
  isTail: boolean;
  isReverseTail: boolean;
  isReverseTailed?: boolean; // When this pick is offset by a reverse tail
  finalScore?: string;
  tailingPlayerId?: number; // If tailing someone
  startTime?: string;
  tvChannel?: string;
  // Live game data from ESPN
  gameStatus?: 'scheduled' | 'live' | 'final';
  gameDate?: string;
  gameDateFormatted?: string;
  homeScore?: number;
  awayScore?: number;
  homeTeam?: string;
  awayTeam?: string;
  homeAbbrev?: string;
  awayAbbrev?: string;
  statusDetail?: string;
  broadcasts?: string[];
  gameSpread?: number; // The spread from ESPN (absolute value)
  gameOverUnder?: number; // The over/under total from ESPN
  favoriteTeam?: string; // Which team is favored (abbreviation like "OSU")
}

// Mock Data Generator
const PLAYERS: Player[] = [
  { id: 1, name: 'Ethan', division: 'Legends', seasonBetTotal: 35, seasonRecord: '4-1-0', wins: 4, losses: 1, pushes: 0, winPercentage: 80.0, currentStreak: 'W3' },
  { id: 2, name: 'Marcus', division: 'Legends', seasonBetTotal: 45, seasonRecord: '3-2-0', wins: 3, losses: 2, pushes: 0, winPercentage: 60.0, currentStreak: 'L1' },
  { id: 3, name: 'Sarah', division: 'Legends', seasonBetTotal: 25, seasonRecord: '2-3-0', wins: 2, losses: 3, pushes: 0, winPercentage: 40.0, currentStreak: 'W1' },
  { id: 4, name: 'James', division: 'Legends', seasonBetTotal: 55, seasonRecord: '4-1-0', wins: 4, losses: 1, pushes: 0, winPercentage: 80.0, currentStreak: 'W4' },
  { id: 5, name: 'Olivia', division: 'Legends', seasonBetTotal: 15, seasonRecord: '1-4-0', wins: 1, losses: 4, pushes: 0, winPercentage: 20.0, currentStreak: 'L3' },
  { id: 6, name: 'David', division: 'Legends', seasonBetTotal: 30, seasonRecord: '3-2-0', wins: 3, losses: 2, pushes: 0, winPercentage: 60.0, currentStreak: 'W1' },
  { id: 7, name: 'Emma', division: 'Leaders', seasonBetTotal: 40, seasonRecord: '3-2-0', wins: 3, losses: 2, pushes: 0, winPercentage: 60.0, currentStreak: 'W2' },
  { id: 8, name: 'Ryan', division: 'Leaders', seasonBetTotal: 20, seasonRecord: '2-3-0', wins: 2, losses: 3, pushes: 0, winPercentage: 40.0, currentStreak: 'L1' },
  { id: 9, name: 'Chloe', division: 'Leaders', seasonBetTotal: 10, seasonRecord: '1-4-0', wins: 1, losses: 4, pushes: 0, winPercentage: 20.0, currentStreak: 'L2' },
  { id: 10, name: 'Noah', division: 'Leaders', seasonBetTotal: 50, seasonRecord: '4-1-0', wins: 4, losses: 1, pushes: 0, winPercentage: 80.0, currentStreak: 'W1' },
];

const CURRENT_SEASON = 4;
const CURRENT_WEEK = 6;

// Generate some past picks
const PAST_PICKS: Pick[] = [];
for (let w = 1; w < CURRENT_WEEK; w++) {
  PLAYERS.forEach(p => {
    PAST_PICKS.push({
      id: Math.random(),
      week: w,
      playerId: p.id,
      team: `Team ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
      odds: '-110',
      amount: 5 + Math.floor(Math.random() * 4) * 5,
      result: Math.random() > 0.4 ? 'Win' : 'Loss', // Simplified logic
      isTail: Math.random() > 0.8,
      isReverseTail: false,
      finalScore: '24-17',
      startTime: '1:00 PM',
      tvChannel: Math.random() > 0.5 ? 'FOX' : 'CBS'
    });
  });
}

// Current Week Picks (some pending, some submitted)
const CURRENT_PICKS: Pick[] = PLAYERS.map((p, idx) => {
  const hasScore = idx % 3 !== 0 && Math.random() > 0.5;
  // Teams logic: Ensure everyone has a team for the mockup
  const teams = ['Lakers -4.5', 'Chiefs -3', 'Bills -2.5', 'Eagles -6', 'Ravens -3.5'];
  const team = teams[idx % teams.length];
  
  return {
    id: Math.random(),
    week: CURRENT_WEEK,
    playerId: p.id,
    team: team, 
    odds: '-110',
    amount: 5 + (p.losses > p.wins ? 5 : 0), // Simple logic simulation
    result: 'Pending' as const, // Explicitly cast as const or literal type
    isTail: idx === 6, // Example tail
    isReverseTail: false,
    tailingPlayerId: idx === 6 ? 1 : undefined,
    finalScore: hasScore ? '14-10 (2nd Q)' : undefined, // Add some live scores
    startTime: '4:25 PM',
    tvChannel: idx % 2 === 0 ? 'FOX' : 'ABC'
  };
}); // Removed filter to show all players picks

export const getSeasonInfo = () => ({ season: CURRENT_SEASON, week: CURRENT_WEEK });
export const getPlayers = () => PLAYERS;
export const getPicksByWeek = (week: number) => [...PAST_PICKS, ...CURRENT_PICKS].filter(p => p.week === week);
export const getAllPicks = () => [...PAST_PICKS, ...CURRENT_PICKS];

// Simple storage wrapper to persist admin changes
export const savePick = (pick: Pick) => {
  console.log("Saving pick", pick);
  const existingIdx = CURRENT_PICKS.findIndex(p => p.playerId === pick.playerId && p.week === pick.week);
  if (existingIdx >= 0) {
    CURRENT_PICKS[existingIdx] = pick;
  } else {
    CURRENT_PICKS.push(pick);
  }
};
