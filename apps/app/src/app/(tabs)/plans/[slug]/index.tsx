import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useEnrolments, usePlan, useSetPlanStatus, useStartPlan } from '../../../../api/hooks';
import { useBookNames } from '../../../../bible/useBible';
import { useTheme } from '../../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../../theme/tokens';
import { Button } from '../../../../ui/Button';
import { Divider, ErrorState, errorMessage, Loading, Notice, ProgressBar, Section } from '../../../../ui/misc';
import { Screen } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Text';

const PREVIEW_DAYS = 7;

export default function PlanDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const plan = usePlan(slug);
  const enrolments = useEnrolments();
  const start = useStartPlan();
  const setStatus = useSetPlanStatus();
  const { referenceFromKey } = useBookNames();
  const [showAll, setShowAll] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  if (plan.isPending || enrolments.isPending) return <Screen><Loading /></Screen>;
  if (plan.isError) return <Screen><ErrorState error={plan.error} onRetry={() => plan.refetch()} /></Screen>;

  const p = plan.data;
  const enrolment = enrolments.data?.find((e) => e.planId === p.id);
  const done = new Set(enrolment?.completedDays ?? []);
  const nextDay = p.schedule.find((d) => !done.has(d.day))?.day ?? null;
  const percent = Math.floor((done.size / p.days) * 100);
  const firstShown = Math.max(0, (nextDay ?? 1) - 1);
  const days = showAll ? p.schedule : p.schedule.slice(firstShown, firstShown + PREVIEW_DAYS);
  const error = start.error ?? setStatus.error;

  const startPlan = () => start.mutate(p.id, { onSuccess: () => router.push(`/plans/${p.slug}/1`) });
  const restart = () => {
    if (!enrolment) return;
    setStatus.mutate({ enrolmentId: enrolment.id, action: 'restart' }, { onSuccess: () => setConfirmRestart(false) });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: p.title }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('plans.title')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/plans'))} />
      </View>

      <View style={{ gap: SPACE.sm }}>
        <Txt variant="h1">{p.title}</Txt>
        <Txt variant="lead">{p.description}</Txt>
        <Txt tone="mist">{t('plans.length', { count: p.days })}</Txt>
      </View>

      {enrolment ? (
        <View style={{ gap: SPACE.sm }}>
          <Txt variant="label">
            {enrolment.status === 'finished'
              ? t('plans.statusFinished')
              : enrolment.status === 'paused'
                ? t('plans.statusPaused', { done: done.size, total: p.days })
                : t('plans.statusActive', { done: done.size, total: p.days })}
          </Txt>
          <ProgressBar value={percent} label={t('plans.progressLabel', { percent })} />
        </View>
      ) : null}

      <View style={styles.actions}>
        {!enrolment ? <Button label={t('plans.start')} onPress={startPlan} loading={start.isPending} /> : null}
        {enrolment?.status === 'active' && nextDay !== null ? (
          <Button label={t('plans.continueDay', { day: nextDay })} onPress={() => router.push(`/plans/${p.slug}/${nextDay}`)} />
        ) : null}
        {enrolment?.status === 'active' ? (
          <Button label={t('plans.pause')} variant="secondary" loading={setStatus.isPending} onPress={() => setStatus.mutate({ enrolmentId: enrolment.id, action: 'pause' })} />
        ) : null}
        {enrolment?.status === 'paused' ? (
          <Button label={t('plans.resume')} loading={setStatus.isPending} onPress={() => setStatus.mutate({ enrolmentId: enrolment.id, action: 'resume' })} />
        ) : null}
        {enrolment ? (
          <Button
            label={enrolment.status === 'finished' ? t('plans.readAgain') : t('plans.restart')}
            variant={enrolment.status === 'finished' ? 'primary' : 'quiet'}
            onPress={() => setConfirmRestart(true)}
          />
        ) : null}
      </View>

      {confirmRestart ? (
        <View style={[styles.confirm, { borderColor: colors.rule, backgroundColor: colors.surface }]} role="alertdialog">
          <Txt>{t('plans.restartConfirm')}</Txt>
          <View style={styles.actions}>
            <Button label={t('plans.restartYes')} onPress={restart} loading={setStatus.isPending} />
            <Button label={t('common.cancel')} variant="quiet" onPress={() => setConfirmRestart(false)} />
          </View>
        </View>
      ) : null}

      {error ? <Notice tone="warning">{errorMessage(t, error)}</Notice> : null}

      <Section title={t('plans.schedule')}>
        <View>
          {days.map((d, i) => {
            const isDone = done.has(d.day);
            const content = (
              <>
                <View style={[styles.dayNumber, { borderColor: isDone ? colors.dawn : colors.rule, backgroundColor: isDone ? colors.dawn : 'transparent' }]}>
                  {isDone ? (
                    <Ionicons name="checkmark" size={16} color={colors.surface} />
                  ) : (
                    <Txt variant="small" style={{ fontVariant: ['tabular-nums'] }}>
                      {d.day}
                    </Txt>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="label">{t('plans.day', { day: d.day })}</Txt>
                  <Txt variant="small" tone="mist">
                    {d.readings.map(referenceFromKey).join(', ')}
                  </Txt>
                </View>
                {enrolment ? <Ionicons name="chevron-forward" size={16} color={colors.mist} /> : null}
              </>
            );
            return (
              <View key={d.day}>
                {i > 0 ? <Divider /> : null}
                {enrolment ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`${t('plans.day', { day: d.day })}: ${d.readings.map(referenceFromKey).join(', ')}${isDone ? `, ${t('plans.dayDone')}` : ''}`}
                    onPress={() => router.push(`/plans/${p.slug}/${d.day}`)}
                    style={(s) => [
                      styles.day,
                      (s as { hovered?: boolean }).hovered && { backgroundColor: colors.tideSoft },
                      (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
                    ]}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View style={styles.day}>{content}</View>
                )}
              </View>
            );
          })}
        </View>
        {p.days > PREVIEW_DAYS ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              label={showAll ? t('plans.showFewer') : t('plans.showAll', { count: p.days })}
              variant="quiet"
              onPress={() => setShowAll((v) => !v)}
            />
          </View>
        ) : null}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center' },
  confirm: { borderWidth: 1, borderRadius: RADIUS.panel, padding: SPACE.md, gap: SPACE.md },
  day: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm + 4, paddingHorizontal: SPACE.sm, marginHorizontal: -SPACE.sm, borderRadius: RADIUS.control },
  dayNumber: { width: 32, height: 32, borderRadius: RADIUS.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
