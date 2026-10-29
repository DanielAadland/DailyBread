import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { FONTS } from '../theme/tokens';
import { Txt } from './Text';

/** Brand mark: half a sun on the horizon, and the name. Scales as one unit with `size`. */
export function Logo({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const fontSize = Math.round(size * 0.78);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Math.round(size * 0.22) }} accessible accessibilityRole="header" accessibilityLabel={name}>
      <View style={{ flexShrink: 0, paddingBottom: Math.round(size * 0.1) }}>
        <Svg width={size * 1.5} height={size * 0.62} viewBox="0 0 60 25" importantForAccessibility="no">
          <Path d="M 14 22 A 16 16 0 0 1 46 22 Z" fill={colors.dawn} />
          <Line x1={2} y1={22.5} x2={58} y2={22.5} stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" />
        </Svg>
      </View>
      <Txt numberOfLines={1} style={{ fontFamily: FONTS.display, fontSize, lineHeight: Math.round(fontSize * 1.15) }} importantForAccessibility="no">
        {name}
      </Txt>
    </View>
  );
}
