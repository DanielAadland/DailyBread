-- Phase 3: groups, group reading plans, daily discussion threads, group streaks and nudges.
-- Rules mirror packages/core/src/groups.ts (canInGroup, canRemoveMember, canChangeRole, groupPlanDay,
-- groupDayCounts, groupStreak, GROUP_LIMITS, INVITE_ALPHABET).

-- Types and tables --------------------------------------------------------------------------

create type public.group_kind as enum ('small_group', 'church', 'friends', 'family');
create type public.group_access as enum ('public', 'invite');
create type public.group_role as enum ('owner', 'admin', 'member');

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 60),
  description text not null default '' check (char_length(description) <= 500),
  kind public.group_kind not null,
  access public.group_access not null,
  invite_code text not null unique check (invite_code ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{10}$'),
  -- The group's reading plan: everyone reads day N on the N-th day after plan_start.
  plan_id uuid references public.reading_plans (id) on delete set null,
  plan_start date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index groups_name_idx on public.groups (lower(name));

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
-- Exactly one owner per group (the "at least one" part is kept by the functions and the trigger below).
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';

-- Posts can belong to a group (members only) and to one day of the group's plan (the day's thread).
alter table public.posts
  add column group_id uuid references public.groups (id) on delete cascade,
  add column group_day smallint check (group_day is null or group_day > 0),
  add column pinned_at timestamptz,
  add constraint posts_group_day_needs_group check (group_day is null or group_id is not null),
  add constraint posts_pin_needs_group check (pinned_at is null or group_id is not null);
create index posts_group_idx on public.posts (group_id, created_at desc) where group_id is not null;
create index posts_group_day_idx on public.posts (group_id, group_day, created_at) where group_day is not null;

-- Nudges ("Anna is cheering you on") point at the group they came from.
alter type public.notification_kind add value if not exists 'nudge';
alter table public.notifications add column group_id uuid references public.groups (id) on delete cascade;

-- Helpers ------------------------------------------------------------------------------------

create function public.group_role_of(p_user uuid, p_group uuid) returns public.group_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.group_members where group_id = p_group and user_id = p_user
$$;

create function public.is_group_member(p_user uuid, p_group uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = p_user)
$$;

-- core: canInGroup (ranks member < admin < owner).
create function public.group_can(p_role public.group_role, p_min public.group_role) returns boolean
language sql immutable
set search_path = ''
as $$
  select p_role is not null and (case p_role when 'owner' then 3 when 'admin' then 2 else 1 end)
                              >= (case p_min when 'owner' then 3 when 'admin' then 2 else 1 end)
$$;

-- Raises unless the signed-in user has at least p_min in the group; returns their role.
create function public.require_group_role(p_group uuid, p_min public.group_role) returns public.group_role
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_role public.group_role := public.group_role_of(public.require_user(), p_group);
begin
  if v_role is null then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if not public.group_can(v_role, p_min) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- INVITE_ALPHABET, 10 characters; retried on the (very unlikely) clash.
