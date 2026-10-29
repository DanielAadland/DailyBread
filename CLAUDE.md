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
| End-to-end tests | `pnpm --filter app test:e2e` (after a demo-mode web build) |

## Layout

```
apps/app        Expo app (web, iOS, Android). Routes in src/app/, other code in src/.
packages/core   Pure TypeScript rules: dates, streaks, plan progress, notifications, badges. No UI, no I/O.
packages/bible  Book list, reference parser, BibleProvider interface, text import scripts.
packages/i18n   Translation files (en.json) and i18next setup.
supabase/       SQL migrations (schema, RLS, functions), seed data, Edge Functions, DB tests.
```

### App architecture (apps/app/src)

```
app/            Routes (Expo Router). (auth) sign-in/up, onboarding, (tabs) today/read/feed/plans/profile, legal.
                feed/: feed, compose, post/[id], people, notifications, u/[username]. profile/moderation: admin queue.
api/            Backend interface (types.ts) with two implementations:
                  supabase-backend.ts  production (Supabase Auth, tables with RLS, RPC functions)
                  demo-backend.ts      no server: data in AsyncStorage, rules from @bible-app/core
                  demo-social.ts       the social half of the demo backend, with seeded people (Sam, Jo, Maria)
                hooks.ts (React Query), access.ts (which area a visitor belongs in), BackendProvider.tsx
bible/          StaticBibleProvider setup, chapter/passage hooks, book names, last-read position
theme/          Design tokens ("first light" palette, Literata + Figtree, spacing) and ThemeProvider
ui/             Txt, Button, Screen, TextField, DawnArc, VerseList, settings panels, small parts in misc.tsx;
                social parts: PostCard, PersonRow, FollowButton, Avatar, ActionSheet, ReportDialog
lib/            Web Push subscription, time helpers
```

- Demo mode is on whenever `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are missing. Keep both backends in step:
  a new feature adds a method to `Backend` and implements it in both.
- Access control in the UI: each area's layout redirects with `useAccess()` (signed out → `/sign-in`,
  new user → `/onboarding`). Don't use `Stack.Protected`: its automatic redirect lands on `/(auth)`, which
  has no page.
- Navigation: use `Button href=…` or `router.push`. Don't wrap a Pressable in `<Link asChild>`: on web the
  Pressable's style function is lost (layout breaks).
- `npx expo install` can't reach Expo's servers from the build workspace; take versions from
  `node_modules/expo/bundledNativeModules.json` and `pnpm add` them.
- Toggle buttons (reactions) use `aria-pressed`; `accessibilityState.selected` is not rendered on web buttons.
- Inactive tab screens stay mounted (aria-hidden), so e2e locators may match twice: use `getByRole` and `.first()`.
- Social rules (visibility, content filter, rate limits, feed window) live in `packages/core/src/social.ts` and are
  mirrored in `supabase/migrations/20261030000100_social.sql`. All social writes go through RPCs; tables have no
  direct write grants.
- Visual check: `pnpm --filter app build:web`, serve `apps/app/dist`, screenshot with headless Chromium.

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
| 2026-10-29 | Demo backend alongside Supabase | The app is usable and testable before (and without) a server; exercises the core rules in the client. |
| 2026-10-29 | Reminder times on 15-minute steps; quoted search phrases also matched literally | One job run per reminder; Postgres full-text search drops small words. |
| 2026-10-29 | Deploy through GitHub Actions (Supabase CLI + Cloudflare Pages) | The build workspace can't reach Supabase or Cloudflare; secrets stay in GitHub. |
| 2026-10-29 | Web output "single" (SPA) for now | Simplest with client-side auth; static rendering can come later for faster first load. |
| 2026-10-30 | Feed: people you follow + yourself, newest first, last 14 days, pages of 20 behind a "Show older posts" button, then "You're all caught up" | The brief's "feeds end" rule; no infinite scroll. Light ranking can come later. |
| 2026-10-30 | Visibility: public = follow instantly, friends = follow request, private = can't be found or followed | One setting covers profile and posts; teens can stay private. |
| 2026-10-30 | Verse posts store a snapshot of the verse text and translation | The post reads the same even if the user switches translation; text is public domain. |
| 2026-10-30 | Automatic filter: no links, a small blocked-word list (with leetspeak normalisation), length limits; rate limits 10 posts/day, 20 comments/hour, 20 reports/day | Cheap first line of defence; moderators handle the rest. |
| 2026-10-30 | Moderation lives in the app at /profile/moderation (admins only, `profiles.is_admin`) instead of a separate admin app | One codebase to maintain; RPCs check admin rights server-side. |
| 2026-10-30 | Milestone posts are automatic only when "Share milestones" is on (default on); each can be hidden | Celebrates progress without forcing it. "First reading" is never posted. |
| 2026-10-30 | Social push (comments, reactions, follows) through the same Edge Function as reminders, same daily cap and quiet hours | One delivery path; respects the notification limits from the brief. |

## Environment

- Secrets only in `.env` files (never committed). See `apps/app/.env.example`.
- The Supabase service-role key is never used in the app, only in Edge Functions and scripts.
