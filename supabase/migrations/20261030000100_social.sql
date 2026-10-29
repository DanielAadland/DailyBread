-- Phase 2: follows, posts, reactions, comments, notifications and moderation.
-- Rules mirror packages/core/src/social.ts (canSee, followOutcome, checkContent, SOCIAL_LIMITS).

-- Profiles ------------------------------------------------------------------------

alter table public.profiles
  add column suspended_until timestamptz,
  add column share_milestones boolean not null default true;

grant update (share_milestones) on public.profiles to authenticated;

-- Relationships ---------------------------------------------------------------------

create type public.follow_status as enum ('pending', 'accepted');

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  status public.follow_status not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, status);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.mutes (
  muter_id uuid not null references public.profiles (id) on delete cascade,
  muted_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

-- Posts, reactions, comments -----------------------------------------------------------

create type public.post_type as enum ('verse', 'reflection', 'prayer', 'milestone');
create type public.reaction_kind as enum ('amen', 'praying', 'encouraged');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  type public.post_type not null,
  -- Passage key as in packages/bible toKey(): "JHN.3.16" or "JHN.3.16-JHN.3.18".
  passage text check (passage is null or passage ~ '^[1-3A-Z]{3}\.[0-9]+(\.[0-9]+)?(-[1-3A-Z]{3}\.[0-9]+(\.[0-9]+)?)?$'),
  translation text check (translation is null or translation in ('bsb', 'web')),
  -- Snapshot of the shared verses (public-domain text), so the feed renders without extra requests.
  verse_text text check (verse_text is null or char_length(verse_text) <= 3000),
  body text not null default '' check (char_length(body) <= 2000),
  milestone jsonb,
  hidden boolean not null default false,
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz not null default now(),
  check (
    (type = 'verse' and passage is not null and verse_text is not null)
    or (type = 'reflection' and passage is not null and body <> '')
    or (type = 'prayer' and body <> '')
    or (type = 'milestone' and milestone is not null)
  )
);
create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);

create table public.reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at desc);

-- Notifications ------------------------------------------------------------------

create type public.notification_kind as enum ('comment', 'reaction', 'follow', 'follow_request', 'follow_accepted');

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  post_id uuid references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Set when the push job has handled it (sent or skipped by the user's settings).
  pushed_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('reminder', 'comment', 'reaction', 'nudge', 'group_activity', 'follow'));

-- Moderation ------------------------------------------------------------------------

-- Words the content filter blocks (core: BLOCKED_TERMS). A trailing * also matches longer words.
create table public.blocked_terms (
  term text primary key check (term ~ '^[a-z ]{2,40}\*?$')
);
insert into public.blocked_terms (term) values
  ('fuck*'), ('motherfuck*'), ('shit'), ('shits'), ('shitty'), ('bullshit'), ('bitch*'), ('bastard*'),
  ('asshole*'), ('cunt*'), ('dick'), ('dicks'), ('dickhead*'), ('slut*'), ('whore*'), ('twat*'), ('wanker*'), ('piss off');

create type public.report_target as enum ('post', 'comment', 'user');
create type public.report_reason as enum ('spam', 'harassment', 'inappropriate', 'false_info', 'other');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text not null default '' check (char_length(details) <= 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text
);
create index reports_open_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type public.report_target not null,
  target_id uuid not null,
  report_id uuid references public.reports (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- Helpers -----------------------------------------------------------------------------

create function public.is_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  )
$$;

-- core: canSee.
create function public.can_see_user(p_viewer uuid, p_owner uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when p_viewer is null then false
    when p_viewer = p_owner then true
    else coalesce((
      select (p.suspended_until is null or p.suspended_until <= now())
         and not public.is_blocked(p_viewer, p_owner)
         and case p.visibility
               when 'public' then true
               when 'friends' then exists (
                 select 1 from public.follows f
                  where f.follower_id = p_viewer and f.followee_id = p_owner and f.status = 'accepted')
               else false
             end
        from public.profiles p where p.id = p_owner
    ), false)
  end
$$;

create function public.is_admin(p_user uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = p_user), false)
$$;

