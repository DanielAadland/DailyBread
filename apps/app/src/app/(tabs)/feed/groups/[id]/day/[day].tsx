import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useCreatePost, useGroup, useGroupDay, usePlan } from '../../../../../../api/hooks';
import { useBookNames, useTranslationId } from '../../../../../../bible/useBible';
import { useTheme } from '../../../../../../theme/ThemeProvider';
import { FONTS, RADIUS, SPACE } from '../../../../../../theme/tokens';
import { Button } from '../../../../../../ui/Button';
import { Divider, ErrorState, errorMessage, Loading, Notice } from '../../../../../../ui/misc';
import { PostCard } from '../../../../../../ui/PostCard';
import { Screen } from '../../../../../../ui/Screen';
import { Txt } from '../../../../../../ui/Text';
import { TextField } from '../../../../../../ui/TextField';

/** One day of the group plan: the reading, the prompt, and the group's conversation about it. */
export default function GroupDayScreen() {
  const params = useLocalSearchParams<{ id: string; day: string }>();
  const id = params.id;
  const day = Number(params.day);
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const group = useGroup(id);
  const plan = usePlan(group.data?.plan?.slug ?? '');
  const thread = useGroupDay(id, day);
  const create = useCreatePost();
  const translation = useTranslationId();
  const { referenceFromKey } = useBookNames();
  const [body, setBody] = useState('');

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/feed/groups/${id}`));
  if (group.isPending) return <Screen><Loading /></Screen>;
  if (group.isError) return <Screen><ErrorState error={group.error} onRetry={() => group.refetch()} /></Screen>;

  const g = group.data;
  const info = g.plan;
  const entry = plan.data?.schedule.find((d) => d.day === day);
  const lastOpenDay = info ? (info.status === 'finished' ? info.days : (info.day ?? 0)) : 0;
  const valid = !!info && Number.isInteger(day) && day >= 1 && day <= info.days;

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={g.name} icon="chevron-back" variant="quiet" onPress={back} />
      </View>
      {!valid ? (
        <Notice tone="warning">{t('groups.dayNotFound')}</Notice>
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Txt tone="mist">{t('groups.planDay', { day, total: info.days, title: info.title })}</Txt>
            <Txt variant="h1">{entry ? entry.readings.map(referenceFromKey).join(', ') : t('groups.threadTitle', { day })}</Txt>
          </View>
          {entry?.reflectionPrompt ? (
            <View style={[styles.prompt, { borderLeftColor: colors.dawn }]}>
              <Txt variant="small" tone="mist">
                {t('groups.prompt')}
              </Txt>
              <Txt style={{ fontFamily: FONTS.scriptureItalic, fontSize: 19, lineHeight: 28 }}>{entry.reflectionPrompt}</Txt>
            </View>
          ) : null}
          <View style={styles.row}>
            <Button label={t('groups.readThisDay')} icon="book-outline" variant="secondary" href={`/plans/${info.slug}/${day}`} />
          </View>

          <Divider />
          <Txt variant="h3">{t('groups.threadHeading', { count: thread.data?.length ?? 0 })}</Txt>
          {thread.isPending ? (
            <Loading />
          ) : thread.isError ? (
            <ErrorState error={thread.error} onRetry={() => thread.refetch()} />
          ) : thread.data.length === 0 ? (
            <Txt tone="mist">{t('groups.threadEmpty')}</Txt>
          ) : (
            <View>
              {thread.data.map((post, i) => (
                <View key={post.id}>
                  {i > 0 ? <Divider /> : null}
                  <PostCard post={post} inGroup />
                </View>
              ))}
            </View>
          )}

          <View style={[styles.composer, { borderColor: colors.rule, backgroundColor: colors.surface }]}>
            <TextField label={t('groups.replyLabel')} hint={t('groups.replyHint')} value={body} onChangeText={setBody} multiline maxLength={2000} />
            {create.error ? <Notice tone="warning">{errorMessage(t, create.error)}</Notice> : null}
            <View style={{ alignItems: 'flex-end' }}>
              <Button
                label={t('groups.sendReply')}
                icon="send"
                disabled={body.trim().length === 0}
                loading={create.isPending}
                onPress={() =>
                  create.mutate(
                    { type: 'reflection', body, groupId: id, groupDay: day, translation },
                    { onSuccess: () => setBody('') },
                  )
                }
              />
            </View>
          </View>

          <View style={styles.nav}>
            {day > 1 ? (
              <Button label={t('groups.dayShort', { day: day - 1 })} icon="chevron-back" variant="quiet" onPress={() => router.replace(`/feed/groups/${id}/day/${day - 1}`)} />
            ) : (
              <View />
            )}
            {day < lastOpenDay ? (
              <Button label={t('groups.dayShort', { day: day + 1 })} variant="quiet" onPress={() => router.replace(`/feed/groups/${id}/day/${day + 1}`)} />
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: { borderLeftWidth: 3, paddingLeft: SPACE.md, gap: SPACE.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  composer: { borderWidth: 1, borderRadius: RADIUS.panel, padding: SPACE.md, gap: SPACE.sm },
  nav: { flexDirection: 'row', justifyContent: 'space-between' },
});
