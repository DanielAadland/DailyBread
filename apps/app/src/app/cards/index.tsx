import Ionicons from '@expo/vector-icons/Ionicons';
import { cardText, type CardBackground } from '@bible-app/core';
import { fromKey } from '@bible-app/bible';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CARD_ART, CARD_TEXT_COLORS } from '../../cards/backgrounds';
import { CardArtSvg } from '../../cards/CardArtSvg';
import { canMakeImages, imageFileName, renderCardImage, saveImage } from '../../cards/exportImage';
import { useCardProgress, useDailyCards, useToday, type DailyCard } from '../../cards/useDailyCards';
import { CARD_FONT_FAMILY, cardTypeMetrics } from '../../cards/VerseCard';
import { language } from '../../i18n';
import { relativeTime } from '../../lib/time';
import { useTheme } from '../../theme/ThemeProvider';
import { FONTS, RADIUS, SPACE } from '../../theme/tokens';
import { Button } from '../../ui/Button';
import { ErrorState, Loading } from '../../ui/misc';
import { Txt } from '../../ui/Text';

/**
 * Today's verse cards, full screen, one per page (swipe or arrow keys). A small set,
 * then "You're done for today": nothing more to scroll.
 */
export default function CardsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const { cards, isPending, error } = useDailyCards();
  const { seen, loaded, markSeen } = useCardProgress(today);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const total = cards.length;

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), [router]);
  const go = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(total, to));
      scroll.current?.scrollTo({ y: next * height, animated: true });
      setIndex(next);
    },
    [height, total],
  );

  // Pick up where they left off today (or at the end, if they've seen them all).
  useEffect(() => {
    if (ready || !loaded || isPending || total === 0) return;
    const start = Math.min(seen, total);
    setIndex(start);
    setReady(true);
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: start * height, animated: false }));
  }, [ready, loaded, isPending, total, seen, height]);

  useEffect(() => {
    if (ready) markSeen(Math.min(index + 1, total));
  }, [ready, index, total, markSeen]);

  // Keyboard: arrows and Page Up/Down move between cards; Escape closes.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, close]);

  if (isPending || !loaded) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, justifyContent: 'center' }]}>
        <Loading label={t('cards.loading')} />
      </View>
    );
  }
  if (error && total === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, justifyContent: 'center' }]}>
        <ErrorState error={error} />
        <Button label={t('common.close')} variant="quiet" onPress={close} />
      </View>
    );
  }

  const current = cards[index];
  const tone = current ? CARD_ART[current.style.background].text : CARD_ART.mist.text;
  const ink = CARD_TEXT_COLORS[tone];

  return (
    <View style={styles.fill}>
      <ScrollView
        ref={scroll}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.y / height))}
        accessibilityLabel={t('cards.title')}
      >
        {cards.map((card, i) => (
          <CardPage key={card.key} card={card} height={height} width={width} insets={insets} isLast={i === total - 1} onNext={() => go(i + 1)} />
        ))}
        <DonePage height={height} width={width} insets={insets} onAgain={() => go(0)} onClose={close} />
      </ScrollView>

      <View style={[styles.top, { paddingTop: insets.top + SPACE.sm }]} pointerEvents="box-none">
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={(s) => [styles.round, { backgroundColor: tone === 'light' ? 'rgba(255,255,255,0.16)' : 'rgba(28,43,58,0.08)' }, (s as { focused?: boolean }).focused && styles.focus]}
        >
          <Ionicons name="close" size={22} color={ink.verse} />
        </Pressable>
        <View style={styles.ticks} accessible accessibilityLabel={t('cards.progress', { current: Math.min(index + 1, total), total })}>
          {cards.map((c, i) => (
            <View key={c.key} style={[styles.tick, { backgroundColor: ink.verse, opacity: i <= index ? 0.9 : 0.25 }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function CardAction({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  tone: 'light' | 'dark';
  onPress: () => void;
}) {
  const ink = CARD_TEXT_COLORS[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(s) => [
        styles.action,
        // A tinted backing keeps the label readable wherever the sun or hills fall behind it.
        { backgroundColor: tone === 'light' ? 'rgba(14,20,32,0.38)' : 'rgba(255,255,255,0.62)', borderColor: tone === 'light' ? 'rgba(255,255,255,0.3)' : 'rgba(28,43,58,0.16)' },
        (s as { focused?: boolean }).focused && styles.focus,
      ]}
    >
      <Ionicons name={icon} size={18} color={ink.verse} />
      <Txt variant="small" style={{ color: ink.verse, fontFamily: FONTS.uiMedium }}>
        {label}
      </Txt>
    </Pressable>
  );
}

function CardPage({
  card,
  height,
  width,
  insets,
  isLast,
  onNext,
}: {
  card: DailyCard;
  height: number;
  width: number;
  insets: { top: number; bottom: number };
  isLast: boolean;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const tone = CARD_ART[card.style.background].text;
  const ink = CARD_TEXT_COLORS[tone];
  const verse = cardText(card.text);
  const m = cardTypeMetrics(Math.min(width, 560) * 1.25, verse, card.style.font);
  const range = fromKey(card.passage);
  const authorName = card.author ? card.author.displayName || card.author.username || '' : '';

  return (
    <View style={{ height, width }} role="article" aria-label={t('cards.cardLabel', { reference: card.reference })}>
      <PageArt background={card.style.background as CardBackground} width={width} height={height} />
      <View style={[styles.page, { paddingTop: insets.top + 76, paddingBottom: insets.bottom + SPACE.md }]}>
        <View style={{ gap: SPACE.md }}>
          {card.author ? (
            <Txt variant="small" style={{ color: ink.soft, fontFamily: FONTS.uiMedium }}>
              {t('cards.fromFriend', { name: authorName, when: relativeTime(card.post?.createdAt ?? '', language) })}
            </Txt>
          ) : null}
          <Txt style={{ fontFamily: CARD_FONT_FAMILY[card.style.font], fontSize: m.size, lineHeight: m.lineHeight, color: ink.verse }}>{verse}</Txt>
          <Txt style={{ fontFamily: FONTS.uiMedium, fontSize: 15, color: ink.soft }}>{card.reference}</Txt>
          {card.words ? (
            <Txt style={{ fontFamily: FONTS.ui, fontSize: 17, lineHeight: 26, color: ink.soft, marginTop: SPACE.sm, maxWidth: 480 }}>{card.words}</Txt>
          ) : null}
        </View>

        <View style={{ gap: SPACE.md }}>
          <View style={styles.actions}>
            <CardAction
              icon="color-palette-outline"
              label={t('cards.makeYourOwn')}
              tone={tone}
              onPress={() => router.push(`/cards/new?passage=${encodeURIComponent(card.passage)}&bg=${card.style.background}`)}
            />
            {canMakeImages ? (
              <CardAction
                icon={saving ? 'hourglass-outline' : 'download-outline'}
                label={t('cards.saveImage')}
                tone={tone}
                onPress={async () => {
                  setSaving(true);
                  try {
                    const blob = await renderCardImage({ style: card.style, text: card.text, reference: card.reference, wordmark: t('app.name') });
                    saveImage(blob, imageFileName(card.reference));
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            ) : null}
            {range ? (
              <CardAction
                icon="book-outline"
                label={t('cards.readInContext')}
                tone={tone}
                onPress={() => router.push(`/read/${range.book}/${range.startChapter}${range.startVerse ? `?verse=${range.startVerse}` : ''}`)}
              />
            ) : null}
          </View>
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? t('cards.finish') : t('cards.next')}
            style={(s) => [styles.next, (s as { focused?: boolean }).focused && styles.focus]}
          >
            <Ionicons name="chevron-down" size={26} color={ink.soft} />
            <Txt variant="small" style={{ color: ink.soft }}>
              {isLast ? t('cards.finish') : t('cards.swipeHint')}
            </Txt>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PageArt({ background, width, height }: { background: CardBackground; width: number; height: number }) {
  return <CardArtSvg background={background} cover aspect={width / height} />;
}

function DonePage({ height, width, insets, onAgain, onClose }: { height: number; width: number; insets: { top: number; bottom: number }; onAgain: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const ink = CARD_TEXT_COLORS.dark;
  return (
    <View style={{ height }} role="region" aria-label={t('cards.doneTitle')}>
      <PageArt background="mist" width={width} height={height} />
      <View style={[styles.page, styles.done, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + SPACE.xl }]}>
        <View style={{ gap: SPACE.md, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={44} color="#B07314" />
          <Txt variant="h1" align="center" style={{ color: ink.verse }}>
            {t('cards.doneTitle')}
          </Txt>
          <Txt align="center" style={{ color: ink.soft, maxWidth: 420 }}>
            {t('cards.doneBody')}
          </Txt>
        </View>
        <View style={{ gap: SPACE.sm, alignItems: 'center' }}>
          <Button label={t('cards.backToToday')} onPress={onClose} />
          <Button label={t('cards.makeYourOwn')} variant="secondary" href="/cards/new" />
          <Button label={t('cards.seeAgain')} variant="quiet" onPress={onAgain} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: SPACE.lg, justifyContent: 'space-between' },
  done: { justifyContent: 'center', gap: SPACE.xl },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.md },
  round: { width: 44, height: 44, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  ticks: { flex: 1, flexDirection: 'row', gap: 4, maxWidth: 560 },
  tick: { flex: 1, height: 3, borderRadius: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: SPACE.sm + 6, borderRadius: RADIUS.pill, borderWidth: 1 },
  next: { alignSelf: 'center', alignItems: 'center', minHeight: 44, minWidth: 44, justifyContent: 'center', borderRadius: RADIUS.control, paddingHorizontal: SPACE.sm },
  focus: { outlineColor: '#2E5E8C', outlineWidth: 2, outlineStyle: 'solid' },
});
