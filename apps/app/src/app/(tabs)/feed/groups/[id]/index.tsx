import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useEnrolments, useGroup, useGroupMembers, useGroupPosts, useLeaveGroup, useStartPlan } from '../../../../../api/hooks';
import type { Group } from '../../../../../api/types';
import { useBookNames } from '../../../../../bible/useBible';
import { language } from '../../../../../i18n';
import { formatLocalDate } from '../../../../../lib/time';
import { useTheme } from '../../../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../../../theme/tokens';
import { ActionSheet, type SheetAction } from '../../../../../ui/ActionSheet';
import { Avatar } from '../../../../../ui/Avatar';
import { Button, IconButton } from '../../../../../ui/Button';
import { GroupHeader, GroupPreview } from '../../../../../ui/GroupHeader';
import { InvitePanel } from '../../../../../ui/InvitePanel';
import { Divider, ErrorState, errorMessage, Loading, Notice, Section } from '../../../../../ui/misc';
import { PostCard } from '../../../../../ui/PostCard';
import { Screen } from '../../../../../ui/Screen';
import { Txt } from '../../../../../ui/Text';

/** A group's home: today's reading together, who has read, the streak, and the group's posts. */
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const group = useGroup(id);

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('groups.title')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed/groups'))} />
      </View>
      {group.isPending ? (
        <Loading />
      ) : group.isError ? (
        <ErrorState error={group.error} onRetry={() => group.refetch()} />
      ) : group.data.myRole ? (
        <MemberView group={group.data} />
      ) : (
        <GroupPreview group={group.data} />
      )}
    </Screen>
  );
}

function MemberView({ group }: { group: Group }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const leave = useLeaveGroup();
  const [menu, setMenu] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const isAdmin = group.myRole === 'owner' || group.myRole === 'admin';

  const actions: SheetAction[] = [
    { label: t('groups.invite'), icon: 'person-add-outline', onPress: () => setInviting(true) },
    { label: t('groups.membersTitle'), icon: 'people-outline', onPress: () => router.push(`/feed/groups/${group.id}/members`) },
    ...(isAdmin ? [{ label: t('groups.settings'), icon: 'settings-outline' as const, onPress: () => router.push(`/feed/groups/${group.id}/settings`) }] : []),
    ...(group.myRole !== 'owner' ? [{ label: t('groups.leave'), icon: 'exit-outline' as const, danger: true, onPress: () => setConfirmLeave(true) }] : []),
  ];

  return (
    <>
      <GroupHeader group={group} menu={() => setMenu(true)} />
      {confirmLeave ? (
        <View style={[styles.confirm, { borderColor: colors.rule }]} role="alertdialog">
          <Txt>{t('groups.leaveConfirm', { name: group.name })}</Txt>
          <View style={styles.row}>
            <Button label={t('groups.leave')} variant="danger" loading={leave.isPending} onPress={() => leave.mutate(group.id, { onSuccess: () => router.replace('/feed/groups') })} />
            <Button label={t('common.cancel')} variant="quiet" onPress={() => setConfirmLeave(false)} />
          </View>
        </View>
      ) : null}

      <TodayPanel group={group} />
      <Together group={group} />

      {inviting ? (
        <Section title={t('groups.invite')}>
          {group.inviteCode ? <InvitePanel groupName={group.name} code={group.inviteCode} /> : null}
          <View style={{ alignItems: 'flex-start' }}>
            <Button label={t('common.done')} variant="quiet" onPress={() => setInviting(false)} />
          </View>
        </Section>
      ) : (
        <View style={styles.row}>
          <Button label={t('groups.invite')} icon="person-add-outline" variant="secondary" onPress={() => setInviting(true)} />
          <Button label={t('groups.writePost')} icon="create-outline" variant="secondary" href={`/feed/compose?group=${group.id}`} />
        </View>
      )}

      <Divider />
      <GroupPosts group={group} />
      <ActionSheet title={group.name} actions={actions} visible={menu} onClose={() => setMenu(false)} />
    </>
  );
}

