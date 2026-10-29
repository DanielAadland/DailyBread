import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { config } from '../config';
import { createDemoBackend } from './demo-backend';
import { createSupabaseBackend } from './supabase-backend';
import type { Backend, Session } from './types';

const backend: Backend = config.demoMode
  ? createDemoBackend(config.assetBaseUrl)
  : createSupabaseBackend(config.supabaseUrl, config.supabaseAnonKey);

interface BackendContextValue {
  backend: Backend;
  session: Session | null;
  /** False until the stored session has been read. */
  ready: boolean;
}

const BackendContext = createContext<BackendContextValue | null>(null);

export function BackendProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    backend.auth
      .getSession()
      .then((s) => {
        if (active) setSession(s);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const unsubscribe = backend.auth.onChange((s) => setSession(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ backend, session, ready }), [session, ready]);
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendContextValue {
  const value = useContext(BackendContext);
  if (!value) throw new Error('useBackend must be used inside <BackendProvider>');
  return value;
}
