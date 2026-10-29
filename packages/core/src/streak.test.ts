import { describe, expect, it } from 'vitest';
import { closeDay, initialStreak, recordRead, settleStreak, STREAK_RULES, viewStreak, type StreakState } from './streak';
import { addDays } from './dates';

/** Read on each given date, settling the streak before each read like the server does. */
function readOn(dates: string[], start: StreakState = initialStreak()): StreakState {
  let state = start;
  for (const date of dates) {
    state = settleStreak(state, date).state;
    state = recordRead(state, date).state;
  }
  return state;
}

function consecutive(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

describe('recordRead', () => {
  it('starts a streak at 1 on the first reading', () => {
    const s = readOn(['2026-10-01']);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
    expect(s.lastReadDate).toBe('2026-10-01');
  });

  it('counts a day only once', () => {
    const first = readOn(['2026-10-01']);
    const again = recordRead(first, '2026-10-01');
    expect(again.counted).toBe(false);
    expect(again.state.current).toBe(1);
  });

  it('grows by one per consecutive day', () => {
    expect(readOn(consecutive('2026-10-01', 5)).current).toBe(5);
  });

  it('ignores readings dated before the last covered day', () => {
    const s = readOn(['2026-10-05']);
    expect(recordRead(s, '2026-10-03').counted).toBe(false);
  });
});

describe('freezes', () => {
  it('a new user has one freeze that covers a single missed day', () => {
    // Read 1–3, miss 4, read 5.
    const s = readOn(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05']);
    expect(s.current).toBe(4); // the freeze day keeps the streak but does not add to it
    expect(s.freezesLeft).toBe(0);
  });

  it('resets when a day is missed with no freeze left', () => {
    const noFreeze: StreakState = { ...initialStreak(), freezesLeft: 0 };
    const s = readOn(['2026-10-01', '2026-10-02', '2026-10-04'], noFreeze);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(2);
  });

  it('two missed days use two freezes when available', () => {
    const twoFreezes: StreakState = { ...initialStreak(), freezesLeft: 2 };
    const s = readOn(['2026-10-01', '2026-10-04'], twoFreezes);
    expect(s.current).toBe(2);
    expect(s.freezesLeft).toBe(0);
  });

  it('earns a freeze every 7th day, up to the maximum', () => {
    const afterWeek = readOn(consecutive('2026-10-01', 7));
    expect(afterWeek.freezesLeft).toBe(STREAK_RULES.startingFreezes + 1);
    const afterTwoWeeks = readOn(consecutive('2026-10-01', 14));
    expect(afterTwoWeeks.freezesLeft).toBe(STREAK_RULES.maxFreezes);
  });
});

describe('closeDay', () => {
  it('reports a read day as read', () => {
    const s = readOn(['2026-10-01']);
    expect(closeDay(s, '2026-10-01').outcome).toBe('read');
  });

  it('does nothing for users with no streak', () => {
    expect(closeDay(initialStreak(), '2026-10-01').outcome).toBe('inactive');
  });
});

describe('settleStreak', () => {
  it('is idempotent', () => {
    const s = readOn(['2026-10-01', '2026-10-02']);
    const once = settleStreak(s, '2026-10-10').state;
    const twice = settleStreak(once, '2026-10-10').state;
    expect(twice).toEqual(once);
    expect(once.current).toBe(0);
  });

  it('lists the days covered by freezes', () => {
    const s = readOn(['2026-10-01']);
    const settled = settleStreak(s, '2026-10-03');
    expect(settled.freezeDates).toEqual(['2026-10-02']);
    expect(settled.reset).toBe(false);
  });
});

describe('viewStreak', () => {
  it('keeps yesterday’s streak visible before today’s reading', () => {
    const s = readOn(['2026-10-01', '2026-10-02']);
    expect(viewStreak(s, '2026-10-03')).toEqual({ current: 2, longest: 2, freezesLeft: 1, readToday: false });
  });

  it('shows readToday after reading', () => {
    const s = readOn(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(viewStreak(s, '2026-10-03').readToday).toBe(true);
  });
});
