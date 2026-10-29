import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useConnections, useMarkNotificationsRead, useNotifications, useRespondToFollow } from '../../../api/hooks';
import type { AppNotification, NotificationKind } from '../../../api/types';
import { language } from '../../../i18n';
import { relativeTime } from '../../../lib/time';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Avatar } from '../../../ui/Avatar';
import { Button } from '../../../ui/Button';
import { ErrorState, Loading } from '../../../ui/misc';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';

const ICONS: Record<NotificationKind, ComponentProps<typeof Ionicons>['name']> = {
  comment: 'chatbubble-outline',
  reaction: 'heart-outline',
  follow: 'person-add-outline',
  follow_request: 'person-add-outline',
  follow_accepted: 'checkmark-circle-outline',
  nudge: 'sunny-outline',
};

/** Recent activity around you. Opening the screen marks everything as read. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const hasUnread = (list.data ?? []).some((n) => !n.read);
  // Remember what was new when the screen opened, so it stays highlighted after being marked read.
  const [fresh, setFresh] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (list.data && fresh === null) setFresh(new Set(list.data.filter((n) => !n.read).map((n) => n.id)));
  }, [list.data, fresh]);

  useEffect(() => {
    if (hasUnread && !markRead.isPending) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('feed.title')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed'))} />
      </View>
      <Txt variant="h1">{t('notifications.title')}</Txt>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <Txt tone="mist">{t('notifications.empty')}</Txt>
      ) : (
        <View role="list" style={{ gap: SPACE.xs }}>
          {list.data.map((n) => (
            <NotificationRow key={n.id} item={n} isNew={!n.read || !!fresh?.has(n.id)} />
          ))}
          <Txt variant="small" tone="mist" align="center" style={{ paddingTop: SPACE.md }}>
            {t('notifications.end')}
          </Txt>
        </View>
      )}
    </Screen>
  );
}

function NotificationRow({ item, isNew }: { item: AppNotification; isNew: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const requests = useConnections('requests');
  const respond = useRespondToFollow();
  const name = item.actor.displayName || item.actor.username || t('profile.noName');
  const text = t(`notifications.kinds.${item.kind}`, { name, group: item.group?.name ?? '' });
  const stillPending = item.kind === 'follow_request' && (requests.data ?? []).some((p) => p.id === item.actor.id);

  const open = () => {
    if (item.post) router.push(`/feed/post/${item.post.id}`);
    else if (item.group) router.push(`/feed/groups/${item.group.id}`);
    else if (item.actor.username) router.push(`/feed/u/${item.actor.username}`);
  };

  return (
    <View role="listitem" style={[styles.row, isNew && { backgroundColor: colors.tideSoft }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${text} ${relativeTime(item.createdAt, language)}${isNew ? `. ${t('notifications.new')}` : ''}`}
        onPress={open}
        style={(s) => [styles.main, (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' }]}
      >
        <View>
          <Avatar person={item.actor} />
          <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.rule }]}>
            <Ionicons name={ICONS[item.kind]} size={12} color={colors.tide} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt>{text}</Txt>
          {item.post?.body ? (
            <Txt variant="small" tone="mist" numberOfLines={1}>
              {item.post.body}
            </Txt>
          ) : null}
          <Txt variant="small" tone="mist">
            {relativeTime(item.createdAt, language)}
          </Txt>
        </View>
      </Pressable>
      {stillPending ? (
        <View style={styles.actions}>
          <Button label={t('people.accept')} accessibilityLabel={t('people.acceptLabel', { name })} onPress={() => respond.mutate({ userId: item.actor.id, accept: true })} />
          <Button label={t('people.decline')} variant="quiet" accessibilityLabel={t('people.declineLabel', { name })} onPress={() => respond.mutate({ userId: item.actor.id, accept: false })} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: RADIUS.control, padding: SPACE.sm, gap: SPACE.sm },
  main: { flexDirection: 'row', gap: SPACE.sm + 4, alignItems: 'flex-start', borderRadius: RADIUS.control },
  badge: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: SPACE.xs, paddingLeft: 52 },
});
