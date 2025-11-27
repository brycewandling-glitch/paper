import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { getPlayers, type Player } from '@/lib/mockData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Percent } from 'lucide-react';

export default function Papermetrics() {
  const [selectedSeason, setSelectedSeason] = useState('4');
  const players = getPlayers();

  // Calculate derived stats for the highlights
  const sortedByWin = [...players].sort((a, b) => b.winPercentage - a.winPercentage);
  const bestWinPlayer = sortedByWin[0];
  const worstWinPlayer = sortedByWin[sortedByWin.length - 1];
  
  // Simple parsing of streak string "W5" or "L2" to number for sorting
  const getStreakValue = (streak: string) => {
    const type = streak.charAt(0);
    const val = parseInt(streak.substring(1));
    return type === 'W' ? val : -val;
  };

  const sortedByStreak = [...players].sort((a, b) => getStreakValue(b.currentStreak) - getStreakValue(a.currentStreak));
  const bestStreakPlayer = sortedByStreak[0];
  const worstStreakPlayer = sortedByStreak[sortedByStreak.length - 1];

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
              <span className="text-4xl font-bold text-primary font-heading">12</span>
            </div>
            
            <div className="flex flex-col items-center justify-center p-4 text-center rounded-lg border bg-white">
              <span className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2">Overall Win %</span>
              <span className="text-4xl font-bold text-foreground font-heading">52.4%</span>
            </div>

            <div className="flex flex-col items-center justify-center p-4 text-center rounded-lg border bg-white">
              <span className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2">Total Weeks</span>
              <span className="text-4xl font-bold text-foreground font-heading">72</span>
            </div>
          </div>
        </div>

        {/* Performance Highlights - In separate box */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-xl font-bold mb-6 text-foreground border-b pb-4">Performance Highlights</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Best Win % */}
            <Card className="bg-white border-border shadow-sm">
              <CardContent className="p-4">
                <div className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2 text-center">Best Win %</div>
                <div className="flex justify-between items-end">
                  <div className="text-lg font-bold text-foreground">{bestWinPlayer.name}</div>
                  <div className="bg-green-100 border border-green-200 text-green-800 text-sm font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">
                    {bestWinPlayer.winPercentage}%
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Worst Win % */}
            <Card className="bg-white border-border shadow-sm">
              <CardContent className="p-4">
                <div className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2 text-center">Worst Win %</div>
                <div className="flex justify-between items-end">
                  <div className="text-lg font-bold text-foreground">{worstWinPlayer.name}</div>
                  <div className="bg-red-100 border border-red-200 text-red-800 text-sm font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">
                    {worstWinPlayer.winPercentage}%
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Longest Win Streak */}
            <Card className="bg-white border-border shadow-sm">
              <CardContent className="p-4">
                <div className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2 text-center">Longest Win Streak</div>
                <div className="flex justify-between items-end">
                  <div className="text-lg font-bold text-foreground">{bestStreakPlayer.name}</div>
                  <div className="bg-green-100 border border-green-200 text-green-800 text-sm font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">
                    {bestStreakPlayer.currentStreak}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Longest Loss Streak */}
            <Card className="bg-white border-border shadow-sm">
              <CardContent className="p-4">
                <div className="text-muted-foreground font-medium uppercase tracking-widest text-xs mb-2 text-center">Longest Loss Streak</div>
                <div className="flex justify-between items-end">
                  <div className="text-lg font-bold text-foreground">{worstStreakPlayer.name}</div>
                  <div className="bg-red-100 border border-red-200 text-red-800 text-sm font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">
                    {worstStreakPlayer.currentStreak}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
