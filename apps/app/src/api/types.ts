import type {
  BadgeCode,
  GroupAccess,
  GroupKind,
  GroupPlanStatus,
  GroupRole,
  LocalDate,
  MemberToday,
  Visibility as CoreVisibility,
} from '@bible-app/core';
export type { GroupAccess, GroupKind, GroupPlanStatus, GroupRole, MemberToday };
import type { BookId, SearchHit, TranslationId } from '@bible-app/bible';
import type { ReadingPrefs } from '../theme/tokens';

export type Visibility = CoreVisibility;
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
  shareMilestones: boolean;
  isAdmin: boolean;
}

export type ProfilePatch = Partial<
  Pick<Profile, 'username' | 'displayName' | 'bio' | 'visibility' | 'timezone' | 'translation' | 'readingPrefs' | 'onboarded' | 'shareMilestones'>
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

// Social ---------------------------------------------------------------------------------

export type PostType = 'verse' | 'reflection' | 'prayer' | 'milestone';
export type ReactionKind = 'amen' | 'praying' | 'encouraged';
export const REACTION_KINDS: ReactionKind[] = ['amen', 'praying', 'encouraged'];
export type FollowState = 'none' | 'pending' | 'accepted';

export interface Person {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export type Milestone =
  | { kind: 'badge'; code: BadgeCode }
  | { kind: 'plan'; slug: string; title: string; days: number };

export interface Post {
  id: string;
  type: PostType;
  passage: string | null;
  translation: TranslationId | null;
  verseText: string | null;
  body: string;
  milestone: Milestone | null;
  hidden: boolean;
  createdAt: string;
  isMine: boolean;
  author: Person;
  reactions: Record<ReactionKind, number>;
  myReaction: ReactionKind | null;
  commentCount: number;
  /** Set for posts shared in a group (only its members see them). */
  group: { id: string; name: string } | null;
  /** Set for replies in a group plan day's thread. */
  groupDay: number | null;
  pinned: boolean;
  /** The viewer is an admin of the post's group (may pin and remove). */
  canModerate: boolean;
}

export interface NewPost {
  type: 'verse' | 'reflection' | 'prayer';
  body: string;
  passage?: string;
  translation?: TranslationId;
  verseText?: string;
  groupId?: string;
  /** A reply in the group plan's thread for this day (type 'reflection'; the passage is the day's reading). */
  groupDay?: number;
}

export interface FeedPage {
  items: Post[];
  /** True when there is nothing older to load: the feed has ended. */
  caughtUp: boolean;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  canRemove: boolean;
  author: Person;
}

export interface PersonResult extends Person {
  visibility: Visibility;
  followStatus: FollowState;
}

export interface PublicProfile extends Person {
  visibility: Visibility;
  isMe: boolean;
  canSee: boolean;
  followStatus: FollowState;
  followsYou: boolean;
  muted: boolean;
  followerCount: number;
  followingCount: number;
  bio?: string;
  streak?: { current: number; longest: number };
  badges?: BadgeCode[];
  plans?: Array<{ title: string; days: number; completed: number }>;
}

export type NotificationKind = 'comment' | 'reaction' | 'follow' | 'follow_request' | 'follow_accepted' | 'nudge';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  createdAt: string;
  read: boolean;
  actor: Person;
  post: { id: string; type: PostType; passage: string | null; body: string } | null;
  group: { id: string; name: string } | null;
}

export type ReportTarget = 'post' | 'comment' | 'user';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'false_info' | 'other';
export const REPORT_REASONS: ReportReason[] = ['spam', 'harassment', 'inappropriate', 'false_info', 'other'];
export type ModerationAction = 'dismiss' | 'remove' | 'suspend_7d' | 'suspend_30d' | 'suspend_indefinitely';

export interface ModerationItem {
  targetType: ReportTarget;
  targetId: string;
  reportCount: number;
  reasons: ReportReason[];
  details: string[];
  firstReportedAt: string;
  preview: { body: string | null; verseText?: string | null; removed?: boolean; suspendedUntil?: string | null; author: Person | null };
}

export type RealtimeTopic = { kind: 'post'; postId: string } | { kind: 'notifications' } | { kind: 'group'; groupId: string };

