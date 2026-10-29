import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Txt } from './Text';

export interface SheetAction {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  danger?: boolean;
}

/** A short list of actions for one item (a post, a comment, a person). */
export function ActionSheet({ title, actions, visible, onClose }: { title: string; actions: SheetAction[]; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} accessibilityRole="button">
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.rule }]} role="menu" aria-label={title} onPress={() => undefined}>
          <Txt variant="label" tone="mist" style={{ paddingHorizontal: SPACE.sm }}>
            {title}
          </Txt>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              role="menuitem"
              accessibilityLabel={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={(s) => [
                styles.item,
                (s as { hovered?: boolean }).hovered && { backgroundColor: colors.tideSoft },
                (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
              ]}
            >
              <Ionicons name={a.icon} size={20} color={a.danger ? colors.danger : colors.ink} />
              <Txt tone={a.danger ? 'danger' : 'ink'}>{a.label}</Txt>
            </Pressable>
          ))}
          <Pressable role="menuitem" accessibilityLabel={t('common.cancel')} onPress={onClose} style={styles.item}>
            <Ionicons name="close" size={20} color={colors.mist} />
            <Txt tone="mist">{t('common.cancel')}</Txt>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,39,0.45)', justifyContent: 'flex-end', padding: SPACE.md },
  sheet: { width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: RADIUS.panel, borderWidth: 1, padding: SPACE.sm, gap: 2, marginBottom: SPACE.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 48, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.control },
});
