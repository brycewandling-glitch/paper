import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { getSeasonInfo, type Pick } from '@/lib/mockData';
import { fetchSeasonPlayers, fetchPicksByWeek, fetchSeasonWeekCount, fetchGameDetails, syncPickResultToSheet, type GameDetails } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Ticket as TicketIcon } from 'lucide-react';


type ComputedPickOutcome = {
  result: 'Win' | 'Loss' | 'Push';
  finalScore: string;
};

const MONEYLINE_REGEX = /\b(ml|moneyline)\b/i;

const CONFIDENCE_COLORS: Record<'likely_win' | 'coin_flip' | 'likely_loss', { base: string; soft: string }> = {
  likely_win: { base: '#059669', soft: 'rgba(5, 150, 105, 0.18)' },
  coin_flip: { base: '#facc15', soft: 'rgba(250, 204, 21, 0.18)' },
  likely_loss: { base: '#dc2626', soft: 'rgba(220, 38, 38, 0.2)' },
};

const LIVE_REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute when live games
const IDLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes when no live games

const clampProgress = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const formatWinProbability = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return `${Math.round(value * 100)}%`;
};

const normalizeTeamName = (name?: string) =>
  name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

const stripMetaFromTeam = (value?: string) => {
  if (!value) return '';
  return value
    .replace(/\(?\s*(legends|leaders|nfl|nba|mlb|nhl|ncaaf|cfb|ncaab|cbb)\s*\)?/gi, '')
    .replace(MONEYLINE_REGEX, '')
    .trim();
};

const formatFinalScore = (pick: Pick) => {
  const awayLabel = pick.awayAbbrev || pick.awayTeam || 'Away';
  const homeLabel = pick.homeAbbrev || pick.homeTeam || 'Home';
  return `${awayLabel} ${pick.awayScore ?? ''} - ${homeLabel} ${pick.homeScore ?? ''}`.trim();
};

const matchTeamSide = (candidate: string, pick: Pick): 'home' | 'away' | null => {
  const normalizedCandidate = normalizeTeamName(candidate);
  if (!normalizedCandidate) return null;
  const home = normalizeTeamName(pick.homeTeam);
  const away = normalizeTeamName(pick.awayTeam);

  if (home && (home.includes(normalizedCandidate) || normalizedCandidate.includes(home))) {
    return 'home';
  }
  if (away && (away.includes(normalizedCandidate) || normalizedCandidate.includes(away))) {
    return 'away';
  }
  return null;
};

const isOverUnderDescriptor = (value?: string) => {
  if (!value) return false;
  return /\b(over|under)\b/i.test(value);
};

const formatOddsValue = (value?: number | null) => {
  if (value === undefined || value === null) return '';
  if (Number.isNaN(value)) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num > 0 ? `+${num}` : `${num}`;
};
const deriveOddsFromGameDetails = (pick: Pick, details: GameDetails): string => {
  if (!details) return '';
  if (isOverUnderDescriptor(pick.team) || isOverUnderDescriptor(pick.resolvedTeam)) {
    return '';
  }

  const cleanedTeam = stripMetaFromTeam(pick.team).replace(/([+-]?\d+\.?\d*)$/, '').trim();
  const candidateNames = Array.from(new Set(
    [details.matchedTeam, cleanedTeam]
      .filter((value): value is string => Boolean(value && value.trim()))
  ));

  const augmentedPick = {
    ...pick,
    homeTeam: details.homeTeam,
    awayTeam: details.awayTeam,
    homeAbbrev: details.homeAbbrev,
    awayAbbrev: details.awayAbbrev,
  } as Pick;

  for (const candidate of candidateNames) {
    const side = matchTeamSide(candidate, augmentedPick);
    if (side === 'home') {
      const odds = formatOddsValue(details.homeSpreadOdds ?? details.homeMoneylineOdds);
      if (odds) return odds;
    } else if (side === 'away') {
      const odds = formatOddsValue(details.awaySpreadOdds ?? details.awayMoneylineOdds);
      if (odds) return odds;
    }
  }

  return '';
};

const extractSpreadFromText = (text: string) => {
  if (!text || /\b(over|under)\b/i.test(text)) return null;
  const cleaned = stripMetaFromTeam(text);
  const match = cleaned.match(/(.+?)\s*([+-]?\d+\.?\d*)\s*$/);
  if (!match) return null;
  const teamName = match[1].trim();
  const spread = parseFloat(match[2]);
  if (!teamName || Number.isNaN(spread)) return null;
  return { teamName, spread };
};

