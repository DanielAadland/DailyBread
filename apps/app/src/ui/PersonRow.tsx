import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Person } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Avatar } from './Avatar';
import { Txt } from './Text';

/** A person in a list: avatar and name link to their profile, actions on the right. */
export function PersonRow({ person, subtitle, children }: { person: Person; subtitle?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const name = person.displayName || person.username || t('profile.noName');
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('post.openProfile', { name })}
        disabled={!person.username}
        onPress={() => person.username && router.push(`/feed/u/${person.username}`)}
        style={(s) => [styles.who, (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' }]}
      >
        <Avatar person={person} />
        <View style={{ flex: 1 }}>
          <Txt variant="label" numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="small" tone="mist" numberOfLines={1}>
            {subtitle ?? (person.username ? `@${person.username}` : '')}
          </Txt>
        </View>
      </Pressable>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 56 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + 4, borderRadius: RADIUS.control, paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: SPACE.xs, alignItems: 'center' },
});
