import Ionicons from '@expo/vector-icons/Ionicons';
import { getBook, isBookId, TRANSLATIONS, type BookId } from '@bible-app/bible';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAnnotations,
  useDeleteNote,
  useLogFreeReading,
  useSaveNote,
  useSetHighlight,
  useToggleBookmark,
} from '../../../../api/hooks';
import { HIGHLIGHT_COLORS, type CompleteResult, type Note } from '../../../../api/types';
import { nextChapter, prefetchChapter, previousChapter, useBookNames, useChapter, useLastRead, useTranslationId } from '../../../../bible/useBible';
import { useTheme } from '../../../../theme/ThemeProvider';
import { LAYOUT, RADIUS, SPACE } from '../../../../theme/tokens';
import { Button, IconButton } from '../../../../ui/Button';
import { Divider, ErrorState, errorMessage, Loading, Notice } from '../../../../ui/misc';
import { ReadingSettings } from '../../../../ui/ReadingSettings';
import { Screen, SCREEN_TOP_PADDING } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Text';
import { TextField } from '../../../../ui/TextField';
import { VerseList } from '../../../../ui/VerseList';

export default function ReaderScreen() {
  const params = useLocalSearchParams<{ book: string; chapter: string; verse?: string }>();
  const book = (params.book ?? '').toUpperCase();
  const chapter = Number(params.chapter);
  const { t } = useTranslation();
  const router = useRouter();

  if (!isBookId(book) || !Number.isInteger(chapter) || chapter < 1 || chapter > getBook(book).chapters) {
    return (
      <Screen>
        <Txt variant="h2">{t('read.notFound')}</Txt>
        <Button label={t('read.title')} variant="secondary" onPress={() => router.replace('/read')} />
      </Screen>
    );
  }
  return <Reader key={`${book}.${chapter}`} book={book} chapter={chapter} focusVerse={params.verse ? Number(params.verse) : undefined} />;
}

interface NoteDraft {
  id?: string;
  verseStart: number;
  verseEnd: number;
  body: string;
}

