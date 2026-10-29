import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Group } from '../api/types';
import { language } from '../i18n';
import { formatLocalDate } from '../lib/time';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Txt } from './Text';

/** One-line plan status for a group: "Day 5 of 30 · Psalms in 30 Days". */
export function useGroupPlanLine() {
  const { t } = useTranslation();
  return (g: Group): string | null => {
    if (!g.plan) return null;
    if (g.plan.status === 'not_started') return t('groups.planStarts', { title: g.plan.title, date: formatLocalDate(g.plan.start, language) });
    if (g.plan.status === 'finished') return t('groups.planFinished', { title: g.plan.title });
    return t('groups.planDay', { day: g.plan.day, total: g.plan.days, title: g.plan.title });
  };
}

/** A group in a list. Members see today's numbers; previews show what joining means. */
export function GroupCard({ group, children }: { group: Group; children?: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const planLine = useGroupPlanLine()(group);
  const member = group.myRole !== null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.rule }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('groups.open', { name: group.name })}
        onPress={() => router.push(`/feed/groups/${group.id}`)}
        style={(s) => [styles.main, (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' }]}
      >
        <View style={[styles.icon, { backgroundColor: colors.tideSoft }]}>
          <Ionicons name={KIND_ICONS[group.kind]} size={22} color={colors.tide} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">{group.name}</Txt>
          <Txt variant="small" tone="mist">
            {`${t(`groups.kinds.${group.kind}`)} · ${t('groups.memberCount', { count: group.memberCount })}`}
          </Txt>
          {planLine ? (
            <Txt variant="small" tone="mist">
              {planLine}
            </Txt>
          ) : null}
          {member ? (
            <View style={styles.today}>
              <Txt variant="small">{t('groups.readToday', { count: group.readersToday, total: group.memberCount })}</Txt>
              {group.streak > 0 ? (
                <View style={styles.streak}>
                  <Ionicons name="sunny" size={14} color={colors.dawn} />
                  <Txt variant="small">{t('groups.streakShort', { count: group.streak })}</Txt>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mist} />
      </Pressable>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

export const KIND_ICONS = {
  small_group: 'people',
  church: 'home',
  friends: 'happy',
  family: 'heart',
} as const;

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: RADIUS.panel, padding: SPACE.md, gap: SPACE.sm },
  main: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, borderRadius: RADIUS.control },
  icon: { width: 44, height: 44, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  today: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm, marginTop: 2 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: SPACE.sm, paddingLeft: 60 },
});
