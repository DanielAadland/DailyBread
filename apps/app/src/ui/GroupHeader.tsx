import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useJoinGroup } from '../api/hooks';
import type { Group } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Button, IconButton } from './Button';
import { KIND_ICONS, useGroupPlanLine } from './GroupCard';
import { errorMessage, Notice } from './misc';
import { Txt } from './Text';

export function GroupHeader({ group, menu }: { group: Group; menu?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.tideSoft }]}>
          <Ionicons name={KIND_ICONS[group.kind]} size={26} color={colors.tide} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h2">{group.name}</Txt>
          <Txt variant="small" tone="mist">
            {`${t(`groups.kinds.${group.kind}`)} · ${t(`groups.access.${group.access}`)} · ${t('groups.memberCount', { count: group.memberCount })}`}
          </Txt>
        </View>
        {menu ? <IconButton icon="ellipsis-horizontal" label={t('groups.moreFor', { name: group.name })} onPress={menu} /> : null}
      </View>
      {group.description ? <Txt>{group.description}</Txt> : null}
    </View>
  );
}

/** A group seen from outside (public, or through an invite link): what joining means, and a Join button. */
export function GroupPreview({ group, code }: { group: Group; code?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const join = useJoinGroup();
  const planLine = useGroupPlanLine()(group);
  return (
    <>
      <GroupHeader group={group} />
      {planLine ? <Txt tone="mist">{planLine}</Txt> : null}
      {group.streak > 0 ? <Txt tone="mist">{t('groups.streakLong', { count: group.streak })}</Txt> : null}
      <Notice>{t('groups.joinPrivacy')}</Notice>
      {join.error ? <Notice tone="warning">{errorMessage(t, join.error)}</Notice> : null}
      <Button
        label={t('groups.joinNamed', { name: group.name })}
        icon="enter-outline"
        fullWidth
        loading={join.isPending}
        onPress={() => join.mutate(code ? { code } : { id: group.id }, { onSuccess: (g) => router.replace(`/feed/groups/${g.id}`) })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  icon: { width: 52, height: 52, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
});
