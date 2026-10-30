import { Redirect, Stack } from 'expo-router';
import { HOME_FOR, useAccess } from '../../api/access';
import { useTheme } from '../../theme/ThemeProvider';

/** Verse cards open full screen, outside the tabs. */
export default function CardsLayout() {
  const access = useAccess();
  const { colors } = useTheme();
  if (access !== 'ready') return <Redirect href={HOME_FOR[access]} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
