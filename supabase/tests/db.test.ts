import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createTestDb, createUser, databaseAvailable, setNow, type TestDb } from './helpers';

const available = await databaseAvailable();
if (!available) console.warn('Skipping database tests: no Postgres at TEST_DATABASE_URL (see supabase/README.md).');

describe.skipIf(!available)('database', () => {
  let db: TestDb;
  const planId = async (slug: string) =>
    (await db.client.query(`select id from public.reading_plans where slug = $1`, [slug])).rows[0].id as string;

  beforeAll(async () => {
    db = await createTestDb({ withBible: true });
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  describe('sign-up', () => {
    it('creates a profile, settings and streak with the timezone from sign-up', async () => {
      const id = await createUser(db.client, { timezone: 'Europe/Zurich', full_name: 'Anna' });
      const p = await db.client.query(`select display_name, timezone, visibility from public.profiles where id = $1`, [id]);
      expect(p.rows[0]).toEqual({ display_name: 'Anna', timezone: 'Europe/Zurich', visibility: 'friends' });
      const s = await db.client.query(`select current, freezes_left from public.streaks where user_id = $1`, [id]);
      expect(s.rows[0]).toEqual({ current: 0, freezes_left: 1 });
      const n = await db.client.query(`select reminder_time from public.notification_settings where user_id = $1`, [id]);
      expect(n.rows[0].reminder_time).toBe('08:00:00');
    });

    it('falls back to UTC for an unknown timezone', async () => {
      const id = await createUser(db.client, { timezone: 'Mars/Base' });
      const p = await db.client.query(`select timezone from public.profiles where id = $1`, [id]);
      expect(p.rows[0].timezone).toBe('UTC');
    });
  });

  describe('row-level security', () => {
    it('keeps highlights and notes private to their owner', async () => {
      const a = await createUser(db.client);
      const b = await createUser(db.client);
      await asUser(db.client, a, async (q) => {
        await q(`insert into public.highlights (book, chapter, verse, color) values ('JHN', 3, 16, 'yellow')`);
        await q(`insert into public.notes (book, chapter, verse_start, verse_end, body) values ('JHN', 3, 16, 16, 'mine')`);
      });
      const seenByB = await asUser(db.client, b, async (q) => ({
        highlights: (await q(`select * from public.highlights where user_id = $1`, [a])).rowCount,
        notes: (await q(`select * from public.notes where user_id = $1`, [a])).rowCount,
      }));
      expect(seenByB).toEqual({ highlights: 0, notes: 0 });
      const seenByA = await asUser(db.client, a, async (q) => (await q(`select * from public.notes`)).rowCount);
      expect(seenByA).toBe(1);
    });

    it('stops users writing rows for someone else', async () => {
      const a = await createUser(db.client);
      const b = await createUser(db.client);
      await expect(
        asUser(db.client, a, (q) =>
          q(`insert into public.highlights (user_id, book, chapter, verse) values ($1, 'GEN', 1, 1)`, [b]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('lets users edit their profile but never make themselves admin', async () => {
      const a = await createUser(db.client);
      await asUser(db.client, a, (q) => q(`update public.profiles set bio = 'Hello' where id = $1`, [a]));
      await expect(asUser(db.client, a, (q) => q(`update public.profiles set is_admin = true where id = $1`, [a]))).rejects.toThrow(
        /permission denied/,
      );
    });

    it('hides private and friends-only profiles from other users', async () => {
      const a = await createUser(db.client);
      const b = await createUser(db.client);
      const visible = await asUser(db.client, b, async (q) => (await q(`select id from public.profiles where id = $1`, [a])).rowCount);
      expect(visible).toBe(0);
      await asUser(db.client, a, (q) => q(`update public.profiles set visibility = 'public' where id = $1`, [a]));
      const nowVisible = await asUser(db.client, b, async (q) => (await q(`select id from public.profiles where id = $1`, [a])).rowCount);
      expect(nowVisible).toBe(1);
    });

    it('lets signed-out visitors read Scripture and plans, but nothing personal', async () => {
      const result = await asUser(db.client, null, async (q) => ({
        verses: (await q(`select count(*)::int as n from public.bible_verses where book = 'JHN' and chapter = 3`)).rows[0].n,
        plans: (await q(`select count(*)::int as n from public.reading_plans`)).rows[0].n,
      }));
      expect(result.verses).toBe(36);
      expect(result.plans).toBe(9);
      await expect(asUser(db.client, null, (q) => q(`select * from public.notes`))).rejects.toThrow(/permission denied/);
    });

    it('blocks direct writes to streaks and internal functions', async () => {
      const a = await createUser(db.client);
      await expect(asUser(db.client, a, (q) => q(`update public.streaks set current = 999 where user_id = $1`, [a]))).rejects.toThrow(
        /permission denied/,
      );
      await expect(asUser(db.client, a, (q) => q(`select public.record_read($1, 'free')`, [a]))).rejects.toThrow(/permission denied/);
      await expect(asUser(db.client, a, (q) => q(`select * from public.due_reminders()`))).rejects.toThrow(/permission denied/);
    });

    it('validates chapters and reminder steps', async () => {
      const a = await createUser(db.client);
      await expect(asUser(db.client, a, (q) => q(`insert into public.highlights (book, chapter, verse) values ('JUD', 2, 1)`))).rejects.toThrow(
        /invalid_chapter/,
      );
      await expect(
        asUser(db.client, a, (q) => q(`update public.notification_settings set reminder_time = '08:10' where user_id = $1`, [a])),
      ).rejects.toThrow(/check constraint/);
    });
  });

  describe('plans and streaks', () => {
    it('runs the key flow: start plan, read, complete day', async () => {
      await setNow(db.client, '2026-10-29T08:00:00Z');
      const user = await createUser(db.client, { timezone: 'Europe/Zurich' });
      const plan = await planId('psalms-30');
      const today = await asUser(db.client, user, async (q) => {
        const enrolment = (await q(`select * from public.start_plan($1)`, [plan])).rows[0];
        const before = (await q(`select public.get_today() as t`)).rows[0].t;
        const done = (await q(`select public.complete_reading($1, 1, 'Psalm 1 felt like a fresh start') as r`, [enrolment.id])).rows[0].r;
        const after = (await q(`select public.get_today() as t`)).rows[0].t;
        return { before, done, after };
      });
      expect(today.before.streak).toEqual({ current: 0, longest: 0, freezes_left: 1, read_today: false });
      expect(today.before.plans[0]).toMatchObject({ slug: 'psalms-30', next_day: 1, completed: 0, readings: ['PSA.1-PSA.5'] });
      expect(today.done.streak).toMatchObject({ current: 1, counted: true, local_date: '2026-10-29' });
      expect(today.done.new_badges).toEqual(['first_reading']);
      expect(today.after.streak.read_today).toBe(true);
      expect(today.after.plans[0]).toMatchObject({ next_day: 2, completed: 1, completed_today: true });
      expect(today.after.days_read_last_7).toBe(1);
    });

    it('counts a day once even when several readings are done', async () => {
      await setNow(db.client, '2026-10-29T08:00:00Z');
      const user = await createUser(db.client);
      const result = await asUser(db.client, user, async (q) => {
        const e1 = (await q(`select * from public.start_plan($1)`, [await planId('hope')])).rows[0];
        const e2 = (await q(`select * from public.start_plan($1)`, [await planId('love')])).rows[0];
        await q(`select public.complete_reading($1, 1)`, [e1.id]);
        const second = (await q(`select public.complete_reading($1, 1) as r`, [e2.id])).rows[0].r;
        return second.streak;
      });
      expect(result).toMatchObject({ current: 1, counted: false });
    });

    it('refuses to complete the same day twice', async () => {
      const user = await createUser(db.client);
      await expect(
        asUser(db.client, user, async (q) => {
          const e = (await q(`select * from public.start_plan($1)`, [await planId('hope')])).rows[0];
          await q(`select public.complete_reading($1, 1)`, [e.id]);
          await q(`select public.complete_reading($1, 1)`, [e.id]);
        }),
      ).rejects.toThrow(/day_already_completed/);
    });

    it('keeps the streak with a freeze, then resets when none are left', async () => {
      const user = await createUser(db.client, { timezone: 'UTC' });
      const read = async (iso: string, book: string, chapter: number) => {
        await setNow(db.client, iso);
        return asUser(db.client, user, async (q) => (await q(`select public.log_free_reading($1, $2) as r`, [book, chapter])).rows[0].r.streak);
      };
      expect((await read('2026-11-01T09:00:00Z', 'JHN', 1)).current).toBe(1);
      expect((await read('2026-11-02T09:00:00Z', 'JHN', 2)).current).toBe(2);
      // 3 November missed: the starting freeze covers it.
      const afterFreeze = await read('2026-11-04T09:00:00Z', 'JHN', 3);
      expect(afterFreeze).toMatchObject({ current: 3, freezes_left: 0 });
      const freezeRow = await db.client.query(`select source from public.daily_activity where user_id = $1 and local_date = '2026-11-03'`, [user]);
      expect(freezeRow.rows[0].source).toBe('freeze');
      // 5 November missed, no freeze left.
      const afterReset = await read('2026-11-06T09:00:00Z', 'JHN', 4);
      expect(afterReset).toMatchObject({ current: 1, longest: 3 });
    });

    it('earns a freeze on the 7th day', async () => {
      const user = await createUser(db.client, { timezone: 'UTC' });
      let streak: Record<string, unknown> = {};
      for (let d = 1; d <= 7; d++) {
        await setNow(db.client, `2026-12-0${d}T09:00:00Z`);
        streak = await asUser(db.client, user, async (q) => (await q(`select public.log_free_reading('MRK', $1) as r`, [d])).rows[0].r.streak);
      }
      expect(streak).toMatchObject({ current: 7, freezes_left: 2, earned_freeze: true });
    });

    it('uses the user’s own timezone for “today”', async () => {
      // 11:30 UTC on 29 Oct is already 30 Oct 00:30 in Auckland (UTC+13).
      await setNow(db.client, '2026-10-29T11:30:00Z');
      const nz = await createUser(db.client, { timezone: 'Pacific/Auckland' });
      const uk = await createUser(db.client, { timezone: 'Europe/London' });
      const dateFor = async (user: string) =>
        asUser(db.client, user, async (q) => (await q(`select public.log_free_reading('GEN', 1) as r`)).rows[0].r.streak.local_date);
      expect(await dateFor(nz)).toBe('2026-10-30');
      expect(await dateFor(uk)).toBe('2026-10-29');
    });

    it('pauses, resumes and restarts a plan', async () => {
      const user = await createUser(db.client);
      const plan = await planId('learning-to-pray');
      await asUser(db.client, user, async (q) => {
        const e = (await q(`select * from public.start_plan($1)`, [plan])).rows[0];
        await q(`select public.complete_reading($1, 1)`, [e.id]);
        await q(`select public.set_plan_status($1, 'pause')`, [e.id]);
      });
      await expect(
        asUser(db.client, user, async (q) => {
          const e = (await q(`select id from public.plan_enrolments`)).rows[0];
          await q(`select public.complete_reading($1, 2)`, [e.id]);
        }),
      ).rejects.toThrow(/plan_paused/);
      const afterRestart = await asUser(db.client, user, async (q) => {
        const e = (await q(`select id from public.plan_enrolments`)).rows[0];
        await q(`select public.set_plan_status($1, 'resume')`, [e.id]);
        await q(`select public.set_plan_status($1, 'restart')`, [e.id]);
        return (await q(`select count(*)::int as n from public.day_completions where enrolment_id = $1`, [e.id])).rows[0].n;
      });
      expect(afterRestart).toBe(0);
      await expect(
        asUser(db.client, user, async (q) => {
          const e = (await q(`select id from public.plan_enrolments`)).rows[0];
          await q(`select public.set_plan_status($1, 'resume')`, [e.id]);
        }),
      ).rejects.toThrow(/invalid_transition/);
    });

    it('finishes a plan and awards the plan badge', async () => {
      const user = await createUser(db.client);
      const result = await asUser(db.client, user, async (q) => {
        const e = (await q(`select * from public.start_plan($1)`, [await planId('love')])).rows[0];
        let last;
        for (let day = 1; day <= 7; day++) last = (await q(`select public.complete_reading($1, $2) as r`, [e.id, day])).rows[0].r;
        const status = (await q(`select status from public.plan_enrolments where id = $1`, [e.id])).rows[0].status;
        return { last, status };
      });
      expect(result.status).toBe('finished');
      expect(result.last.finished_plan).toBe(true);
      expect(result.last.new_badges).toContain('first_plan');
    });

    it('awards the whole-book badge for reading every chapter of a book', async () => {
      const user = await createUser(db.client);
      const badges = await asUser(db.client, user, async (q) => (await q(`select public.log_free_reading('JUD', 1) as r`)).rows[0].r.new_badges);
      expect(badges).toEqual(['first_reading', 'first_book']);
    });

    it('rejects readings outside the canon', async () => {
      const user = await createUser(db.client);
      await expect(asUser(db.client, user, (q) => q(`select public.log_free_reading('JHN', 22)`))).rejects.toThrow(/invalid_chapter/);
    });

    it('settles everyone’s streak in the background job', async () => {
      await setNow(db.client, '2027-01-10T09:00:00Z');
      const user = await createUser(db.client, { timezone: 'UTC' });
      await asUser(db.client, user, (q) => q(`select public.log_free_reading('ACT', 1)`));
      await setNow(db.client, '2027-01-15T09:00:00Z');
      await asService(db.client, (q) => q(`select public.settle_all_streaks()`));
      const s = await db.client.query(`select current, freezes_left from public.streaks where user_id = $1`, [user]);
      expect(s.rows[0]).toEqual({ current: 0, freezes_left: 0 });
    });
  });

  describe('reminders', () => {
    async function subscribedUser(timezone: string, time = '08:00') {
      const user = await createUser(db.client, { timezone });
      await asUser(db.client, user, async (q) => {
        await q(`update public.notification_settings set reminder_time = $1 where user_id = $2`, [time, user]);
        await q(`insert into public.push_subscriptions (user_id, platform, endpoint) values ($1, 'web', $2)`, [
          user,
          `https://push.example/${user}`,
        ]);
      });
      return user;
    }
    const due = async () => (await asService(db.client, (q) => q(`select user_id from public.due_reminders()`))).rows.map((r) => r.user_id);

    it('is due in the 15 minutes after the chosen local time, once a day', async () => {
      const user = await subscribedUser('Europe/Zurich');
      await setNow(db.client, '2026-10-29T06:50:00Z'); // 07:50 in Zurich
      expect(await due()).not.toContain(user);
      await setNow(db.client, '2026-10-29T07:05:00Z'); // 08:05
      expect(await due()).toContain(user);
      await asService(db.client, (q) => q(`select public.log_notification($1, 'reminder', '2026-10-29')`, [user]));
      expect(await due()).not.toContain(user);
    });

    it('is not sent after the user has read today', async () => {
      const user = await subscribedUser('Europe/Zurich');
      await setNow(db.client, '2026-11-02T07:00:00Z');
      await asUser(db.client, user, (q) => q(`select public.log_free_reading('PSA', 1)`));
      expect(await due()).not.toContain(user);
    });

    it('respects quiet hours and the late-evening window', async () => {
      const quiet = await subscribedUser('UTC', '22:30');
      const late = await subscribedUser('UTC', '23:45');
      await asUser(db.client, late, (q) => q(`update public.notification_settings set quiet_start = null where user_id = $1`, [late]));
      await setNow(db.client, '2026-11-03T22:35:00Z');
      expect(await due()).not.toContain(quiet);
      await setNow(db.client, '2026-11-03T23:50:00Z');
      expect(await due()).toContain(late);
    });
  });

  describe('search', () => {
    it('finds verses by words and phrases', async () => {
      const hits = await asUser(db.client, null, (q) => q(`select * from public.search_bible('bsb', '"so loved the world"')`));
      expect(hits.rows.map((r) => `${r.book} ${r.chapter}:${r.verse}`)).toEqual(['JHN 3:16']);
    });
  });

  describe('data protection', () => {
    it('exports a user’s data and deletes the account completely', async () => {
      const user = await createUser(db.client);
      const exported = await asUser(db.client, user, async (q) => {
        await q(`insert into public.notes (book, chapter, verse_start, verse_end, body) values ('PSA', 23, 1, 1, 'note')`);
        return (await q(`select public.export_my_data() as d`)).rows[0].d;
      });
      expect(exported.notes).toHaveLength(1);
      expect(exported.profile.is_admin).toBeUndefined();
      await asUser(db.client, user, (q) => q(`select public.delete_my_account()`));
      const left = await db.client.query(
        `select (select count(*) from auth.users where id = $1)::int + (select count(*) from public.notes where user_id = $1)::int as n`,
        [user],
      );
      expect(left.rows[0].n).toBe(0);
    });
  });
});
