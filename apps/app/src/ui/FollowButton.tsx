import { useTranslation } from 'react-i18next';
import { useFollow, useUnfollow } from '../api/hooks';
import type { FollowState, Visibility } from '../api/types';
import { Button } from './Button';

/** Follow / Request / Requested / Following, depending on the person's privacy setting. */
export function FollowButton({ userId, state, visibility, name }: { userId: string; state: FollowState; visibility: Visibility; name: string }) {
  const { t } = useTranslation();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const busy = follow.isPending || unfollow.isPending;

  if (visibility === 'private' && state === 'none') return null;
  if (state === 'accepted') {
    return <Button label={t('people.following')} variant="secondary" loading={busy} accessibilityLabel={t('people.unfollowLabel', { name })} onPress={() => unfollow.mutate(userId)} />;
  }
  if (state === 'pending') {
    return <Button label={t('people.requested')} variant="secondary" loading={busy} accessibilityLabel={t('people.cancelRequestLabel', { name })} onPress={() => unfollow.mutate(userId)} />;
  }
  return (
    <Button
      label={visibility === 'friends' ? t('people.request') : t('people.follow')}
      loading={busy}
      accessibilityLabel={visibility === 'friends' ? t('people.requestLabel', { name }) : t('people.followLabel', { name })}
      onPress={() => follow.mutate(userId)}
    />
  );
}
