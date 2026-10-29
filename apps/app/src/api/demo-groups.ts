/**
 * Groups in demo mode. You belong to a sample group ("Morning Psalms", with Sam, Maria and Jo)
 * and can find a public one to join. Sample people read on a fixed pattern so "who has read
 * today" and the group streak have something to show. Rules come from @bible-app/core.
 */
import {
  addDays,
  canChangeRole,
  canInGroup,
  canRemoveMember,
  checkGroupInput,
  generateInviteCode,
  GROUP_LIMITS,
  groupPlanDay,
  groupStreak,
  memberTodayRank,
  type GroupDayStats,
  type LocalDate,
} from '@bible-app/core';
import type { DemoPost, SocialState } from './demo-social';
import {
  AppError,
  type Backend,
  type Group,
  type GroupAccess,
  type GroupKind,
  type GroupMember,
  type GroupRole,
  type MemberToday,
  type PlanDetail,
  type Profile,
} from './types';

export interface DemoGroup {
  id: string;
  name: string;
  description: string;
  kind: GroupKind;
  access: GroupAccess;
  inviteCode: string;
  planId: string | null;
  planStart: LocalDate | null;
  createdBy: string;
  createdAt: string;
}

export interface DemoGroupMember {
  groupId: string;
  userId: string;
  role: GroupRole;
  joinedAt: string;
}

export interface GroupsState {
  groups: DemoGroup[];
  groupMembers: DemoGroupMember[];
}

const SAM = 'demo-sam';
const JO = 'demo-jo';
const MARIA = 'demo-maria';
const PSALMS_GROUP = 'demo-g-psalms';
const GOSPELS_GROUP = 'demo-g-gospels';

/** Sample people read on a steady pattern: Sam every day, Maria most days, Jo every other day (not yet today). */
export function samplePersonRead(personId: string, date: LocalDate, today: LocalDate): boolean {
  const n = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  if (personId === SAM) return true;
  if (personId === MARIA) return n % 6 !== 5;
  if (personId === JO) return n > 0 && n % 2 === 1;
  return false;
}

/**
 * Adds the sample groups to a social state that doesn't have them yet (new or saved before groups existed).
 * `psalmsPlanId` is the id of the "psalms-30" plan.
 */
export function ensureGroups(s: SocialState, meId: string, today: LocalDate, psalmsPlanId: string | null, now = new Date()): void {
  if (s.groups && s.groupMembers) return;
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  s.groups = [
    {
      id: PSALMS_GROUP,
      name: 'Morning Psalms',
      description: 'A few friends reading the Psalms before work. One portion a day; we talk about it in the day’s thread.',
      kind: 'small_group',
      access: 'invite',
      inviteCode: 'psalmsdemo',
      planId: psalmsPlanId,
      planStart: psalmsPlanId ? addDays(today, -4) : null,
      createdBy: SAM,
      createdAt: ago(24 * 20),
    },
    {
      id: GOSPELS_GROUP,
      name: 'Gospels in 30 Days readers',
      description: 'Anyone welcome. We read the four Gospels together in a month.',
      kind: 'friends',
      access: 'public',
      inviteCode: 'gospelsdmo',
      planId: null,
      planStart: null,
      createdBy: JO,
      createdAt: ago(24 * 40),
    },
  ];
  s.groupMembers = [
    { groupId: PSALMS_GROUP, userId: SAM, role: 'owner', joinedAt: ago(24 * 20) },
    { groupId: PSALMS_GROUP, userId: MARIA, role: 'admin', joinedAt: ago(24 * 19) },
    { groupId: PSALMS_GROUP, userId: JO, role: 'member', joinedAt: ago(24 * 18) },
    { groupId: PSALMS_GROUP, userId: meId, role: 'member', joinedAt: ago(24 * 10) },
    { groupId: GOSPELS_GROUP, userId: JO, role: 'owner', joinedAt: ago(24 * 40) },
    { groupId: GOSPELS_GROUP, userId: SAM, role: 'member', joinedAt: ago(24 * 30) },
  ];
  const groupPosts: DemoPost[] = [
    {
      id: 'demo-gp1', authorId: SAM, type: 'verse', passage: 'HEB.10.24', translation: 'bsb',
      verseText: 'And let us consider how to spur one another on to love and good deeds.',
      body: 'Welcome! One portion of the Psalms a day. Share what stood out in the day’s thread.',
      milestone: null, hidden: false, createdAt: ago(24 * 20), groupId: PSALMS_GROUP, groupDay: null, pinnedAt: ago(24 * 20),
    },
    {
      id: 'demo-gp2', authorId: JO, type: 'prayer', passage: null, translation: null, verseText: null,
      body: 'My grandmother is in hospital this week. Thank you for praying with us.',
      milestone: null, hidden: false, createdAt: ago(8), groupId: PSALMS_GROUP, groupDay: null, pinnedAt: null,
    },
  ];
  if (psalmsPlanId) {
    groupPosts.push(
      {
        id: 'demo-gp3', authorId: MARIA, type: 'reflection', passage: 'PSA.16-PSA.20', translation: 'bsb', verseText: null,
        body: 'Psalm 18:2 is my verse for the week: “The LORD is my rock, my fortress, and my deliverer.”',
        milestone: null, hidden: false, createdAt: ago(28), groupId: PSALMS_GROUP, groupDay: 4, pinnedAt: null,
      },
      {
        id: 'demo-gp4', authorId: SAM, type: 'reflection', passage: 'PSA.21-PSA.25', translation: 'bsb', verseText: null,
        body: 'Psalm 23 never gets old. Read it slowly this morning, one line at a time.',
        milestone: null, hidden: false, createdAt: ago(2), groupId: PSALMS_GROUP, groupDay: 5, pinnedAt: null,
      },
    );
  }
  s.posts.push(...groupPosts);
}

