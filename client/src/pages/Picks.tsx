import React, { useState, useMemo, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { fetchSeasonWeekCount, fetchSeasonPlayers, fetchPicksByWeek, fetchWeekDeadline, fetchNextBetAmounts } from '@/lib/api';
import { getPlayers, getSeasonInfo, savePick, type Pick, type Player } from '@/lib/mockData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Info, PlusCircle, Loader2, Check } from 'lucide-react';

type SportOption = '' | 'ncaaf' | 'nfl' | 'nba' | 'ncaab' | 'mlb' | 'nhl' | 'other';

export default function Picks() {
  const { toast } = useToast();
  const { week: mockWeek, season: currentSeason } = getSeasonInfo();
  
  const [currentWeek, setCurrentWeek] = useState(mockWeek);
  const [players, setPlayers] = useState<Player[]>([]);
  const [deadlineLabel, setDeadlineLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Fetch actual week count and players from Google Sheet
  useEffect(() => {
    (async () => {
      try {
        const weekCount = await fetchSeasonWeekCount(`Season ${currentSeason}`);
        if (weekCount > 0) {
          setCurrentWeek(weekCount);
        }
        
        const fetchedPlayers = await fetchSeasonPlayers(`Season ${currentSeason}`);
        if (fetchedPlayers && fetchedPlayers.length > 0) {
          setPlayers(fetchedPlayers);
        } else {
          // Fallback to mock players if fetch fails
          setPlayers(getPlayers());
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
        // Fall back to mock data if fetch fails
        setPlayers(getPlayers());
      }
    })();
  }, [currentSeason]);

  // Keep deadline text in sync with sheet data
  useEffect(() => {
    if (!currentWeek || currentWeek < 1) {
      setDeadlineLabel('');
      return;
    }
    let mounted = true;
    const seasonName = `Season ${currentSeason}`;
    (async () => {
      try {
        const label = await fetchWeekDeadline(seasonName, currentWeek);
        if (label && mounted) {
          setDeadlineLabel(label);
        }
      } catch (error) {
        console.error('Failed to fetch week deadline:', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentWeek, currentSeason]);

  // Submit for the current sheet week; when a new week row is auto-created on Monday,
  // fetchSeasonWeekCount() bumps currentWeek and this value updates accordingly.
  const submissionWeek = currentWeek;

  // Fallback deadline if sheet metadata missing
  const fallbackDeadline = useMemo(() => {
    const target = new Date();
    const day = target.getDay();
    let daysUntilFriday = (5 - day + 7) % 7;
    if (daysUntilFriday === 0 && target.getHours() >= 22) {
      daysUntilFriday = 7;
    }
    if (daysUntilFriday > 0) {
      target.setDate(target.getDate() + daysUntilFriday);
    }
    target.setHours(22, 0, 0, 0);
    return target.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    }) + ' @ 10:00 PM';
  }, []);

  const deadlineDisplay = deadlineLabel || fallbackDeadline;

  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [teamGameText, setTeamGameText] = useState('');
  const [betText, setBetText] = useState('');
  const [sport, setSport] = useState<SportOption>('');
  const [isTail, setIsTail] = useState(false);
  const [isReverse, setIsReverse] = useState(false);
  const [showTailModal, setShowTailModal] = useState(false);
  const [selectedTailPlayer, setSelectedTailPlayer] = useState<string>('');
  const [weekPicks, setWeekPicks] = useState<Pick[]>([]);
  const [nextBetAmountMap, setNextBetAmountMap] = useState<Record<number, number>>({});

  // Fetch current week's picks to calculate bet totals and track who has submitted
  useEffect(() => {
    (async () => {
      try {
        const picks = await fetchPicksByWeek(`Season ${currentSeason}`, currentWeek);
        if (picks && picks.length > 0) {
          setWeekPicks(picks);
        } else {
          setWeekPicks([]);
        }
      } catch (error) {
        console.error('Failed to fetch week picks:', error);
        setWeekPicks([]);
      }
    })();
  }, [currentWeek, currentSeason, submitSuccess]); // Re-fetch after successful submission

  // Compute the correct bet ladder amounts based on previous results
  useEffect(() => {
    if (!players || players.length === 0) {
      setNextBetAmountMap({});
      return;
    }

    let cancelled = false;
    const seasonName = `Season ${currentSeason}`;
    (async () => {
      try {
        const amounts = await fetchNextBetAmounts(seasonName, submissionWeek, players);
        if (!cancelled) {
          setNextBetAmountMap(amounts);
        }
      } catch (error) {
        console.error('Failed to calculate next bet amounts:', error);
        if (!cancelled) {
          setNextBetAmountMap({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [players, currentSeason, submissionWeek]);

  // Calculate bet amount for each player based on their loss streak
  // Rules: Start at $5, increase $5 per loss, cap at $25, reset to $5 after win
  const playerBetAmounts = useMemo(() => {
    const amounts: Map<number, number> = new Map();
    const hasComputed = nextBetAmountMap && Object.keys(nextBetAmountMap).length > 0;

    players.forEach(player => {
      let amount: number | undefined = undefined;

      if (hasComputed && typeof nextBetAmountMap[player.id] === 'number') {
        amount = nextBetAmountMap[player.id];
      }

      if (amount === undefined) {
        const streakMatch = (player.currentStreak || '').match(/^([WLP])(\d+)$/);
        if (streakMatch) {
          const streakType = streakMatch[1];
          const streakCount = parseInt(streakMatch[2]);
          if (streakType === 'L') {
            amount = Math.min(5 + (streakCount * 5), 25);
          } else if (streakType === 'W') {
            amount = 5;
          } else if (streakType === 'P') {
            amount = 5;
          }
        }
      }

      if (amount === undefined) {
        amount = 5;
      }

      amounts.set(player.id, amount);
    });
    
    return amounts;
  }, [players, nextBetAmountMap]);

  // Calculate total bets per player for current week
  const playerBetTotals = useMemo(() => {
    const totals: Map<number, number> = new Map();
    weekPicks.forEach(pick => {
      const current = totals.get(pick.playerId) || 0;
      totals.set(pick.playerId, current + (pick.amount || 0));
    });
    return totals;
  }, [weekPicks]);

  // Get the bet amount for display (what this player SHOULD bet for next pick)
  const getPlayerBetAmount = (playerId: number): number => {
    return playerBetAmounts.get(playerId) || 5;
  };

  // Calculate divisions based on win percentage
  // Top 6 players by win percentage are Legends, bottom 4 are Leaders
  const playersWithDivisions = useMemo(() => {
    if (players.length === 0) return [];
    
    // Sort by win percentage descending
    const sorted = [...players].sort((a, b) => (b.winPercentage || 0) - (a.winPercentage || 0));
    
    // Top 6 are Legends, rest are Leaders
    return sorted.map((p, index) => ({
      ...p,
      calculatedDivision: index < 6 ? 'Legends' : 'Leaders'
    }));
  }, [players]);

  // Filter out players who have already submitted a pick for this week
  const availablePlayers = useMemo(() => {
    // Get the set of player IDs who have already submitted a pick (have a non-empty team)
    const playersWithPicks = new Set(
      weekPicks
        .filter(pick => pick.team && pick.team.trim() !== '')
        .map(pick => pick.playerId)
    );
    
    // Filter out players who have already picked
    return playersWithDivisions.filter(player => !playersWithPicks.has(player.id));
  }, [playersWithDivisions, weekPicks]);

  // Calculate forced tail state for Legends players with 3 straight losses
  const forcedTailPlayers = useMemo(() => {
    const forcedTails = new Set<number>();
    
    playersWithDivisions.forEach(player => {
      // Only Legends players can be in forced tail
      if (player.calculatedDivision !== 'Legends') return;
      
      // Check if currentStreak indicates 3+ losses (e.g., "L3", "L4", etc.)
      const streakMatch = (player.currentStreak || '').match(/^L(\d+)$/);
      if (streakMatch) {
        const lossCount = parseInt(streakMatch[1]);
        if (lossCount >= 3) {
          forcedTails.add(player.id);
        }
      }
    });
    
    return forcedTails;
  }, [playersWithDivisions]);

  const isPlayerInForcedTail = (playerId: number) => forcedTailPlayers.has(playerId);
  const selectedPlayerObj = playersWithDivisions.find(p => p.id.toString() === selectedPlayer);
  const isSelectedPlayerForcedTail = selectedPlayerObj ? isPlayerInForcedTail(selectedPlayerObj.id) : false;

  // Get eligible tail players (same division, not the selected player) for regular tail
  const eligibleTailPlayers = useMemo(() => {
    if (!selectedPlayerObj) return [];
    
    return playersWithDivisions.filter(p => 
      p.id !== selectedPlayerObj.id && 
      p.calculatedDivision === selectedPlayerObj.calculatedDivision
    );
  }, [selectedPlayerObj, playersWithDivisions]);

  // Get eligible reverse tail players (any division, not the selected player)
  const eligibleReverseTailPlayers = useMemo(() => {
    if (!selectedPlayerObj) return [];
    
    return playersWithDivisions.filter(p => p.id !== selectedPlayerObj.id);
  }, [selectedPlayerObj, playersWithDivisions]);

  // Auto-enable tail for forced tail players and clear other fields
  useEffect(() => {
    if (isSelectedPlayerForcedTail) {
      setIsTail(true);
    }
  }, [isSelectedPlayerForcedTail]);

  const handleSubmit = async () => {
    if (isSubmitting) return; // Prevent double submission
    
    const selectedId = parseInt(selectedPlayer);
    
    // If player is in forced tail, they MUST tail
    if (isSelectedPlayerForcedTail) {
      if (!isTail) {
        toast({
          title: "Error",
          description: "This player is in forced tail status and must tail another player.",
          variant: "destructive"
        });
        return;
      }
      // For forced tail, we need to have selected a tail player
      if (!selectedTailPlayer) {
        toast({
          title: "Error",
          description: "Please select a player to tail.",
          variant: "destructive"
        });
        return;
      }
    } else if (isTail || isReverse) {
      // If tailing or reverse tailing, must select a player
      if (!selectedTailPlayer) {
        toast({
          title: "Error",
          description: "Please select a player to tail.",
          variant: "destructive"
        });
        return;
      }
    } else {
      // Normal submission requires all fields
      if (!selectedPlayer || !teamGameText.trim() || !betText.trim() || !sport) {
        toast({
          title: "Error",
          description: "Please fill in your team/game, bet, and sport.",
          variant: "destructive"
        });
        return;
      }
    }

    const player = playersWithDivisions.find(p => p.id === selectedId);
    const tailPlayer = playersWithDivisions.find(p => p.id.toString() === selectedTailPlayer);
    const playerBetAmount = getPlayerBetAmount(selectedId);
    
    // Determine the pick text to submit
    let actualPickText = '';
    if (isTail || isSelectedPlayerForcedTail) {
      // Tailing - pick text is the tailed player's name
      actualPickText = tailPlayer?.name || '';
    } else if (isReverse) {
      // Reverse tail - pick text indicates fading
      actualPickText = `Fade ${tailPlayer?.name || ''}`;
    } else {
      // Regular pick - combine game/bet with spread/total entry and include sport tag for readability
      const basePickText = `${teamGameText.trim()} | ${betText.trim()}`;
      const sportTag = sport && sport !== 'other' ? ` (${sport.toUpperCase()})` : '';
      actualPickText = `${basePickText}${sportTag}`.trim();
    }
    
    // Get the player's calculated division
    const playerDivision = player?.calculatedDivision?.toLowerCase() || 'legends';
    
    // Save mock pick
    const newPick: Pick = {
      id: Math.random(),
      week: submissionWeek,
      playerId: selectedId,
      team: actualPickText,
      odds: '',
      amount: playerBetAmount, // Use calculated bet amount
      result: 'Pending',
      isTail: isTail || isSelectedPlayerForcedTail, // Force tail for players in forced tail state
      isReverseTail: isReverse
    };
    
    savePick(newPick);

    // Submit pick to the spreadsheet
    setIsSubmitting(true);
    setSubmitSuccess(false);
    try {
      const response = await fetch('/api/submit-pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
          sheet: `Season ${currentSeason}`,
          week: submissionWeek,
          playerName: player?.name || '',
          betAmount: playerBetAmount,
            pickText: actualPickText,
            division: playerDivision,
            sport: !isTail && !isReverse && sport && sport !== 'other' ? sport : undefined
        })
      });
      
      const result = await response.json();
      if (!response.ok) {
        console.error('Failed to submit pick:', result);
        toast({
          title: "Warning",
          description: `Pick saved locally but failed to sync to spreadsheet: ${result.error}`,
          variant: "destructive"
        });
      } else {
        setSubmitSuccess(true);
        toast({
          title: "Pick Submitted",
          description: `Pick for ${player?.name} saved successfully! Resolved: ${result.resolved || actualPickText}`,
        });
        // Reset success state after 3 seconds
        setTimeout(() => setSubmitSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Failed to submit pick to sheet:', error);
      toast({
        title: "Warning", 
        description: "Pick saved locally but failed to sync to spreadsheet.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }

    // Reset
    setTeamGameText('');
    setBetText('');
    setIsTail(false);
    setIsReverse(false);
    setSelectedTailPlayer('');
    setShowTailModal(false);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Card */}
        <div className="bg-white rounded-lg p-6 shadow-sm border flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex items-center gap-4">
            <PlusCircle className="h-10 w-10 text-primary" strokeWidth={2} />
            <div className="h-12 w-px bg-border mx-2 hidden sm:block"></div>
            <div>
               <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Picks</h1>
               <p className="text-muted-foreground font-medium text-sm uppercase tracking-widest mt-1">
                 <span className="md:hidden">Weekly Selections</span>
                 <span className="hidden md:inline">Submit Your Weekly Selections</span>
               </p>
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-md px-5 py-2.5 md:self-center flex flex-col justify-center items-start md:items-end">
             <span className="font-bold text-foreground/80 text-xs tracking-wider leading-tight mb-0.5">Week #{submissionWeek} Deadline</span>
             <span className="text-muted-foreground font-medium text-xs tracking-wider leading-tight">{deadlineDisplay}</span>
          </div>
        </div>

        <Card className="bg-white rounded-lg shadow-sm border">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-4 pb-2">
              <h3 className="font-semibold text-lg border-b pb-2">Submit Your Pick</h3>
              <div className="space-y-2">
                <Label>Select Player</Label>
              <Select onValueChange={setSelectedPlayer} value={selectedPlayer}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose your player" />
                </SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {availablePlayers.map(p => {
                    const betAmount = getPlayerBetAmount(p.id);
                    const isDivisionLegends = p.calculatedDivision === 'Legends';
                    return (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          <div className={isDivisionLegends ? "bg-primary text-white text-xs px-2 py-1 rounded font-semibold" : "bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded font-semibold"}>
                            {p.calculatedDivision}
                          </div>
                          <div className="bg-gray-300 text-gray-800 text-xs px-2 py-1 rounded">
                            ${betAmount}
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {isSelectedPlayerForcedTail && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-semibold text-amber-900">⚠️ Forced Tail Active</p>
                <p className="text-xs text-amber-800 mt-1">This player has 3 consecutive losses and must tail a winning player until they win again.</p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Team / Game</Label>
                <Input 
                  placeholder="e.g., Lakers at Suns" 
                  value={teamGameText}
                  onChange={(e) => setTeamGameText(e.target.value)}
                  disabled={isSelectedPlayerForcedTail}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Bet (Spread or Total)</Label>
                <Input 
                  placeholder="e.g., -4.5, +3, Over 215.5" 
                  value={betText}
                  onChange={(e) => setBetText(e.target.value)}
                  disabled={isSelectedPlayerForcedTail}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Sport</Label>
                <Select
                  value={sport || undefined}
                  onValueChange={(value) => setSport(value as SportOption)}
                  disabled={isTail || isReverse || isSelectedPlayerForcedTail}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ncaaf">NCAAF</SelectItem>
                    <SelectItem value="nfl">NFL</SelectItem>
                    <SelectItem value="ncaab">NCAAB</SelectItem>
                    <SelectItem value="nba">NBA</SelectItem>
                    <SelectItem value="mlb">MLB</SelectItem>
                    <SelectItem value="nhl">NHL</SelectItem>
                    <SelectItem value="other">Other / Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            </div>

            <div className="space-y-4 pt-2">
              <h3 className="font-semibold text-lg border-b pb-2">Tailing Options</h3>
              
              <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg border">
                <div className="space-y-0.5">
                  <Label className="text-base">Tail Another Player</Label>
                  <p className="text-xs text-muted-foreground">
                    {isSelectedPlayerForcedTail 
                      ? 'Required due to forced tail status'
                      : 'Copy someone else\'s pick (counts for standings)'}
                  </p>
                </div>
                <Switch 
                  checked={isTail || isSelectedPlayerForcedTail} 
                  onCheckedChange={(checked) => {
                    setIsTail(checked);
                    setIsReverse(false); // Deselect reverse tail
                    if (checked) {
                      setShowTailModal(true);
                    } else {
                      setSelectedTailPlayer('');
                    }
                  }}
                  disabled={isSelectedPlayerForcedTail}
                />
              </div>

              {(isTail || isSelectedPlayerForcedTail) && selectedTailPlayer && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900">
                    Tailing: {playersWithDivisions.find(p => p.id.toString() === selectedTailPlayer)?.name}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg border">
                <div className="space-y-0.5">
                  <Label className="text-base">Reverse Tail</Label>
                  <p className="text-xs text-muted-foreground">Bet against another player's pick</p>
                </div>
                <Switch 
                  checked={isReverse} 
                  onCheckedChange={(checked) => {
                    setIsReverse(checked);
                    setIsTail(false); // Deselect regular tail
                    if (checked) {
                      setShowTailModal(true);
                    } else {
                      setSelectedTailPlayer('');
                    }
                  }}
                />
              </div>
            </div>

            {/* Tail Player Selection Modal */}
            {showTailModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>{isReverse ? 'Select Player to Reverse Tail' : 'Select Player to Tail'}</CardTitle>
                    <CardDescription>
                      {isReverse 
                        ? 'You can reverse tail any player regardless of division'
                        : `You can only tail players in the ${selectedPlayerObj?.calculatedDivision} division`
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isReverse ? (
                      // Reverse tail can be any player
                      eligibleReverseTailPlayers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No eligible players to reverse tail</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {eligibleReverseTailPlayers.map(player => (
                            <button
                              key={player.id}
                              onClick={() => {
                                setSelectedTailPlayer(player.id.toString());
                                setShowTailModal(false);
                              }}
                              className="w-full p-3 text-left border rounded-lg hover:bg-secondary transition-colors"
                            >
                              <div className="font-semibold text-sm">{player.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {player.calculatedDivision} • Win %: {player.winPercentage?.toFixed(1)}%
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    ) : (
                      // Regular tail - same division only
                      eligibleTailPlayers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No eligible players to tail in your division</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {eligibleTailPlayers.map(player => (
                            <button
                              key={player.id}
                              onClick={() => {
                                setSelectedTailPlayer(player.id.toString());
                                setShowTailModal(false);
                              }}
                              className="w-full p-3 text-left border rounded-lg hover:bg-secondary transition-colors"
                            >
                              <div className="font-semibold text-sm">{player.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Win %: {player.winPercentage?.toFixed(1)}%
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    )}
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => {
                        setShowTailModal(false);
                        setIsTail(false);
                        setIsReverse(false);
                        setSelectedTailPlayer('');
                      }}
                    >
                      Cancel
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            <Button 
              className={`w-full mt-4 text-white text-lg h-12 transition-all duration-300 ${
                submitSuccess 
                  ? 'bg-green-600 hover:bg-green-600' 
                  : 'bg-primary hover:bg-primary/90'
              }`}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Submitting...
                </>
              ) : submitSuccess ? (
                <>
                  <Check className="mr-2 h-5 w-5" />
                  Pick Submitted!
                </>
              ) : (
                'Submit Pick'
              )}
            </Button>

          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
