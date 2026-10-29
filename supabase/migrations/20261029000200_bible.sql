-- Bible book list and the verse table used for search and for quoting verses in posts.
-- The reader itself loads chapters from static JSON files (apps/app/public/bible), not from here.

create table public.bible_books (
  id text primary key,
  ord smallint not null unique,
  name text not null,
  testament text not null check (testament in ('OT', 'NT')),
  chapters smallint not null check (chapters > 0)
);

insert into public.bible_books (id, ord, name, testament, chapters) values
  ('GEN', 1, 'Genesis', 'OT', 50),
  ('EXO', 2, 'Exodus', 'OT', 40),
  ('LEV', 3, 'Leviticus', 'OT', 27),
  ('NUM', 4, 'Numbers', 'OT', 36),
  ('DEU', 5, 'Deuteronomy', 'OT', 34),
  ('JOS', 6, 'Joshua', 'OT', 24),
  ('JDG', 7, 'Judges', 'OT', 21),
  ('RUT', 8, 'Ruth', 'OT', 4),
  ('1SA', 9, '1 Samuel', 'OT', 31),
  ('2SA', 10, '2 Samuel', 'OT', 24),
  ('1KI', 11, '1 Kings', 'OT', 22),
  ('2KI', 12, '2 Kings', 'OT', 25),
  ('1CH', 13, '1 Chronicles', 'OT', 29),
  ('2CH', 14, '2 Chronicles', 'OT', 36),
  ('EZR', 15, 'Ezra', 'OT', 10),
  ('NEH', 16, 'Nehemiah', 'OT', 13),
  ('EST', 17, 'Esther', 'OT', 10),
  ('JOB', 18, 'Job', 'OT', 42),
  ('PSA', 19, 'Psalms', 'OT', 150),
  ('PRO', 20, 'Proverbs', 'OT', 31),
  ('ECC', 21, 'Ecclesiastes', 'OT', 12),
  ('SNG', 22, 'Song of Songs', 'OT', 8),
  ('ISA', 23, 'Isaiah', 'OT', 66),
  ('JER', 24, 'Jeremiah', 'OT', 52),
  ('LAM', 25, 'Lamentations', 'OT', 5),
  ('EZK', 26, 'Ezekiel', 'OT', 48),
  ('DAN', 27, 'Daniel', 'OT', 12),
  ('HOS', 28, 'Hosea', 'OT', 14),
  ('JOL', 29, 'Joel', 'OT', 3),
  ('AMO', 30, 'Amos', 'OT', 9),
  ('OBA', 31, 'Obadiah', 'OT', 1),
  ('JON', 32, 'Jonah', 'OT', 4),
  ('MIC', 33, 'Micah', 'OT', 7),
  ('NAM', 34, 'Nahum', 'OT', 3),
  ('HAB', 35, 'Habakkuk', 'OT', 3),
  ('ZEP', 36, 'Zephaniah', 'OT', 3),
  ('HAG', 37, 'Haggai', 'OT', 2),
  ('ZEC', 38, 'Zechariah', 'OT', 14),
  ('MAL', 39, 'Malachi', 'OT', 4),
  ('MAT', 40, 'Matthew', 'NT', 28),
  ('MRK', 41, 'Mark', 'NT', 16),
  ('LUK', 42, 'Luke', 'NT', 24),
  ('JHN', 43, 'John', 'NT', 21),
  ('ACT', 44, 'Acts', 'NT', 28),
  ('ROM', 45, 'Romans', 'NT', 16),
  ('1CO', 46, '1 Corinthians', 'NT', 16),
  ('2CO', 47, '2 Corinthians', 'NT', 13),
  ('GAL', 48, 'Galatians', 'NT', 6),
  ('EPH', 49, 'Ephesians', 'NT', 6),
  ('PHP', 50, 'Philippians', 'NT', 4),
  ('COL', 51, 'Colossians', 'NT', 4),
  ('1TH', 52, '1 Thessalonians', 'NT', 5),
  ('2TH', 53, '2 Thessalonians', 'NT', 3),
  ('1TI', 54, '1 Timothy', 'NT', 6),
  ('2TI', 55, '2 Timothy', 'NT', 4),
  ('TIT', 56, 'Titus', 'NT', 3),
  ('PHM', 57, 'Philemon', 'NT', 1),
  ('HEB', 58, 'Hebrews', 'NT', 13),
  ('JAS', 59, 'James', 'NT', 5),
  ('1PE', 60, '1 Peter', 'NT', 5),
  ('2PE', 61, '2 Peter', 'NT', 3),
  ('1JN', 62, '1 John', 'NT', 5),
  ('2JN', 63, '2 John', 'NT', 1),
  ('3JN', 64, '3 John', 'NT', 1),
  ('JUD', 65, 'Jude', 'NT', 1),
  ('REV', 66, 'Revelation', 'NT', 22);

alter table public.bible_books enable row level security;
create policy "bible_books: readable by all" on public.bible_books for select using (true);
revoke insert, update, delete on public.bible_books from anon, authenticated;

create table public.bible_verses (
  translation text not null check (translation in ('bsb', 'web')),
  book text not null references public.bible_books (id),
  book_order smallint not null,
  chapter smallint not null check (chapter > 0),
  verse smallint not null check (verse > 0),
  text text not null,
  tsv tsvector generated always as (to_tsvector('english', text)) stored,
  primary key (translation, book, chapter, verse)
);

create index bible_verses_tsv_idx on public.bible_verses using gin (tsv);
create index bible_verses_order_idx on public.bible_verses (translation, book_order, chapter, verse);

alter table public.bible_verses enable row level security;
create policy "bible_verses: readable by all" on public.bible_verses for select using (true);
revoke insert, update, delete on public.bible_verses from anon, authenticated;

-- True when the book exists and the chapter is within it.
create function public.is_valid_chapter(p_book text, p_chapter int) returns boolean
language sql stable
set search_path = ''
as $$
  select exists (select 1 from public.bible_books b where b.id = p_book and p_chapter between 1 and b.chapters)
$$;

-- Full-text search in canonical order. Accepts web-search syntax: words, "exact phrase", -exclude, or.
create function public.search_bible(
  p_translation text,
  p_query text,
  p_limit int default 50,
  p_offset int default 0
) returns table (book text, chapter smallint, verse smallint, text text)
language sql stable
set search_path = ''
as $$
  select v.book, v.chapter, v.verse, v.text
  from public.bible_verses v
  where v.translation = p_translation
    and char_length(p_query) between 2 and 200
    and v.tsv @@ websearch_to_tsquery('english', p_query)
    -- Full-text search drops small words ("so", "the"); quoted phrases must also match literally.
    and not exists (
      select 1 from regexp_matches(p_query, '"([^"]+)"', 'g') as m(parts)
       where v.text not ilike '%' || replace(replace(replace(m.parts[1], '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by v.book_order, v.chapter, v.verse
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
