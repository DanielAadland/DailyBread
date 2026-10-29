/**
 * Public configuration, read from EXPO_PUBLIC_* variables at build time (see .env.example).
 * Only values that are safe in the browser belong here.
 */
const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Where /bible and /demo files are served. Empty = same origin as the web app. */
  assetBaseUrl: (process.env.EXPO_PUBLIC_ASSET_BASE_URL ?? '').replace(/\/$/, ''),
  vapidPublicKey: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '',
};

export const config = {
  ...env,
  /** Without Supabase settings the app runs in demo mode: everything works, data stays on this device. */
  demoMode: !env.supabaseUrl || !env.supabaseAnonKey,
  bibleBaseUrl: `${env.assetBaseUrl}/bible`,
};
