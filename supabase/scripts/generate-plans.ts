/**
 * Generates supabase/seed/plans.sql: the ready-made reading plans.
 * Every passage key is validated against the book list and the BSB verse counts.
 *   pnpm --filter @bible-app/db generate:plans
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS, fromKey, parseReference, toKey, type BookId } from '@bible-app/bible';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface PlanDay {
  readings: string[];
  prompt: string | null;
}

interface Plan {
  slug: string;
  title: string;
  description: string;
  category: 'whole_bible' | 'new_testament' | 'old_testament' | 'book' | 'topical';
  sort: number;
  days: PlanDay[];
}

/** General prompts for long plans, rotated by day. Open questions, no doctrinal positions. */
const GENERAL_PROMPTS = [
  'What is one sentence from today’s reading you want to remember?',
  'What surprised you, or raised a question for you?',
  'Is there a word or picture in this passage you’d like to carry through your day?',
  'How could today’s reading shape the way you treat someone today?',
  'If you told a friend about today’s reading in one line, what would you say?',
  'What would you like to pray about after reading this?',
  'Where did you notice hope in today’s reading?',
];

/** Spread the chapters of `books` evenly over `days`, grouping neighbours from the same book. */
function chapterPlan(books: BookId[], days: number): PlanDay[] {
  const chapters: Array<{ book: BookId; chapter: number }> = [];
  for (const id of books) {
    const book = BOOKS.find((b) => b.id === id)!;
    for (let c = 1; c <= book.chapters; c++) chapters.push({ book: id, chapter: c });
  }
  if (chapters.length < days) throw new Error(`Fewer chapters (${chapters.length}) than days (${days})`);

  const out: PlanDay[] = [];
  for (let d = 0; d < days; d++) {
    const from = Math.floor((d * chapters.length) / days);
    const to = Math.floor(((d + 1) * chapters.length) / days);
    const slice = chapters.slice(from, to);
    const readings: string[] = [];
    let i = 0;
    while (i < slice.length) {
      let j = i;
      while (j + 1 < slice.length && slice[j + 1]!.book === slice[i]!.book) j++;
      readings.push(toKey({ book: slice[i]!.book, startChapter: slice[i]!.chapter, endChapter: slice[j]!.chapter }));
      i = j + 1;
    }
    out.push({ readings, prompt: GENERAL_PROMPTS[d % GENERAL_PROMPTS.length]! });
  }
  return out;
}

/** A topical plan from [reference, prompt] pairs. */
function topical(days: Array<[string, string]>): PlanDay[] {
  return days.map(([ref, prompt]) => {
    const range = parseReference(ref);
    if (!range) throw new Error(`Bad reference: ${ref}`);
    return { readings: [toKey(range)], prompt };
  });
}

const OT = BOOKS.filter((b) => b.testament === 'OT').map((b) => b.id);
const NT = BOOKS.filter((b) => b.testament === 'NT').map((b) => b.id);

