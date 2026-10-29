import { TRANSLATIONS, type TranslationId } from '@bible-app/bible';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useProfile, useUpdateProfile } from '../api/hooks';
import { useTheme } from '../theme/ThemeProvider';
import { FONT_SIZES, LINE_HEIGHTS, SPACE, type ThemePreference } from '../theme/tokens';
import { Segmented, ToggleRow } from './misc';

/** Theme, text size, spacing, verse numbers and translation. */
export function ReadingSettings() {
  const { t } = useTranslation();
  const { prefs, setPrefs } = useTheme();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const translation = profile.data?.translation ?? 'bsb';

  const sizeIndex = Math.max(0, FONT_SIZES.findIndex((s) => s === prefs.fontSize));

  return (
    <View style={{ gap: SPACE.md }}>
      <Segmented<ThemePreference>
        label={t('reading.theme')}
        value={prefs.theme}
        onChange={(theme) => setPrefs({ theme })}
        options={[
          { value: 'system', label: t('reading.themeSystem') },
          { value: 'light', label: t('reading.themeLight') },
          { value: 'dark', label: t('reading.themeDark') },
          { value: 'sepia', label: t('reading.themeSepia') },
        ]}
      />
      <Segmented<number>
        label={t('reading.textSize')}
        value={sizeIndex}
        onChange={(i) => setPrefs({ fontSize: FONT_SIZES[i] ?? 19 })}
        options={FONT_SIZES.map((size, i) => ({ value: i, label: t('reading.sizeOption', { size }) }))}
      />
      <Segmented<number>
        label={t('reading.lineSpacing')}
        value={prefs.lineHeight}
        onChange={(lineHeight) => setPrefs({ lineHeight })}
        options={LINE_HEIGHTS.map((v, i) => ({ value: v, label: t(['reading.spacingCompact', 'reading.spacingNormal', 'reading.spacingRelaxed'][i]!) }))}
      />
      <ToggleRow label={t('reading.verseNumbers')} value={prefs.showVerseNumbers} onChange={(showVerseNumbers) => setPrefs({ showVerseNumbers })} />
      <Segmented<TranslationId>
        label={t('reading.translation')}
        value={translation}
        onChange={(v) => updateProfile.mutate({ translation: v })}
        options={(Object.keys(TRANSLATIONS) as TranslationId[]).map((id) => ({ value: id, label: TRANSLATIONS[id].abbreviation }))}
      />
    </View>
  );
}
