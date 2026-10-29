-- Reading plans, daily activity, streaks and badges.
-- The rules mirror packages/core (streak.ts, plans.ts, badges.ts); change both together.

-- Plans ---------------------------------------------------------------------

create type public.plan_category as enum ('whole_bible', 'new_testament', 'old_testament', 'book', 'topical');
create type public.enrolment_status as enum ('active', 'paused', 'finished');

create table public.reading_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  description text not null,
  category public.plan_category not null,
  days smallint not null check (days > 0),
  sort smallint not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- readings: JSON array of passage keys, e.g. ["GEN.1-GEN.3"] or ["PHP.4.4-PHP.4.9"].
create table public.plan_days (
  plan_id uuid not null references public.reading_plans (id) on delete cascade,
  day smallint not null check (day > 0),
  readings jsonb not null check (jsonb_typeof(readings) = 'array' and jsonb_array_length(readings) > 0),
  reflection_prompt text,
  primary key (plan_id, day)
);

create table public.plan_enrolments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.reading_plans (id) on delete cascade,
  status public.enrolment_status not null default 'active',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  times_finished int not null default 0,
  unique (user_id, plan_id)
);

create table public.day_completions (
  enrolment_id uuid not null references public.plan_enrolments (id) on delete cascade,
  day smallint not null,
  local_date date not null,
  -- Private reflection written after the reading. Only the owner can read it.
  reflection text check (reflection is null or char_length(reflection) <= 2000),
  completed_at timestamptz not null default now(),
  primary key (enrolment_id, day)
);

alter table public.reading_plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_enrolments enable row level security;
alter table public.day_completions enable row level security;

create policy "reading_plans: published are public" on public.reading_plans for select using (published);
create policy "plan_days: of published plans" on public.plan_days for select
  using (exists (select 1 from public.reading_plans p where p.id = plan_id and p.published));
create policy "plan_enrolments: read own" on public.plan_enrolments for select to authenticated
  using (user_id = (select auth.uid()));
create policy "day_completions: read own" on public.day_completions for select to authenticated
  using (exists (select 1 from public.plan_enrolments e where e.id = enrolment_id and e.user_id = (select auth.uid())));

-- Changes go through the functions below, never direct writes.
revoke insert, update, delete on public.reading_plans, public.plan_days, public.plan_enrolments, public.day_completions
  from anon, authenticated;
revoke all on public.plan_enrolments, public.day_completions from anon;

-- Activity and streaks --------------------------------------------------------

create type public.activity_source as enum ('plan', 'free', 'freeze');

-- One row per user per local day: read (plan or free reading) or covered by a freeze.
create table public.daily_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  source public.activity_source not null,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table public.streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current int not null default 0 check (current >= 0),
  longest int not null default 0 check (longest >= 0),
  freezes_left smallint not null default 1 check (freezes_left between 0 and 2),
  last_read_date date,
  last_covered_date date,
  updated_at timestamptz not null default now()
);

-- Chapters read in full (whole-chapter readings only), for the "first whole book" badge.
create table public.chapter_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book text not null references public.bible_books (id),
  chapter smallint not null,
  first_read_at timestamptz not null default now(),
  primary key (user_id, book, chapter)
);

create table public.badges (
  code text primary key,
  sort smallint not null
);

insert into public.badges (code, sort) values
  ('first_reading', 1), ('streak_7', 2), ('streak_30', 3), ('streak_100', 4), ('streak_365', 5),
  ('first_plan', 6), ('plans_5', 7), ('first_book', 8);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null references public.badges (code),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);

alter table public.daily_activity enable row level security;
alter table public.streaks enable row level security;
alter table public.chapter_reads enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

create policy "daily_activity: read own" on public.daily_activity for select to authenticated
  using (user_id = (select auth.uid()));
create policy "streaks: read own" on public.streaks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "chapter_reads: read own" on public.chapter_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy "badges: readable by all" on public.badges for select using (true);
create policy "user_badges: read own" on public.user_badges for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.daily_activity, public.streaks, public.chapter_reads, public.badges, public.user_badges
  from anon, authenticated;
revoke all on public.daily_activity, public.streaks, public.chapter_reads, public.user_badges from anon;

