import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useConnections, useFindPeople, useRemoveFollower, useRespondToFollow } from '../../../api/hooks';
import type { Person } from '../../../api/types';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { FollowButton } from '../../../ui/FollowButton';
import { ErrorState, Loading, Segmented } from '../../../ui/misc';
import { PersonRow } from '../../../ui/PersonRow';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';
import { TextField } from '../../../ui/TextField';

type Tab = 'find' | 'following' | 'followers' | 'requests';
const TABS: Tab[] = ['find', 'following', 'followers', 'requests'];

/** Find people, and see who you follow, who follows you and who asked to. */
export default function PeopleScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'find');

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('feed.title')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed'))} />
      </View>
      <Txt variant="h1">{t('people.title')}</Txt>
      <Segmented<Tab>
        label={t('people.show')}
        value={tab}
        onChange={setTab}
        options={TABS.map((v) => ({ value: v, label: t(`people.tabs.${v}`) }))}
      />
      {tab === 'find' ? <FindPeople /> : <ConnectionList kind={tab} />}
    </Screen>
  );
}

function FindPeople() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const results = useFindPeople(query);
  const searching = query.trim().length >= 2;

  return (
    <View style={{ gap: SPACE.md }}>
      <TextField label={t('people.searchLabel')} hint={t('people.searchHint')} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      {!searching ? null : results.isPending ? (
        <Loading />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : results.data.length === 0 ? (
        <Txt tone="mist">{t('people.noResults')}</Txt>
      ) : (
        <View role="list">
          {results.data.map((p) => (
            <PersonRow key={p.id} person={p}>
              <FollowButton userId={p.id} state={p.followStatus} visibility={p.visibility} name={p.displayName || p.username || ''} />
            </PersonRow>
          ))}
        </View>
      )}
    </View>
  );
}

function ConnectionList({ kind }: { kind: 'following' | 'followers' | 'requests' }) {
  const { t } = useTranslation();
  const list = useConnections(kind);
  const respond = useRespondToFollow();
  const remove = useRemoveFollower();

  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (list.data.length === 0) return <Txt tone="mist">{t(`people.empty.${kind}`)}</Txt>;

  const nameOf = (p: Person) => p.displayName || p.username || t('profile.noName');
  return (
    <View role="list" style={{ gap: SPACE.xs }}>
      {list.data.map((p) => (
        <PersonRow key={p.id} person={p}>
          {kind === 'requests' ? (
            <>
              <Button label={t('people.accept')} accessibilityLabel={t('people.acceptLabel', { name: nameOf(p) })} onPress={() => respond.mutate({ userId: p.id, accept: true })} />
              <Button label={t('people.decline')} variant="quiet" accessibilityLabel={t('people.declineLabel', { name: nameOf(p) })} onPress={() => respond.mutate({ userId: p.id, accept: false })} />
            </>
          ) : kind === 'followers' ? (
            <Button label={t('people.remove')} variant="quiet" accessibilityLabel={t('people.removeLabel', { name: nameOf(p) })} onPress={() => remove.mutate(p.id)} />
          ) : null}
        </PersonRow>
      ))}
    </View>
  );
}
