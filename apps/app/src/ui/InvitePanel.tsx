import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, View } from 'react-native';
import { inviteUrl } from '../lib/invite';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Button } from './Button';
import { Txt } from './Text';

const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

/** The group's invite link with Copy and (where the device supports it) Share. */
export function InvitePanel({ groupName, code }: { groupName: string; code: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(code);
  const message = t('groups.inviteMessage', { name: groupName, url });

  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={[styles.link, { borderColor: colors.rule, backgroundColor: colors.surface }]}>
        <Txt selectable numberOfLines={1} accessibilityLabel={t('groups.inviteLinkLabel', { url })}>
          {url}
        </Txt>
      </View>
      <View style={styles.row}>
        <Button
          label={copied ? t('groups.copied') : t('groups.copyLink')}
          icon={copied ? 'checkmark' : 'copy-outline'}
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(url);
            setCopied(true);
          }}
        />
        {canShare ? (
          <Button
            label={t('groups.share')}
            icon="share-social-outline"
            variant="secondary"
            onPress={() => {
              if (Platform.OS === 'web') navigator.share({ title: groupName, text: message, url }).catch(() => undefined);
              else Share.share({ message }).catch(() => undefined);
            }}
          />
        ) : null}
      </View>
      <Txt variant="small" tone="mist">
        {t('groups.inviteHint')}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { borderWidth: 1, borderRadius: RADIUS.control, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm + 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
});