const deriveSpreadFromGame = (pick: Pick, side: 'home' | 'away') => {
  if (typeof pick.gameSpread !== 'number') return null;
  if (!pick.favoriteTeam) return null;
  const pickedAbbrev = (side === 'home' ? pick.homeAbbrev : pick.awayAbbrev)?.toUpperCase();
  if (!pickedAbbrev) return null;
  const isFavorite = pickedAbbrev === pick.favoriteTeam.toUpperCase();
  const absolute = Math.abs(pick.gameSpread);
  return isFavorite ? -absolute : absolute;
};

const evaluateSpreadResult = (
  pick: Pick,
  side: 'home' | 'away',
  spread: number,
  finalScore: string
): ComputedPickOutcome => {
  const pickScore = side === 'home' ? pick.homeScore! : pick.awayScore!;
  const oppScore = side === 'home' ? pick.awayScore! : pick.homeScore!;
  const adjusted = pickScore + spread;
  if (Math.abs(adjusted - oppScore) < 0.0001) {
    return { result: 'Push', finalScore };
  }
  return { result: adjusted > oppScore ? 'Win' : 'Loss', finalScore };
};

const evaluateMoneylineResult = (
  pick: Pick,
  side: 'home' | 'away',
  finalScore: string
): ComputedPickOutcome => {
  const pickScore = side === 'home' ? pick.homeScore! : pick.awayScore!;
  const oppScore = side === 'home' ? pick.awayScore! : pick.homeScore!;
  if (pickScore === oppScore) {
    return { result: 'Push', finalScore };
  }
  return { result: pickScore > oppScore ? 'Win' : 'Loss', finalScore };
};

const isMoneylinePick = (pick: Pick, detailText: string) => {
  const source = `${detailText} ${pick.team ?? ''}`;
  return MONEYLINE_REGEX.test(source);
};

const computePickOutcomeFromGame = (pick: Pick): ComputedPickOutcome | null => {
  if (pick.gameStatus !== 'final') return null;
  if (typeof pick.homeScore !== 'number' || typeof pick.awayScore !== 'number') return null;
  if (!pick.resolvedTeam || pick.resolvedTeam.startsWith('Tail') || pick.resolvedTeam.startsWith('Reverse Tail')) {
    return null;
  }
  if (pick.isTail || pick.isReverseTail) return null;

  const finalScore = formatFinalScore(pick);

  const overUnderMatch = pick.resolvedTeam.match(/\((Over|Under)\s*(\d+\.?\d*)?\)/i);
  if (overUnderMatch) {
    const threshold = overUnderMatch[2]
      ? parseFloat(overUnderMatch[2])
      : (typeof pick.gameOverUnder === 'number' ? pick.gameOverUnder : Number(pick.gameOverUnder));
    if (Number.isNaN(threshold)) return null;
    const totalScore = pick.homeScore + pick.awayScore;
    if (Math.abs(totalScore - threshold) < 0.0001) {
      return { result: 'Push', finalScore };
    }
    const isOver = overUnderMatch[1].toLowerCase() === 'over';
    return {
      result: isOver ? (totalScore > threshold ? 'Win' : 'Loss') : (totalScore < threshold ? 'Win' : 'Loss'),
      finalScore,
    };
  }
  const detailMatch = pick.resolvedTeam.match(/\(([^()]+)\)\s*$/);
  const detailText = detailMatch ? detailMatch[1].trim() : '';
  const spreadFromDetail = detailText ? extractSpreadFromText(detailText) : null;
  const spreadFromPick = pick.team ? extractSpreadFromText(String(pick.team)) : null;
  let numericSpread = spreadFromDetail?.spread;
  if (numericSpread === undefined || Number.isNaN(numericSpread)) {
    numericSpread = spreadFromPick?.spread ?? null;
  }

  const candidateTeams = Array.from(new Set([
    spreadFromDetail?.teamName,
    spreadFromPick?.teamName,
    detailText && !spreadFromDetail ? stripMetaFromTeam(detailText) : null,
    stripMetaFromTeam(pick.team)
  ].filter(Boolean) as string[]));

  const moneyline = isMoneylinePick(pick, detailText);

  for (const candidate of candidateTeams) {
    const side = matchTeamSide(candidate, pick);
    if (!side) continue;

    if (typeof numericSpread === 'number' && !Number.isNaN(numericSpread)) {
      return evaluateSpreadResult(pick, side, numericSpread, finalScore);
    }

    const derivedSpread = deriveSpreadFromGame(pick, side);
    if (typeof derivedSpread === 'number' && !Number.isNaN(derivedSpread)) {
      return evaluateSpreadResult(pick, side, derivedSpread, finalScore);
    }

    if (moneyline) {
      return evaluateMoneylineResult(pick, side, finalScore);
    }
  }

  return null;
};

