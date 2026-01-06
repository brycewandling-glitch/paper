const BASE_BET_AMOUNT = 5;
const BET_INCREMENT = 5;
const MAX_BET_AMOUNT = 25;

export type PlayerColumn = {
  name: string;
  betCol: number;
  resultCol: number;
};

export function parseBetAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const numeric = Number(str.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatBetAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  return amount % 1 === 0 ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function computeNextBetAmount(current: number, rawResult: unknown): number {
  const outcome = String(rawResult ?? "").trim().toUpperCase();
  if (outcome.startsWith("W")) return BASE_BET_AMOUNT;
  if (outcome.startsWith("L")) {
    return Math.min(current + BET_INCREMENT, MAX_BET_AMOUNT);
  }
  if (outcome.startsWith("P")) return current;
  return current;
}

export function extractPlayerColumns(headers: string[]): PlayerColumn[] {
  const columns: PlayerColumn[] = [];
  headers.forEach((rawHeader, idx) => {
    const header = String(rawHeader ?? "").trim();
    if (!header) return;
    const match = header.match(/(.+)\s+Bet Amount/i);
    if (!match) return;
    const name = match[1].trim();
    if (!name) return;

    const nameLower = name.toLowerCase();
    let resultIndex = headers.findIndex((candidate) => {
      if (!candidate) return false;
      const candidateStr = String(candidate).trim();
      if (!candidateStr) return false;
      const lower = candidateStr.toLowerCase();
      if (!lower.startsWith(nameLower)) return false;
      return /win|lose|push/.test(lower);
    });

    if (resultIndex === -1) {
      resultIndex = headers.findIndex((candidate) => {
        if (!candidate) return false;
        const candidateStr = String(candidate).trim();
        return candidateStr === `${name} Win/Lose/Push`;
      });
    }

    if (resultIndex === -1) return;

    columns.push({ name, betCol: idx, resultCol: resultIndex });
  });

  return columns;
}

export { BASE_BET_AMOUNT, BET_INCREMENT, MAX_BET_AMOUNT };
