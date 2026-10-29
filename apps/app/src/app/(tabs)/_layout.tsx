import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { HOME_FOR, useAccess } from '../../api/access';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBackend } from '../../api/BackendProvider';
import { useNotifications } from '../../api/hooks';
import { useTheme } from '../../theme/ThemeProvider';
import { FONTS, LAYOUT, RADIUS, SPACE } from '../../theme/tokens';
import { Logo } from '../../ui/Logo';
import { Txt } from '../../ui/Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Array<{ name: string; label: string; icon: IconName; iconActive: IconName }> = [
  { name: 'index', label: 'tabs.today', icon: 'sunny-outline', iconActive: 'sunny' },
  { name: 'read', label: 'tabs.read', icon: 'book-outline', iconActive: 'book' },
  { name: 'feed', label: 'tabs.feed', icon: 'people-outline', iconActive: 'people' },
  { name: 'plans', label: 'tabs.plans', icon: 'calendar-outline', iconActive: 'calendar' },
  { name: 'profile', label: 'tabs.profile', icon: 'person-outline', iconActive: 'person' },
];

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= LAYOUT.sidebarBreakpoint;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const access = useAccess();

  if (access !== 'ready') return <Redirect href={HOME_FOR[access]} />;

  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarPosition: wide ? 'left' : 'bottom', sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <TabBar state={props.state} navigateToTab={props.navigateToTab} wide={wide} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t(tab.label) }} />
      ))}
    </Tabs>
  );
}

interface TabBarProps {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  /** Expo Router 58 hands custom tab bars this instead of `navigation`. */
  navigateToTab: (routeKey: string) => void;
  wide: boolean;
}

function TabBar({ state, navigateToTab, wide }: TabBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { backend } = useBackend();
  const insets = useSafeAreaInsets();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).some((n) => !n.read);

  const items = state.routes.map((route, index) => {
    const tab = TABS.find((x) => x.name === route.name);
    if (!tab) return null;
    const focused = state.index === index;
    const onPress = () => navigateToTab(route.key);
    return (
      <Pressable
        key={route.key}
        role="tab"
        aria-selected={focused}
        accessibilityLabel={tab.name === 'feed' && unread ? t('tabs.feedUnread') : t(tab.label)}
        onPress={onPress}
        style={(s) => [
          wide ? styles.sideItem : styles.bottomItem,
          wide && focused && { backgroundColor: colors.tideSoft },
          (s as { hovered?: boolean }).hovered && !focused && { backgroundColor: colors.tideSoft },
          (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
        ]}
      >
        <View>
          <Ionicons name={focused ? tab.iconActive : tab.icon} size={wide ? 22 : 24} color={focused ? colors.tide : colors.mist} />
          {tab.name === 'feed' && unread ? <View style={[styles.dot, { backgroundColor: colors.dawn, borderColor: colors.surface }]} /> : null}
        </View>
        <Txt
          variant={wide ? 'label' : 'small'}
          style={{ color: focused ? colors.tide : colors.mist, fontFamily: focused ? FONTS.uiBold : FONTS.uiMedium }}
        >
          {t(tab.label)}
        </Txt>
      </Pressable>
    );
  });

  if (wide) {
    return (
      <View role="navigation" style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.rule }]}>
        <View style={{ paddingHorizontal: SPACE.sm, paddingBottom: SPACE.lg }}>
          <Logo name={t('app.name')} size={30} />
        </View>
        <View role="tablist" style={{ gap: SPACE.xs }}>
          {items}
        </View>
        {backend.kind === 'demo' ? (
          <Txt variant="small" tone="mist" style={styles.sideNote}>
            {t('demo.badge')}
          </Txt>
        ) : null}
      </View>
    );
  }

  return (
    <View
      role="navigation"
      style={[styles.bottom, { backgroundColor: colors.surface, borderTopColor: colors.rule, paddingBottom: Math.max(insets.bottom, SPACE.xs) }]}
    >
      <View role="tablist" style={styles.bottomRow}>
        {items}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  sidebar: { width: 240, paddingTop: SPACE.xl, paddingHorizontal: SPACE.md, borderRightWidth: 1, gap: SPACE.sm },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 48, paddingHorizontal: SPACE.md, borderRadius: RADIUS.control },
  sideNote: { marginTop: 'auto', paddingBottom: SPACE.lg, paddingHorizontal: SPACE.sm },
  bottom: { borderTopWidth: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-around', maxWidth: 560, width: '100%', alignSelf: 'center' },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56, paddingTop: SPACE.xs },
});
