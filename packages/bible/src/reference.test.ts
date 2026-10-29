import { describe, expect, it } from 'vitest';
import { BOOKS, TOTAL_CHAPTERS } from './books';
import { findBook, formatReference, fromKey, parseReference, toKey } from './reference';

describe('books', () => {
  it('has the 66-book canon with 1189 chapters', () => {
    expect(BOOKS).toHaveLength(66);
    expect(TOTAL_CHAPTERS).toBe(1189);
    expect(BOOKS.filter((b) => b.testament === 'NT')).toHaveLength(27);
  });
});

describe('findBook', () => {
  it.each([
    ['John', 'JHN'],
    ['jn', 'JHN'],
    ['1 John', '1JN'],
    ['I John', '1JN'],
    ['First John', '1JN'],
    ['1Cor', '1CO'],
    ['1 Cor.', '1CO'],
    ['Psalm', 'PSA'],
    ['Song of Solomon', 'SNG'],
    ['Phil', 'PHP'],
    ['Philem', 'PHM'],
    ['Judges', 'JDG'],
    ['Jude', 'JUD'],
    ['Isaiah', 'ISA'],
  ])('%s → %s', (name, id) => {
    expect(findBook(name)).toBe(id);
  });

  it('returns null for unknown books', () => {
    expect(findBook('Hezekiah')).toBeNull();
  });
});

describe('parseReference', () => {
  it('parses single verses and ranges', () => {
    expect(parseReference('John 3:16')).toEqual({ book: 'JHN', startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 });
    expect(parseReference('Jn 3:16-18')).toEqual({ book: 'JHN', startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18 });
    expect(parseReference('Romans 8:28–9:2')).toEqual({ book: 'ROM', startChapter: 8, startVerse: 28, endChapter: 9, endVerse: 2 });
  });

  it('parses whole chapters and chapter ranges', () => {
    expect(parseReference('Psalm 23')).toEqual({ book: 'PSA', startChapter: 23, endChapter: 23 });
    expect(parseReference('Gen 1-3')).toEqual({ book: 'GEN', startChapter: 1, endChapter: 3 });
    expect(parseReference('Ruth')).toEqual({ book: 'RUT', startChapter: 1, endChapter: 4 });
  });

  it('treats numbers in single-chapter books as verses', () => {
    expect(parseReference('Jude 3')).toEqual({ book: 'JUD', startChapter: 1, startVerse: 3, endChapter: 1, endVerse: 3 });
    expect(parseReference('Philemon 4-7')).toEqual({ book: 'PHM', startChapter: 1, startVerse: 4, endChapter: 1, endVerse: 7 });
  });

  it('accepts loose spacing and dots', () => {
    expect(parseReference('  1 cor 13 : 4 - 7 ')).toEqual({ book: '1CO', startChapter: 13, startVerse: 4, endChapter: 13, endVerse: 7 });
    expect(parseReference('John 3.16')).toEqual({ book: 'JHN', startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 });
  });

  it('rejects invalid references', () => {
    expect(parseReference('John 22')).toBeNull();
    expect(parseReference('John 3:18-16')).toBeNull();
    expect(parseReference('Gen 3-1')).toBeNull();
    expect(parseReference('Gen 1-3:4')).toBeNull();
    expect(parseReference('hello world')).toBeNull();
    expect(parseReference('')).toBeNull();
  });
});

describe('formatReference', () => {
  it('formats with en dashes', () => {
    expect(formatReference(parseReference('John 3:16')!)).toBe('John 3:16');
    expect(formatReference(parseReference('John 3:16-18')!)).toBe('John 3:16–18');
    expect(formatReference(parseReference('Gen 1-3')!)).toBe('Genesis 1–3');
    expect(formatReference(parseReference('Rom 8:28-9:2')!)).toBe('Romans 8:28–9:2');
    expect(formatReference(parseReference('Jude 3')!)).toBe('Jude 3');
    expect(formatReference(parseReference('Psalm 23')!)).toBe('Psalms 23');
  });

  it('accepts translated book names', () => {
    expect(formatReference(parseReference('John 1:1')!, () => 'Giovanni')).toBe('Giovanni 1:1');
  });
});

describe('keys', () => {
  it('round-trips through the storage key', () => {
    for (const ref of ['John 3:16', 'Gen 1-3', 'Rom 8:28-9:2', 'Jude 3', 'Psalm 23']) {
      const range = parseReference(ref)!;
      expect(fromKey(toKey(range))).toEqual(range);
    }
    expect(toKey(parseReference('John 3:16')!)).toBe('JHN.3.16');
  });

  it('rejects malformed keys', () => {
    expect(fromKey('XXX.1')).toBeNull();
    expect(fromKey('JHN.3-ROM.1')).toBeNull();
  });
});
