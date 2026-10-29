import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useConnections, useFeed, useMyGroups, useNotifications, useProfile } from '../../../api/hooks';
import { useTheme } from '../../../theme/ThemeProvider';
import { SPACE } from '../../../theme/tokens';
import { Button, IconButton } from '../../../ui/Button';
import { Divider, ErrorState, Loading, Notice } from '../../../ui/misc';
import { PostCard } from '../../../ui/PostCard';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';

/** Posts from people you follow, newest first. It ends: no endless scrolling. */
export default function FeedScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const feed = useFeed();
  const profile = useProfile();
  const groupCount = useMyGroups().data?.length ?? 0;
  const notifications = useNotifications();
  const requests = useConnections('requests');
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const caughtUp = feed.data ? !feed.hasNextPage : false;

  return (
    <Screen>
      <View style={styles.header}>
        <Txt variant="h1" style={{ flex: 1 }}>
          {t('feed.title')}
        </Txt>
        <View>
          <IconButton
            icon="notifications-outline"
            label={unread > 0 ? t('feed.notificationsUnread', { count: unread }) : t('feed.notifications')}
            onPress={() => router.push('/feed/notifications')}
          />
          {unread > 0 ? <View style={[styles.dot, { backgroundColor: colors.dawn }]} /> : null}
        </View>
        <IconButton icon="person-add-outline" label={t('feed.findPeople')} onPress={() => router.push('/feed/people')} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
        <Button label={t('feed.newPost')} icon="create-outline" variant="secondary" href="/feed/compose" />
        <Button
          label={groupCount > 0 ? t('feed.groupsCount', { count: groupCount }) : t('groups.title')}
          icon="people-circle-outline"
          variant="secondary"
          href="/feed/groups"
        />
      </View>

      {profile.data && !profile.data.username ? (
        <Notice>
          {t('feed.needUsername')}{' '}
          <Txt variant="small" tone="tide" onPress={() => router.push('/profile/settings')} accessibilityRole="link">
            {t('feed.chooseUsername')}
          </Txt>
        </Notice>
      ) : null}
      {(requests.data?.length ?? 0) > 0 ? (
        <Notice>
          {t('feed.pendingRequests', { count: requests.data!.length })}{' '}
          <Txt variant="small" tone="tide" onPress={() => router.push('/feed/people?tab=requests')} accessibilityRole="link">
            {t('feed.review')}
          </Txt>
        </Notice>
      ) : null}

      {feed.isPending ? (
        <Loading />
      ) : feed.isError ? (
        <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
      ) : posts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={40} color={colors.mist} />
          <Txt variant="h3" align="center">
            {t('feed.emptyTitle')}
          </Txt>
          <Txt tone="mist" align="center">
            {t('feed.emptyBody')}
          </Txt>
          <Button label={t('feed.findPeople')} href="/feed/people" />
        </View>
      ) : (
        <View>
          {posts.map((post, i) => (
            <View key={post.id}>
              {i > 0 ? <Divider /> : null}
              <PostCard post={post} />
            </View>
          ))}
          <Divider />
          {caughtUp ? (
            <View style={styles.end} role="status">
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.dawn} />
              <Txt variant="h3" align="center">
                {t('feed.caughtUpTitle')}
              </Txt>
              <Txt tone="mist" align="center">
                {t('feed.caughtUpBody')}
              </Txt>
              <Button label={t('feed.backToReading')} variant="secondary" href="/" />
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: SPACE.md }}>
              <Button label={t('feed.showOlder')} variant="secondary" loading={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()} />
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  dot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5 },
  empty: { alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xl },
  end: { alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xl },
});
