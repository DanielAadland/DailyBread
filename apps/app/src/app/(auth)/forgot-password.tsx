import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBackend } from '../../api/BackendProvider';
import { Button } from '../../ui/Button';
import { errorMessage } from '../../ui/misc';
import { Screen } from '../../ui/Screen';
import { Txt } from '../../ui/Text';
import { TextField } from '../../ui/TextField';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const { backend } = useBackend();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setError(null);
    if (!email.includes('@')) return setError(t('auth.invalidEmail'));
    setBusy(true);
    try {
      await backend.auth.sendPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen width={420}>
      <Txt variant="h1" style={{ paddingTop: 32 }}>
        {t('auth.resetTitle')}
      </Txt>
      {sent ? (
        <Txt variant="lead">{t('auth.resetSent', { email })}</Txt>
      ) : (
        <>
          <Txt tone="mist">{t('auth.resetIntro')}</Txt>
          <TextField label={t('auth.email')} value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" autoCapitalize="none" error={error} />
          <Button label={t('auth.sendResetLink')} onPress={send} loading={busy} fullWidth />
        </>
      )}
      <Button href="/sign-in" label={t('auth.backToSignIn')} variant="quiet" />
    </Screen>
  );
}