-- Signed in and not suspended.
create function public.require_active_user() returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if exists (select 1 from public.profiles where id = v_uid and suspended_until > now()) then
    raise exception 'account_suspended' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- core: checkContent. Raises with the problem's code; returns the trimmed text.
create function public.check_content(p_text text, p_max int, p_allow_empty boolean default false) returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_norm text;
  v_term text;
  v_pattern text;
begin
  if v_text = '' then
    if p_allow_empty then return ''; end if;
    raise exception 'content_empty' using errcode = '22023';
  end if;
  if char_length(v_text) > p_max then
    raise exception 'content_too_long' using errcode = '22001';
  end if;
  if v_text ~* '(https?://|www\.|\m[a-z0-9-]{2,}\.(com|net|org|io|ch|de|it|fr|uk|co|me|ly|gg|xyz|app|dev|info|biz|tv|link|site|online|shop|ru|cn)\M)' then
    raise exception 'links_not_allowed' using errcode = '22023';
  end if;
  v_norm := translate(lower(v_text), '013457@$', 'oieastas');
  for v_term in select term from public.blocked_terms loop
    if right(v_term, 1) = '*' then
      v_pattern := '(^|[^a-z])' || replace(left(v_term, -1), ' ', '\s+');
    else
      v_pattern := '(^|[^a-z])' || replace(v_term, ' ', '\s+') || '([^a-z]|$)';
    end if;
    if v_norm ~ v_pattern then
      raise exception 'content_blocked' using errcode = '22023';
    end if;
  end loop;
  return v_text;
end;
$$;

-- A well-formed passage key within one book, whose chapters exist.
create function public.passage_is_valid(p_key text) returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_key is null or p_key !~ '^[1-3A-Z]{3}\.[0-9]{1,3}(\.[0-9]{1,3})?(-[1-3A-Z]{3}\.[0-9]{1,3}(\.[0-9]{1,3})?)?$' then
    return false;
  end if;
  if split_part(p_key, '.', 1) <> split_part(coalesce(nullif(split_part(p_key, '-', 2), ''), p_key), '.', 1) then
    return false;
  end if;
  return not exists (
    select 1 from public.passage_chapters(p_key) pc where not public.is_valid_chapter(pc.book, pc.chapter)
  ) and exists (select 1 from public.passage_chapters(p_key));
end;
$$;

create function public.notify(p_user uuid, p_actor uuid, p_kind public.notification_kind, p_post uuid default null) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_user = p_actor or public.is_blocked(p_user, p_actor) then
    return;
  end if;
  -- One notification per actor, kind and post: a changed reaction doesn't notify twice.
  if p_kind in ('reaction', 'follow', 'follow_request') and exists (
    select 1 from public.notifications
     where user_id = p_user and actor_id = p_actor and kind = p_kind and post_id is not distinct from p_post
  ) then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, kind, post_id) values (p_user, p_actor, p_kind, p_post);
end;
$$;

create function public.person_json(p_user uuid) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
    from public.profiles p where p.id = p_user
$$;

-- One post as the app shows it, for a given viewer.
create function public.post_json(p_post public.posts, p_viewer uuid) returns jsonb
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
         and public.can_see_user(p_viewer, c.author_id)
    )
  )
$$;

-- Can this viewer see this post?
create function public.can_see_post(p_viewer uuid, p_post uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
     where p.id = p_post and p.removed_at is null
       and (not p.hidden or p.author_id = p_viewer)
       and public.can_see_user(p_viewer, p.author_id)
  )
$$;

-- Row-level security -------------------------------------------------------------------

alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.mutes enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;
alter table public.blocked_terms enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

create policy "follows: own" on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
create policy "blocks: own" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "mutes: own" on public.mutes for select to authenticated using (muter_id = (select auth.uid()));
create policy "posts: visible" on public.posts for select to authenticated
  using (public.can_see_post((select auth.uid()), id));
