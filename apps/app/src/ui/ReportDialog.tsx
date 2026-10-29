import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useBlock, useReport } from '../api/hooks';
import { REPORT_REASONS, type ReportReason, type ReportTarget } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Button } from './Button';
import { errorMessage, Notice } from './misc';
import { Txt } from './Text';
import { TextField } from './TextField';

interface Props {
  target: { type: ReportTarget; id: string; authorId: string; authorName: string } | null;
  onClose: () => void;
}

/** Report a post, comment or person. Afterwards, offers to block the author. */
export function ReportDialog({ target, onClose }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const report = useReport();
  const block = useBlock();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  if (!target) return null;
  const close = () => {
    setReason(null);
    setDetails('');
    setSent(false);
    report.reset();
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.bg, borderColor: colors.rule }]} role="dialog" aria-label={t(`report.title_${target.type}`)}>
          {sent ? (
            <>
              <Txt variant="h3">{t('report.thanksTitle')}</Txt>
              <Txt>{t('report.thanksBody')}</Txt>
              <View style={styles.actions}>
                <Button
                  label={t('report.alsoBlock', { name: target.authorName })}
                  variant="danger"
                  loading={block.isPending}
                  onPress={() => block.mutate(target.authorId, { onSuccess: close })}
                />
                <View style={{ flex: 1 }} />
                <Button label={t('common.done')} onPress={close} />
              </View>
            </>
          ) : (
            <>
              <Txt variant="h3">{t(`report.title_${target.type}`)}</Txt>
              <Txt tone="mist">{t('report.intro')}</Txt>
              <View role="radiogroup" aria-label={t('report.reason')} style={{ gap: SPACE.xs }}>
                {REPORT_REASONS.map((r) => (
                  <Pressable
                    key={r}
                    role="radio"
                    aria-checked={reason === r}
                    accessibilityLabel={t(`report.reasons.${r}`)}
                    onPress={() => setReason(r)}
                    style={(s) => [
                      styles.option,
                      (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
                    ]}
                  >
                    <Ionicons name={reason === r ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === r ? colors.tide : colors.mist} />
                    <Txt>{t(`report.reasons.${r}`)}</Txt>
                  </Pressable>
                ))}
              </View>
              <TextField label={t('report.details')} hint={t('report.detailsHint')} value={details} onChangeText={setDetails} multiline maxLength={500} />
              {report.error ? <Notice tone="warning">{errorMessage(t, report.error)}</Notice> : null}
              <View style={styles.actions}>
                <View style={{ flex: 1 }} />
                <Button label={t('common.cancel')} variant="quiet" onPress={close} />
                <Button
                  label={t('report.send')}
                  disabled={!reason}
                  loading={report.isPending}
                  onPress={() =>
                    reason && report.mutate({ target: target.type, targetId: target.id, reason, details: details.trim() }, { onSuccess: () => setSent(true) })
                  }
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,27,39,0.45)', justifyContent: 'center', padding: SPACE.md },
  dialog: { width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: RADIUS.panel, borderWidth: 1, padding: SPACE.lg, gap: SPACE.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 40, borderRadius: RADIUS.control },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
});
