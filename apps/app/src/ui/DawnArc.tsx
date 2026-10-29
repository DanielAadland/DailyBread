import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { DayState } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { FONTS } from '../theme/tokens';

const W = 320;
const H = 176;
const CX = W / 2;
const CY = 150; // the horizon
const R = 118;
const STROKE = 16;
const GAP_DEG = 3;
const SUN_R = 24;

function polar(deg: number, r = R) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcPath(fromDeg: number, toDeg: number) {
  const a = polar(fromDeg);
  const b = polar(toDeg);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
}

interface Props {
  /** Last 7 days, oldest first; the last one is today. */
  week: DayState[];
  /** Narrow weekday names for the same 7 days. */
  dayLabels: string[];
  readToday: boolean;
  /** Read by screen readers instead of the drawing. */
  accessibilityLabel: string;
}

/**
 * The Today hero: a horizon with one arc segment per day of the last week, filled in dawn gold
 * for each day read. When today is done, a sun rises over the horizon (once, and only if the
 * user has not asked for reduced motion).
 */
export function DawnArc({ week, dayLabels, readToday, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const rise = useRef(new Animated.Value(readToday ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const wasRead = useRef(readToday);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (readToday && !wasRead.current && !reduceMotion) {
      rise.setValue(0);
      Animated.timing(rise, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      rise.setValue(readToday ? 1 : 0);
    }
    wasRead.current = readToday;
  }, [readToday, reduceMotion, rise]);

  const step = 180 / 7;
  // The sun sits just above the horizon; it starts hidden below it.
  const sunTravel = SUN_R * 2 + 48;
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [sunTravel, 0] });

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.wrap}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
        {week.map((state, i) => {
          // Oldest day on the left (180°), today on the right (0°).
          const from = 180 - i * step - GAP_DEG / 2;
          const to = 180 - (i + 1) * step + GAP_DEG / 2;
          const isToday = i === week.length - 1;
          const label = polar(180 - (i + 0.5) * step, R + STROKE + 6);
          return (
            <G key={i}>
              <Path d={arcPath(from, to)} stroke={state === 'read' ? colors.dawn : colors.dusk} strokeWidth={STROKE} fill="none" />
              {state === 'freeze' ? <Path d={arcPath(from, to)} stroke={colors.dawn} strokeWidth={4} fill="none" /> : null}
              {isToday && state !== 'read' ? (
                <Path d={arcPath(from, to)} stroke={colors.tide} strokeWidth={2} strokeDasharray="3 4" fill="none" />
              ) : null}
              <SvgText
                x={label.x}
                y={label.y + 4}
                fontSize={11}
                fontFamily={FONTS.uiMedium}
                fontWeight={isToday ? '700' : '400'}
                fill={isToday ? colors.ink : colors.mist}
                textAnchor="middle"
              >
                {dayLabels[i] ?? ''}
              </SvgText>
            </G>
          );
        })}
        <Line x1={16} y1={CY} x2={W - 16} y2={CY} stroke={colors.rule} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      {/* The sun: clipped by the horizon, so it rises from behind it. */}
      <View pointerEvents="none" style={[styles.sunClip, { height: `${(CY / H) * 100}%` }]}>
        <Animated.View style={[styles.sun, { transform: [{ translateY }] }]}>
          <Svg width={SUN_R * 2 + 32} height={SUN_R * 2 + 32}>
            <Circle cx={SUN_R + 16} cy={SUN_R + 16} r={SUN_R + 14} fill={colors.dawnSoft} />
            <Circle cx={SUN_R + 16} cy={SUN_R + 16} r={SUN_R} fill={colors.dawn} />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: W, aspectRatio: W / H, alignSelf: 'center' },
  sunClip: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  sun: { marginBottom: 4 },
});
