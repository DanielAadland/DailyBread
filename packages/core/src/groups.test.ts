import { describe, expect, it } from 'vitest';
import {
  canChangeRole,
  canInGroup,
  canRemoveMember,
  checkGroupInput,
  generateInviteCode,
  groupDayCounts,
  groupPlanDay,
  groupStreak,
  isValidInviteCode,
  memberTodayRank,
  type GroupDayStats,
} from './groups';

describe('canInGroup', () => {
  it('lets every member read, post, comment and share the invite link', () => {
    for (const a of ['read', 'post', 'comment', 'share_invite'] as const) {
      expect(canInGroup('member', a)).toBe(true);
      expect(canInGroup('admin', a)).toBe(true);
      expect(canInGroup('owner', a)).toBe(true);
    }
  });

  it('keeps moderation for admins and the owner', () => {
    for (const a of ['pin', 'remove_content', 'remove_member', 'edit', 'set_plan', 'reset_invite'] as const) {
      expect(canInGroup('member', a)).toBe(false);
      expect(canInGroup('admin', a)).toBe(true);
      expect(canInGroup('owner', a)).toBe(true);
    }
  });

  it('keeps roles, transfer and delete for the owner', () => {
    for (const a of ['set_role', 'transfer', 'delete'] as const) {
      expect(canInGroup('admin', a)).toBe(false);
      expect(canInGroup('owner', a)).toBe(true);
    }
  });

  it('lets anyone but the owner leave, and non-members do nothing', () => {
    expect(canInGroup('member', 'leave')).toBe(true);
    expect(canInGroup('admin', 'leave')).toBe(true);
    expect(canInGroup('owner', 'leave')).toBe(false);
    expect(canInGroup(null, 'read')).toBe(false);
  });
});

describe('canRemoveMember / canChangeRole', () => {
  it('removes only lower roles, never the owner', () => {
    expect(canRemoveMember('owner', 'admin')).toBe(true);
    expect(canRemoveMember('owner', 'member')).toBe(true);
    expect(canRemoveMember('admin', 'member')).toBe(true);
    expect(canRemoveMember('admin', 'admin')).toBe(false);
    expect(canRemoveMember('admin', 'owner')).toBe(false);
    expect(canRemoveMember('member', 'member')).toBe(false);
  });

  it('lets only the owner promote and demote', () => {
    expect(canChangeRole('owner', 'member', 'admin')).toBe(true);
    expect(canChangeRole('owner', 'admin', 'member')).toBe(true);
    expect(canChangeRole('owner', 'member', 'owner')).toBe(false);
    expect(canChangeRole('owner', 'member', 'member')).toBe(false);
    expect(canChangeRole('admin', 'member', 'admin')).toBe(false);
  });
});

describe('checkGroupInput', () => {
  it('accepts a normal group', () => {
    expect(checkGroupInput({ name: 'Tuesday small group', description: 'We read the Gospels together.' })).toBeNull();
  });

  it('checks name length and content', () => {
    expect(checkGroupInput({ name: 'ab', description: '' })).toBe('name_too_short');
    expect(checkGroupInput({ name: 'x'.repeat(61), description: '' })).toBe('name_too_long');
    expect(checkGroupInput({ name: 'Join at example.com', description: '' })).toBe('name_links_not_allowed');
    expect(checkGroupInput({ name: 'Readers', description: 'y'.repeat(501) })).toBe('description_too_long');
    expect(checkGroupInput({ name: 'Readers', description: 'see www.example.org' })).toBe('description_links_not_allowed');
  });
});

describe('invite codes', () => {
  it('generates readable codes of the right length', () => {
    let i = 0;
    const code = generateInviteCode(() => ((i++ * 7) % 31) / 31);
    expect(code).toHaveLength(10);
    expect(isValidInviteCode(code)).toBe(true);
    expect(isValidInviteCode(generateInviteCode())).toBe(true);
  });

  it('rejects confusable characters and wrong lengths', () => {
    expect(isValidInviteCode('abcdefghjk')).toBe(true);
    expect(isValidInviteCode('abcdefghj0')).toBe(false);
    expect(isValidInviteCode('abcdefghjl')).toBe(false);
    expect(isValidInviteCode('abc')).toBe(false);
    expect(isValidInviteCode('ABCDEFGHJK')).toBe(false);
  });
});

describe('groupPlanDay', () => {
  it('counts days from the start date', () => {
    expect(groupPlanDay('2026-11-01', '2026-10-31', 30)).toEqual({ status: 'not_started', day: null });
    expect(groupPlanDay('2026-11-01', '2026-11-01', 30)).toEqual({ status: 'active', day: 1 });
    expect(groupPlanDay('2026-11-01', '2026-11-30', 30)).toEqual({ status: 'active', day: 30 });
    expect(groupPlanDay('2026-11-01', '2026-12-01', 30)).toEqual({ status: 'finished', day: null });
  });

  it('crosses month and year ends', () => {
    expect(groupPlanDay('2026-12-30', '2027-01-02', 365)).toEqual({ status: 'active', day: 4 });
  });
});

describe('groupDayCounts', () => {
  it('needs at least half the members, rounded up', () => {
    expect(groupDayCounts(1, 1)).toBe(true);
    expect(groupDayCounts(1, 2)).toBe(true);
    expect(groupDayCounts(1, 3)).toBe(false);
    expect(groupDayCounts(2, 3)).toBe(true);
    expect(groupDayCounts(4, 10)).toBe(false);
    expect(groupDayCounts(5, 10)).toBe(true);
    expect(groupDayCounts(0, 0)).toBe(false);
  });
});

describe('groupStreak', () => {
  const day = (date: string, readers: number, members = 4): GroupDayStats => ({ date, readers, members });

  it('counts consecutive days that counted, ending today', () => {
    expect(groupStreak([day('2026-11-03', 2), day('2026-11-04', 3), day('2026-11-05', 4)], '2026-11-05')).toBe(3);
  });

  it("doesn't break before today counts", () => {
    expect(groupStreak([day('2026-11-03', 2), day('2026-11-04', 3), day('2026-11-05', 1)], '2026-11-05')).toBe(2);
    expect(groupStreak([day('2026-11-03', 2), day('2026-11-04', 3)], '2026-11-05')).toBe(2);
  });

  it('stops at a day that did not count', () => {
    expect(groupStreak([day('2026-11-02', 4), day('2026-11-03', 1), day('2026-11-04', 3), day('2026-11-05', 2)], '2026-11-05')).toBe(2);
    expect(groupStreak([day('2026-11-03', 4)], '2026-11-05')).toBe(0);
  });

  it('uses the member count of each day', () => {
    expect(groupStreak([day('2026-11-04', 1, 1), day('2026-11-05', 1, 3)], '2026-11-05')).toBe(1);
  });
});

describe('memberTodayRank', () => {
  it('orders plan day, then any reading, then not yet', () => {
    const sorted = (['not_yet', 'read', 'plan_day'] as const).slice().sort((a, b) => memberTodayRank(a) - memberTodayRank(b));
    expect(sorted).toEqual(['plan_day', 'read', 'not_yet']);
  });
});
