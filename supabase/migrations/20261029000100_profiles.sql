-- Profiles, settings and the clock used by every date rule.

-- Tests can freeze the clock with `set app.now = '...'`, but only in a database where
-- `app.allow_time_travel` is on (never in production).
create function public.app_now() returns timestamptz
language sql stable
set search_path = ''
as $$
  select case
    when current_setting('app.allow_time_travel', true) = 'on'
     and coalesce(current_setting('app.now', true), '') <> ''
    then current_setting('app.now', true)::timestamptz
    else now()
  end
$$;

create function public.is_valid_timezone(p_tz text) returns boolean
language sql stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz)
$$;

create type public.profile_visibility as enum ('public', 'friends', 'private');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '' check (char_length(display_name) <= 50),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  bio text not null default '' check (char_length(bio) <= 160),
  -- Friends-only by default: the safest choice for a 13+ audience.
  visibility public.profile_visibility not null default 'friends',
  timezone text not null default 'UTC',
  translation text not null default 'bsb' check (translation in ('bsb', 'web')),
  -- Font size, line spacing, theme; synced across devices.
  reading_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(reading_prefs) = 'object'),
  onboarded boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per user. Never holds email or other auth data.';

create function public.profiles_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_valid_timezone(new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_before_write
before insert or update on public.profiles
for each row execute function public.profiles_before_write();

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profiles: read public" on public.profiles
  for select to authenticated using (visibility = 'public');

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Users may only change these columns; is_admin and timestamps are off limits.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, bio, visibility, timezone, translation, reading_prefs, onboarded)
  on public.profiles to authenticated;

-- Notification preferences (core: NotificationSettings).
create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reminders_enabled boolean not null default true,
  -- 15-minute steps: the reminder job runs every 15 minutes.
  reminder_time time not null default '08:00'
    check (extract(minute from reminder_time)::int % 15 = 0 and extract(second from reminder_time) = 0),
  quiet_start time default '22:00',
  quiet_end time default '07:00',
  daily_cap smallint not null default 3 check (daily_cap between 0 and 10),
  social_comments boolean not null default true,
  social_reactions boolean not null default false,
  social_nudges boolean not null default true,
  social_group_activity boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

create policy "notification_settings: own" on public.notification_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke insert, delete on public.notification_settings from anon, authenticated;
revoke all on public.notification_settings from anon;

-- Web Push / Expo push endpoints, one row per device.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('web', 'expo', 'desktop')),
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text,
  auth text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: own" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;

-- Every notification sent, for the once-a-day reminder rule and the daily cap.
create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'comment', 'reaction', 'nudge', 'group_activity')),
  local_date date not null,
  sent_at timestamptz not null default now()
);

create index notification_log_user_day_idx on public.notification_log (user_id, local_date);

alter table public.notification_log enable row level security;

create policy "notification_log: read own" on public.notification_log
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.notification_log from anon, authenticated;
revoke all on public.notification_log from anon;

-- The user's own calendar date right now.
create function public.user_local_date(p_user uuid) returns date
language sql stable
security definer
set search_path = ''
as $$
  select (public.app_now() at time zone coalesce((select p.timezone from public.profiles p where p.id = p_user), 'UTC'))::date
$$;

revoke execute on function public.user_local_date(uuid) from public, anon, authenticated;