const PLANS: Plan[] = [
  {
    slug: 'bible-in-a-year',
    title: 'Bible in a Year',
    description: 'Read the whole Bible from Genesis to Revelation in 365 days, about three to four chapters a day.',
    category: 'whole_bible',
    sort: 10,
    days: chapterPlan([...OT, ...NT], 365),
  },
  {
    slug: 'new-testament-90',
    title: 'New Testament in 90 Days',
    description: 'All 27 books of the New Testament in three months, about three chapters a day.',
    category: 'new_testament',
    sort: 20,
    days: chapterPlan(NT, 90),
  },
  {
    slug: 'gospels-30',
    title: 'The Gospels in 30 Days',
    description: 'The life and teaching of Jesus through Matthew, Mark, Luke and John, about three chapters a day.',
    category: 'book',
    sort: 30,
    days: chapterPlan(['MAT', 'MRK', 'LUK', 'JHN'], 30),
  },
  {
    slug: 'psalms-30',
    title: 'Psalms in 30 Days',
    description: 'Five psalms a day: songs and prayers for every mood, from joy to lament.',
    category: 'book',
    sort: 40,
    days: chapterPlan(['PSA'], 30),
  },
  {
    slug: 'proverbs-31',
    title: 'Proverbs in a Month',
    description: 'One chapter of practical wisdom a day, for 31 days.',
    category: 'book',
    sort: 50,
    days: chapterPlan(['PRO'], 31),
  },
  {
    slug: 'peace-in-anxious-times',
    title: 'Peace in Anxious Times',
    description: 'Seven short readings for days when worry feels heavy.',
    category: 'topical',
    sort: 60,
    days: topical([
      ['Philippians 4:4-9', 'Which worry would you like to set down today?'],
      ['Matthew 6:25-34', 'What is one thing about tomorrow you can leave for tomorrow?'],
      ['Psalm 23', 'Which line of this psalm feels most comforting right now?'],
      ['1 Peter 5:6-11', 'Who could you tell about something that is weighing on you?'],
      ['Isaiah 41:10-13', 'Where do you need to hear “do not fear” this week?'],
      ['John 14:25-27', 'What does peace look like for you today, in one small way?'],
      ['Psalm 46', 'Try a minute of stillness. What did you notice?'],
    ]),
  },
  {
    slug: 'hope',
    title: 'Hope',
    description: 'A week of passages about hope that holds, even when life is hard.',
    category: 'topical',
    sort: 70,
    days: topical([
      ['Romans 5:1-5', 'When has a hard time grown something good in you?'],
      ['Romans 8:18-28', 'What are you waiting for with hope right now?'],
      ['Lamentations 3:19-26', 'What is one thing that is new this morning?'],
      ['Isaiah 40:27-31', 'Where do you need new strength this week?'],
      ['Hebrews 6:13-20', 'What helps you stay steady when things feel uncertain?'],
      ['1 Peter 1:3-9', 'Who in your life shows you what hope looks like?'],
      ['Revelation 21:1-7', 'Which promise in this passage would you like to remember?'],
    ]),
  },
  {
    slug: 'learning-to-pray',
    title: 'Learning to Pray',
    description: 'Seven readings about prayer, with a simple prompt to try each day.',
    category: 'topical',
    sort: 80,
    days: topical([
      ['Matthew 6:5-15', 'Pray one line of this prayer slowly. Which line did you choose?'],
      ['Luke 11:1-13', 'What would you like to ask for today?'],
      ['Psalm 145', 'Write down three things you are thankful for.'],
      ['John 17:20-26', 'Who would you like to pray for today?'],
      ['1 Thessalonians 5:16-24', 'Where could a short prayer fit into your day?'],
      ['James 5:13-18', 'Is there someone you could offer to pray with?'],
      ['Psalm 139:1-18', 'What does it mean to you to be fully known?'],
    ]),
  },
  {
    slug: 'love',
    title: 'Love',
    description: 'A week with the Bible’s great passages on love, and how to live it.',
    category: 'topical',
    sort: 90,
    days: topical([
      ['1 Corinthians 13', 'Which description of love is hardest for you right now?'],
      ['1 John 4:7-21', 'How have you experienced love this week?'],
      ['John 15:9-17', 'What would it look like to be a good friend today?'],
      ['Romans 12:9-21', 'Pick one line to practise today. Which one?'],
      ['Luke 10:25-37', 'Who is a “neighbour” you might overlook?'],
      ['Colossians 3:12-17', 'What would you like to “put on” today?'],
      ['Psalm 103', 'Which line of this psalm would you like to thank God for?'],
    ]),
  },
];

// Validate every key against the book list and the BSB verse counts.
const index = JSON.parse(readFileSync(join(root, 'apps', 'app', 'public', 'bible', 'bsb', 'index.json'), 'utf8')) as {
  books: Array<{ id: string; verses: number[] }>;
};
const verseCount = (book: string, chapter: number) => index.books.find((b) => b.id === book)?.verses[chapter - 1] ?? 0;

for (const plan of PLANS) {
  plan.days.forEach((day, i) => {
    for (const key of day.readings) {
      const range = fromKey(key);
      if (!range) throw new Error(`${plan.slug} day ${i + 1}: invalid key ${key}`);
      if (range.endVerse !== undefined && range.endVerse > verseCount(range.book, range.endChapter)) {
        throw new Error(`${plan.slug} day ${i + 1}: ${key} goes past the end of the chapter`);
      }
    }
  });
}

const q = (s: string | null) => (s === null ? 'null' : `'${s.replace(/'/g, "''")}'`);

const lines: string[] = [
  '-- Generated by supabase/scripts/generate-plans.ts. Do not edit by hand.',
  '-- Idempotent: plans are keyed by slug and get a stable id derived from it.',
  'begin;',
];
for (const plan of PLANS) {
  const id = `md5('plan:${plan.slug}')::uuid`;
  lines.push(
    `insert into public.reading_plans (id, slug, title, description, category, days, sort) values (${id}, ${q(plan.slug)}, ${q(plan.title)}, ${q(plan.description)}, '${plan.category}', ${plan.days.length}, ${plan.sort})`,
    `  on conflict (slug) do update set title = excluded.title, description = excluded.description, category = excluded.category, days = excluded.days, sort = excluded.sort;`,
    `delete from public.plan_days where plan_id = ${id};`,
    `insert into public.plan_days (plan_id, day, readings, reflection_prompt) values`,
    plan.days
      .map((d, i) => `  (${id}, ${i + 1}, '${JSON.stringify(d.readings)}'::jsonb, ${q(d.prompt)})`)
      .join(',\n') + ';',
  );
}
lines.push('commit;', '');
writeFileSync(join(root, 'supabase', 'seed', 'plans.sql'), lines.join('\n'));

// The same plans as JSON, for the app's demo mode (runs without a database).
mkdirSync(join(root, 'apps', 'app', 'public', 'demo'), { recursive: true });
writeFileSync(
  join(root, 'apps', 'app', 'public', 'demo', 'plans.json'),
  JSON.stringify(
    PLANS.map((p) => ({
      id: p.slug,
      slug: p.slug,
      title: p.title,
      description: p.description,
      category: p.category,
      sort: p.sort,
      days: p.days.map((d, i) => ({ day: i + 1, readings: d.readings, reflectionPrompt: d.prompt })),
    })),
  ),
);
console.log(PLANS.map((p) => `${p.slug}: ${p.days.length} days`).join('\n'));