create policy "reactions: on visible posts" on public.reactions for select to authenticated
  using (public.can_see_post((select auth.uid()), post_id));
create policy "comments: visible" on public.comments for select to authenticated
  using (removed_at is null and public.can_see_post((select auth.uid()), post_id) and public.can_see_user((select auth.uid()), author_id));
create policy "notifications: own" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "reports: own" on public.reports for select to authenticated using (reporter_id = (select auth.uid()));

-- Everyone else may see a profile row only when can_see_user allows it.
drop policy "profiles: read public" on public.profiles;
create policy "profiles: visible" on public.profiles for select to authenticated
  using (public.can_see_user((select auth.uid()), id));

-- All writes go through the functions below.
revoke insert, update, delete on public.follows, public.blocks, public.mutes, public.posts, public.reactions,
  public.comments, public.notifications, public.reports from anon, authenticated;
revoke all on public.follows, public.blocks, public.mutes, public.posts, public.reactions, public.comments,
  public.notifications, public.reports from anon;
revoke all on public.blocked_terms, public.moderation_actions from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.comments, public.reactions, public.notifications;
  end if;
end;
$$;

-- People and follows ---------------------------------------------------------------------

-- Find people to follow. Private, suspended and blocked people never appear.
create function public.find_people(p_query text) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_q text := btrim(coalesce(p_query, ''));
begin
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.person_json(p.id) || jsonb_build_object(
             'visibility', p.visibility,
             'follow_status', coalesce((select f.status::text from public.follows f where f.follower_id = v_uid and f.followee_id = p.id), 'none')
           ) order by p.username nulls last, p.display_name)
      from (
        select * from public.profiles p
         where p.id <> v_uid
           and p.visibility <> 'private'
           and (p.suspended_until is null or p.suspended_until <= now())
           and not public.is_blocked(v_uid, p.id)
           and (p.username ilike replace(replace(v_q, '%', ''), '_', '\_') || '%'
                or p.display_name ilike '%' || replace(replace(v_q, '%', ''), '_', '\_') || '%')
         limit 20
      ) p
  ), '[]'::jsonb);
end;
$$;

-- A profile as the viewer may see it. Details only when can_see_user allows.
create function public.get_profile(p_user uuid default null, p_username text default null) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  p public.profiles;
  v_can boolean;
begin
  select * into p from public.profiles
   where (p_user is not null and id = p_user) or (p_user is null and username = lower(p_username));
  if not found or (p.id <> v_uid and (public.is_blocked(v_uid, p.id) or p.suspended_until > now())) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if p.visibility = 'private' and p.id <> v_uid then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  v_can := public.can_see_user(v_uid, p.id);
  return public.person_json(p.id) || jsonb_build_object(
    'visibility', p.visibility,
    'is_me', p.id = v_uid,
    'can_see', v_can,
    'follow_status', coalesce((select f.status::text from public.follows f where f.follower_id = v_uid and f.followee_id = p.id), 'none'),
    'follows_you', exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = v_uid and f.status = 'accepted'),
    'muted', exists (select 1 from public.mutes m where m.muter_id = v_uid and m.muted_id = p.id),
    'follower_count', (select count(*) from public.follows f where f.followee_id = p.id and f.status = 'accepted'),
    'following_count', (select count(*) from public.follows f where f.follower_id = p.id and f.status = 'accepted')
  ) || case when v_can then jsonb_build_object(
    'bio', p.bio,
    'streak', (select jsonb_build_object('current', s.current, 'longest', s.longest) from public.streaks s where s.user_id = p.id),
    'badges', coalesce((select jsonb_agg(b.badge order by bb.sort) from public.user_badges b join public.badges bb on bb.code = b.badge where b.user_id = p.id), '[]'),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('title', rp.title, 'days', rp.days,
               'completed', (select count(*) from public.day_completions c where c.enrolment_id = e.id)) order by e.started_at)
        from public.plan_enrolments e join public.reading_plans rp on rp.id = e.plan_id
       where e.user_id = p.id and e.status = 'active'), '[]')
  ) else '{}'::jsonb end;
