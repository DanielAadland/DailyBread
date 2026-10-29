# DailyBread

A free, social Bible-reading app that makes reading Scripture a daily habit. No ads, no selling data,
no endless feed. The goal is more days per week with the Bible, not more minutes in an app.

Website first, then desktop (Tauri) and mobile (Expo).

## Status: Phase 3 (groups)

| Area | State |
| --- | --- |
| Accounts | Email sign-up and sign-in, password reset, onboarding. Google sign-in ready, switched on once configured. |
| Bible reader | BSB and WEB (public domain), book/chapter picker, highlights in 5 colours, bookmarks, private notes, copy, reference jump and word search, light/dark/sepia, text size, spacing |
| Reading plans | 9 ready-made plans, several at once, pause/resume/restart, daily reflection prompt |
| Daily habit | Streaks in the user's timezone, streak freezes, badges, "Done for today", the 7-day dawn arc |
| Reminders | One daily reminder by Web Push at a chosen time, quiet hours, daily cap, all switchable |
| Privacy | Notes and highlights always private, data export, account deletion, data stored in Zurich |
| Social | Public profiles, follow / follow requests, a feed that ends, verse shares from the reader, reflections from plan days, prayer requests, automatic milestone posts, reactions (Amen, Praying, Encouraged), live comments, notifications |
| Safety | Report posts, comments and people; block and mute; link and word filter; posting rate limits; moderation queue for admins; community guidelines |
| Groups | Small groups, churches, friends and families; public or invite-only with invite links; owner/admin/member roles; a shared reading plan with a conversation thread for each day; "who has read today", group streaks and gentle "cheer on" nudges; pinned posts and group moderation |
| Coming next | Phase 4: verse cards (daily set, card creator, sharing) |

## Try it locally

```sh
pnpm install
pnpm bible:import          # downloads the public-domain texts, builds the chapter files
pnpm dev                   # http://localhost:8081
```

Without Supabase settings the app runs in **demo mode**: everything works and your data stays in the browser.
To connect a Supabase project, copy `apps/app/.env.example` to `apps/app/.env` and fill in the public values.

## Tests

```sh
pnpm test                  # all unit tests, plus database tests if a Postgres is reachable
pnpm typecheck
```

Database tests run every migration on a fresh Postgres; see [supabase/README.md](supabase/README.md).

## Making someone a moderator

Moderators see **Profile → Moderation**. There is deliberately no button for this; run it in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true where username = 'their-username';
```

## Deployment

Every push to `main` runs CI (`.github/workflows/ci.yml`) and deploys (`.github/workflows/deploy.yml`):
migrations and seed data to Supabase, then the website to Cloudflare Pages.

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Where to find it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | `kgdhzdtpidgtxsloqfvp` |
| `SUPABASE_DB_PASSWORD` | The database password chosen when the project was created |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens ("Edit Cloudflare Workers" template) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard, right column |

Once, in the Supabase dashboard: Authentication → URL Configuration → set the Site URL to
`https://dailybread.pages.dev` and add `https://dailybread.pages.dev/reset-password` as a redirect URL.
Reminders and Google sign-in need a few more steps, listed in [supabase/README.md](supabase/README.md).

## Project layout

See [CLAUDE.md](CLAUDE.md) for structure, conventions and decisions.

Bible text: Berean Standard Bible (public domain) and World English Bible (public domain).