export default function Ticket() {
  const { week: currentWeek, season: currentSeason } = getSeasonInfo();
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [weeks, setWeeks] = React.useState<number[]>([]);

  const [players, setPlayers] = React.useState<Array<any>>([]);
  const [picks, setPicks] = React.useState<Pick[]>([]);
  const [loading, setLoading] = React.useState(false);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize with the most recent week
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const seasonName = `Season ${currentSeason}`;
        const wkCount = await fetchSeasonWeekCount(seasonName);
        if (!mounted) return;
        const totalWeeks = wkCount > 0 ? wkCount : currentWeek;
        const weeksList = Array.from({ length: totalWeeks }, (_, i) => i + 1);
        setWeeks(weeksList);
        // Default to the most recent week
        setSelectedWeek(totalWeeks);
      } catch (err) {
        console.error('Failed to fetch week count', err);
        setWeeks(Array.from({ length: currentWeek }, (_, i) => i + 1));
        setSelectedWeek(currentWeek);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const fetchWeekData = React.useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    if (selectedWeek === null) return;
    if (!silent) {
      setLoading(true);
      setPicks([]);
    }
    try {
      // TODO: Add actual week data fetching logic here
    } catch (err) {
      console.error('Failed to load picks', err);
      if (!isMountedRef.current) return;
      setPlayers([]);
      if (!silent) {
        setPicks([]);
      }
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [selectedWeek, currentSeason]);

// Log game statuses when picks change
React.useEffect(() => {
  const statuses = picks.map(p => ({ team: p.resolvedTeam?.slice(0, 30), status: p.gameStatus }));
  console.log('[Ticket] Pick statuses:', statuses);
}, [picks]);

  React.useEffect(() => {
    if (selectedWeek === null) return;
    console.log(`[Ticket] Setting up refresh interval: ${refreshInterval / 1000}s (hasLiveGame: ${hasLiveGame})`);
    const interval = setInterval(() => {
      console.log(`[Ticket] Auto-refreshing picks...`);
      void fetchWeekData({ silent: true });
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedWeek, fetchWeekData, refreshInterval]);

  // Group picks by division — determine division from the week's description when present
  const resolvePickDivision = (pick: Pick, player: any) => {
    const desc = String(pick.team ?? '').toLowerCase();
    if (desc.includes('(legends)')) return 'Legends';
    if (desc.includes('(leaders)')) return 'Leaders';
    return player?.division ?? 'Leaders';
  };

  // Filter out reverse tail picks from bet slip (they're for tracking/standings only)
  // Reverse tail picks offset other bets but are shown as crossed off
  const picksBetSlip = picks.filter(pick => !pick.isReverseTail);
  
  // Apply reverse tail cancellation logic
  // For each reverse tail, find the matching pick and mark it as reverse tailed
  const reverseTails = picks.filter(pick => pick.isReverseTail);
  const reverseTailedPickIds = new Set<number>();
  
  reverseTails.forEach(reverseTail => {
    // Find picks from the tailed player that match this reverse tail
    const tailedPlayerId = reverseTail.tailingPlayerId;
    if (!tailedPlayerId) return;
    
    // Find a matching pick from the tailed player to mark as reverse tailed
    const matchingPick = picksBetSlip.find(p => 
      p.playerId === tailedPlayerId && 
      !reverseTailedPickIds.has(p.id as any)
    );
    
    if (matchingPick) {
      reverseTailedPickIds.add(matchingPick.id as any);
    }
  });

  // Keep all picks but mark which ones are reverse tailed (shown as crossed off)
  const picksAfterCancellation = picksBetSlip.map(pick => ({
    ...pick,
    isReverseTailed: reverseTailedPickIds.has(pick.id as any)
  }));

  const legendsPicks = picksAfterCancellation.filter(pick => {
    const player = players.find(p => p.id === pick.playerId);
    return resolvePickDivision(pick, player) === 'Legends';
  });

  const leadersPicks = picksAfterCancellation.filter(pick => {
    const player = players.find(p => p.id === pick.playerId);
    return resolvePickDivision(pick, player) === 'Leaders';
  });

  const renderPickCard = (pick: Pick) => {
    const player = players.find(p => p.id === pick.playerId);
    if (!player) return null;
    const pickDivision = ((): 'Legends' | 'Leaders' => {
      const desc = String(pick.team ?? '').toLowerCase();
      if (desc.includes('(legends)')) return 'Legends';
      if (desc.includes('(leaders)')) return 'Leaders';
      return player.division ?? 'Leaders';
    })();

    // Show WP only at the top next to player name for live games
    const showWP = pick.gameStatus === 'live' && typeof pick.winProbability === 'number' && !Number.isNaN(pick.winProbability);
    return (
      <Card key={pick.id}>
        <CardContent>
          <div className="flex items-center gap-2">
            <span>{player.name}</span>
            {showWP && (
              <span className="ml-2 px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs font-semibold" title="Win Probability">
                {formatWinProbability(pick.winProbability)}
              </span>
            )}
          </div>
          <div>{pick.team}</div>
        </CardContent>
      </Card>
    );
  }

  const legendsResult = calculateGroupResult(legendsPicks);
  const leadersResult = calculateGroupResult(leadersPicks);

  const renderGroupSection = (title: string, picks: Pick[], icon: React.ReactNode, result: string | null, accentColor: string) => (
    <div className={cn(
      "rounded-lg shadow-sm border overflow-hidden transition-all",
      result === 'Win' ? "bg-emerald-50/30 border-emerald-200" : 
      result === 'Loss' ? "bg-rose-50/30 border-rose-200" : "bg-white border-border"
    )}>
      <div className={cn(
        "px-6 py-4 border-b flex justify-between items-center",
        result === 'Win' ? "bg-emerald-100/40 border-emerald-200" : 
        result === 'Loss' ? "bg-rose-100/40 border-rose-200" : "bg-secondary/30 border-border"
      )}>
        <div className="flex items-center gap-2">
          <div className={cn("p-1 rounded text-white", accentColor === "primary" ? "bg-primary" : "bg-secondary border border-border text-muted-foreground")}> 
            {icon}
          </div>
          <h2 className={cn("text-lg font-bold tracking-tight", accentColor === "primary" ? "text-primary" : "text-muted-foreground")}>{title}</h2>
        </div>
        {result && (
          <span className={cn(
            "font-bold text-xs px-2 py-1 rounded uppercase tracking-wide border",
            result === 'Win' ? "bg-emerald-100 text-emerald-800 border-emerald-200" : 
            result === 'Loss' ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-amber-100 text-amber-800 border-amber-200"
          )}>
            {result}
          </span>
        )}
      </div>
      <div className={cn("p-6", result ? "bg-transparent" : "bg-slate-50/50")}> 
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded border border-border bg-white p-3 animate-pulse" />
            ))}
          </div>
        ) : picks.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map(renderPickCard)}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground bg-white rounded-lg border border-dashed">
            No picks submitted for {title} this week yet.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-white rounded-lg p-6 shadow-sm border flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <TicketIcon className="h-10 w-10 text-primary" strokeWidth={2} />
            <div className="h-12 w-px bg-border mx-2 hidden sm:block"></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Bets</h1>
              <p className="text-muted-foreground font-medium text-sm uppercase tracking-widest mt-1">
                <span className="md:hidden">picks & game tracking</span>
                <span className="hidden md:inline">picks & game tracking</span>
              </p>
            </div>
          </div>
        </div>

        {/* Week Selector */}
        <div className="bg-white rounded-lg p-4 shadow-sm border flex justify-center md:justify-start">
          <div className="grid grid-cols-5 gap-2 w-full md:flex md:flex-wrap md:w-auto">
            {weeks.map((w) => (
              <button
                key={w}
                onClick={() => setSelectedWeek(w)}
                className={cn(
                  // fixed width so single-digit weeks match two-digit buttons, centered text
                  "w-12 md:w-20 h-8 md:h-9 rounded-md text-[10px] md:text-sm font-medium transition-all border flex items-center justify-center text-center",
                  selectedWeek === w
                    ? "bg-primary text-white border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                )}
              >
                <span className="md:hidden">Wk {w}</span>
                <span className="hidden md:inline">Week {w}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
            {/* Legends Section */}
            {renderGroupSection("Legends", legendsPicks, <Trophy size={14} />, legendsResult, "primary")}

            {/* Leaders Section */}
            {renderGroupSection("Leaders", leadersPicks, <Medal size={14} />, leadersResult, "secondary")}
        </div>
      </div>
    </Layout>
  );

}
