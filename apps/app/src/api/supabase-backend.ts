import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { BadgeCode } from '@bible-app/core';
import type { BookId, SearchHit, TranslationId } from '@bible-app/bible';
import {
  AppError,
  type AppNotification,
  type Backend,
  type Comment,
  type FeedPage,
  type FollowState,
  type Milestone,
  type ModerationItem,
  type Person,
  type Post,
  type PostType,
  type PublicProfile,
  type ReactionKind,
  type ReportReason,
  type ReportTarget,
  type Visibility,
  type Bookmark,
  type CompleteResult,
  type DayState,
  type Enrolment,
  type HighlightColor,
  type Note,
  type NotificationPrefs,
  type PlanCategory,
  type Profile,
  type ProfilePatch,
  type Session,
  type TodayData,
} from './types';

/** Errors raised by our SQL functions and by Supabase Auth that the UI explains. */
const KNOWN_ERRORS = [
  'not_authenticated',
  'day_already_completed',
  'plan_paused',
  'plan_finished',
  'day_out_of_range',
  'reflection_too_long',
  'invalid_chapter',
  'invalid_timezone',
  'invalid_transition',
  'plan_not_found',
  'enrolment_not_found',
  'invalid_credentials',
  'email_not_confirmed',
  'user_already_exists',
  'weak_password',
  'over_email_send_rate_limit',
  'same_password',
  'account_suspended',
  'content_empty',
  'content_too_long',
  'links_not_allowed',
  'content_blocked',
  'rate_limited',
  'duplicate_post',
  'invalid_passage',
  'invalid_post',
  'post_not_found',
  'comment_not_found',
  'profile_not_found',
  'cannot_follow_private',
  'cannot_follow_self',
  'cannot_block_self',
  'report_target_not_found',
  'not_admin',
  'invalid_action',
];

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = err as { code?: string; message?: string };
  if (e.code === '23505' && e.message?.includes('username')) return new AppError('username_taken');
  const code = KNOWN_ERRORS.find((k) => e.code === k || e.message?.includes(k));
  if (code) return new AppError(code);
  if (e.message?.toLowerCase().includes('fetch')) return new AppError('network');
  return new AppError('unknown', e.message);
}

/** Await a Supabase call, throw an AppError on failure, return its data. */
async function run<R extends { error: unknown }>(promise: PromiseLike<R>): Promise<R extends { data: infer D } ? NonNullable<D> : void> {
  const result = await promise;
  if (result.error) throw toAppError(result.error);
  return (result as { data?: unknown }).data as never;
}

type Row = Record<string, unknown>;

function mapProfile(r: Row): Profile {
  return {
    id: r.id as string,
    username: (r.username as string | null) ?? null,
    displayName: (r.display_name as string) ?? '',
    bio: (r.bio as string) ?? '',
    avatarUrl: (r.avatar_url as string | null) ?? null,
    visibility: r.visibility as Profile['visibility'],
    timezone: r.timezone as string,
    translation: r.translation as TranslationId,
    readingPrefs: (r.reading_prefs as Profile['readingPrefs']) ?? {},
    onboarded: Boolean(r.onboarded),
    shareMilestones: r.share_milestones !== false,
    isAdmin: Boolean(r.is_admin),
  };
}

const hhmm = (t: unknown) => (typeof t === 'string' ? t.slice(0, 5) : null);

function mapPrefs(r: Row): NotificationPrefs {
  return {
    remindersEnabled: Boolean(r.reminders_enabled),
    reminderTime: hhmm(r.reminder_time) ?? '08:00',
    quietStart: hhmm(r.quiet_start),
    quietEnd: hhmm(r.quiet_end),
    dailyCap: Number(r.daily_cap),
    socialComments: Boolean(r.social_comments),
    socialReactions: Boolean(r.social_reactions),
    socialNudges: Boolean(r.social_nudges),
    socialGroupActivity: Boolean(r.social_group_activity),
  };
}

