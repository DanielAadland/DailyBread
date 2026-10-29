import type { ComponentRef, ReactNode, Ref } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { LAYOUT, SPACE } from '../theme/tokens';

interface Props {
  children: ReactNode;
  /** Column width on wide screens. */
  width?: number;
  scroll?: boolean;
  footer?: ReactNode;
  contentStyle?: ViewStyle;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
}

/** Space above the column inside the scroll view (for scrolling to a measured position). */
export const SCREEN_TOP_PADDING = SPACE.lg;

/** Page wrapper: theme background, one centred column, comfortable padding. */
export function Screen({ children, width = LAYOUT.column, scroll = true, footer, contentStyle, scrollRef }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inner = <View style={[styles.column, { maxWidth: width }, contentStyle]}>{children}</View>;
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACE.lg, paddingBottom: SPACE.xxl + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { paddingTop: insets.top + SPACE.lg, flex: 1 }]}>{inner}</View>
      )}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: SPACE.md, alignItems: 'center' },
  column: { width: '100%', gap: SPACE.lg },
});
