#!/usr/bin/env tsx
import { resolvePickToGameServer } from '../server/pickResolver';

(async () => {
  try {
    const sheet = process.argv[2] || 'Season 4';
    const week = Number(process.argv[3] || 1);
    const pick = process.argv[4] || 'Kansas -14';
    const candidates = await resolvePickToGameServer(sheet, week, pick, null);
    console.log(JSON.stringify({ sheet, week, pick, candidates }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(2);
  }
})();
