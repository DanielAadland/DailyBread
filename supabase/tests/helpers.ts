import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');

/** Admin connection to a local Postgres used only for tests. */
export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres';

export async function databaseAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

export interface TestDb {
  client: pg.Client;
  drop(): Promise<void>;
}

/** Fresh database: Supabase stub, all migrations, seed plans and (optionally) the BSB text. */
export async function createTestDb(options: { withBible?: boolean } = {}): Promise<TestDb> {
  const name = `bibleapp_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.query(`alter database ${name} set app.allow_time_travel = 'on'`);

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();

  // Roles are cluster-wide; create them once.
  const roles = await client.query(`select count(*)::int as n from pg_roles where rolname in ('anon','authenticated','service_role')`);
  let stub = readFileSync(join(here, 'supabase-stub.sql'), 'utf8');
  if (roles.rows[0].n === 3) stub = stub.replace(/^create role .*$/gm, '');
  await client.query(stub);

  const migrations = readdirSync(join(supabaseDir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    try {
      await client.query(readFileSync(join(supabaseDir, 'migrations', file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
  await client.query(readFileSync(join(supabaseDir, 'seed', 'plans.sql'), 'utf8'));
  if (options.withBible) await loadBible(client, 'bsb');

  return {
    client,
    async drop() {
      await client.end();
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}

async function loadBible(client: pg.Client, translation: string): Promise<void> {
  const tsv = readFileSync(join(supabaseDir, 'seed', 'generated', `bible_${translation}.tsv`), 'utf8');
  const rows = tsv.trimEnd().split('\n').map((line) => line.split('\t'));
  for (let i = 0; i < rows.length; i += 2000) {
    const batch = rows.slice(i, i + 2000);
    const values: unknown[] = [];
    const placeholders = batch.map((r, j) => {
      values.push(r[0], r[1], Number(r[2]), Number(r[3]), Number(r[4]), (r[5] ?? '').replace(/\\t/g, '\t').replace(/\\\\/g, '\\'));
      const b = j * 6;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
    });
    await client.query(
      `insert into public.bible_verses (translation, book, book_order, chapter, verse, text) values ${placeholders.join(',')}`,
      values,
    );
  }
}

/** Sign up a user the way Supabase Auth does (insert into auth.users fires the trigger). */
export async function createUser(client: pg.Client, meta: Record<string, string> = {}): Promise<string> {
  const email = `user${Math.floor(Math.random() * 1e9)}@example.test`;
  const res = await client.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta]);
  return res.rows[0].id as string;
}

/** Freeze the database clock (only works in test databases). */
export async function setNow(client: pg.Client, iso: string | null): Promise<void> {
  await client.query(`select set_config('app.now', $1, false)`, [iso ?? '']);
}

/** Run queries as a signed-in user (role authenticated, auth.uid() = userId), inside a rolled-back-on-error transaction. */
export async function asUser<T>(client: pg.Client, userId: string | null, fn: (q: Query) => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    await client.query(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
    ]);
    const result = await fn((sql, params) => client.query(sql, params));
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
}

/** Run queries as the service role (used by Edge Functions and jobs). */
export async function asService<T>(client: pg.Client, fn: (q: Query) => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    await client.query('set local role service_role');
    const result = await fn((sql, params) => client.query(sql, params));
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
}

export type Query = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;
