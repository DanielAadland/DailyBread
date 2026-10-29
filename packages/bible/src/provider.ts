import type { BookId } from './books';
import { chaptersIn, type PassageRange } from './reference';
import { TRANSLATIONS, type Translation, type TranslationId } from './translations';

export interface Verse {
  verse: number;
  text: string;
}

export interface Chapter {
  translation: TranslationId;
  book: BookId;
  chapter: number;
  verses: Verse[];
}

export interface PassageVerse extends Verse {
  book: BookId;
  chapter: number;
}

export interface SearchHit extends PassageVerse {}

export interface SearchOptions {
  limit?: number;
  testament?: 'OT' | 'NT';
}

/**
 * Every source of Bible text implements this, so a licensed translation (e.g. an NLT API
 * provider running server-side) can be added later without touching the app.
 */
export interface BibleProvider {
  readonly translation: Translation;
  getChapter(book: BookId, chapter: number): Promise<Chapter>;
  getPassage(range: PassageRange): Promise<PassageVerse[]>;
  search(query: string, options?: SearchOptions): Promise<SearchHit[]>;
}

export class BibleTextError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'network' | 'invalid_data' | 'unsupported',
  ) {
    super(message);
    this.name = 'BibleTextError';
  }
}

/** Cut a passage out of the chapters it spans. Shared by every provider. */
export async function passageFromChapters(
  range: PassageRange,
  getChapter: (book: BookId, chapter: number) => Promise<Chapter>,
): Promise<PassageVerse[]> {
  const out: PassageVerse[] = [];
  for (const { book, chapter } of chaptersIn(range)) {
    const data = await getChapter(book, chapter);
    for (const v of data.verses) {
      const afterStart = chapter > range.startChapter || range.startVerse === undefined || v.verse >= range.startVerse;
      const beforeEnd = chapter < range.endChapter || range.endVerse === undefined || v.verse <= range.endVerse;
      if (afterStart && beforeEnd) out.push({ book, chapter, verse: v.verse, text: v.text });
    }
  }
  return out;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
type SearchFn = (translation: TranslationId, query: string, options?: SearchOptions) => Promise<SearchHit[]>;

/**
 * Reads pre-built chapter files (`<baseUrl>/<translation>/<BOOK>/<chapter>.json`), served
 * statically from the CDN. Fast, cacheable and free; search is delegated (to the database).
 */
export class StaticBibleProvider implements BibleProvider {
  readonly translation: Translation;
  private readonly cache = new Map<string, Promise<Chapter>>();

  constructor(
    translationId: TranslationId,
    private readonly baseUrl: string,
    private readonly fetchFn: FetchLike,
    private readonly searchFn?: SearchFn,
    private readonly maxCached = 60,
  ) {
    this.translation = TRANSLATIONS[translationId];
  }

  getChapter(book: BookId, chapter: number): Promise<Chapter> {
    const key = `${book}.${chapter}`;
    const hit = this.cache.get(key);
    if (hit) {
      // Refresh recency for the simple LRU.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const pending = this.load(book, chapter).catch((err: unknown) => {
      this.cache.delete(key);
      throw err;
    });
    this.cache.set(key, pending);
    while (this.cache.size > this.maxCached) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return pending;
  }

  getPassage(range: PassageRange): Promise<PassageVerse[]> {
    return passageFromChapters(range, (b, c) => this.getChapter(b, c));
  }

  search(query: string, options?: SearchOptions): Promise<SearchHit[]> {
    if (!this.searchFn) return Promise.reject(new BibleTextError('Search is not configured', 'unsupported'));
    return this.searchFn(this.translation.id, query, options);
  }

  private async load(book: BookId, chapter: number): Promise<Chapter> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/${this.translation.id}/${book}/${chapter}.json`;
    let res;
    try {
      res = await this.fetchFn(url);
    } catch {
      throw new BibleTextError(`Could not load ${book} ${chapter}`, 'network');
    }
    if (res.status === 404) throw new BibleTextError(`${book} ${chapter} not found`, 'not_found');
    if (!res.ok) throw new BibleTextError(`Could not load ${book} ${chapter} (${res.status})`, 'network');
    const data = (await res.json()) as Partial<Chapter>;
    if (!Array.isArray(data.verses)) throw new BibleTextError(`Bad data for ${book} ${chapter}`, 'invalid_data');
    return { translation: this.translation.id, book, chapter, verses: data.verses };
  }
}
