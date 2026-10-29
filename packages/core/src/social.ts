/**
 * Social rules: who can see whom, what can be posted, how often, and how far back the feed goes.
 * Mirrored in SQL (public.can_see_user, public.check_content, rate limits in the post functions).
 */

export const SOCIAL_LIMITS = {
  postMax: 2000,
  commentMax: 1000,
  reportDetailsMax: 500,
  postsPerDay: 10,
  commentsPerHour: 20,
  reportsPerDay: 20,
  /** The feed shows this many days back, then ends ("You're all caught up"). */
  feedWindowDays: 14,
  feedPageSize: 20,
} as const;

export const REACTIONS = ['amen', 'praying', 'encouraged'] as const;
export type ReactionKind = (typeof REACTIONS)[number];

export const POST_TYPES = ['verse', 'reflection', 'prayer', 'milestone'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'false_info', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// ---------------------------------------------------------------------------------------------
// Visibility

export type Visibility = 'public' | 'friends' | 'private';
export type FollowState = 'none' | 'pending' | 'accepted';

export interface Relationship {
  isSelf: boolean;
  /** Either person has blocked the other. */
  blocked: boolean;
  /** Does the viewer follow the owner? */
  follows: FollowState;
  ownerSuspended: boolean;
}

/**
 * Whether the viewer may see the owner's profile details and posts.
 * Public: everyone signed in. Friends: approved followers. Private: nobody else.
 * Blocking hides both people from each other; suspended users are hidden from everyone else.
 */
export function canSee(visibility: Visibility, rel: Relationship): boolean {
  if (rel.isSelf) return true;
  if (rel.blocked || rel.ownerSuspended) return false;
  if (visibility === 'public') return true;
  if (visibility === 'friends') return rel.follows === 'accepted';
  return false;
}

/** What happens when someone asks to follow a profile with this visibility. */
export function followOutcome(visibility: Visibility): 'accepted' | 'pending' | 'not_allowed' {
  if (visibility === 'public') return 'accepted';
  if (visibility === 'friends') return 'pending';
  return 'not_allowed';
}

// ---------------------------------------------------------------------------------------------
// Content filter

/**
 * Basic English profanity list. Entries ending in "*" also match longer words starting with them.
 * Admins extend it at runtime through the blocked_terms table.
 */
export const BLOCKED_TERMS: readonly string[] = [
  'fuck*',
  'motherfuck*',
  'shit',
  'shits',
  'shitty',
  'bullshit',
  'bitch*',
  'bastard*',
  'asshole*',
  'cunt*',
  'dick',
  'dicks',
  'dickhead*',
  'slut*',
  'whore*',
  'twat*',
  'wanker*',
  'piss off',
];

/** Web addresses, including bare domains ("example.com"). Bible references like "John 3.16" don't match. */
const LINK_RE =
  /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(?:com|net|org|io|ch|de|it|fr|uk|co|me|ly|gg|xyz|app|dev|info|biz|tv|link|site|online|shop|ru|cn)\b)/i;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

function normalize(text: string): string {
  return text.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] ?? c);
}

function termPattern(term: string): RegExp {
  const prefix = term.endsWith('*');
  const word = (prefix ? term.slice(0, -1) : term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?:^|[^a-z])${word}${prefix ? '' : '(?![a-z])'}`);
}

export type ContentProblem = 'empty' | 'too_long' | 'links_not_allowed' | 'content_blocked';

export function checkContent(
  text: string,
  options: { maxLength: number; blockedTerms?: readonly string[]; allowEmpty?: boolean },
): ContentProblem | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return options.allowEmpty ? null : 'empty';
  if (trimmed.length > options.maxLength) return 'too_long';
  if (LINK_RE.test(trimmed)) return 'links_not_allowed';
  const normalized = normalize(trimmed);
  for (const term of options.blockedTerms ?? BLOCKED_TERMS) {
    if (termPattern(term).test(normalized)) return 'content_blocked';
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Rate limits and the feed window

/** True when fewer than `max` events happened in the window ending at `now`. */
export function withinRateLimit(timestamps: readonly Date[], now: Date, windowMs: number, max: number): boolean {
  const from = now.getTime() - windowMs;
  return timestamps.filter((t) => t.getTime() > from && t.getTime() <= now.getTime()).length < max;
}

export function feedCutoff(now: Date): Date {
  return new Date(now.getTime() - SOCIAL_LIMITS.feedWindowDays * 86_400_000);
}

/** Usernames: 3–24 lowercase letters, digits or underscores. */
export function isValidUsername(value: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(value);
}
