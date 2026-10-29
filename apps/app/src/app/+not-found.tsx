import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { Txt } from '../ui/Text';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <Txt variant="h1" style={{ paddingTop: 32 }}>
        {t('notFound.title')}
      </Txt>
      <Txt>{t('notFound.body')}</Txt>
      <Button href="/" label={t('notFound.home')} />
    </Screen>
  );
}
