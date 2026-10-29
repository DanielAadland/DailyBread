import { addDays, daysBetween, type LocalDate } from './dates';
import { checkContent, type ContentProblem } from './social';

/**
 * Groups: small groups, churches, friends and families reading together.
 * Mirrored in supabase/migrations/20261031000100_groups.sql.
 */

export const GROUP_KINDS = ['small_group', 'church', 'friends', 'family'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

/** public: anyone signed in can find and join it. invite: only with the invite link. */
export const GROUP_ACCESS = ['public', 'invite'] as const;
export type GroupAccess = (typeof GROUP_ACCESS)[number];

export const GROUP_ROLES = ['owner', 'admin', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const GROUP_LIMITS = {
  nameMin: 3,
  nameMax: 60,
  descriptionMax: 500,
  maxMembers: 300,
  /** Groups one person may own. */
  ownedMax: 10,
  /** Groups one person may belong to. */
  joinedMax: 30,
  createdPerDay: 3,
  pinnedMax: 3,
  inviteCodeLength: 10,
} as const;

export type GroupAction =
  | 'read'
  | 'post'
  | 'comment'
  | 'share_invite'
  | 'reset_invite'
  | 'edit'
  | 'set_plan'
  | 'pin'
  | 'remove_content'
  | 'remove_member'
  | 'set_role'
  | 'transfer'
  | 'delete'
  | 'leave';

const RANK: Record<GroupRole, number> = { member: 1, admin: 2, owner: 3 };
const MIN_ROLE: Record<GroupAction, GroupRole> = {
  read: 'member',
  post: 'member',
  comment: 'member',
  share_invite: 'member',
  leave: 'member',
  reset_invite: 'admin',
  edit: 'admin',
  set_plan: 'admin',
  pin: 'admin',
  remove_content: 'admin',
  remove_member: 'admin',
  set_role: 'owner',
  transfer: 'owner',
  delete: 'owner',
};

/** What a member with this role may do. `null` = not a member. */
export function canInGroup(role: GroupRole | null, action: GroupAction): boolean {
  if (role === null) return false;
  // The owner can't simply leave: they hand the group to someone else first, or delete it.
  if (action === 'leave') return role !== 'owner';
  return RANK[role] >= RANK[MIN_ROLE[action]];
}

/** Owners can remove admins and members; admins only members. Nobody removes the owner. */
export function canRemoveMember(actor: GroupRole | null, target: GroupRole): boolean {
  if (actor === null || target === 'owner') return false;
  return RANK[actor] > RANK[target];
}

/** Only the owner changes roles, between admin and member. Ownership moves with `transfer`. */
export function canChangeRole(actor: GroupRole | null, target: GroupRole, to: GroupRole): boolean {
  return actor === 'owner' && target !== 'owner' && to !== 'owner' && target !== to;
}

export type GroupInputProblem = 'name_too_short' | 'name_too_long' | 'description_too_long' | `name_${ContentProblem}` | `description_${ContentProblem}`;

export function checkGroupInput(input: { name: string; description: string }, blockedTerms?: readonly string[]): GroupInputProblem | null {
  const name = input.name.trim();
  if (name.length < GROUP_LIMITS.nameMin) return 'name_too_short';
  if (name.length > GROUP_LIMITS.nameMax) return 'name_too_long';
  const nameProblem = checkContent(name, { maxLength: GROUP_LIMITS.nameMax, blockedTerms });
  if (nameProblem) return `name_${nameProblem}`;
  if (input.description.trim().length > GROUP_LIMITS.descriptionMax) return 'description_too_long';
  const descProblem = checkContent(input.description, { maxLength: GROUP_LIMITS.descriptionMax, blockedTerms, allowEmpty: true });
  return descProblem ? `description_${descProblem}` : null;
}

/** Letters and digits that can't be confused when read aloud or typed (no 0/o, 1/l/i). */
export const INVITE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateInviteCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < GROUP_LIMITS.inviteCodeLength; i++) {
    code += INVITE_ALPHABET[Math.floor(random() * INVITE_ALPHABET.length) % INVITE_ALPHABET.length];
  }
  return code;
}

export function isValidInviteCode(value: string): boolean {
  return new RegExp(`^[${INVITE_ALPHABET}]{${GROUP_LIMITS.inviteCodeLength}}$`).test(value);
}

export type GroupPlanStatus = 'not_started' | 'active' | 'finished';

/**
 * The group plan's day for someone whose local date is `today`. Everyone reads day N on the
 * N-th day after the start date; reading ahead or catching up is still fine (plan days can be
 * completed in any order), the group day just tells everyone which day to talk about.
 */
export function groupPlanDay(startDate: LocalDate, today: LocalDate, days: number): { status: GroupPlanStatus; day: number | null } {
  const n = daysBetween(startDate, today) + 1;
  if (n < 1) return { status: 'not_started', day: null };
  if (n > days) return { status: 'finished', day: null };
  return { status: 'active', day: n };
}

/** A day counts for the group when at least half of its members read (rounded up). */
export function groupDayCounts(readers: number, members: number): boolean {
  return members > 0 && readers * 2 >= members;
}

export interface GroupDayStats {
  date: LocalDate;
  /** Members who read that day (plan or free reading; streak freezes don't count). */
  readers: number;
  /** Members who had joined by that day. */
  members: number;
}

/**
 * Consecutive days the group "read together", ending today. Today only adds once it counts;
 * until then the streak runs through yesterday, so it never shows as broken in the morning.
 */
export function groupStreak(stats: readonly GroupDayStats[], today: LocalDate): number {
  const byDate = new Map(stats.map((s) => [s.date, s]));
  const counts = (d: LocalDate) => {
    const s = byDate.get(d);
    return !!s && groupDayCounts(s.readers, s.members);
  };
  let day = counts(today) ? today : addDays(today, -1);
  let streak = 0;
  while (counts(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export type MemberToday = 'plan_day' | 'read' | 'not_yet';

/** Order for the "who has read today" list: finished the group's day first, then any reading, then the rest. */
export function memberTodayRank(status: MemberToday): number {
  return status === 'plan_day' ? 0 : status === 'read' ? 1 : 2;
}
