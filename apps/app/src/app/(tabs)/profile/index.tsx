import Ionicons from '@expo/vector-icons/Ionicons';
import { BADGE_CODES } from '@bible-app/core';
import { useRouter, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useBadges, useEnrolments, usePlans, useProfile, useToday } from '../../../api/hooks';
import { useTheme } from '../../../theme/ThemeProvider';
import { FONTS, RADIUS, SPACE } from '../../../theme/tokens';
import { Divider, ErrorState, Loading, ProgressBar, Section } from '../../../ui/misc';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const profile = useProfile();
  const today = useToday();
  const badges = useBadges();
  const enrolments = useEnrolments();
  const plans = usePlans();

  if (profile.isPending) return <Screen><Loading /></Screen>;
  if (profile.isError) return <Screen><ErrorState error={profile.error} onRetry={() => profile.refetch()} /></Screen>;

  const p = profile.data;
  const name = p.displayName || t('profile.noName');
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const earned = new Map((badges.data ?? []).map((b) => [b.code, b]));
  const active = (enrolments.data ?? []).filter((e) => e.status === 'active');

  return (
    <Screen>
      <View style={styles.head}>
        <View style={[styles.avatar, { backgroundColor: colors.tideSoft }]} importantForAccessibility="no-hide-descendants">
          <Txt variant="h2" tone="tide">
            {initials}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h1">{name}</Txt>
          {p.username ? <Txt tone="mist">@{p.username}</Txt> : null}
          <Txt variant="small" tone="mist">
            {t(`profile.visibility.${p.visibility}`)}
          </Txt>
        </View>
      </View>
      {p.bio ? <Txt variant="lead">{p.bio}</Txt> : null}

      {today.data ? (
        <View style={[styles.stats, { borderColor: colors.rule }]}>
          <Stat value={today.data.streak.current} label={t('profile.currentStreak')} />
          <Stat value={today.data.streak.longest} label={t('profile.longestStreak')} />
          <Stat value={today.data.daysReadLast7} label={t('profile.last7')} />
        </View>
      ) : null}

      {active.length > 0 && plans.data ? (
        <Section title={t('profile.plansInProgress')}>
          <View style={{ gap: SPACE.md }}>
            {active.map((e) => {
              const plan = plans.data.find((x) => x.id === e.planId);
              if (!plan) return null;
              const percent = Math.floor((e.completedDays.length / plan.days) * 100);
              return (
                <View key={e.id} style={{ gap: SPACE.xs }}>
                  <Txt variant="label">{plan.title}</Txt>
                  <ProgressBar value={percent} label={t('plans.progressLabel', { percent })} />
                </View>
              );
            })}
          </View>
        </Section>
      ) : null}

      <Section title={t('profile.badges')}>
        <View style={styles.badges}>
          {BADGE_CODES.map((code) => {
            const has = earned.has(code);
            return (
              <View
                key={code}
                style={[styles.badge, { borderColor: has ? colors.dawn : colors.rule, backgroundColor: has ? colors.surface : 'transparent' }]}
                accessible
                accessibilityLabel={`${t(`badges.${code}.name`)}. ${t(`badges.${code}.description`)}. ${has ? t('profile.badgeEarned') : t('profile.badgeNotYet')}`}
              >
                <Ionicons name={has ? 'ribbon' : 'ribbon-outline'} size={26} color={has ? colors.dawn : colors.dusk} />
                <Txt variant="label" align="center" tone={has ? 'ink' : 'mist'}>
                  {t(`badges.${code}.name`)}
                </Txt>
                <Txt variant="small" align="center" tone="mist">
                  {t(`badges.${code}.description`)}
                </Txt>
              </View>
            );
          })}
        </View>
      </Section>

      <View>
        <LinkRow href="/profile/saved" icon="bookmark-outline" label={t('profile.saved')} />
        <Divider />
        <LinkRow href="/feed/people?tab=following" icon="people-outline" label={t('profile.friends')} />
        <Divider />
        {p.username ? (
          <>
            <LinkRow href={`/feed/u/${p.username}`} icon="eye-outline" label={t('profile.asOthersSee')} />
            <Divider />
          </>
        ) : null}
        <LinkRow href="/profile/settings" icon="settings-outline" label={t('profile.settings')} />
        {p.isAdmin ? (
          <>
            <Divider />
            <LinkRow href="/profile/moderation" icon="shield-checkmark-outline" label={t('moderation.title')} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Txt style={{ fontFamily: FONTS.display, fontSize: 31, fontVariant: ['tabular-nums'] }}>{value}</Txt>
      <Txt variant="small" tone="mist" align="center">
        {label}
      </Txt>
    </View>
  );
}

function LinkRow({ href, icon, label }: { href: Href; icon: ComponentProps<typeof Ionicons>['name']; label: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(href)}
        style={(s) => [
          styles.linkRow,
          (s as { hovered?: boolean }).hovered && { backgroundColor: colors.tideSoft },
          (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
        ]}
      >
        <Ionicons name={icon} size={20} color={colors.ink} />
        <Txt variant="label" style={{ flex: 1 }}>
          {label}
        </Txt>
        <Ionicons name="chevron-forward" size={18} color={colors.mist} />
      </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  avatar: { width: 72, height: 72, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: SPACE.md },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  badge: { width: '48%', minWidth: 140, flexGrow: 1, borderWidth: 1, borderRadius: RADIUS.panel, padding: SPACE.md, alignItems: 'center', gap: SPACE.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 52, paddingHorizontal: SPACE.sm, marginHorizontal: -SPACE.sm, borderRadius: RADIUS.control },
});
