import { describe, expect, it } from 'vitest';
import { newBadges } from './badges';

const none = { daysRead: 0, longestStreak: 0, plansFinished: 0, booksCompleted: 0 };

describe('newBadges', () => {
  it('awards nothing before the first reading', () => {
    expect(newBadges(none, [])).toEqual([]);
  });

  it('awards every badge the stats qualify for, once', () => {
    const stats = { daysRead: 40, longestStreak: 31, plansFinished: 1, booksCompleted: 2 };
    expect(newBadges(stats, [])).toEqual(['first_reading', 'streak_7', 'streak_30', 'first_plan', 'first_book']);
    expect(newBadges(stats, ['first_reading', 'streak_7'])).toEqual(['streak_30', 'first_plan', 'first_book']);
  });
});
