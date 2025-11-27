import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { getPlayers, getSeasonInfo, savePick, type Pick } from '@/lib/mockData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Info, PlusCircle } from 'lucide-react';

export default function Picks() {
  const { toast } = useToast();
  const { week } = getSeasonInfo();
  const players = getPlayers();

  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [pickText, setPickText] = useState('');
  const [odds, setOdds] = useState('');
  const [isTail, setIsTail] = useState(false);
  const [isReverse, setIsReverse] = useState(false);

  const handleSubmit = () => {
    if (!selectedPlayer || !pickText || !odds) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive"
      });
      return;
    }

    const player = players.find(p => p.id.toString() === selectedPlayer);
    
    // Save mock pick
    const newPick: Pick = {
      id: Math.random(),
      week,
      playerId: parseInt(selectedPlayer),
      team: pickText,
      odds: odds,
      amount: 5, // Default
      result: 'Pending',
      isTail,
      isReverseTail: isReverse
    };
    
    savePick(newPick);

    toast({
      title: "Pick Submitted",
      description: `Pick for ${player?.name} saved successfully.`,
    });

    // Reset
    setPickText('');
    setOdds('');
    setIsTail(false);
    setIsReverse(false);
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
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
             <span className="font-bold text-foreground/80 text-xs tracking-wider leading-tight mb-0.5">Week #{week} Deadline</span>
             <span className="text-muted-foreground font-medium text-xs tracking-wider leading-tight">Friday, Oct 18 @ 10:00 PM</span>
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
                <SelectContent>
                  {players.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} ({p.division})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Team & Spread/Total</Label>
                <Input 
                  placeholder="e.g., Lakers -4.5, Over 215.5" 
                  value={pickText}
                  onChange={(e) => setPickText(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Odds</Label>
                <Input 
                  placeholder="-110" 
                  value={odds}
                  onChange={(e) => setOdds(e.target.value)}
                />
              </div>
            </div>
            </div>

            <div className="space-y-4 pt-2">
              <h3 className="font-semibold text-lg border-b pb-2">Tailing Options</h3>
              
              <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg border">
                <div className="space-y-0.5">
                  <Label className="text-base">Tail Another Player</Label>
                  <p className="text-xs text-muted-foreground">Copy someone else's pick (counts for standings)</p>
                </div>
                <Switch checked={isTail} onCheckedChange={setIsTail} />
              </div>

              <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg border">
                <div className="space-y-0.5">
                  <Label className="text-base">Reverse Tail</Label>
                  <p className="text-xs text-muted-foreground">Bet against another player's pick</p>
                </div>
                <Switch checked={isReverse} onCheckedChange={setIsReverse} />
              </div>
            </div>

            <Button className="w-full mt-4 bg-primary hover:bg-primary/90 text-white text-lg h-12" onClick={handleSubmit}>
              Submit Pick
            </Button>

          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
