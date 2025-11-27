import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Standings from "@/pages/Standings";
import Picks from "@/pages/Picks";
import Ticket from "@/pages/Ticket";
import Papermetrics from "@/pages/Papermetrics";
import Rules from "@/pages/Rules";
import Admin from "@/pages/Admin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Standings} />
      <Route path="/picks" component={Picks} />
      <Route path="/ticket" component={Ticket} />
      <Route path="/papermetrics" component={Papermetrics} />
      <Route path="/rules" component={Rules} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
