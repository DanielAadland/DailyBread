import { BOOK_IDS, BOOKS, type BookId } from '../src/books';
import type { Verse } from '../src/provider';

/** book → chapter → verses, in canonical order. */
export type BibleText = Map<BookId, Map<number, Verse[]>>;

export function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/\s+([,.;:!?’”)])/g, '$1').replace(/([“‘(])\s+/g, '$1').trim();
}

interface ScrollmapperJson {
  books: Array<{ name: string; chapters: Array<{ chapter: number; verses: Array<{ verse: number; text: string }> }> }>;
}

/** BSB from the scrollmapper JSON: 66 books in canonical order, English versification. */
export function parseScrollmapperJson(json: ScrollmapperJson): BibleText {
  if (json.books.length !== 66) throw new Error(`Expected 66 books, got ${json.books.length}`);
  const out: BibleText = new Map();
  json.books.forEach((book, i) => {
    const id = BOOK_IDS[i]!;
    const chapters = new Map<number, Verse[]>();
    for (const ch of book.chapters) {
      const verses = ch.verses
        .map((v) => ({ verse: v.verse, text: cleanText(v.text) }))
        .filter((v) => v.text.length > 0);
      chapters.set(ch.chapter, verses);
    }
    out.set(id, chapters);
  });
  return out;
}

const SKIP_ELEMENTS = new Set(['f', 'x', 'd', 'h', 'toc', 'id', 'ide', 'cl', 'fig', 'rem', 'ref', 'languageCode', 'note']);
const CANON = new Set<string>(BOOK_IDS);

/**
 * WEB from USFX XML. Keeps verse text, drops footnotes, cross-references, Psalm titles
 * (<d>) and headings. Only the 66 canonical books are kept.
 */
export function parseUsfx(xml: string): BibleText {
  const out: BibleText = new Map();
  const tokenRe = /<(\/?)([A-Za-z]+)([^>]*?)(\/?)>|([^<]+)/g;

  let book: BookId | null = null;
  let chapter = 0;
  let verse = 0;
  let buffer = '';
  const skipStack: string[] = [];

  const flush = () => {
    if (book && chapter > 0 && verse > 0) {
      const text = cleanText(buffer);
      const chapters = out.get(book)!;
      if (!chapters.has(chapter)) chapters.set(chapter, []);
      if (text) chapters.get(chapter)!.push({ verse, text });
    }
    buffer = '';
    verse = 0;
  };

  const attr = (attrs: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1];

  for (const m of xml.matchAll(tokenRe)) {
    const [, closing, tagName, attrs = '', selfClosing, text] = m;
    if (text !== undefined) {
      if (skipStack.length === 0 && verse > 0) buffer += decodeEntities(text);
      continue;
    }
    const tag = tagName!;
    if (skipStack.length > 0) {
      if (SKIP_ELEMENTS.has(tag) && !selfClosing) {
        if (closing) skipStack.pop();
        else skipStack.push(tag);
      }
      continue;
    }
    if (!closing && !selfClosing && SKIP_ELEMENTS.has(tag)) {
      skipStack.push(tag);
      continue;
    }
    if (tag === 'book' && !closing) {
      flush();
      const id = attr(attrs, 'id') ?? '';
      book = CANON.has(id) ? (id as BookId) : null;
      chapter = 0;
      if (book) out.set(book, new Map());
    } else if (tag === 'book' && closing) {
      flush();
      book = null;
    } else if (tag === 'c' && book) {
      flush();
      chapter = Number(attr(attrs, 'id'));
      if (!out.get(book)!.has(chapter)) out.get(book)!.set(chapter, []);
    } else if (tag === 'v' && book && !closing) {
      flush();
      verse = Number(attr(attrs, 'id'));
    } else if (tag === 've') {
      flush();
    } else if ((tag === 'p' || tag === 'q') && !closing && verse > 0) {
      buffer += ' ';
    }
  }
  flush();
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

export interface ValidationReport {
  verses: number;
  problems: string[];
}

/** Every canonical book present with the expected chapters, each chapter non-empty, verses ascending. */
export function validate(text: BibleText): ValidationReport {
  const problems: string[] = [];
  let verses = 0;
  for (const book of BOOKS) {
    const chapters = text.get(book.id);
    if (!chapters) {
      problems.push(`${book.id}: missing`);
      continue;
    }
    if (chapters.size !== book.chapters) problems.push(`${book.id}: ${chapters.size} chapters, expected ${book.chapters}`);
    for (let c = 1; c <= book.chapters; c++) {
      const vs = chapters.get(c);
      if (!vs || vs.length === 0) {
        problems.push(`${book.id} ${c}: empty`);
        continue;
      }
      verses += vs.length;
      for (let i = 1; i < vs.length; i++) {
        if (vs[i]!.verse <= vs[i - 1]!.verse) problems.push(`${book.id} ${c}: verse ${vs[i]!.verse} out of order`);
      }
    }
  }
  return { verses, problems };
}
