import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { CARD_BACKGROUNDS, cardsDoneToday, cardText, cardTextSize, dailyCardSet, isCardStyle, seededShuffle, wordCount } from './cards';

describe('isCardStyle', () => {
  it('accepts known backgrounds and fonts only', () => {
    expect(isCardStyle({ background: 'dawn', font: 'serif' })).toBe(true);
    expect(isCardStyle({ background: 'neon', font: 'serif' })).toBe(false);
    expect(isCardStyle({ background: 'dawn', font: 'comic' })).toBe(false);
    expect(isCardStyle({ background: 'dawn', font: 'serif', image: 'x' })).toBe(false);
    expect(isCardStyle(null)).toBe(false);
  });
});

describe('seededShuffle', () => {
  it('is a permutation and deterministic', () => {
    const a = seededShuffle(20, 42);
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(seededShuffle(20, 42)).toEqual(a);
    expect(seededShuffle(20, 43)).not.toEqual(a);
  });
});

describe('dailyCardSet', () => {
  it('gives everyone the same set on the same day', () => {
    expect(dailyCardSet('2026-11-05', 70)).toEqual(dailyCardSet('2026-11-05', 70));
    expect(dailyCardSet('2026-11-05', 70)).toHaveLength(7);
  });

  it("doesn't repeat a card until the pool has been shown", () => {
    // 70 cards, 7 a day: a 10-day cycle. Find where a cycle starts and check it.
    let start = '2026-11-01';
    while (!isCycleStart(start)) start = addDays(start, 1);
    const seen = new Set<number>();
    for (let i = 0; i < 10; i++) for (const n of dailyCardSet(addDays(start, i), 70)) seen.add(n);
    expect(seen.size).toBe(70);
  });

  it('handles small pools and dates before the epoch', () => {
    expect(dailyCardSet('2026-11-05', 3)).toHaveLength(3);
    expect(dailyCardSet('2025-06-01', 70)).toHaveLength(7);
    expect(dailyCardSet('2026-11-05', 0)).toEqual([]);
  });

  function isCycleStart(date: string) {
    const days = Math.round((Date.parse(date) - Date.parse('2026-01-01')) / 86_400_000);
    return days % 10 === 0;
  }
});

describe('cardTextSize / wordCount', () => {
  it('uses larger type for shorter verses', () => {
    expect(cardTextSize(wordCount('Be still, and know that I am God.'))).toBe('xl');
    expect(cardTextSize(30)).toBe('l');
    expect(cardTextSize(50)).toBe('m');
    expect(cardTextSize(70)).toBe('s');
  });
});

describe('cardsDoneToday', () => {
  it("is done once today's whole set has been seen", () => {
    expect(cardsDoneToday({ date: '2026-11-05', seen: 7 }, '2026-11-05', 7)).toBe(true);
    expect(cardsDoneToday({ date: '2026-11-05', seen: 6 }, '2026-11-05', 7)).toBe(false);
    expect(cardsDoneToday({ date: '2026-11-04', seen: 7 }, '2026-11-05', 7)).toBe(false);
    expect(cardsDoneToday(null, '2026-11-05', 7)).toBe(false);
  });

  it('has twelve backgrounds', () => {
    expect(CARD_BACKGROUNDS).toHaveLength(12);
  });
});

describe('cardText', () => {
  it('drops quotation marks that belong to neighbouring verses', () => {
    expect(cardText('Do not be afraid; the LORD is with you wherever you go.”')).toBe('Do not be afraid; the LORD is with you wherever you go.');
    expect(cardText('“Be still and know that I am God.”')).toBe('“Be still and know that I am God.”');
    expect(cardText('“I am the light of the world.')).toBe('I am the light of the world.');
  });

  it('ends a passage that stops mid-sentence with an ellipsis', () => {
    expect(cardText('Bless the LORD, O my soul, and do not forget all His kind deeds—')).toBe('Bless the LORD, O my soul, and do not forget all His kind deeds…');
    expect(cardText('for the Lord and not for men,')).toBe('for the Lord and not for men…');
  });
});