function mapNote(r: Row): Note {
  return {
    id: r.id as string,
    book: r.book as BookId,
    chapter: Number(r.chapter),
    verseStart: Number(r.verse_start),
    verseEnd: Number(r.verse_end),
    body: r.body as string,
    updatedAt: r.updated_at as string,
  };
}

function mapBookmark(r: Row): Bookmark {
  return {
    id: r.id as string,
    book: r.book as BookId,
    chapter: Number(r.chapter),
    verse: r.verse === null ? null : Number(r.verse),
    createdAt: r.created_at as string,
  };
}

function mapComplete(r: Row): CompleteResult {
  const s = r.streak as Row;
  return {
    streak: {
      current: Number(s.current),
      longest: Number(s.longest),
      freezesLeft: Number(s.freezes_left),
      readToday: true,
      counted: Boolean(s.counted),
      earnedFreeze: Boolean(s.earned_freeze),
    },
    finishedPlan: Boolean(r.finished_plan),
    newBadges: (r.new_badges as BadgeCode[]) ?? [],
  };
}

function mapPerson(r: Row): Person {
  return {
    id: r.id as string,
    username: (r.username as string | null) ?? null,
    displayName: (r.display_name as string) ?? '',
    avatarUrl: (r.avatar_url as string | null) ?? null,
  };
}

function mapPost(r: Row): Post {
  const reactions = (r.reactions as Record<string, number> | null) ?? {};
  return {
    id: r.id as string,
    type: r.type as PostType,
    passage: (r.passage as string | null) ?? null,
    translation: (r.translation as TranslationId | null) ?? null,
    verseText: (r.verse_text as string | null) ?? null,
    body: (r.body as string) ?? '',
    milestone: (r.milestone as Milestone | null) ?? null,
    hidden: Boolean(r.hidden),
    createdAt: r.created_at as string,
    isMine: Boolean(r.is_mine),
    author: mapPerson(r.author as Row),
    reactions: { amen: Number(reactions.amen ?? 0), praying: Number(reactions.praying ?? 0), encouraged: Number(reactions.encouraged ?? 0) },
    myReaction: (r.my_reaction as ReactionKind | null) ?? null,
    commentCount: Number(r.comment_count ?? 0),
  };
}

function mapFeed(r: Row): FeedPage {
  return { items: ((r.items as Row[]) ?? []).map(mapPost), caughtUp: Boolean(r.caught_up) };
}

