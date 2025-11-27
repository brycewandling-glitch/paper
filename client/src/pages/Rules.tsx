import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

export default function Rules() {
  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header Card */}
        <div className="bg-white rounded-lg p-6 shadow-sm border flex flex-col md:flex-row justify-between items-start gap-6 relative">
          <div className="flex items-center gap-4">
            <BookOpen className="h-10 w-10 text-primary" strokeWidth={2} />
            <div className="h-12 w-px bg-border mx-2 hidden sm:block"></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight">Rules</h1>
              <p className="text-muted-foreground font-medium text-sm uppercase tracking-widest mt-1">
                <span className="md:hidden">League Regulations</span>
                <span className="hidden md:inline">Official League Regulations</span>
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary text-lg font-bold">Basic Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-[square] pl-5 space-y-2 text-muted-foreground text-sm">
                <li>Base bet starts at <span className="font-bold text-foreground">$5</span>.</li>
                <li>Bet increases by <span className="font-bold text-foreground">$5</span> after each <span className="text-red-600 font-bold">LOSS</span> (Progressive).</li>
                <li>Maximum bet cap is <span className="font-bold text-foreground">$25</span>.</li>
                <li>After a <span className="text-green-600 font-bold">WIN</span>, the next bet resets to $5.</li>
                <li>A <span className="text-yellow-600 font-bold">PUSH</span> keeps the current bet amount and streak.</li>
                <li>Odds must be <span className="font-bold text-foreground">-120 or better</span> (no heavy favorites).</li>
                <li>All picks must be submitted before the Friday 10:00 PM deadline.</li>
                <li>You can take a week off or quit anytime, but if/when you get back in you are back to your same bet (i.e. if you had lost twice, your next bet would still be $15 even if you take weeks off).</li>
                <li>All winnings split evenly across all players, regardless of which league you are in.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-primary text-lg font-bold">Relegation Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-[square] pl-5 space-y-2 text-muted-foreground text-sm">
                <li>Two divisions: <span className="text-primary font-bold">Legends</span> (Top 6) and <span className="text-muted-foreground font-bold">Leaders</span> (Bottom 4).</li>
                <li>Relegation league is set for first 4 weeks of the season, nobody moves up or down for first 4 weeks. New members may have a longer "probation" period.</li>
                <li>Promotion/Relegation between divisions occurs after Week 4 based on performance.</li>
                <li>After the initial probation period, players in Relegation League will replace players in Major League when their season winning % is better.
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>If season winning % is tied, no changes are made.</li>
                    <li>If multiple Relegation League players qualify to replace a Major League player and win % is tied, tie breaker is record over last 10 weeks. If last 10 weeks is a tie, then all-time win %. These same tiebreakers apply for Major league players being sent down.</li>
                  </ul>
                </li>
                <li>There is no punishment for being in Relegation league, amounts are still the same, it only impacts which ticket you are on for that week.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-primary text-lg font-bold">Special Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-[square] pl-5 space-y-2 text-muted-foreground text-sm">
                <li><span className="font-semibold text-foreground">Forced Tail:</span> Legends players who suffer 3 straight losses enter a "Forced Tail" state where they must copy a winning player's pick until they win.</li>
                <li><span className="font-semibold text-foreground">Spicer Suspense:</span> You cannot tail a person tied with you or immediately behind you in the standings for the last 3 weeks of the season, unless forced to because there are no other options available.</li>
                <li><span className="font-semibold text-foreground">Cross-Division Tailing:</span> Legends players cannot tail leaders division players, or vise versa</li>
                <li><span className="font-semibold text-foreground">Reverse Tails:</span> (aka Fade) is allowed - a person can offset another persons bet (regardless of either pick being in the Leaders or Legends division). BUT these picks will not be in the bet slip, only used for standings/tracking purposes.</li>
                <li><span className="font-semibold text-foreground">Optional Tail:</span> Players may tail another player’s pick freely.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
