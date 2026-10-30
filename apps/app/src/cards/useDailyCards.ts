import { CARD_LIMITS, dailyCardSet, localDate, type CardProgress, type CardStyle, type LocalDate } from '@bible-app/core';
import { fromKey, TRANSLATIONS, type TranslationId } from '@bible-app/bible';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueries } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCardPosts, useProfile } from '../api/hooks';
import type { Person, Post } from '../api/types';
import { bibleProvider, useBookNames, useTranslationId } from '../bible/useBible';
import { CURATED_CARDS } from './pool';

export interface DailyCard {
  key: string;
  style: CardStyle;
  passage: string;
  text: string;
  /** "Psalm 46:10 BSB" */
  reference: string;
  /** Curated reflection, or the words a friend wrote with their card. */
  words: string;
  /** Set for cards made by people you follow or your groups. */
  author: Person | null;
  post: Post | null;
}

export function useToday(): LocalDate {
  const profile = useProfile();
  return localDate(new Date(), profile.data?.timezone ?? 'UTC');
}

/** Today's set: friends' recent cards first (up to 3), then the curated cards for the date. */
export function useDailyCards(): { cards: DailyCard[]; isPending: boolean; error: unknown } {
  const today = useToday();
  const translation = useTranslationId();
  const { referenceFromKey } = useBookNames();
  const friends = useCardPosts();
  const curated = useMemo(() => dailyCardSet(today, CURATED_CARDS.length).map((i) => CURATED_CARDS[i]!), [today]);
  const texts = useQueries({
    queries: curated.map((c) => ({
      queryKey: ['passage', translation, c.passage],
      queryFn: () => bibleProvider(translation).getPassage(fromKey(c.passage)!),
      staleTime: Infinity,
    })),
  });

  const label = (passage: string, t: TranslationId | null) => `${referenceFromKey(passage)} ${TRANSLATIONS[t ?? translation].abbreviation}`;
  const cards: DailyCard[] = [
    ...(friends.data ?? []).slice(0, CARD_LIMITS.dailyFromFriends).map(
      (p): DailyCard => ({
        key: p.id,
        style: p.card!,
        passage: p.passage ?? '',
        text: p.verseText ?? '',
        reference: p.passage ? label(p.passage, p.translation) : '',
        words: p.body,
        author: p.author,
        post: p,
      }),
    ),
    ...curated.flatMap((c, i): DailyCard[] => {
      const verses = texts[i]?.data;
      if (!verses) return [];
      return [
        {
          key: c.id,
          style: { background: c.background, font: 'serif' },
          passage: c.passage,
          text: verses.map((v) => v.text).join(' '),
          reference: label(c.passage, translation),
          words: c.reflection.en,
          author: null,
          post: null,
        },
      ];
    }),
  ];

  return {
    cards,
    isPending: friends.isPending || texts.some((q) => q.isPending),
    error: texts.find((q) => q.error)?.error ?? null,
  };
}

const PROGRESS_KEY = 'dailybread.cards-progress';

// One shared copy so Today and the viewer agree without reloading.
let cached: CardProgress | null = null;
let loading: Promise<void> | null = null;
let isLoaded = false;
const listeners = new Set<() => void>();

function loadProgress(): Promise<void> {
  loading ??= AsyncStorage.getItem(PROGRESS_KEY)
    .then((raw) => {
      cached = raw ? (JSON.parse(raw) as CardProgress) : null;
    })
    .catch(() => {
      cached = null;
    })
    .finally(() => {
      isLoaded = true;
      listeners.forEach((l) => l());
    });
  return loading;
}

/** How far through today's set this person is. Kept on the device; a fresh day starts at 0. */
export function useCardProgress(today: LocalDate) {
  const [, rerender] = useState(0);
  const [loaded, setLoaded] = useState(isLoaded);

  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    loadProgress().then(() => setLoaded(true));
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const markSeen = useCallback(
    (seen: number) => {
      if (cached && cached.date === today && cached.seen >= seen) return;
      cached = { date: today, seen };
      AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(cached)).catch(() => undefined);
      listeners.forEach((l) => l());
    },
    [today],
  );

  return { seen: cached?.date === today ? cached.seen : 0, loaded, markSeen };
}
