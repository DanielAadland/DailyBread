import { View } from 'react-native';
import type { Person } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { FONTS, RADIUS } from '../theme/tokens';
import { Txt } from './Text';

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

/** Initials on a soft circle. Decorative: the name is always shown next to it. */
export function Avatar({ person, size = 40 }: { person: Pick<Person, 'displayName' | 'username'>; size?: number }) {
  const { colors } = useTheme();
  const name = person.displayName || person.username || '?';
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{ width: size, height: size, borderRadius: RADIUS.pill, backgroundColor: colors.tideSoft, alignItems: 'center', justifyContent: 'center' }}
    >
      <Txt style={{ fontFamily: FONTS.uiBold, fontSize: Math.round(size * 0.38), color: colors.tide }}>{initials(name)}</Txt>
    </View>
  );
}
