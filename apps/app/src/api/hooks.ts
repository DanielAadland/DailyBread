import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { BookId, TranslationId } from '@bible-app/bible';
import { useBackend } from './BackendProvider';
import type { Backend, HighlightColor, NotificationPrefs, ProfilePatch } from './types';

/** Query keys in one place so mutations invalidate exactly what changed. */
export const keys = {
  profile: ['profile'] as const,
  prefs: ['notification-prefs'] as const,
  today: ['today'] as const,
  plans: ['plans'] as const,
  plan: (slug: string) => ['plan', slug] as const,
  enrolments: ['enrolments'] as const,
  badges: ['badges'] as const,
  annotations: (book: string, chapter: number) => ['annotations', book, chapter] as const,
  saved: ['saved'] as const,
  search: (translation: string, query: string) => ['search', translation, query] as const,
};

const afterReading = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: keys.today }),
    qc.invalidateQueries({ queryKey: keys.enrolments }),
    qc.invalidateQueries({ queryKey: keys.badges }),
  ]);

export function useProfile() {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.profile, queryFn: () => backend.getProfile(), enabled: !!session });
}

export function useUpdateProfile() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => backend.updateProfile(patch),
    onSuccess: (profile) => {
      qc.setQueryData(keys.profile, profile);
      return qc.invalidateQueries({ queryKey: keys.today });
    },
  });
}

export function useNotificationPrefs() {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.prefs, queryFn: () => backend.getNotificationPrefs(), enabled: !!session });
}

export function useUpdateNotificationPrefs() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) => backend.updateNotificationPrefs(patch),
    onSuccess: (prefs) => qc.setQueryData(keys.prefs, prefs),
  });
}

export function useToday() {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.today, queryFn: () => backend.getToday(), enabled: !!session });
}

export function usePlans() {
  const { backend } = useBackend();
  return useQuery({ queryKey: keys.plans, queryFn: () => backend.listPlans(), staleTime: 60 * 60 * 1000 });
}

export function usePlan(slug: string) {
  const { backend } = useBackend();
  return useQuery({ queryKey: keys.plan(slug), queryFn: () => backend.getPlan(slug), staleTime: 60 * 60 * 1000 });
}

export function useEnrolments() {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.enrolments, queryFn: () => backend.listEnrolments(), enabled: !!session });
}

export function useStartPlan() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (planId: string) => backend.startPlan(planId), onSuccess: () => afterReading(qc) });
}

export function useSetPlanStatus() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { enrolmentId: string; action: 'pause' | 'resume' | 'restart' }) => backend.setPlanStatus(v.enrolmentId, v.action),
    onSuccess: () => afterReading(qc),
  });
}

export function useCompleteReading() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { enrolmentId: string; day: number; reflection?: string }) => backend.completeReading(v.enrolmentId, v.day, v.reflection),
    onSuccess: () => afterReading(qc),
  });
}

export function useLogFreeReading() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { book: BookId; chapter: number }) => backend.logFreeReading(v.book, v.chapter),
    onSuccess: () => afterReading(qc),
  });
}

export function useBadges() {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.badges, queryFn: () => backend.listBadges(), enabled: !!session });
}

export function useAnnotations(book: BookId, chapter: number) {
  const { backend, session } = useBackend();
  return useQuery({
    queryKey: keys.annotations(book, chapter),
    queryFn: () => backend.getChapterAnnotations(book, chapter),
    enabled: !!session,
  });
}

export function useSetHighlight(book: BookId, chapter: number) {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { verses: number[]; color: HighlightColor | null }) => backend.setHighlight(book, chapter, v.verses, v.color),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.annotations(book, chapter) }),
  });
}

export function useToggleBookmark(book: BookId, chapter: number) {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (verse: number | null) => backend.toggleBookmark(book, chapter, verse),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: keys.annotations(book, chapter) }), qc.invalidateQueries({ queryKey: keys.saved })]),
  });
}

export function useSaveNote() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<Backend['saveNote']>[0]) => backend.saveNote(input),
    onSuccess: (note) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.annotations(note.book, note.chapter) }),
        qc.invalidateQueries({ queryKey: keys.saved }),
      ]),
  });
}

export function useDeleteNote() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; book: BookId; chapter: number }) => backend.deleteNote(v.id),
    onSuccess: (_r, v) =>
      Promise.all([qc.invalidateQueries({ queryKey: keys.annotations(v.book, v.chapter) }), qc.invalidateQueries({ queryKey: keys.saved })]),
  });
}

export function useSaved() {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.saved, queryFn: () => backend.listSaved(), enabled: !!session });
}

export function useSearch(translation: TranslationId, query: string) {
  const { backend } = useBackend();
  const search = backend.search;
  return useQuery({
    queryKey: keys.search(translation, query),
    queryFn: () => search!(translation, query),
    enabled: !!search && query.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
