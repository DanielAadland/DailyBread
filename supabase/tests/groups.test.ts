import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, databaseAvailable, setNow, type Query, type TestDb } from './helpers';

const available = await databaseAvailable();

const TODAY = '2026-11-10';

describe.skipIf(!available)('groups', () => {
  let db: TestDb;
  let psalms: string;

  beforeAll(async () => {
    db = await createTestDb();
    await setNow(db.client, `${TODAY}T10:00:00Z`);
    psalms = (await db.client.query(`select id from public.reading_plans where slug = 'psalms-30'`)).rows[0].id;
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  async function person(username: string, visibility: 'public' | 'friends' | 'private' = 'public') {
    const id = await createUser(db.client, { full_name: username, timezone: 'UTC' });
    await db.client.query(`update public.profiles set username = $1, display_name = $1, visibility = $2 where id = $3`, [username, visibility, id]);
    return id;
  }
  const as = <T>(user: string, fn: (q: Query) => Promise<T>) => asUser(db.client, user, fn);
  const rpc = async (user: string, sql: string, params: unknown[] = []) => (await as(user, (q) => q(sql, params))).rows[0];
  const createGroup = async (owner: string, name: string, access: 'public' | 'invite' = 'invite', plan: string | null = null) =>
    (await rpc(owner, `select public.create_group($1, 'Reading together', 'small_group', $2, $3, $4) as g`, [name, access, plan, plan ? TODAY : null])).g;
  const join = async (user: string, code: string) => (await rpc(user, `select public.join_group(null, $1) as g`, [code])).g;

  describe('creating and joining', () => {
    it('makes the creator the owner and gives members an invite code', async () => {
      const owner = await person('g_owner');
      const g = await createGroup(owner, 'Tuesday group');
      expect(g).toMatchObject({ name: 'Tuesday group', my_role: 'owner', member_count: 1, access: 'invite' });
      expect(g.invite_code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
      const mine = (await rpc(owner, `select public.my_groups() as g`)).g;
      expect(mine.map((x: { name: string }) => x.name)).toEqual(['Tuesday group']);
    });

    it('checks names with the content filter', async () => {
      const owner = await person('g_names');
      await expect(rpc(owner, `select public.create_group('ab', '', 'friends', 'invite')`)).rejects.toThrow(/group_name_too_short/);
      await expect(rpc(owner, `select public.create_group('Visit example.com', '', 'friends', 'invite')`)).rejects.toThrow(/links_not_allowed/);
    });

    it('keeps invite-only groups hidden except through the link', async () => {
      const owner = await person('inv_owner');
      const other = await person('inv_other');
      const g = await createGroup(owner, 'Family readers');
      await expect(rpc(other, `select public.get_group($1)`, [g.id])).rejects.toThrow(/group_not_found/);
      await expect(rpc(other, `select public.join_group($1)`, [g.id])).rejects.toThrow(/group_not_found/);
      const found = (await rpc(other, `select public.find_groups('Family') as f`)).f;
      expect(found).toEqual([]);

      const preview = (await rpc(other, `select public.get_group_by_invite($1) as g`, [g.invite_code])).g;
      expect(preview).toMatchObject({ name: 'Family readers', my_role: null, invite_code: null });
      const joined = await join(other, g.invite_code);
      expect(joined).toMatchObject({ my_role: 'member', member_count: 2 });
      await expect(rpc(other, `select public.join_group(null, 'zzzzzzzzzz')`)).rejects.toThrow(/invite_not_found/);
    });

    it('lists public groups and lets anyone join them', async () => {
      const owner = await person('pub_g_owner');
      const other = await person('pub_g_other', 'private');
      const g = await createGroup(owner, 'Open Psalms circle', 'public');
      const found = (await rpc(other, `select public.find_groups('psalms circle') as f`)).f;
      expect(found.map((x: { name: string }) => x.name)).toEqual(['Open Psalms circle']);
      const joined = (await rpc(other, `select public.join_group($1) as g`, [g.id])).g;
      expect(joined.my_role).toBe('member');
      // A private profile still shows up inside the group.
      const members = (await rpc(owner, `select public.group_members_list($1) as m`, [g.id])).m;
      expect(members.map((m: { username: string }) => m.username).sort()).toEqual(['pub_g_other', 'pub_g_owner']);
    });
  });

  describe('roles', () => {
    it('follows canInGroup, canRemoveMember and canChangeRole', async () => {
      const owner = await person('r_owner');
      const admin = await person('r_admin');
      const member = await person('r_member');
      const other = await person('r_other');
      const g = await createGroup(owner, 'Roles group');
      for (const u of [admin, member, other]) await join(u, g.invite_code);

      await expect(rpc(member, `select public.set_member_role($1, $2, 'admin')`, [g.id, member])).rejects.toThrow(/not_allowed/);
      await rpc(owner, `select public.set_member_role($1, $2, 'admin')`, [g.id, admin]);
      await expect(rpc(admin, `select public.set_member_role($1, $2, 'admin')`, [g.id, member])).rejects.toThrow(/not_allowed/);
      await expect(rpc(owner, `select public.set_member_role($1, $2, 'owner')`, [g.id, member])).rejects.toThrow(/not_allowed/);

      await expect(rpc(member, `select public.remove_group_member($1, $2)`, [g.id, other])).rejects.toThrow(/not_allowed/);
      await rpc(admin, `select public.remove_group_member($1, $2)`, [g.id, other]);
      await expect(rpc(admin, `select public.remove_group_member($1, $2)`, [g.id, owner])).rejects.toThrow(/not_allowed/);

      await expect(rpc(owner, `select public.leave_group($1)`, [g.id])).rejects.toThrow(/owner_cannot_leave/);
      await rpc(owner, `select public.transfer_group($1, $2)`, [g.id, member]);
      const roles = (await rpc(owner, `select public.group_members_list($1) as m`, [g.id])).m;
      expect(Object.fromEntries(roles.map((m: { username: string; role: string }) => [m.username, m.role]))).toEqual({
        r_member: 'owner',
        r_owner: 'admin',
        r_admin: 'admin',
      });
      await rpc(owner, `select public.leave_group($1)`, [g.id]);
      expect((await rpc(member, `select public.get_group($1) as g`, [g.id])).g.member_count).toBe(2);
    });

    it('lets only admins reset the invite link, and the old one stops working', async () => {
      const owner = await person('reset_owner');
      const member = await person('reset_member');
      const late = await person('reset_late');
      const g = await createGroup(owner, 'Reset group');
      await join(member, g.invite_code);
      await expect(rpc(member, `select public.reset_group_invite($1)`, [g.id])).rejects.toThrow(/not_allowed/);
      const code = (await rpc(owner, `select public.reset_group_invite($1) as c`, [g.id])).c;
      expect(code).not.toBe(g.invite_code);
      await expect(join(late, g.invite_code)).rejects.toThrow(/invite_not_found/);
      expect((await join(late, code)).my_role).toBe('member');
    });

    it('hands the group on when the owner deletes their account, and removes empty groups', async () => {
      const owner = await person('del_owner');
      const admin = await person('del_admin');
      const member = await person('del_member');
      const g = await createGroup(owner, 'Handover group');
      await join(member, g.invite_code);
      await join(admin, g.invite_code);
      await rpc(owner, `select public.set_member_role($1, $2, 'admin')`, [g.id, admin]);
      await db.client.query(`delete from auth.users where id = $1`, [owner]);
      expect((await rpc(admin, `select public.get_group($1) as g`, [g.id])).g.my_role).toBe('owner');

      const solo = await person('del_solo');
      const s = await createGroup(solo, 'Solo group');
      await db.client.query(`delete from auth.users where id = $1`, [solo]);
      expect((await db.client.query(`select count(*)::int as n from public.groups where id = $1`, [s.id])).rows[0].n).toBe(0);
    });
  });

  describe('posts in groups', () => {
    it('shows group posts to members only, in their feed but not on profiles', async () => {
      const owner = await person('gp_owner');
      const member = await person('gp_member', 'private');
      const follower = await person('gp_follower');
      const g = await createGroup(owner, 'Posting group');
      await join(member, g.invite_code);
      await rpc(follower, `select public.follow_user($1)`, [owner]);

      const post = (await rpc(owner, `select public.create_post('prayer', 'Pray for our Sunday', null, null, null, $1) as p`, [g.id])).p;
      expect(post.group).toEqual({ id: g.id, name: 'Posting group' });

      const memberFeed = (await rpc(member, `select public.get_feed() as f`)).f;
      expect(memberFeed.items.map((i: { body: string }) => i.body)).toContain('Pray for our Sunday');
      const followerFeed = (await rpc(follower, `select public.get_feed() as f`)).f;
      expect(followerFeed.items.map((i: { body: string }) => i.body)).not.toContain('Pray for our Sunday');
      await expect(rpc(follower, `select public.get_post($1)`, [post.id])).rejects.toThrow(/post_not_found/);
      const profile = (await rpc(follower, `select public.get_user_posts($1) as p`, [owner])).p;
      expect(profile.items).toEqual([]);

      // A private member's comment is visible to the other members.
      await rpc(member, `select public.add_comment($1, 'Praying with you')`, [post.id]);
      const comments = (await rpc(owner, `select public.get_comments($1) as c`, [post.id])).c;
      expect(comments.map((c: { body: string }) => c.body)).toEqual(['Praying with you']);
      expect((await rpc(owner, `select public.get_post($1) as p`, [post.id])).p.comment_count).toBe(1);

      await expect(rpc(follower, `select public.create_post('prayer', 'Let me in', null, null, null, $1)`, [g.id])).rejects.toThrow(/group_not_found/);
    });

    it('lets admins pin (up to 3) and remove posts and comments', async () => {
      const owner = await person('mod_owner');
      const member = await person('mod_member');
      const g = await createGroup(owner, 'Moderated group');
      await join(member, g.invite_code);
      const posts = [];
      for (const body of ['one', 'two', 'three', 'four']) {
        posts.push((await rpc(member, `select public.create_post('prayer', $1, null, null, null, $2) as p`, [`Prayer ${body}`, g.id])).p);
      }
      await expect(rpc(member, `select public.pin_group_post($1, true)`, [posts[0].id])).rejects.toThrow(/not_allowed/);
      for (const p of posts.slice(0, 3)) await rpc(owner, `select public.pin_group_post($1, true)`, [p.id]);
      await expect(rpc(owner, `select public.pin_group_post($1, true)`, [posts[3].id])).rejects.toThrow(/too_many_pinned/);
      const page = (await rpc(member, `select public.get_group_posts($1) as p`, [g.id])).p;
      expect(page.pinned).toHaveLength(3);
      expect(page.items.map((i: { body: string }) => i.body)).toEqual(['Prayer four']);
      expect(page.caught_up).toBe(true);

      const comment = (await rpc(member, `select public.add_comment($1, 'Off topic') as c`, [posts[3].id])).c;
      const asOwner = (await rpc(owner, `select public.get_comments($1) as c`, [posts[3].id])).c;
      expect(asOwner[0].can_remove).toBe(true);
      await rpc(owner, `select public.delete_comment($1)`, [comment.id]);
      expect((await rpc(member, `select public.get_comments($1) as c`, [posts[3].id])).c).toEqual([]);

      await expect(rpc(member, `select public.remove_group_post($1)`, [posts[3].id])).rejects.toThrow(/not_allowed/);
      await rpc(owner, `select public.remove_group_post($1)`, [posts[0].id]);
      const after = (await rpc(member, `select public.get_group_posts($1) as p`, [g.id])).p;
      expect(after.pinned).toHaveLength(2);
    });

    it("hides a blocked member's posts", async () => {
      const owner = await person('blk_owner');
      const member = await person('blk_member');
      const g = await createGroup(owner, 'Block group');
      await join(member, g.invite_code);
      await rpc(member, `select public.create_post('prayer', 'Hello group', null, null, null, $1)`, [g.id]);
      await rpc(owner, `select public.block_user($1)`, [member]);
      const page = (await rpc(owner, `select public.get_group_posts($1) as p`, [g.id])).p;
      expect(page.items).toEqual([]);
    });
  });

  describe('group plan, daily thread and who read today', () => {
    it("shows today's day and readings, and keeps a thread per day", async () => {
      const owner = await person('plan_owner');
      const member = await person('plan_member');
      const g = await createGroup(owner, 'Psalms group', 'invite', psalms);
      expect(g.plan).toMatchObject({ slug: 'psalms-30', status: 'active', day: 1, start: TODAY });
      expect(g.plan.readings[0]).toMatch(/^PSA\./);
      await join(member, g.invite_code);

      const reply = (await rpc(member, `select public.create_post('reflection', 'Verse 3 stood out', null, null, null, $1, 1) as p`, [g.id])).p;
      expect(reply).toMatchObject({ group_day: 1, passage: g.plan.readings[0] });
      await expect(rpc(member, `select public.create_post('prayer', 'Wrong type', null, null, null, $1, 1)`, [g.id])).rejects.toThrow(/invalid_post/);
      await expect(rpc(member, `select public.create_post('reflection', 'No such day', null, null, null, $1, 99)`, [g.id])).rejects.toThrow(/invalid_post/);

      const thread = (await rpc(owner, `select public.get_group_day($1, 1) as t`, [g.id])).t;
      expect(thread.map((p: { body: string }) => p.body)).toEqual(['Verse 3 stood out']);
      const feed = (await rpc(owner, `select public.get_feed() as f`)).f;
      expect(feed.items.map((p: { body: string }) => p.body)).not.toContain('Verse 3 stood out');
      const page = (await rpc(owner, `select public.get_group_posts($1) as p`, [g.id])).p;
      expect(page.items).toEqual([]);
    });

    it('lists who read today and allows one kind nudge', async () => {
      const owner = await person('today_owner');
      const reader = await person('today_reader');
      const sleeper = await person('today_sleeper');
      const g = await createGroup(owner, 'Today group', 'invite', psalms);
      await join(reader, g.invite_code);
      await join(sleeper, g.invite_code);

      const enrolment = (await rpc(owner, `select (public.start_plan($1)).id as id`, [psalms])).id;
      await rpc(owner, `select public.complete_reading($1, 1)`, [enrolment]);
      await rpc(reader, `select public.log_free_reading('JHN', 1)`);

      const members = (await rpc(owner, `select public.group_members_list($1) as m`, [g.id])).m;
      expect(members.map((m: { username: string; today: string }) => [m.username, m.today])).toEqual([
        ['today_owner', 'plan_day'],
        ['today_reader', 'read'],
        ['today_sleeper', 'not_yet'],
      ]);
      expect(members.find((m: { username: string }) => m.username === 'today_sleeper').can_nudge).toBe(true);

      const group = (await rpc(owner, `select public.get_group($1) as g`, [g.id])).g;
      expect(group).toMatchObject({ readers_today: 2, member_count: 3, my_today: 'plan_day', streak: 1 });

      await rpc(reader, `select public.nudge_member($1, $2)`, [g.id, sleeper]);
      const notes = (await rpc(sleeper, `select public.my_notifications() as n`)).n;
      expect(notes[0]).toMatchObject({ kind: 'nudge', actor: { username: 'today_reader' }, group: { name: 'Today group' } });
      await expect(rpc(reader, `select public.nudge_member($1, $2)`, [g.id, sleeper])).rejects.toThrow(/rate_limited/);
      await expect(rpc(sleeper, `select public.nudge_member($1, $2)`, [g.id, reader])).rejects.toThrow(/already_read/);
      const after = (await rpc(reader, `select public.group_members_list($1) as m`, [g.id])).m;
      expect(after.find((m: { username: string }) => m.username === 'today_sleeper').can_nudge).toBe(false);
    });

    it('counts the group streak on days when at least half read', async () => {
      const a = await person('st_a');
      const b = await person('st_b');
      const c = await person('st_c');
      const g = await createGroup(a, 'Streak group');
      await join(b, g.invite_code);
      await join(c, g.invite_code);
      await db.client.query(`update public.group_members set joined_at = '2026-11-01T08:00:00Z' where group_id = $1`, [g.id]);
      const read = (user: string, date: string) =>
        db.client.query(`insert into public.daily_activity (user_id, local_date, source) values ($1, $2, 'free')`, [user, date]);
      // 11-07: 1 of 3 (doesn't count). 11-08 and 11-09: 2 of 3. 11-10 (today): 1 of 3 so far.
      await read(a, '2026-11-07');
      await read(a, '2026-11-08');
      await read(b, '2026-11-08');
      await read(b, '2026-11-09');
      await read(c, '2026-11-09');
      await read(a, '2026-11-10');
      expect((await rpc(a, `select public.get_group($1) as g`, [g.id])).g.streak).toBe(2);
      await read(c, '2026-11-10');
      expect((await rpc(a, `select public.get_group($1) as g`, [g.id])).g.streak).toBe(3);
      // A freeze keeps your own streak but doesn't count for the group.
      await db.client.query(`insert into public.daily_activity (user_id, local_date, source) values ($1, '2026-11-07', 'freeze')`, [b]);
      expect((await rpc(a, `select public.get_group($1) as g`, [g.id])).g.streak).toBe(3);
    });
  });

  it('includes groups in the data export', async () => {
    const owner = await person('exp_owner');
    await createGroup(owner, 'Export group');
    const data = (await rpc(owner, `select public.export_my_data() as d`)).d;
    expect(data.groups).toMatchObject([{ name: 'Export group', role: 'owner' }]);
  });
});
