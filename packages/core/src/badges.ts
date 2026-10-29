/**
 * Badge codes are stable identifiers; names and descriptions live in the i18n files
 * under `badges.<code>.name` and `badges.<code>.description`.
 */
export const BADGE_CODES = [
  'first_reading',
  'streak_7',
  'streak_30',
  'streak_100',
  'streak_365',
  'first_plan',
  'plans_5',
  'first_book',
] as const;

export type BadgeCode = (typeof BADGE_CODES)[number];

export interface ReadingStats {
  daysRead: number;
  longestStreak: number;
  plansFinished: number;
  booksCompleted: number;
}

const RULES: Record<BadgeCode, (s: ReadingStats) => boolean> = {
  first_reading: (s) => s.daysRead >= 1,
  streak_7: (s) => s.longestStreak >= 7,
  streak_30: (s) => s.longestStreak >= 30,
  streak_100: (s) => s.longestStreak >= 100,
  streak_365: (s) => s.longestStreak >= 365,
  first_plan: (s) => s.plansFinished >= 1,
  plans_5: (s) => s.plansFinished >= 5,
  first_book: (s) => s.booksCompleted >= 1,
};

/** Badges the user qualifies for and does not have yet, in display order. */
export function newBadges(stats: ReadingStats, owned: Iterable<string>): BadgeCode[] {
  const have = new Set(owned);
  return BADGE_CODES.filter((code) => !have.has(code) && RULES[code](stats));
}
