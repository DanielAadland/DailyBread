import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAdminReports, useAdminResolve, useAdminUnsuspend, useProfile } from '../../../api/hooks';
import type { ModerationAction, ModerationItem } from '../../../api/types';
import { language } from '../../../i18n';
import { relativeTime } from '../../../lib/time';
import { useTheme } from '../../../theme/ThemeProvider';
import { FONTS, RADIUS, SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { ErrorState, errorMessage, Loading, Notice, Segmented } from '../../../ui/misc';
import { PersonRow } from '../../../ui/PersonRow';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';
import { TextField } from '../../../ui/TextField';

type Status = 'open' | 'actioned' | 'dismissed';

/** Admin queue: reported posts, comments and people, grouped by target. */
export default function ModerationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const profile = useProfile();
  const [status, setStatus] = useState<Status>('open');

  return (
    <Screen>
      <Stack.Screen options={{ title: t('moderation.title') }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('tabs.profile')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      </View>
      <Txt variant="h1">{t('moderation.title')}</Txt>
      {profile.isPending ? (
        <Loading />
      ) : !profile.data?.isAdmin ? (
        <Notice tone="warning">{t('errors.not_admin')}</Notice>
      ) : (
        <>
          <Segmented<Status>
            label={t('moderation.show')}
            value={status}
            onChange={setStatus}
            options={(['open', 'actioned', 'dismissed'] as const).map((v) => ({ value: v, label: t(`moderation.status.${v}`) }))}
          />
          <Queue status={status} />
        </>
      )}
    </Screen>
  );
}

function Queue({ status }: { status: Status }) {
  const { t } = useTranslation();
  const reports = useAdminReports(status);
  if (reports.isPending) return <Loading />;
  if (reports.isError) return <ErrorState error={reports.error} onRetry={() => reports.refetch()} />;
  if (reports.data.length === 0) return <Txt tone="mist">{t(`moderation.empty.${status}`)}</Txt>;
  return (
    <View style={{ gap: SPACE.md }}>
      {reports.data.map((item) => (
        <ReportItem key={`${item.targetType}:${item.targetId}`} item={item} open={status === 'open'} />
      ))}
    </View>
  );
}

function ReportItem({ item, open }: { item: ModerationItem; open: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const resolve = useAdminResolve();
  const unsuspend = useAdminUnsuspend();
  const [note, setNote] = useState('');
  const act = (action: ModerationAction) => resolve.mutate({ target: item.targetType, targetId: item.targetId, action, note: note.trim() || undefined });
  const author = item.preview.author;
  const suspended = item.preview.suspendedUntil && new Date(item.preview.suspendedUntil) > new Date();

  return (
    <View style={[styles.item, { borderColor: colors.rule, backgroundColor: colors.surface }]} role="article" aria-label={t(`moderation.target.${item.targetType}`)}>
      <Txt variant="label">
        {`${t(`moderation.target.${item.targetType}`)} · ${t('moderation.reportCount', { count: item.reportCount })} · ${relativeTime(item.firstReportedAt, language)}`}
      </Txt>
      <Txt variant="small" tone="mist">
        {item.reasons.map((r) => t(`report.reasons.${r}`)).join(', ')}
      </Txt>
      {author ? <PersonRow person={author} subtitle={suspended ? t('moderation.suspendedUntil', { date: new Date(item.preview.suspendedUntil!).toLocaleDateString(language) }) : undefined} /> : null}
      {item.preview.verseText ? <Txt style={{ fontFamily: FONTS.scripture }}>{item.preview.verseText}</Txt> : null}
      {item.preview.body ? <Txt>{item.preview.body}</Txt> : null}
      {item.preview.removed ? <Notice>{t('moderation.alreadyRemoved')}</Notice> : null}
      {item.details.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Txt variant="small" tone="mist">
            {t('moderation.details')}
          </Txt>
          {item.details.map((d, i) => (
            <Txt key={i} variant="small">{`“${d}”`}</Txt>
          ))}
        </View>
      ) : null}
      {open ? (
        <>
          <TextField label={t('moderation.note')} hint={t('moderation.noteHint')} value={note} onChangeText={setNote} maxLength={500} />
          <View style={styles.row}>
            <Button label={t('moderation.actions.dismiss')} variant="secondary" disabled={resolve.isPending} onPress={() => act('dismiss')} />
            {item.targetType !== 'user' && !item.preview.removed ? (
              <Button label={t('moderation.actions.remove')} variant="danger" disabled={resolve.isPending} onPress={() => act('remove')} />
            ) : null}
            {author ? (
              <>
                <Button label={t('moderation.actions.suspend_7d')} variant="danger" disabled={resolve.isPending} onPress={() => act('suspend_7d')} />
                <Button label={t('moderation.actions.suspend_30d')} variant="danger" disabled={resolve.isPending} onPress={() => act('suspend_30d')} />
                <Button label={t('moderation.actions.suspend_indefinitely')} variant="danger" disabled={resolve.isPending} onPress={() => act('suspend_indefinitely')} />
              </>
            ) : null}
          </View>
        </>
      ) : suspended && author ? (
        <View style={styles.row}>
          <Button label={t('moderation.liftSuspension')} variant="secondary" loading={unsuspend.isPending} onPress={() => unsuspend.mutate(author.id)} />
        </View>
      ) : null}
      {resolve.error || unsuspend.error ? <Notice tone="warning">{errorMessage(t, resolve.error ?? unsuspend.error)}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, borderRadius: RADIUS.panel, padding: SPACE.md, gap: SPACE.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
});
