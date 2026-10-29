/**
 * Builds the Bible text the app serves:
 *   apps/app/public/bible/<translation>/<BOOK>/<chapter>.json   (static chapter files for the reader)
 *   apps/app/public/bible/<translation>/index.json              (verse counts per chapter)
 *   supabase/seed/generated/bible_<translation>.tsv              (rows for the search table)
 *
 * Run `pnpm --filter @bible-app/bible download` first.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../src/books';
import { TRANSLATIONS, type TranslationId } from '../src/translations';
import { parseScrollmapperJson, parseUsfx, validate, type BibleText } from './parse';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sourceDir = join(root, 'packages', 'bible', 'data', 'source');
const publicDir = join(root, 'apps', 'app', 'public', 'bible');
const seedDir = join(root, 'supabase', 'seed', 'generated');

function load(id: TranslationId): BibleText {
  if (id === 'bsb') return parseScrollmapperJson(JSON.parse(readFileSync(join(sourceDir, 'bsb.json'), 'utf8')));
  return parseUsfx(readFileSync(join(sourceDir, 'web.usfx.xml'), 'utf8'));
}

function tsvEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function write(id: TranslationId, text: BibleText): void {
  const outDir = join(publicDir, id);
  rmSync(outDir, { recursive: true, force: true });
  const index: { translation: TranslationId; attribution: string; books: Array<{ id: string; verses: number[] }> } = {
    translation: id,
    attribution: TRANSLATIONS[id].attribution,
    books: [],
  };
  const rows: string[] = [];

  for (const book of BOOKS) {
    const chapters = text.get(book.id)!;
    mkdirSync(join(outDir, book.id), { recursive: true });
    const counts: number[] = [];
    for (let c = 1; c <= book.chapters; c++) {
      const verses = chapters.get(c) ?? [];
      counts.push(verses.length === 0 ? 0 : verses[verses.length - 1]!.verse);
      writeFileSync(join(outDir, book.id, `${c}.json`), JSON.stringify({ translation: id, book: book.id, chapter: c, verses }));
      for (const v of verses) rows.push([id, book.id, book.order, c, v.verse, tsvEscape(v.text)].join('\t'));
    }
    index.books.push({ id: book.id, verses: counts });
  }
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, `bible_${id}.tsv`), rows.join('\n') + '\n');
}

let failed = false;
for (const id of Object.keys(TRANSLATIONS) as TranslationId[]) {
  const text = load(id);
  const report = validate(text);
  console.log(`${id}: ${report.verses} verses`);
  if (report.problems.length > 0) {
    failed = true;
    console.error(`${id}: ${report.problems.length} problems\n  ` + report.problems.slice(0, 20).join('\n  '));
    continue;
  }
  write(id, text);
}
if (failed) process.exit(1);
