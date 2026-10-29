import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isLocalDate, isValidTimeZone, localDate, localMinutes, parseTimeOfDay } from './dates';

describe('localDate', () => {
  const instant = new Date('2026-10-29T23:30:00Z');

  it('uses the user timezone, not UTC', () => {
    expect(localDate(instant, 'UTC')).toBe('2026-10-29');
    expect(localDate(instant, 'Europe/Zurich')).toBe('2026-10-30');
    expect(localDate(instant, 'America/Los_Angeles')).toBe('2026-10-29');
    expect(localDate(instant, 'Pacific/Auckland')).toBe('2026-10-30');
  });

  it('handles the daylight-saving switch in Zurich', () => {
    // 2026-10-25 01:30 UTC = 02:30 local after clocks went back at 03:00 CEST.
    expect(localDate(new Date('2026-10-25T01:30:00Z'), 'Europe/Zurich')).toBe('2026-10-25');
    expect(localMinutes(new Date('2026-10-25T01:30:00Z'), 'Europe/Zurich')).toBe(2 * 60 + 30);
  });
});

describe('localMinutes', () => {
  it('returns minutes since local midnight', () => {
    expect(localMinutes(new Date('2026-10-29T07:15:00Z'), 'Europe/Zurich')).toBe(8 * 60 + 15);
    expect(localMinutes(new Date('2026-10-29T00:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('date arithmetic', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-29')).toBe(28);
    expect(daysBetween('2026-10-29', '2026-10-01')).toBe(-28);
  });
});

describe('validation', () => {
  it('accepts only real calendar dates', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-2-3')).toBe(false);
  });

  it('checks IANA timezones', () => {
    expect(isValidTimeZone('Europe/Zurich')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('parses HH:MM', () => {
    expect(parseTimeOfDay('07:30')).toBe(450);
    expect(parseTimeOfDay('23:59')).toBe(1439);
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('7:30')).toBeNull();
  });
});
