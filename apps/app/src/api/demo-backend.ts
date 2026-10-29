/**
 * Demo backend: the whole app working without a server. Data lives in this browser (AsyncStorage),
 * and the rules come from @bible-app/core, the same rules the SQL functions implement.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDays,
  canCompleteDay,
  initialStreak,
  localDate,
  newBadges,
  planProgress,
  recordRead,
  settleStreak,
  type BadgeCode,
  type LocalDate,
  type StreakState,
} from '@bible-app/core';
import { BOOKS, fromKey, isValidRange, type BookId } from '@bible-app/bible';
import {
  AppError,
  type Backend,
  type Bookmark,
  type CompleteResult,
  type DayState,
  type Enrolment,
  type HighlightColor,
  type Note,
  type NotificationPrefs,
  type PlanDetail,
  type Profile,
  type Session,
} from './types';

const KEY = 'dailybread.demo.v1';

interface DemoEnrolment {
  id: string;
  planId: string;
  status: Enrolment['status'];
  startedAt: string;
  completed: Record<number, { localDate: LocalDate; reflection: string | null }>;
  timesFinished: number;
}

interface DemoState {
  session: Session | null;
  profile: Profile | null;
  prefs: NotificationPrefs;
  streak: StreakState;
  activity: Record<LocalDate, 'plan' | 'free' | 'freeze'>;
  enrolments: DemoEnrolment[];
  highlights: Record<string, HighlightColor>;
  bookmarks: Bookmark[];
  notes: Note[];
  chapterReads: string[];
  badges: Array<{ code: BadgeCode; earnedAt: string }>;
}

const DEFAULT_PREFS: NotificationPrefs = {
  remindersEnabled: true,
  reminderTime: '08:00',
  quietStart: '22:00',
  quietEnd: '07:00',
  dailyCap: 3,
  socialComments: true,
  socialReactions: false,
  socialNudges: true,
  socialGroupActivity: true,
};

function emptyState(): DemoState {
  return {
    session: null,
    profile: null,
    prefs: DEFAULT_PREFS,
    streak: initialStreak(),
    activity: {},
    enrolments: [],
    highlights: {},
    bookmarks: [],
    notes: [],
    chapterReads: [],
    badges: [],
  };
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

export function createDemoBackend(assetBaseUrl: string): Backend {
  let state: DemoState | null = null;
  const listeners = new Set<(s: Session | null) => void>();
  let plansCache: Promise<PlanDetail[]> | null = null;

  async function load(): Promise<DemoState> {
    if (state) return state;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      state = raw ? { ...emptyState(), ...(JSON.parse(raw) as DemoState) } : emptyState();
    } catch {
      state = emptyState();
    }
    return state;
  }

  async function save(): Promise<void> {
    if (state) await AsyncStorage.setItem(KEY, JSON.stringify(state));
  }

  async function signedIn(): Promise<DemoState & { profile: Profile }> {
    const s = await load();
    if (!s.session || !s.profile) throw new AppError('not_authenticated');
    return s as DemoState & { profile: Profile };
  }

  const today = (s: DemoState) => localDate(new Date(), s.profile?.timezone ?? 'UTC');

  /** Settle the streak and record freeze days, like public.settle_streak. */
  function settle(s: DemoState): void {
    const result = settleStreak(s.streak, today(s));
    s.streak = result.state;
    for (const d of result.freezeDates) s.activity[d] ??= 'freeze';
  }

  function plans(): Promise<PlanDetail[]> {
    plansCache ??= fetch(`${assetBaseUrl}/demo/plans.json`)
      .then((r) => {
        if (!r.ok) throw new AppError('network');
        return r.json() as Promise<
          Array<{ id: string; slug: string; title: string; description: string; category: PlanDetail['category']; days: PlanDetail['schedule'] }>
        >;
      })
      .then((list) => list.map((p) => ({ ...p, days: p.days.length, schedule: p.days })))
      .catch((err: unknown) => {
        plansCache = null;
        throw err;
      });
    return plansCache;
  }

  function awardBadges(s: DemoState): BadgeCode[] {
    const daysRead = Object.values(s.activity).filter((a) => a !== 'freeze').length;
    const booksCompleted = BOOKS.filter((b) => {
      for (let c = 1; c <= b.chapters; c++) if (!s.chapterReads.includes(`${b.id}.${c}`)) return false;
      return true;
    }).length;
    const plansFinished = s.enrolments.reduce((n, e) => n + e.timesFinished, 0);
    const earned = newBadges(
      { daysRead, longestStreak: s.streak.longest, plansFinished, booksCompleted },
      s.badges.map((b) => b.code),
    );
    const now = new Date().toISOString();
    for (const code of earned) s.badges.push({ code, earnedAt: now });
    return earned;
  }

  function read(s: DemoState, source: 'plan' | 'free'): CompleteResult['streak'] {
    settle(s);
    const day = today(s);
    const result = recordRead(s.streak, day);
    s.streak = result.state;
    if (result.counted) s.activity[day] = source;
    return {
      current: s.streak.current,
      longest: s.streak.longest,
      freezesLeft: s.streak.freezesLeft,
      readToday: true,
      counted: result.counted,
      earnedFreeze: result.earnedFreeze,
    };
  }

  function toEnrolment(e: DemoEnrolment): Enrolment {
    return {
      id: e.id,
      planId: e.planId,
      status: e.status,
      startedAt: e.startedAt,
      completedDays: Object.keys(e.completed).map(Number).sort((a, b) => a - b),
    };
  }

  const emit = (session: Session | null) => listeners.forEach((l) => l(session));

  async function startDemoAccount(email: string, displayName: string, timezone: string): Promise<void> {
    const s = await load();
    Object.assign(s, emptyState());
    const id = newId();
    s.session = { userId: id, email };
    s.profile = {
      id,
      username: null,
      displayName: displayName.slice(0, 50),
      bio: '',
      avatarUrl: null,
      visibility: 'friends',
      timezone,
      translation: 'bsb',
      readingPrefs: {},
      onboarded: false,
    };
    await save();
    emit(s.session);
  }

  return {
    kind: 'demo',

    auth: {
      async getSession() {
        return (await load()).session;
      },
      onChange(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      async signUp({ email, displayName, timezone }) {
        await startDemoAccount(email, displayName, timezone);
        return { needsConfirmation: false };
      },
      async signIn({ email }) {
        const s = await load();
        if (!s.profile) {
          // First visit in this browser: start a fresh demo account.
          await startDemoAccount(email, '', Intl.DateTimeFormat().resolvedOptions().timeZone);
          return;
        }
        s.session = { userId: s.profile.id, email };
        await save();
        emit(s.session);
      },
      async signInWithGoogle() {
        throw new AppError('demo_unavailable');
      },
      async sendPasswordReset() {
        throw new AppError('demo_unavailable');
      },
      async updatePassword() {
        throw new AppError('demo_unavailable');
      },
      async signOut() {
        const s = await load();
        s.session = null;
        await save();
        emit(null);
      },
    },

    async getProfile() {
      return (await signedIn()).profile;
    },

    async updateProfile(patch) {
      const s = await signedIn();
      if (patch.username && !/^[a-z0-9_]{3,24}$/.test(patch.username)) throw new AppError('invalid_username');
      s.profile = { ...s.profile, ...patch };
      await save();
      return s.profile;
    },

    async getNotificationPrefs() {
      return (await signedIn()).prefs;
    },

    async updateNotificationPrefs(patch) {
      const s = await signedIn();
      s.prefs = { ...s.prefs, ...patch };
      await save();
      return s.prefs;
    },

    async savePushSubscription() {
      // Demo mode cannot send push messages.
    },

    async getToday() {
      const s = await signedIn();
      settle(s);
      await save();
      const day = today(s);
      const all = await plans();
      const week: DayState[] = [];
      for (let i = 6; i >= 0; i--) {
        const a = s.activity[addDays(day, -i)];
        week.push(a === undefined ? 'none' : a === 'freeze' ? 'freeze' : 'read');
      }
      return {
        localDate: day,
        streak: {
          current: s.streak.current,
          longest: s.streak.longest,
          freezesLeft: s.streak.freezesLeft,
          readToday: s.streak.lastReadDate === day,
        },
        daysReadLast7: week.filter((w) => w === 'read').length,
        week,
        plans: s.enrolments
          .filter((e) => e.status === 'active')
          .flatMap((e) => {
            const plan = all.find((p) => p.id === e.planId);
            if (!plan) return [];
            const progress = planProgress(plan.days, Object.keys(e.completed).map(Number));
            const next = progress.nextDay === null ? undefined : plan.schedule[progress.nextDay - 1];
            return [
              {
                enrolmentId: e.id,
                planId: plan.id,
                slug: plan.slug,
                title: plan.title,
                days: plan.days,
                completed: progress.completedDays,
                completedToday: Object.values(e.completed).some((c) => c.localDate === day),
                nextDay: progress.nextDay,
                readings: next?.readings ?? [],
                reflectionPrompt: next?.reflectionPrompt ?? null,
              },
            ];
          }),
      };
    },

    async listPlans() {
      return (await plans()).map(({ schedule: _schedule, ...summary }) => summary);
    },

    async getPlan(slug) {
      const plan = (await plans()).find((p) => p.slug === slug);
      if (!plan) throw new AppError('plan_not_found');
      return plan;
    },

    async listEnrolments() {
      return (await signedIn()).enrolments.map(toEnrolment);
    },

    async startPlan(planId) {
      const s = await signedIn();
      let e = s.enrolments.find((x) => x.planId === planId);
      if (!e) {
        e = { id: newId(), planId, status: 'active', startedAt: new Date().toISOString(), completed: {}, timesFinished: 0 };
        s.enrolments.push(e);
      } else if (e.status === 'paused') {
        e.status = 'active';
      }
      await save();
      return toEnrolment(e);
    },

    async setPlanStatus(enrolmentId, action) {
      const s = await signedIn();
      const e = s.enrolments.find((x) => x.id === enrolmentId);
      if (!e) throw new AppError('enrolment_not_found');
      if (action === 'pause' && e.status === 'active') e.status = 'paused';
      else if (action === 'resume' && e.status === 'paused') e.status = 'active';
      else if (action === 'restart') {
        e.status = 'active';
        e.completed = {};
        e.startedAt = new Date().toISOString();
      } else throw new AppError('invalid_transition');
      await save();
    },

    async completeReading(enrolmentId, day, reflection) {
      const s = await signedIn();
      const e = s.enrolments.find((x) => x.id === enrolmentId);
      if (!e) throw new AppError('enrolment_not_found');
      const plan = (await plans()).find((p) => p.id === e.planId);
      if (!plan) throw new AppError('plan_not_found');
      const check = canCompleteDay(e.status, day, plan.days, Object.keys(e.completed).map(Number));
      if (!check.ok) {
        throw new AppError(
          check.reason === 'paused' ? 'plan_paused' : check.reason === 'finished' ? 'plan_finished' : check.reason === 'already_completed' ? 'day_already_completed' : 'day_out_of_range',
        );
      }
      const note = reflection?.trim() || null;
      if (note && note.length > 2000) throw new AppError('reflection_too_long');

      e.completed[day] = { localDate: today(s), reflection: note };
      for (const key of plan.schedule[day - 1]?.readings ?? []) {
        const range = fromKey(key);
        if (range && range.startVerse === undefined && range.endVerse === undefined) {
          for (let c = range.startChapter; c <= range.endChapter; c++) {
            if (!s.chapterReads.includes(`${range.book}.${c}`)) s.chapterReads.push(`${range.book}.${c}`);
          }
        }
      }
      const streak = read(s, 'plan');
      if (check.finishesPlan) {
        e.status = 'finished';
        e.timesFinished += 1;
      }
      const badges = awardBadges(s);
      await save();
      return { streak, finishedPlan: check.finishesPlan, newBadges: badges };
    },

    async logFreeReading(book, chapter) {
      const s = await signedIn();
      if (!isValidRange({ book, startChapter: chapter, endChapter: chapter })) throw new AppError('invalid_chapter');
      if (!s.chapterReads.includes(`${book}.${chapter}`)) s.chapterReads.push(`${book}.${chapter}`);
      const streak = read(s, 'free');
      const badges = awardBadges(s);
      await save();
      return { streak, finishedPlan: false, newBadges: badges };
    },

    async listBadges() {
      return (await signedIn()).badges;
    },

    async getChapterAnnotations(book, chapter) {
      const s = await signedIn();
      const highlights: Record<number, HighlightColor> = {};
      for (const [key, color] of Object.entries(s.highlights)) {
        const [b, c, v] = key.split('.');
        if (b === book && Number(c) === chapter) highlights[Number(v)] = color;
      }
      return {
        highlights,
        bookmarks: s.bookmarks.filter((b) => b.book === book && b.chapter === chapter),
        notes: s.notes.filter((n) => n.book === book && n.chapter === chapter).sort((a, b) => a.verseStart - b.verseStart),
      };
    },

    async setHighlight(book, chapter, verses, color) {
      const s = await signedIn();
      for (const v of verses) {
        const key = `${book}.${chapter}.${v}`;
        if (color === null) delete s.highlights[key];
        else s.highlights[key] = color;
      }
      await save();
    },

    async toggleBookmark(book, chapter, verse) {
      const s = await signedIn();
      const i = s.bookmarks.findIndex((b) => b.book === book && b.chapter === chapter && b.verse === verse);
      if (i >= 0) {
        s.bookmarks.splice(i, 1);
        await save();
        return false;
      }
      s.bookmarks.unshift({ id: newId(), book, chapter, verse, createdAt: new Date().toISOString() });
      await save();
      return true;
    },

    async saveNote({ id, book, chapter, verseStart, verseEnd, body }) {
      const s = await signedIn();
      const text = body.trim();
      if (text.length < 1 || text.length > 5000) throw new AppError('note_length');
      const now = new Date().toISOString();
      const existing = id ? s.notes.find((n) => n.id === id) : undefined;
      const note: Note = { id: existing?.id ?? newId(), book: book as BookId, chapter, verseStart, verseEnd, body: text, updatedAt: now };
      s.notes = [note, ...s.notes.filter((n) => n.id !== note.id)];
      await save();
      return note;
    },

    async deleteNote(id) {
      const s = await signedIn();
      s.notes = s.notes.filter((n) => n.id !== id);
      await save();
    },

    async listSaved() {
      const s = await signedIn();
      return { bookmarks: s.bookmarks, notes: s.notes };
    },

    search: null,

    async exportData() {
      const s = await signedIn();
      const { session: _session, ...data } = s;
      return { exported_at: new Date().toISOString(), ...data };
    },

    async deleteAccount() {
      state = emptyState();
      await AsyncStorage.removeItem(KEY);
      emit(null);
    },
  };
}
