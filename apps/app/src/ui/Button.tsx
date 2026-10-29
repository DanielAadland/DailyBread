import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { FONTS, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { Txt } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Navigate here when pressed (the button is announced as a link). */
  href?: Href;
}

export function Button({ label, variant = 'primary', icon, loading, disabled, fullWidth, style, href, onPress, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const inactive = disabled || loading;
  const palette = {
    primary: { bg: colors.tide, fg: colors.onTide, border: colors.tide },
    secondary: { bg: 'transparent', fg: colors.tide, border: colors.rule },
    quiet: { bg: 'transparent', fg: colors.tide, border: 'transparent' },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.rule },
  }[variant];

  return (
    <Pressable
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={href ? () => router.push(href) : onPress}
      style={(state) => {
        const { pressed } = state;
        const focused = (state as { focused?: boolean }).focused;
        const hovered = (state as { hovered?: boolean }).hovered;
        return [
          styles.base,
          variant === 'quiet' && styles.quiet,
          fullWidth && styles.full,
          { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
          hovered && !inactive && variant !== 'primary' && { backgroundColor: colors.tideSoft },
          focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 2 },
          style,
        ];
      }}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={18} color={palette.fg} />
        ) : null}
        <Txt style={[styles.label, { color: palette.fg }]}>{label}</Txt>
      </View>
    </Pressable>
  );
}

interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: IconName;
  label: string;
  active?: boolean;
  size?: number;
}

/** A square icon control with an accessible name (shown as a tooltip on web). */
export function IconButton({ icon, label, active, size = 22, ...rest }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      {...({ title: label } as object)}
      hitSlop={6}
      style={(state) => {
        const focused = (state as { focused?: boolean }).focused;
        const hovered = (state as { hovered?: boolean }).hovered;
        return [
          styles.icon,
          (hovered || active) && { backgroundColor: colors.tideSoft },
          state.pressed && { opacity: 0.7 },
          focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
        ];
      }}
      {...rest}
    >
      <Ionicons name={icon} size={size} color={active ? colors.tide : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 4,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quiet: { paddingHorizontal: SPACE.sm, minHeight: 44 },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  label: { fontFamily: FONTS.uiMedium, fontSize: TYPE.body },
  icon: { width: 44, height: 44, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
});