function TodayPanel({ group }: { group: Group }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { referenceFromKey } = useBookNames();
  const enrolments = useEnrolments();
  const start = useStartPlan();
  const plan = group.plan;

  if (!plan) {
    return group.myRole === 'member' ? null : (
      <Notice>
        {t('groups.noPlanAdmin')}{' '}
        <Txt variant="small" tone="tide" accessibilityRole="link" onPress={() => router.push(`/feed/groups/${group.id}/settings`)}>
          {t('groups.choosePlan')}
        </Txt>
      </Notice>
    );
  }
  if (plan.status !== 'active' || plan.day === null) {
    return (
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.rule }]}>
        <Txt variant="label">{plan.title}</Txt>
        <Txt tone="mist">{plan.status === 'not_started' ? t('groups.planStartsOn', { date: formatLocalDate(plan.start, language) }) : t('groups.planFinishedTogether')}</Txt>
      </View>
    );
  }

  const day = plan.day;
  const done = group.myToday === 'plan_day';
  const enrolment = enrolments.data?.find((e) => e.planId === plan.id);
  const read = () => {
    const go = () => router.push(`/plans/${plan.slug}/${day}`);
    if (enrolment && enrolment.status !== 'paused') go();
    else start.mutate(plan.id, { onSuccess: go });
  };

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: done ? colors.dawn : colors.rule }]} role="region" aria-label={t('groups.todayTitle')}>
      <Txt variant="small" tone="mist">
        {t('groups.planDay', { day, total: plan.days, title: plan.title })}
      </Txt>
      <Txt variant="h2">{(plan.readings ?? []).map(referenceFromKey).join(', ')}</Txt>
      {done ? (
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.dawn} />
          <Txt>{t('groups.youReadToday')}</Txt>
        </View>
      ) : null}
      <View style={styles.row}>
        {!done ? <Button label={t('groups.readDay', { day })} icon="book-outline" loading={start.isPending} onPress={read} /> : null}
        <Button label={t('groups.openThread')} icon="chatbubbles-outline" variant={done ? 'primary' : 'secondary'} href={`/feed/groups/${group.id}/day/${day}`} />
      </View>
      {start.error ? <Notice tone="warning">{errorMessage(t, start.error)}</Notice> : null}
    </View>
  );
}

function Together({ group }: { group: Group }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const members = useGroupMembers(group.id);
  const readers = (members.data ?? []).filter((m) => m.today !== 'not_yet');

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.rule }]} role="region" aria-label={t('groups.togetherTitle')}>
      <View style={styles.togetherRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">{t('groups.readToday', { count: group.readersToday, total: group.memberCount })}</Txt>
          <View style={styles.avatars} importantForAccessibility="no-hide-descendants">
            {readers.slice(0, 8).map((m) => (
              <View key={m.id} style={[styles.avatarRing, { borderColor: colors.dawn }]}>
                <Avatar person={m} size={28} />
              </View>
            ))}
          </View>
        </View>
        <View style={styles.streakBox} accessible accessibilityLabel={t('groups.streakLong', { count: group.streak })}>
          <Ionicons name="sunny" size={22} color={colors.dawn} />
          <Txt variant="h2">{String(group.streak)}</Txt>
          <Txt variant="small" tone="mist">
            {t('groups.streakLabel', { count: group.streak })}
          </Txt>
        </View>
      </View>
      <Txt variant="small" tone="mist">
        {t('groups.streakRule')}
      </Txt>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('groups.seeWho')} variant="quiet" icon="people-outline" href={`/feed/groups/${group.id}/members`} />
      </View>
    </View>
  );
}

function GroupPosts({ group }: { group: Group }) {
  const { t } = useTranslation();
  const posts = useGroupPosts(group.id);
  if (posts.isPending) return <Loading />;
  if (posts.isError) return <ErrorState error={posts.error} onRetry={() => posts.refetch()} />;
  const pinned = posts.data.pages[0]?.pinned ?? [];
  const items = posts.data.pages.flatMap((p) => p.items);
  if (pinned.length === 0 && items.length === 0) return <Txt tone="mist">{t('groups.noPosts')}</Txt>;
  return (
    <View>
      {[...pinned, ...items].map((post, i) => (
        <View key={post.id}>
          {i > 0 ? <Divider /> : null}
          <PostCard post={post} inGroup />
        </View>
      ))}
      <Divider />
      {posts.hasNextPage ? (
        <View style={{ alignItems: 'center', paddingTop: SPACE.md }}>
          <Button label={t('feed.showOlder')} variant="secondary" loading={posts.isFetchingNextPage} onPress={() => posts.fetchNextPage()} />
        </View>
      ) : (
        <Txt variant="small" tone="mist" align="center" style={{ paddingTop: SPACE.md }}>
          {t('groups.endOfPosts')}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  icon: { width: 52, height: 52, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  panel: { borderWidth: 1, borderRadius: RADIUS.panel, padding: SPACE.md, gap: SPACE.sm },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  togetherRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: SPACE.xs },
  avatarRing: { borderWidth: 2, borderRadius: RADIUS.pill, padding: 1 },
  streakBox: { alignItems: 'center', minWidth: 72 },
  confirm: { borderWidth: 1, borderRadius: RADIUS.control, padding: SPACE.md, gap: SPACE.sm },
});
