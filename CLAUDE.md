# Bible app: project notes

Free, social Bible-reading app. Web first (Expo web), then desktop (Tauri), then iOS/Android (Expo).
The goal metric is **days per week people read**, not time in the app.

## Commands

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Web dev server | `pnpm dev` (Expo web on http://localhost:8081) |
| All unit tests | `pnpm test` |
| Typecheck | `pnpm typecheck` |
| Rebuild Bible text | `pnpm bible:import` (downloads sources, writes `apps/app/public/bible/` and `supabase/seed/generated/`) |
| Database tests | `pnpm db:test` (needs a local Postgres, see `supabase/README.md`) |
| Web build | `pnpm --filter app build:web` → `apps/app/dist` |

## Layout

```
apps/app        Expo app (web, iOS, Android). Routes in src/app/, other code in src/.
packages/core   Pure TypeScript rules: dates, streaks, plan progress, notifications, badges. No UI, no I/O.
packages/bible  Book list, reference parser, BibleProvider interface, text import scripts.
packages/i18n   Translation files (en.json) and i18next setup.
supabase/       SQL migrations (schema, RLS, functions), seed data, Edge Functions, DB tests.
```

## Conventions

- TypeScript strict everywhere, including `noUncheckedIndexedAccess`.
- **No hard-coded UI text.** Every user-facing string goes through i18n (`t('key')`), keys in `packages/i18n/src/en.json`.
- Business rules live in `packages/core` and are covered by Vitest tests. The app and the SQL functions follow those rules;
  when a rule changes, change the core function, its test, and the matching SQL function together.
- Dates the user sees ("today", streak days) are **local dates in the user's timezone** (`YYYY-MM-DD` strings).
- Passages are stored as book + chapter + verse range (`PassageRange`, key form `JHN.3.16-JHN.3.18`), never as text.
- Copy tone: warm, calm, never guilt-tripping, no fake urgency, theologically neutral (no doctrinal positions).
- Feeds always end ("You're all caught up"). No infinite scrolling of non-Scripture content.
- Accessibility: every interactive element has an accessible label; text scales; contrast meets WCAG AA in all themes.
- Install Expo packages with `npx expo install <pkg>` inside `apps/app` so versions match the SDK.
- Small commits with clear messages: `area: what changed` (e.g. `core: add streak freezes`).

## Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-29 | Bible text: BSB (default) and WEB, both public domain | No licence limits: verse images, caching and offline all allowed. NLT later only with Tyndale's written permission, through a server-side `BibleProvider`. |
| 2026-10-29 | BSB source: scrollmapper/bible_databases JSON; WEB source: seven1m/open-bibles USFX | Complete texts in English versification. The BibleNLP eBible corpus was rejected: it loses verses where versification differs (e.g. Joel 2:28–3:21). |
| 2026-10-29 | Bible chapters served as static JSON from the web host; Postgres holds a copy only for search | Instant reader, CDN caching, no database egress for reading. |
| 2026-10-29 | Stack: Expo (React Native + web) + Supabase (Zurich, eu-central-2), Tauri for desktop later | ~90% code shared across platforms; data in Switzerland. |
| 2026-10-29 | Styling with React Native StyleSheet + theme tokens instead of NativeWind | Fewer build moving parts; light/dark/sepia themes are needed for the reader anyway. |
| 2026-10-29 | Sign-in: email + Google in v1, Apple in Phase 6 | Apple sign-in needs the paid Apple Developer account. |
| 2026-10-29 | Streak freezes: start with 1, earn 1 every 7 streak days, max 2; a freeze keeps the streak but does not add to it | Forgiving without being gameable. |
| 2026-10-29 | Plan days can be completed in any order; no "behind schedule" messages | Catching up should feel good, not guilty. |

## Environment

- Secrets only in `.env` files (never committed). See `apps/app/.env.example`.
- The Supabase service-role key is never used in the app, only in Edge Functions and scripts.