end;
$$;

-- core: followOutcome. Returns the new status.
create function public.follow_user(p_target uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_active_user();
  v_vis public.profile_visibility;
  v_status public.follow_status;
begin
  if p_target = v_uid then
    raise exception 'cannot_follow_self' using errcode = '22023';
  end if;
  select visibility into v_vis from public.profiles
   where id = p_target and (suspended_until is null or suspended_until <= now());
  if not found or public.is_blocked(v_uid, p_target) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_vis = 'private' then
    raise exception 'cannot_follow_private' using errcode = '22023';
  end if;
  v_status := case when v_vis = 'public' then 'accepted' else 'pending' end;
  insert into public.follows (follower_id, followee_id, status, accepted_at)
  values (v_uid, p_target, v_status, case when v_status = 'accepted' then now() end)
  on conflict (follower_id, followee_id) do nothing;
  select status into v_status from public.follows where follower_id = v_uid and followee_id = p_target;
  perform public.notify(p_target, v_uid, (case when v_status = 'accepted' then 'follow' else 'follow_request' end)::public.notification_kind);
  return v_status::text;
end;
$$;

-- Unfollow, or cancel a pending request.
create function public.unfollow_user(p_target uuid) returns void
language sql security definer
set search_path = ''
as $$
  delete from public.follows where follower_id = public.require_user() and followee_id = p_target
$$;

create function public.respond_follow_request(p_follower uuid, p_accept boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if p_accept then
    update public.follows set status = 'accepted', accepted_at = now()
     where follower_id = p_follower and followee_id = v_uid and status = 'pending';
    if found then
      perform public.notify(p_follower, v_uid, 'follow_accepted');
    end if;
  else
    delete from public.follows where follower_id = p_follower and followee_id = v_uid and status = 'pending';
  end if;
  delete from public.notifications where user_id = v_uid and actor_id = p_follower and kind = 'follow_request';
end;
$$;

create function public.remove_follower(p_follower uuid) returns void
language sql security definer
set search_path = ''
as $$
  delete from public.follows where follower_id = p_follower and followee_id = public.require_user()
$$;

-- 'followers', 'following' or 'requests' (pending requests to me).
create function public.list_connections(p_kind text) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  return coalesce((
    select jsonb_agg(public.person_json(x.person) || jsonb_build_object('since', x.created_at) order by x.created_at desc)
      from (
        select case when p_kind = 'following' then f.followee_id else f.follower_id end as person, f.created_at
          from public.follows f
         where (p_kind = 'followers' and f.followee_id = v_uid and f.status = 'accepted')
            or (p_kind = 'following' and f.follower_id = v_uid and f.status = 'accepted')
            or (p_kind = 'requests' and f.followee_id = v_uid and f.status = 'pending')
      ) x
     where not public.is_blocked(v_uid, x.person)
  ), '[]'::jsonb);
end;
$$;

create function public.block_user(p_target uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if p_target = v_uid then
    raise exception 'cannot_block_self' using errcode = '22023';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_target) on conflict do nothing;
  delete from public.follows
   where (follower_id = v_uid and followee_id = p_target) or (follower_id = p_target and followee_id = v_uid);
  delete from public.notifications
   where (user_id = v_uid and actor_id = p_target) or (user_id = p_target and actor_id = v_uid);
end;
$$;

create function public.unblock_user(p_target uuid) returns void
language sql security definer
set search_path = ''
as $$
  delete from public.blocks where blocker_id = public.require_user() and blocked_id = p_target
$$;

create function public.list_blocked() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.person_json(b.blocked_id) order by b.created_at desc), '[]'::jsonb)
    from public.blocks b where b.blocker_id = public.require_user()
$$;

