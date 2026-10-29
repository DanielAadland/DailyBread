import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBackend } from '../api/BackendProvider';
import { Button } from '../ui/Button';
import { errorMessage } from '../ui/misc';
import { Screen } from '../ui/Screen';
import { Txt } from '../ui/Text';
import { TextField } from '../ui/TextField';

/** Opened from the password-reset email; the link signs the user in for this one change. */
export default function ResetPassword() {
  const { t } = useTranslation();
  const { backend, session } = useBackend();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (password.length < 8) return setError(t('auth.passwordTooShort', { count: 8 }));
    setBusy(true);
    try {
      await backend.auth.updatePassword(password);
      setDone(true);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen width={420}>
      <Txt variant="h1" style={{ paddingTop: 32 }}>
        {t('auth.newPasswordTitle')}
      </Txt>
      {!session ? (
        <>
          <Txt>{t('auth.resetLinkExpired')}</Txt>
          <Button href="/forgot-password" label={t('auth.sendResetLink')} variant="secondary" />
        </>
      ) : done ? (
        <>
          <Txt variant="lead">{t('auth.passwordChanged')}</Txt>
          <Button href="/" label={t('common.continue')} />
        </>
      ) : (
        <>
          <TextField label={t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={error} />
          <Button label={t('auth.savePassword')} onPress={save} loading={busy} fullWidth />
        </>
      )}
    </Screen>
  );
}
