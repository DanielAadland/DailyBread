import Ionicons from '@expo/vector-icons/Ionicons';
import { TRANSLATIONS, fromKey } from '@bible-app/bible';
import { useRouter } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useBlock, useDeletePost, useReact, useSetMuted, useSetPostHidden } from '../api/hooks';
import { REACTION_KINDS, type Post, type ReactionKind } from '../api/types';
import { useBookNames } from '../bible/useBible';
import { language } from '../i18n';
import { relativeTime } from '../lib/time';
import { useTheme } from '../theme/ThemeProvider';
import { FONTS, RADIUS, SPACE } from '../theme/tokens';
import { ActionSheet, type SheetAction } from './ActionSheet';
import { Avatar } from './Avatar';
import { Button, IconButton } from './Button';
import { ReportDialog } from './ReportDialog';
import { Txt } from './Text';

const REACTION_ICONS: Record<ReactionKind, ComponentProps<typeof Ionicons>['name']> = {
  amen: 'heart-outline',
  praying: 'hand-left-outline',
  encouraged: 'sunny-outline',
};
const REACTION_ICONS_ON: Record<ReactionKind, ComponentProps<typeof Ionicons>['name']> = {
  amen: 'heart',
  praying: 'hand-left',
  encouraged: 'sunny',
};

