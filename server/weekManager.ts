import { getSheetRawValues, updateSheetValues } from './googleSheets';
import {
  BASE_BET_AMOUNT,
  computeNextBetAmount,
  extractPlayerColumns,
  formatBetAmount,
  parseBetAmount,
} from './betAmounts';

function parseWeekNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/(\d+)/);
    if (match) {
      const parsed = Number(match[1]);
      return Number.isNaN(parsed) ? null : parsed;
    }
  }
  return null;
}

function tryParseDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  return null;
}

function formatAsMmDdYyyy(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function nextMondayAfter(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const delta = ((8 - day) % 7) || 7;
  result.setDate(result.getDate() + delta);
  return result;
}

function upcomingFridayFrom(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const delta = (5 - day + 7) % 7;
  result.setDate(result.getDate() + delta);
  return result;
}

function computeWeekDeadline(previousWeekDate: Date | null, reference: Date): Date {
  if (previousWeekDate) {
    const next = new Date(previousWeekDate);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + 7);
    return next;
  }
  return upcomingFridayFrom(reference);
}

function normalizeRows(rows: string[][], width: number) {
  return rows.map(original => {
    const normalized = new Array(width).fill('');
    for (let i = 0; i < width; i++) {
      normalized[i] = original[i] ?? '';
    }
    return normalized;
  });
}

type PlayerState = {
  amount: number;
  blocked: boolean;
};

function parseResultCode(raw: unknown): 'W' | 'L' | 'P' | null {
  const normalized = String(raw ?? '').trim().toUpperCase();
  if (normalized.startsWith('W')) return 'W';
  if (normalized.startsWith('L')) return 'L';
  if (normalized.startsWith('P')) return 'P';
  return null;
}

function populateBetAmountsForWeek(
  rows: string[][],
  headers: string[],
  weekColIndex: number,
  targetWeek: number,
  targetRowIndex: number,
): boolean {
  if (targetRowIndex < 0 || targetRowIndex >= rows.length) return false;
  const playerColumns = extractPlayerColumns(headers);
  if (playerColumns.length === 0) return false;

  const timeline = rows
    .map((row, idx) => ({ idx, week: parseWeekNumber(row[weekColIndex]) }))
    .filter((entry): entry is { idx: number; week: number } => entry.week !== null && entry.week < targetWeek)
    .sort((a, b) => {
      if (a.week !== b.week) {
        return a.week - b.week;
      }
      return a.idx - b.idx;
    });

  const playerStates = new Map<string, PlayerState>();

  for (const entry of timeline) {
    const row = rows[entry.idx];
    for (const player of playerColumns) {
      let state = playerStates.get(player.name);
      if (!state) {
        const seed = parseBetAmount(row[player.betCol]) ?? BASE_BET_AMOUNT;
        state = { amount: seed, blocked: false };
      }

      const sheetAmount = parseBetAmount(row[player.betCol]);
      if (sheetAmount !== null) {
        state.amount = sheetAmount;
      }

      const resultCode = parseResultCode(row[player.resultCol]);
      if (!resultCode) {
        state.blocked = true;
        playerStates.set(player.name, state);
        continue;
      }

      state.amount = computeNextBetAmount(state.amount, resultCode);
      state.blocked = false;
      playerStates.set(player.name, state);
    }
  }

  const targetRow = rows[targetRowIndex];
  let changed = false;
  for (const player of playerColumns) {
    const state = playerStates.get(player.name);
    if (!state) {
      continue;
    }

    if (state.blocked) {
      if (targetRow[player.betCol] !== '') {
        targetRow[player.betCol] = '';
        changed = true;
      }
      continue;
    }

    const newValue = formatBetAmount(state.amount);
    if (targetRow[player.betCol] !== newValue) {
      targetRow[player.betCol] = newValue;
      changed = true;
    }
  }

  return changed;
}

type EnsureWeekRowOptions = {
  sheetName?: string;
  targetWeek?: number;
  now?: Date;
  existingRaw?: string[][];
};

