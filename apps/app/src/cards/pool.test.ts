import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CARD_LIMITS, wordCount } from '@bible-app/core';
import { fromKey, isValidRange } from '@bible-app/bible';
import { describe, expect, it } from 'vitest';
import { CURATED_CARDS } from './pool';

const bibleDir = join(__dirname, '..', '..', 'public', 'bible', 'bsb');

describe('curated cards', () => {
  it('has enough cards for a 10-day cycle, with unique ids and passages', () => {
    expect(CURATED_CARDS.length).toBeGreaterThanOrEqual(70);
    expect(new Set(CURATED_CARDS.map((c) => c.id)).size).toBe(CURATED_CARDS.length);
    expect(new Set(CURATED_CARDS.map((c) => c.passage)).size).toBe(CURATED_CARDS.length);
  });

  it('keeps reflections short', () => {
    for (const c of CURATED_CARDS) expect(c.reflection.en.length, c.id).toBeLessThanOrEqual(110);
  });

  // Needs the generated Bible text (pnpm bible:import); skipped when it isn't there.
  it.skipIf(!existsSync(bibleDir))('uses real passages that fit on a card', () => {
    for (const c of CURATED_CARDS) {
      const range = fromKey(c.passage);
      expect(range && isValidRange(range), c.passage).toBe(true);
      const { book, startChapter, endChapter, startVerse, endVerse } = range!;
      expect(startChapter, c.passage).toBe(endChapter);
      const chapter = JSON.parse(readFileSync(join(bibleDir, book, `${startChapter}.json`), 'utf8')) as { verses: Array<{ verse: number; text: string }> };
      const verses = chapter.verses.filter((v) => v.verse >= (startVerse ?? 1) && v.verse <= (endVerse ?? 999));
      expect(verses.length, c.passage).toBe((endVerse ?? startVerse!) - startVerse! + 1);
      const words = wordCount(verses.map((v) => v.text).join(' '));
      expect(words, c.passage).toBeLessThanOrEqual(CARD_LIMITS.maxVerseWords);
    }
  });
});
