/**
 * Calendar dates in a user's own timezone.
 *
 * A LocalDate is a plain "YYYY-MM-DD" string. Strings in this format sort
 * correctly with normal string comparison, which the streak logic relies on.
 */
export type LocalDate = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isLocalDate(value: string): value is LocalDate {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function partsIn(instant: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) out[part.type] = part.value;
  return out;
}

/** The calendar date it is at `instant` for someone in `timeZone`. */
export function localDate(instant: Date, timeZone: string): LocalDate {
  const p = partsIn(instant, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight (0–1439) at `instant` in `timeZone`. */
export function localMinutes(instant: Date, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  const hour = Number(p.hour) % 24;
  return hour * 60 + Number(p.minute);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const base = Date.parse(`${date}T00:00:00Z`);
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** "HH:MM" (24h) → minutes since midnight, or null when malformed. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
