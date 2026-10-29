/** USFM book codes, the 66-book Protestant canon in canonical order. */
export const BOOK_IDS = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH',
  'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS',
  'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH',
  '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
] as const;

export type BookId = (typeof BOOK_IDS)[number];
export type Testament = 'OT' | 'NT';

export interface Book {
  id: BookId;
  /** 1-based canonical position. */
  order: number;
  /** English display name; the UI translates via i18n key `books.<id>`. */
  name: string;
  testament: Testament;
  chapters: number;
  /** Extra spellings accepted by the reference parser (the name itself is always accepted). */
  aliases: string[];
}

type Row = [BookId, string, number, string[]];

const ROWS: Row[] = [
  ['GEN', 'Genesis', 50, ['gen', 'ge', 'gn']],
  ['EXO', 'Exodus', 40, ['exod', 'exo', 'ex']],
  ['LEV', 'Leviticus', 27, ['lev', 'le', 'lv']],
  ['NUM', 'Numbers', 36, ['num', 'nu', 'nm']],
  ['DEU', 'Deuteronomy', 34, ['deut', 'deu', 'dt']],
  ['JOS', 'Joshua', 24, ['josh', 'jos', 'jsh']],
  ['JDG', 'Judges', 21, ['judg', 'jdg', 'jg']],
  ['RUT', 'Ruth', 4, ['rut', 'ru', 'rth']],
  ['1SA', '1 Samuel', 31, ['1 sam', '1 sa', '1sm']],
  ['2SA', '2 Samuel', 24, ['2 sam', '2 sa', '2sm']],
  ['1KI', '1 Kings', 22, ['1 kgs', '1 ki', '1 kin']],
  ['2KI', '2 Kings', 25, ['2 kgs', '2 ki', '2 kin']],
  ['1CH', '1 Chronicles', 29, ['1 chron', '1 chr', '1 ch']],
  ['2CH', '2 Chronicles', 36, ['2 chron', '2 chr', '2 ch']],
  ['EZR', 'Ezra', 10, ['ezr', 'ez']],
  ['NEH', 'Nehemiah', 13, ['neh', 'ne']],
  ['EST', 'Esther', 10, ['esth', 'est', 'es']],
  ['JOB', 'Job', 42, ['jb']],
  ['PSA', 'Psalms', 150, ['psalm', 'ps', 'psa', 'pss', 'psm']],
  ['PRO', 'Proverbs', 31, ['prov', 'pro', 'prv', 'pr']],
  ['ECC', 'Ecclesiastes', 12, ['eccl', 'ecc', 'ec', 'qoh']],
  ['SNG', 'Song of Songs', 8, ['song of solomon', 'song', 'sos', 'sng', 'canticles']],
  ['ISA', 'Isaiah', 66, ['isa', 'is']],
  ['JER', 'Jeremiah', 52, ['jer', 'je', 'jr']],
  ['LAM', 'Lamentations', 5, ['lam', 'la']],
  ['EZK', 'Ezekiel', 48, ['ezek', 'eze', 'ezk']],
  ['DAN', 'Daniel', 12, ['dan', 'da', 'dn']],
  ['HOS', 'Hosea', 14, ['hos', 'ho']],
  ['JOL', 'Joel', 3, ['joe', 'jl']],
  ['AMO', 'Amos', 9, ['amo', 'am']],
  ['OBA', 'Obadiah', 1, ['obad', 'oba', 'ob']],
  ['JON', 'Jonah', 4, ['jon', 'jnh']],
  ['MIC', 'Micah', 7, ['mic', 'mc']],
  ['NAM', 'Nahum', 3, ['nah', 'nam', 'na']],
  ['HAB', 'Habakkuk', 3, ['hab', 'hb']],
  ['ZEP', 'Zephaniah', 3, ['zeph', 'zep', 'zp']],
  ['HAG', 'Haggai', 2, ['hag', 'hg']],
  ['ZEC', 'Zechariah', 14, ['zech', 'zec', 'zc']],
  ['MAL', 'Malachi', 4, ['mal', 'ml']],
  ['MAT', 'Matthew', 28, ['matt', 'mat', 'mt']],
  ['MRK', 'Mark', 16, ['mrk', 'mar', 'mk']],
  ['LUK', 'Luke', 24, ['luk', 'lk']],
  ['JHN', 'John', 21, ['jhn', 'jn', 'joh']],
  ['ACT', 'Acts', 28, ['act', 'ac']],
  ['ROM', 'Romans', 16, ['rom', 'ro', 'rm']],
  ['1CO', '1 Corinthians', 16, ['1 cor', '1 co']],
  ['2CO', '2 Corinthians', 13, ['2 cor', '2 co']],
  ['GAL', 'Galatians', 6, ['gal', 'ga']],
  ['EPH', 'Ephesians', 6, ['eph', 'ephes']],
  ['PHP', 'Philippians', 4, ['phil', 'php', 'pp']],
  ['COL', 'Colossians', 4, ['col', 'co']],
  ['1TH', '1 Thessalonians', 5, ['1 thess', '1 thes', '1 th']],
  ['2TH', '2 Thessalonians', 3, ['2 thess', '2 thes', '2 th']],
  ['1TI', '1 Timothy', 6, ['1 tim', '1 ti']],
  ['2TI', '2 Timothy', 4, ['2 tim', '2 ti']],
  ['TIT', 'Titus', 3, ['tit', 'ti']],
  ['PHM', 'Philemon', 1, ['philem', 'phm', 'pm']],
  ['HEB', 'Hebrews', 13, ['heb']],
  ['JAS', 'James', 5, ['jas', 'jm']],
  ['1PE', '1 Peter', 5, ['1 pet', '1 pe', '1 pt']],
  ['2PE', '2 Peter', 3, ['2 pet', '2 pe', '2 pt']],
  ['1JN', '1 John', 5, ['1 jn', '1 jhn', '1 jo']],
  ['2JN', '2 John', 1, ['2 jn', '2 jhn', '2 jo']],
  ['3JN', '3 John', 1, ['3 jn', '3 jhn', '3 jo']],
  ['JUD', 'Jude', 1, ['jud', 'jd']],
  ['REV', 'Revelation', 22, ['rev', 're', 'rv', 'revelations', 'apocalypse']],
];

export const BOOKS: readonly Book[] = ROWS.map(([id, name, chapters, aliases], i) => ({
  id,
  order: i + 1,
  name,
  testament: i < 39 ? 'OT' : 'NT',
  chapters,
  aliases,
}));

const BY_ID = new Map<string, Book>(BOOKS.map((b) => [b.id, b]));

export function isBookId(value: string): value is BookId {
  return BY_ID.has(value);
}

export function getBook(id: BookId): Book {
  const book = BY_ID.get(id);
  if (!book) throw new Error(`Unknown book ${id}`);
  return book;
}

/** Total chapters in the canon (1189). */
export const TOTAL_CHAPTERS = BOOKS.reduce((sum, b) => sum + b.chapters, 0);
