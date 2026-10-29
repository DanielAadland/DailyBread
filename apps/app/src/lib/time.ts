import { parseTimeOfDay } from '@bible-app/core';

/** Reminder times move in 15-minute steps (the reminder job runs every 15 minutes). */
export const TIME_STEP = 15;

export function stepTime(hhmm: string, steps: number): string {
  const minutes = parseTimeOfDay(hhmm) ?? 8 * 60;
  const rounded = Math.round(minutes / TIME_STEP) * TIME_STEP;
  const next = (((rounded + steps * TIME_STEP) % 1440) + 1440) % 1440;
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}

/** "5 minutes ago", "yesterday", "3 days ago"; full date after a week. */
export function relativeTime(iso: string, language: string, now = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), 'day');
  return then.toLocaleDateString(language, { day: 'numeric', month: 'short', year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** "08:30" → "8:30 AM" or "08:30", following the user's locale. */
export function formatTime(hhmm: string, language: string): string {
  const minutes = parseTimeOfDay(hhmm);
  if (minutes === null) return hhmm;
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
  return d.toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}
