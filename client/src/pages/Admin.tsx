import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { getPlayers, getSeasonInfo, savePick, type Pick } from '@/lib/mockData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { LogOut, RotateCcw, ShieldCheck } from 'lucide-react';

export default function Admin() {
  const { toast } = useToast();
  const { week: currentWeek } = getSeasonInfo();
  const players = getPlayers();

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');

  // Form State
  const [selectedWeek, setSelectedWeek] = useState(currentWeek.toString());
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [team, setTeam] = useState('');
  const [odds, setOdds] = useState('');
  const [result, setResult] = useState('Pending');
  const [finalScore, setFinalScore] = useState('');
  const [isTail, setIsTail] = useState(false);
  const [isReverse, setIsReverse] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'paper123') {
      setIsAuthenticated(true);
      toast({ title: "Admin Access Granted" });
    } else {
      toast({ title: "Access Denied", description: "Incorrect password", variant: "destructive" });
    }
  };

  const handleSavePick = () => {
    if (!selectedPlayer || !team || !odds) {
       toast({ title: "Error", description: "Missing required fields", variant: "destructive" });
       return;
    }

    const newPick: Pick = {
      id: Math.random(),
      week: parseInt(selectedWeek),
      playerId: parseInt(selectedPlayer),
      team,
      odds,
      amount: 5, // Default for admin add
      result: result as 'Win' | 'Loss' | 'Push' | 'Pending',
      finalScore: finalScore || undefined,
      isTail,
      isReverseTail: isReverse
    };

    savePick(newPick);
    toast({ title: "Pick Saved", description: "The database has been updated." });
    
    // Reset form partially
    setTeam('');
    setOdds('');
    setFinalScore('');
    setResult('Pending');
  };

  const handleRevertNames = () => {
    toast({ title: "Names Reverted", description: "Pick names have been normalized." });
  };

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto bg-secondary w-12 h-12 rounded-full flex items-center justify-center mb-2">
                <ShieldCheck className="text-muted-foreground" />
              </div>
              <CardTitle>Admin Access Required</CardTitle>
              <CardDescription>Please enter the commissioner password.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input 
                  type="password" 
                  placeholder="Enter password..." 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" className="w-full">Access Admin Dashboard</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <ShieldCheck className="h-10 w-10 text-primary" strokeWidth={2} />
            <div className="h-12 w-px bg-border mx-2 hidden sm:block"></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Admin</h1>
              <p className="text-muted-foreground font-medium text-sm uppercase tracking-widest mt-1">Dashboard & Tools</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setIsAuthenticated(false)}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2 space-y-8">
            {/* Add/Change Pick Form */}
            <Card>
              <CardHeader>
                <CardTitle>Add / Change Pick</CardTitle>
                <CardDescription>Manually record or update a player's pick.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Week</Label>
                    <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({length: 18}, (_, i) => i + 1).map(w => (
                          <SelectItem key={w} value={w.toString()}>Week {w}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Player</Label>
                    <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select player" />
                      </SelectTrigger>
                      <SelectContent>
                        {players.map(p => (
                          <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Team & Spread</Label>
                    <Input 
                      placeholder="e.g. Lakers -4.5" 
                      value={team}
                      onChange={e => setTeam(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Odds</Label>
                    <Input 
                      placeholder="-110" 
                      value={odds}
                      onChange={e => setOdds(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Result (Optional)</Label>
                    <Select value={result} onValueChange={setResult}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Win">Win</SelectItem>
                        <SelectItem value="Loss">Loss</SelectItem>
                        <SelectItem value="Push">Push</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Final Score (Optional)</Label>
                    <Input 
                      placeholder="e.g. 24 - 17" 
                      value={finalScore}
                      onChange={e => setFinalScore(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="tail" 
                      checked={isTail}
                      onCheckedChange={(c) => setIsTail(!!c)}
                    />
                    <Label htmlFor="tail">This is a tail pick</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="reverse" 
                      checked={isReverse}
                      onCheckedChange={(c) => setIsReverse(!!c)}
                    />
                    <Label htmlFor="reverse">This is a reverse tail</Label>
                  </div>
                </div>

                <Button className="w-full mt-2" onClick={handleSavePick}>Save Pick</Button>
              </CardContent>
            </Card>

            {/* Revert Tools */}
            <Card>
              <CardHeader>
                <CardTitle>Revert Current Week Pick Names</CardTitle>
                <CardDescription>
                  If the automatic normalization system incorrectly renamed a team, use this to revert back to the original abbreviated forms.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" className="w-full" onClick={handleRevertNames}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Revert Pick Names
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar / Info */}
          <div className="space-y-8">
             <Card className="bg-primary/5 border-primary/20">
               <CardHeader>
                 <CardTitle className="text-primary text-lg">Quick Stats</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active Players</span>
                    <span className="font-bold">{players.length}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Current Week</span>
                    <span className="font-bold">{currentWeek}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pending Picks</span>
                    <span className="font-bold">4</span>
                 </div>
               </CardContent>
             </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
