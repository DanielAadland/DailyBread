import { describe, expect, it } from 'vitest';
import { canCompleteDay, nextStatus, planProgress } from './plans';

describe('planProgress', () => {
  it('starts at day 1 with 0%', () => {
    expect(planProgress(30, [])).toEqual({ totalDays: 30, completedDays: 0, percent: 0, nextDay: 1, finished: false });
  });

  it('points to the first gap when days were done out of order', () => {
    const p = planProgress(10, [1, 2, 4, 5]);
    expect(p.nextDay).toBe(3);
    expect(p.completedDays).toBe(4);
    expect(p.percent).toBe(40);
  });

  it('only reaches 100% when every day is done', () => {
    expect(planProgress(365, Array.from({ length: 364 }, (_, i) => i + 1)).percent).toBe(99);
    const done = planProgress(3, [1, 2, 3]);
    expect(done.percent).toBe(100);
    expect(done.finished).toBe(true);
    expect(done.nextDay).toBeNull();
  });

  it('ignores duplicates and days outside the plan', () => {
    expect(planProgress(5, [1, 1, 0, 6, 2.5]).completedDays).toBe(1);
  });

  it('rejects an empty plan', () => {
    expect(() => planProgress(0, [])).toThrow(RangeError);
  });
});

describe('canCompleteDay', () => {
  it('allows catching up on any open day', () => {
    expect(canCompleteDay('active', 3, 5, [1])).toEqual({ ok: true, finishesPlan: false });
  });

  it('flags the day that finishes the plan', () => {
    expect(canCompleteDay('active', 2, 2, [1])).toEqual({ ok: true, finishesPlan: true });
  });

  it('refuses paused plans, repeats and out-of-range days', () => {
    expect(canCompleteDay('paused', 1, 5, [])).toEqual({ ok: false, reason: 'paused' });
    expect(canCompleteDay('active', 1, 5, [1])).toEqual({ ok: false, reason: 'already_completed' });
    expect(canCompleteDay('active', 6, 5, [])).toEqual({ ok: false, reason: 'out_of_range' });
    expect(canCompleteDay('finished', 1, 5, [])).toEqual({ ok: false, reason: 'finished' });
  });
});

describe('nextStatus', () => {
  it('pauses, resumes and restarts', () => {
    expect(nextStatus('active', 'pause')).toBe('paused');
    expect(nextStatus('paused', 'resume')).toBe('active');
    expect(nextStatus('finished', 'restart')).toBe('active');
    expect(nextStatus('paused', 'pause')).toBeNull();
  });
});
