import { Redirect, Stack } from 'expo-router';
import { HOME_FOR, useAccess } from '../../api/access';
import { useTheme } from '../../theme/ThemeProvider';

export default function AuthLayout() {
  const { colors } = useTheme();
  const access = useAccess();
  if (access !== 'signed-out') return <Redirect href={HOME_FOR[access]} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