create function public.set_muted(p_target uuid, p_muted boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if p_muted then
    insert into public.mutes (muter_id, muted_id) values (v_uid, p_target) on conflict do nothing;
  else
    delete from public.mutes where muter_id = v_uid and muted_id = p_target;
  end if;
end;
$$;

-- Posts ---------------------------------------------------------------------------------

create function public.create_post(
  p_type public.post_type,
  p_body text default '',
  p_passage text default null,
  p_translation text default null,
  p_verse_text text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_active_user();
  v_body text;
  p public.posts;
begin
  if p_type = 'milestone' then
    raise exception 'invalid_post' using errcode = '22023';
  end if;
  v_body := public.check_content(p_body, 2000, p_type = 'verse');
  if p_type in ('verse', 'reflection') and not public.passage_is_valid(p_passage) then
    raise exception 'invalid_passage' using errcode = '22023';
  end if;
  if p_type = 'verse' and (p_verse_text is null or char_length(p_verse_text) not between 1 and 3000) then
    raise exception 'invalid_post' using errcode = '22023';
  end if;
  -- SOCIAL_LIMITS.postsPerDay
  if (select count(*) from public.posts where author_id = v_uid and type <> 'milestone' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  if exists (
    select 1 from public.posts
     where author_id = v_uid and created_at > now() - interval '1 day'
       and body = v_body and passage is not distinct from p_passage and type = p_type
  ) then
    raise exception 'duplicate_post' using errcode = '23505';
  end if;

  insert into public.posts (author_id, type, passage, translation, verse_text, body)
  values (
    v_uid, p_type,
    case when p_type in ('verse', 'reflection') then p_passage end,
    case when p_type in ('verse', 'reflection') then coalesce(p_translation, 'bsb') end,
    case when p_type = 'verse' then p_verse_text end,
    v_body
  )
  returning * into p;
  return public.post_json(p, v_uid);
end;
$$;

create function public.delete_post(p_post uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.posts where id = p_post and author_id = public.require_user();
  if not found then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Hide or show one of my milestone posts.
create function public.set_post_hidden(p_post uuid, p_hidden boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.posts set hidden = p_hidden where id = p_post and author_id = public.require_user();
  if not found then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- People I follow and my own posts, newest first, for SOCIAL_LIMITS.feedWindowDays; then it ends.
create function public.get_feed(p_before timestamptz default null, p_limit int default 20) returns jsonb
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
       and p.created_at > now() - interval '14 days'
       and (p_before is null or p.created_at < p_before)
       and (p.author_id = v_uid or exists (
             select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p.author_id and f.status = 'accepted'))
       and not exists (select 1 from public.mutes m where m.muter_id = v_uid and m.muted_id = p.author_id)
       and public.can_see_user(v_uid, p.author_id)
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

create function public.get_user_posts(p_user uuid, p_before timestamptz default null, p_limit int default 20) returns jsonb
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
     where p.author_id = p_user and p.removed_at is null and (not p.hidden or p.author_id = v_uid)
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

create function public.get_post(p_post uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  p public.posts;
begin
  if not public.can_see_post(v_uid, p_post) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  select * into p from public.posts where id = p_post;
  return public.post_json(p, v_uid);
end;
$$;

-- Set my reaction (one per post), or clear it with null.
create function public.react(p_post uuid, p_kind public.reaction_kind) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_active_user();
  p public.posts;
begin
  if not public.can_see_post(v_uid, p_post) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  if p_kind is null then
    delete from public.reactions where post_id = p_post and user_id = v_uid;
  else
    insert into public.reactions (post_id, user_id, kind) values (p_post, v_uid, p_kind)
    on conflict (post_id, user_id) do update set kind = excluded.kind, created_at = now();
    perform public.notify((select author_id from public.posts where id = p_post), v_uid, 'reaction', p_post);
  end if;
  select * into p from public.posts where id = p_post;
  return public.post_json(p, v_uid);
end;
$$;

create function public.add_comment(p_post uuid, p_body text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_active_user();
  v_body text;
  c public.comments;
begin
  if not public.can_see_post(v_uid, p_post) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  v_body := public.check_content(p_body, 1000);
  -- SOCIAL_LIMITS.commentsPerHour
  if (select count(*) from public.comments where author_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.comments (post_id, author_id, body) values (p_post, v_uid, v_body) returning * into c;
  perform public.notify((select author_id from public.posts where id = p_post), v_uid, 'comment', p_post);
  return jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at, 'is_mine', true, 'author', public.person_json(v_uid));
end;
$$;

create function public.get_comments(p_post uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_post_author uuid;
begin
  if not public.can_see_post(v_uid, p_post) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  select author_id into v_post_author from public.posts where id = p_post;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'body', c.body, 'created_at', c.created_at,
             'is_mine', c.author_id = v_uid,
             'can_remove', c.author_id = v_uid or v_post_author = v_uid,
             'author', public.person_json(c.author_id)) order by c.created_at)
      from public.comments c
     where c.post_id = p_post and c.removed_at is null and public.can_see_user(v_uid, c.author_id)
  ), '[]'::jsonb);
end;
$$;

-- My own comment, or any comment on my post.
create function public.delete_comment(p_comment uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.comments c
   where c.id = p_comment
     and (c.author_id = v_uid or exists (select 1 from public.posts p where p.id = c.post_id and p.author_id = v_uid));
  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Notifications ---------------------------------------------------------------------------

create function public.my_notifications(p_limit int default 50) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'kind', n.kind, 'created_at', n.created_at, 'read', n.read_at is not null,
           'actor', public.person_json(n.actor_id),
           'post', case when n.post_id is null then null else (
             select jsonb_build_object('id', p.id, 'type', p.type, 'passage', p.passage, 'body', left(p.body, 120))
               from public.posts p where p.id = n.post_id) end
         ) order by n.created_at desc), '[]'::jsonb)
    from (
      select * from public.notifications
       where user_id = public.require_user()
       order by created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) n
$$;

create function public.mark_notifications_read() returns void
language sql security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = public.require_user() and read_at is null
$$;

-- Push job: notifications not yet handled, filtered by each user's switches, quiet hours and daily cap.
-- Marks everything it looked at as handled, so nothing is pushed twice.
create function public.take_social_pushes() returns table (
  notification_id bigint, user_id uuid, local_date date, kind text, actor_name text,
  subscription_id uuid, endpoint text, p256dh text, auth text
)
language plpgsql security definer
set search_path = ''
as $$
begin
  return query
  with pending as (
    update public.notifications n set pushed_at = now()
     where n.pushed_at is null and n.created_at > now() - interval '1 hour'
    returning n.*
  ), eligible as (
    select pn.*, (public.app_now() at time zone pr.timezone) as local_ts, s.daily_cap
      from pending pn
      join public.profiles pr on pr.id = pn.user_id
      join public.notification_settings s on s.user_id = pn.user_id
     where case pn.kind
             when 'comment' then s.social_comments
             when 'reaction' then s.social_reactions
             else s.social_nudges
           end
  )
  select e.id, e.user_id, e.local_ts::date, e.kind::text,
         coalesce(nullif((select display_name from public.profiles where id = e.actor_id), ''), 'Someone'),
         ps.id, ps.endpoint, ps.p256dh, ps.auth
    from eligible e
    join public.push_subscriptions ps on ps.user_id = e.user_id and ps.platform = 'web'
    join public.notification_settings s on s.user_id = e.user_id
   where not public.in_quiet_hours(e.local_ts::time, s.quiet_start, s.quiet_end)
     and (select count(*) from public.notification_log l where l.user_id = e.user_id and l.local_date = e.local_ts::date) < e.daily_cap;
end;
$$;

-- Reports and moderation -------------------------------------------------------------------

create function public.report_content(p_target_type public.report_target, p_target uuid, p_reason public.report_reason, p_details text default '') returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_details text := btrim(coalesce(p_details, ''));
  v_exists boolean;
begin
  if char_length(v_details) > 500 then
    raise exception 'content_too_long' using errcode = '22001';
  end if;
  v_exists := case p_target_type
    when 'post' then exists (select 1 from public.posts where id = p_target)
    when 'comment' then exists (select 1 from public.comments where id = p_target)
    else exists (select 1 from public.profiles where id = p_target)
  end;
  if not v_exists then
    raise exception 'report_target_not_found' using errcode = 'P0002';
  end if;
  -- SOCIAL_LIMITS.reportsPerDay
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  if exists (select 1 from public.reports where reporter_id = v_uid and target_type = p_target_type and target_id = p_target and status = 'open') then
    return;
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (v_uid, p_target_type, p_target, p_reason, v_details);
end;
$$;

create function public.require_admin() returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if not public.is_admin(v_uid) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Open (or other) reports, grouped by target, with a preview of what was reported.
create function public.admin_reports(p_status public.report_status default 'open') returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(x.item order by x.first_at)
      from (
        select min(r.created_at) as first_at,
               jsonb_build_object(
                 'target_type', r.target_type,
                 'target_id', r.target_id,
                 'report_count', count(*),
                 'report_ids', jsonb_agg(r.id),
                 'reasons', jsonb_agg(distinct r.reason),
                 'details', coalesce(jsonb_agg(r.details) filter (where r.details <> ''), '[]'),
                 'first_reported_at', min(r.created_at),
                 'preview', case r.target_type
                   when 'post' then (select jsonb_build_object('body', p.body, 'verse_text', p.verse_text, 'removed', p.removed_at is not null, 'author', public.person_json(p.author_id)) from public.posts p where p.id = r.target_id)
                   when 'comment' then (select jsonb_build_object('body', c.body, 'removed', c.removed_at is not null, 'author', public.person_json(c.author_id)) from public.comments c where c.id = r.target_id)
                   else (select jsonb_build_object('body', pr.bio, 'author', public.person_json(pr.id), 'suspended_until', pr.suspended_until) from public.profiles pr where pr.id = r.target_id)
                 end
               ) as item
          from public.reports r
         where r.status = p_status
         group by r.target_type, r.target_id
      ) x
  ), '[]'::jsonb);
