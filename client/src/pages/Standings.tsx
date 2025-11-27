import { Layout } from '@/components/Layout';
import { getPlayers, getSeasonInfo } from '@/lib/mockData';
import { cn } from '@/lib/utils';

import { Trophy } from 'lucide-react';

export default function Standings() {
  const players = getPlayers().sort((a, b) => b.seasonBetTotal - a.seasonBetTotal);
  const sortedPlayers = [...players].sort((a, b) => {
    if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
    return b.seasonBetTotal - a.seasonBetTotal;
  });

  const { season, week } = getSeasonInfo();
  const totalWins = sortedPlayers.reduce((acc, p) => acc + p.wins, 0);

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header Card */}
        <div className="bg-white rounded-lg p-6 shadow-sm border flex flex-col md:flex-row justify-between items-start gap-6 relative">
          <div className="flex items-center gap-4">
            <Trophy className="h-10 w-10 text-primary" strokeWidth={2} />
            <div className="h-12 w-px bg-border mx-2 hidden sm:block"></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Standings</h1>
              <p className="text-muted-foreground font-medium text-sm uppercase tracking-widest mt-1">
                <span className="md:hidden">League Rankings</span>
                <span className="hidden md:inline">Current League Rankings & Statistics</span>
              </p>
            </div>
          </div>
          
          <div className="bg-primary/5 border border-primary/20 rounded-md px-5 py-2.5 md:self-center flex flex-row md:flex-col justify-start md:justify-center items-center md:items-end gap-3 md:gap-0">
             <span className="font-bold text-foreground/80 text-xs tracking-wider leading-tight md:mb-0.5">Season {season}</span>
             <span className="text-muted-foreground font-medium text-xs tracking-wider leading-tight">Week #{week}</span>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-secondary rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm table-fixed">
              <thead className="bg-secondary border-b">
                <tr className="bg-secondary w-full">
                  <th className="px-1 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[9px] md:text-xs tracking-wider text-center">Rank</th>
                  <th className="px-1 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[9px] md:text-xs tracking-wider">Player</th>
                  <th className="px-1 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[9px] md:text-xs tracking-wider hidden md:table-cell text-center">Division</th>
                  <th className="px-1 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[9px] md:text-xs tracking-wider text-center">Total</th>
                  <th className="px-1 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[9px] md:text-xs tracking-wider text-center">Record</th>
                  <th className="px-1 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[9px] md:text-xs tracking-wider text-center">Win %</th>
                  <th className="px-1 md:px-4 py-3 font-bold text-muted-foreground uppercase text-[9px] md:text-xs tracking-wider text-center">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {sortedPlayers.map((player, index) => (
                  <tr key={player.id} className={cn(
                    "hover:bg-secondary/30 transition-colors group border-l-4",
                    player.division === 'Legends' 
                      ? "border-l-primary" 
                      : "border-l-transparent"
                  )}>
                    <td className="px-1 md:px-4 py-3 font-bold text-muted-foreground text-center text-[10px] md:text-sm">#{index + 1}</td>
                    <td className="px-1 md:px-4 py-3 overflow-hidden text-ellipsis">
                      <div className={cn(
                        "font-bold text-[10px] md:text-base break-words inline-block rounded px-1.5 py-0.5 md:p-0 md:bg-transparent md:text-foreground",
                        player.division === 'Legends' ? "bg-primary text-white" : "bg-secondary text-foreground"
                      )}>
                        {player.name}
                      </div>
                      <div className="hidden md:block text-[10px] uppercase tracking-wider font-bold mt-0.5 text-muted-foreground opacity-0 h-0">Placeholder</div>
                    </td>
                    <td className="px-1 md:px-4 py-3 hidden md:table-cell text-center">
                      <span className={cn(
                        "inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                        player.division === 'Legends' 
                          ? "bg-primary text-white border-primary" 
                          : "bg-secondary text-muted-foreground border-border"
                      )}>
                        {player.division}
                      </span>
                    </td>
                    <td className="px-1 md:px-4 py-3 text-center">
                      <span className="inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-md border border-primary text-primary font-bold text-[10px] md:text-sm bg-transparent">
                        ${player.seasonBetTotal}
                      </span>
                    </td>
                    <td className="px-1 md:px-4 py-3 text-center font-medium text-foreground text-[10px] md:text-sm">
                      {player.seasonRecord}
                    </td>
                    <td className="px-1 md:px-4 py-3 text-center font-bold text-foreground text-[10px] md:text-sm">
                      {player.winPercentage.toFixed(1)}%
                    </td>
                    <td className="px-1 md:px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center justify-center w-6 h-5 md:w-8 md:h-6 rounded text-[10px] md:text-xs font-bold border",
                        player.currentStreak.startsWith('W') 
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200" 
                          : "bg-rose-100 text-rose-700 border-rose-200"
                      )}>
                        {player.currentStreak}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Key */}
          <div className="flex items-center gap-4 justify-end text-[10px] text-muted-foreground p-2 border-t bg-white md:hidden">
             <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-primary"></div>
                <span className="uppercase tracking-wider font-bold">Legends</span>
             </div>
             <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-secondary border border-border"></div>
                <span className="uppercase tracking-wider font-bold">Leaders</span>
             </div>
          </div>
        </div>

        {/* Season Stats Footer */}
        <div className="grid grid-cols-2 gap-3 md:gap-6">
          <div className="bg-white rounded-lg p-4 shadow-sm border border-border flex flex-col items-center justify-center">
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-1">Season Bets</span>
            <span className="text-3xl font-bold text-foreground">{sortedPlayers.length * 5}</span>
          </div>
          <div className="bg-emerald-50 rounded-lg p-4 shadow-sm border border-emerald-100 flex flex-col items-center justify-center">
            <span className="text-xs uppercase tracking-widest text-emerald-700 font-bold mb-1">Season Wins</span>
            <span className="text-3xl font-bold text-emerald-800">{totalWins}</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
