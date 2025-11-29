// College football schedule for 2025 season - Week 1 through end of regular season
export interface Game {
  date: string; // "YYYY-MM-DD"
  home: string;
  away: string;
  spread: number; // negative = home favored
  week: number;
}

export const CFB_SCHEDULE_2025: Game[] = [
  // Week 1: August 22-24, 2025
  { date: "2025-08-22", home: "Fresno State", away: "Kansas", spread: 14, week: 1 },
  { date: "2025-08-22", home: "Rutgers", away: "Howard", spread: -47, week: 1 },
  { date: "2025-08-23", home: "Stanford", away: "Cal Poly", spread: -2.5, week: 1 },
  { date: "2025-08-23", home: "Kansas State", away: "Wichita State", spread: -52, week: 1 },
  { date: "2025-08-23", home: "SMU", away: "TCU", spread: -8.5, week: 1 },
  { date: "2025-08-23", home: "Jacksonville State", away: "UCF", spread: -52.5, week: 1 },

  // Week 2: August 29-31, 2025
  { date: "2025-08-29", home: "Texas", away: "Alabama", spread: -13.5, week: 2 },
  { date: "2025-08-29", home: "Penn State", away: "Kent State", spread: -999, week: 2 }, // under line
  { date: "2025-08-30", home: "Ohio State", away: "Marshall", spread: -999, week: 2 }, // legend pick
  { date: "2025-08-30", home: "Maryland", away: "American", spread: -999, week: 2 }, // under line
  { date: "2025-08-30", home: "Tennessee", away: "North Carolina", spread: -13.5, week: 2 },
  { date: "2025-08-30", home: "Padres", away: "Rockies", spread: -1.5, week: 2 }, // MLB (Nathan's pick)
  { date: "2025-08-30", home: "Texas Tech", away: "Sinner", spread: -8.5, week: 2 }, // Tennis (Brandon's pick)
  { date: "2025-08-30", home: "Iowa", away: "Illinois", spread: -50.5, week: 2 },

  // Add more weeks as needed - extend with actual 2025 schedule
];

export function findGame(
  teamPart: string,
  spreadVal: number | null,
  dateStr: string | null,
  week: number
): Game | null {
  const tp = teamPart.toLowerCase();

  // Filter by week
  let candidates = CFB_SCHEDULE_2025.filter(g => g.week === week);

  // If date provided, also filter by date
  if (dateStr) {
    const dateDate = new Date(dateStr);
    const dateStart = new Date(dateDate);
    dateStart.setDate(dateStart.getDate());
    const dateEnd = new Date(dateDate);
    dateEnd.setDate(dateEnd.getDate() + 7);

    candidates = candidates.filter(g => {
      const gDate = new Date(g.date);
      return gDate >= dateStart && gDate < dateEnd;
    });
  }

  // Match by team name (home or away)
  let matches = candidates.filter(g => {
    const home = g.home.toLowerCase();
    const away = g.away.toLowerCase();
    return home.includes(tp) || away.includes(tp);
  });

  if (matches.length === 0) return null;

  // If spread provided, try to match it (within ±1)
  if (spreadVal !== null) {
    const spreadMatches = matches.filter(g => {
      return Math.abs(Math.abs(g.spread) - Math.abs(spreadVal)) <= 1;
    });
    if (spreadMatches.length > 0) return spreadMatches[0];
  }

  return matches[0];
}

export function formatGame(game: Game): string {
  return `${game.away} @ ${game.home} (${game.spread > 0 ? '+' : ''}${game.spread})`;
}
