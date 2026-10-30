/**
 * Social features for demo mode. Three sample friends with a few posts make the feed, follows,
 * reactions and comments explorable without a server. The rules come from @bible-app/core.
 */
import {
  canInGroup,
  canSee,
  CARD_LIMITS,
  checkContent,
  followOutcome,
  isCardStyle,
  SOCIAL_LIMITS,
  withinRateLimit,
  type BadgeCode,
  type CardStyle,
} from '@bible-app/core';
import { fromKey, isValidRange } from '@bible-app/bible';
import { roleIn, type GroupsState } from './demo-groups';
import {
  AppError,
  type AppNotification,
  type Backend,
  type Comment,
  type FeedPage,
  type FollowState,
  type Milestone,
  type NotificationKind,
  type Person,
  type PlanDetail,
  type Post,
  type Profile,
  type ReactionKind,
  type Visibility,
} from './types';

interface DemoPerson {
  id: string;
  username: string;
  displayName: string;
  visibility: Visibility;
  bio: string;
  streak: { current: number; longest: number };
  badges: BadgeCode[];
}

export interface DemoPost {
  id: string;
  authorId: string;
  type: Post['type'];
  passage: string | null;
  translation: Post['translation'];
  verseText: string | null;
  body: string;
  milestone: Milestone | null;
  hidden: boolean;
  createdAt: string;
  groupId?: string | null;
  groupDay?: number | null;
  pinnedAt?: string | null;
  card?: CardStyle | null;
}

export interface SocialState extends Partial<GroupsState> {
  people: DemoPerson[];
  posts: DemoPost[];
  comments: Array<{ id: string; postId: string; authorId: string; body: string; createdAt: string }>;
  reactions: Array<{ postId: string; userId: string; kind: ReactionKind }>;
  follows: Array<{ followerId: string; followeeId: string; status: 'pending' | 'accepted' }>;
  blocks: Array<{ blockerId: string; blockedId: string }>;
  mutes: Array<{ muterId: string; mutedId: string }>;
  notifications: Array<{ id: string; userId: string; actorId: string; kind: NotificationKind; postId: string | null; groupId?: string | null; createdAt: string; read: boolean }>;
  reports: Array<{ target: string; targetId: string; reason: string; details: string; createdAt: string }>;
}

const SAM = 'demo-sam';
const JO = 'demo-jo';
const MARIA = 'demo-maria';

/** The sample friends and their posts, dated relative to now. */
export function seedSocial(meId: string, now = new Date()): SocialState {
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  return {
    people: [
      { id: SAM, username: 'sam', displayName: 'Sam', visibility: 'public', bio: 'Morning reader, coffee first.', streak: { current: 21, longest: 21 }, badges: ['first_reading', 'streak_7'] },
      { id: JO, username: 'jo', displayName: 'Jo', visibility: 'public', bio: 'Working through the Gospels.', streak: { current: 4, longest: 12 }, badges: ['first_reading', 'streak_7'] },
      { id: MARIA, username: 'maria', displayName: 'Maria', visibility: 'friends', bio: 'Psalms and long walks.', streak: { current: 9, longest: 40 }, badges: ['first_reading', 'streak_7', 'streak_30', 'first_plan'] },
    ],
    posts: [
      { id: 'demo-p1', authorId: SAM, type: 'verse', passage: 'PSA.46.10', translation: 'bsb', verseText: '“Be still and know that I am God; I will be exalted among the nations, I will be exalted over the earth.”', body: 'Needed this today.', milestone: null, hidden: false, createdAt: ago(2) },
      { id: 'demo-p2', authorId: MARIA, type: 'reflection', passage: 'LAM.3.22-LAM.3.23', translation: 'bsb', verseText: null, body: 'New every morning. Holding on to that this week.', milestone: null, hidden: false, createdAt: ago(5) },
      { id: 'demo-p3', authorId: JO, type: 'prayer', passage: null, translation: null, verseText: null, body: 'Job interview on Thursday. I’d be grateful for your prayers.', milestone: null, hidden: false, createdAt: ago(26) },
      { id: 'demo-p5', authorId: SAM, type: 'verse', passage: 'ISA.40.31', translation: 'bsb', verseText: 'But those who wait upon the LORD will renew their strength; they will mount up with wings like eagles; they will run and not grow weary, they will walk and not faint.', body: 'Made this one for anyone running on empty this week.', milestone: null, hidden: false, createdAt: ago(9), card: { background: 'sea', font: 'serif_italic' } },
      { id: 'demo-p4', authorId: SAM, type: 'milestone', passage: null, translation: null, verseText: null, body: '', milestone: { kind: 'badge', code: 'streak_7' }, hidden: false, createdAt: ago(72) },
    ],
    comments: [{ id: 'demo-c1', postId: 'demo-p1', authorId: JO, body: 'Amen. Thank you for sharing.', createdAt: ago(1) }],
    reactions: [
      { postId: 'demo-p1', userId: JO, kind: 'amen' },
      { postId: 'demo-p1', userId: MARIA, kind: 'encouraged' },
      { postId: 'demo-p3', userId: SAM, kind: 'praying' },
    ],
    follows: [
      { followerId: meId, followeeId: SAM, status: 'accepted' },
      { followerId: SAM, followeeId: meId, status: 'accepted' },
      { followerId: JO, followeeId: meId, status: 'pending' },
    ],
    blocks: [],
    mutes: [],
    notifications: [
      { id: 'demo-n1', userId: meId, actorId: SAM, kind: 'follow', postId: null, createdAt: ago(30), read: false },
      { id: 'demo-n2', userId: meId, actorId: JO, kind: 'follow_request', postId: null, createdAt: ago(3), read: false },
    ],
    reports: [],
  };
}