export interface GroupPlanInfo {
  id: string;
  slug: string;
  title: string;
  days: number;
  start: LocalDate;
  status: GroupPlanStatus;
  /** Today's group day (null before the start and after the end). */
  day: number | null;
  readings: string[] | null;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  kind: GroupKind;
  access: GroupAccess;
  createdAt: string;
  memberCount: number;
  /** Null when the viewer isn't a member (a preview). */
  myRole: GroupRole | null;
  inviteCode: string | null;
  plan: GroupPlanInfo | null;
  readersToday: number;
  streak: number;
  myToday: MemberToday | null;
}

export interface GroupInput {
  name: string;
  description: string;
  kind: GroupKind;
  access: GroupAccess;
}

export interface GroupMember extends Person {
  role: GroupRole;
  joinedAt: string;
  today: MemberToday;
  isMe: boolean;
  canNudge: boolean;
}

export interface GroupPostsPage extends FeedPage {
  /** Only on the first page. */
  pinned: Post[];
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

  // Social
  getFeed(before?: string): Promise<FeedPage>;
  getUserPosts(userId: string, before?: string): Promise<FeedPage>;
  getPost(id: string): Promise<Post>;
  createPost(input: NewPost): Promise<Post>;
  deletePost(id: string): Promise<void>;
  setPostHidden(id: string, hidden: boolean): Promise<void>;
  react(postId: string, kind: ReactionKind | null): Promise<Post>;
  listComments(postId: string): Promise<Comment[]>;
  addComment(postId: string, body: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;

  findPeople(query: string): Promise<PersonResult[]>;
  getPublicProfile(ref: { id?: string; username?: string }): Promise<PublicProfile>;
  follow(userId: string): Promise<FollowState>;
  unfollow(userId: string): Promise<void>;
  respondToFollow(userId: string, accept: boolean): Promise<void>;
  removeFollower(userId: string): Promise<void>;
  listConnections(kind: 'followers' | 'following' | 'requests'): Promise<Person[]>;
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  listBlocked(): Promise<Person[]>;
  setMuted(userId: string, muted: boolean): Promise<void>;
  report(target: ReportTarget, targetId: string, reason: ReportReason, details: string): Promise<void>;

  listNotifications(): Promise<AppNotification[]>;
  markNotificationsRead(): Promise<void>;
  /** Live updates (new comments, reactions, notifications). Returns a function that stops them. */
  subscribe(topic: RealtimeTopic, onChange: () => void): () => void;

  adminReports(status: 'open' | 'actioned' | 'dismissed'): Promise<ModerationItem[]>;
  adminResolve(target: ReportTarget, targetId: string, action: ModerationAction, note?: string): Promise<void>;
  adminUnsuspend(userId: string): Promise<void>;

  // Groups
  listMyGroups(): Promise<Group[]>;
  findGroups(query: string): Promise<Group[]>;
  getGroup(id: string): Promise<Group>;
  getGroupByInvite(code: string): Promise<Group>;
  createGroup(input: GroupInput & { planId?: string; planStart?: LocalDate }): Promise<Group>;
  updateGroup(id: string, input: GroupInput): Promise<Group>;
  setGroupPlan(id: string, planId: string | null, start: LocalDate | null): Promise<Group>;
  resetGroupInvite(id: string): Promise<string>;
  deleteGroup(id: string): Promise<void>;
  joinGroup(ref: { id?: string; code?: string }): Promise<Group>;
  leaveGroup(id: string): Promise<void>;
  listGroupMembers(id: string): Promise<GroupMember[]>;
  setMemberRole(groupId: string, userId: string, role: 'admin' | 'member'): Promise<void>;
  transferGroup(groupId: string, userId: string): Promise<void>;
  removeGroupMember(groupId: string, userId: string): Promise<void>;
  nudgeMember(groupId: string, userId: string): Promise<void>;
  getGroupPosts(id: string, before?: string): Promise<GroupPostsPage>;
  getGroupDay(id: string, day: number): Promise<Post[]>;
  pinGroupPost(postId: string, pinned: boolean): Promise<void>;
  removeGroupPost(postId: string): Promise<void>;
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