function Reader({ book, chapter, focusVerse }: { book: BookId; chapter: number; focusVerse?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translation = useTranslationId();
  const { bookName, chapterTitle } = useBookNames();
  const { remember } = useLastRead();
  const text = useChapter(translation, book, chapter);
  const annotations = useAnnotations(book, chapter);
  const setHighlight = useSetHighlight(book, chapter);
  const toggleBookmark = useToggleBookmark(book, chapter);
  const saveNote = useSaveNote();
  const deleteNote = useDeleteNote();
  const logReading = useLogFreeReading();

  const [selected, setSelected] = useState<Set<number>>(() => new Set(focusVerse ? [focusVerse] : []));
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [counted, setCounted] = useState<CompleteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const listY = useRef(0);
  const scrolled = useRef(false);

  const title = `${chapterTitle(book, chapter)}`;
  const next = nextChapter(book, chapter);
  const prev = previousChapter(book, chapter);

  useEffect(() => {
    remember(book, chapter);
    if (next) prefetchChapter(translation, next.book, next.chapter);
  }, [book, chapter, translation, next, remember]);

  const onVerseLayout = useCallback(
    (verse: number, y: number) => {
      if (verse === focusVerse && !scrolled.current) {
        scrolled.current = true;
        scrollRef.current?.scrollTo({ y: Math.max(0, SCREEN_TOP_PADDING + listY.current + y - 80), animated: false });
      }
    },
    [focusVerse],
  );

  const toggleVerse = useCallback((verse: number) => {
    setSelected((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(verse)) nextSet.delete(verse);
      else nextSet.add(verse);
      return nextSet;
    });
    setCopied(false);
  }, []);

  const verses = text.data?.verses ?? [];
  const sorted = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);
  const highlights = annotations.data?.highlights ?? {};
  const notes = annotations.data?.notes ?? [];
  const withNotes = useMemo(() => {
    const set = new Set<number>();
    for (const n of notes) for (let v = n.verseStart; v <= n.verseEnd; v++) set.add(v);
    return set;
  }, [notes]);
  const chapterBookmarked = !!annotations.data?.bookmarks.some((b) => b.verse === null);
  const selectionLabel =
    sorted.length === 0
      ? ''
      : sorted.length === 1 || sorted[sorted.length - 1]! - sorted[0]! + 1 !== sorted.length
        ? sorted.length === 1
          ? `${title}:${sorted[0]}`
          : t('reader.versesSelected', { count: sorted.length })
        : `${title}:${sorted[0]}–${sorted[sorted.length - 1]}`;

  const copy = async () => {
    const body = verses.filter((v) => selected.has(v.verse)).map((v) => v.text).join(' ');
    await Clipboard.setStringAsync(`“${body}” ${selectionLabel} ${TRANSLATIONS[translation].abbreviation}`);
    setCopied(true);
  };

  const openNote = () => {
    const first = sorted[0];
    if (first === undefined) return;
    const existing = notes.find((n) => n.verseStart <= first && n.verseEnd >= first);
    setDraft(existing ? { id: existing.id, verseStart: existing.verseStart, verseEnd: existing.verseEnd, body: existing.body } : { verseStart: first, verseEnd: sorted[sorted.length - 1]!, body: '' });
  };

  const footer =
    sorted.length > 0 ? (
      <View style={[styles.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.rule, paddingBottom: Math.max(insets.bottom, SPACE.sm) }]} role="toolbar" aria-label={t('reader.actions')}>
        <View style={styles.actionInner}>
          <View style={styles.actionHead}>
            <Txt variant="label" style={{ flex: 1 }}>
              {copied ? t('reader.copied') : selectionLabel}
            </Txt>
            <IconButton icon="close" label={t('reader.clearSelection')} onPress={() => setSelected(new Set())} />
          </View>
          <View style={styles.actionRow}>
            {HIGHLIGHT_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={t('reader.highlightIn', { color: t(`reader.colors.${c}`) })}
                onPress={() => setHighlight.mutate({ verses: sorted, color: c }, { onSuccess: () => setSelected(new Set()) })}
                style={(s) => [
                  styles.swatch,
                  { backgroundColor: colors.highlight[c], borderColor: colors.rule },
                  (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
                ]}
              />
            ))}
            {sorted.some((v) => highlights[v]) ? (
              <IconButton icon="remove-circle-outline" label={t('reader.removeHighlight')} onPress={() => setHighlight.mutate({ verses: sorted, color: null })} />
            ) : null}
            <View style={styles.spacer} />
            <IconButton
              icon={annotations.data?.bookmarks.some((b) => b.verse === sorted[0]) ? 'bookmark' : 'bookmark-outline'}
              label={t('reader.bookmarkVerse')}
              onPress={() => toggleBookmark.mutate(sorted[0]!)}
            />
            <IconButton icon="create-outline" label={t('reader.addNote')} onPress={openNote} />
            <IconButton icon="copy-outline" label={t('reader.copy')} onPress={copy} />
          </View>
        </View>
      </View>
    ) : null;

  return (
    <Screen width={LAYOUT.reader} footer={footer} scrollRef={scrollRef}>
      <Stack.Screen options={{ title }} />
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reader.chooseChapter', { place: title })}
          onPress={() => router.push(`/read?book=${book}`)}
          style={(s) => [styles.titleButton, (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' }]}
        >
          <Txt variant="h1">{title}</Txt>
          <Ionicons name="chevron-down" size={20} color={colors.mist} />
        </Pressable>
        <View style={styles.tools}>
          <IconButton icon="search" label={t('search.title')} onPress={() => router.push('/read/search')} />
          <IconButton icon="text" label={t('reading.title')} active={showSettings} onPress={() => setShowSettings((v) => !v)} />
          <IconButton
            icon={chapterBookmarked ? 'bookmark' : 'bookmark-outline'}
            label={chapterBookmarked ? t('reader.removeChapterBookmark') : t('reader.bookmarkChapter')}
            active={chapterBookmarked}
            onPress={() => toggleBookmark.mutate(null)}
          />
        </View>
      </View>

      {showSettings ? (
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.rule }]}>
          <ReadingSettings />
        </View>
      ) : null}

      {text.isPending ? (
        <Loading />
      ) : text.isError ? (
        <ErrorState error={text.error} onRetry={() => text.refetch()} />
      ) : (
        <View onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
          <VerseList
            verses={verses}
            highlights={highlights}
            selected={selected}
            withNotes={withNotes}
            onPressVerse={toggleVerse}
            onVerseLayout={focusVerse ? onVerseLayout : undefined}
            chapterLabel={title}
          />
        </View>
      )}
      <Txt variant="small" tone="mist">
        {TRANSLATIONS[translation].attribution}
      </Txt>

      {notes.length > 0 ? (
        <View style={{ gap: SPACE.md }}>
          <Txt variant="h3">{t('reader.yourNotes')}</Txt>
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} title={title} onEdit={() => setDraft({ id: n.id, verseStart: n.verseStart, verseEnd: n.verseEnd, body: n.body })} />
          ))}
        </View>
      ) : null}

      <Divider />
      {counted ? (
        <View style={styles.counted} role="status" accessibilityLiveRegion="polite">
          <Ionicons name="sunny" size={22} color={colors.dawn} />
          <Txt variant="label" style={{ flex: 1 }}>
            {counted.streak.counted ? t('reader.countedToday', { count: counted.streak.current }) : t('reader.chapterRecorded')}
          </Txt>
        </View>
      ) : (
        <Button
          label={t('reader.markRead')}
          icon="checkmark"
          variant="secondary"
          loading={logReading.isPending}
          onPress={() => logReading.mutate({ book, chapter }, { onSuccess: setCounted })}
        />
      )}
      {logReading.error ? <Notice tone="warning">{errorMessage(t, logReading.error)}</Notice> : null}

      <View style={styles.pager}>
        {prev ? (
          <Button label={`${chapterTitle(prev.book, prev.chapter)}`} icon="chevron-back" variant="quiet" onPress={() => router.replace(`/read/${prev.book}/${prev.chapter}`)} />
        ) : (
          <View />
        )}
        {next ? <Button label={`${chapterTitle(next.book, next.chapter)}`} variant="quiet" onPress={() => router.replace(`/read/${next.book}/${next.chapter}`)} /> : null}
      </View>

      <NoteEditor
        draft={draft}
        title={title}
        saving={saveNote.isPending}
        error={saveNote.error ?? deleteNote.error}
        onChange={(body) => setDraft((d) => (d ? { ...d, body } : d))}
        onCancel={() => setDraft(null)}
        onSave={() =>
          draft &&
          saveNote.mutate(
            { id: draft.id, book, chapter, verseStart: draft.verseStart, verseEnd: draft.verseEnd, body: draft.body },
            {
              onSuccess: () => {
                setDraft(null);
                setSelected(new Set());
              },
            },
          )
        }
        onDelete={draft?.id ? () => deleteNote.mutate({ id: draft.id!, book, chapter }, { onSuccess: () => setDraft(null) }) : undefined}
      />
    </Screen>
  );
}

