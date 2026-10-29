import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useEnrolments, usePlans } from '../../../api/hooks';
import type { Enrolment, PlanCategory, PlanSummary } from '../../../api/types';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Divider, ErrorState, Loading, ProgressBar, Section } from '../../../ui/misc';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';

const GROUPS: Array<{ key: string; categories: PlanCategory[] }> = [
  { key: 'plans.groupWhole', categories: ['whole_bible', 'new_testament', 'old_testament'] },
  { key: 'plans.groupBooks', categories: ['book'] },
  { key: 'plans.groupTopics', categories: ['topical'] },
];

export default function PlansScreen() {
  const { t } = useTranslation();
  const plans = usePlans();
  const enrolments = useEnrolments();

  if (plans.isPending || enrolments.isPending) return <Screen><Loading /></Screen>;
  if (plans.isError) return <Screen><ErrorState error={plans.error} onRetry={() => plans.refetch()} /></Screen>;

  const mine = (enrolments.data ?? [])
    .map((e) => ({ enrolment: e, plan: plans.data.find((p) => p.id === e.planId) }))
    .filter((x): x is { enrolment: Enrolment; plan: PlanSummary } => !!x.plan)
    .sort((a, b) => order(a.enrolment.status) - order(b.enrolment.status));

  return (
    <Screen>
      <Txt variant="h1">{t('plans.title')}</Txt>

      {mine.length > 0 ? (
        <Section title={t('plans.mine')}>
          <View>
            {mine.map(({ enrolment, plan }, i) => (
              <View key={enrolment.id}>
                {i > 0 ? <Divider /> : null}
                <PlanRow plan={plan} enrolment={enrolment} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {GROUPS.map((group) => {
        const items = plans.data.filter((p) => group.categories.includes(p.category));
        if (items.length === 0) return null;
        return (
          <Section key={group.key} title={t(group.key)}>
            <View>
              {items.map((plan, i) => (
                <View key={plan.id}>
                  {i > 0 ? <Divider /> : null}
                  <PlanRow plan={plan} enrolment={enrolments.data?.find((e) => e.planId === plan.id)} showDescription />
                </View>
              ))}
            </View>
          </Section>
        );
      })}
    </Screen>
  );
}

const order = (s: Enrolment['status']) => (s === 'active' ? 0 : s === 'paused' ? 1 : 2);

function PlanRow({ plan, enrolment, showDescription }: { plan: PlanSummary; enrolment?: Enrolment; showDescription?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const done = enrolment?.completedDays.length ?? 0;
  const percent = Math.floor((done / plan.days) * 100);
  const status = enrolment
    ? enrolment.status === 'finished'
      ? t('plans.statusFinished')
      : enrolment.status === 'paused'
        ? t('plans.statusPaused', { done, total: plan.days })
        : t('plans.statusActive', { done, total: plan.days })
    : t('plans.length', { count: plan.days });

  return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${plan.title}. ${status}`}
        onPress={() => router.push(`/plans/${plan.slug}`)}
        style={(s) => [
          styles.row,
          (s as { hovered?: boolean }).hovered && { backgroundColor: colors.tideSoft },
          (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
        ]}
      >
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <Txt variant="label">{plan.title}</Txt>
          {showDescription && !enrolment ? (
            <Txt variant="small" tone="mist" numberOfLines={2}>
              {plan.description}
            </Txt>
          ) : null}
          <Txt variant="small" tone={enrolment?.status === 'finished' ? 'dawn' : 'mist'}>
            {status}
          </Txt>
          {enrolment && enrolment.status !== 'finished' ? <ProgressBar value={percent} label={t('plans.progressLabel', { percent })} /> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mist} />
      </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.sm, marginHorizontal: -SPACE.sm, borderRadius: RADIUS.control },
});