interface Context {
  /** Signed-in demo user with their social state (seeded on first use). */
  current(): Promise<{ me: Profile; social: SocialState }>;
  save(): Promise<void>;
  newId(): string;
  plans(): Promise<PlanDetail[]>;
}

type SocialApi = Pick<
  Backend,
  | 'getFeed'
  | 'getUserPosts'
  | 'getCardPosts'
  | 'getPost'
  | 'createPost'
  | 'deletePost'
  | 'setPostHidden'
  | 'react'
  | 'listComments'
  | 'addComment'
  | 'deleteComment'
  | 'findPeople'
  | 'getPublicProfile'
  | 'follow'
  | 'unfollow'
  | 'respondToFollow'
  | 'removeFollower'
  | 'listConnections'
  | 'block'
  | 'unblock'
  | 'listBlocked'
  | 'setMuted'
  | 'report'
  | 'listNotifications'
  | 'markNotificationsRead'
  | 'subscribe'
  | 'adminReports'
  | 'adminResolve'
  | 'adminUnsuspend'
>;

export const personOf = (s: SocialState, me: Profile, id: string): Person => {
  if (id === me.id) return { id: me.id, username: me.username, displayName: me.displayName, avatarUrl: null };
  const p = s.people.find((x) => x.id === id);
  return { id, username: p?.username ?? null, displayName: p?.displayName ?? '', avatarUrl: null };
};
export const blocked = (s: SocialState, a: string, b: string) =>
  s.blocks.some((x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));
export const followState = (s: SocialState, from: string, to: string): FollowState =>
  s.follows.find((f) => f.followerId === from && f.followeeId === to)?.status ?? 'none';
export const visibilityOf = (s: SocialState, me: Profile, id: string): Visibility =>
  id === me.id ? me.visibility : (s.people.find((p) => p.id === id)?.visibility ?? 'private');
export const sees = (s: SocialState, me: Profile, owner: string) =>
  canSee(visibilityOf(s, me, owner), {
    isSelf: owner === me.id,
    blocked: blocked(s, me.id, owner),
    follows: followState(s, me.id, owner),
    ownerSuspended: false,
  });
/** Group posts: members see everyone not blocked. Elsewhere: profile rules. */
export const seesIn = (s: SocialState, me: Profile, p: DemoPost, authorId: string) =>
  p.groupId ? authorId === me.id || !blocked(s, me.id, authorId) : sees(s, me, authorId);
