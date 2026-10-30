import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, databaseAvailable, type Query, type TestDb } from './helpers';

const available = await databaseAvailable();

describe.skipIf(!available)('verse cards', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  async function person(username: string) {
    const id = await createUser(db.client, { full_name: username, timezone: 'UTC' });
    await db.client.query(`update public.profiles set username = $1, display_name = $1, visibility = 'public' where id = $2`, [username, id]);
    return id;
  }
  const as = <T>(user: string, fn: (q: Query) => Promise<T>) => asUser(db.client, user, fn);
  const rpc = async (user: string, sql: string, params: unknown[] = []) => (await as(user, (q) => q(sql, params))).rows[0];
  const card = (user: string, style: unknown, body = '', group: string | null = null) =>
    rpc(
      user,
      `select public.create_post('verse', $1, 'PSA.46.10', 'bsb', 'Be still, and know that I am God.', $2, null, $3::jsonb) as p`,
      [body, group, JSON.stringify(style)],
    );

  it('stores a card style on a verse post', async () => {
    const a = await person('card_a');
    const post = (await card(a, { background: 'dawn', font: 'serif_italic' }, 'For this week')).p;
    expect(post).toMatchObject({ type: 'verse', card: { background: 'dawn', font: 'serif_italic' }, passage: 'PSA.46.10' });
  });

  it('refuses unknown styles and cards on other post types', async () => {
    const a = await person('card_bad');
    await expect(card(a, { background: 'neon', font: 'serif' })).rejects.toThrow(/invalid_card/);
    await expect(card(a, { background: 'dawn', font: 'serif', image: 'https://x' })).rejects.toThrow(/invalid_card/);
    await expect(
      rpc(a, `select public.create_post('prayer', 'Hello', null, null, null, null, null, '{"background":"dawn","font":"serif"}'::jsonb)`),
    ).rejects.toThrow(/invalid_card/);
    // The table rejects a bad style even without the function.
    await expect(
      db.client.query(`insert into public.posts (author_id, type, passage, verse_text, card) values ($1, 'verse', 'PSA.1.1', 'x', '{"background":"x"}')`, [a]),
    ).rejects.toThrow(/posts_card_style/);
  });

  it("puts friends' and groups' recent cards in front of today's set, not mine or strangers'", async () => {
    const me = await person('card_me');
    const friend = await person('card_friend');
    const stranger = await person('card_stranger');
    const member = await person('card_member');
    await rpc(me, `select public.follow_user($1)`, [friend]);
    const g = (await rpc(me, `select public.create_group('Card group', '', 'friends', 'invite') as g`)).g;
    await rpc(member, `select public.join_group(null, $1)`, [g.invite_code]);

    await card(me, { background: 'tide', font: 'sans' }, 'mine');
    await card(friend, { background: 'olive', font: 'serif' }, 'from a friend');
    await card(stranger, { background: 'olive', font: 'serif' }, 'from a stranger');
    await card(member, { background: 'sea', font: 'serif' }, 'from the group', g.id);
    // An ordinary verse post isn't a card.
    await rpc(friend, `select public.create_post('verse', 'not a card', 'PSA.23.4', 'bsb', 'Even though I walk…')`);

    const cards = (await rpc(me, `select public.get_card_posts() as c`)).c;
    expect(cards.map((c: { body: string }) => c.body).sort()).toEqual(['from a friend', 'from the group']);

    // Older than 48 hours: no longer in today's set.
    await db.client.query(`update public.posts set created_at = now() - interval '3 days' where body = 'from a friend'`);
    const later = (await rpc(me, `select public.get_card_posts() as c`)).c;
    expect(later.map((c: { body: string }) => c.body)).toEqual(['from the group']);
  });
});
