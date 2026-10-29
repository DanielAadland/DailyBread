import { isValidInviteCode } from '@bible-app/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useFindGroups, useJoinGroup, useMyGroups } from '../../../../api/hooks';
import { SPACE } from '../../../../theme/tokens';
import { Button } from '../../../../ui/Button';
import { GroupCard } from '../../../../ui/GroupCard';
import { ErrorState, errorMessage, Loading, Notice, Section } from '../../../../ui/misc';
import { Screen } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Text';
import { TextField } from '../../../../ui/TextField';

/** My groups, joining with a code, and public groups to discover. */
export default function GroupsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const mine = useMyGroups();

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('feed.title')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed'))} />
      </View>
      <Txt variant="h1">{t('groups.title')}</Txt>
      <Txt tone="mist">{t('groups.intro')}</Txt>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('groups.create')} icon="add" href="/feed/groups/new" />
      </View>

      <Section title={t('groups.mine')}>
        {mine.isPending ? (
          <Loading />
        ) : mine.isError ? (
          <ErrorState error={mine.error} onRetry={() => mine.refetch()} />
        ) : mine.data.length === 0 ? (
          <Txt tone="mist">{t('groups.noneYet')}</Txt>
        ) : (
          <View role="list" style={{ gap: SPACE.sm }}>
            {mine.data.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </View>
        )}
      </Section>

      <Section title={t('groups.joinWithCode')}>
        <JoinWithCode />
      </Section>

      <Section title={t('groups.discover')}>
        <Discover />
      </Section>
    </Screen>
  );
}

function JoinWithCode() {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState('');
  // Accept a whole invite link or just the code.
  const code = (value.trim().toLowerCase().split('/join/')[1] ?? value.trim().toLowerCase()).replace(/[^a-z0-9]/g, '');
  const valid = isValidInviteCode(code);
  return (
    <View style={{ gap: SPACE.sm }}>
      <TextField
        label={t('groups.codeLabel')}
        hint={t('groups.codeHint')}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('groups.openInvite')} variant="secondary" disabled={!valid} onPress={() => router.push(`/join/${code}`)} />
      </View>
    </View>
  );
}

function Discover() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const found = useFindGroups(query);
  const join = useJoinGroup();

  return (
    <View style={{ gap: SPACE.md }}>
      <TextField label={t('groups.searchLabel')} value={query} onChangeText={setQuery} autoCapitalize="none" />
      {found.isPending ? (
        <Loading />
      ) : found.isError ? (
        <ErrorState error={found.error} onRetry={() => found.refetch()} />
      ) : found.data.length === 0 ? (
        <Txt tone="mist">{query.trim() ? t('groups.noResults') : t('groups.noPublic')}</Txt>
      ) : (
        <View role="list" style={{ gap: SPACE.sm }}>
          {found.data.map((g) => (
            <GroupCard key={g.id} group={g}>
              <Button
                label={t('groups.join')}
                accessibilityLabel={t('groups.joinLabel', { name: g.name })}
                loading={join.isPending && join.variables?.id === g.id}
                onPress={() => join.mutate({ id: g.id }, { onSuccess: (joined) => router.push(`/feed/groups/${joined.id}`) })}
              />
            </GroupCard>
          ))}
        </View>
      )}
      {join.error ? <Notice tone="warning">{errorMessage(t, join.error)}</Notice> : null}
      <Txt variant="small" tone="mist">
        {t('groups.joinPrivacy')}
      </Txt>
    </View>
  );
}
