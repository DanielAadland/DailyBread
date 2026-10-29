import { checkContent, SOCIAL_LIMITS } from '@bible-app/core';
import { fromKey, parseReference, toKey, TRANSLATIONS } from '@bible-app/bible';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useCreatePost, useProfile } from '../../../api/hooks';
import { usePassage, useBookNames, useTranslationId } from '../../../bible/useBible';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { errorMessage, Loading, Notice, Segmented } from '../../../ui/misc';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';
import { TextField } from '../../../ui/TextField';

type ComposeType = 'verse' | 'reflection' | 'prayer';

/**
 * New post. `?type=verse&passage=JHN.3.16` shares verses from the reader;
 * `?type=reflection&passage=…&body=…` comes from a finished plan day.
 */
export default function ComposeScreen() {
  const params = useLocalSearchParams<{ type?: string; passage?: string; body?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const profile = useProfile();
  const create = useCreatePost();
  const translation = useTranslationId();
  const { referenceFromKey } = useBookNames();

  const initialType: ComposeType = params.type === 'verse' || params.type === 'reflection' ? params.type : 'prayer';
  const [type, setType] = useState<ComposeType>(initialType);
  const [body, setBody] = useState(params.body ?? '');
  const [refInput, setRefInput] = useState(params.passage && fromKey(params.passage) ? referenceFromKey(params.passage) : '');
  const [localError, setLocalError] = useState<string | null>(null);

  const parsed = useMemo(() => parseReference(refInput), [refInput]);
  const passageKey = type === 'verse' && params.passage ? params.passage : parsed ? toKey(parsed) : null;
  const verse = usePassage(translation, type === 'verse' && passageKey ? passageKey : 'GEN.1.1');
  const verseText = type === 'verse' && verse.data ? verse.data.map((v) => v.text).join(' ') : null;

  const submit = () => {
    setLocalError(null);
    const problem = checkContent(body, { maxLength: SOCIAL_LIMITS.postMax, allowEmpty: type === 'verse' });
    if (problem) return setLocalError(t(`errors.${problem === 'empty' ? 'content_empty' : problem === 'too_long' ? 'content_too_long' : problem}`));
    if (type !== 'prayer' && !passageKey) return setLocalError(t('compose.needPassage'));
    create.mutate(
      { type, body: body.trim(), passage: passageKey ?? undefined, translation, verseText: verseText ?? undefined },
      { onSuccess: () => router.replace('/feed') },
    );
  };

  const audience = t(`compose.audience.${profile.data?.visibility ?? 'friends'}`);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('compose.title') }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('feed.title')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed'))} />
      </View>
      <Txt variant="h1">{t(`compose.heading.${type}`)}</Txt>

      {type !== 'verse' ? (
        <Segmented<ComposeType>
          label={t('compose.kind')}
          value={type}
          onChange={setType}
          options={[
            { value: 'prayer', label: t('post.types.prayer') },
            { value: 'reflection', label: t('post.types.reflection') },
          ]}
        />
      ) : null}

      {type === 'verse' ? (
        verse.isPending ? (
          <Loading />
        ) : (
          <View style={{ gap: SPACE.xs }}>
            <Txt style={{ fontFamily: 'Literata_400Regular', fontSize: 19, lineHeight: 30 }}>{verseText}</Txt>
            <Txt variant="small" tone="mist">
              {`${passageKey ? referenceFromKey(passageKey) : ''} ${TRANSLATIONS[translation].abbreviation}`}
            </Txt>
          </View>
        )
      ) : null}

      {type === 'reflection' ? (
        <TextField
          label={t('compose.passage')}
          hint={parsed ? t('compose.passageFound', { place: referenceFromKey(toKey(parsed)) }) : t('compose.passageHint')}
          value={refInput}
          onChangeText={setRefInput}
          autoCapitalize="none"
        />
      ) : null}

      <TextField
        label={type === 'verse' ? t('compose.thoughtsOptional') : type === 'prayer' ? t('compose.prayerLabel') : t('compose.reflectionLabel')}
        hint={t('compose.limit', { count: SOCIAL_LIMITS.postMax })}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={SOCIAL_LIMITS.postMax}
      />

      <Txt variant="small" tone="mist">
        {audience}{' '}
        <Txt variant="small" tone="tide" accessibilityRole="link" onPress={() => router.push('/legal/guidelines')}>
          {t('compose.guidelines')}
        </Txt>
      </Txt>
      {localError || create.error ? <Notice tone="warning">{localError ?? errorMessage(t, create.error)}</Notice> : null}
      <Button label={t('compose.post')} icon="send" onPress={submit} loading={create.isPending} disabled={type === 'verse' && !verseText} fullWidth />
    </Screen>
  );
}