function mapComment(r: Row): Comment {
  return {
    id: r.id as string,
    body: r.body as string,
    createdAt: r.created_at as string,
    isMine: Boolean(r.is_mine),
    canRemove: Boolean(r.can_remove ?? r.is_mine),
    author: mapPerson(r.author as Row),
  };
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });

  const uid = async () => {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new AppError('not_authenticated');
    return id;
  };

  const toSession = (s: { user: { id: string; email?: string } } | null): Session | null =>
    s ? { userId: s.user.id, email: s.user.email ?? null } : null;

  const siteUrl = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined);

  return {
    kind: 'supabase',

    auth: {
      async getSession() {
        const { data } = await sb.auth.getSession();
        return toSession(data.session);
      },
      onChange(callback) {
        const { data } = sb.auth.onAuthStateChange((_event, session) => callback(toSession(session)));
        return () => data.subscription.unsubscribe();
      },
      async signUp({ email, password, displayName, timezone }) {
        const data = await run(
          sb.auth.signUp({ email, password, options: { data: { full_name: displayName, timezone }, emailRedirectTo: siteUrl() } }),
        );
        return { needsConfirmation: !data.session };
      },
      async signIn({ email, password }) {
        await run(sb.auth.signInWithPassword({ email, password }));
      },
      async signInWithGoogle() {
        await run(sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } }));
      },
      async sendPasswordReset(email) {
        const origin = siteUrl();
        await run(sb.auth.resetPasswordForEmail(email, { redirectTo: origin ? `${origin}/reset-password` : undefined }));
      },
      async updatePassword(password) {
        await run(sb.auth.updateUser({ password }));
      },
      async signOut() {
        await run(sb.auth.signOut());
      },
    },

    async getProfile() {
      const id = await uid();
      return mapProfile(await run(sb.from('profiles').select('*').eq('id', id).single()));
    },

    async updateProfile(patch: ProfilePatch) {
      const id = await uid();
      const row: Row = {};
      if (patch.username !== undefined) row.username = patch.username;
      if (patch.displayName !== undefined) row.display_name = patch.displayName;
      if (patch.bio !== undefined) row.bio = patch.bio;
      if (patch.visibility !== undefined) row.visibility = patch.visibility;
      if (patch.timezone !== undefined) row.timezone = patch.timezone;
      if (patch.translation !== undefined) row.translation = patch.translation;
      if (patch.readingPrefs !== undefined) row.reading_prefs = patch.readingPrefs;
      if (patch.onboarded !== undefined) row.onboarded = patch.onboarded;
      if (patch.shareMilestones !== undefined) row.share_milestones = patch.shareMilestones;
      return mapProfile(await run(sb.from('profiles').update(row).eq('id', id).select('*').single()));
    },

    async getNotificationPrefs() {
      const id = await uid();
      return mapPrefs(await run(sb.from('notification_settings').select('*').eq('user_id', id).single()));
    },

    async updateNotificationPrefs(patch) {
      const id = await uid();
      const row: Row = {};
      if (patch.remindersEnabled !== undefined) row.reminders_enabled = patch.remindersEnabled;
      if (patch.reminderTime !== undefined) row.reminder_time = patch.reminderTime;
      if (patch.quietStart !== undefined) row.quiet_start = patch.quietStart;
      if (patch.quietEnd !== undefined) row.quiet_end = patch.quietEnd;
      if (patch.dailyCap !== undefined) row.daily_cap = patch.dailyCap;
      if (patch.socialComments !== undefined) row.social_comments = patch.socialComments;
      if (patch.socialReactions !== undefined) row.social_reactions = patch.socialReactions;
      if (patch.socialNudges !== undefined) row.social_nudges = patch.socialNudges;
      if (patch.socialGroupActivity !== undefined) row.social_group_activity = patch.socialGroupActivity;
      row.updated_at = new Date().toISOString();
      return mapPrefs(await run(sb.from('notification_settings').update(row).eq('user_id', id).select('*').single()));
    },

    async savePushSubscription(sub) {
      const id = await uid();
      await run(
        sb
          .from('push_subscriptions')
          .upsert({ user_id: id, platform: 'web', endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { onConflict: 'endpoint' }),
      );
    },

    async getToday(): Promise<TodayData> {
      const t = (await run(sb.rpc('get_today'))) as Row;
      const s = t.streak as Row;
      return {
        localDate: t.local_date as string,
        streak: {
          current: Number(s.current),
          longest: Number(s.longest),
          freezesLeft: Number(s.freezes_left),
          readToday: Boolean(s.read_today),
        },
        daysReadLast7: Number(t.days_read_last_7),
        week: (t.week as DayState[]) ?? [],
        plans: ((t.plans as Row[]) ?? []).map((p) => ({
          enrolmentId: p.enrolment_id as string,
          planId: p.plan_id as string,
          slug: p.slug as string,
          title: p.title as string,
          days: Number(p.days),
          completed: Number(p.completed),
          completedToday: Boolean(p.completed_today),
          nextDay: p.next_day === null ? null : Number(p.next_day),
          readings: (p.readings as string[]) ?? [],
          reflectionPrompt: (p.reflection_prompt as string | null) ?? null,
        })),
      };
    },

    async listPlans() {
      const rows = (await run(sb.from('reading_plans').select('id, slug, title, description, category, days').order('sort'))) as Row[];
      return rows.map((r) => ({
        id: r.id as string,
        slug: r.slug as string,
        title: r.title as string,
        description: r.description as string,
        category: r.category as PlanCategory,
        days: Number(r.days),
      }));
    },

    async getPlan(slug) {
      const plan = (await run(sb.from('reading_plans').select('id, slug, title, description, category, days').eq('slug', slug).single())) as Row;
      const days = (await run(
        sb.from('plan_days').select('day, readings, reflection_prompt').eq('plan_id', plan.id as string).order('day'),
      )) as Row[];
      return {
        id: plan.id as string,
        slug: plan.slug as string,
        title: plan.title as string,
        description: plan.description as string,
        category: plan.category as PlanCategory,
        days: Number(plan.days),
        schedule: days.map((d) => ({
          day: Number(d.day),
          readings: d.readings as string[],
          reflectionPrompt: (d.reflection_prompt as string | null) ?? null,
        })),
      };
    },

    async listEnrolments() {
      const rows = (await run(
        sb.from('plan_enrolments').select('id, plan_id, status, started_at, day_completions(day)').order('started_at'),
      )) as Row[];
      return rows.map(
        (r): Enrolment => ({
          id: r.id as string,
          planId: r.plan_id as string,
          status: r.status as Enrolment['status'],
          startedAt: r.started_at as string,
          completedDays: ((r.day_completions as Row[]) ?? []).map((c) => Number(c.day)).sort((a, b) => a - b),
        }),
      );
    },

    async startPlan(planId) {
      const r = (await run(sb.rpc('start_plan', { p_plan: planId }))) as Row;
      return { id: r.id as string, planId: r.plan_id as string, status: r.status as Enrolment['status'], startedAt: r.started_at as string, completedDays: [] };
    },

    async setPlanStatus(enrolmentId, action) {
      await run(sb.rpc('set_plan_status', { p_enrolment: enrolmentId, p_action: action }));
    },

    async completeReading(enrolmentId, day, reflection) {
      return mapComplete(
        (await run(sb.rpc('complete_reading', { p_enrolment: enrolmentId, p_day: day, p_reflection: reflection ?? null }))) as Row,
      );
    },

    async logFreeReading(book, chapter) {
      const r = (await run(sb.rpc('log_free_reading', { p_book: book, p_chapter: chapter }))) as Row;
      return mapComplete({ ...r, finished_plan: false });
    },

    async listBadges() {
      const rows = (await run(sb.from('user_badges').select('badge, earned_at').order('earned_at'))) as Row[];
      return rows.map((r) => ({ code: r.badge as BadgeCode, earnedAt: r.earned_at as string }));
    },

    async getChapterAnnotations(book, chapter) {
      const [h, b, n] = await Promise.all([
        run(sb.from('highlights').select('verse, color').eq('book', book).eq('chapter', chapter)),
        run(sb.from('bookmarks').select('*').eq('book', book).eq('chapter', chapter)),
        run(sb.from('notes').select('*').eq('book', book).eq('chapter', chapter).order('verse_start')),
      ]);
      const highlights: Record<number, HighlightColor> = {};
      for (const r of h as Row[]) highlights[Number(r.verse)] = r.color as HighlightColor;
      return { highlights, bookmarks: (b as Row[]).map(mapBookmark), notes: (n as Row[]).map(mapNote) };
    },

    async setHighlight(book, chapter, verses, color) {
      if (verses.length === 0) return;
      if (color === null) {
        await run(sb.from('highlights').delete().eq('book', book).eq('chapter', chapter).in('verse', verses));
      } else {
        const id = await uid();
        await run(
          sb
            .from('highlights')
            .upsert(verses.map((verse) => ({ user_id: id, book, chapter, verse, color })), { onConflict: 'user_id,book,chapter,verse' }),
        );
      }
    },

    async toggleBookmark(book, chapter, verse) {
      let query = sb.from('bookmarks').select('id').eq('book', book).eq('chapter', chapter);
      query = verse === null ? query.is('verse', null) : query.eq('verse', verse);
      const existing = (await run(query)) as Row[];
      if (existing.length > 0) {
        await run(sb.from('bookmarks').delete().eq('id', existing[0]!.id as string));
        return false;
      }
      await run(sb.from('bookmarks').insert({ book, chapter, verse }));
      return true;
    },

    async saveNote({ id, book, chapter, verseStart, verseEnd, body }) {
      const row = { book, chapter, verse_start: verseStart, verse_end: verseEnd, body };
      const saved = id
        ? await run(sb.from('notes').update(row).eq('id', id).select('*').single())
        : await run(sb.from('notes').insert(row).select('*').single());
      return mapNote(saved as Row);
    },

    async deleteNote(id) {
      await run(sb.from('notes').delete().eq('id', id));
    },

    async listSaved() {
      const [b, n] = await Promise.all([
        run(sb.from('bookmarks').select('*').order('created_at', { ascending: false })),
        run(sb.from('notes').select('*').order('updated_at', { ascending: false })),
      ]);
      return { bookmarks: (b as Row[]).map(mapBookmark), notes: (n as Row[]).map(mapNote) };
    },

    search: async (translation: TranslationId, query: string): Promise<SearchHit[]> => {
      const rows = (await run(sb.rpc('search_bible', { p_translation: translation, p_query: query, p_limit: 50 }))) as Row[];
      return rows.map((r) => ({ book: r.book as BookId, chapter: Number(r.chapter), verse: Number(r.verse), text: r.text as string }));
    },

    async exportData() {
      return run(sb.rpc('export_my_data'));
    },

    async deleteAccount() {
      await run(sb.rpc('delete_my_account'));
      // The account no longer exists on the server; just forget the session on this device.
      await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
    },

    // Social ---------------------------------------------------------------------------

    async getFeed(before) {
      return mapFeed((await run(sb.rpc('get_feed', { p_before: before ?? null, p_limit: 20 }))) as Row);
    },

    async getUserPosts(userId, before) {
      return mapFeed((await run(sb.rpc('get_user_posts', { p_user: userId, p_before: before ?? null, p_limit: 20 }))) as Row);
    },

    async getPost(id) {
      return mapPost((await run(sb.rpc('get_post', { p_post: id }))) as Row);
    },

    async createPost(input) {
      return mapPost(
        (await run(
          sb.rpc('create_post', {
            p_type: input.type,
            p_body: input.body,
            p_passage: input.passage ?? null,
            p_translation: input.translation ?? null,
            p_verse_text: input.verseText ?? null,
          }),
        )) as Row,
      );
    },

    async deletePost(id) {
      await run(sb.rpc('delete_post', { p_post: id }));
    },

    async setPostHidden(id, hidden) {
      await run(sb.rpc('set_post_hidden', { p_post: id, p_hidden: hidden }));
    },

    async react(postId, kind) {
      return mapPost((await run(sb.rpc('react', { p_post: postId, p_kind: kind }))) as Row);
    },

    async listComments(postId) {
      return ((await run(sb.rpc('get_comments', { p_post: postId }))) as Row[]).map(mapComment);
    },

    async addComment(postId, body) {
      return mapComment((await run(sb.rpc('add_comment', { p_post: postId, p_body: body }))) as Row);
    },

    async deleteComment(id) {
      await run(sb.rpc('delete_comment', { p_comment: id }));
    },

    async findPeople(query) {
      return ((await run(sb.rpc('find_people', { p_query: query }))) as Row[]).map((r) => ({
        ...mapPerson(r),
        visibility: r.visibility as Visibility,
        followStatus: r.follow_status as FollowState,
      }));
    },

    async getPublicProfile(ref) {
      const r = (await run(sb.rpc('get_profile', { p_user: ref.id ?? null, p_username: ref.username ?? null }))) as Row;
      const streak = r.streak as Row | undefined;
      return {
        ...mapPerson(r),
        visibility: r.visibility as Visibility,
        isMe: Boolean(r.is_me),
        canSee: Boolean(r.can_see),
        followStatus: r.follow_status as FollowState,
        followsYou: Boolean(r.follows_you),
        muted: Boolean(r.muted),
        followerCount: Number(r.follower_count),
        followingCount: Number(r.following_count),
        bio: r.bio as string | undefined,
        streak: streak ? { current: Number(streak.current), longest: Number(streak.longest) } : undefined,
        badges: r.badges as BadgeCode[] | undefined,
        plans: r.plans as PublicProfile['plans'],
      };
    },

    async follow(userId) {
      return (await run(sb.rpc('follow_user', { p_target: userId }))) as FollowState;
    },

    async unfollow(userId) {
      await run(sb.rpc('unfollow_user', { p_target: userId }));
    },

    async respondToFollow(userId, accept) {
      await run(sb.rpc('respond_follow_request', { p_follower: userId, p_accept: accept }));
    },

    async removeFollower(userId) {
      await run(sb.rpc('remove_follower', { p_follower: userId }));
    },

    async listConnections(kind) {
      return ((await run(sb.rpc('list_connections', { p_kind: kind }))) as Row[]).map(mapPerson);
    },

    async block(userId) {
      await run(sb.rpc('block_user', { p_target: userId }));
    },

    async unblock(userId) {
      await run(sb.rpc('unblock_user', { p_target: userId }));
    },

    async listBlocked() {
      return ((await run(sb.rpc('list_blocked'))) as Row[]).map(mapPerson);
    },

    async setMuted(userId, muted) {
      await run(sb.rpc('set_muted', { p_target: userId, p_muted: muted }));
    },

    async report(target, targetId, reason, details) {
      await run(sb.rpc('report_content', { p_target_type: target, p_target: targetId, p_reason: reason, p_details: details }));
    },

    async listNotifications() {
      return ((await run(sb.rpc('my_notifications', { p_limit: 50 }))) as Row[]).map(
        (r): AppNotification => ({
          id: String(r.id),
          kind: r.kind as AppNotification['kind'],
          createdAt: r.created_at as string,
          read: Boolean(r.read),
          actor: mapPerson(r.actor as Row),
          post: r.post ? { id: (r.post as Row).id as string, type: (r.post as Row).type as PostType, passage: ((r.post as Row).passage as string | null) ?? null, body: ((r.post as Row).body as string) ?? '' } : null,
        }),
      );
    },

    async markNotificationsRead() {
      await run(sb.rpc('mark_notifications_read'));
    },

    subscribe(topic, onChange) {
      let channel: ReturnType<SupabaseClient['channel']> | null = null;
      let stopped = false;
      (async () => {
        if (topic.kind === 'post') {
          const filter = `post_id=eq.${topic.postId}`;
          channel = sb
            .channel(`post:${topic.postId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter }, onChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter }, onChange);
        } else {
          const id = await uid().catch(() => null);
          if (!id || stopped) return;
          channel = sb
            .channel(`notifications:${id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${id}` }, onChange);
        }
        if (stopped) return;
        channel.subscribe();
      })();
      return () => {
        stopped = true;
        if (channel) sb.removeChannel(channel).catch(() => undefined);
      };
    },

    async adminReports(status) {
      return ((await run(sb.rpc('admin_reports', { p_status: status }))) as Row[]).map((r): ModerationItem => {
        const preview = (r.preview as Row | null) ?? {};
        return {
          targetType: r.target_type as ReportTarget,
          targetId: r.target_id as string,
          reportCount: Number(r.report_count),
          reasons: (r.reasons as ReportReason[]) ?? [],
          details: (r.details as string[]) ?? [],
          firstReportedAt: r.first_reported_at as string,
          preview: {
            body: (preview.body as string | null) ?? null,
            verseText: (preview.verse_text as string | null) ?? null,
            removed: Boolean(preview.removed),
            suspendedUntil: (preview.suspended_until as string | null) ?? null,
            author: preview.author ? mapPerson(preview.author as Row) : null,
          },
        };
      });
    },

    async adminResolve(target, targetId, action, note) {
      await run(sb.rpc('admin_resolve', { p_target_type: target, p_target: targetId, p_action: action, p_note: note ?? null }));
    },

    async adminUnsuspend(userId) {
      await run(sb.rpc('admin_unsuspend', { p_user: userId }));
    },
  };
}
