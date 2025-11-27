import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { getPlayers, getPicksByWeek, getSeasonInfo, type Pick } from '@/lib/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Ticket as TicketIcon } from 'lucide-react';

export default function Ticket() {
  const { week: currentWeek } = getSeasonInfo();
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);

  const players = getPlayers();
  const picks = getPicksByWeek(selectedWeek);

  // Group picks by division
  const legendsPicks = picks.filter(pick => {
    const player = players.find(p => p.id === pick.playerId);
    return player?.division === 'Legends';
  });

  const leadersPicks = picks.filter(pick => {
    const player = players.find(p => p.id === pick.playerId);
    return player?.division === 'Leaders';
  });

  const renderPickCard = (pick: Pick) => {
    const player = players.find(p => p.id === pick.playerId);
    if (!player) return null;

    return (
      <Card 
        key={pick.id} 
        className={cn(
          "relative overflow-hidden transition-all hover:shadow-md border group",
          pick.result === 'Win' ? "bg-emerald-50/50 border-emerald-200" : 
          pick.result === 'Loss' ? "bg-rose-50/50 border-rose-200" : 
          pick.result === 'Push' ? "bg-amber-50/50 border-amber-200" :
          "bg-white border-border"
        )}
      >
        {/* Accent Bar - Only show if pending */}
        {pick.result === 'Pending' && (
          <div className={cn(
            "absolute left-0 top-0 bottom-0 w-1 group-hover:w-1.5 transition-all",
            player.division === 'Leaders' ? "bg-muted-foreground/30" : "bg-primary"
          )}></div>
        )}
        
        <CardContent className="p-3 pl-5">
          
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base text-foreground leading-tight">{player.name}</h4>
              {pick.isTail && (
                <div className="bg-primary/10 text-primary text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider border border-primary/20">
                  Tailing
                </div>
              )}
            </div>
            <div className="px-2 py-0.5 rounded border border-primary text-primary font-bold text-xs bg-white">
              ${pick.amount}
            </div>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
                <div className="font-semibold text-sm text-foreground/90 leading-tight">
                  {pick.team} <span className="text-muted-foreground font-normal ml-1 text-xs">{pick.odds}</span>
                </div>
                
                {pick.startTime && (
                  <div className="text-[10px] font-medium text-muted-foreground flex gap-1 items-center whitespace-nowrap ml-2">
                    <span>{pick.startTime}</span>
                    {pick.tvChannel && <span className="border-l pl-1 border-border text-muted-foreground/70">{pick.tvChannel}</span>}
                  </div>
                )}
            </div>
            
            <div className="mt-2 pt-2 border-t border-dashed flex justify-between items-center min-h-[1.5rem]">
              {/* Score / Status Area */}
              <div className="flex items-center">
                {pick.finalScore ? (
                   <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    <span>{pick.result === 'Pending' ? 'Active' : 'Final'}:</span>
                    <span className={cn("font-semibold", pick.result === 'Pending' ? "text-primary" : "text-foreground")}>
                      {pick.finalScore}
                    </span>
                  </div>
                ) : (
                   <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wide">
                     Pending
                   </span>
                )}
              </div>

              {/* Win/Loss Badge - Bottom Right */}
              {pick.result !== 'Pending' && (
                <span className={cn(
                  "font-bold text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide border ml-auto",
                  pick.result === 'Win' ? "bg-emerald-100 text-emerald-800 border-emerald-200" : 
                  pick.result === 'Loss' ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-gray-100 text-gray-800 border-gray-200"
                )}>
                  {pick.result}
                </span>
              )}
              
              {/* TV Channel for completed/active games if needed, but request said "right after game time and date" which implies pending state mostly or header area. 
                  The user said: "the tv channel should go right after the game time and date. on the right side right above the dashed line."
                  This is handled in the block above for pending games. For active/final, usually time isn't shown as prominently or replaced by score. 
                  Let's stick to the pending block modification I made above.
              */}
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
             {picks.length > 0 ? (
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
      <div className="space-y-8 max-w-5xl mx-auto">
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
                  "px-1 py-2 md:px-4 rounded-md text-[10px] md:text-sm font-medium transition-all border whitespace-nowrap flex items-center justify-center",
                  selectedWeek === w
                    ? "bg-primary text-white border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                )}
              >
                <span className="md:hidden">Wk #{w}</span>
                <span className="hidden md:inline">Week #{w}</span>
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
