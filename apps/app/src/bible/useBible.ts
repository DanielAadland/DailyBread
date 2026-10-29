import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BOOKS,
  formatReference,
  fromKey,
  getBook,
  isBookId,
  StaticBibleProvider,
  type BookId,
  type PassageRange,
  type TranslationId,
} from '@bible-app/bible';
import { useProfile } from '../api/hooks';
import { config } from '../config';

const providers = new Map<TranslationId, StaticBibleProvider>();

export function bibleProvider(translation: TranslationId): StaticBibleProvider {
  let p = providers.get(translation);
  if (!p) {
    p = new StaticBibleProvider(translation, config.bibleBaseUrl, (url) => fetch(url));
    providers.set(translation, p);
  }
  return p;
}

/** The user's chosen translation (BSB by default). */
export function useTranslationId(): TranslationId {
  return useProfile().data?.translation ?? 'bsb';
}

export function useChapter(translation: TranslationId, book: BookId, chapter: number) {
  return useQuery({
    queryKey: ['chapter', translation, book, chapter],
    queryFn: () => bibleProvider(translation).getChapter(book, chapter),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}

export function usePassage(translation: TranslationId, key: string) {
  return useQuery({
    queryKey: ['passage', translation, key],
    queryFn: () => {
      const range = fromKey(key);
      if (!range) throw new Error(`Bad passage ${key}`);
      return bibleProvider(translation).getPassage(range);
    },
    staleTime: Infinity,
  });
}

/** Warm the cache for the next chapter so turning the page feels instant. */
export function prefetchChapter(translation: TranslationId, book: BookId, chapter: number): void {
  bibleProvider(translation).getChapter(book, chapter).catch(() => undefined);
}

/** Book names and references in the UI language. */
export function useBookNames() {
  const { t, i18n } = useTranslation();
  const bookName = useCallback((id: BookId) => t(`books.${id}`), [t]);
  /** Name for a single chapter: "Psalm 23", not "Psalms 23". */
  const singularName = useCallback(
    (id: BookId) => (i18n.exists(`bookSingular.${id}`) ? t(`bookSingular.${id}`) : bookName(id)),
    [t, i18n, bookName],
  );
  const chapterTitle = useCallback((id: BookId, chapter: number) => `${singularName(id)} ${chapter}`, [singularName]);
  const reference = useCallback(
    (range: PassageRange) => formatReference(range, range.startChapter === range.endChapter ? singularName : bookName),
    [bookName, singularName],
  );
  const referenceFromKey = useCallback(
    (key: string) => {
      const range = fromKey(key);
      return range ? reference(range) : key;
    },
    [reference],
  );
  return { bookName, chapterTitle, reference, referenceFromKey };
}

export function nextChapter(book: BookId, chapter: number): { book: BookId; chapter: number } | null {
  const b = getBook(book);
  if (chapter < b.chapters) return { book, chapter: chapter + 1 };
  const next = BOOKS[b.order];
  return next ? { book: next.id, chapter: 1 } : null;
}

export function previousChapter(book: BookId, chapter: number): { book: BookId; chapter: number } | null {
  if (chapter > 1) return { book, chapter: chapter - 1 };
  const prev = BOOKS[getBook(book).order - 2];
  return prev ? { book: prev.id, chapter: prev.chapters } : null;
}

const LAST_READ_KEY = 'dailybread.last-read';

/** Where the reader was last open, to continue from the Read tab. */
export function useLastRead() {
  const [last, setLast] = useState<{ book: BookId; chapter: number } | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(LAST_READ_KEY)
      .then((raw) => {
        if (!raw) return;
        const v = JSON.parse(raw) as { book: string; chapter: number };
        if (isBookId(v.book)) setLast({ book: v.book, chapter: v.chapter });
      })
      .catch(() => undefined);
  }, []);
  const remember = useCallback((book: BookId, chapter: number) => {
    AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify({ book, chapter })).catch(() => undefined);
  }, []);
  return { last, remember };
}
