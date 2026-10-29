import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { keys, useAddComment, useComments, useDeleteComment, usePost, useRealtime } from '../../../../api/hooks';
import type { Comment } from '../../../../api/types';
import { language } from '../../../../i18n';
import { relativeTime } from '../../../../lib/time';
import { SPACE } from '../../../../theme/tokens';
import { ActionSheet } from '../../../../ui/ActionSheet';
import { Avatar } from '../../../../ui/Avatar';
import { Button, IconButton } from '../../../../ui/Button';
import { Divider, ErrorState, errorMessage, Loading, Notice } from '../../../../ui/misc';
import { PostCard } from '../../../../ui/PostCard';
import { ReportDialog } from '../../../../ui/ReportDialog';
import { Screen } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Text';
import { TextField } from '../../../../ui/TextField';

/** A post with its comments. New comments and reactions appear live. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const post = usePost(id);
  const comments = useComments(id);
  const add = useAddComment(id);
  const [body, setBody] = useState('');
  useRealtime({ kind: 'post', postId: id }, [keys.comments(id), keys.post(id)]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/feed'));

  return (
    <Screen>
      <Stack.Screen options={{ title: t('post.title') }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('feed.title')} icon="chevron-back" variant="quiet" onPress={back} />
      </View>
      {post.isPending ? (
        <Loading />
      ) : post.isError ? (
        <ErrorState error={post.error} onRetry={() => post.refetch()} />
      ) : (
        <>
          <PostCard post={post.data} detailed />
          <Divider />
          <Txt variant="h3">{t('post.commentsTitle', { count: comments.data?.length ?? post.data.commentCount })}</Txt>
          {comments.isPending ? (
            <Loading />
          ) : comments.isError ? (
            <ErrorState error={comments.error} onRetry={() => comments.refetch()} />
          ) : comments.data.length === 0 ? (
            <Txt tone="mist">{t('post.noComments')}</Txt>
          ) : (
            <View style={{ gap: SPACE.md }}>
              {comments.data.map((c) => (
                <CommentRow key={c.id} comment={c} postId={id} />
              ))}
            </View>
          )}
          <View style={{ gap: SPACE.sm }}>
            <TextField label={t('post.addComment')} value={body} onChangeText={setBody} multiline maxLength={1000} />
            {add.error ? <Notice tone="warning">{errorMessage(t, add.error)}</Notice> : null}
            <View style={{ alignItems: 'flex-end' }}>
              <Button
                label={t('post.sendComment')}
                icon="send"
                disabled={body.trim().length === 0}
                loading={add.isPending}
                onPress={() => add.mutate(body, { onSuccess: () => setBody('') })}
              />
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

function CommentRow({ comment, postId }: { comment: Comment; postId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const remove = useDeleteComment(postId);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const name = comment.author.displayName || comment.author.username || t('profile.noName');

  const actions = [
    ...(comment.canRemove ? [{ label: t('post.deleteComment'), icon: 'trash-outline' as const, danger: true, onPress: () => remove.mutate(comment.id) }] : []),
    ...(!comment.isMine ? [{ label: t('post.reportComment'), icon: 'flag-outline' as const, onPress: () => setReporting(true) }] : []),
  ];

  return (
    <View style={styles.comment}>
      <Pressable
        onPress={() => comment.author.username && router.push(`/feed/u/${comment.author.username}`)}
        accessibilityRole="link"
        accessibilityLabel={t('post.openProfile', { name })}
      >
        <Avatar person={comment.author} size={32} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="small" tone="mist">
          {`${name}, ${relativeTime(comment.createdAt, language)}`}
        </Txt>
        <Txt>{comment.body}</Txt>
      </View>
      {actions.length > 0 ? <IconButton icon="ellipsis-horizontal" label={t('post.commentActions', { name })} onPress={() => setMenu(true)} size={18} /> : null}
      <ActionSheet title={t('post.commentActions', { name })} actions={actions} visible={menu} onClose={() => setMenu(false)} />
      <ReportDialog
        target={reporting ? { type: 'comment', id: comment.id, authorId: comment.author.id, authorName: name } : null}
        onClose={() => setReporting(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: SPACE.sm + 4, alignItems: 'flex-start' },
});
