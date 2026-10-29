import { BOOKS, getBook, type BookId } from './books';

/**
 * A passage, stored as book + chapter + optional verse range.
 * Posts, highlights and plans store this, never the text, so they work in every translation.
 */
export interface PassageRange {
  book: BookId;
  startChapter: number;
  /** Omitted = from the start of startChapter. */
  startVerse?: number;
  endChapter: number;
  /** Omitted = to the end of endChapter. */
  endVerse?: number;
}

const ORDINALS: Record<string, string> = { i: '1', ii: '2', iii: '3', first: '1', second: '2', third: '3', '1st': '1', '2nd': '2', '3rd': '3' };

/** Lowercase, drop dots and spaces, turn "I John" / "First John" into "1john". */
function normalizeBookName(raw: string): string {
  let s = raw.toLowerCase().replace(/\./g, ' ').trim().replace(/\s+/g, ' ');
  const first = s.split(' ')[0] ?? '';
  const ordinal = ORDINALS[first];
  if (ordinal && s.includes(' ')) s = ordinal + s.slice(first.length);
  return s.replace(/\s/g, '');
}

const ALIASES = new Map<string, BookId>();
for (const book of BOOKS) {
  for (const name of [book.name, book.id, ...book.aliases]) {
    const key = normalizeBookName(name);
    if (!ALIASES.has(key)) ALIASES.set(key, book.id);
  }
}

/** Find a book by any accepted spelling ("1 Cor", "I Corinthians", "1co", "Psalm"). */
export function findBook(name: string): BookId | null {
  return ALIASES.get(normalizeBookName(name)) ?? null;
}

const REF_RE = /^((?:[1-3]|i{1,3}|first|second|third|1st|2nd|3rd)?\s*[a-z][a-z .]*?)\s*(\d+(?:\s*[:.]\s*\d+)?(?:\s*-\s*\d+(?:\s*[:.]\s*\d+)?)?)?$/i;

/**
 * Parse "John 3:16", "Jn 3:16-18", "Gen 1-3", "Rom 8:28-9:2", "Jude 3", "Psalm 23".
 * Returns null when the text is not a valid reference for the canon.
 */
export function parseReference(input: string): PassageRange | null {
  const cleaned = input.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const match = REF_RE.exec(cleaned);
  if (!match) return null;
  const bookId = findBook(match[1] ?? '');
  if (!bookId) return null;
  const book = getBook(bookId);

  const tail = (match[2] ?? '').replace(/\s/g, '').replace(/\./g, ':');
  if (tail === '') return { book: bookId, startChapter: 1, endChapter: book.chapters };

  const [startPart = '', endPart] = tail.split('-');
  const start = startPart.split(':').map(Number);
  const end = endPart?.split(':').map(Number);

  let range: PassageRange;
  if (book.chapters === 1 && start.length === 1) {
    // Single-chapter books: "Jude 3" and "Jude 3-5" are verses.
    const v1 = start[0]!;
    const v2 = end ? end[end.length - 1]! : v1;
    range = { book: bookId, startChapter: 1, startVerse: v1, endChapter: 1, endVerse: v2 };
  } else if (start.length === 1) {
    // "Gen 1" or "Gen 1-3"
    const c1 = start[0]!;
    const c2 = end ? end[0]! : c1;
    if (end && end.length > 1) return null; // "Gen 1-3:4" is ambiguous; reject
    range = { book: bookId, startChapter: c1, endChapter: c2 };
  } else {
    const [c1, v1] = start as [number, number];
    if (!end) range = { book: bookId, startChapter: c1, startVerse: v1, endChapter: c1, endVerse: v1 };
    else if (end.length === 1) range = { book: bookId, startChapter: c1, startVerse: v1, endChapter: c1, endVerse: end[0]! };
    else range = { book: bookId, startChapter: c1, startVerse: v1, endChapter: end[0]!, endVerse: end[1]! };
  }
  return isValidRange(range) ? range : null;
}

export function isValidRange(r: PassageRange): boolean {
  const book = getBook(r.book);
  const positive = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n >= 1);
  if (![r.startChapter, r.endChapter].every((n) => Number.isInteger(n) && n >= 1 && n <= book.chapters)) return false;
  if (!positive(r.startVerse) || !positive(r.endVerse)) return false;
  if (r.endChapter < r.startChapter) return false;
  if (r.endChapter === r.startChapter && r.startVerse !== undefined && r.endVerse !== undefined && r.endVerse < r.startVerse) {
    return false;
  }
  return true;
}

/** Display form: "John 3:16", "John 3:16–18", "Genesis 1–3", "Romans 8:28–9:2", "Jude 3". */
export function formatReference(r: PassageRange, bookName: (id: BookId) => string = (id) => getBook(id).name): string {
  const name = bookName(r.book);
  const single = getBook(r.book).chapters === 1;
  const dash = '–';

  if (r.startVerse === undefined) {
    if (single) return name;
    return r.startChapter === r.endChapter ? `${name} ${r.startChapter}` : `${name} ${r.startChapter}${dash}${r.endChapter}`;
  }
  const start = single ? `${r.startVerse}` : `${r.startChapter}:${r.startVerse}`;
  if (r.endChapter !== r.startChapter) return `${name} ${start}${dash}${r.endChapter}:${r.endVerse ?? ''}`.replace(/:$/, '');
  if (r.endVerse === undefined || r.endVerse === r.startVerse) return `${name} ${start}`;
  return `${name} ${start}${dash}${r.endVerse}`;
}

/** The chapters a range touches, in order, as [book, chapter] pairs. */
export function chaptersIn(r: PassageRange): Array<{ book: BookId; chapter: number }> {
  const out: Array<{ book: BookId; chapter: number }> = [];
  for (let c = r.startChapter; c <= r.endChapter; c++) out.push({ book: r.book, chapter: c });
  return out;
}

/** Stable compact string for storage and URLs: "JHN.3.16-JHN.3.18", "GEN.1-GEN.3". */
export function toKey(r: PassageRange): string {
  const a = r.startVerse === undefined ? `${r.book}.${r.startChapter}` : `${r.book}.${r.startChapter}.${r.startVerse}`;
  const b = r.endVerse === undefined ? `${r.book}.${r.endChapter}` : `${r.book}.${r.endChapter}.${r.endVerse}`;
  return a === b ? a : `${a}-${b}`;
}

export function fromKey(key: string): PassageRange | null {
  const [a = '', b = a] = key.split('-');
  const pa = a.split('.');
  const pb = b.split('.');
  const book = pa[0];
  if (!book || book !== pb[0] || !BOOKS.some((x) => x.id === book)) return null;
  const range: PassageRange = {
    book: book as BookId,
    startChapter: Number(pa[1]),
    ...(pa[2] !== undefined ? { startVerse: Number(pa[2]) } : {}),
    endChapter: Number(pb[1]),
    ...(pb[2] !== undefined ? { endVerse: Number(pb[2]) } : {}),
  };
  return isValidRange(range) ? range : null;
}
