import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useBlock, usePublicProfile, useSetMuted, useUserPosts } from '../../../../api/hooks';
import type { PublicProfile } from '../../../../api/types';
import { useTheme } from '../../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../../theme/tokens';
import { ActionSheet, type SheetAction } from '../../../../ui/ActionSheet';
import { Avatar } from '../../../../ui/Avatar';
import { Button, IconButton } from '../../../../ui/Button';
import { FollowButton } from '../../../../ui/FollowButton';
import { Divider, ErrorState, Loading, Notice, ProgressBar, Section } from '../../../../ui/misc';
import { PostCard } from '../../../../ui/PostCard';
import { ReportDialog } from '../../../../ui/ReportDialog';
import { Screen } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Text';

/** Someone's profile as other people see it. */
export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const profile = usePublicProfile({ username });

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed'))} />
      </View>
      {profile.isPending ? <Loading /> : profile.isError ? <ErrorState error={profile.error} /> : <ProfileBody profile={profile.data} />}
    </Screen>
  );
}

function ProfileBody({ profile }: { profile: PublicProfile }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const mute = useSetMuted();
  const block = useBlock();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const name = profile.displayName || profile.username || t('profile.noName');

  const actions: SheetAction[] = [
    {
      label: profile.muted ? t('people.unmute', { name }) : t('post.mute', { name }),
      icon: profile.muted ? 'volume-high-outline' : 'volume-mute-outline',
      onPress: () => mute.mutate({ userId: profile.id, muted: !profile.muted }),
    },
    { label: t('people.reportUser', { name }), icon: 'flag-outline', onPress: () => setReporting(true) },
    { label: t('post.block', { name }), icon: 'ban-outline', danger: true, onPress: () => setConfirmBlock(true) },
  ];

  return (
    <>
      <View style={styles.head}>
        <Avatar person={profile} size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h2">{name}</Txt>
          {profile.username ? (
            <Txt variant="small" tone="mist">
              {`@${profile.username}`}
            </Txt>
          ) : null}
          <Txt variant="small" tone="mist">
            {`${t('people.followerCount', { count: profile.followerCount })} · ${t('people.followingCount', { count: profile.followingCount })}`}
          </Txt>
        </View>
        {!profile.isMe ? <IconButton icon="ellipsis-horizontal" label={t('people.moreFor', { name })} onPress={() => setMenu(true)} /> : null}
      </View>

      {profile.bio && profile.canSee ? <Txt>{profile.bio}</Txt> : null}

      <View style={styles.actions}>
        {profile.isMe ? (
          <Button label={t('people.editProfile')} variant="secondary" href="/profile" />
        ) : (
          <FollowButton userId={profile.id} state={profile.followStatus} visibility={profile.visibility} name={name} />
        )}
        {profile.followsYou && !profile.isMe ? (
          <Txt variant="small" tone="mist">
            {t('people.followsYou')}
          </Txt>
        ) : null}
      </View>
      {profile.muted ? <Notice>{t('people.mutedNote', { name })}</Notice> : null}

      {confirmBlock ? (
        <View style={[styles.confirm, { borderColor: colors.rule }]} role="alertdialog">
          <Txt>{t('people.blockConfirm', { name })}</Txt>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button label={t('post.block', { name })} variant="danger" loading={block.isPending} onPress={() => block.mutate(profile.id, { onSuccess: () => router.replace('/feed') })} />
            <Button label={t('common.cancel')} variant="quiet" onPress={() => setConfirmBlock(false)} />
          </View>
        </View>
      ) : null}

      {!profile.canSee ? (
        <View style={styles.locked}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.mist} />
          <Txt tone="mist" align="center">
            {profile.visibility === 'private' ? t('people.privateNote') : t('people.friendsOnlyNote', { name })}
          </Txt>
        </View>
      ) : (
        <>
          {profile.streak ? (
            <View style={styles.stats}>
              <Stat value={profile.streak.current} label={t('people.currentStreak')} />
              <Stat value={profile.streak.longest} label={t('people.longestStreak')} />
              <Stat value={profile.badges?.length ?? 0} label={t('people.badges')} />
            </View>
          ) : null}
          {profile.plans && profile.plans.length > 0 ? (
            <Section title={t('people.readingNow')}>
              <View style={{ gap: SPACE.md }}>
                {profile.plans.map((p) => (
                  <View key={p.title} style={{ gap: SPACE.xs }}>
                    <Txt variant="label">{p.title}</Txt>
                    <ProgressBar value={percentOf(p.completed, p.days)} label={t('plans.progressLabel', { percent: percentOf(p.completed, p.days) })} />
                  </View>
                ))}
              </View>
            </Section>
          ) : null}
          {profile.badges && profile.badges.length > 0 ? (
            <Section title={t('people.badges')}>
              <View style={styles.badges}>
                {profile.badges.map((code) => (
                  <View key={code} style={[styles.badge, { borderColor: colors.rule }]}>
                    <Ionicons name="ribbon" size={16} color={colors.dawn} />
                    <Txt variant="small">{t(`badges.${code}.name`)}</Txt>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}
          <Section title={t('people.posts')}>
            <UserPosts userId={profile.id} />
          </Section>
        </>
      )}

      <ActionSheet title={name} actions={actions} visible={menu} onClose={() => setMenu(false)} />
      <ReportDialog target={reporting ? { type: 'user', id: profile.id, authorId: profile.id, authorName: name } : null} onClose={() => setReporting(false)} />
    </>
  );
}

const percentOf = (done: number, total: number) => (total > 0 ? Math.floor((done / total) * 100) : 0);

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${value} ${label}`}>
      <Txt variant="h2">{String(value)}</Txt>
      <Txt variant="small" tone="mist" align="center">
        {label}
      </Txt>
    </View>
  );
}

function UserPosts({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const posts = useUserPosts(userId);
  if (posts.isPending) return <Loading />;
  if (posts.isError) return <ErrorState error={posts.error} onRetry={() => posts.refetch()} />;
  const items = posts.data.pages.flatMap((p) => p.items);
  if (items.length === 0) return <Txt tone="mist">{t('people.noPosts')}</Txt>;
  return (
    <View>
      {items.map((post, i) => (
        <View key={post.id}>
          {i > 0 ? <Divider /> : null}
          <PostCard post={post} />
        </View>
      ))}
      {posts.hasNextPage ? (
        <View style={{ alignItems: 'center', paddingTop: SPACE.md }}>
          <Button label={t('feed.showOlder')} variant="secondary" loading={posts.isFetchingNextPage} onPress={() => posts.fetchNextPage()} />
        </View>
      ) : (
        <Txt variant="small" tone="mist" align="center" style={{ paddingTop: SPACE.md }}>
          {t('people.endOfPosts')}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap' },
  locked: { alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xl },
  stats: { flexDirection: 'row', gap: SPACE.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.sm + 4, minHeight: 32 },
  confirm: { borderWidth: 1, borderRadius: RADIUS.control, padding: SPACE.md, gap: SPACE.sm },
});
