import { CARD_BACKGROUNDS, CARD_FONTS, CARD_LIMITS, checkContent, SOCIAL_LIMITS, wordCount, type CardBackground, type CardFont } from '@bible-app/core';
import { fromKey, parseReference, toKey, TRANSLATIONS } from '@bible-app/bible';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCreatePost, useMyGroups } from '../../api/hooks';
import { useBookNames, usePassage, useTranslationId } from '../../bible/useBible';
import { CardArtSvg } from '../../cards/CardArtSvg';
import { canMakeImages, canShareImage, imageFileName, renderCardImage, saveImage, shareImage } from '../../cards/exportImage';
import { VerseCard } from '../../cards/VerseCard';
import { useTheme } from '../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../theme/tokens';
import { Button } from '../../ui/Button';
import { RadioList } from '../../ui/GroupForm';
import { errorMessage, Loading, Notice, Segmented } from '../../ui/misc';
import { Screen } from '../../ui/Screen';
import { Txt } from '../../ui/Text';
import { TextField } from '../../ui/TextField';

/** Make a verse card: pick a passage, a background and a typeface; post it or save it as an image. */
export default function NewCardScreen() {
  const params = useLocalSearchParams<{ passage?: string; bg?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const translation = useTranslationId();
  const { referenceFromKey } = useBookNames();
  const groups = useMyGroups();
  const create = useCreatePost();

  const initialKey = params.passage && fromKey(params.passage) ? params.passage : 'PSA.46.10';
  const [refInput, setRefInput] = useState(referenceFromKey(initialKey));
  const [background, setBackground] = useState<CardBackground>(
    (CARD_BACKGROUNDS as readonly string[]).includes(params.bg ?? '') ? (params.bg as CardBackground) : 'dawn',
  );
  const [font, setFont] = useState<CardFont>('serif');
  const [words, setWords] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const parsed = parseReference(refInput);
  const key = parsed ? toKey(parsed) : null;
  const passage = usePassage(translation, key ?? initialKey);
  const text = key && passage.data ? passage.data.map((v) => v.text).join(' ') : '';
  const tooLong = wordCount(text) > CARD_LIMITS.maxVerseWords;
  const reference = key ? `${referenceFromKey(key)} ${TRANSLATIONS[translation].abbreviation}` : '';
  const ready = !!key && !!text && !tooLong;

  const image = () => renderCardImage({ style: { background, font }, text, reference, wordmark: t('app.name') });

  const post = () => {
    const issue = checkContent(words, { maxLength: SOCIAL_LIMITS.postMax, allowEmpty: true });
    if (issue) return setProblem(t(`errors.${issue === 'too_long' ? 'content_too_long' : issue === 'empty' ? 'content_empty' : issue}`));
    setProblem(null);
    create.mutate(
      { type: 'verse', body: words.trim(), passage: key!, translation, verseText: text, card: { background, font }, groupId: target || undefined },
      { onSuccess: () => router.replace(target ? `/feed/groups/${target}` : '/feed') },
    );
  };

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <Txt variant="h1">{t('cards.newTitle')}</Txt>

      <View style={styles.preview}>
        {passage.isPending && key ? (
          <View style={styles.placeholder}>
            <Loading />
          </View>
        ) : (
          <VerseCard style={{ background, font }} text={ready ? text : t('cards.previewEmpty')} reference={ready ? reference : ''} />
        )}
      </View>

      <TextField
        label={t('cards.passage')}
        hint={key ? t('cards.passageFound', { place: referenceFromKey(key) }) : t('cards.passageHint')}
        value={refInput}
        onChangeText={setRefInput}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {tooLong ? <Notice tone="warning">{t('cards.tooLong', { count: CARD_LIMITS.maxVerseWords })}</Notice> : null}

      <BackgroundPicker value={background} onChange={setBackground} />
      <Segmented<CardFont>
        label={t('cards.font')}
        value={font}
        onChange={setFont}
        options={CARD_FONTS.map((f) => ({ value: f, label: t(`cards.fonts.${f}`) }))}
      />
      <TextField
        label={t('cards.words')}
        hint={t('cards.wordsHint')}
        value={words}
        onChangeText={setWords}
        multiline
        maxLength={SOCIAL_LIMITS.postMax}
      />

      {(groups.data?.length ?? 0) > 0 ? (
        <RadioList<string>
          label={t('compose.whereLabel')}
          value={target}
          onChange={setTarget}
          options={[
            { value: '', label: t('compose.toFollowers') },
            ...(groups.data ?? []).map((g) => ({ value: g.id, label: g.name, hint: t('compose.groupHint') })),
          ]}
        />
      ) : null}

      {problem || create.error ? <Notice tone="warning">{problem ?? errorMessage(t, create.error)}</Notice> : null}
      <View style={styles.buttons}>
        <Button label={t('cards.post')} icon="send" disabled={!ready} loading={create.isPending} onPress={post} />
        {canMakeImages ? (
          <Button
            label={t('cards.saveImage')}
            icon="download-outline"
            variant="secondary"
            disabled={!ready}
            loading={busy === 'save'}
            onPress={async () => {
              setBusy('save');
              try {
                saveImage(await image(), imageFileName(reference));
              } finally {
                setBusy(null);
              }
            }}
          />
        ) : null}
        {canShareImage() ? (
          <Button
            label={t('cards.shareImage')}
            icon="share-social-outline"
            variant="secondary"
            disabled={!ready}
            loading={busy === 'share'}
            onPress={async () => {
              setBusy('share');
              try {
                await shareImage(await image(), imageFileName(reference), reference);
              } catch {
                // Closing the share sheet is not an error.
              } finally {
                setBusy(null);
              }
            }}
          />
        ) : null}
      </View>
      <Txt variant="small" tone="mist">
        {TRANSLATIONS[translation].attribution}
      </Txt>
    </Screen>
  );
}

function BackgroundPicker({ value, onChange }: { value: CardBackground; onChange: (v: CardBackground) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: SPACE.sm }}>
      <Txt variant="label">{t('cards.background')}</Txt>
      <View role="radiogroup" aria-label={t('cards.background')} style={styles.swatches}>
        {CARD_BACKGROUNDS.map((bg) => {
          const selected = bg === value;
          return (
            <Pressable
              key={bg}
              role="radio"
              aria-checked={selected}
              accessibilityLabel={t(`cards.backgrounds.${bg}`)}
              onPress={() => onChange(bg)}
              style={(s) => [
                styles.swatch,
                { borderColor: selected ? colors.tide : colors.rule, borderWidth: selected ? 3 : 1 },
                (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
              ]}
            >
              <CardArtSvg background={bg} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  placeholder: { width: '100%', aspectRatio: 4 / 5, justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  swatch: { width: 52, height: 65, borderRadius: RADIUS.control, overflow: 'hidden' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
});
