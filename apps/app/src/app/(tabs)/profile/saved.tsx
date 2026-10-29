import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSaved } from '../../../api/hooks';
import { useBookNames } from '../../../bible/useBible';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Divider, ErrorState, Loading, Section } from '../../../ui/misc';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';

/** Bookmarks and notes, newest first. Private to the user. */
export default function SavedScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const saved = useSaved();
  const { bookName, chapterTitle } = useBookNames();

  const open = (book: string, chapter: number, verse?: number | null) =>
    router.push(`/read/${book}/${chapter}${verse ? `?verse=${verse}` : ''}`);
  const rowStyle = (s: object) => [
    styles.row,
    (s as { hovered?: boolean }).hovered && { backgroundColor: colors.tideSoft },
    (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' as const },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: t('profile.saved') }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('tabs.profile')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      </View>
      <Txt variant="h1">{t('profile.saved')}</Txt>
      <Txt tone="mist">{t('saved.privateNote')}</Txt>

      {saved.isPending ? (
        <Loading />
      ) : saved.isError ? (
        <ErrorState error={saved.error} onRetry={() => saved.refetch()} />
      ) : (
        <>
          <Section title={t('saved.bookmarks')}>
            {saved.data.bookmarks.length === 0 ? (
              <Txt tone="mist">{t('saved.noBookmarks')}</Txt>
            ) : (
              <View>
                {saved.data.bookmarks.map((b, i) => {
                  const place = `${chapterTitle(b.book, b.chapter)}${b.verse ? `:${b.verse}` : ''}`;
                  return (
                    <View key={b.id}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable accessibilityRole="link" accessibilityLabel={place} onPress={() => open(b.book, b.chapter, b.verse)} style={rowStyle}>
                        <Ionicons name="bookmark" size={18} color={colors.tide} />
                        <Txt variant="label" style={{ flex: 1 }}>
                          {place}
                        </Txt>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </Section>
          <Section title={t('saved.notes')}>
            {saved.data.notes.length === 0 ? (
              <Txt tone="mist">{t('saved.noNotes')}</Txt>
            ) : (
              <View>
                {saved.data.notes.map((n, i) => {
                  const place = `${chapterTitle(n.book, n.chapter)}:${n.verseStart}${n.verseEnd !== n.verseStart ? `–${n.verseEnd}` : ''}`;
                  return (
                    <View key={n.id}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable accessibilityRole="link" accessibilityLabel={`${place}. ${n.body}`} onPress={() => open(n.book, n.chapter, n.verseStart)} style={rowStyle}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt variant="label">{place}</Txt>
                          <Txt numberOfLines={3}>{n.body}</Txt>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.sm, marginHorizontal: -SPACE.sm, borderRadius: RADIUS.control },
});
