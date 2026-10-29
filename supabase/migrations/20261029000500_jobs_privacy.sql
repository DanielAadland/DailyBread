-- Background jobs (streak settling, reminders) and data-protection functions.

-- Jobs ---------------------------------------------------------------------------

-- Settle streaks of everyone whose local day has ended without reading. Run every 15 minutes.
create function public.settle_all_streaks() returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select s.user_id, public.user_local_date(s.user_id) as today
      from public.streaks s
     where s.current > 0
       and s.last_covered_date < public.user_local_date(s.user_id) - 1
  loop
    perform public.settle_streak(r.user_id, r.today);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create function public.in_quiet_hours(p_now time, p_start time, p_end time) returns boolean
language sql immutable
set search_path = ''
as $$
  -- core: inQuietHours. Equal or missing bounds = no quiet hours; ranges may wrap past midnight.
  select case
    when p_start is null or p_end is null or p_start = p_end then false
    when p_start < p_end then p_now >= p_start and p_now < p_end
    else p_now >= p_start or p_now < p_end
  end
$$;

-- Push endpoints of users whose daily reminder is due now (core: decideReminder, 15-minute window).
create function public.due_reminders()
returns table (user_id uuid, local_date date, subscription_id uuid, platform text, endpoint text, p256dh text, auth text)
language sql stable
security definer
set search_path = ''
as $$
  with candidates as (
    select n.user_id,
           (public.app_now() at time zone p.timezone)::date as local_date,
           (public.app_now() at time zone p.timezone)::time as local_time,
           n.reminder_time, n.quiet_start, n.quiet_end, n.daily_cap
      from public.notification_settings n
      join public.profiles p on p.id = n.user_id
     where n.reminders_enabled
  )
  select c.user_id, c.local_date, ps.id, ps.platform, ps.endpoint, ps.p256dh, ps.auth
    from candidates c
    join public.push_subscriptions ps on ps.user_id = c.user_id
   -- Reminder times are on 15-minute steps and the job runs every 15 minutes, so each reminder
   -- falls in exactly one run. time + interval wraps at midnight, hence the 23:45 case.
   where c.local_time >= c.reminder_time
     and (c.reminder_time >= time '23:45' or c.local_time < c.reminder_time + interval '15 minutes')
     and not public.in_quiet_hours(c.local_time, c.quiet_start, c.quiet_end)
     and not exists (
       select 1 from public.streaks s where s.user_id = c.user_id and s.last_read_date = c.local_date
     )
     and not exists (
       select 1 from public.notification_log l
        where l.user_id = c.user_id and l.local_date = c.local_date and l.kind = 'reminder'
     )
     and (select count(*) from public.notification_log l where l.user_id = c.user_id and l.local_date = c.local_date) < c.daily_cap
$$;

create function public.log_notification(p_user uuid, p_kind text, p_local_date date) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_log (user_id, kind, local_date) values (p_user, p_kind, p_local_date)
$$;

revoke execute on function public.settle_all_streaks() from public, anon, authenticated;
revoke execute on function public.due_reminders() from public, anon, authenticated;
revoke execute on function public.log_notification(uuid, text, date) from public, anon, authenticated;
grant execute on function public.settle_all_streaks() to service_role;
grant execute on function public.due_reminders() to service_role;
grant execute on function public.log_notification(uuid, text, date) to service_role;

-- Schedule the streak job where pg_cron exists (Supabase). The reminder job calls an Edge Function
-- and is scheduled per project; see supabase/README.md.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('settle-streaks', '*/15 * * * *', 'select public.settle_all_streaks()');
  end if;
end;
$$;

-- Data protection (GDPR / Swiss FADP) ------------------------------------------------

-- Everything stored about the caller, as one JSON document.
create function public.export_my_data() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'is_admin' from public.profiles p where p.id = v_uid),
    'notification_settings', (select to_jsonb(n) from public.notification_settings n where n.user_id = v_uid),
    'streak', (select to_jsonb(s) from public.streaks s where s.user_id = v_uid),
    'daily_activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.local_date) from public.daily_activity a where a.user_id = v_uid), '[]'),
    'highlights', coalesce((select jsonb_agg(to_jsonb(h)) from public.highlights h where h.user_id = v_uid), '[]'),
    'bookmarks', coalesce((select jsonb_agg(to_jsonb(b)) from public.bookmarks b where b.user_id = v_uid), '[]'),
    'notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.notes n where n.user_id = v_uid), '[]'),
    'plans', coalesce((
      select jsonb_agg(to_jsonb(e) || jsonb_build_object(
        'completions', coalesce((select jsonb_agg(to_jsonb(c) order by c.day) from public.day_completions c where c.enrolment_id = e.id), '[]')
      ))
      from public.plan_enrolments e where e.user_id = v_uid
    ), '[]'),
    'badges', coalesce((select jsonb_agg(to_jsonb(b)) from public.user_badges b where b.user_id = v_uid), '[]'),
    'push_subscriptions', (select count(*) from public.push_subscriptions s where s.user_id = v_uid)
  );
end;
$$;

-- Permanently deletes the caller's account and everything that belongs to it.
create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
