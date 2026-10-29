import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createTestDb, createUser, databaseAvailable, setNow, type Query, type TestDb } from './helpers';

const available = await databaseAvailable();

describe.skipIf(!available)('social', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  /** A signed-up user with a username and visibility. */
  async function person(username: string, visibility: 'public' | 'friends' | 'private' = 'public') {
    const id = await createUser(db.client, { full_name: username, timezone: 'UTC' });
    await db.client.query(`update public.profiles set username = $1, visibility = $2 where id = $3`, [username, visibility, id]);
    return id;
  }
  const as = <T>(user: string, fn: (q: Query) => Promise<T>) => asUser(db.client, user, fn);
  const rpc = async (user: string, sql: string, params: unknown[] = []) => (await as(user, (q) => q(sql, params))).rows[0];
  const post = async (user: string, body: string) =>
    (await rpc(user, `select public.create_post('prayer', $1) as p`, [body])).p as { id: string };

  describe('following', () => {
    it('follows public profiles at once and notifies them', async () => {
      const a = await person('pub_a');
      const b = await person('pub_b');
      expect((await rpc(a, `select public.follow_user($1) as s`, [b])).s).toBe('accepted');
      const notes = (await rpc(b, `select public.my_notifications() as n`)).n;
      expect(notes[0]).toMatchObject({ kind: 'follow', actor: { username: 'pub_a' } });
    });

    it('asks friends-only profiles and shows nothing until accepted', async () => {
      const a = await person('fr_a');
      const b = await person('fr_b', 'friends');
      await rpc(b, `select public.create_post('prayer', 'Please pray for my grandmother') as p`);
      expect((await rpc(a, `select public.follow_user($1) as s`, [b])).s).toBe('pending');

      const before = (await rpc(a, `select public.get_profile($1) as p`, [b])).p;
      expect(before).toMatchObject({ can_see: false, follow_status: 'pending' });
      expect(before.bio).toBeUndefined();
      expect((await as(a, (q) => q(`select * from public.posts where author_id = $1`, [b]))).rowCount).toBe(0);

      const requests = (await rpc(b, `select public.list_connections('requests') as r`)).r;
      expect(requests.map((r: { username: string }) => r.username)).toEqual(['fr_a']);
      await rpc(b, `select public.respond_follow_request($1, true)`, [a]);

      const after = (await rpc(a, `select public.get_profile($1) as p`, [b])).p;
      expect(after).toMatchObject({ can_see: true, follow_status: 'accepted' });
      const feed = (await rpc(a, `select public.get_feed() as f`)).f;
      expect(feed.items.map((i: { body: string }) => i.body)).toContain('Please pray for my grandmother');
    });

    it('keeps private profiles out of search and refuses follows', async () => {
      const a = await person('pv_a');
      const b = await person('pv_hidden', 'private');
      const found = (await rpc(a, `select public.find_people('pv_') as f`)).f;
      expect(found.map((p: { username: string }) => p.username)).toEqual([]);
      await expect(rpc(a, `select public.follow_user($1)`, [b])).rejects.toThrow(/cannot_follow_private/);
    });

    it('finds public and friends-only people by name', async () => {
      const a = await person('search_me');
      await person('searchable_one');
      await person('searchable_two', 'friends');
      const found = (await rpc(a, `select public.find_people('searchable') as f`)).f;
      expect(found.map((p: { username: string }) => p.username)).toEqual(['searchable_one', 'searchable_two']);
    });
  });

  describe('posts and the feed', () => {
    it('shows my posts and the people I follow, newest first, and ends', async () => {
      const me = await person('feed_me');
      const friend = await person('feed_friend');
      const stranger = await person('feed_stranger');
      await rpc(me, `select public.follow_user($1)`, [friend]);
      await post(friend, 'Grateful for this morning');
      await post(stranger, 'Not followed, not in the feed');
      await post(me, 'My own prayer');
      const feed = (await rpc(me, `select public.get_feed() as f`)).f;
      expect(feed.items.map((i: { body: string }) => i.body)).toEqual(['My own prayer', 'Grateful for this morning']);
      expect(feed.caught_up).toBe(true);
    });

    it('pages through the feed and only goes back 14 days', async () => {
      const me = await person('page_me');
      for (let i = 1; i <= 5; i++) await post(me, `Post number ${i}`);
      await db.client.query(`update public.posts set created_at = now() - interval '20 days' where body = 'Post number 1'`);
      const first = (await rpc(me, `select public.get_feed(null, 2) as f`)).f;
      expect(first.items).toHaveLength(2);
      expect(first.caught_up).toBe(false);
      const second = (await rpc(me, `select public.get_feed($1, 2) as f`, [first.items[1].created_at])).f;
      expect(second.items.map((i: { body: string }) => i.body)).toEqual(['Post number 3', 'Post number 2']);
      const third = (await rpc(me, `select public.get_feed($1, 2) as f`, [second.items[1].created_at])).f;
      expect(third).toEqual({ items: [], caught_up: true });
    });

    it('shares verses with their text and checks the passage', async () => {
      const me = await person('verse_me');
      const shared = (await rpc(me, `select public.create_post('verse', '', 'JHN.3.16', 'bsb', 'For God so loved the world…') as p`)).p;
      expect(shared).toMatchObject({ type: 'verse', passage: 'JHN.3.16', translation: 'bsb', body: '' });
      await expect(rpc(me, `select public.create_post('verse', '', 'JHN.30.1', 'bsb', 'x')`)).rejects.toThrow(/invalid_passage/);
      await expect(rpc(me, `select public.create_post('reflection', 'nice', 'drop table posts', 'bsb')`)).rejects.toThrow(/invalid_passage/);
    });

    it('filters links and profanity, and limits posting', async () => {
      const me = await person('filter_me');
      await expect(post(me, 'Read this: https://example.com')).rejects.toThrow(/links_not_allowed/);
      await expect(post(me, 'what the f u c k... no, what the fuck')).rejects.toThrow(/content_blocked/);
      await expect(post(me, '   ')).rejects.toThrow(/content_empty/);
      await post(me, 'A normal prayer request');
      await expect(post(me, 'A normal prayer request')).rejects.toThrow(/duplicate_post/);
      for (let i = 2; i <= 10; i++) await post(me, `Request ${i}`);
      await expect(post(me, 'One too many')).rejects.toThrow(/rate_limited/);
    });

    it('hides muted people from the feed but not from their profile', async () => {
      const me = await person('mute_me');
      const loud = await person('mute_loud');
      await rpc(me, `select public.follow_user($1)`, [loud]);
      await post(loud, 'So many posts');
      await rpc(me, `select public.set_muted($1, true)`, [loud]);
      expect((await rpc(me, `select public.get_feed() as f`)).f.items).toEqual([]);
      expect((await rpc(me, `select public.get_user_posts($1) as f`, [loud])).f.items).toHaveLength(1);
    });
  });

  describe('reactions and comments', () => {
    it('keeps one reaction per person, counts them and notifies once', async () => {
      const author = await person('react_author');
      const fan = await person('react_fan');
      const p = await post(author, 'Starting a new job tomorrow');
      await rpc(fan, `select public.react($1, 'praying')`, [p.id]);
      const changed = (await rpc(fan, `select public.react($1, 'amen') as p`, [p.id])).p;
      expect(changed.reactions).toEqual({ amen: 1, praying: 0, encouraged: 0 });
      expect(changed.my_reaction).toBe('amen');
      const cleared = (await rpc(fan, `select public.react($1, null) as p`, [p.id])).p;
      expect(cleared.my_reaction).toBeNull();
      const notes = (await rpc(author, `select public.my_notifications() as n`)).n;
      expect(notes.filter((n: { kind: string }) => n.kind === 'reaction')).toHaveLength(1);
    });

    it('adds comments, notifies the author, and lets the author remove them', async () => {
      const author = await person('comment_author');
      const friend = await person('comment_friend');
      const p = await post(author, 'Exams start Monday');
      const c = (await rpc(friend, `select public.add_comment($1, 'You will do great, praying for you') as c`, [p.id])).c;
      const list = (await rpc(author, `select public.get_comments($1) as c`, [p.id])).c;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ body: 'You will do great, praying for you', can_remove: true, is_mine: false });
      expect((await rpc(author, `select public.get_post($1) as p`, [p.id])).p.comment_count).toBe(1);
      await rpc(author, `select public.delete_comment($1)`, [c.id]);
      expect((await rpc(author, `select public.get_comments($1) as c`, [p.id])).c).toEqual([]);
      await expect(rpc(friend, `select public.add_comment($1, 'visit www.spam.biz')`, [p.id])).rejects.toThrow(/links_not_allowed/);
    });

    it('cannot react to or comment on posts the user cannot see', async () => {
      const author = await person('hidden_author', 'friends');
      const stranger = await person('hidden_stranger');
      const p = await post(author, 'Friends only');
      await expect(rpc(stranger, `select public.react($1, 'amen')`, [p.id])).rejects.toThrow(/post_not_found/);
      await expect(rpc(stranger, `select public.add_comment($1, 'hi')`, [p.id])).rejects.toThrow(/post_not_found/);
    });
  });

  describe('blocking', () => {
    it('removes follows and hides both people from each other', async () => {
      const a = await person('block_a');
      const b = await person('block_b');
      await rpc(a, `select public.follow_user($1)`, [b]);
      await rpc(b, `select public.follow_user($1)`, [a]);
      const p = await post(b, 'Visible before the block');
      await rpc(a, `select public.block_user($1)`, [b]);
      expect((await db.client.query(`select count(*)::int as n from public.follows where $1 in (follower_id, followee_id)`, [a])).rows[0].n).toBe(0);
      await expect(rpc(a, `select public.get_profile($1)`, [b])).rejects.toThrow(/profile_not_found/);
      await expect(rpc(b, `select public.get_profile($1)`, [a])).rejects.toThrow(/profile_not_found/);
      await expect(rpc(a, `select public.get_post($1)`, [p.id])).rejects.toThrow(/post_not_found/);
      await expect(rpc(b, `select public.follow_user($1)`, [a])).rejects.toThrow(/profile_not_found/);
      expect((await rpc(a, `select public.list_blocked() as b`)).b.map((x: { username: string }) => x.username)).toEqual(['block_b']);
    });
  });

  describe('reports and moderation', () => {
    it('lets users report, admins remove content and suspend authors', async () => {
      const author = await person('mod_author');
      const reporter = await person('mod_reporter');
      const admin = await person('mod_admin');
      await db.client.query(`update public.profiles set is_admin = true where id = $1`, [admin]);
      const p = await post(author, 'Something hurtful');

      await rpc(reporter, `select public.report_content('post', $1, 'harassment', 'Mean to my friend')`, [p.id]);
      await rpc(reporter, `select public.report_content('post', $1, 'harassment')`, [p.id]); // duplicate: ignored
      await expect(rpc(reporter, `select public.admin_reports()`)).rejects.toThrow(/not_admin/);

      const open = (await rpc(admin, `select public.admin_reports() as r`)).r;
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ target_type: 'post', report_count: 1, reasons: ['harassment'], preview: { body: 'Something hurtful' } });

      await rpc(admin, `select public.admin_resolve('post', $1, 'remove', 'Breaks guidelines')`, [p.id]);
      await expect(rpc(reporter, `select public.get_post($1)`, [p.id])).rejects.toThrow(/post_not_found/);
      expect((await rpc(admin, `select public.admin_reports() as r`)).r).toEqual([]);
      expect((await rpc(admin, `select public.admin_reports('actioned') as r`)).r).toHaveLength(1);

      await rpc(admin, `select public.admin_resolve('user', $1, 'suspend_7d')`, [author]);
      await expect(post(author, 'Trying to post while suspended')).rejects.toThrow(/account_suspended/);
      await expect(rpc(reporter, `select public.get_profile($1)`, [author])).rejects.toThrow(/profile_not_found/);
      await rpc(admin, `select public.admin_unsuspend($1)`, [author]);
      await post(author, 'Back again, kinder this time');
    });

    it('never lets clients touch reports or moderation tables directly', async () => {
      const someone = await person('mod_direct');
      await expect(as(someone, (q) => q(`select * from public.moderation_actions`))).rejects.toThrow(/permission denied/);
      await expect(as(someone, (q) => q(`insert into public.posts (author_id, type, body) values ($1, 'prayer', 'x')`, [someone]))).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  describe('milestones', () => {
    it('posts a milestone when a plan is finished, which the author can hide', async () => {
      const me = await person('milestone_me');
      const plan = (await db.client.query(`select id from public.reading_plans where slug = 'hope'`)).rows[0].id;
      await as(me, async (q) => {
        const e = (await q(`select * from public.start_plan($1)`, [plan])).rows[0];
        for (let day = 1; day <= 7; day++) await q(`select public.complete_reading($1, $2)`, [e.id, day]);
      });
      const mine = (await rpc(me, `select public.get_user_posts($1) as f`, [me])).f.items;
      const kinds = mine.map((m: { milestone: { kind: string; code?: string } }) => m.milestone.kind + (m.milestone.code ? `:${m.milestone.code}` : ''));
      expect(kinds).toEqual(expect.arrayContaining(['plan', 'badge:first_plan']));
      expect(kinds).not.toContain('badge:first_reading');

      const planPost = mine.find((m: { milestone: { kind: string } }) => m.milestone.kind === 'plan');
      await rpc(me, `select public.set_post_hidden($1, true)`, [planPost.id]);
      const follower = await person('milestone_fan');
      await rpc(follower, `select public.follow_user($1)`, [me]);
      const feed = (await rpc(follower, `select public.get_feed() as f`)).f.items;
      expect(feed.some((i: { id: string }) => i.id === planPost.id)).toBe(false);
    });

    it('shares nothing when the user switches milestones off', async () => {
      const me = await person('milestone_quiet');
      await db.client.query(`update public.profiles set share_milestones = false where id = $1`, [me]);
      const plan = (await db.client.query(`select id from public.reading_plans where slug = 'love'`)).rows[0].id;
      await as(me, async (q) => {
        const e = (await q(`select * from public.start_plan($1)`, [plan])).rows[0];
        for (let day = 1; day <= 7; day++) await q(`select public.complete_reading($1, $2)`, [e.id, day]);
      });
      expect((await rpc(me, `select public.get_user_posts($1) as f`, [me])).f.items).toEqual([]);
    });
  });

  describe('push notifications', () => {
    it('hands each notification to the push job once, following the user’s switches', async () => {
      await setNow(db.client, null);
      const author = await person('push_author');
      const fan = await person('push_fan');
      await as(author, (q) =>
        q(`insert into public.push_subscriptions (user_id, platform, endpoint, p256dh, auth) values ($1, 'web', 'https://push.example/a', 'k', 'a')`, [author]),
      );
      await db.client.query(`update public.notification_settings set quiet_start = null, quiet_end = null where user_id = $1`, [author]);
      const p = await post(author, 'Please pray for rain');
      await rpc(fan, `select public.add_comment($1, 'Praying with you')`, [p.id]);
      await rpc(fan, `select public.react($1, 'praying')`, [p.id]); // reactions are off by default

      const first = (await asService(db.client, (q) => q(`select * from public.take_social_pushes()`))).rows;
      const mine = first.filter((r) => r.user_id === author);
      expect(mine.map((r) => r.kind)).toEqual(['comment']);
      expect(mine[0].actor_name).toBe('push_fan');
      const second = (await asService(db.client, (q) => q(`select * from public.take_social_pushes()`))).rows;
      expect(second.filter((r) => r.user_id === author)).toEqual([]);
    });
  });

  describe('account deletion', () => {
    it('removes posts, comments, reactions and follows with the account', async () => {
      const leaver = await person('leaver');
      const friend = await person('leaver_friend');
      await rpc(leaver, `select public.follow_user($1)`, [friend]);
      const p = await post(friend, 'A post to react to');
      await rpc(leaver, `select public.react($1, 'amen')`, [p.id]);
      await rpc(leaver, `select public.add_comment($1, 'Amen!')`, [p.id]);
      await post(leaver, 'My last post');
      const exported = (await rpc(leaver, `select public.export_my_data() as d`)).d;
      expect(exported.posts).toHaveLength(1);
      expect(exported.comments).toHaveLength(1);
      expect(exported.following).toHaveLength(1);
      await rpc(leaver, `select public.delete_my_account()`);
      const left = await db.client.query(
        `select (select count(*) from public.posts where author_id = $1) + (select count(*) from public.comments where author_id = $1)
              + (select count(*) from public.reactions where user_id = $1) + (select count(*) from public.follows where follower_id = $1) as n`,
        [leaver],
      );
      expect(Number(left.rows[0].n)).toBe(0);
    });
  });
});
