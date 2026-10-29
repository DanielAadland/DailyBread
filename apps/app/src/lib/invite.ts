import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { config } from '../config';

const PENDING_KEY = 'dailybread.pending-invite';

/** The link that opens a group's invite page. On the web it points at the site the person is using. */
export function inviteUrl(code: string): string {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : config.siteUrl;
  return `${origin}/join/${code}`;
}

/** Remember an invite opened while signed out, so it can be offered again after sign-up. */
export async function savePendingInvite(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, code);
  } catch {
    // Storage can be unavailable (private mode); the invite link still works when opened again.
  }
}

export async function takePendingInvite(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(PENDING_KEY);
    if (code) await AsyncStorage.removeItem(PENDING_KEY);
    return code;
  } catch {
    return null;
  }
}