end;
$$;

-- Act on everything reported about one target.
-- Actions: 'dismiss', 'remove' (post/comment), 'suspend_7d', 'suspend_30d', 'suspend_indefinitely'.
create function public.admin_resolve(p_target_type public.report_target, p_target uuid, p_action text, p_note text default null) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_author uuid;
begin
  v_author := case p_target_type
    when 'post' then (select author_id from public.posts where id = p_target)
    when 'comment' then (select author_id from public.comments where id = p_target)
    else p_target
  end;

  if p_action = 'remove' then
    if p_target_type = 'post' then
      update public.posts set removed_at = now(), removed_by = v_admin where id = p_target;
    elsif p_target_type = 'comment' then
      update public.comments set removed_at = now(), removed_by = v_admin where id = p_target;
    else
      raise exception 'invalid_action' using errcode = '22023';
    end if;
  elsif p_action in ('suspend_7d', 'suspend_30d', 'suspend_indefinitely') then
    if v_author is null then
      raise exception 'report_target_not_found' using errcode = 'P0002';
    end if;
    update public.profiles
       set suspended_until = case p_action
             when 'suspend_7d' then now() + interval '7 days'
             when 'suspend_30d' then now() + interval '30 days'
             else 'infinity'::timestamptz
           end
     where id = v_author and not is_admin;
  elsif p_action <> 'dismiss' then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, note)
  values (v_admin, p_action, p_target_type, p_target, p_note);

  update public.reports
     set status = case when p_action = 'dismiss' then 'dismissed'::public.report_status else 'actioned' end,
         resolved_by = v_admin, resolved_at = now(), resolution_note = p_note
   where target_type = p_target_type and target_id = p_target and status = 'open';
