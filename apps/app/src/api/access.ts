import { useBackend } from './BackendProvider';
import { useProfile } from './hooks';

export type Access = 'signed-out' | 'needs-onboarding' | 'ready';

/** Which area of the app this visitor belongs in. The root layout waits until this is known. */
export function useAccess(): Access {
  const { session } = useBackend();
  const profile = useProfile();
  if (!session) return 'signed-out';
  return profile.data?.onboarded ? 'ready' : 'needs-onboarding';
}

export const HOME_FOR: Record<Access, '/sign-in' | '/onboarding' | '/'> = {
  'signed-out': '/sign-in',
  'needs-onboarding': '/onboarding',
  ready: '/',
};
