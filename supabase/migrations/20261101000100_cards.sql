-- Phase 4: verse cards.
-- A card is a verse post with a style (background and font), drawn by the app. Curated daily cards
-- ship with the app (apps/app/src/cards/pool.ts); only people's own cards live here.
-- Rules mirror packages/core/src/cards.ts (isCardStyle, CARD_LIMITS).

-- core: isCardStyle.
create function public.is_card_style(p_card jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(p_card) = 'object'
     and (select count(*) from jsonb_object_keys(p_card)) = 2
     and p_card ->> 'background' in ('dawn', 'tide', 'olive', 'sand', 'dusk', 'night', 'meadow', 'rose', 'stone', 'sea', 'ember', 'mist')
     and p_card ->> 'font' in ('serif', 'serif_italic', 'sans')
$$;

alter table public.posts
  add column card jsonb,
  add constraint posts_card_style check (card is null or (type = 'verse' and public.is_card_style(card)));

drop function public.create_post(public.post_type, text, text, text, text, uuid, int);

create function public.create_post(
  p_type public.post_type,
  p_body text default '',
  p_passage text default null,
  p_translation text default null,
  p_verse_text text default null,
  p_group uuid default null,
  p_group_day int default null,
  p_card jsonb default null
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
  -- A verse card: a verse post with a style from core CARD_BACKGROUNDS / CARD_FONTS.
  if p_card is not null and (p_type <> 'verse' or p_group_day is not null or not public.is_card_style(p_card)) then
    raise exception 'invalid_card' using errcode = '22023';
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

  insert into public.posts (author_id, type, passage, translation, verse_text, body, group_id, group_day, card)
  values (
    v_uid, p_type,
    case when p_type in ('verse', 'reflection') then v_passage end,
    case when p_type in ('verse', 'reflection') then coalesce(p_translation, 'bsb') end,
    case when p_type = 'verse' then p_verse_text end,
    v_body, p_group, p_group_day, p_card
  )
  returning * into p;
  return public.post_json(p, v_uid);
end;
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
    'card', p_post.card,
    'can_moderate', p_post.group_id is not null and public.group_can(public.group_role_of(p_viewer, p_post.group_id), 'admin')
  )
$$;

-- Cards from people I follow and my groups (not my own), for the front of today's set:
-- newest first, CARD_LIMITS.friendWindowHours back, at most CARD_LIMITS.dailyFromFriends.
create function public.get_card_posts() returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  return coalesce((
    select jsonb_agg(public.post_json(p, v_uid) order by p.created_at desc)
      from (
        select p.* from public.posts p
         where p.card is not null and p.removed_at is null and not p.hidden
           and p.author_id <> v_uid
           and p.created_at > now() - interval '48 hours'
           and not exists (select 1 from public.mutes m where m.muter_id = v_uid and m.muted_id = p.author_id)
           and case
                 when p.group_id is not null then
                   public.is_group_member(v_uid, p.group_id) and public.can_see_in_post(v_uid, p.author_id, p.id)
                 else
                   exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p.author_id and f.status = 'accepted')
                   and public.can_see_user(v_uid, p.author_id)
               end
         order by p.created_at desc
         limit 3
      ) p
  ), '[]'::jsonb);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_post(public.post_type, text, text, text, text, uuid, int, jsonb)', 'public.get_card_posts()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
grant execute on function public.is_card_style(jsonb) to authenticated;
