import { addDays, type LocalDate } from './dates';

/**
 * Streak rules (mirrored in SQL by public.settle_streak / public.record_read):
 *
 * - A day counts when the user reads at least once on that calendar day in their own timezone.
 * - Reading on consecutive days grows the streak by one per day.
 * - A missed day is covered automatically by a streak freeze when one is left; the freeze keeps
 *   the streak alive but does not add to it.
 * - New users start with 1 freeze; every 7th streak day earns one more, up to 2.
 * - A missed day with no freeze resets the streak to 0. "Longest" is never lowered.
 */
export const STREAK_RULES = {
  startingFreezes: 1,
  maxFreezes: 2,
  freezeEarnedEvery: 7,
} as const;

export interface StreakState {
  current: number;
  longest: number;
  freezesLeft: number;
  /** Last day the user actually read. */
  lastReadDate: LocalDate | null;
  /** Last day kept alive, by reading or by a freeze. */
  lastCoveredDate: LocalDate | null;
}

export function initialStreak(): StreakState {
  return {
    current: 0,
    longest: 0,
    freezesLeft: STREAK_RULES.startingFreezes,
    lastReadDate: null,
    lastCoveredDate: null,
  };
}

export interface ReadResult {
  state: StreakState;
  /** False when the day was already counted (reading twice in one day). */
  counted: boolean;
  earnedFreeze: boolean;
}

/** Count a reading on `date` (the user's local date). Call settleStreak first. */
export function recordRead(state: StreakState, date: LocalDate): ReadResult {
  if (state.lastReadDate === date || (state.lastCoveredDate !== null && date < state.lastCoveredDate)) {
    return { state, counted: false, earnedFreeze: false };
  }

  const continues = state.lastCoveredDate !== null && state.lastCoveredDate === addDays(date, -1);
  const current = continues ? state.current + 1 : 1;
  const earnedFreeze =
    current % STREAK_RULES.freezeEarnedEvery === 0 && state.freezesLeft < STREAK_RULES.maxFreezes;

  return {
    state: {
      current,
      longest: Math.max(state.longest, current),
      freezesLeft: state.freezesLeft + (earnedFreeze ? 1 : 0),
      lastReadDate: date,
      lastCoveredDate: date,
    },
    counted: true,
    earnedFreeze,
  };
}

export type CloseOutcome = 'read' | 'freeze_used' | 'reset' | 'inactive';

export interface CloseResult {
  state: StreakState;
  outcome: CloseOutcome;
}

/** Apply the rules for one day that has ended (`endedDate` is a local date before today). */
export function closeDay(state: StreakState, endedDate: LocalDate): CloseResult {
  if (state.lastCoveredDate !== null && state.lastCoveredDate >= endedDate) {
    return { state, outcome: 'read' };
  }
  if (state.current === 0) {
    return { state, outcome: 'inactive' };
  }
  if (state.lastCoveredDate === addDays(endedDate, -1) && state.freezesLeft > 0) {
    return {
      state: { ...state, freezesLeft: state.freezesLeft - 1, lastCoveredDate: endedDate },
      outcome: 'freeze_used',
    };
  }
  return { state: { ...state, current: 0 }, outcome: 'reset' };
}

export interface SettleResult {
  state: StreakState;
  /** Days covered by a freeze while settling, oldest first. */
  freezeDates: LocalDate[];
  reset: boolean;
}

/**
 * Close every day that ended before `today` and is not covered yet.
 * Safe to call any number of times: the result only depends on the state and today's date.
 */
export function settleStreak(state: StreakState, today: LocalDate): SettleResult {
  let current = state;
  const freezeDates: LocalDate[] = [];
  let reset = false;

  if (current.lastCoveredDate === null || current.current === 0) {
    return { state: current, freezeDates, reset };
  }

  let day = addDays(current.lastCoveredDate, 1);
  while (day < today) {
    const result = closeDay(current, day);
    current = result.state;
    if (result.outcome === 'freeze_used') freezeDates.push(day);
    if (result.outcome === 'reset') {
      reset = true;
      break;
    }
    day = addDays(day, 1);
  }
  return { state: current, freezeDates, reset };
}

export interface StreakView {
  current: number;
  longest: number;
  freezesLeft: number;
  readToday: boolean;
}

/** What the Today screen shows. The streak stays visible until today ends, even before reading. */
export function viewStreak(state: StreakState, today: LocalDate): StreakView {
  const settled = settleStreak(state, today).state;
  return {
    current: settled.current,
    longest: settled.longest,
    freezesLeft: settled.freezesLeft,
    readToday: settled.lastReadDate === today,
  };
}
