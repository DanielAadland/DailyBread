import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_SETTINGS, decideReminder, decideSocial, inQuietHours, type NotificationSettings } from './notifications';

const settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, timeZone: 'Europe/Zurich', reminderTime: '08:00' };
// 07:05 UTC = 08:05 in Zurich on 29 Oct 2026 (CET, UTC+1).
const due = new Date('2026-10-29T07:05:00Z');
const base = { now: due, readToday: false, reminderSentToday: false, sentToday: 0 };

describe('decideReminder', () => {
  it('sends within 15 minutes after the chosen local time', () => {
    expect(decideReminder(settings, base)).toEqual({ send: true });
  });

  it('waits until the chosen time and stops after the window', () => {
    expect(decideReminder(settings, { ...base, now: new Date('2026-10-29T06:55:00Z') })).toEqual({ send: false, reason: 'not_due' });
    expect(decideReminder(settings, { ...base, now: new Date('2026-10-29T07:20:00Z') })).toEqual({ send: false, reason: 'not_due' });
  });

  it('never reminds someone who already read today', () => {
    expect(decideReminder(settings, { ...base, readToday: true })).toEqual({ send: false, reason: 'already_read' });
  });

  it('sends at most one reminder a day', () => {
    expect(decideReminder(settings, { ...base, reminderSentToday: true })).toEqual({ send: false, reason: 'already_sent' });
  });

  it('respects the daily cap and the off switch', () => {
    expect(decideReminder(settings, { ...base, sentToday: 3 })).toEqual({ send: false, reason: 'daily_cap' });
    expect(decideReminder({ ...settings, remindersEnabled: false }, base)).toEqual({ send: false, reason: 'disabled' });
  });

  it('respects quiet hours even at the chosen time', () => {
    const late = { ...settings, reminderTime: '22:30' };
    expect(decideReminder(late, { ...base, now: new Date('2026-10-29T21:35:00Z') })).toEqual({ send: false, reason: 'quiet_hours' });
  });

  it('reports malformed settings instead of guessing', () => {
    expect(decideReminder({ ...settings, reminderTime: '8am' }, base)).toEqual({ send: false, reason: 'invalid_settings' });
  });
});

describe('inQuietHours', () => {
  it('handles ranges that wrap past midnight', () => {
    expect(inQuietHours(23 * 60, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(6 * 60, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(7 * 60, '22:00', '07:00')).toBe(false);
  });

  it('handles same-day ranges and disabled quiet hours', () => {
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true);
    expect(inQuietHours(13 * 60, null, null)).toBe(false);
    expect(inQuietHours(13 * 60, '12:00', '12:00')).toBe(false);
  });
});

describe('decideSocial', () => {
  it('follows the per-type switches', () => {
    expect(decideSocial(settings, 'reactions', { now: due, sentToday: 0 })).toEqual({ send: false, reason: 'disabled' });
    expect(decideSocial(settings, 'comments', { now: due, sentToday: 0 })).toEqual({ send: true });
  });

  it('shares the daily cap with reminders', () => {
    expect(decideSocial(settings, 'comments', { now: due, sentToday: 3 })).toEqual({ send: false, reason: 'daily_cap' });
  });
});
