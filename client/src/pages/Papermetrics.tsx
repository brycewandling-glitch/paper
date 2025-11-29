import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { type Player } from '@/lib/mockData';
import { fetchSeasonData, fetchAllTimeData, type SeasonData } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Percent } from 'lucide-react';

export default function Papermetrics() {
  const [selectedSeason, setSelectedSeason] = useState('All-Time');

  // If a specific season like '1','2','3','4' is selected, fetch that season from the sheet.
  // If 'All-Time' is selected, aggregate all seasons.
  const seasonQueryKey = selectedSeason === 'All-Time' ? ['papermetrics', 'All-Time'] : ['papermetrics', `Season ${selectedSeason}`];
  const { data: seasonData, isLoading } = useQuery({
    queryKey: seasonQueryKey,
    queryFn: () => selectedSeason === 'All-Time' ? fetchAllTimeData() : fetchSeasonData(`Season ${selectedSeason}`),
  });
  
  const players = seasonData?.players || [];
  const stats = seasonData?.stats || { parlaysHit: 0, overallWinPercentage: 0, totalWeeks: 0, seasonWins: 0, longestWinStreak: { player: '', length: 0 }, longestLoseStreak: { player: '', length: 0 }, longestPushStreak: { player: '', length: 0 } };

  // Handle loading / empty data
  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-8 max-w-5xl mx-auto p-6">Loading season data...</div>
      </Layout>
    );
  }

  if (!players || players.length === 0) {
    return (
      <Layout>
        <div className="space-y-8 max-w-5xl mx-auto p-6">
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h2 className="text-lg font-bold">No data available</h2>
            <p className="text-sm text-muted-foreground">No player data was found for the selected season. Try a different season or verify the Google Sheet name and permissions.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Calculate derived stats for the highlights
  const sortedByWin = [...players].sort((a, b) => b.winPercentage - a.winPercentage);
  const bestWinPlayer = sortedByWin[0];
  const worstWinPlayer = sortedByWin[sortedByWin.length - 1];
  
  // For streak highlights we will use all-time stats from `stats` when available
  const longestWin = stats.longestWinStreak ?? { player: '', length: 0 };
  const longestLose = stats.longestLoseStreak ?? { player: '', length: 0 };
  // All-Time top totals (wins/losses/pushes)
  const mostWinsPlayer = [...players].sort((a, b) => b.wins - a.wins)[0];
  const mostLossesPlayer = [...players].sort((a, b) => b.losses - a.losses)[0];
  const mostPushesPlayer = [...players].sort((a, b) => b.pushes - a.pushes)[0];

  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg p-6 shadow-sm border flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <BarChart3 className="h-10 w-10 text-primary" strokeWidth={2} />
            <div className="h-12 w-px bg-border mx-2 hidden sm:block"></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Papermetrics</h1>
              <p className="text-muted-foreground font-medium text-sm uppercase tracking-widest mt-1">
                <span className="md:hidden">League Stats</span>
                <span className="hidden md:inline">Comprehensive Statistics</span>
              </p>
            </div>
          </div>
        </div>

        {/* Season Selector */}
        <div className="bg-white rounded-lg p-4 shadow-sm border flex justify-center md:justify-start">
          <div className="grid grid-cols-5 gap-2 w-full md:flex md:flex-wrap md:w-auto">
            {['1', '2', '3', '4', 'All-Time'].map((season) => (
              <button
                key={season}
                onClick={() => setSelectedSeason(season)}
                className={cn(
                  "px-1 py-2 md:px-4 rounded-md text-[10px] md:text-sm font-medium transition-all border whitespace-nowrap flex items-center justify-center",
                  selectedSeason === season
                    ? "bg-primary text-white border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                )}
              >
                <span className="md:hidden">{season === 'All-Time' ? 'All' : `S${season}`}</span>
                <span className="hidden md:inline">{season === 'All-Time' ? season : `Season ${season}`}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Seasonal Statistics Table */}
        <div className="bg-secondary rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm table-fixed">
              <thead className="bg-secondary border-b">
                <tr className="bg-secondary w-full">
                  <th className="px-2 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[10px] md:text-xs tracking-wider text-center w-[15%] md:w-[20%]">Rank</th>
                  <th className="px-2 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[10px] md:text-xs tracking-wider text-center w-[25%] md:w-[20%]">Player</th>
                  <th className="px-2 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[10px] md:text-xs tracking-wider text-center w-[20%]">Record</th>
                  <th className="px-2 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[10px] md:text-xs tracking-wider text-center w-[20%]">Bet Total</th>
                  <th className="px-2 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[10px] md:text-xs tracking-wider text-center w-[20%]">Win %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {sortedByWin.map((player, index) => (
                  <tr key={player.id} className="hover:bg-secondary/30 transition-colors group">
                    <td className="px-2 md:px-4 py-3 font-bold text-muted-foreground text-center text-xs md:text-sm">#{index + 1}</td>
                    <td className="px-2 md:px-4 py-3 overflow-hidden text-ellipsis whitespace-nowrap text-center">
                      <div className="font-bold text-foreground text-xs md:text-base truncate">{player.name}</div>
                    </td>
                    <td className="px-2 md:px-4 py-3 text-center font-bold text-foreground text-xs md:text-sm">
                      {player.seasonRecord}
                    </td>
                    <td className="px-2 md:px-4 py-3 text-center">
                      <span className="inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-md border border-primary text-primary font-bold text-xs md:text-sm bg-transparent">
                        ${player.seasonBetTotal}
                      </span>
                    </td>
                    <td className="px-2 md:px-4 py-3 text-center font-bold text-foreground text-xs md:text-sm">
                      {player.winPercentage.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Big Stat Tiles - Moved inside the table box */}
          <div className="grid gap-4 md:grid-cols-3 p-6 border-t bg-slate-50/30">
            <div className="flex flex-col items-center justify-center p-4 text-center rounded-lg border bg-white">
              <span className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2">Parlays Hit</span>
              <span className="text-4xl font-bold text-primary font-heading">{stats.parlaysHit}</span>
            </div>
            
            <div className="flex flex-col items-center justify-center p-4 text-center rounded-lg border bg-white">
              <span className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2">Overall Win %</span>
              <span className="text-4xl font-bold text-foreground font-heading">{stats.overallWinPercentage.toFixed(1)}%</span>
            </div>

            <div className="flex flex-col items-center justify-center p-4 text-center rounded-lg border bg-white">
              <span className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2">Total Weeks</span>
              <span className="text-4xl font-bold text-foreground font-heading">{stats.totalWeeks}</span>
            </div>
          </div>
        </div>

        {/* Performance Highlights - Only for All-Time */}
        {selectedSeason === 'All-Time' && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-xl font-bold mb-6 text-foreground border-b pb-4">Performance Highlights</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Best Win % */}
            <div className="bg-green-50 rounded-lg p-3 shadow-sm border border-green-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest text-green-700 font-bold mb-1">Best Win %</span>
              <div className="flex items-center justify-center gap-2">
                <div className="text-lg font-bold text-green-800 leading-tight">{bestWinPlayer?.name || '—'}</div>
                {bestWinPlayer && (
                  <span className="inline-flex items-center px-1.5 rounded-md border border-green-300 bg-green-100 text-green-800 font-bold text-lg md:text-xl leading-tight">
                    {bestWinPlayer.winPercentage}%
                  </span>
                )}
              </div>
            </div>

            {/* Worst Win % */}
            <div className="bg-rose-50 rounded-lg p-3 shadow-sm border border-rose-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest text-rose-700 font-bold mb-1">Worst Win %</span>
              <div className="flex items-center justify-center gap-2">
                <div className="text-lg font-bold text-rose-800 leading-tight">{worstWinPlayer?.name || '—'}</div>
                {worstWinPlayer && (
                  <span className="inline-flex items-center px-1.5 rounded-md border border-rose-300 bg-rose-100 text-rose-800 font-bold text-lg md:text-xl leading-tight">
                    {worstWinPlayer.winPercentage}%
                  </span>
                )}
              </div>
            </div>

            {/* Longest Win Streak (All-Time) */}
            <div className="bg-green-50 rounded-lg p-3 shadow-sm border border-green-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest text-green-700 font-bold mb-1">Longest Win Streak</span>
              <div className="flex items-center justify-center gap-2">
                <div className="text-xl md:text-2xl font-bold text-green-800 leading-tight">{longestWin.player || '—'}</div>
                {longestWin.length > 0 && (
                  <span className="inline-flex items-center px-1.5 rounded-md border border-green-300 bg-green-100 text-green-800 font-bold text-lg md:text-xl leading-tight">W{longestWin.length}</span>
                )}
              </div>
            </div>

            {/* Longest Lose Streak (All-Time) */}
            <div className="bg-rose-50 rounded-lg p-3 shadow-sm border border-rose-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest text-rose-700 font-bold mb-1">Longest Lose Streak</span>
              <div className="flex items-center justify-center gap-2">
                <div className="text-xl md:text-2xl font-bold text-rose-800 leading-tight">{longestLose.player || '—'}</div>
                {longestLose.length > 0 && (
                  <span className="inline-flex items-center px-1.5 rounded-md border border-rose-300 bg-rose-100 text-rose-800 font-bold text-lg md:text-xl leading-tight">L{longestLose.length}</span>
                )}
              </div>
            </div>

            {/* Most Total Wins (All-Time) */}
            <div className="bg-green-50 rounded-lg p-3 shadow-sm border border-green-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest text-green-700 font-bold mb-1">Most Total Wins</span>
              <div className="flex items-center justify-center gap-2">
                <div className="text-xl md:text-2xl font-bold text-green-800 leading-tight">
                  {mostWinsPlayer?.name || '—'}
                </div>
                {mostWinsPlayer && (
                  <span className="inline-flex items-center px-1.5 rounded-md border border-green-300 bg-green-100 text-green-800 font-bold text-lg md:text-xl leading-tight">
                    {mostWinsPlayer.wins}
                  </span>
                )}
              </div>
            </div>

            {/* Most Total Losses (All-Time) */}
            <div className="bg-rose-50 rounded-lg p-3 shadow-sm border border-rose-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest text-rose-700 font-bold mb-1">Most Total Losses</span>
              <div className="flex items-center justify-center gap-2">
                <div className="text-xl md:text-2xl font-bold text-rose-800 leading-tight">
                  {mostLossesPlayer?.name || '—'}
                </div>
                {mostLossesPlayer && (
                  <span className="inline-flex items-center px-1.5 rounded-md border border-rose-300 bg-rose-100 text-rose-800 font-bold text-lg md:text-xl leading-tight">
                    {mostLossesPlayer.losses}
                  </span>
                )}
              </div>
            </div>

            {/* Most Total Pushes (All-Time) */}
            <div className="bg-amber-50 rounded-lg p-3 shadow-sm border border-amber-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest text-amber-700 font-bold mb-1">Most Total Pushes</span>
              <div className="flex items-center justify-center gap-2">
                <div className="text-xl md:text-2xl font-bold text-amber-800 leading-tight">
                  {mostPushesPlayer?.name || '—'}
                </div>
                {mostPushesPlayer && (
                  <span className="inline-flex items-center px-1.5 rounded-md border border-amber-300 bg-amber-100 text-amber-800 font-bold text-lg md:text-xl leading-tight">
                    {mostPushesPlayer.pushes}
                  </span>
                )}
              </div>
            </div>

            {/* Longest Push Streak (All-Time) */}
            <div className="bg-amber-50 rounded-lg p-3 shadow-sm border border-amber-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest text-amber-700 font-bold mb-1">Longest Push Streak</span>
              <div className="flex items-center justify-center gap-2">
                <div className="text-xl md:text-2xl font-bold text-amber-800 leading-tight">
                  {stats.longestPushStreak?.player || '—'}
                </div>
                {stats.longestPushStreak && stats.longestPushStreak.length > 0 && (
                  <span className="inline-flex items-center px-1.5 rounded-md border border-amber-300 bg-amber-100 text-amber-800 font-bold text-lg md:text-xl leading-tight">
                    P{stats.longestPushStreak.length}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </Layout>
  );
}