export async function ensureWeekRowExists(options: EnsureWeekRowOptions): Promise<string[][]> {
  const { sheetName, targetWeek, now, existingRaw } = options;

  if (!sheetName) {
    return existingRaw ?? await getSheetRawValues();
  }

  let raw = existingRaw ?? await getSheetRawValues(sheetName);
  if (!raw || raw.length === 0) {
    return raw ?? [];
  }

  const headers = raw[0].map(cell => String(cell ?? ''));
  const width = headers.length;
  const weekColIndex = headers.findIndex(h => /^week$/i.test(h.trim()));
  if (weekColIndex === -1) {
    return raw;
  }

  const dateColIndex = headers.findIndex(h => /date|deadline/i.test(h.toLowerCase()));
  const totalsColIndex = headers.findIndex(h => h.trim().toLowerCase() === 'totals');

  const rows = normalizeRows(raw.slice(1), width);

  const findWeekRowIndex = (weekNumber: number) =>
    rows.findIndex(row => parseWeekNumber(row[weekColIndex]) === weekNumber);

  const weekEntries = rows
    .map((row, idx) => ({ idx, week: parseWeekNumber(row[weekColIndex]) }))
    .filter((entry): entry is { idx: number; week: number } => entry.week !== null);

  if (weekEntries.length === 0) {
    return raw;
  }

  const latest = weekEntries.reduce((acc, curr) => (curr.week > acc.week ? curr : acc));
  const desiredWeek = targetWeek ?? latest.week + 1;

  const findTotalsRowIndex = () => {
    if (totalsColIndex === -1) return -1;
    return rows.findIndex(row => {
      const val = row[totalsColIndex];
      return val !== undefined && val !== null && String(val).trim() !== '';
    });
  };

  const findInsertIndexForWeek = (weekNumber: number) => {
    for (let i = 0; i < rows.length; i += 1) {
      const rowWeek = parseWeekNumber(rows[i][weekColIndex]);
      if (rowWeek !== null && rowWeek > weekNumber) {
        return i;
      }
    }
    const totalsIndex = findTotalsRowIndex();
    if (totalsIndex !== -1) return totalsIndex;
    return rows.length;
  };

  const existingEntry = weekEntries.find(entry => entry.week === desiredWeek);
  const today = now ? new Date(now) : new Date();
  today.setHours(0, 0, 0, 0);

  const previousEntry = weekEntries.find(entry => entry.week === desiredWeek - 1);
  const previousDate = previousEntry && dateColIndex >= 0
    ? tryParseDate(rows[previousEntry.idx][dateColIndex])
    : null;

  if (existingEntry) {
    if (dateColIndex >= 0) {
      const row = rows[existingEntry.idx];
      const currentDateValue = row[dateColIndex];
      const hasDate = currentDateValue !== undefined && currentDateValue !== null && String(currentDateValue).trim() !== '';
      if (!hasDate) {
        const computedDate = computeWeekDeadline(previousDate, today);
        row[dateColIndex] = formatAsMmDdYyyy(computedDate);
        const updatedRaw = [headers, ...rows];
        await updateSheetValues(sheetName, updatedRaw);
        console.log(`[weekManager] Filled missing date for Week ${desiredWeek} in ${sheetName}`);
        return updatedRaw;
      }
    }
    const betAmountsUpdated = populateBetAmountsForWeek(rows, headers, weekColIndex, desiredWeek, existingEntry.idx);
    if (betAmountsUpdated) {
      const updatedRaw = [headers, ...rows];
      await updateSheetValues(sheetName, updatedRaw);
      console.log(`[weekManager] Updated bet amounts for Week ${desiredWeek} in ${sheetName}`);
      return updatedRaw;
    }
    return raw;
  }

  const createdWeeks: number[] = [];
  let currentLatestWeek = latest.week;
  const goalWeek = desiredWeek;

  const attemptCreateWeek = (weekNumber: number) => {
    const previousIndex = findWeekRowIndex(weekNumber - 1);
    const lastWeekDate = previousIndex !== -1 && dateColIndex >= 0
      ? tryParseDate(rows[previousIndex][dateColIndex])
      : null;

    let earliestCreateDate: Date | null = null;
    if (lastWeekDate) {
      earliestCreateDate = nextMondayAfter(lastWeekDate);
    } else {
      earliestCreateDate = new Date(today);
      if (today.getDay() === 0) {
        earliestCreateDate.setDate(earliestCreateDate.getDate() + 1);
      }
    }

    if (!earliestCreateDate || today.getTime() < earliestCreateDate.getTime()) {
      return false;
    }

    const newRow = new Array(width).fill('');
    newRow[weekColIndex] = String(weekNumber);
    if (dateColIndex >= 0) {
      const computedDate = computeWeekDeadline(lastWeekDate, today);
      newRow[dateColIndex] = formatAsMmDdYyyy(computedDate);
    }

    let insertIndex = -1;
    if (previousIndex !== -1) {
      insertIndex = previousIndex + 1;
    } else {
      insertIndex = findInsertIndexForWeek(weekNumber);
    }
    rows.splice(insertIndex, 0, newRow);
    populateBetAmountsForWeek(rows, headers, weekColIndex, weekNumber, insertIndex);
    createdWeeks.push(weekNumber);
    return true;
  };

  while (currentLatestWeek < goalWeek) {
    const nextWeek = currentLatestWeek + 1;
    const created = attemptCreateWeek(nextWeek);
    if (!created) {
      break;
    }
    currentLatestWeek = nextWeek;
  }

  if (createdWeeks.length > 0) {
    const updatedRaw = [headers, ...rows];
    await updateSheetValues(sheetName, updatedRaw);
    console.log(`[weekManager] Created Week${createdWeeks.length > 1 ? 's' : ''} ${createdWeeks.join(', ')} for ${sheetName}`);
    return updatedRaw;
  }

  return raw;
}
