import { cardText, cardTextSize, wordCount, type CardFont, type CardStyle } from '@bible-app/core';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { FONTS } from '../theme/tokens';
import { Txt } from '../ui/Text';
import { CARD_ART, CARD_TEXT_COLORS, CARD_TEXT_SCALE } from './backgrounds';
import { CardArtSvg } from './CardArtSvg';

export const CARD_FONT_FAMILY: Record<CardFont, string> = {
  serif: FONTS.scripture,
  serif_italic: FONTS.scriptureItalic,
  sans: FONTS.uiMedium,
};

/** Type size and spacing for a card of a given width (shared with the image export). */
export function cardTypeMetrics(width: number, text: string, font: CardFont) {
  const size = Math.round(width * CARD_TEXT_SCALE[cardTextSize(wordCount(text))] * (font === 'sans' ? 0.92 : 1));
  return { size, lineHeight: Math.round(size * (font === 'sans' ? 1.38 : 1.45)), refSize: Math.max(12, Math.round(width * 0.032)), pad: Math.round(width * 0.09) };
}

/**
 * A verse on its background, 4:5. Used as a tile (feed, creator preview); the full-screen viewer
 * lays out its own page with the same pieces.
 */
export function VerseCard({
  style,
  text,
  reference,
  footer,
  containerStyle,
}: {
  style: CardStyle;
  text: string;
  reference: string;
  footer?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const colors = CARD_TEXT_COLORS[CARD_ART[style.background].text];
  const verse = cardText(text);
  const m = cardTypeMetrics(width || 320, verse, style.font);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.card, containerStyle]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${verse} ${reference}`}
    >
      <CardArtSvg background={style.background} />
      <View style={[styles.text, { paddingHorizontal: m.pad, paddingTop: m.pad * 1.2 }]} importantForAccessibility="no-hide-descendants">
        <Txt style={{ fontFamily: CARD_FONT_FAMILY[style.font], fontSize: m.size, lineHeight: m.lineHeight, color: colors.verse }}>{verse}</Txt>
        <Txt style={{ fontFamily: FONTS.uiMedium, fontSize: m.refSize, lineHeight: m.refSize * 1.4, color: colors.soft, marginTop: m.size * 0.7 }}>{reference}</Txt>
      </View>
      {footer ? <View style={[styles.footer, { padding: m.pad * 0.6 }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: 4 / 5, borderRadius: 16, overflow: 'hidden' },
  text: { flex: 1 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
