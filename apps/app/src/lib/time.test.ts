import { describe, expect, it } from 'vitest';
import { formatTime, stepTime } from './time';

describe('stepTime', () => {
  it('moves in 15-minute steps and wraps around midnight', () => {
    expect(stepTime('08:00', 1)).toBe('08:15');
    expect(stepTime('08:00', -1)).toBe('07:45');
    expect(stepTime('23:45', 1)).toBe('00:00');
    expect(stepTime('00:00', -1)).toBe('23:45');
  });

  it('snaps odd times to the nearest step first', () => {
    expect(stepTime('08:07', 0)).toBe('08:00');
    expect(stepTime('08:08', 1)).toBe('08:30');
  });

  it('falls back to 08:00 for malformed input', () => {
    expect(stepTime('8am', 0)).toBe('08:00');
  });
});

describe('formatTime', () => {
  it('follows the locale', () => {
    expect(formatTime('20:30', 'en-US')).toMatch(/8:30\s?PM/);
    expect(formatTime('20:30', 'de-CH')).toBe('20:30');
  });
});
