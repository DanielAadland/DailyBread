import { describe, expect, it } from 'vitest';
import { canSee, checkContent, feedCutoff, followOutcome, isValidUsername, SOCIAL_LIMITS, withinRateLimit, type Relationship } from './social';

const stranger: Relationship = { isSelf: false, blocked: false, follows: 'none', ownerSuspended: false };

describe('canSee', () => {
  it('always shows people their own profile', () => {
    expect(canSee('private', { ...stranger, isSelf: true })).toBe(true);
  });

  it('applies public, friends-only and private', () => {
    expect(canSee('public', stranger)).toBe(true);
    expect(canSee('friends', stranger)).toBe(false);
    expect(canSee('friends', { ...stranger, follows: 'pending' })).toBe(false);
    expect(canSee('friends', { ...stranger, follows: 'accepted' })).toBe(true);
    expect(canSee('private', { ...stranger, follows: 'accepted' })).toBe(false);
  });

  it('hides blocked and suspended people even on public profiles', () => {
    expect(canSee('public', { ...stranger, blocked: true })).toBe(false);
    expect(canSee('public', { ...stranger, ownerSuspended: true })).toBe(false);
  });
});

describe('followOutcome', () => {
  it('follows public profiles at once, asks friends-only, refuses private', () => {
    expect(followOutcome('public')).toBe('accepted');
    expect(followOutcome('friends')).toBe('pending');
    expect(followOutcome('private')).toBe('not_allowed');
  });
});

describe('checkContent', () => {
  const opts = { maxLength: 100 };

  it('accepts ordinary posts and Bible references', () => {
    expect(checkContent('Praying for my exams this week. John 3.16 is on my mind.', opts)).toBeNull();
    expect(checkContent('Assessment day, Scunthorpe, Dickens and a cocktail.', opts)).toBeNull();
  });

  it('rejects empty and too-long text', () => {
    expect(checkContent('   ', opts)).toBe('empty');
    expect(checkContent('', { ...opts, allowEmpty: true })).toBeNull();
    expect(checkContent('a'.repeat(101), opts)).toBe('too_long');
  });

  it('rejects links, including bare domains', () => {
    expect(checkContent('see https://example.org', opts)).toBe('links_not_allowed');
    expect(checkContent('visit www.spam.biz now', opts)).toBe('links_not_allowed');
    expect(checkContent('cheap-pills.shop', opts)).toBe('links_not_allowed');
  });

  it('rejects profanity, also with common letter swaps', () => {
    expect(checkContent('what the fuck', opts)).toBe('content_blocked');
    expect(checkContent('F*ck', opts)).toBeNull(); // starred-out words pass
    expect(checkContent('sh1t happens', opts)).toBe('content_blocked');
    expect(checkContent('you $lut', opts)).toBe('content_blocked');
    expect(checkContent('PISS   OFF', opts)).toBe('content_blocked');
  });

  it('uses a custom term list when given', () => {
    expect(checkContent('this is spammy', { ...opts, blockedTerms: ['spam*'] })).toBe('content_blocked');
  });
});

describe('withinRateLimit', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);

  it('counts only events inside the window', () => {
    const events = [ago(5), ago(30), ago(90)];
    expect(withinRateLimit(events, now, 60 * 60_000, 2)).toBe(false);
    expect(withinRateLimit(events, now, 60 * 60_000, 3)).toBe(true);
    expect(withinRateLimit(events, now, 10 * 60_000, 2)).toBe(true);
  });
});

describe('feed and usernames', () => {
  it('goes back two weeks', () => {
    const now = new Date('2026-11-15T00:00:00Z');
    expect(feedCutoff(now).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(SOCIAL_LIMITS.feedWindowDays).toBe(14);
  });

  it('validates usernames', () => {
    expect(isValidUsername('anna_k')).toBe(true);
    expect(isValidUsername('An')).toBe(false);
    expect(isValidUsername('anna.k')).toBe(false);
  });
});
