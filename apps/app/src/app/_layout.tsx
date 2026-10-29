import '../polyfills';
import '../i18n';
import { Figtree_400Regular, Figtree_500Medium, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { Literata_400Regular, Literata_400Regular_Italic, Literata_500Medium, Literata_700Bold } from '@expo-google-fonts/literata';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BackendProvider, useBackend } from '../api/BackendProvider';
import { useProfile } from '../api/hooks';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { ErrorState, Loading } from '../ui/misc';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_700Bold,
    Literata_400Regular,
    Literata_400Regular_Italic,
    Literata_500Medium,
    Literata_700Bold,
  });
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 }, mutations: { retry: 0 } } }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <BackendProvider>
          <ThemeProvider>{fontsLoaded ? <RootNavigator /> : <Splash />}</ThemeProvider>
        </BackendProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Splash() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}

/**
 * Who sees what: signed out → (auth); signed in but new → onboarding; otherwise the app.
 * Guards keep every route registered and redirect when a guard fails.
 */
function RootNavigator() {
  const { session, ready } = useBackend();
  const { colors, name } = useTheme();
  const profile = useProfile();

  if (!ready || (session && profile.isPending)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  if (session && profile.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </View>
    );
  }

  // Each area redirects on its own (see useAccess): signed out → sign-in, new user → onboarding, otherwise the app.
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="legal/[page]" />
      </Stack>
    </>
  );
}
