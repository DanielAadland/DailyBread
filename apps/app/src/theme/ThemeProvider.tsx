import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useBackend } from '../api/BackendProvider';
import { useProfile, useUpdateProfile } from '../api/hooks';
import { DEFAULT_READING_PREFS, PALETTES, type Palette, type ReadingPrefs, type ThemeName } from './tokens';

const STORAGE_KEY = 'daybread.reading-prefs';

interface ThemeContextValue {
  name: ThemeName;
  colors: Palette;
  prefs: ReadingPrefs;
  setPrefs: (patch: Partial<ReadingPrefs>) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Reading preferences (theme, font size, spacing) live on the device so they apply before sign-in,
 * and sync to the profile so they follow the user to other devices.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const { session } = useBackend();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const [prefs, setPrefsState] = useState<ReadingPrefs>(DEFAULT_READING_PREFS);
  const adoptedFromProfile = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPrefsState({ ...DEFAULT_READING_PREFS, ...(JSON.parse(raw) as Partial<ReadingPrefs>) });
      })
      .catch(() => undefined);
  }, []);

  // When a profile loads with saved preferences, use them (once per user).
  useEffect(() => {
    const data = profile.data;
    if (!data || adoptedFromProfile.current === data.id) return;
    adoptedFromProfile.current = data.id;
    if (Object.keys(data.readingPrefs).length > 0) {
      setPrefsState((p) => ({ ...p, ...data.readingPrefs }));
    }
  }, [profile.data]);

  const { mutate } = updateProfile;
  const setPrefs = useCallback(
    (patch: Partial<ReadingPrefs>) => {
      setPrefsState((current) => {
        const next = { ...current, ...patch };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
        if (session) mutate({ readingPrefs: next });
        return next;
      });
    },
    [session, mutate],
  );

  const name: ThemeName = prefs.theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : prefs.theme;
  const value = useMemo(() => ({ name, colors: PALETTES[name], prefs, setPrefs }), [name, prefs, setPrefs]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