export const roleIn = (s: SocialState, groupId: string | null | undefined, userId: string): GroupRole | null =>
  (groupId && s.groupMembers?.find((m) => m.groupId === groupId && m.userId === userId)?.role) || null;

interface Context {
  current(): Promise<{
    me: Profile;
    social: SocialState & GroupsState;
    today: LocalDate;
    /** Local dates on which I read (not freezes). */
    myReadDates: LocalDate[];
    /** Plan days I've completed, by plan id. */
    myCompletedDays(planId: string): number[];
  }>;
  plans(): Promise<PlanDetail[]>;
  save(): Promise<void>;
  newId(): string;
}

type GroupsApi = Pick<
  Backend,
  | 'listMyGroups'
  | 'findGroups'
  | 'getGroup'
  | 'getGroupByInvite'
  | 'createGroup'
  | 'updateGroup'
  | 'setGroupPlan'
  | 'resetGroupInvite'
  | 'deleteGroup'
  | 'joinGroup'
  | 'leaveGroup'
  | 'listGroupMembers'
  | 'setMemberRole'
  | 'transferGroup'
  | 'removeGroupMember'
  | 'nudgeMember'
  | 'getGroupPosts'
  | 'getGroupDay'
  | 'pinGroupPost'
  | 'removeGroupPost'
>;