/** One post in the feed, a profile, or on its own page (`detailed`). */
export function PostCard({ post, detailed = false }: { post: Post; detailed?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { referenceFromKey } = useBookNames();
  const react = useReact();
  const deletePost = useDeletePost();
  const setHidden = useSetPostHidden();
  const mute = useSetMuted();
  const block = useBlock();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const name = post.author.displayName || post.author.username || t('profile.noName');
  const reference = post.passage ? referenceFromKey(post.passage) : null;
  const range = post.passage ? fromKey(post.passage) : null;
  const openAuthor = () => post.author.username && router.push(`/feed/u/${post.author.username}`);
  const openPost = () => router.push(`/feed/post/${post.id}`);

  const actions: SheetAction[] = post.isMine
    ? [
        ...(post.type === 'milestone'
          ? [{ label: post.hidden ? t('post.show') : t('post.hide'), icon: post.hidden ? ('eye-outline' as const) : ('eye-off-outline' as const), onPress: () => setHidden.mutate({ id: post.id, hidden: !post.hidden }) }]
          : []),
        { label: t('post.delete'), icon: 'trash-outline', danger: true, onPress: () => setConfirmDelete(true) },
      ]
    : [
        { label: t('post.report'), icon: 'flag-outline', onPress: () => setReporting(true) },
        { label: t('post.mute', { name }), icon: 'volume-mute-outline', onPress: () => mute.mutate({ userId: post.author.id, muted: true }) },
        { label: t('post.block', { name }), icon: 'ban-outline', danger: true, onPress: () => block.mutate(post.author.id) },
      ];

  return (
    <View style={styles.card} role="article" aria-label={t('post.label', { name, type: t(`post.types.${post.type}`) })}>
      <View style={styles.head}>
        <Pressable onPress={openAuthor} accessibilityRole="link" accessibilityLabel={t('post.openProfile', { name })} style={styles.author}>
          <Avatar person={post.author} />
          <View style={{ flex: 1 }}>
            <Txt variant="label" numberOfLines={1}>
              {name}
            </Txt>
            <Txt variant="small" tone="mist" numberOfLines={1}>
              {`${t(`post.types.${post.type}`)}, ${relativeTime(post.createdAt, language)}`}
            </Txt>
          </View>
        </Pressable>
        <IconButton icon="ellipsis-horizontal" label={t('post.more')} onPress={() => setMenu(true)} size={20} />
      </View>

      {post.hidden ? <Txt variant="small" tone="mist">{t('post.hiddenNote')}</Txt> : null}

      <Pressable onPress={detailed ? undefined : openPost} disabled={detailed} accessibilityRole={detailed ? undefined : 'link'} accessibilityLabel={detailed ? undefined : t('post.open')}>
        {post.type === 'verse' ? (
          <View style={[styles.verse, { borderLeftColor: colors.dawn }]}>
            <Txt style={{ fontFamily: FONTS.scripture, fontSize: 19, lineHeight: 30 }}>{post.verseText}</Txt>
            <Txt variant="small" tone="mist">
              {`${reference ?? ''}${post.translation ? ` ${TRANSLATIONS[post.translation].abbreviation}` : ''}`}
            </Txt>
          </View>
        ) : null}
        {post.type === 'reflection' && reference ? (
          <Txt variant="label" tone="tide" style={{ marginBottom: SPACE.xs }}>
            {reference}
          </Txt>
        ) : null}
        {post.body ? <Txt style={{ marginTop: post.type === 'verse' ? SPACE.sm : 0 }}>{post.body}</Txt> : null}
        {post.type === 'milestone' && post.milestone ? (
          <View style={styles.milestone}>
            <Ionicons name={post.milestone.kind === 'plan' ? 'flag' : 'ribbon'} size={24} color={colors.dawn} />
            <Txt variant="label" style={{ flex: 1 }}>
              {post.milestone.kind === 'plan'
                ? t('post.milestonePlan', { title: post.milestone.title })
                : t('post.milestoneBadge', { badge: t(`badges.${post.milestone.code}.name`) })}
            </Txt>
          </View>
        ) : null}
      </Pressable>

      {range && post.type !== 'prayer' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label={t('post.readPassage')}
            variant="quiet"
            icon="book-outline"
            href={`/read/${range.book}/${range.startChapter}${range.startVerse ? `?verse=${range.startVerse}` : ''}`}
          />
        </View>
      ) : null}

      <View style={styles.footer}>
        {REACTION_KINDS.map((kind) => {
          const mine = post.myReaction === kind;
          const count = post.reactions[kind];
          return (
            <Pressable
              key={kind}
              accessibilityRole="button"
              aria-pressed={mine}
              accessibilityLabel={t('post.reactionLabel', { reaction: t(`post.reactions.${kind}`), count })}
              onPress={() => react.mutate({ postId: post.id, kind: mine ? null : kind })}
              style={(s) => [
                styles.reaction,
                { borderColor: mine ? colors.tide : colors.rule, backgroundColor: mine ? colors.tideSoft : 'transparent' },
                (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
              ]}
            >
              <Ionicons name={mine ? REACTION_ICONS_ON[kind] : REACTION_ICONS[kind]} size={16} color={mine ? colors.tide : colors.mist} />
              <Txt variant="small" style={{ color: mine ? colors.tide : colors.ink }}>
                {count > 0 ? `${t(`post.reactions.${kind}`)} ${count}` : t(`post.reactions.${kind}`)}
              </Txt>
            </Pressable>
          );
        })}
        {!detailed ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('post.commentsLabel', { count: post.commentCount })}
            onPress={openPost}
            style={(s) => [styles.reaction, { borderColor: 'transparent' }, (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' }]}
          >
            <Ionicons name="chatbubble-outline" size={16} color={colors.mist} />
            <Txt variant="small">{post.commentCount > 0 ? String(post.commentCount) : t('post.comment')}</Txt>
          </Pressable>
        ) : null}
      </View>

      {confirmDelete ? (
        <View style={[styles.confirm, { borderColor: colors.rule }]} role="alertdialog">
          <Txt>{t('post.deleteConfirm')}</Txt>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button label={t('post.delete')} variant="danger" loading={deletePost.isPending} onPress={() => deletePost.mutate(post.id, { onSuccess: () => detailed && router.back() })} />
            <Button label={t('common.cancel')} variant="quiet" onPress={() => setConfirmDelete(false)} />
          </View>
        </View>
      ) : null}

      <ActionSheet title={t('post.more')} actions={actions} visible={menu} onClose={() => setMenu(false)} />
      <ReportDialog target={reporting ? { type: 'post', id: post.id, authorId: post.author.id, authorName: name } : null} onClose={() => setReporting(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: SPACE.sm + 4, paddingVertical: SPACE.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + 4, borderRadius: RADIUS.control },
  verse: { borderLeftWidth: 3, paddingLeft: SPACE.md, gap: SPACE.xs },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 10, borderRadius: RADIUS.pill, borderWidth: 1 },
  confirm: { borderWidth: 1, borderRadius: RADIUS.control, padding: SPACE.md, gap: SPACE.sm },
});
