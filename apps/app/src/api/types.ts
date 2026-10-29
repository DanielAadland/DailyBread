import type { BadgeCode, LocalDate } from '@bible-app/core';
import type { BookId, SearchHit, TranslationId } from '@bible-app/bible';
import type { ReadingPrefs } from '../theme/tokens';

export type Visibility = 'public' | 'friends' | 'private';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

export interface Session {
  userId: string;
  email: string | null;
}

export interface Profile {
  id: string;
  username: string | null;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  visibility: Visibility;
  timezone: string;
  translation: TranslationId;
  readingPrefs: Partial<ReadingPrefs>;
  onboarded: boolean;
}

export type ProfilePatch = Partial<
  Pick<Profile, 'username' | 'displayName' | 'bio' | 'visibility' | 'timezone' | 'translation' | 'readingPrefs' | 'onboarded'>
>;

export interface NotificationPrefs {
  remindersEnabled: boolean;
  /** "HH:MM", on 15-minute steps. */
  reminderTime: string;
  quietStart: string | null;
  quietEnd: string | null;
  dailyCap: number;
  socialComments: boolean;
  socialReactions: boolean;
  socialNudges: boolean;
  socialGroupActivity: boolean;
}

export interface StreakSummary {
  current: number;
  longest: number;
  freezesLeft: number;
  readToday: boolean;
}

export type DayState = 'read' | 'freeze' | 'none';

export interface TodayPlan {
  enrolmentId: string;
  planId: string;
  slug: string;
  title: string;
  days: number;
  completed: number;
  completedToday: boolean;
  nextDay: number | null;
  readings: string[];
  reflectionPrompt: string | null;
}

export interface TodayData {
  localDate: LocalDate;
  streak: StreakSummary;
  daysReadLast7: number;
  /** Last 7 days, oldest first; the last entry is today. */
  week: DayState[];
  plans: TodayPlan[];
}

export type PlanCategory = 'whole_bible' | 'new_testament' | 'old_testament' | 'book' | 'topical';

export interface PlanSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: PlanCategory;
  days: number;
}

export interface PlanDay {
  day: number;
  readings: string[];
  reflectionPrompt: string | null;
}

export interface PlanDetail extends PlanSummary {
  schedule: PlanDay[];
}

export type EnrolmentStatus = 'active' | 'paused' | 'finished';

export interface Enrolment {
  id: string;
  planId: string;
  status: EnrolmentStatus;
  startedAt: string;
  completedDays: number[];
}

export interface CompleteResult {
  streak: StreakSummary & { counted: boolean; earnedFreeze: boolean };
  finishedPlan: boolean;
  newBadges: BadgeCode[];
}

export interface Note {
  id: string;
  book: BookId;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  body: string;
  updatedAt: string;
}

export interface Bookmark {
  id: string;
  book: BookId;
  chapter: number;
  verse: number | null;
  createdAt: string;
}

export interface ChapterAnnotations {
  highlights: Record<number, HighlightColor>;
  bookmarks: Bookmark[];
  notes: Note[];
}

export interface EarnedBadge {
  code: BadgeCode;
  earnedAt: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface AuthApi {
  getSession(): Promise<Session | null>;
  onChange(callback: (session: Session | null) => void): () => void;
  signUp(input: { email: string; password: string; displayName: string; timezone: string }): Promise<{ needsConfirmation: boolean }>;
  signIn(input: { email: string; password: string }): Promise<void>;
  signInWithGoogle(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}

/**
 * Everything the app needs from a backend. Implemented by Supabase (production) and by a
 * local demo backend that keeps data in the browser, so the app runs before Supabase is set up.
 */
export interface Backend {
  readonly kind: 'supabase' | 'demo';
  readonly auth: AuthApi;

  getProfile(): Promise<Profile>;
  updateProfile(patch: ProfilePatch): Promise<Profile>;
  getNotificationPrefs(): Promise<NotificationPrefs>;
  updateNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<NotificationPrefs>;
  savePushSubscription(sub: PushSubscriptionInput): Promise<void>;

  getToday(): Promise<TodayData>;
  listPlans(): Promise<PlanSummary[]>;
  getPlan(slug: string): Promise<PlanDetail>;
  listEnrolments(): Promise<Enrolment[]>;
  startPlan(planId: string): Promise<Enrolment>;
  setPlanStatus(enrolmentId: string, action: 'pause' | 'resume' | 'restart'): Promise<void>;
  completeReading(enrolmentId: string, day: number, reflection?: string): Promise<CompleteResult>;
  logFreeReading(book: BookId, chapter: number): Promise<CompleteResult>;
  listBadges(): Promise<EarnedBadge[]>;

  getChapterAnnotations(book: BookId, chapter: number): Promise<ChapterAnnotations>;
  setHighlight(book: BookId, chapter: number, verses: number[], color: HighlightColor | null): Promise<void>;
  toggleBookmark(book: BookId, chapter: number, verse: number | null): Promise<boolean>;
  saveNote(input: { id?: string; book: BookId; chapter: number; verseStart: number; verseEnd: number; body: string }): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  listSaved(): Promise<{ bookmarks: Bookmark[]; notes: Note[] }>;

  /** Null when this backend has no search (demo mode). */
  search: ((translation: TranslationId, query: string) => Promise<SearchHit[]>) | null;

  exportData(): Promise<unknown>;
  deleteAccount(): Promise<void>;
}

/** Errors the UI knows how to explain; `code` maps to `errors.<code>` in the translation files. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}