export const visiblePost = (s: SocialState, me: Profile, id: string) => {
  const p = s.posts.find((x) => x.id === id);
  if (!p || (p.hidden && p.authorId !== me.id)) throw new AppError('post_not_found');
  if (p.groupId ? !roleIn(s, p.groupId, me.id) || !seesIn(s, me, p, p.authorId) : !sees(s, me, p.authorId)) throw new AppError('post_not_found');
  return p;
};
export const toPost = (s: SocialState, me: Profile, p: DemoPost): Post => {
  const count = (k: ReactionKind) => s.reactions.filter((r) => r.postId === p.id && r.kind === k).length;
  const { groupId, groupDay, pinnedAt, card, ...rest } = p;
  const group = groupId ? s.groups?.find((g) => g.id === groupId) : undefined;
  const myRole = roleIn(s, groupId, me.id);
  return {
    ...rest,
    group: group ? { id: group.id, name: group.name } : null,
    groupDay: groupDay ?? null,
    pinned: !!pinnedAt,
    card: card ?? null,
    canModerate: canInGroup(myRole, 'remove_content'),
    isMine: p.authorId === me.id,
    author: personOf(s, me, p.authorId),
    reactions: { amen: count('amen'), praying: count('praying'), encouraged: count('encouraged') },
    myReaction: s.reactions.find((r) => r.postId === p.id && r.userId === me.id)?.kind ?? null,
    commentCount: s.comments.filter((c) => c.postId === p.id && seesIn(s, me, p, c.authorId)).length,
  };
};

