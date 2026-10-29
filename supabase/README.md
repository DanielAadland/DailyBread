# Database (Supabase)

Schema, row-level security, functions, seed data and Edge Functions.

| Folder | Contents |
| --- | --- |
| `migrations/` | SQL migrations, applied in file-name order |
| `seed/plans.sql` | The 9 ready-made reading plans (generated: `pnpm --filter @bible-app/db generate:plans`) |
| `seed/generated/bible_*.tsv` | Bible verses for search (generated: `pnpm bible:import`, not committed) |
| `seed/dev-sample-data.sql` | Sample users for local development only (refuses to run if real users exist) |
| `functions/send-reminders/` | Edge Function that sends the daily reminder by Web Push |
| `tests/` | Integration tests that run every migration on a fresh Postgres database |

## Set up the hosted project (once)

1. Create a free Supabase project, region **Central Europe (Zurich)**.
2. Apply the schema. With the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```sh
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   (Or paste each file in `migrations/` into the SQL editor, in order.)
3. Load the plans and the Bible text (the connection string is under Project Settings → Database):
   ```sh
   psql "$DATABASE_URL" -f supabase/seed/plans.sql
   psql "$DATABASE_URL" -c "\copy public.bible_verses (translation, book, book_order, chapter, verse, text) from 'supabase/seed/generated/bible_bsb.tsv'"
   psql "$DATABASE_URL" -c "\copy public.bible_verses (translation, book, book_order, chapter, verse, text) from 'supabase/seed/generated/bible_web.tsv'"
   ```
4. Auth → Providers: enable Email and Google. Auth → URL configuration: add the site URL and `http://localhost:8081`.
5. Reminders: generate VAPID keys (`npx web-push generate-vapid-keys`), then
   ```sh
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=<random>
   npx supabase functions deploy send-reminders --no-verify-jwt
   ```
   and schedule it in the SQL editor (pg_cron + pg_net are available on every Supabase project):
   ```sql
   select cron.schedule('send-reminders', '*/15 * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     );
   $$);
   ```
   The streak job (`settle-streaks`) is scheduled by the migrations.

## Run the database tests locally

The tests need a plain Postgres 15+ (no Supabase needed; `tests/supabase-stub.sql` stands in for Supabase's
`auth` schema and roles). Each run creates and drops its own database.

```sh
# default connection: postgres://postgres@localhost:54329/postgres
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres pnpm db:test
```

Tests can move the database clock with `set app.now = '2026-11-01T09:00:00Z'`; this only works in databases
where `app.allow_time_travel` is on, which the test helper sets and production never has.

## Rules that live in SQL

The streak, plan and reminder functions mirror `packages/core`. When a rule changes, change the core function,
its Vitest test, the SQL function and its test here together.