end;
$$;

create function public.admin_unsuspend(p_user uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.profiles set suspended_until = null where id = p_user;
  insert into public.moderation_actions (admin_id, action, target_type, target_id) values (v_admin, 'unsuspend', 'user', p_user);
end;
$$;

-- Milestones: share badges and finished plans automatically (unless switched off) ------------

create or replace function public.award_badges(p_user uuid) returns text[]
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

  if array_length(v_new, 1) > 0 and (select share_milestones from public.profiles where id = p_user) then
    insert into public.posts (author_id, type, milestone)
    select p_user, 'milestone', jsonb_build_object('kind', 'badge', 'code', code)
      from unnest(v_new) as code
     where code <> 'first_reading';
  end if;
  return v_new;
end;
$$;

create or replace function public.complete_reading(p_enrolment uuid, p_day int, p_reflection text default null) returns jsonb
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
    if (select share_milestones from public.profiles where id = v_uid) then
      insert into public.posts (author_id, type, milestone)
      select v_uid, 'milestone', jsonb_build_object('kind', 'plan', 'slug', rp.slug, 'title', rp.title, 'days', rp.days)
        from public.reading_plans rp where rp.id = e.plan_id;
    end if;
  end if;

  return jsonb_build_object(
    'day', p_day,
    'streak', v_streak,
    'finished_plan', v_finished,
    'new_badges', to_jsonb(public.award_badges(v_uid))
  );
end;
$$;

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
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('target_type', r.target_type, 'reason', r.reason, 'created_at', r.created_at, 'status', r.status)) from public.reports r where r.reporter_id = v_uid), '[]'),
    'push_subscriptions', (select count(*) from public.push_subscriptions s where s.user_id = v_uid)
  );
