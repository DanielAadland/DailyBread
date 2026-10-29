import Ionicons from '@expo/vector-icons/Ionicons';
import { BOOKS, type Book, type BookId } from '@bible-app/bible';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useBookNames, useLastRead } from '../../../bible/useBible';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Divider, Section } from '../../../ui/misc';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';

/** Book and chapter picker. `?book=JHN` opens that book's chapters. */
export default function BooksScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ book?: string }>();
  const [open, setOpen] = useState<BookId | null>((params.book as BookId) ?? null);
  const { last } = useLastRead();
  const { bookName, chapterTitle } = useBookNames();

  return (
    <Screen>
      <Txt variant="h1">{t('read.title')}</Txt>

      <View style={styles.top}>
        {last ? (
          <Button href={`/read/${last.book}/${last.chapter}`} label={t('read.continue', { place: chapterTitle(last.book, last.chapter) })} icon="book" />
        ) : null}
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={t('search.title')}
          onPress={() => router.push('/read/search')}
          style={(s) => [
            styles.search,
            { borderColor: colors.rule, backgroundColor: colors.surface },
            (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.mist} />
          <Txt tone="mist">{t('search.placeholder')}</Txt>
        </Pressable>
      </View>

      {(['OT', 'NT'] as const).map((testament) => (
        <Section key={testament} title={t(testament === 'OT' ? 'read.oldTestament' : 'read.newTestament')}>
          <View>
            {BOOKS.filter((b) => b.testament === testament).map((book, i) => (
              <View key={book.id}>
                {i > 0 ? <Divider /> : null}
                <BookRow book={book} name={bookName(book.id)} expanded={open === book.id} onToggle={() => setOpen(open === book.id ? null : book.id)} />
              </View>
            ))}
          </View>
        </Section>
      ))}
    </Screen>
  );
}

function BookRow({ book, name, expanded, onToggle }: { book: Book; name: string; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ expanded }}
        accessibilityHint={t('read.chaptersCount', { count: book.chapters })}
        onPress={onToggle}
        style={(s) => [
          styles.book,
          (s as { hovered?: boolean }).hovered && { backgroundColor: colors.tideSoft },
          (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
        ]}
      >
        <Txt variant="label" style={{ flex: 1 }}>
          {name}
        </Txt>
        <Txt variant="small" tone="mist">
          {t('read.chaptersCount', { count: book.chapters })}
        </Txt>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mist} />
      </Pressable>
      {expanded ? (
        <View style={styles.grid}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((c) => (
            <Pressable
              key={c}
              accessibilityRole="link"
              accessibilityLabel={`${name} ${c}`}
              onPress={() => router.push(`/read/${book.id}/${c}`)}
              style={(s) => [
                styles.chapter,
                { borderColor: colors.rule, backgroundColor: colors.surface },
                (s as { hovered?: boolean }).hovered && { backgroundColor: colors.tideSoft, borderColor: colors.tide },
                (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
              ]}
            >
              <Txt variant="label" style={{ fontVariant: ['tabular-nums'] }}>
                {c}
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { gap: SPACE.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 48, borderWidth: 1, borderRadius: RADIUS.control, paddingHorizontal: SPACE.md },
  book: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 52, paddingHorizontal: SPACE.sm, marginHorizontal: -SPACE.sm, borderRadius: RADIUS.control },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, paddingVertical: SPACE.md },
  chapter: { width: 48, height: 48, borderRadius: RADIUS.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
