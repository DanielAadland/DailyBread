import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Verse } from '@bible-app/bible';
import type { HighlightColor } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { FONTS, RADIUS } from '../theme/tokens';

interface Props {
  verses: Verse[];
  highlights?: Record<number, HighlightColor>;
  selected?: ReadonlySet<number>;
  withNotes?: ReadonlySet<number>;
  onPressVerse?: (verse: number) => void;
  /** Reports each verse's y position inside the list (to scroll to a verse). */
  onVerseLayout?: (verse: number, y: number) => void;
  /** e.g. "John 3" — used in each verse's accessible name. */
  chapterLabel: string;
}

/** Scripture, one verse per block, in the reader's chosen size and spacing. */
export const VerseList = memo(function VerseList({ verses, highlights, selected, withNotes, onPressVerse, onVerseLayout, chapterLabel }: Props) {
  const { colors, prefs } = useTheme();
  const { t } = useTranslation();
  const size = prefs.fontSize;
  const lineHeight = Math.round(size * prefs.lineHeight);

  return (
    <View style={styles.list}>
      {verses.map((v) => {
        const color = highlights?.[v.verse];
        const isSelected = selected?.has(v.verse) ?? false;
        const hasNote = withNotes?.has(v.verse) ?? false;
        const body = (
          <Text style={{ fontFamily: FONTS.scripture, fontSize: size, lineHeight, color: colors.ink }}>
            {prefs.showVerseNumbers ? (
              <Text style={{ fontFamily: FONTS.uiBold, fontSize: Math.round(size * 0.6), lineHeight: Math.round(size * 0.75), color: colors.mist }}>{`${v.verse} `}</Text>
            ) : null}
            {v.text}
          </Text>
        );
        const blockStyle = [
          styles.verse,
          color ? { backgroundColor: colors.highlight[color] } : null,
          isSelected ? { borderColor: colors.tide, borderStyle: 'dashed' as const } : null,
        ];
        const label = t('reader.verseLabel', { place: `${chapterLabel}:${v.verse}`, text: v.text });
        return onPressVerse ? (
          <Pressable
            key={v.verse}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onPressVerse(v.verse)}
            onLayout={onVerseLayout ? (e) => onVerseLayout(v.verse, e.nativeEvent.layout.y) : undefined}
            style={(s) => [
              ...blockStyle,
              (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
            ]}
          >
            {body}
            {hasNote ? <Ionicons name="document-text" size={14} color={colors.tide} style={styles.noteIcon} /> : null}
          </Pressable>
        ) : (
          <View key={v.verse} style={blockStyle}>
            {body}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { gap: 2 },
  verse: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.control - 4, borderWidth: 1, borderColor: 'transparent', marginHorizontal: -6 },
  noteIcon: { position: 'absolute', right: -14, top: 8 },
});
