import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays } from '@bible-app/core';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useBackend } from '../../api/BackendProvider';
import { useMyGroups, useProfile, useToday } from '../../api/hooks';
import type { TodayPlan } from '../../api/types';
import { useBookNames, useLastRead } from '../../bible/useBible';
import { language } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { FONTS, SPACE } from '../../theme/tokens';
import { Button } from '../../ui/Button';
import { DawnArc } from '../../ui/DawnArc';
import { GroupCard } from '../../ui/GroupCard';
import { Divider, ErrorState, Loading, Notice, ProgressBar, Section } from '../../ui/misc';
import { Screen } from '../../ui/Screen';
import { Txt } from '../../ui/Text';

function greetingKey(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'today.greetingMorning' : h < 18 ? 'today.greetingAfternoon' : 'today.greetingEvening';
}

export default function TodayScreen() {
  const { t } = useTranslation();
  const { backend } = useBackend();
  const { colors } = useTheme();
  const today = useToday();
  const profile = useProfile();
  const { last } = useLastRead();
  const { chapterTitle } = useBookNames();
  const router = useRouter();

  if (today.isPending) return <Screen><Loading /></Screen>;
  if (today.isError) return <Screen><ErrorState error={today.error} onRetry={() => today.refetch()} /></Screen>;

  const data = today.data;
  const name = profile.data?.displayName;
  const dateLine = new Date(`${data.localDate}T12:00:00Z`).toLocaleDateString(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const dayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(`${addDays(data.localDate, i - 6)}T12:00:00Z`).toLocaleDateString(language, { weekday: 'narrow', timeZone: 'UTC' }),
  );
  const { streak } = data;
  const nextPlan = data.plans.find((p) => !p.completedToday && p.nextDay !== null);

  return (
    <Screen>
      {backend.kind === 'demo' ? <Notice>{t('demo.banner')}</Notice> : null}

      <View style={{ gap: 2 }}>
        <Txt variant="h2">{name ? t(`${greetingKey()}Name`, { name }) : t(greetingKey())}</Txt>
        <Txt tone="mist">{dateLine}</Txt>
      </View>

      <View style={styles.hero}>
        <DawnArc
          week={data.week}
          dayLabels={dayLabels}
          readToday={streak.readToday}
          accessibilityLabel={t('today.arcLabel', { count: data.daysReadLast7 })}
        />
        {streak.readToday ? (
          <View style={styles.heroText}>
            <Txt variant="h1" align="center">
              {t('today.doneTitle')}
            </Txt>
            <Txt tone="mist" align="center">
              {t('today.doneBody')}
            </Txt>
          </View>
        ) : (
          <View style={styles.heroText}>
            <Txt variant="display" align="center" style={{ fontVariant: ['tabular-nums'] }}>
              {data.daysReadLast7}
            </Txt>
            <Txt tone="mist" align="center">
              {t('today.daysThisWeek', { count: data.daysReadLast7 })}
            </Txt>
          </View>
        )}
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Ionicons name="flame-outline" size={18} color={colors.dawn} />
            <Txt variant="label">{t('today.streak', { count: streak.current })}</Txt>
          </View>
          <View style={styles.stat}>
            <Ionicons name="snow-outline" size={18} color={colors.tide} />
            <Txt variant="label">{t('today.freezes', { count: streak.freezesLeft })}</Txt>
          </View>
        </View>
      </View>

      <Section title={t('today.readingTitle')}>
        {data.plans.length === 0 ? (
          <View style={{ gap: SPACE.md }}>
            <Txt>{t('today.noPlans')}</Txt>
            <View style={styles.row}>
              <Button href="/plans" label={t('today.browsePlans')} />
              <Button
                href={last ? `/read/${last.book}/${last.chapter}` : '/read'}
                label={last ? t('today.continueReading', { place: chapterTitle(last.book, last.chapter) }) : t('today.openBible')}
                variant="secondary"
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: SPACE.lg }}>
            {data.plans.map((plan, i) => (
              <View key={plan.enrolmentId} style={{ gap: SPACE.lg }}>
                {i > 0 ? <Divider /> : null}
                <PlanToday plan={plan} primary={plan === nextPlan} onOpen={(day) => router.push(`/plans/${plan.slug}/${day}`)} />
              </View>
            ))}
          </View>
        )}
      </Section>

      <TodayGroups />
    </Screen>
  );
}

/** Your groups and how many have read today. Hidden until you're in one. */
function TodayGroups() {
  const { t } = useTranslation();
  const groups = useMyGroups();
  if (!groups.data || groups.data.length === 0) return null;
  return (
    <Section title={t('today.groupsTitle')}>
      <View style={{ gap: SPACE.sm }}>
        {groups.data.map((g) => (
          <GroupCard key={g.id} group={g} />
        ))}
      </View>
    </Section>
  );
}

function PlanToday({ plan, primary, onOpen }: { plan: TodayPlan; primary: boolean; onOpen: (day: number) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { referenceFromKey } = useBookNames();
  const percent = Math.floor((plan.completed / plan.days) * 100);

  return (
    <View style={{ gap: SPACE.sm + 4 }}>
      <View style={{ gap: 2 }}>
        <Txt variant="label">{plan.title}</Txt>
        <Txt variant="small" tone="mist">
          {plan.nextDay === null ? t('plans.finished') : t('plans.dayOf', { day: plan.nextDay, total: plan.days })}
        </Txt>
      </View>
      {plan.nextDay !== null ? (
        <Txt style={{ fontFamily: FONTS.scripture, fontSize: 19 }}>{plan.readings.map(referenceFromKey).join(', ')}</Txt>
      ) : null}
      <ProgressBar value={percent} label={t('plans.progressLabel', { percent })} />
      {plan.completedToday ? (
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.dawn} />
          <Txt variant="label" style={{ flex: 1 }}>
            {t('today.planDoneToday')}
          </Txt>
          {plan.nextDay !== null ? <Button label={t('today.readAhead')} variant="quiet" onPress={() => onOpen(plan.nextDay!)} /> : null}
        </View>
      ) : plan.nextDay !== null ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label={t('today.startDay', { day: plan.nextDay })}
            variant={primary ? 'primary' : 'secondary'}
            onPress={() => onOpen(plan.nextDay!)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SPACE.md, paddingVertical: SPACE.sm },
  heroText: { gap: SPACE.xs, alignItems: 'center' },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.lg, flexWrap: 'wrap' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
});
