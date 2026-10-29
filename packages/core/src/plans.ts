export type EnrolmentStatus = 'active' | 'paused' | 'finished';

export interface PlanProgress {
  totalDays: number;
  completedDays: number;
  /** 0–100, rounded down so 100 only shows when every day is done. */
  percent: number;
  /** First day not yet completed, or null when the plan is finished. */
  nextDay: number | null;
  finished: boolean;
}

export function planProgress(totalDays: number, completed: Iterable<number>): PlanProgress {
  if (!Number.isInteger(totalDays) || totalDays < 1) {
    throw new RangeError(`totalDays must be a positive integer, got ${totalDays}`);
  }
  const done = new Set<number>();
  for (const day of completed) {
    if (Number.isInteger(day) && day >= 1 && day <= totalDays) done.add(day);
  }
  let nextDay: number | null = null;
  for (let day = 1; day <= totalDays; day++) {
    if (!done.has(day)) {
      nextDay = day;
      break;
    }
  }
  return {
    totalDays,
    completedDays: done.size,
    percent: Math.floor((done.size / totalDays) * 100),
    nextDay,
    finished: nextDay === null,
  };
}

export type CompleteDayCheck =
  | { ok: true; finishesPlan: boolean }
  | { ok: false; reason: 'paused' | 'finished' | 'out_of_range' | 'already_completed' };

/**
 * Days can be completed in any order (catching up is fine), but not twice,
 * and not while the plan is paused.
 */
export function canCompleteDay(
  status: EnrolmentStatus,
  day: number,
  totalDays: number,
  completed: Iterable<number>,
): CompleteDayCheck {
  if (status === 'paused') return { ok: false, reason: 'paused' };
  if (status === 'finished') return { ok: false, reason: 'finished' };
  if (!Number.isInteger(day) || day < 1 || day > totalDays) return { ok: false, reason: 'out_of_range' };
  const done = new Set(completed);
  if (done.has(day)) return { ok: false, reason: 'already_completed' };
  const progress = planProgress(totalDays, [...done, day]);
  return { ok: true, finishesPlan: progress.finished };
}

export type PlanAction = 'pause' | 'resume' | 'restart';

/** Which status an enrolment moves to, or null when the action does not apply. */
export function nextStatus(status: EnrolmentStatus, action: PlanAction): EnrolmentStatus | null {
  switch (action) {
    case 'pause':
      return status === 'active' ? 'paused' : null;
    case 'resume':
      return status === 'paused' ? 'active' : null;
    case 'restart':
      return 'active';
  }
}
