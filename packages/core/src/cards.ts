import { daysBetween, type LocalDate } from './dates';

/**
 * Verse cards: a verse on a background with a short reflection.
 * A small daily set, then "You're done for today" (no endless stream).
 * Card posts are mirrored in supabase/migrations/20261101000100_cards.sql (check_card_style).
 */

/** Backgrounds are drawn by the app (gradients and simple shapes), so no images are stored or moderated. */
export const CARD_BACKGROUNDS = ['dawn', 'tide', 'olive', 'sand', 'dusk', 'night', 'meadow', 'rose', 'stone', 'sea', 'ember', 'mist'] as const;
export type CardBackground = (typeof CARD_BACKGROUNDS)[number];

export const CARD_FONTS = ['serif', 'serif_italic', 'sans'] as const;
export type CardFont = (typeof CARD_FONTS)[number];

export interface CardStyle {
  background: CardBackground;
  font: CardFont;
}

export const CARD_LIMITS = {
  /** Curated cards in each day's set. */
  dailyCurated: 7,
  /** Cards from people you follow and your groups, added in front of the curated ones. */
  dailyFromFriends: 3,
  /** How far back friends' cards are picked up. */
  friendWindowHours: 48,
  /** Longest passage that still reads well on a card. */
  maxVerseWords: 80,
} as const;

export function isCardStyle(value: unknown): value is CardStyle {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).length === 2 &&
    (CARD_BACKGROUNDS as readonly unknown[]).includes(v.background) &&
    (CARD_FONTS as readonly unknown[]).includes(v.font)
  );
}

/** Small, fast, deterministic random numbers (mulberry32), so everyone gets the same set on the same day. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const random = seeded(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

const EPOCH: LocalDate = '2026-01-01';

/**
 * Indices into the curated pool for a local date. The pool is shuffled once per cycle and dealt
 * out `count` a day, so no card repeats until the whole pool has been shown.
 */
export function dailyCardSet(date: LocalDate, poolSize: number, count: number = CARD_LIMITS.dailyCurated): number[] {
  if (poolSize <= 0 || count <= 0) return [];
  const perDay = Math.min(count, poolSize);
  const daysPerCycle = Math.max(1, Math.floor(poolSize / perDay));
  const day = daysBetween(EPOCH, date);
  const cycle = Math.floor(day / daysPerCycle);
  const slot = ((day % daysPerCycle) + daysPerCycle) % daysPerCycle;
  const order = seededShuffle(poolSize, 0x9e3779b9 ^ cycle);
  return order.slice(slot * perDay, slot * perDay + perDay);
}

export type CardTextSize = 'xl' | 'l' | 'm' | 's';

/** Shorter verses get larger type. */
export function cardTextSize(words: number): CardTextSize {
  if (words <= 18) return 'xl';
  if (words <= 32) return 'l';
  if (words <= 55) return 'm';
  return 's';
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Where today's set stands for this person (kept on the device). */
export interface CardProgress {
  date: LocalDate;
  /** Number of cards seen so far today. */
  seen: number;
}

export function cardsDoneToday(progress: CardProgress | null, today: LocalDate, total: number): boolean {
  return !!progress && progress.date === today && total > 0 && progress.seen >= total;
}

const count = (text: string, ch: string) => text.split(ch).length - 1;

/**
 * The passage as it should read on a card: unmatched quotation marks at the ends (a quote that
 * starts in an earlier verse or ends in a later one) are dropped, and a passage that stops
 * mid-sentence ends with an ellipsis.
 */
export function cardText(text: string): string {
  let t = text.trim().replace(/\s+/g, ' ');
  if (count(t, '“') < count(t, '”') && t.endsWith('”')) t = t.slice(0, -1).trimEnd();
  if (count(t, '“') > count(t, '”') && t.startsWith('“')) t = t.slice(1).trimStart();
  if (t.startsWith('‘') && !t.slice(1).includes('’ ') && !t.endsWith('’')) t = t.slice(1);
  if (/[,;:—–-]$/.test(t)) t = `${t.slice(0, -1).trimEnd()}…`;
  return t;
}
