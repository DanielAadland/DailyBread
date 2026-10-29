import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, databaseAvailable, type TestDb } from './helpers';

const seedFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'dev-sample-data.sql');
const available = await databaseAvailable();

describe.skipIf(!available)('dev sample data', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await db.client.query(readFileSync(seedFile, 'utf8'));
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  it('gives Anna a 12-day streak and two plans in progress', async () => {
    const today = await asUser(db.client, '11111111-1111-1111-1111-111111111111', async (q) => (await q(`select public.get_today() as t`)).rows[0].t);
    expect(today.streak).toEqual({ current: 12, longest: 12, freezes_left: 2, read_today: false });
    expect(today.plans.map((p: { slug: string; next_day: number }) => [p.slug, p.next_day])).toEqual([
      ['psalms-30', 13],
      ['gospels-30', 4],
    ]);
  });

  it('is safe to run twice', async () => {
    await expect(db.client.query(readFileSync(seedFile, 'utf8'))).resolves.toBeDefined();
  });

  it('refuses to run once real users exist', async () => {
    await createUser(db.client);
    await db.client.query(`update auth.users set email = 'real.person@gmail.com' where email like 'user%'`);
    await expect(db.client.query(readFileSync(seedFile, 'utf8'))).rejects.toThrow(/Refusing/);
  });
});