export function createDemoSocial(ctx: Context): SocialApi {
  const page = (s: SocialState, me: Profile, posts: DemoPost[], before?: string): FeedPage => {
    const sorted = posts.filter((p) => !before || p.createdAt < before).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const size = SOCIAL_LIMITS.feedPageSize;
    return { items: sorted.slice(0, size).map((p) => toPost(s, me, p)), caughtUp: sorted.length <= size };
  };
  const contentError = (problem: string | null) => {
    if (!problem) return;
    throw new AppError(problem === 'empty' ? 'content_empty' : problem === 'too_long' ? 'content_too_long' : problem);
  };

  return {
    async getFeed(before) {
      const { me, social: s } = await ctx.current();
      const cutoff = new Date(Date.now() - SOCIAL_LIMITS.feedWindowDays * 86_400_000).toISOString();
      const posts = s.posts.filter(
        (p) =>
          !p.hidden &&
          p.groupDay == null &&
          p.createdAt > cutoff &&
          !s.mutes.some((m) => m.muterId === me.id && m.mutedId === p.authorId) &&
          (p.groupId
            ? !!roleIn(s, p.groupId, me.id) && seesIn(s, me, p, p.authorId)
            : (p.authorId === me.id || followState(s, me.id, p.authorId) === 'accepted') && sees(s, me, p.authorId)),
      );
      return page(s, me, posts, before);
    },

    async getUserPosts(userId, before) {
      const { me, social: s } = await ctx.current();
      if (!sees(s, me, userId)) return { items: [], caughtUp: true };
      return page(s, me, s.posts.filter((p) => p.authorId === userId && !p.groupId && (!p.hidden || p.authorId === me.id)), before);
    },

    async getCardPosts() {
      const { me, social: s } = await ctx.current();
      const since = new Date(Date.now() - CARD_LIMITS.friendWindowHours * 3_600_000).toISOString();
      return s.posts
        .filter(
          (p) =>
            p.card &&
            !p.hidden &&
            p.authorId !== me.id &&
            p.createdAt > since &&
            !s.mutes.some((m) => m.muterId === me.id && m.mutedId === p.authorId) &&
            (p.groupId ? !!roleIn(s, p.groupId, me.id) && seesIn(s, me, p, p.authorId) : followState(s, me.id, p.authorId) === 'accepted' && sees(s, me, p.authorId)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, CARD_LIMITS.dailyFromFriends)
        .map((p) => toPost(s, me, p));
    },

    async getPost(id) {
      const { me, social: s } = await ctx.current();
      return toPost(s, me, visiblePost(s, me, id));
    },

    async createPost(input) {
      const { me, social: s } = await ctx.current();
      let passage = input.passage ?? null;
      const groupId = input.groupId ?? null;
      const groupDay = input.groupDay ?? null;
      if (groupId && !roleIn(s, groupId, me.id)) throw new AppError('group_not_found');
      if (groupDay !== null) {
        // A reply in a group plan day's thread is about that day's reading.
        const g = s.groups?.find((x) => x.id === groupId);
        const plan = g?.planId ? (await ctx.plans()).find((x) => x.id === g.planId) : undefined;
        const reading = plan?.schedule.find((d) => d.day === groupDay)?.readings[0];
        if (input.type !== 'reflection' || !reading) throw new AppError('invalid_post');
        passage = reading;
      }
      if (input.card && (input.type !== 'verse' || groupDay !== null || !isCardStyle(input.card))) throw new AppError('invalid_card');
      contentError(checkContent(input.body, { maxLength: SOCIAL_LIMITS.postMax, allowEmpty: input.type === 'verse' }));
      if (input.type !== 'prayer') {
        const range = passage ? fromKey(passage) : null;
        if (!range || !isValidRange(range)) throw new AppError('invalid_passage');
      }
      const mine = s.posts.filter((p) => p.authorId === me.id && p.type !== 'milestone');
      if (groupDay === null) {
        const counted = mine.filter((p) => p.groupDay == null).map((p) => new Date(p.createdAt));
        if (!withinRateLimit(counted, new Date(), 86_400_000, SOCIAL_LIMITS.postsPerDay)) throw new AppError('rate_limited');
      } else {
        const counted = [...mine.filter((p) => p.groupDay != null), ...s.comments.filter((c) => c.authorId === me.id)].map((x) => new Date(x.createdAt));
        if (!withinRateLimit(counted, new Date(), 3_600_000, SOCIAL_LIMITS.commentsPerHour)) throw new AppError('rate_limited');
      }
      const body = input.body.trim();
      const since = new Date(Date.now() - 86_400_000).toISOString();
      if (
        mine.some(
          (p) =>
            p.createdAt > since &&
            p.body === body &&
            p.passage === passage &&
            p.type === input.type &&
            (p.groupId ?? null) === groupId &&
            (p.groupDay ?? null) === groupDay,
        )
      ) {
        throw new AppError('duplicate_post');
      }
      const post: DemoPost = {
        id: ctx.newId(),
        authorId: me.id,
        type: input.type,
        passage: input.type === 'prayer' ? null : passage,
        translation: input.type === 'prayer' ? null : (input.translation ?? 'bsb'),
        verseText: input.type === 'verse' ? (input.verseText ?? '') : null,
        body,
        milestone: null,
        hidden: false,
        createdAt: new Date().toISOString(),
        groupId,
        groupDay,
        pinnedAt: null,
        card: input.card ?? null,
      };
      s.posts.push(post);
      await ctx.save();
      return toPost(s, me, post);
    },

    async deletePost(id) {
      const { me, social: s } = await ctx.current();
      if (!s.posts.some((p) => p.id === id && p.authorId === me.id)) throw new AppError('post_not_found');
      s.posts = s.posts.filter((p) => p.id !== id);
      s.comments = s.comments.filter((c) => c.postId !== id);
      s.reactions = s.reactions.filter((r) => r.postId !== id);
      await ctx.save();
    },

    async setPostHidden(id, hidden) {
      const { me, social: s } = await ctx.current();
      const p = s.posts.find((x) => x.id === id && x.authorId === me.id);
      if (!p) throw new AppError('post_not_found');
      p.hidden = hidden;
      await ctx.save();
    },

    async react(postId, kind) {
      const { me, social: s } = await ctx.current();
      const p = visiblePost(s, me, postId);
      s.reactions = s.reactions.filter((r) => !(r.postId === postId && r.userId === me.id));
      if (kind) s.reactions.push({ postId, userId: me.id, kind });
      await ctx.save();
      return toPost(s, me, p);
    },

    async listComments(postId) {
      const { me, social: s } = await ctx.current();
      const p = visiblePost(s, me, postId);
      return s.comments
        .filter((c) => c.postId === postId && seesIn(s, me, p, c.authorId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(
          (c): Comment => ({
            id: c.id,
            body: c.body,
            createdAt: c.createdAt,
            isMine: c.authorId === me.id,
            canRemove: c.authorId === me.id || p.authorId === me.id || canInGroup(roleIn(s, p.groupId, me.id), 'remove_content'),
            author: personOf(s, me, c.authorId),
          }),
        );
    },

    async addComment(postId, body) {
      const { me, social: s } = await ctx.current();
      visiblePost(s, me, postId);
      contentError(checkContent(body, { maxLength: SOCIAL_LIMITS.commentMax }));
      const mine = s.comments.filter((c) => c.authorId === me.id).map((c) => new Date(c.createdAt));
      if (!withinRateLimit(mine, new Date(), 3_600_000, SOCIAL_LIMITS.commentsPerHour)) throw new AppError('rate_limited');
      const c = { id: ctx.newId(), postId, authorId: me.id, body: body.trim(), createdAt: new Date().toISOString() };
      s.comments.push(c);
      await ctx.save();
      return { id: c.id, body: c.body, createdAt: c.createdAt, isMine: true, canRemove: true, author: personOf(s, me, me.id) };
    },

    async deleteComment(id) {
      const { me, social: s } = await ctx.current();
      const c = s.comments.find((x) => x.id === id);
      const post = c ? s.posts.find((p) => p.id === c.postId) : undefined;
      const moderator = canInGroup(roleIn(s, post?.groupId, me.id), 'remove_content');
      if (!c || (c.authorId !== me.id && post?.authorId !== me.id && !moderator)) throw new AppError('comment_not_found');
      s.comments = s.comments.filter((x) => x.id !== id);
      await ctx.save();
    },

    async findPeople(query) {
      const { me, social: s } = await ctx.current();
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      return s.people
        .filter((p) => p.visibility !== 'private' && !blocked(s, me.id, p.id) && (p.username.startsWith(q) || p.displayName.toLowerCase().includes(q)))
        .map((p) => ({ ...personOf(s, me, p.id), visibility: p.visibility, followStatus: followState(s, me.id, p.id) }));
    },

    async getPublicProfile(ref) {
      const { me, social: s } = await ctx.current();
      const isMe = ref.id === me.id || (!!ref.username && ref.username === me.username);
      const p = isMe ? undefined : s.people.find((x) => x.id === ref.id || x.username === ref.username);
      if (!isMe && (!p || p.visibility === 'private' || blocked(s, me.id, p.id))) throw new AppError('profile_not_found');
      const id = isMe ? me.id : p!.id;
      const can = sees(s, me, id);
      return {
        ...personOf(s, me, id),
        visibility: visibilityOf(s, me, id),
        isMe,
        canSee: can,
        followStatus: followState(s, me.id, id),
        followsYou: followState(s, id, me.id) === 'accepted',
        muted: s.mutes.some((m) => m.muterId === me.id && m.mutedId === id),
        followerCount: s.follows.filter((f) => f.followeeId === id && f.status === 'accepted').length,
        followingCount: s.follows.filter((f) => f.followerId === id && f.status === 'accepted').length,
        ...(can && p ? { bio: p.bio, streak: p.streak, badges: p.badges, plans: [] } : {}),
        ...(can && isMe ? { bio: me.bio } : {}),
      };
    },

    async follow(userId) {
      const { me, social: s } = await ctx.current();
      if (userId === me.id) throw new AppError('cannot_follow_self');
      const p = s.people.find((x) => x.id === userId);
      if (!p || blocked(s, me.id, userId)) throw new AppError('profile_not_found');
      const outcome = followOutcome(p.visibility);
      if (outcome === 'not_allowed') throw new AppError('cannot_follow_private');
      const existing = followState(s, me.id, userId);
      if (existing !== 'none') return existing;
      s.follows.push({ followerId: me.id, followeeId: userId, status: outcome });
      await ctx.save();
      return outcome;
    },

    async unfollow(userId) {
      const { me, social: s } = await ctx.current();
      s.follows = s.follows.filter((f) => !(f.followerId === me.id && f.followeeId === userId));
      await ctx.save();
    },

    async respondToFollow(userId, accept) {
      const { me, social: s } = await ctx.current();
      const f = s.follows.find((x) => x.followerId === userId && x.followeeId === me.id && x.status === 'pending');
      if (f && accept) f.status = 'accepted';
      if (f && !accept) s.follows = s.follows.filter((x) => x !== f);
      s.notifications = s.notifications.filter((n) => !(n.actorId === userId && n.kind === 'follow_request'));
      await ctx.save();
    },

    async removeFollower(userId) {
      const { me, social: s } = await ctx.current();
      s.follows = s.follows.filter((f) => !(f.followerId === userId && f.followeeId === me.id));
      await ctx.save();
    },

    async listConnections(kind) {
      const { me, social: s } = await ctx.current();
      const rows = s.follows.filter((f) =>
        kind === 'following'
          ? f.followerId === me.id && f.status === 'accepted'
          : kind === 'followers'
            ? f.followeeId === me.id && f.status === 'accepted'
            : f.followeeId === me.id && f.status === 'pending',
      );
      return rows.map((f) => personOf(s, me, kind === 'following' ? f.followeeId : f.followerId));
    },

    async block(userId) {
      const { me, social: s } = await ctx.current();
      if (userId === me.id) throw new AppError('cannot_block_self');
      if (!blocked(s, me.id, userId)) s.blocks.push({ blockerId: me.id, blockedId: userId });
      s.follows = s.follows.filter((f) => !((f.followerId === me.id && f.followeeId === userId) || (f.followerId === userId && f.followeeId === me.id)));
      s.notifications = s.notifications.filter((n) => n.actorId !== userId);
      await ctx.save();
    },

    async unblock(userId) {
      const { me, social: s } = await ctx.current();
      s.blocks = s.blocks.filter((b) => !(b.blockerId === me.id && b.blockedId === userId));
      await ctx.save();
    },

    async listBlocked() {
      const { me, social: s } = await ctx.current();
      return s.blocks.filter((b) => b.blockerId === me.id).map((b) => personOf(s, me, b.blockedId));
    },

    async setMuted(userId, muted) {
      const { me, social: s } = await ctx.current();
      s.mutes = s.mutes.filter((m) => !(m.muterId === me.id && m.mutedId === userId));
      if (muted) s.mutes.push({ muterId: me.id, mutedId: userId });
      await ctx.save();
    },

    async report(target, targetId, reason, details) {
      const { social: s } = await ctx.current();
      if (details.length > SOCIAL_LIMITS.reportDetailsMax) throw new AppError('content_too_long');
      s.reports.push({ target, targetId, reason, details, createdAt: new Date().toISOString() });
      await ctx.save();
    },

    async listNotifications() {
      const { me, social: s } = await ctx.current();
      return s.notifications
        .filter((n) => n.userId === me.id && !blocked(s, me.id, n.actorId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((n): AppNotification => {
          const post = n.postId ? s.posts.find((p) => p.id === n.postId) : undefined;
          const group = n.groupId ? s.groups?.find((g) => g.id === n.groupId) : undefined;
          return {
            id: n.id,
            kind: n.kind,
            createdAt: n.createdAt,
            read: n.read,
            actor: personOf(s, me, n.actorId),
            post: post ? { id: post.id, type: post.type, passage: post.passage, body: post.body.slice(0, 120) } : null,
            group: group ? { id: group.id, name: group.name } : null,
          };
        });
    },

    async markNotificationsRead() {
      const { me, social: s } = await ctx.current();
      for (const n of s.notifications) if (n.userId === me.id) n.read = true;
      await ctx.save();
    },

    subscribe() {
      return () => undefined;
    },

    async adminReports() {
      throw new AppError('not_admin');
    },
    async adminResolve() {
      throw new AppError('not_admin');
    },
    async adminUnsuspend() {
      throw new AppError('not_admin');
    },
  };
}