create function public.new_invite_code() returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 31)::int, 1), '') into v_code
      from generate_series(1, 10);
    exit when not exists (select 1 from public.groups where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- A member's local date (their own timezone).
create function public.member_today(p_user uuid) returns date
language sql stable security definer
set search_path = ''
as $$
  select public.user_local_date(p_user)
$$;

-- core: MemberToday. 'plan_day' = finished the group's day N; 'read' = read anything today; else 'not_yet'.
create function public.member_today_status(p_user uuid, p_plan uuid, p_day int) returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when p_plan is not null and p_day is not null and exists (
      select 1 from public.day_completions dc
        join public.plan_enrolments e on e.id = dc.enrolment_id
       where e.user_id = p_user and e.plan_id = p_plan and dc.day = p_day) then 'plan_day'
    when exists (
      select 1 from public.daily_activity a
       where a.user_id = p_user and a.local_date = public.user_local_date(p_user) and a.source <> 'freeze') then 'read'
    else 'not_yet'
  end
$$;

-- core: groupStreak / groupDayCounts. Days count when at least half of the members who had
-- joined by then read (streak freezes don't count). Today only adds once it counts.
create function public.group_streak(p_group uuid, p_today date) returns int
language plpgsql stable security definer
set search_path = ''
as $$
declare
  r record;
  v_streak int := 0;
begin
  for r in
    with members as (
      select m.user_id, (m.joined_at at time zone coalesce(pr.timezone, 'UTC'))::date as joined_on
        from public.group_members m join public.profiles pr on pr.id = m.user_id
       where m.group_id = p_group
    ), days as (
      select generate_series(p_today - 400, p_today, interval '1 day')::date as d
    )
    select days.d,
           (select count(*) from members where members.joined_on <= days.d) as members,
           (select count(distinct a.user_id) from public.daily_activity a
              join members on members.user_id = a.user_id and members.joined_on <= days.d
             where a.local_date = days.d and a.source <> 'freeze') as readers
      from days
     order by days.d desc
  loop
    if r.members > 0 and r.readers * 2 >= r.members then
      v_streak := v_streak + 1;
    elsif r.d <> p_today then
      exit;
    end if;
  end loop;
  return v_streak;
end;
$$;

-- core: groupPlanDay, for the viewer's local date.
create function public.group_plan_json(p_group public.groups, p_today date) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  p public.reading_plans;
  v_n int;
  v_day int;
  v_status text;
begin
  if p_group.plan_id is null or p_group.plan_start is null then
    return null;
  end if;
  select * into p from public.reading_plans where id = p_group.plan_id;
  if not found then
    return null;
  end if;
  v_n := (p_today - p_group.plan_start) + 1;
  v_status := case when v_n < 1 then 'not_started' when v_n > p.days then 'finished' else 'active' end;
  v_day := case when v_status = 'active' then v_n end;
  return jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title, 'days', p.days,
    'start', p_group.plan_start, 'status', v_status, 'day', v_day,
    'readings', (select d.readings from public.plan_days d where d.plan_id = p.id and d.day = v_day)
  );
end;
$$;

-- A group as the viewer may see it. Members get the invite code, streak and today's numbers.
create function public.group_json(p_group public.groups, p_viewer uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_role public.group_role := public.group_role_of(p_viewer, p_group.id);
  v_today date := public.user_local_date(p_viewer);
  v_plan jsonb := public.group_plan_json(p_group, v_today);
  v_day int := (v_plan ->> 'day')::int;
  v_members int;
  v_readers int;
begin
  select count(*),
         count(*) filter (where exists (
           select 1 from public.daily_activity a
            where a.user_id = m.user_id and a.local_date = public.user_local_date(m.user_id) and a.source <> 'freeze'))
    into v_members, v_readers
    from public.group_members m where m.group_id = p_group.id;

  return jsonb_build_object(
    'id', p_group.id,
    'name', p_group.name,
    'description', p_group.description,
    'kind', p_group.kind,
    'access', p_group.access,
    'created_at', p_group.created_at,
    'member_count', v_members,
    'my_role', v_role,
    'invite_code', case when v_role is not null then p_group.invite_code end,
    'plan', v_plan,
    'readers_today', v_readers,
    'streak', public.group_streak(p_group.id, v_today),
    'my_today', case when v_role is not null then public.member_today_status(p_viewer, p_group.plan_id, v_day) end
  );
end;
$$;

-- Comment authors are visible in group posts to every member (unless blocked); elsewhere by profile rules.
create function public.can_see_in_post(p_viewer uuid, p_author uuid, p_post uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when p_viewer = p_author then true
    when (select group_id from public.posts where id = p_post) is not null then
      not public.is_blocked(p_viewer, p_author)
      and coalesce((select suspended_until is null or suspended_until <= now() from public.profiles where id = p_author), false)
    else public.can_see_user(p_viewer, p_author)
  end
$$;

-- Group posts: members only (and not someone they blocked). Other posts as before.
create or replace function public.can_see_post(p_viewer uuid, p_post uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
     where p.id = p_post and p.removed_at is null
       and (not p.hidden or p.author_id = p_viewer)
       and case
             when p.group_id is not null then
               public.is_group_member(p_viewer, p.group_id) and public.can_see_in_post(p_viewer, p.author_id, p.id)
             else public.can_see_user(p_viewer, p.author_id)
           end
  )
$$;

create or replace function public.post_json(p_post public.posts, p_viewer uuid) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_post.id,
    'type', p_post.type,
    'passage', p_post.passage,
    'translation', p_post.translation,
    'verse_text', p_post.verse_text,
    'body', p_post.body,
    'milestone', p_post.milestone,
    'hidden', p_post.hidden,
    'created_at', p_post.created_at,
    'is_mine', p_post.author_id = p_viewer,
    'author', public.person_json(p_post.author_id),
    'reactions', jsonb_build_object(
      'amen', (select count(*) from public.reactions r where r.post_id = p_post.id and r.kind = 'amen'),
      'praying', (select count(*) from public.reactions r where r.post_id = p_post.id and r.kind = 'praying'),
      'encouraged', (select count(*) from public.reactions r where r.post_id = p_post.id and r.kind = 'encouraged')
    ),
    'my_reaction', (select r.kind from public.reactions r where r.post_id = p_post.id and r.user_id = p_viewer),
    'comment_count', (
      select count(*) from public.comments c
       where c.post_id = p_post.id and c.removed_at is null
         and public.can_see_in_post(p_viewer, c.author_id, p_post.id)
    ),
    'group', case when p_post.group_id is null then null else (
      select jsonb_build_object('id', g.id, 'name', g.name) from public.groups g where g.id = p_post.group_id) end,
    'group_day', p_post.group_day,
    'pinned', p_post.pinned_at is not null,
    'can_moderate', p_post.group_id is not null and public.group_can(public.group_role_of(p_viewer, p_post.group_id), 'admin')
  )
$$;

drop policy "comments: visible" on public.comments;
create policy "comments: visible" on public.comments for select to authenticated
  using (removed_at is null and public.can_see_post((select auth.uid()), post_id)
         and public.can_see_in_post((select auth.uid()), author_id, post_id));

-- Row-level security: members read their groups and memberships; all writes go through functions.
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
create policy "groups: members" on public.groups for select to authenticated
  using (public.is_group_member((select auth.uid()), id));
create policy "group_members: same group" on public.group_members for select to authenticated
  using (public.is_group_member((select auth.uid()), group_id));
revoke insert, update, delete on public.groups, public.group_members from anon, authenticated;
revoke all on public.groups, public.group_members from anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.posts;
  end if;
end;
$$;

-- When the owner's account is deleted, the longest-serving admin (else member) takes over;
-- an empty group is deleted.
create function public.group_members_after_delete() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' or not exists (select 1 from public.groups where id = old.group_id) then
    return null;
  end if;
  if exists (select 1 from public.group_members where group_id = old.group_id) then
    update public.group_members set role = 'owner'
     where (group_id, user_id) = (
       select group_id, user_id from public.group_members
        where group_id = old.group_id
        order by (role = 'admin') desc, joined_at
        limit 1);
  else
    delete from public.groups where id = old.group_id;
  end if;
  return null;
end;
$$;
create trigger group_members_after_delete after delete on public.group_members
  for each row execute function public.group_members_after_delete();

-- Creating and editing groups ----------------------------------------------------------------

-- core: checkGroupInput. Returns the cleaned name and description.
create function public.check_group_input(p_name text, p_description text, out name text, out description text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  name := btrim(coalesce(p_name, ''));
  if char_length(name) < 3 then
    raise exception 'group_name_too_short' using errcode = '22023';
  end if;
  if char_length(name) > 60 then
    raise exception 'group_name_too_long' using errcode = '22001';
  end if;
  name := public.check_content(name, 60);
  description := public.check_content(p_description, 500, true);
end;
$$;

create function public.check_group_plan(p_plan uuid, p_start date) returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if (p_plan is null) <> (p_start is null) then
    raise exception 'invalid_group_plan' using errcode = '22023';
  end if;
  if p_plan is not null and not exists (select 1 from public.reading_plans where id = p_plan and published) then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.create_group(
  p_name text,
  p_description text,
  p_kind public.group_kind,
  p_access public.group_access,
  p_plan uuid default null,
  p_plan_start date default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_active_user();
  v_input record;
  g public.groups;
begin
  select * into v_input from public.check_group_input(p_name, p_description);
  perform public.check_group_plan(p_plan, p_plan_start);
  -- GROUP_LIMITS.ownedMax, joinedMax, createdPerDay
  if (select count(*) from public.group_members where user_id = v_uid and role = 'owner') >= 10
     or (select count(*) from public.group_members where user_id = v_uid) >= 30 then
    raise exception 'group_limit_reached' using errcode = '54000';
  end if;
  if (select count(*) from public.groups where created_by = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.groups (name, description, kind, access, invite_code, plan_id, plan_start, created_by)
  values (v_input.name, v_input.description, p_kind, p_access, public.new_invite_code(), p_plan, p_plan_start, v_uid)
  returning * into g;
  insert into public.group_members (group_id, user_id, role, joined_at) values (g.id, v_uid, 'owner', public.app_now());
  return public.group_json(g, v_uid);
end;
$$;

create function public.update_group(
  p_group uuid,
  p_name text,
  p_description text,
  p_kind public.group_kind,
  p_access public.group_access
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_input record;
  g public.groups;
begin
  perform public.require_group_role(p_group, 'admin');
  select * into v_input from public.check_group_input(p_name, p_description);
  update public.groups
     set name = v_input.name, description = v_input.description, kind = p_kind, access = p_access
   where id = p_group
  returning * into g;
  return public.group_json(g, auth.uid());
end;
$$;

create function public.set_group_plan(p_group uuid, p_plan uuid, p_start date) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  g public.groups;
begin
  perform public.require_group_role(p_group, 'admin');
  perform public.check_group_plan(p_plan, p_start);
  update public.groups set plan_id = p_plan, plan_start = p_start where id = p_group returning * into g;
  return public.group_json(g, auth.uid());
end;
$$;

-- A new invite link; the old one stops working.
create function public.reset_group_invite(p_group uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  perform public.require_group_role(p_group, 'admin');
  update public.groups set invite_code = public.new_invite_code() where id = p_group returning invite_code into v_code;
  return v_code;
end;
$$;

create function public.delete_group(p_group uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_group_role(p_group, 'owner');
  delete from public.groups where id = p_group;
end;
$$;

-- Finding, joining and leaving ---------------------------------------------------------------

-- Members see everything; anyone signed in sees a preview of public groups.
create function public.get_group(p_group uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  g public.groups;
begin
  select * into g from public.groups where id = p_group;
  if not found or (g.access = 'invite' and not public.is_group_member(v_uid, g.id)) then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  return public.group_json(g, v_uid);
end;
$$;

-- The preview behind an invite link.
create function public.get_group_by_invite(p_code text) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  g public.groups;
begin
  select * into g from public.groups where invite_code = lower(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  return public.group_json(g, v_uid);
end;
$$;

-- Public groups by name (or the largest ones when the query is empty), excluding mine.
create function public.find_groups(p_query text default '') returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.group_json(g, public.require_user()) order by t.n desc, g.name), '[]'::jsonb)
    from (
      select gr.id, (select count(*) from public.group_members m where m.group_id = gr.id) as n
        from public.groups gr
       where gr.access = 'public'
         and not public.is_group_member(public.require_user(), gr.id)
         and (coalesce(btrim(p_query), '') = ''
              or gr.name ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%')
       order by n desc, gr.name
       limit 20
    ) t
    join public.groups g on g.id = t.id
$$;

-- Join a public group by id, or any group with its invite code.
create function public.join_group(p_group uuid default null, p_code text default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_active_user();
  g public.groups;
begin
  if p_code is not null then
    select * into g from public.groups where invite_code = lower(btrim(p_code));
    if not found then
      raise exception 'invite_not_found' using errcode = 'P0002';
    end if;
  else
    select * into g from public.groups where id = p_group and access = 'public';
    if not found then
      raise exception 'group_not_found' using errcode = 'P0002';
    end if;
  end if;
  if public.is_group_member(v_uid, g.id) then
    return public.group_json(g, v_uid);
  end if;
  -- GROUP_LIMITS.maxMembers, joinedMax
  if (select count(*) from public.group_members where group_id = g.id) >= 300 then
    raise exception 'group_full' using errcode = '54000';
  end if;
  if (select count(*) from public.group_members where user_id = v_uid) >= 30 then
    raise exception 'group_limit_reached' using errcode = '54000';
  end if;
  insert into public.group_members (group_id, user_id, role, joined_at) values (g.id, v_uid, 'member', public.app_now());
  return public.group_json(g, v_uid);
end;
$$;

create function public.leave_group(p_group uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role public.group_role := public.require_group_role(p_group, 'member');
begin
  if v_role = 'owner' then
    raise exception 'owner_cannot_leave' using errcode = '22023';
  end if;
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
end;
$$;

create function public.my_groups() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.group_json(g, public.require_user()) order by m.joined_at), '[]'::jsonb)
    from public.group_members m join public.groups g on g.id = m.group_id
   where m.user_id = public.require_user()
$$;

-- Members and roles ---------------------------------------------------------------------------

-- Everyone in the group with their role and today's status (core: memberTodayRank order).
create function public.group_members_list(p_group uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  g public.groups;
  v_day int;
begin
  perform public.require_group_role(p_group, 'member');
  select * into g from public.groups where id = p_group;
  v_day := (public.group_plan_json(g, public.user_local_date(v_uid)) ->> 'day')::int;
  return coalesce((
    select jsonb_agg(x.j order by x.rank, x.role_rank, lower(x.name))
      from (
        select public.person_json(m.user_id) || jsonb_build_object(
                 'role', m.role,
                 'joined_at', m.joined_at,
                 'today', s.status,
                 'is_me', m.user_id = v_uid,
                 'can_nudge', m.user_id <> v_uid and s.status = 'not_yet' and not exists (
                   select 1 from public.notifications n
                    where n.user_id = m.user_id and n.actor_id = v_uid and n.kind = 'nudge'
                      and n.created_at > now() - interval '20 hours')
               ) as j,
               case s.status when 'plan_day' then 0 when 'read' then 1 else 2 end as rank,
               case m.role when 'owner' then 0 when 'admin' then 1 else 2 end as role_rank,
               coalesce(p.display_name, '') as name
          from public.group_members m
          join public.profiles p on p.id = m.user_id
          cross join lateral (select public.member_today_status(m.user_id, g.plan_id, v_day) as status) s
         where m.group_id = p_group and not public.is_blocked(v_uid, m.user_id)
      ) x
  ), '[]'::jsonb);
end;
$$;

-- core: canChangeRole.
create function public.set_member_role(p_group uuid, p_user uuid, p_role public.group_role) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_target public.group_role := public.group_role_of(p_user, p_group);
begin
  perform public.require_group_role(p_group, 'owner');
  if v_target is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_target = 'owner' or p_role = 'owner' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.group_members set role = p_role where group_id = p_group and user_id = p_user;
end;
$$;

-- Hand the group to another member; the old owner becomes an admin.
create function public.transfer_group(p_group uuid, p_user uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  perform public.require_group_role(p_group, 'owner');
  if p_user = v_uid or not public.is_group_member(p_user, p_group) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  update public.group_members set role = 'admin' where group_id = p_group and user_id = v_uid;
  update public.group_members set role = 'owner' where group_id = p_group and user_id = p_user;
end;
$$;

-- core: canRemoveMember.
create function public.remove_group_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role public.group_role := public.require_group_role(p_group, 'admin');
  v_target public.group_role := public.group_role_of(p_user, p_group);
begin
  if v_target is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_target = 'owner' or not (case v_role when 'owner' then 3 when 'admin' then 2 else 1 end)
                              > (case v_target when 'owner' then 3 when 'admin' then 2 else 1 end) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end;
$$;

-- A friendly nudge to a member who hasn't read today: once a day per person, at most 3 received a day.
create function public.nudge_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_active_user();
begin
  perform public.require_group_role(p_group, 'member');
  if p_user = v_uid or not public.is_group_member(p_user, p_group) or public.is_blocked(v_uid, p_user) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if public.member_today_status(p_user, null, null) <> 'not_yet' then
    raise exception 'already_read' using errcode = '22023';
  end if;
  if exists (select 1 from public.notifications where user_id = p_user and actor_id = v_uid and kind = 'nudge'
                and created_at > now() - interval '20 hours')
     or (select count(*) from public.notifications where user_id = p_user and kind = 'nudge'
                and created_at > now() - interval '20 hours') >= 3 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.notifications (user_id, actor_id, kind, group_id) values (p_user, v_uid, 'nudge', p_group);
end;
$$;

-- Group posts and the daily thread ------------------------------------------------------------

drop function public.create_post(public.post_type, text, text, text, text);

create function public.create_post(
  p_type public.post_type,
  p_body text default '',
  p_passage text default null,
  p_translation text default null,
  p_verse_text text default null,
  p_group uuid default null,
  p_group_day int default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_active_user();
  v_body text;
  v_passage text := p_passage;
  g public.groups;
  p public.posts;
begin
  if p_type = 'milestone' then
    raise exception 'invalid_post' using errcode = '22023';
  end if;
  if p_group is not null then
    perform public.require_group_role(p_group, 'member');
    select * into g from public.groups where id = p_group;
  elsif p_group_day is not null then
    raise exception 'invalid_post' using errcode = '22023';
  end if;
  -- A post in a day's thread is about that day's reading.
  if p_group_day is not null then
    if p_type <> 'reflection' or g.plan_id is null
       or not exists (select 1 from public.plan_days d where d.plan_id = g.plan_id and d.day = p_group_day) then
      raise exception 'invalid_post' using errcode = '22023';
    end if;
    select d.readings ->> 0 into v_passage from public.plan_days d where d.plan_id = g.plan_id and d.day = p_group_day;
  end if;
  v_body := public.check_content(p_body, 2000, p_type = 'verse');
  if p_type in ('verse', 'reflection') and not public.passage_is_valid(v_passage) then
    raise exception 'invalid_passage' using errcode = '22023';
  end if;
  if p_type = 'verse' and (p_verse_text is null or char_length(p_verse_text) not between 1 and 3000) then
    raise exception 'invalid_post' using errcode = '22023';
  end if;
  -- SOCIAL_LIMITS.postsPerDay (thread replies are conversation, so they count under comments' hourly limit instead).
  if p_group_day is null
     and (select count(*) from public.posts where author_id = v_uid and type <> 'milestone' and group_day is null
            and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  if p_group_day is not null
     and (select count(*) from public.posts where author_id = v_uid and group_day is not null and created_at > now() - interval '1 hour')
       + (select count(*) from public.comments where author_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  if exists (
    select 1 from public.posts
     where author_id = v_uid and created_at > now() - interval '1 day'
       and body = v_body and passage is not distinct from v_passage and type = p_type
       and group_id is not distinct from p_group and group_day is not distinct from p_group_day
  ) then
    raise exception 'duplicate_post' using errcode = '23505';
  end if;

  insert into public.posts (author_id, type, passage, translation, verse_text, body, group_id, group_day)
  values (
    v_uid, p_type,
    case when p_type in ('verse', 'reflection') then v_passage end,
    case when p_type in ('verse', 'reflection') then coalesce(p_translation, 'bsb') end,
    case when p_type = 'verse' then p_verse_text end,
    v_body, p_group, p_group_day
  )
  returning * into p;
  return public.post_json(p, v_uid);
end;
$$;

-- The feed: people I follow, my own posts, and my groups' posts (not the day threads, which live
-- on the group's page), newest first, for SOCIAL_LIMITS.feedWindowDays; then it ends.
create or replace function public.get_feed(p_before timestamptz default null, p_limit int default 20) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items jsonb;
  v_count int;
begin
  with page as (
    select p.id from public.posts p
     where p.removed_at is null
       and not p.hidden
       and p.group_day is null
       and p.created_at > now() - interval '14 days'
       and (p_before is null or p.created_at < p_before)
       and not exists (select 1 from public.mutes m where m.muter_id = v_uid and m.muted_id = p.author_id)
       and case
             when p.group_id is not null then
               public.is_group_member(v_uid, p.group_id) and public.can_see_in_post(v_uid, p.author_id, p.id)
             else
               (p.author_id = v_uid or exists (
                  select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p.author_id and f.status = 'accepted'))
               and public.can_see_user(v_uid, p.author_id)
           end
     order by p.created_at desc
     limit v_limit + 1
  )
  select jsonb_agg(public.post_json(p, v_uid) order by p.created_at desc), count(*)
    into v_items, v_count
    from public.posts p join page on page.id = p.id;
  if v_count > v_limit then
    v_items := v_items - v_limit;
  end if;
  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'caught_up', coalesce(v_count, 0) <= v_limit);
end;
$$;

-- Profiles show only posts outside groups.
create or replace function public.get_user_posts(p_user uuid, p_before timestamptz default null, p_limit int default 20) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items jsonb;
  v_count int;
begin
  if not public.can_see_user(v_uid, p_user) then
    return jsonb_build_object('items', '[]'::jsonb, 'caught_up', true);
  end if;
  with page as (
    select p.id from public.posts p
     where p.author_id = p_user and p.group_id is null and p.removed_at is null and (not p.hidden or p.author_id = v_uid)
       and (p_before is null or p.created_at < p_before)
     order by p.created_at desc
     limit v_limit + 1
  )
  select jsonb_agg(public.post_json(p, v_uid) order by p.created_at desc), count(*)
    into v_items, v_count
    from public.posts p join page on page.id = p.id;
  if v_count > v_limit then
    v_items := v_items - v_limit;
  end if;
  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'caught_up', coalesce(v_count, 0) <= v_limit);
end;
$$;

-- The group's page: pinned posts (first page only), then posts outside the day threads, newest first.
create function public.get_group_posts(p_group uuid, p_before timestamptz default null, p_limit int default 20) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items jsonb;
  v_count int;
  v_pinned jsonb;
begin
  perform public.require_group_role(p_group, 'member');
  if p_before is null then
    select coalesce(jsonb_agg(public.post_json(p, v_uid) order by p.pinned_at desc), '[]'::jsonb) into v_pinned
      from public.posts p
     where p.group_id = p_group and p.pinned_at is not null and p.removed_at is null
       and public.can_see_in_post(v_uid, p.author_id, p.id);
  end if;
  with page as (
    select p.id from public.posts p
     where p.group_id = p_group and p.group_day is null and p.pinned_at is null and p.removed_at is null
       and (p_before is null or p.created_at < p_before)
       and public.can_see_in_post(v_uid, p.author_id, p.id)
     order by p.created_at desc
     limit v_limit + 1
  )
  select jsonb_agg(public.post_json(p, v_uid) order by p.created_at desc), count(*)
    into v_items, v_count
    from public.posts p join page on page.id = p.id;
  if v_count > v_limit then
    v_items := v_items - v_limit;
  end if;
  return jsonb_build_object(
    'pinned', coalesce(v_pinned, '[]'::jsonb),
    'items', coalesce(v_items, '[]'::jsonb),
    'caught_up', coalesce(v_count, 0) <= v_limit
  );
end;
$$;

-- One day's discussion thread, oldest first (a conversation reads top to bottom).
create function public.get_group_day(p_group uuid, p_day int) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  perform public.require_group_role(p_group, 'member');
  return coalesce((
    select jsonb_agg(public.post_json(p, v_uid) order by p.created_at)
      from public.posts p
     where p.group_id = p_group and p.group_day = p_day and p.removed_at is null
       and public.can_see_in_post(v_uid, p.author_id, p.id)
  ), '[]'::jsonb);
end;
$$;

-- Group admins: pin (GROUP_LIMITS.pinnedMax) and remove posts and comments in their group.
create function public.pin_group_post(p_post uuid, p_pinned boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_group uuid := (select group_id from public.posts where id = p_post and removed_at is null);
begin
  if v_group is null then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  perform public.require_group_role(v_group, 'admin');
  if p_pinned and (select count(*) from public.posts where group_id = v_group and pinned_at is not null and id <> p_post) >= 3 then
    raise exception 'too_many_pinned' using errcode = '54000';
  end if;
  update public.posts set pinned_at = case when p_pinned then coalesce(pinned_at, now()) end where id = p_post;
end;
$$;

create function public.remove_group_post(p_post uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_group uuid := (select group_id from public.posts where id = p_post and removed_at is null);
begin
  if v_group is null then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  perform public.require_group_role(v_group, 'admin');
  update public.posts set removed_at = now(), removed_by = auth.uid(), pinned_at = null where id = p_post;
  insert into public.moderation_actions (admin_id, target_type, target_id, action, note)
  values (auth.uid(), 'post', p_post, 'group_remove', 'group ' || v_group);
end;
$$;

create function public.remove_group_comment(p_comment uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_group uuid := (
    select p.group_id from public.comments c join public.posts p on p.id = c.post_id
     where c.id = p_comment and c.removed_at is null);
begin
  if v_group is null then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
  perform public.require_group_role(v_group, 'admin');
  update public.comments set removed_at = now(), removed_by = auth.uid() where id = p_comment;
  insert into public.moderation_actions (admin_id, target_type, target_id, action, note)
  values (auth.uid(), 'comment', p_comment, 'group_remove', 'group ' || v_group);
end;
$$;

-- Comments: group admins may remove any comment in their group's posts.
create or replace function public.get_comments(p_post uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_post_author uuid;
  v_group uuid;
  v_moderator boolean;
begin
  if not public.can_see_post(v_uid, p_post) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  select author_id, group_id into v_post_author, v_group from public.posts where id = p_post;
  v_moderator := v_group is not null and public.group_can(public.group_role_of(v_uid, v_group), 'admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'body', c.body, 'created_at', c.created_at,
             'is_mine', c.author_id = v_uid,
             'can_remove', c.author_id = v_uid or v_post_author = v_uid or v_moderator,
             'author', public.person_json(c.author_id)) order by c.created_at)
      from public.comments c
     where c.post_id = p_post and c.removed_at is null and public.can_see_in_post(v_uid, c.author_id, p_post)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.delete_comment(p_comment uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_group uuid;
begin
  delete from public.comments c
   where c.id = p_comment
     and (c.author_id = v_uid or exists (select 1 from public.posts p where p.id = c.post_id and p.author_id = v_uid));
  if found then
    return;
  end if;
  select p.group_id into v_group from public.comments c join public.posts p on p.id = c.post_id where c.id = p_comment;
  if v_group is not null and public.group_can(public.group_role_of(v_uid, v_group), 'admin') then
    perform public.remove_group_comment(p_comment);
    return;
  end if;
  raise exception 'comment_not_found' using errcode = 'P0002';
end;
$$;

-- Notifications: include the group a nudge came from.
create or replace function public.my_notifications(p_limit int default 50) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'kind', n.kind, 'created_at', n.created_at, 'read', n.read_at is not null,
           'actor', public.person_json(n.actor_id),
           'post', case when n.post_id is null then null else (
             select jsonb_build_object('id', p.id, 'type', p.type, 'passage', p.passage, 'body', left(p.body, 120))
               from public.posts p where p.id = n.post_id) end,
           'group', case when n.group_id is null then null else (
             select jsonb_build_object('id', g.id, 'name', g.name) from public.groups g where g.id = n.group_id) end
         ) order by n.created_at desc), '[]'::jsonb)
    from (
      select * from public.notifications
       where user_id = public.require_user()
       order by created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) n
$$;

-- Data export gains groups.
create or replace function public.export_my_data() returns jsonb
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
    'posts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.posts p where p.author_id = v_uid), '[]'),
    'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.comments c where c.author_id = v_uid), '[]'),
    'reactions', coalesce((select jsonb_agg(to_jsonb(r)) from public.reactions r where r.user_id = v_uid), '[]'),
    'following', coalesce((select jsonb_agg(jsonb_build_object('user', f.followee_id, 'status', f.status, 'since', f.created_at)) from public.follows f where f.follower_id = v_uid), '[]'),
    'followers', coalesce((select jsonb_agg(jsonb_build_object('user', f.follower_id, 'status', f.status, 'since', f.created_at)) from public.follows f where f.followee_id = v_uid), '[]'),
    'blocked', coalesce((select jsonb_agg(b.blocked_id) from public.blocks b where b.blocker_id = v_uid), '[]'),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('group', g.id, 'name', g.name, 'role', m.role, 'joined_at', m.joined_at))
        from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = v_uid
    ), '[]'),
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('target_type', r.target_type, 'reason', r.reason, 'created_at', r.created_at, 'status', r.status)) from public.reports r where r.reporter_id = v_uid), '[]'),
    'push_subscriptions', (select count(*) from public.push_subscriptions s where s.user_id = v_uid)
  );
end;
$$;

-- Function permissions -------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.group_role_of(uuid, uuid)', 'public.is_group_member(uuid, uuid)', 'public.new_invite_code()',
    'public.member_today(uuid)', 'public.member_today_status(uuid, uuid, int)', 'public.group_streak(uuid, date)',
    'public.group_plan_json(public.groups, date)', 'public.group_json(public.groups, uuid)',
    'public.can_see_in_post(uuid, uuid, uuid)', 'public.check_group_input(text, text)', 'public.check_group_plan(uuid, date)',
    'public.group_members_after_delete()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.require_group_role(uuid, public.group_role)',
    'public.create_group(text, text, public.group_kind, public.group_access, uuid, date)',
    'public.update_group(uuid, text, text, public.group_kind, public.group_access)',
    'public.set_group_plan(uuid, uuid, date)', 'public.reset_group_invite(uuid)', 'public.delete_group(uuid)',
    'public.get_group(uuid)', 'public.get_group_by_invite(text)', 'public.find_groups(text)',
    'public.join_group(uuid, text)', 'public.leave_group(uuid)', 'public.my_groups()',
    'public.group_members_list(uuid)', 'public.set_member_role(uuid, uuid, public.group_role)',
    'public.transfer_group(uuid, uuid)', 'public.remove_group_member(uuid, uuid)', 'public.nudge_member(uuid, uuid)',
    'public.create_post(public.post_type, text, text, text, text, uuid, int)',
    'public.get_group_posts(uuid, timestamptz, int)', 'public.get_group_day(uuid, int)',
    'public.pin_group_post(uuid, boolean)', 'public.remove_group_post(uuid)', 'public.remove_group_comment(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Used by row-level policies as the signed-in user (yes/no answers only).
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.can_see_in_post(uuid, uuid, uuid) to authenticated;
-- group_can is a pure function of its arguments.
grant execute on function public.group_can(public.group_role, public.group_role) to authenticated;