export function createDemoGroups(ctx: Context, posts: { toPost: (s: SocialState, me: Profile, p: DemoPost) => import('./types').Post }): GroupsApi {
  type Current = Awaited<ReturnType<Context['current']>>;

  const readOn = (c: Current, userId: string, date: LocalDate) =>
    userId === c.me.id ? c.myReadDates.includes(date) : samplePersonRead(userId, date, c.today);

  const statusOf = (c: Current, g: DemoGroup, userId: string, day: number | null): MemberToday => {
    if (g.planId && day !== null) {
      const done = userId === c.me.id ? c.myCompletedDays(g.planId).includes(day) : userId === SAM;
      if (done) return 'plan_day';
    }
    return readOn(c, userId, c.today) ? 'read' : 'not_yet';
  };

  const blockedWith = (s: SocialState, a: string, b: string) =>
    s.blocks.some((x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));

  const toGroup = async (c: Current, g: DemoGroup): Promise<Group> => {
    const s = c.social;
    const members = s.groupMembers.filter((m) => m.groupId === g.id);
    const role = roleIn(s, g.id, c.me.id);
    const plan = g.planId ? (await ctx.plans()).find((p) => p.id === g.planId) : undefined;
    const planDay = plan && g.planStart ? groupPlanDay(g.planStart, c.today, plan.days) : null;
    const stats: GroupDayStats[] = [];
    for (let i = 0; i < 120; i++) {
      const date = addDays(c.today, -i);
      const joined = members.filter((m) => m.joinedAt.slice(0, 10) <= date);
      stats.push({ date, members: joined.length, readers: joined.filter((m) => readOn(c, m.userId, date)).length });
    }
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      kind: g.kind,
      access: g.access,
      createdAt: g.createdAt,
      memberCount: members.length,
      myRole: role,
      inviteCode: role ? g.inviteCode : null,
      plan:
        plan && g.planStart && planDay
          ? {
              id: plan.id,
              slug: plan.slug,
              title: plan.title,
              days: plan.days,
              start: g.planStart,
              status: planDay.status,
              day: planDay.day,
              readings: planDay.day ? (plan.schedule.find((d) => d.day === planDay.day)?.readings ?? null) : null,
            }
          : null,
      readersToday: members.filter((m) => readOn(c, m.userId, c.today)).length,
      streak: groupStreak(stats, c.today),
      myToday: role ? statusOf(c, g, c.me.id, planDay?.day ?? null) : null,
    };
  };

  const find = (c: Current, id: string) => {
    const g = c.social.groups.find((x) => x.id === id);
    if (!g || (g.access === 'invite' && !roleIn(c.social, id, c.me.id))) throw new AppError('group_not_found');
    return g;
  };
  const requireRole = (c: Current, id: string, action: Parameters<typeof canInGroup>[1]) => {
    const g = c.social.groups.find((x) => x.id === id);
    const role = roleIn(c.social, id, c.me.id);
    if (!g || !role) throw new AppError('group_not_found');
    if (!canInGroup(role, action)) throw new AppError('not_allowed');
    return { g, role };
  };
  const checkInput = (input: { name: string; description: string }) => {
    const problem = checkGroupInput(input);
    if (!problem) return;
    if (problem === 'name_too_short' || problem === 'name_too_long') throw new AppError(`group_${problem}`);
    if (problem === 'description_too_long') throw new AppError('content_too_long');
    const code = problem.replace(/^(name|description)_/, '');
    throw new AppError(code === 'empty' ? 'content_empty' : code === 'too_long' ? 'content_too_long' : code);
  };

  return {
    async listMyGroups() {
      const c = await ctx.current();
      const mine = c.social.groupMembers.filter((m) => m.userId === c.me.id).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
      return Promise.all(mine.map((m) => toGroup(c, c.social.groups.find((g) => g.id === m.groupId)!)));
    },

    async findGroups(query) {
      const c = await ctx.current();
      const q = query.trim().toLowerCase();
      const list = c.social.groups.filter((g) => g.access === 'public' && !roleIn(c.social, g.id, c.me.id) && (!q || g.name.toLowerCase().includes(q)));
      return Promise.all(list.slice(0, 20).map((g) => toGroup(c, g)));
    },

    async getGroup(id) {
      const c = await ctx.current();
      return toGroup(c, find(c, id));
    },

    async getGroupByInvite(code) {
      const c = await ctx.current();
      const g = c.social.groups.find((x) => x.inviteCode === code.trim().toLowerCase());
      if (!g) throw new AppError('invite_not_found');
      return toGroup(c, g);
    },

    async createGroup(input) {
      const c = await ctx.current();
      checkInput(input);
      if (!!input.planId !== !!input.planStart) throw new AppError('invalid_group_plan');
      const mine = c.social.groupMembers.filter((m) => m.userId === c.me.id);
      if (mine.filter((m) => m.role === 'owner').length >= GROUP_LIMITS.ownedMax || mine.length >= GROUP_LIMITS.joinedMax) {
        throw new AppError('group_limit_reached');
      }
      const since = new Date(Date.now() - 86_400_000).toISOString();
      if (c.social.groups.filter((g) => g.createdBy === c.me.id && g.createdAt > since).length >= GROUP_LIMITS.createdPerDay) {
        throw new AppError('rate_limited');
      }
      const now = new Date().toISOString();
      const g: DemoGroup = {
        id: ctx.newId(),
        name: input.name.trim(),
        description: input.description.trim(),
        kind: input.kind,
        access: input.access,
        inviteCode: generateInviteCode(),
        planId: input.planId ?? null,
        planStart: input.planStart ?? null,
        createdBy: c.me.id,
        createdAt: now,
      };
      c.social.groups.push(g);
      c.social.groupMembers.push({ groupId: g.id, userId: c.me.id, role: 'owner', joinedAt: now });
      await ctx.save();
      return toGroup(c, g);
    },

    async updateGroup(id, input) {
      const c = await ctx.current();
      const { g } = requireRole(c, id, 'edit');
      checkInput(input);
      Object.assign(g, { name: input.name.trim(), description: input.description.trim(), kind: input.kind, access: input.access });
      await ctx.save();
      return toGroup(c, g);
    },

    async setGroupPlan(id, planId, start) {
      const c = await ctx.current();
      const { g } = requireRole(c, id, 'set_plan');
      if (!!planId !== !!start) throw new AppError('invalid_group_plan');
      g.planId = planId;
      g.planStart = start;
      await ctx.save();
      return toGroup(c, g);
    },

    async resetGroupInvite(id) {
      const c = await ctx.current();
      const { g } = requireRole(c, id, 'reset_invite');
      g.inviteCode = generateInviteCode();
      await ctx.save();
      return g.inviteCode;
    },

    async deleteGroup(id) {
      const c = await ctx.current();
      requireRole(c, id, 'delete');
      const s = c.social;
      s.groups = s.groups.filter((g) => g.id !== id);
      s.groupMembers = s.groupMembers.filter((m) => m.groupId !== id);
      s.posts = s.posts.filter((p) => p.groupId !== id);
      await ctx.save();
    },

    async joinGroup(ref) {
      const c = await ctx.current();
      const s = c.social;
      const g = ref.code
        ? s.groups.find((x) => x.inviteCode === ref.code!.trim().toLowerCase())
        : s.groups.find((x) => x.id === ref.id && x.access === 'public');
      if (!g) throw new AppError(ref.code ? 'invite_not_found' : 'group_not_found');
      if (!roleIn(s, g.id, c.me.id)) {
        if (s.groupMembers.filter((m) => m.groupId === g.id).length >= GROUP_LIMITS.maxMembers) throw new AppError('group_full');
        if (s.groupMembers.filter((m) => m.userId === c.me.id).length >= GROUP_LIMITS.joinedMax) throw new AppError('group_limit_reached');
        s.groupMembers.push({ groupId: g.id, userId: c.me.id, role: 'member', joinedAt: new Date().toISOString() });
        await ctx.save();
      }
      return toGroup(c, g);
    },

    async leaveGroup(id) {
      const c = await ctx.current();
      const role = roleIn(c.social, id, c.me.id);
      if (!role) throw new AppError('group_not_found');
      if (!canInGroup(role, 'leave')) throw new AppError('owner_cannot_leave');
      c.social.groupMembers = c.social.groupMembers.filter((m) => !(m.groupId === id && m.userId === c.me.id));
      await ctx.save();
    },

    async listGroupMembers(id) {
      const c = await ctx.current();
      const { g } = requireRole(c, id, 'read');
      const plan = g.planId ? (await ctx.plans()).find((p) => p.id === g.planId) : undefined;
      const day = plan && g.planStart ? groupPlanDay(g.planStart, c.today, plan.days).day : null;
      const s = c.social;
      const roleRank = { owner: 0, admin: 1, member: 2 } as const;
      return s.groupMembers
        .filter((m) => m.groupId === id && !blockedWith(s, c.me.id, m.userId))
        .map((m): GroupMember => {
          const p = m.userId === c.me.id ? null : s.people.find((x) => x.id === m.userId);
          const today = statusOf(c, g, m.userId, day);
          return {
            id: m.userId,
            username: m.userId === c.me.id ? c.me.username : (p?.username ?? null),
            displayName: m.userId === c.me.id ? c.me.displayName : (p?.displayName ?? ''),
            avatarUrl: null,
            role: m.role,
            joinedAt: m.joinedAt,
            today,
            isMe: m.userId === c.me.id,
            canNudge:
              m.userId !== c.me.id &&
              today === 'not_yet' &&
              !s.notifications.some((n) => n.kind === 'nudge' && n.userId === m.userId && n.actorId === c.me.id && n.createdAt > new Date(Date.now() - 20 * 3_600_000).toISOString()),
          };
        })
        .sort((a, b) => memberTodayRank(a.today) - memberTodayRank(b.today) || roleRank[a.role] - roleRank[b.role] || a.displayName.localeCompare(b.displayName));
    },

    async setMemberRole(groupId, userId, role) {
      const c = await ctx.current();
      const actor = roleIn(c.social, groupId, c.me.id);
      if (!actor) throw new AppError('group_not_found');
      const target = c.social.groupMembers.find((m) => m.groupId === groupId && m.userId === userId);
      if (!target) throw new AppError('member_not_found');
      if (!canChangeRole(actor, target.role, role)) throw new AppError('not_allowed');
      target.role = role;
      await ctx.save();
    },

    async transferGroup(groupId, userId) {
      const c = await ctx.current();
      requireRole(c, groupId, 'transfer');
      const target = c.social.groupMembers.find((m) => m.groupId === groupId && m.userId === userId);
      const me = c.social.groupMembers.find((m) => m.groupId === groupId && m.userId === c.me.id)!;
      if (!target || userId === c.me.id) throw new AppError('member_not_found');
      me.role = 'admin';
      target.role = 'owner';
      await ctx.save();
    },

    async removeGroupMember(groupId, userId) {
      const c = await ctx.current();
      const actor = roleIn(c.social, groupId, c.me.id);
      if (!actor) throw new AppError('group_not_found');
      const target = roleIn(c.social, groupId, userId);
      if (!target) throw new AppError('member_not_found');
      if (!canRemoveMember(actor, target)) throw new AppError('not_allowed');
      c.social.groupMembers = c.social.groupMembers.filter((m) => !(m.groupId === groupId && m.userId === userId));
      await ctx.save();
    },

    async nudgeMember(groupId, userId) {
      const c = await ctx.current();
      const { g } = requireRole(c, groupId, 'read');
      if (userId === c.me.id || !roleIn(c.social, groupId, userId)) throw new AppError('member_not_found');
      if (statusOf(c, g, userId, null) !== 'not_yet') throw new AppError('already_read');
      const since = new Date(Date.now() - 20 * 3_600_000).toISOString();
      const recent = c.social.notifications.filter((n) => n.kind === 'nudge' && n.userId === userId && n.createdAt > since);
      if (recent.some((n) => n.actorId === c.me.id) || recent.length >= 3) throw new AppError('rate_limited');
      // Sample people don't have inboxes; keep the record so the button shows "sent".
      c.social.notifications.push({ id: ctx.newId(), userId, actorId: c.me.id, kind: 'nudge', postId: null, groupId, createdAt: new Date().toISOString(), read: true });
      await ctx.save();
    },

    async getGroupPosts(id, before) {
      const c = await ctx.current();
      requireRole(c, id, 'read');
      const s = c.social;
      const visible = s.posts.filter((p) => p.groupId === id && !blockedWith(s, c.me.id, p.authorId));
      const pinned = before ? [] : visible.filter((p) => p.pinnedAt).sort((a, b) => (b.pinnedAt ?? '').localeCompare(a.pinnedAt ?? ''));
      const rest = visible
        .filter((p) => !p.pinnedAt && p.groupDay == null && (!before || p.createdAt < before))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        pinned: pinned.map((p) => posts.toPost(s, c.me, p)),
        items: rest.slice(0, 20).map((p) => posts.toPost(s, c.me, p)),
        caughtUp: rest.length <= 20,
      };
    },

    async getGroupDay(id, day) {
      const c = await ctx.current();
      requireRole(c, id, 'read');
      const s = c.social;
      return s.posts
        .filter((p) => p.groupId === id && p.groupDay === day && !blockedWith(s, c.me.id, p.authorId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((p) => posts.toPost(s, c.me, p));
    },

    async pinGroupPost(postId, pinned) {
      const c = await ctx.current();
      const p = c.social.posts.find((x) => x.id === postId);
      if (!p?.groupId) throw new AppError('post_not_found');
      requireRole(c, p.groupId, 'pin');
      if (pinned && c.social.posts.filter((x) => x.groupId === p.groupId && x.pinnedAt && x.id !== postId).length >= GROUP_LIMITS.pinnedMax) {
        throw new AppError('too_many_pinned');
      }
      p.pinnedAt = pinned ? (p.pinnedAt ?? new Date().toISOString()) : null;
      await ctx.save();
    },

    async removeGroupPost(postId) {
      const c = await ctx.current();
      const p = c.social.posts.find((x) => x.id === postId);
      if (!p?.groupId) throw new AppError('post_not_found');
      requireRole(c, p.groupId, 'remove_content');
      c.social.posts = c.social.posts.filter((x) => x.id !== postId);
      c.social.comments = c.social.comments.filter((x) => x.postId !== postId);
      await ctx.save();
    },
  };
}