function NoteRow({ note, title, onEdit }: { note: Note; title: string; onEdit: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const place = note.verseStart === note.verseEnd ? `${title}:${note.verseStart}` : `${title}:${note.verseStart}–${note.verseEnd}`;
  return (
    <View style={[styles.note, { borderLeftColor: colors.tide }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="small" tone="mist">
          {place}
        </Txt>
        <Txt>{note.body}</Txt>
      </View>
      <IconButton icon="create-outline" label={t('reader.editNote', { place })} onPress={onEdit} size={18} />
    </View>
  );
}

function NoteEditor({
  draft,
  title,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: NoteDraft | null;
  title: string;
  saving: boolean;
  error: unknown;
  onChange: (body: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!draft) return null;
  const place = draft.verseStart === draft.verseEnd ? `${title}:${draft.verseStart}` : `${title}:${draft.verseStart}–${draft.verseEnd}`;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.bg, borderColor: colors.rule }]} role="dialog" aria-label={t('reader.noteTitle', { place })}>
          <Txt variant="h3">{t('reader.noteTitle', { place })}</Txt>
          <TextField label={t('reader.noteLabel')} hint={t('reader.noteHint')} value={draft.body} onChangeText={onChange} multiline maxLength={5000} autoFocus />
          {error ? <Notice tone="warning">{errorMessage(t, error)}</Notice> : null}
          <View style={styles.dialogActions}>
            {onDelete ? <Button label={t('common.delete')} variant="danger" onPress={onDelete} /> : null}
            <View style={styles.spacer} />
            <Button label={t('common.cancel')} variant="quiet" onPress={onCancel} />
            <Button label={t('common.save')} onPress={onSave} loading={saving} disabled={draft.body.trim().length === 0} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.sm },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderRadius: RADIUS.control },
  tools: { flexDirection: 'row', gap: SPACE.xs },
  panel: { borderWidth: 1, borderRadius: RADIUS.panel, padding: SPACE.md },
  actionBar: { borderTopWidth: 1, paddingTop: SPACE.sm, paddingHorizontal: SPACE.md },
  actionInner: { width: '100%', maxWidth: LAYOUT.reader, alignSelf: 'center', gap: SPACE.xs },
  actionHead: { flexDirection: 'row', alignItems: 'center' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  swatch: { width: 32, height: 32, borderRadius: RADIUS.pill, borderWidth: 1 },
  spacer: { flex: 1 },
  counted: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  pager: { flexDirection: 'row', justifyContent: 'space-between' },
  note: { flexDirection: 'row', gap: SPACE.sm, borderLeftWidth: 3, paddingLeft: SPACE.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,39,0.45)', justifyContent: 'center', padding: SPACE.md },
  dialog: { width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: RADIUS.panel, borderWidth: 1, padding: SPACE.lg, gap: SPACE.md },
  dialogActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
});