end;
$$;

-- Function permissions ---------------------------------------------------------------------

do $$
declare
  f text;
begin
  -- Internal helpers: no client access.
  foreach f in array array[
    'public.is_blocked(uuid, uuid)', 'public.can_see_user(uuid, uuid)', 'public.is_admin(uuid)',
    'public.check_content(text, int, boolean)', 'public.passage_is_valid(text)',
    'public.notify(uuid, uuid, public.notification_kind, uuid)', 'public.person_json(uuid)',
    'public.post_json(public.posts, uuid)', 'public.can_see_post(uuid, uuid)', 'public.take_social_pushes()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- Client functions: signed-in users only.
  foreach f in array array[
    'public.require_active_user()', 'public.require_admin()',
    'public.find_people(text)', 'public.get_profile(uuid, text)', 'public.follow_user(uuid)', 'public.unfollow_user(uuid)',
    'public.respond_follow_request(uuid, boolean)', 'public.remove_follower(uuid)', 'public.list_connections(text)',
    'public.block_user(uuid)', 'public.unblock_user(uuid)', 'public.list_blocked()', 'public.set_muted(uuid, boolean)',
    'public.create_post(public.post_type, text, text, text, text)', 'public.delete_post(uuid)', 'public.set_post_hidden(uuid, boolean)',
    'public.get_feed(timestamptz, int)', 'public.get_user_posts(uuid, timestamptz, int)', 'public.get_post(uuid)',
    'public.react(uuid, public.reaction_kind)', 'public.add_comment(uuid, text)', 'public.get_comments(uuid)', 'public.delete_comment(uuid)',
    'public.my_notifications(int)', 'public.mark_notifications_read()',
    'public.report_content(public.report_target, uuid, public.report_reason, text)',
    'public.admin_reports(public.report_status)', 'public.admin_resolve(public.report_target, uuid, text, text)', 'public.admin_unsuspend(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Policies call these helpers as the signed-in user; they need execute without exposing data
-- (each one only answers yes/no about rows the policy is already checking).
grant execute on function public.can_see_user(uuid, uuid) to authenticated;
grant execute on function public.can_see_post(uuid, uuid) to authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.take_social_pushes() to service_role;
