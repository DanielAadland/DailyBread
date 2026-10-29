-- Sample users and activity for LOCAL DEVELOPMENT ONLY.
-- Sign in with any of these, password `password123`:
--   anna@example.test   Zurich, 12-day streak, two plans in progress
--   luca@example.test   Rome, 3-day streak
--   sara@example.test   new user, nothing read yet
-- Refuses to run if the database has any real (non example.test) users.

do $$
begin
  if exists (select 1 from auth.users where email not like '%@example.test') then
    raise exception 'Refusing to add sample users to a database that has real users';
  end if;
end;
$$;

create extension if not exists pgcrypto with schema extensions;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'anna@example.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Anna","timezone":"Europe/Zurich"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'luca@example.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Luca","timezone":"Europe/Rome"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'sara@example.test',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Sara","timezone":"UTC"}', now(), now())
on conflict (id) do nothing;

update public.profiles set username = 'anna', bio = 'Reading through the Psalms this month.', visibility = 'public', onboarded = true
 where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set username = 'luca', visibility = 'friends', onboarded = true
 where id = '22222222-2222-2222-2222-222222222222';

-- Anna: Psalms plan days 1–12 and the Gospels plan days 1–3, read on each of the last 12 days.
insert into public.plan_enrolments (id, user_id, plan_id, started_at)
select '11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', id, now() - interval '12 days'
  from public.reading_plans where slug = 'psalms-30'
on conflict do nothing;
insert into public.plan_enrolments (id, user_id, plan_id, started_at)
select '11111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', id, now() - interval '3 days'
  from public.reading_plans where slug = 'gospels-30'
on conflict do nothing;

insert into public.day_completions (enrolment_id, day, local_date)
select '11111111-0000-0000-0000-000000000001', d, (now() at time zone 'Europe/Zurich')::date - (13 - d)
  from generate_series(1, 12) d
on conflict do nothing;
insert into public.day_completions (enrolment_id, day, local_date)
select '11111111-0000-0000-0000-000000000002', d, (now() at time zone 'Europe/Zurich')::date - (4 - d)
  from generate_series(1, 3) d
on conflict do nothing;

insert into public.daily_activity (user_id, local_date, source)
select '11111111-1111-1111-1111-111111111111', (now() at time zone 'Europe/Zurich')::date - d, 'plan'
  from generate_series(1, 12) d
on conflict do nothing;
update public.streaks
   set current = 12, longest = 12, freezes_left = 2,
       last_read_date = (now() at time zone 'Europe/Zurich')::date - 1,
       last_covered_date = (now() at time zone 'Europe/Zurich')::date - 1
 where user_id = '11111111-1111-1111-1111-111111111111';
insert into public.user_badges (user_id, badge) values
  ('11111111-1111-1111-1111-111111111111', 'first_reading'),
  ('11111111-1111-1111-1111-111111111111', 'streak_7')
on conflict do nothing;

insert into public.highlights (user_id, book, chapter, verse, color) values
  ('11111111-1111-1111-1111-111111111111', 'PSA', 23, 1, 'yellow'),
  ('11111111-1111-1111-1111-111111111111', 'PSA', 46, 10, 'blue')
on conflict do nothing;
insert into public.notes (user_id, book, chapter, verse_start, verse_end, body)
select '11111111-1111-1111-1111-111111111111', 'PSA', 46, 10, 10, 'Stillness is hard for me. Trying five quiet minutes each morning.'
 where not exists (select 1 from public.notes where user_id = '11111111-1111-1111-1111-111111111111' and book = 'PSA' and chapter = 46);

-- Luca: free reading in Mark on the last 3 days.
insert into public.daily_activity (user_id, local_date, source)
select '22222222-2222-2222-2222-222222222222', (now() at time zone 'Europe/Rome')::date - d, 'free'
  from generate_series(1, 3) d
on conflict do nothing;
insert into public.chapter_reads (user_id, book, chapter)
select '22222222-2222-2222-2222-222222222222', 'MRK', c from generate_series(1, 3) c
on conflict do nothing;
update public.streaks
   set current = 3, longest = 5, freezes_left = 1,
       last_read_date = (now() at time zone 'Europe/Rome')::date - 1,
       last_covered_date = (now() at time zone 'Europe/Rome')::date - 1
 where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.user_badges (user_id, badge) values ('22222222-2222-2222-2222-222222222222', 'first_reading')
on conflict do nothing;
