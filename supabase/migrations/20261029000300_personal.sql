-- Highlights, bookmarks and notes. Always private: only the owner can see them.
-- Stored per passage (book + chapter + verse), so they show in every translation.

create type public.highlight_color as enum ('yellow', 'green', 'blue', 'pink', 'purple');

create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book text not null references public.bible_books (id),
  chapter smallint not null check (chapter > 0),
  verse smallint not null check (verse > 0),
  color public.highlight_color not null default 'yellow',
  created_at timestamptz not null default now(),
  unique (user_id, book, chapter, verse)
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book text not null references public.bible_books (id),
  chapter smallint not null check (chapter > 0),
  verse smallint check (verse > 0),
  created_at timestamptz not null default now()
);

-- A bookmark without a verse marks the whole chapter; at most one per spot.
create unique index bookmarks_unique_spot on public.bookmarks (user_id, book, chapter, coalesce(verse, 0));

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book text not null references public.bible_books (id),
  chapter smallint not null check (chapter > 0),
  verse_start smallint not null check (verse_start > 0),
  verse_end smallint not null check (verse_end >= verse_start),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index highlights_chapter_idx on public.highlights (user_id, book, chapter);
create index bookmarks_user_idx on public.bookmarks (user_id, created_at desc);
create index notes_chapter_idx on public.notes (user_id, book, chapter);

create function public.check_chapter_in_book() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_valid_chapter(new.book, new.chapter) then
    raise exception 'invalid_chapter' using errcode = '22023';
  end if;
  if tg_table_name = 'notes' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger highlights_check before insert or update on public.highlights
  for each row execute function public.check_chapter_in_book();
create trigger bookmarks_check before insert or update on public.bookmarks
  for each row execute function public.check_chapter_in_book();
create trigger notes_check before insert or update on public.notes
  for each row execute function public.check_chapter_in_book();

alter table public.highlights enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notes enable row level security;

create policy "highlights: own" on public.highlights for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "bookmarks: own" on public.bookmarks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notes: own" on public.notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.highlights, public.bookmarks, public.notes from anon;
