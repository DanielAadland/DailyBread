import Ionicons from '@expo/vector-icons/Ionicons';
import { parseReference } from '@bible-app/bible';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useBackend } from '../../../api/BackendProvider';
import { useSearch } from '../../../api/hooks';
import { useBookNames, useTranslationId } from '../../../bible/useBible';
import { useTheme } from '../../../theme/ThemeProvider';
import { FONTS, RADIUS, SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Divider, ErrorState, Loading, Notice } from '../../../ui/misc';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';
import { TextField } from '../../../ui/TextField';

/** Jump to a reference ("John 3:16") or search the text by words. */
export default function SearchScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { backend } = useBackend();
  const translation = useTranslationId();
  const { reference, chapterTitle } = useBookNames();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  // Search after a short pause in typing.
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(id);
  }, [input]);

  const ref = parseReference(input);
  const results = useSearch(translation, ref ? '' : query);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('search.title') }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('read.title')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/read'))} />
      </View>
      <Txt variant="h1">{t('search.title')}</Txt>
      <TextField
        label={t('search.label')}
        hint={backend.search ? t('search.hint') : t('search.hintReferenceOnly')}
        value={input}
        onChangeText={setInput}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => ref && router.push(`/read/${ref.book}/${ref.startChapter}${ref.startVerse ? `?verse=${ref.startVerse}` : ''}`)}
      />

      {ref ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/read/${ref.book}/${ref.startChapter}${ref.startVerse ? `?verse=${ref.startVerse}` : ''}`)}
          style={(s) => [
            styles.goTo,
            { backgroundColor: colors.tideSoft },
            (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
          ]}
        >
          <Ionicons name="arrow-forward-circle" size={22} color={colors.tide} />
          <Txt variant="label">{t('search.goTo', { place: reference(ref) })}</Txt>
        </Pressable>
      ) : !backend.search ? (
        query.length >= 2 ? <Notice>{t('search.demoUnavailable')}</Notice> : null
      ) : query.length < 2 ? null : results.isPending ? (
        <Loading />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : results.data.length === 0 ? (
        <Txt tone="mist">{t('search.noResults', { query })}</Txt>
      ) : (
        <View>
          <Txt variant="small" tone="mist" style={{ marginBottom: SPACE.sm }}>
            {results.data.length >= 50 ? t('search.manyResults') : t('search.resultCount', { count: results.data.length })}
          </Txt>
          {results.data.map((hit, i) => {
            const place = `${chapterTitle(hit.book, hit.chapter)}:${hit.verse}`;
            return (
              <View key={`${hit.book}.${hit.chapter}.${hit.verse}`}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${place}. ${hit.text}`}
                  onPress={() => router.push(`/read/${hit.book}/${hit.chapter}?verse=${hit.verse}`)}
                  style={(s) => [
                    styles.hit,
                    (s as { hovered?: boolean }).hovered && { backgroundColor: colors.tideSoft },
                    (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
                  ]}
                >
                  <Txt variant="label">{place}</Txt>
                  <Txt style={{ fontFamily: FONTS.scripture }}>{hit.text}</Txt>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  goTo: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.control },
  hit: { gap: SPACE.xs, paddingVertical: SPACE.md, paddingHorizontal: SPACE.sm, marginHorizontal: -SPACE.sm, borderRadius: RADIUS.control },
});
