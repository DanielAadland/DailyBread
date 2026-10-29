import Ionicons from '@expo/vector-icons/Ionicons';
import { fromKey, TRANSLATIONS } from '@bible-app/bible';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useCompleteReading, useEnrolments, usePlan, useSetPlanStatus, useStartPlan } from '../../../../api/hooks';
import type { CompleteResult } from '../../../../api/types';
import { usePassage, useBookNames, useTranslationId } from '../../../../bible/useBible';
import { useTheme } from '../../../../theme/ThemeProvider';
import { FONTS, LAYOUT, RADIUS, SPACE } from '../../../../theme/tokens';
import { Button } from '../../../../ui/Button';
import { ErrorState, errorMessage, Loading, Notice } from '../../../../ui/misc';
import { Screen } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Text';
import { TextField } from '../../../../ui/TextField';
import { VerseList } from '../../../../ui/VerseList';

export default function PlanDayScreen() {
  const params = useLocalSearchParams<{ slug: string; day: string }>();
  const day = Number(params.day);
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const plan = usePlan(params.slug);
  const enrolments = useEnrolments();
  const complete = useCompleteReading();
  const start = useStartPlan();
  const setStatus = useSetPlanStatus();
  const translation = useTranslationId();
  const { referenceFromKey } = useBookNames();
  const [reflection, setReflection] = useState('');
  const [result, setResult] = useState<CompleteResult | null>(null);

  if (plan.isPending || enrolments.isPending) return <Screen><Loading /></Screen>;
  if (plan.isError) return <Screen><ErrorState error={plan.error} onRetry={() => plan.refetch()} /></Screen>;

  const p = plan.data;
  const entry = p.schedule.find((d) => d.day === day);
  const enrolment = enrolments.data?.find((e) => e.planId === p.id);
  const alreadyDone = !!enrolment?.completedDays.includes(day);
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/plans/${p.slug}`));

  if (!entry) {
    return (
      <Screen>
        <Txt>{t('errors.day_out_of_range')}</Txt>
        <Button label={t('common.back')} variant="secondary" onPress={back} />
      </Screen>
    );
  }

  const markRead = () =>
    enrolment &&
    complete.mutate(
      { enrolmentId: enrolment.id, day, reflection: reflection.trim() || undefined },
      { onSuccess: (r) => setResult(r) },
    );

  return (
    <Screen width={LAYOUT.reader}>
      <Stack.Screen options={{ title: `${p.title}: ${t('plans.day', { day })}` }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={p.title} icon="chevron-back" variant="quiet" onPress={back} />
      </View>
      <View style={{ gap: 2 }}>
        <Txt tone="mist">{t('plans.dayOf', { day, total: p.days })}</Txt>
        <Txt variant="h1">{entry.readings.map(referenceFromKey).join(', ')}</Txt>
      </View>

      {entry.readings.map((key) => (
        <Passage key={key} passageKey={key} heading={entry.readings.length > 1 ? referenceFromKey(key) : null} />
      ))}
      <Txt variant="small" tone="mist">
        {TRANSLATIONS[translation].attribution}
      </Txt>

      {result ? (
        <Celebration
          result={result}
          day={day}
          total={p.days}
          onToday={() => router.navigate('/')}
          onShare={() => {
            const params = new URLSearchParams({ type: 'reflection', passage: entry.readings[0] ?? '' });
            if (reflection.trim()) params.set('body', reflection.trim());
            router.push(`/feed/compose?${params.toString()}`);
          }}
          onNext={day < p.days ? () => router.replace(`/plans/${p.slug}/${day + 1}`) : undefined} />
      ) : !enrolment ? (
        <View style={styles.panel}>
          <Txt>{t('plans.notStarted')}</Txt>
          <Button label={t('plans.start')} loading={start.isPending} onPress={() => start.mutate(p.id)} />
        </View>
      ) : enrolment.status === 'paused' ? (
        <View style={styles.panel}>
          <Txt>{t('plans.pausedNotice')}</Txt>
          <Button label={t('plans.resume')} loading={setStatus.isPending} onPress={() => setStatus.mutate({ enrolmentId: enrolment.id, action: 'resume' })} />
        </View>
      ) : alreadyDone ? (
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={22} color={colors.dawn} />
          <Txt variant="label" style={{ flex: 1 }}>
            {t('plans.dayAlreadyDone', { day })}
          </Txt>
          {day < p.days ? <Button label={t('plans.nextDay')} variant="secondary" onPress={() => router.replace(`/plans/${p.slug}/${day + 1}`)} /> : null}
        </View>
      ) : (
        <View style={[styles.panel, { borderColor: colors.rule, backgroundColor: colors.surface, borderWidth: 1 }]}>
          {entry.reflectionPrompt ? (
            <Txt style={{ fontFamily: FONTS.scriptureItalic, fontSize: 19, lineHeight: 28 }}>{entry.reflectionPrompt}</Txt>
          ) : null}
          <TextField
            label={t('plans.reflectionLabel')}
            hint={t('plans.reflectionHint')}
            value={reflection}
            onChangeText={setReflection}
            multiline
            maxLength={2000}
          />
          {complete.error ? <Notice tone="warning">{errorMessage(t, complete.error)}</Notice> : null}
          <Button label={t('plans.markRead', { day })} icon="checkmark" onPress={markRead} loading={complete.isPending} fullWidth />
        </View>
      )}
    </Screen>
  );
}

function Passage({ passageKey, heading }: { passageKey: string; heading: string | null }) {
  const translation = useTranslationId();
  const passage = usePassage(translation, passageKey);
  const { bookName, chapterTitle } = useBookNames();
  const range = fromKey(passageKey);

  return (
    <View style={{ gap: SPACE.sm }}>
      {heading ? <Txt variant="h3">{heading}</Txt> : null}
      {passage.isPending ? (
        <Loading />
      ) : passage.isError ? (
        <ErrorState error={passage.error} onRetry={() => passage.refetch()} />
      ) : (
        groupByChapter(passage.data).map((group) => (
          <View key={group.chapter} style={{ gap: SPACE.sm }}>
            {range && range.endChapter > range.startChapter ? (
              <Txt variant="label" tone="mist">
                {`${chapterTitle(range.book, group.chapter)}`}
              </Txt>
            ) : null}
            <VerseList verses={group.verses} chapterLabel={range ? `${chapterTitle(range.book, group.chapter)}` : ''} />
          </View>
        ))
      )}
    </View>
  );
}

function groupByChapter<T extends { chapter: number }>(verses: T[]): Array<{ chapter: number; verses: T[] }> {
  const out: Array<{ chapter: number; verses: T[] }> = [];
  for (const v of verses) {
    const last = out[out.length - 1];
    if (last && last.chapter === v.chapter) last.verses.push(v);
    else out.push({ chapter: v.chapter, verses: [v] });
  }
  return out;
}

function Celebration({
  result,
  day,
  total,
  onToday,
  onShare,
  onNext,
}: {
  result: CompleteResult;
  day: number;
  total: number;
  onToday: () => void;
  onShare: () => void;
  onNext?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, styles.celebration, { backgroundColor: colors.surface, borderColor: colors.dawn }]} accessibilityLiveRegion="polite" role="status">
      <Ionicons name="sunny" size={40} color={colors.dawn} />
      <Txt variant="h2" align="center">
        {result.finishedPlan ? t('plans.finishedTitle') : t('plans.dayDoneTitle', { day })}
      </Txt>
      <Txt align="center">
        {result.streak.counted ? t('plans.streakNow', { count: result.streak.current }) : t('plans.alreadyCounted')}
      </Txt>
      {result.streak.earnedFreeze ? <Txt align="center" tone="mist">{t('plans.earnedFreeze')}</Txt> : null}
      {result.newBadges.map((code) => (
        <View key={code} style={styles.badge}>
          <Ionicons name="ribbon" size={20} color={colors.dawn} />
          <Txt variant="label">{t('plans.newBadge', { name: t(`badges.${code}.name`) })}</Txt>
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, justifyContent: 'center' }}>
        <Button label={t('plans.backToToday')} onPress={onToday} />
        {onNext && !result.finishedPlan ? <Button label={t('plans.nextDayOf', { day: day + 1, total })} variant="secondary" onPress={onNext} /> : null}
        <Button label={t('plans.shareReflection')} icon="share-social-outline" variant="quiet" onPress={onShare} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.md, borderRadius: RADIUS.panel, padding: SPACE.lg },
  celebration: { alignItems: 'center', borderWidth: 2 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
});
