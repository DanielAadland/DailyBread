import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { BookId, TranslationId } from '@bible-app/bible';
import { useBackend } from './BackendProvider';
import type {
  Backend,
  FeedPage,
  HighlightColor,
  ModerationAction,
  NewPost,
  NotificationPrefs,
  Post,
  ProfilePatch,
  ReactionKind,
  RealtimeTopic,
  ReportReason,
  ReportTarget,
} from './types';

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
  feed: ['feed'] as const,
  userPosts: (userId: string) => ['user-posts', userId] as const,
  post: (id: string) => ['post', id] as const,
  comments: (postId: string) => ['comments', postId] as const,
  people: (query: string) => ['people', query] as const,
  publicProfile: (ref: string) => ['public-profile', ref] as const,
  connections: (kind: string) => ['connections', kind] as const,
  blocked: ['blocked'] as const,
  notifications: ['notifications'] as const,
  adminReports: (status: string) => ['admin-reports', status] as const,
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


// Social ------------------------------------------------------------------------------------

const nextBefore = (last: FeedPage) => (last.caughtUp ? undefined : last.items[last.items.length - 1]?.createdAt);

/** The feed in pages of 20. It ends after 14 days ("You're all caught up"). */
export function useFeed() {
  const { backend, session } = useBackend();
  return useInfiniteQuery({
    queryKey: keys.feed,
    queryFn: ({ pageParam }) => backend.getFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextBefore,
    enabled: !!session,
  });
}

export function useUserPosts(userId: string | undefined) {
  const { backend, session } = useBackend();
  return useInfiniteQuery({
    queryKey: keys.userPosts(userId ?? ''),
    queryFn: ({ pageParam }) => backend.getUserPosts(userId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextBefore,
    enabled: !!session && !!userId,
  });
}

export function usePost(id: string) {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.post(id), queryFn: () => backend.getPost(id), enabled: !!session });
}

export function useComments(postId: string) {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.comments(postId), queryFn: () => backend.listComments(postId), enabled: !!session });
}

/** Refetch the given queries whenever the server reports a change on the topic. */
export function useRealtime(topic: RealtimeTopic | null, queryKeys: ReadonlyArray<readonly unknown[]>) {
  const { backend } = useBackend();
  const qc = useQueryClient();
  const id = topic ? (topic.kind === 'post' ? `post:${topic.postId}` : 'notifications') : null;
  useEffect(() => {
    if (!topic) return;
    return backend.subscribe(topic, () => {
      for (const key of queryKeys) qc.invalidateQueries({ queryKey: key });
    });
    // The topic id captures everything that matters about `topic` and `queryKeys`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, qc, id]);
}

/** Put an updated post into every cache that shows it. */
function replacePost(qc: QueryClient, post: Post) {
  qc.setQueryData(keys.post(post.id), post);
  const update = (data: InfiniteData<FeedPage> | undefined) =>
    data && { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === post.id ? post : i)) })) };
  qc.setQueriesData<InfiniteData<FeedPage>>({ queryKey: keys.feed }, update);
  qc.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ['user-posts'] }, update);
}

const afterPostsChanged = (qc: QueryClient) =>
  Promise.all([qc.invalidateQueries({ queryKey: keys.feed }), qc.invalidateQueries({ queryKey: ['user-posts'] })]);

export function useCreatePost() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: NewPost) => backend.createPost(input), onSuccess: () => afterPostsChanged(qc) });
}

export function useDeletePost() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => backend.deletePost(id), onSuccess: () => afterPostsChanged(qc) });
}

export function useSetPostHidden() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; hidden: boolean }) => backend.setPostHidden(v.id, v.hidden),
    onSuccess: () => afterPostsChanged(qc),
  });
}

export function useReact() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; kind: ReactionKind | null }) => backend.react(v.postId, v.kind),
    onSuccess: (post) => replacePost(qc, post),
  });
}

export function useAddComment(postId: string) {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => backend.addComment(postId, body),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: keys.comments(postId) }), qc.invalidateQueries({ queryKey: keys.post(postId) }), afterPostsChanged(qc)]),
  });
}

export function useDeleteComment(postId: string) {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backend.deleteComment(id),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: keys.comments(postId) }), qc.invalidateQueries({ queryKey: keys.post(postId) }), afterPostsChanged(qc)]),
  });
}

export function useFindPeople(query: string) {
  const { backend, session } = useBackend();
  const q = query.trim();
  return useQuery({ queryKey: keys.people(q), queryFn: () => backend.findPeople(q), enabled: !!session && q.length >= 2 });
}

export function usePublicProfile(ref: { id?: string; username?: string }) {
  const { backend, session } = useBackend();
  const key = ref.id ?? `@${ref.username ?? ''}`;
  return useQuery({
    queryKey: keys.publicProfile(key),
    queryFn: () => backend.getPublicProfile(ref),
    enabled: !!session && !!(ref.id || ref.username),
  });
}

const afterRelationshipChanged = (qc: QueryClient) =>
  Promise.all(
    [['public-profile'], ['people'], ['connections'], keys.blocked, keys.feed, ['user-posts'], keys.notifications].map((queryKey) =>
      qc.invalidateQueries({ queryKey }),
    ),
  );

function useRelationshipMutation<V>(fn: (backend: Backend, v: V) => Promise<unknown>) {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: V) => fn(backend, v), onSuccess: () => afterRelationshipChanged(qc) });
}

export const useFollow = () => useRelationshipMutation<string>((b, id) => b.follow(id));
export const useUnfollow = () => useRelationshipMutation<string>((b, id) => b.unfollow(id));
export const useRespondToFollow = () =>
  useRelationshipMutation<{ userId: string; accept: boolean }>((b, v) => b.respondToFollow(v.userId, v.accept));
export const useRemoveFollower = () => useRelationshipMutation<string>((b, id) => b.removeFollower(id));
export const useBlock = () => useRelationshipMutation<string>((b, id) => b.block(id));
export const useUnblock = () => useRelationshipMutation<string>((b, id) => b.unblock(id));
export const useSetMuted = () => useRelationshipMutation<{ userId: string; muted: boolean }>((b, v) => b.setMuted(v.userId, v.muted));

export function useConnections(kind: 'followers' | 'following' | 'requests') {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.connections(kind), queryFn: () => backend.listConnections(kind), enabled: !!session });
}

export function useBlocked() {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.blocked, queryFn: () => backend.listBlocked(), enabled: !!session });
}

export function useReport() {
  const { backend } = useBackend();
  return useMutation({
    mutationFn: (v: { target: ReportTarget; targetId: string; reason: ReportReason; details: string }) =>
      backend.report(v.target, v.targetId, v.reason, v.details),
  });
}

export function useNotifications() {
  const { backend, session } = useBackend();
  const query = useQuery({ queryKey: keys.notifications, queryFn: () => backend.listNotifications(), enabled: !!session });
  useRealtime(session ? { kind: 'notifications' } : null, [keys.notifications]);
  return query;
}

export function useMarkNotificationsRead() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => backend.markNotificationsRead(), onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }) });
}

export function useAdminReports(status: 'open' | 'actioned' | 'dismissed') {
  const { backend, session } = useBackend();
  return useQuery({ queryKey: keys.adminReports(status), queryFn: () => backend.adminReports(status), enabled: !!session });
}

export function useAdminResolve() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { target: ReportTarget; targetId: string; action: ModerationAction; note?: string }) =>
      backend.adminResolve(v.target, v.targetId, v.action, v.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  });
}

export function useAdminUnsuspend() {
  const { backend } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => backend.adminUnsuspend(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  });
}