-- New users -------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := new.raw_user_meta_data ->> 'timezone';
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '');
begin
  if v_tz is null or not public.is_valid_timezone(v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.profiles (id, display_name, timezone)
  values (new.id, left(v_name, 50), v_tz);
  insert into public.notification_settings (user_id) values (new.id);
  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Internal helpers (not callable by clients) ------------------------------------

-- Chapters a passage key covers. `whole` is false when the key names verses.
create function public.passage_chapters(p_key text)
returns table (book text, chapter int, whole boolean)
language sql immutable
set search_path = ''
as $$
  with parts as (
    select split_part(p_key, '-', 1) as a,
           coalesce(nullif(split_part(p_key, '-', 2), ''), split_part(p_key, '-', 1)) as b
  )
  select split_part(a, '.', 1),
         g.c,
         split_part(a, '.', 3) = '' and split_part(b, '.', 3) = ''
  from parts,
       generate_series(split_part(a, '.', 2)::int, split_part(b, '.', 2)::int) as g(c)
$$;

-- Close every ended day not covered yet (core: settleStreak). Idempotent.
create function public.settle_streak(p_user uuid, p_today date) returns public.streaks
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.streaks;
  d date;
begin
  select * into s from public.streaks where user_id = p_user for update;
  if not found then
    insert into public.streaks (user_id) values (p_user) returning * into s;
  end if;
  if s.last_covered_date is null or s.current = 0 then
    return s;
  end if;

  d := s.last_covered_date + 1;
  while d < p_today loop
    if s.freezes_left > 0 and s.last_covered_date = d - 1 then
      s.freezes_left := s.freezes_left - 1;
      s.last_covered_date := d;
      insert into public.daily_activity (user_id, local_date, source)
      values (p_user, d, 'freeze') on conflict do nothing;
    else
      s.current := 0;
      exit;
    end if;
    d := d + 1;
  end loop;

  update public.streaks
     set current = s.current, freezes_left = s.freezes_left, last_covered_date = s.last_covered_date, updated_at = now()
   where user_id = p_user
  returning * into s;
  return s;
end;
$$;

-- Count today as read (core: recordRead). Returns the streak as the app shows it.
create function public.record_read(p_user uuid, p_source public.activity_source) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.user_local_date(p_user);
  s public.streaks;
  v_counted boolean := false;
  v_earned boolean := false;
  v_current int;
begin
  s := public.settle_streak(p_user, v_today);

  if s.last_read_date is distinct from v_today
     and (s.last_covered_date is null or v_today >= s.last_covered_date) then
    insert into public.daily_activity (user_id, local_date, source)
    values (p_user, v_today, p_source) on conflict (user_id, local_date) do nothing;

    v_current := case when s.last_covered_date = v_today - 1 then s.current + 1 else 1 end;
    -- STREAK_RULES: earn a freeze every 7th day, hold at most 2.
    v_earned := v_current % 7 = 0 and s.freezes_left < 2;

    update public.streaks
       set current = v_current,
           longest = greatest(longest, v_current),
           freezes_left = freezes_left + case when v_earned then 1 else 0 end,
           last_read_date = v_today,
           last_covered_date = v_today,
           updated_at = now()
     where user_id = p_user
    returning * into s;
    v_counted := true;
  end if;

  return jsonb_build_object(
    'local_date', v_today,
    'current', s.current,
    'longest', s.longest,
    'freezes_left', s.freezes_left,
    'read_today', true,
    'counted', v_counted,
    'earned_freeze', v_earned
  );
end;
$$;

-- Award every badge the user now qualifies for (core: newBadges). Returns the new codes.
create function public.award_badges(p_user uuid) returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int;
  v_longest int;
  v_plans int;
  v_books int;
  v_new text[];
begin
  select count(*) into v_days from public.daily_activity where user_id = p_user and source <> 'freeze';
  select coalesce(longest, 0) into v_longest from public.streaks where user_id = p_user;
  select coalesce(sum(times_finished), 0) into v_plans from public.plan_enrolments where user_id = p_user;
  select count(*) into v_books
    from public.bible_books b
   where b.chapters = (select count(*) from public.chapter_reads r where r.user_id = p_user and r.book = b.id);

  with earned as (
    insert into public.user_badges (user_id, badge)
    select p_user, b.code
      from public.badges b
     where case b.code
             when 'first_reading' then v_days >= 1
             when 'streak_7' then v_longest >= 7
             when 'streak_30' then v_longest >= 30
             when 'streak_100' then v_longest >= 100
             when 'streak_365' then v_longest >= 365
             when 'first_plan' then v_plans >= 1
             when 'plans_5' then v_plans >= 5
             when 'first_book' then v_books >= 1
             else false
           end
    on conflict do nothing
    returning badge
  )
  select coalesce(array_agg(e.badge order by b.sort), '{}') into v_new
    from earned e join public.badges b on b.code = e.badge;
  return v_new;
end;
$$;

revoke execute on function public.passage_chapters(text) from public, anon, authenticated;
revoke execute on function public.settle_streak(uuid, date) from public, anon, authenticated;
revoke execute on function public.record_read(uuid, public.activity_source) from public, anon, authenticated;
revoke execute on function public.award_badges(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Client functions (RPC) --------------------------------------------------------

create function public.require_user() returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- Everything the Today screen needs in one call.
create function public.get_today() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_today date := public.user_local_date(v_uid);
  s public.streaks;
begin
  s := public.settle_streak(v_uid, v_today);
  return jsonb_build_object(
    'local_date', v_today,
    'streak', jsonb_build_object(
      'current', s.current,
      'longest', s.longest,
      'freezes_left', s.freezes_left,
      'read_today', coalesce(s.last_read_date = v_today, false)
    ),
    'days_read_last_7', (
      select count(*) from public.daily_activity a
       where a.user_id = v_uid and a.source <> 'freeze' and a.local_date > v_today - 7 and a.local_date <= v_today
    ),
    -- The last 7 days, oldest first: 'read', 'freeze' or 'none'. Drives the Today screen's arc.
    'week', (
      select jsonb_agg(
               case when a.source is null then 'none' when a.source = 'freeze' then 'freeze' else 'read' end
               order by g2.d)
        from generate_series(0, 6) as g(n)
        cross join lateral (select v_today - 6 + g.n as d) g2(d)
        left join public.daily_activity a on a.user_id = v_uid and a.local_date = g2.d
    ),
    'plans', coalesce((
      select jsonb_agg(x.item order by x.started_at)
        from (
          select e.started_at,
                 jsonb_build_object(
                   'enrolment_id', e.id,
                   'plan_id', p.id,
                   'slug', p.slug,
                   'title', p.title,
                   'days', p.days,
                   'completed', (select count(*) from public.day_completions c where c.enrolment_id = e.id),
                   'completed_today', exists (
                     select 1 from public.day_completions c where c.enrolment_id = e.id and c.local_date = v_today
                   ),
                   'next_day', n.day,
                   'readings', d.readings,
                   'reflection_prompt', d.reflection_prompt
                 ) as item
            from public.plan_enrolments e
            join public.reading_plans p on p.id = e.plan_id
            left join lateral (
              select g.day from generate_series(1, p.days::int) as g(day)
               where not exists (select 1 from public.day_completions c where c.enrolment_id = e.id and c.day = g.day)
               order by g.day limit 1
            ) n on true
            left join public.plan_days d on d.plan_id = p.id and d.day = n.day
           where e.user_id = v_uid and e.status = 'active'
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

create function public.start_plan(p_plan uuid) returns public.plan_enrolments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  e public.plan_enrolments;
begin
  if not exists (select 1 from public.reading_plans where id = p_plan and published) then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  insert into public.plan_enrolments (user_id, plan_id)
  values (v_uid, p_plan)
  on conflict (user_id, plan_id) do update
    set status = case when public.plan_enrolments.status = 'paused' then 'active'::public.enrolment_status
                      else public.plan_enrolments.status end
  returning * into e;
  return e;
end;
$$;

-- core: nextStatus. Restart clears progress but keeps the "finished" count for badges.
create function public.set_plan_status(p_enrolment uuid, p_action text) returns public.plan_enrolments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  e public.plan_enrolments;
begin
  select * into e from public.plan_enrolments where id = p_enrolment and user_id = v_uid for update;
  if not found then
    raise exception 'enrolment_not_found' using errcode = 'P0002';
  end if;

  if p_action = 'pause' and e.status = 'active' then
    update public.plan_enrolments set status = 'paused' where id = e.id returning * into e;
  elsif p_action = 'resume' and e.status = 'paused' then
    update public.plan_enrolments set status = 'active' where id = e.id returning * into e;
  elsif p_action = 'restart' then
    delete from public.day_completions where enrolment_id = e.id;
    update public.plan_enrolments
       set status = 'active', started_at = now(), finished_at = null
     where id = e.id returning * into e;
  else
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  return e;
end;
$$;

-- Mark a plan day as read (core: canCompleteDay), count today, award badges.
create function public.complete_reading(p_enrolment uuid, p_day int, p_reflection text default null) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  e public.plan_enrolments;
  v_days int;
  v_readings jsonb;
  v_streak jsonb;
  v_finished boolean := false;
  v_reflection text := nullif(btrim(p_reflection), '');
begin
  select * into e from public.plan_enrolments where id = p_enrolment and user_id = v_uid for update;
  if not found then
    raise exception 'enrolment_not_found' using errcode = 'P0002';
  end if;
  if e.status = 'paused' then
    raise exception 'plan_paused' using errcode = '22023';
  end if;
  if e.status = 'finished' then
    raise exception 'plan_finished' using errcode = '22023';
  end if;

  select p.days, d.readings into v_days, v_readings
    from public.reading_plans p
    left join public.plan_days d on d.plan_id = p.id and d.day = p_day
   where p.id = e.plan_id;
  if p_day is null or p_day < 1 or p_day > v_days or v_readings is null then
    raise exception 'day_out_of_range' using errcode = '22023';
  end if;
  if v_reflection is not null and char_length(v_reflection) > 2000 then
    raise exception 'reflection_too_long' using errcode = '22001';
  end if;

  insert into public.day_completions (enrolment_id, day, local_date, reflection)
  values (e.id, p_day, public.user_local_date(v_uid), v_reflection)
  on conflict do nothing;
  if not found then
    raise exception 'day_already_completed' using errcode = '23505';
  end if;

  insert into public.chapter_reads (user_id, book, chapter)
  select v_uid, pc.book, pc.chapter
    from jsonb_array_elements_text(v_readings) as k(key)
    cross join lateral public.passage_chapters(k.key) pc
   where pc.whole
  on conflict do nothing;

  v_streak := public.record_read(v_uid, 'plan');

  if (select count(*) from public.day_completions where enrolment_id = e.id) >= v_days then
    update public.plan_enrolments
       set status = 'finished', finished_at = now(), times_finished = times_finished + 1
     where id = e.id;
    v_finished := true;
  end if;

  return jsonb_build_object(
    'day', p_day,
    'streak', v_streak,
    'finished_plan', v_finished,
    'new_badges', to_jsonb(public.award_badges(v_uid))
  );
end;
$$;

-- Reading outside a plan also counts for the day.
create function public.log_free_reading(p_book text, p_chapter int) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_streak jsonb;
begin
  if not public.is_valid_chapter(p_book, p_chapter) then
    raise exception 'invalid_chapter' using errcode = '22023';
  end if;
  insert into public.chapter_reads (user_id, book, chapter)
  values (v_uid, p_book, p_chapter) on conflict do nothing;
  v_streak := public.record_read(v_uid, 'free');
  return jsonb_build_object('streak', v_streak, 'new_badges', to_jsonb(public.award_badges(v_uid)));
end;
$$;

revoke execute on function public.get_today() from public, anon;
revoke execute on function public.start_plan(uuid) from public, anon;
revoke execute on function public.set_plan_status(uuid, text) from public, anon;
revoke execute on function public.complete_reading(uuid, int, text) from public, anon;
revoke execute on function public.log_free_reading(text, int) from public, anon;
grant execute on function public.get_today() to authenticated;
grant execute on function public.start_plan(uuid) to authenticated;
grant execute on function public.set_plan_status(uuid, text) to authenticated;
grant execute on function public.complete_reading(uuid, int, text) to authenticated;
grant execute on function public.log_free_reading(text, int) to authenticated;
