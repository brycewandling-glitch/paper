import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { getSeasonInfo, type Pick } from '@/lib/mockData';
import { fetchSeasonPlayers, fetchPicksByWeek, fetchSeasonWeekCount, fetchGameDetails, syncPickResultToSheet, fetchWeekPicksWithGameDetails } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Ticket as TicketIcon, ExternalLink } from 'lucide-react';

// Extended Pick type with loading state
type PickWithLoading = Pick & {
  isLoadingGameDetails?: boolean;
};

type ComputedPickOutcome = {
  result: 'Win' | 'Loss' | 'Push';
  finalScore: string;
};

// Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
const getOrdinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const MONEYLINE_REGEX = /\b(ml|moneyline)\b/i;

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
  // Handle golf tournament bets
  if (pick.isGolfTournament) {
    if (pick.gameStatus !== 'final') return null;
    const finalScore = `${pick.golferName}: ${getOrdinal(pick.golferPosition || 0)} place (${pick.golferScore})`;
    // Golf "to win" bet - win only if golfer finishes 1st
    return {
      result: pick.golferPosition === 1 ? 'Win' : 'Loss',
      finalScore
    };
  }
  
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
    pick.matchedTeam, // Use the canonical matched team name from ESPN first
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
  const [picks, setPicks] = React.useState<PickWithLoading[]>([]);
  const [loading, setLoading] = React.useState(false);
  
  // Ref to track players for auto-refresh without causing re-renders
  const playersRef = React.useRef<Array<any>>([]);
  React.useEffect(() => {
    playersRef.current = players;
  }, [players]);

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

  React.useEffect(() => {
    if (selectedWeek === null) return;
    
    let mounted = true;
    const abortController = new AbortController();
    setLoading(true);
    // Clear previous picks immediately to avoid showing stale data while loading
    setPicks([]);
    
    (async () => {
      try {
        const seasonName = `Season ${currentSeason}`;
        const pls = await fetchSeasonPlayers(seasonName);
        const playerNameById = new Map(pls.map((player: any) => [player.id, player.name]));
        if (!mounted) return;
        setPlayers(pls);

        const wkPicks = await fetchPicksByWeek(seasonName, selectedWeek);
        if (!mounted) return;
        
        // Immediately show picks with loading state for those that need game details
        const initialPicks: PickWithLoading[] = wkPicks.map((pick) => ({
          ...pick,
          isLoadingGameDetails: !!(pick.resolvedTeam && !pick.resolvedTeam.startsWith('Tail') && !pick.resolvedTeam.startsWith('Reverse Tail')),
        }));
        
        setPicks(initialPicks);
        setLoading(false); // We have picks, so hide main loading state
        
        // Now progressively fetch game details for each pick
        const fetchGameDetailsForPick = async (pick: Pick, index: number) => {
          if (!pick.resolvedTeam || pick.resolvedTeam.startsWith('Tail') || pick.resolvedTeam.startsWith('Reverse Tail')) {
            return pick;
          }
          
          try {
            // Detect sport from resolved text
            const resolvedLower = pick.resolvedTeam.toLowerCase();
            
            // Check for college keywords FIRST (before NFL teams that share nicknames)
            const collegeKeywords = [
              'baylor', 'houston cougars', 'cougars', 'longhorns', 'aggies', 'sooners', 'seminoles',
              'crimson tide', 'tide', 'bulldogs', 'volunteers', 'gators', 'wolverines', 'buckeyes',
              'tigers', 'wildcats', 'fighting illini', 'illini', 'hawkeyes', 'badgers', 'spartans',
              'nittany lions', 'hoosiers', 'boilermakers', 'cornhuskers', 'jayhawks', 'cyclones',
              'mountaineers', 'horned frogs', 'red raiders', 'gamecocks', 'commodores', 'rebels',
              'razorbacks', 'huskies', 'ducks', 'beavers', 'bruins', 'trojans', 'sun devils',
              'buffaloes', 'utes', 'cougar', 'golden bears', 'golden gophers', 'gophers', 'cardinal', 'fighting irish',
              'tar heels', 'cavaliers', 'hokies', 'demon deacons', 'blue devils', 'wolfpack',
              'yellow jackets', 'hurricanes', 'orange', 'owls', 'mustangs', 'bearcats',
              'memphis', 'tulane', 'tulsa', 'smu', 'ucf', 'usf', 'cincinnati', 'louisville',
              'pitt', 'boston college', 'syracuse', 'duke', 'wake forest', 'virginia tech',
              'georgia tech', 'miami hurricanes', 'florida state', 'nc state', 'northwestern',
              'purdue', 'indiana', 'maryland', 'rutgers', 'iowa', 'wisconsin',
              'illinois', 'nebraska', 'kansas', 'kansas state', 'oklahoma state', 'west virginia',
              'tcu', 'texas tech', 'colorado', 'utah', 'arizona state', 'ucla', 'usc', 'cal',
              'stanford', 'washington state', 'oregon state', 'auburn', 'alabama'
            ];
            
            const nflTeams = ['cardinals', 'falcons', 'ravens', 'bills', 'panthers', 'bears', 'bengals', 
              'browns', 'cowboys', 'broncos', 'lions', 'packers', 'texans', 'colts', 'jaguars', 
              'chiefs', 'raiders', 'chargers', 'rams', 'dolphins', 'vikings', 'patriots', 'saints',
              'giants', 'jets', 'eagles', 'steelers', '49ers', 'seahawks', 'buccaneers', 'titans', 'commanders'];
            
            // Golf-related keywords for detection
            const golfKeywords = ['pga', 'golf', 'to win', 'outright winner', 'tournament winner'];
            const golferNames = ['scheffler', 'mcilroy', 'rahm', 'koepka', 'dechambeau', 'hovland', 
              'spieth', 'thomas', 'cantlay', 'morikawa', 'schauffele', 'finau', 'woodland', 'fowler', 
              'matsuyama', 'fleetwood', 'homa', 'kim'];
            
            const pickTextLower = String(pick.team ?? '').toLowerCase();
            let sport = 'ncaaf'; // Default to college football

            // Check for golf bet first
            const hasGolfKeyword = golfKeywords.some(kw => pickTextLower.includes(kw) || resolvedLower.includes(kw));
            const hasGolferName = golferNames.some(name => pickTextLower.includes(name) || resolvedLower.includes(name));
            const isGolfBet = hasGolfKeyword || (hasGolferName && (pickTextLower.includes('to win') || pickTextLower.includes('win')));

            const hasExplicitNFLTag = /(\(|\b)nfl\b/i.test(pickTextLower);
            const hasExplicitCollegeFootballTag = /(\(|\b)(ncaaf|cfb)\b/i.test(pickTextLower);
            const hasExplicitCollegeBasketballTag = /(\(|\b)(ncaab|cbb)\b/i.test(pickTextLower);
            const hasExplicitNBATag = /(\(|\b)nba\b/i.test(pickTextLower);
            const hasExplicitNHLTag = /(\(|\b)nhl\b/i.test(pickTextLower);
            const hasExplicitMLBTag = /(\(|\b)mlb\b/i.test(pickTextLower);

            if (isGolfBet) {
              sport = 'pga';
            } else if (hasExplicitNFLTag) {
              sport = 'nfl';
            } else if (hasExplicitNBATag) {
              sport = 'nba';
            } else if (hasExplicitNHLTag) {
              sport = 'nhl';
            } else if (hasExplicitMLBTag) {
              sport = 'mlb';
            } else if (hasExplicitCollegeBasketballTag) {
              sport = 'ncaab';
            } else if (hasExplicitCollegeFootballTag) {
              sport = 'ncaaf';
            } else {
              const matchedCollegeKeyword = collegeKeywords.find(keyword => resolvedLower.includes(keyword));
              const matchedNFLTeam = nflTeams.find(team => resolvedLower.includes(team));
              if (matchedNFLTeam && !matchedCollegeKeyword) {
                sport = 'nfl';
              } else if (!matchedNFLTeam && matchedCollegeKeyword) {
                sport = 'ncaaf';
              } else if (matchedNFLTeam && matchedCollegeKeyword) {
                const nflHasUniqueMascot = !['bears', 'lions', 'tigers'].includes(matchedNFLTeam);
                sport = nflHasUniqueMascot ? 'nfl' : 'ncaaf';
              }
            }
            
            const gameDetails = await fetchGameDetails(pick.resolvedTeam, sport, { pickText: String(pick.team ?? ''), week: selectedWeek, sheet: seasonName });
            if (!mounted) return pick;
            
            if (gameDetails) {
              const pickTextLower = String(pick.team ?? '').toLowerCase();
              const hasOverKeyword = /\bover\b/.test(pickTextLower);
              const hasUnderKeyword = /\bunder\b/.test(pickTextLower);
              const resolvedPickDetails = pick.resolvedTeam.match(/\(([^()]+)\)\s*$/)?.[1]?.trim() ?? '';
              const numericFromResolved = (() => {
                const match = resolvedPickDetails.match(/(\d+\.?\d*)/);
                return match ? parseFloat(match[1]) : undefined;
              })();
              const numericFromPickText = (() => {
                const match = pickTextLower.match(/(over|under)\s*(\d+\.?\d*)/i);
                return match ? parseFloat(match[2]) : undefined;
              })();
              
              // Always construct resolvedTeam from game details to handle mismatches
              // between spreadsheet data and actual game
              const matchup = `${gameDetails.awayTeam} @ ${gameDetails.homeTeam}`;
              let adjustedResolved: string;

              if ((hasOverKeyword || hasUnderKeyword) && !pick.isTail && !pick.isReverseTail) {
                const ouLabel = hasOverKeyword && !hasUnderKeyword ? 'Over' : hasUnderKeyword && !hasOverKeyword ? 'Under' : (hasOverKeyword ? 'Over' : 'Under');
                const derivedTotal = [
                  gameDetails.overUnder,
                  pick.gameOverUnder,
                  numericFromResolved,
                  numericFromPickText
                ].find(value => typeof value === 'number' && !Number.isNaN(value));
                const totalText = typeof derivedTotal === 'number' ? ` ${derivedTotal}` : '';
                adjustedResolved = `${matchup} (${ouLabel}${totalText})`;
                gameDetails.overUnder = typeof derivedTotal === 'number' ? derivedTotal : gameDetails.overUnder;
              } else {
                // For spread/moneyline bets, use gameDetails.resolvedText if available,
                // otherwise construct from matchup with pick details
                adjustedResolved = gameDetails.resolvedText || `${matchup} (${resolvedPickDetails || gameDetails.matchedTeam || ''})`;
              }

              const enhancedPick = {
                ...pick,
                resolvedTeam: adjustedResolved,
                matchedTeam: gameDetails.matchedTeam,
                gameStatus: gameDetails.status,
                gameDate: gameDetails.gameDate,
                gameDateFormatted: gameDetails.gameDateFormatted,
                homeScore: gameDetails.homeScore,
                awayScore: gameDetails.awayScore,
                homeTeam: gameDetails.homeTeam,
                awayTeam: gameDetails.awayTeam,
                homeAbbrev: gameDetails.homeAbbrev,
                awayAbbrev: gameDetails.awayAbbrev,
                statusDetail: gameDetails.statusDetail,
                broadcasts: gameDetails.broadcasts,
                tvChannel: gameDetails.broadcasts?.[0] || pick.tvChannel,
                gameSpread: gameDetails.spread,
                gameOverUnder: gameDetails.overUnder ?? pick.gameOverUnder ?? numericFromResolved ?? numericFromPickText,
                favoriteTeam: gameDetails.favoriteTeam,
                winProbability: gameDetails.winProbability,
                gameProgress: gameDetails.gameProgress,
                bovadaUrl: gameDetails.bovadaUrl,
                isLoadingGameDetails: false,
                // Golf-specific fields
                isGolfTournament: gameDetails.isGolfTournament,
                tournamentName: gameDetails.tournamentName,
                golferName: gameDetails.golferName,
                golferPosition: gameDetails.golferPosition,
                golferScore: gameDetails.golferScore,
                tournamentRound: gameDetails.tournamentRound,
                totalRounds: gameDetails.totalRounds,
              };
              
              // Compute outcome if game is final
              const computed = computePickOutcomeFromGame(enhancedPick);
              if (computed) {
                // Sync result if it changed
                if (pick.result !== computed.result) {
                  const playerName = playerNameById.get(pick.playerId);
                  if (playerName) {
                    void syncPickResultToSheet({
                      sheetName: seasonName,
                      weekNumber: selectedWeek,
                      playerName,
                      result: computed.result,
                    }).catch(err => console.error('Failed to sync pick result', err));
                  }
                }
                return {
                  ...enhancedPick,
                  result: computed.result,
                  finalScore: computed.finalScore,
                };
              }
              
              return enhancedPick;
            }
          } catch (e) {
            console.error('Failed to fetch game details for pick:', e);
          }
          
          return { ...pick, isLoadingGameDetails: false };
        };
        
        // Fetch game details concurrently but update state as each completes
        const pickPromises = wkPicks.map((pick, index) => 
          fetchGameDetailsForPick(pick, index).then(updatedPick => {
            if (!mounted) return;
            
            setPicks(currentPicks => {
              const newPicks = [...currentPicks];
              const pickIndex = newPicks.findIndex(p => p.id === pick.id);
              if (pickIndex !== -1) {
                newPicks[pickIndex] = updatedPick as PickWithLoading;
                
                // Handle tail propagation for this pick
                const pickByPlayerId = new Map<number, Pick>();
                newPicks.forEach(p => pickByPlayerId.set(p.playerId, p));
                
                // If this pick was being tailed, update the tailing picks
                newPicks.forEach((p, i) => {
                  if (p.isTail && p.tailingPlayerId === updatedPick.playerId) {
                    const target = pickByPlayerId.get(updatedPick.playerId);
                    if (target && target.result !== 'Pending') {
                      newPicks[i] = {
                        ...p,
                        result: target.result,
                        finalScore: target.finalScore,
                        resolvedTeam: target.resolvedTeam,
                      };
                    }
                  }
                });
              }
              return newPicks;
            });
          })
        );
        
        // Wait for all to complete (for any final cleanup)
        await Promise.all(pickPromises);
        
      } catch (err) {
        console.error('Failed to load picks', err);
        if (mounted) {
          setPlayers([]);
          setPicks([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedWeek]);

  // Track if we have live games for auto-refresh
  const hasLiveGames = picks.some(p => p.gameStatus === 'live');

  // Auto-refresh for live games
  useEffect(() => {
    if (selectedWeek === null || !hasLiveGames) return;
    
    console.log('[Auto-refresh] Live games detected, starting 30-second polling...');
    
    const refreshInterval = setInterval(async () => {
      console.log('[Auto-refresh] Refreshing live game data...');
      try {
        const seasonName = `Season ${currentSeason}`;
        const response = await fetchWeekPicksWithGameDetails(seasonName, selectedWeek);
        const freshPicksData = response.picks || [];
        
        // Only update if we got data
        if (freshPicksData.length === 0) return;
        
        setPicks(currentPicks => {
          // Use ref to get current players without causing re-renders
          const currentPlayers = playersRef.current;
          
          // Map existing picks to fresh data by matching player name
          return currentPicks.map(existingPick => {
            const player = currentPlayers.find(p => p.id === existingPick.playerId);
            if (!player) return existingPick;
            
            const freshData = freshPicksData.find((p: any) => 
              p.player.toLowerCase() === player.name.toLowerCase()
            );
            
            if (freshData?.gameDetails) {
              const gd = freshData.gameDetails;
              return {
                ...existingPick,
                gameStatus: gd.status,
                homeScore: gd.homeScore,
                awayScore: gd.awayScore,
                statusDetail: gd.statusDetail,
                winProbability: gd.winProbability,
                gameProgress: gd.gameProgress,
              };
            }
            return existingPick;
          });
        });
      } catch (err) {
        console.error('[Auto-refresh] Failed to refresh:', err);
      }
    }, 30000); // 30 seconds
    
    return () => {
      console.log('[Auto-refresh] Cleaning up interval');
      clearInterval(refreshInterval);
    };
  }, [selectedWeek, hasLiveGames, currentSeason]);

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

  const renderPickCard = (pick: PickWithLoading) => {
    const player = players.find(p => p.id === pick.playerId);
    if (!player) return null;
    const pickDivision = ((): 'Legends' | 'Leaders' => {
      const desc = String(pick.team ?? '').toLowerCase();
      if (desc.includes('(legends)')) return 'Legends';
      if (desc.includes('(leaders)')) return 'Leaders';
      return player.division ?? 'Leaders';
    })();

    // Show loading skeleton for picks still fetching game details
    if (pick.isLoadingGameDetails) {
      return (
        <Card 
          key={pick.id} 
          className="relative overflow-hidden border bg-white border-border"
        >
          <div className={cn(
            "absolute left-0 top-0 bottom-0 w-1",
            pickDivision === 'Leaders' ? "bg-muted-foreground/30" : "bg-primary"
          )}></div>
          <CardContent className="relative z-20 p-3 pl-5">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-base text-black leading-tight">{player.name}</h4>
              </div>
              {pick.amount && (
                <div className="px-2 py-0.5 rounded border text-primary font-bold text-xs bg-white border-primary">
                  ${pick.amount}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <div className="mt-2 pt-2 border-t border-dashed">
                <Skeleton className="h-3 w-1/2 mb-1" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card 
        key={pick.id} 
        className={cn(
          "relative overflow-hidden transition-all hover:shadow-md border group",
          pick.isReverseTailed ? "bg-gray-100/50 border-gray-300 opacity-60" :
          pick.result === 'Win' ? "bg-emerald-50/50 border-emerald-200" : 
          pick.result === 'Loss' ? "bg-rose-50/50 border-rose-200" : 
          pick.result === 'Push' ? "bg-amber-50/50 border-amber-200" :
          "bg-white border-border"
        )}
      >
        {/* Accent Bar - Only show if pending and not reverse tailed */}
        {pick.result === 'Pending' && !pick.isReverseTailed && (
          <div className={cn(
            "absolute left-0 top-0 bottom-0 w-1 group-hover:w-1.5 transition-all",
            pickDivision === 'Leaders' ? "bg-muted-foreground/30" : "bg-primary"
          )}></div>
        )}
        
        {/* Live game progress bar */}
        {pick.gameStatus === 'live' && pick.gameProgress !== undefined && (
          <div 
            className={cn(
              "absolute left-0 top-0 bottom-0 transition-all opacity-30",
              pick.winProbability !== undefined ? (
                pick.winProbability >= 0.6 ? "bg-emerald-500" :
                pick.winProbability >= 0.4 ? "bg-amber-500" :
                "bg-rose-500"
              ) : "bg-primary"
            )}
            style={{ width: `${pick.gameProgress * 100}%` }}
          ></div>
        )}
        
        <CardContent className={cn("relative z-20 p-3 pl-5", pick.isReverseTailed && "opacity-50 line-through")}>
          
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base text-black leading-tight">{player.name}</h4>
              {pick.isTail && (
                <div className="bg-primary/10 text-primary text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider border border-primary/20">
                  Tailing
                </div>
              )}
              {pick.isReverseTailed && (
                <div className="bg-red-100 text-red-700 text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider border border-red-300">
                  Reverse Tailed
                </div>
              )}
            </div>
            {pick.team && (
              <div className={cn("px-2 py-0.5 rounded border text-primary font-bold text-xs bg-white", pick.isReverseTailed ? "border-gray-300 text-gray-500" : "border-primary")}>
                ${pick.amount}
              </div>
            )}
          </div>
          
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
                    <div className={cn("font-semibold text-sm text-black leading-tight", pick.isReverseTailed && "line-through text-gray-400")}>
                      {(() => {
                        // Golf tournament bet - show golfer name and "to win"
                        if (pick.isGolfTournament && pick.golferName) {
                          return `${pick.golferName} to win`;
                        }
                        
                        // If we have a resolved team, extract just the team name (before @) that matches their pick
                        if (pick.resolvedTeam) {
                          // Check if this is an over/under bet by looking at the parentheses part
                          const ouMatch = pick.resolvedTeam.match(/\((Over|Under)\s*(\d+\.?\d*)?\)/i);
                          if (ouMatch) {
                            // This is an over/under bet - extract the game matchup and over/under info
                            const withoutParens = pick.resolvedTeam.replace(/\s*\([^)]*\)\s*$/, '').trim();
                            const ouType = ouMatch[1]; // "Over" or "Under"
                            const total = ouMatch[2] || (pick.gameOverUnder ?? ''); // Use extracted total or game total
                            return `${withoutParens} ${ouType}${total ? ` ${total}` : ''}`;
                          }
                          
                          // Not an over/under bet - handle as spread bet
                          // Extract pick details from parentheses: "Away @ Home (Team +/-X)" -> "Team +/-X"
                          const pickDetailsMatch = pick.resolvedTeam.match(/\(([^)]+)\)$/);
                          if (pickDetailsMatch) {
                            // We have parentheses with pick details - just show that (e.g., "Minnesota Vikings +11.5")
                            return pickDetailsMatch[1];
                          }
                          
                          // Fallback: no parentheses, extract team name and calculate spread
                          const withoutParens = pick.resolvedTeam.replace(/\s*\([^)]*\)\s*$/, '').trim();
                          const teams = withoutParens.split('@').map(t => t.trim());
                          let teamName = withoutParens;
                          let isPickedTeamHome = false;
                          
                          if (teams.length === 2) {
                            // Check which team matches the original pick
                            const originalPick = String(pick.team ?? '').toLowerCase().replace(/\(?\s*(legends|leaders)\s*\)?/gi, '').replace(/[+-]?\d+\.?\d*/g, '').trim();
                            const awayLower = teams[0].toLowerCase();
                            const homeLower = teams[1].toLowerCase();
                            
                            // Return the full team name that matches
                            if (awayLower.includes(originalPick) || originalPick.split(' ').some(w => w.length > 2 && awayLower.includes(w))) {
                              teamName = teams[0];
                              isPickedTeamHome = false;
                            } else if (homeLower.includes(originalPick) || originalPick.split(' ').some(w => w.length > 2 && homeLower.includes(w))) {
                              teamName = teams[1];
                              isPickedTeamHome = true;
                            }
                          }
                          
                          // Calculate spread for the picked team using favoriteTeam
                          let spreadDisplay = '';
                          if (pick.gameSpread !== undefined && pick.gameSpread !== null && pick.favoriteTeam) {
                            // favoriteTeam is the abbreviation (e.g., "OSU", "MICH")
                            // gameSpread may be negative from ESPN - we need the absolute value
                            const absoluteSpread = Math.abs(pick.gameSpread);
                            // If picked team matches favorite, they get negative spread
                            // If picked team is underdog, they get positive spread
                            const pickedAbbrev = isPickedTeamHome ? pick.homeAbbrev : pick.awayAbbrev;
                            const favoriteAbbrev = pick.favoriteTeam.toUpperCase();
                            
                            // Check if the picked team is the favorite by comparing abbreviations
                            const isPickedTeamFavorite = pickedAbbrev?.toUpperCase() === favoriteAbbrev;
                            
                            if (isPickedTeamFavorite) {
                              // Picked team is favorite - negative spread
                              spreadDisplay = ` -${absoluteSpread}`;
                            } else {
                              // Picked team is underdog - positive spread
                              spreadDisplay = ` +${absoluteSpread}`;
                            }
                          } else {
                            // Try to extract spread from original pick if ESPN didn't have it
                            const originalPickText = String(pick.team ?? '');
                            const spreadMatch = originalPickText.match(/([+-]?\d+\.?\d*)\s*$/);
                            if (spreadMatch) {
                              const spread = parseFloat(spreadMatch[1]);
                              spreadDisplay = spread > 0 ? ` +${spread}` : ` ${spread}`;
                            }
                          }
                          
                          return teamName + spreadDisplay;
                        }
                        // Fallback to original behavior: Remove any inline division tags
                        const raw = String(pick.team ?? '');
                        const cleaned = raw.replace(/\(?\s*(legends|leaders|nfl|nba|mlb|nhl|ncaaf|ncaab|cfb|cbb)\s*\)?/gi, '').trim();
                        return cleaned || raw;
                      })()} <span className={cn("text-muted-foreground font-normal ml-1 text-xs", pick.isReverseTailed && "text-gray-400")}>{pick.odds}</span>
                    </div>
                
                {pick.startTime && (
                  <div className={cn("text-[10px] font-medium text-muted-foreground flex gap-1 items-center whitespace-nowrap ml-2", pick.isReverseTailed && "text-gray-400")}>
                    <span>{pick.startTime}</span>
                    {pick.tvChannel && <span className={cn("border-l pl-1 border-border text-muted-foreground/70", pick.isReverseTailed && "border-gray-300 text-gray-400")}>{pick.tvChannel}</span>}
                  </div>
                )}
            </div>
            
            <div className="mt-2 pt-2 border-t border-dashed flex flex-col gap-1 min-h-[2.5rem]">
              {pick.isTail ? (
                <div className="h-8" aria-hidden="true"></div>
              ) : (
                <>
                  {/* Tournament/Game Name Line */}
                  {pick.isGolfTournament ? (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span>⛳ {pick.tournamentName}</span>
                    </div>
                  ) : pick.resolvedTeam && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span>{pick.resolvedTeam.replace(/\s*\([^)]*\)\s*$/, '')}</span>
                      {pick.bovadaUrl && pick.gameStatus !== 'final' && (
                        <a 
                          href={pick.bovadaUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-muted-foreground/50 hover:text-primary transition-colors"
                          title="View on Bovada"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                  
                  {/* Score or Status Line */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center flex-1 min-w-0">
                      {/* Golf tournament status */}
                      {pick.isGolfTournament ? (
                        <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          {pick.gameStatus === 'live' ? (
                            <>
                              <span className="text-green-600 font-semibold">🔴 LIVE</span>
                              <span className="font-semibold text-primary">
                                Position: {pick.golferPosition} ({pick.golferScore})
                              </span>
                              {pick.statusDetail && (
                                <span className="text-muted-foreground/70 ml-1">
                                  | R{pick.tournamentRound}/{pick.totalRounds}
                                </span>
                              )}
                            </>
                          ) : pick.gameStatus === 'final' ? (
                            <>
                              <span className="text-muted-foreground">Final:</span>
                              <span className={cn("font-semibold", pick.golferPosition === 1 ? "text-emerald-600" : "text-foreground")}>
                                {pick.golferPosition === 1 ? '🏆 Champion' : `${getOrdinal(pick.golferPosition || 0)} Place`} ({pick.golferScore})
                              </span>
                            </>
                          ) : (
                            <span>📅 {pick.gameDateFormatted}</span>
                          )}
                        </div>
                      ) : ((pick.gameStatus === 'live' || pick.gameStatus === 'final' || pick.result !== 'Pending') && pick.homeScore !== undefined && pick.awayScore !== undefined) ? (
                        /* Show score for team sports */
                        <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <span className={pick.gameStatus === 'live' ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                            {pick.gameStatus === 'live' ? '🔴 LIVE' : 'Final'}:
                          </span>
                          <span className={cn("font-semibold", pick.gameStatus === 'live' ? "text-primary" : "text-foreground")}>
                            {pick.awayAbbrev || pick.awayTeam?.split(' ').pop() || 'Away'} {pick.awayScore} - {pick.homeAbbrev || pick.homeTeam?.split(' ').pop() || 'Home'} {pick.homeScore}
                          </span>
                          {pick.gameStatus === 'live' && pick.statusDetail && (
                            <span className="text-muted-foreground/70 ml-1">
                              | {pick.statusDetail}
                            </span>
                          )}
                        </div>
                      ) : pick.gameStatus === 'scheduled' && pick.gameDateFormatted ? (
                        /* Show start time if game hasn't started */
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                          <span>📅 {pick.gameDateFormatted}</span>
                          {pick.broadcasts && pick.broadcasts.length > 0 && (
                            <span className="border-l pl-2 border-border">📺 {pick.broadcasts[0]}</span>
                          )}
                        </div>
                      ) : pick.finalScore ? (
                        <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <span>{pick.result === 'Pending' ? 'Active' : 'Final'}:</span>
                          <span className={cn("font-semibold", pick.result === 'Pending' ? "text-primary" : "text-foreground")}>
                            {pick.finalScore}
                          </span>
                        </div>
                      ) : !pick.resolvedTeam ? (
                        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wide">
                          Pending
                        </span>
                      ) : null}
                    </div>

                    {/* Win/Loss Badge - Bottom Right */}
                    {pick.result !== 'Pending' ? (
                      <span className={cn(
                        "font-bold text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide border ml-auto",
                        pick.result === 'Win' ? "bg-emerald-100 text-emerald-800 border-emerald-200" : 
                        pick.result === 'Loss' ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-gray-100 text-gray-800 border-gray-200"
                      )}>
                        {pick.result}
                      </span>
                    ) : pick.gameStatus === 'live' && pick.winProbability !== undefined ? (
                      <span className={cn(
                        "font-bold text-[10px] px-1.5 py-0.5 rounded tracking-wide border ml-auto",
                        pick.winProbability >= 0.6 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                        pick.winProbability >= 0.4 ? "bg-amber-100 text-amber-700 border-amber-200" :
                        "bg-rose-100 text-rose-700 border-rose-200"
                      )}>
                        {Math.round(pick.winProbability * 100)}%
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const calculateGroupResult = (groupPicks: Pick[]) => {
    if (groupPicks.length === 0) return null;
    
    // Check if any bet is a loss
    const anyLoss = groupPicks.some(p => p.result === 'Loss');
    if (anyLoss) return 'Loss';
    
    // Check if all bets are completed (Win or Push) and no losses
    const allCompleted = groupPicks.every(p => p.result === 'Win' || p.result === 'Push');
    if (allCompleted) return 'Win';
    
    return null; // Still pending
  };

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
