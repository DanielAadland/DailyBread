import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SPACE } from '../../theme/tokens';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/misc';
import { Screen } from '../../ui/Screen';
import { Txt } from '../../ui/Text';

const PAGES = ['privacy', 'terms'] as const;
type Page = (typeof PAGES)[number];

/** Draft legal texts. They must be reviewed before the public launch (Phase 2). */
export default function LegalPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { page } = useLocalSearchParams<{ page: string }>();
  const which: Page = PAGES.includes(page as Page) ? (page as Page) : 'privacy';
  const sections = t(`legal.${which}Sections`, { returnObjects: true }) as Array<{ title: string; body: string }>;

  return (
    <Screen>
      <Stack.Screen options={{ title: t(`legal.${which}Title`) }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <Txt variant="h1">{t(`legal.${which}Title`)}</Txt>
      <Notice tone="warning">{t('legal.draftNotice')}</Notice>
      {sections.map((s) => (
        <View key={s.title} style={{ gap: SPACE.sm }}>
          <Txt variant="h3">{s.title}</Txt>
          <Txt>{s.body}</Txt>
        </View>
      ))}
    </Screen>
  );
}
