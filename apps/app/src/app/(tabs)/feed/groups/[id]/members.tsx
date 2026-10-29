import Ionicons from '@expo/vector-icons/Ionicons';
import { canChangeRole, canRemoveMember, type MemberToday } from '@bible-app/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useGroup, useGroupMembers, useNudgeMember, useRemoveGroupMember, useSetMemberRole, useTransferGroup } from '../../../../../api/hooks';
import type { GroupMember, GroupRole } from '../../../../../api/types';
import { useTheme } from '../../../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../../../theme/tokens';
import { ActionSheet, type SheetAction } from '../../../../../ui/ActionSheet';
import { Button, IconButton } from '../../../../../ui/Button';
import { ErrorState, errorMessage, Loading, Notice, Section } from '../../../../../ui/misc';
import { PersonRow } from '../../../../../ui/PersonRow';
import { Screen } from '../../../../../ui/Screen';
import { Txt } from '../../../../../ui/Text';

const SECTIONS: MemberToday[] = ['plan_day', 'read', 'not_yet'];

/** Who has read today, roles, and (for admins) managing members. */
export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const group = useGroup(id);
  const members = useGroupMembers(id);
  const nudge = useNudgeMember();
  const [sent, setSent] = useState<string[]>([]);

  const myRole = group.data?.myRole ?? null;
  const hasPlanDay = group.data?.plan?.status === 'active';

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={group.data?.name ?? t('groups.title')}
          icon="chevron-back"
          variant="quiet"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/feed/groups/${id}`))}
        />
      </View>
      <Txt variant="h1">{t('groups.membersTitle')}</Txt>
      {members.isPending || group.isPending ? (
        <Loading />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : (
        <>
          {nudge.error ? <Notice tone="warning">{errorMessage(t, nudge.error)}</Notice> : null}
          {SECTIONS.map((status) => {
            const list = members.data.filter((m) => m.today === status);
            if (list.length === 0 || (status === 'plan_day' && !hasPlanDay)) return null;
            return (
              <Section key={status} title={t(`groups.today.${status}`, { count: list.length, day: group.data?.plan?.day ?? '' })}>
                <View role="list" style={{ gap: SPACE.xs }}>
                  {list.map((m) => (
                    <MemberRow
                      key={m.id}
                      groupId={id}
                      member={m}
                      myRole={myRole}
                      nudged={sent.includes(m.id) || (m.today === 'not_yet' && !m.isMe && !m.canNudge)}
                      onNudge={() => nudge.mutate({ groupId: id, userId: m.id }, { onSuccess: () => setSent((s) => [...s, m.id]) })}
                    />
                  ))}
                </View>
              </Section>
            );
          })}
          <Txt variant="small" tone="mist">
            {t('groups.nudgeExplain')}
          </Txt>
        </>
      )}
    </Screen>
  );
}

function MemberRow({
  groupId,
  member,
  myRole,
  nudged,
  onNudge,
}: {
  groupId: string;
  member: GroupMember;
  myRole: GroupRole | null;
  nudged: boolean;
  onNudge: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<'remove' | 'transfer' | null>(null);
  const setRole = useSetMemberRole();
  const transfer = useTransferGroup();
  const remove = useRemoveGroupMember();
  const name = member.displayName || member.username || t('profile.noName');
  const subtitle = [member.role !== 'member' ? t(`groups.roles.${member.role}`) : null, member.isMe ? t('groups.you') : null].filter(Boolean).join(' · ');

  const actions: SheetAction[] = member.isMe
    ? []
    : [
        ...(canChangeRole(myRole, member.role, 'admin')
          ? [{ label: t('groups.makeAdmin'), icon: 'shield-outline' as const, onPress: () => setRole.mutate({ groupId, userId: member.id, role: 'admin' }) }]
          : []),
        ...(canChangeRole(myRole, member.role, 'member')
          ? [{ label: t('groups.removeAdmin'), icon: 'shield-outline' as const, onPress: () => setRole.mutate({ groupId, userId: member.id, role: 'member' }) }]
          : []),
        ...(myRole === 'owner' ? [{ label: t('groups.makeOwner'), icon: 'key-outline' as const, onPress: () => setConfirm('transfer') }] : []),
        ...(canRemoveMember(myRole, member.role)
          ? [{ label: t('groups.removeMember'), icon: 'person-remove-outline' as const, danger: true, onPress: () => setConfirm('remove') }]
          : []),
      ];

  return (
    <View style={{ gap: SPACE.xs }}>
      <PersonRow person={member} subtitle={subtitle || (member.username ? `@${member.username}` : '')}>
        {member.today !== 'not_yet' ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.dawn} accessibilityLabel={t(`groups.statusLabel.${member.today}`)} />
        ) : !member.isMe ? (
          nudged ? (
            <Txt variant="small" tone="mist">
              {t('groups.nudged')}
            </Txt>
          ) : (
            <Button label={t('groups.nudge')} icon="sunny-outline" variant="secondary" accessibilityLabel={t('groups.nudgeLabel', { name })} onPress={onNudge} />
          )
        ) : null}
        {actions.length > 0 ? <IconButton icon="ellipsis-horizontal" label={t('groups.memberActions', { name })} onPress={() => setMenu(true)} size={20} /> : null}
      </PersonRow>
      {confirm ? (
        <View style={[styles.confirm, { borderColor: colors.rule }]} role="alertdialog">
          <Txt>{confirm === 'remove' ? t('groups.removeConfirm', { name }) : t('groups.transferConfirm', { name })}</Txt>
          <View style={styles.row}>
            <Button
              label={confirm === 'remove' ? t('groups.removeMember') : t('groups.makeOwner')}
              variant="danger"
              loading={remove.isPending || transfer.isPending}
              onPress={() =>
                confirm === 'remove'
                  ? remove.mutate({ groupId, userId: member.id }, { onSuccess: () => setConfirm(null) })
                  : transfer.mutate({ groupId, userId: member.id }, { onSuccess: () => setConfirm(null) })
              }
            />
            <Button label={t('common.cancel')} variant="quiet" onPress={() => setConfirm(null)} />
          </View>
        </View>
      ) : null}
      <ActionSheet title={name} actions={actions} visible={menu} onClose={() => setMenu(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  confirm: { borderWidth: 1, borderRadius: RADIUS.control, padding: SPACE.md, gap: SPACE.sm },
});
