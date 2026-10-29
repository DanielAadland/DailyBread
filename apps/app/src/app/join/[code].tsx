import { isValidInviteCode } from '@bible-app/core';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useAccess } from '../../api/access';
import { useGroupByInvite } from '../../api/hooks';
import { savePendingInvite } from '../../lib/invite';
import { SPACE } from '../../theme/tokens';
import { Button } from '../../ui/Button';
import { GroupPreview } from '../../ui/GroupHeader';
import { AppError } from '../../api/types';
import { ErrorState, Loading } from '../../ui/misc';
import { Logo } from '../../ui/Logo';
import { Screen } from '../../ui/Screen';
import { Txt } from '../../ui/Text';

/** An invite link: /join/<code>. Signed-out visitors sign up first and come back here afterwards. */
export default function JoinScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = (params.code ?? '').toLowerCase();
  const { t } = useTranslation();
  const access = useAccess();
  const valid = isValidInviteCode(code);

  useEffect(() => {
    if (valid && access !== 'ready') savePendingInvite(code);
  }, [valid, access, code]);

  if (access === 'needs-onboarding') return <Redirect href="/onboarding" />;

  return (
    <Screen>
      <Logo name={t('app.name')} size={28} />
      {!valid ? (
        <ErrorState error={new AppError('invite_not_found')} />
      ) : access === 'signed-out' ? (
        <SignedOut />
      ) : (
        <Invite code={code} />
      )}
    </Screen>
  );
}

function SignedOut() {
  const { t } = useTranslation();
  return (
    <View style={{ gap: SPACE.md }}>
      <Txt variant="h1">{t('groups.invitedTitle')}</Txt>
      <Txt>{t('groups.invitedSignedOut')}</Txt>
      <Button label={t('auth.createAccount')} href="/sign-up" fullWidth />
      <Button label={t('auth.signIn')} variant="secondary" href="/sign-in" fullWidth />
    </View>
  );
}

function Invite({ code }: { code: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const group = useGroupByInvite(code);
  if (group.isPending) return <Loading />;
  if (group.isError) {
    return (
      <View style={{ gap: SPACE.md }}>
        <ErrorState error={group.error} />
        <Button label={t('groups.title')} variant="secondary" href="/feed/groups" />
      </View>
    );
  }
  if (group.data.myRole) return <Redirect href={`/feed/groups/${group.data.id}`} />;
  return (
    <View style={{ gap: SPACE.md }}>
      <Txt variant="small" tone="mist">
        {t('groups.invitedTitle')}
      </Txt>
      <GroupPreview group={group.data} code={code} />
      <Button label={t('groups.notNow')} variant="quiet" onPress={() => router.replace('/')} />
    </View>
  );
}
