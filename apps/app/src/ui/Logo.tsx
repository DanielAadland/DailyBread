import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { Txt } from './Text';

/** Brand mark: half a sun on the horizon, and the working name. */
export function Logo({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const w = size * 1.5;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }} accessible accessibilityRole="header" accessibilityLabel={name}>
      <Svg width={w} height={size * 0.62} viewBox="0 0 60 25" importantForAccessibility="no">
        <Path d="M 14 22 A 16 16 0 0 1 46 22 Z" fill={colors.dawn} />
        <Line x1={2} y1={22.5} x2={58} y2={22.5} stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
      <Txt variant="h1" style={{ lineHeight: size * 0.9 }} importantForAccessibility="no">
        {name}
      </Txt>
    </View>
  );
}
