import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useBackend } from '../../api/BackendProvider';
import { SPACE } from '../../theme/tokens';
import { Button } from '../../ui/Button';
import { Logo } from '../../ui/Logo';
import { Divider, errorMessage, Notice } from '../../ui/misc';
import { Screen } from '../../ui/Screen';
import { Txt } from '../../ui/Text';
import { TextField } from '../../ui/TextField';

export default function SignIn() {
  const { t } = useTranslation();
  const { backend } = useBackend();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const demo = backend.kind === 'demo';

  async function signIn() {
    setError(null);
    if (!email.includes('@') || (!demo && password.length === 0)) {
      setError(t('auth.fillBoth'));
      return;
    }
    setBusy('password');
    try {
      await backend.auth.signIn({ email: email.trim(), password });
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setError(null);
    setBusy('google');
    try {
      await backend.auth.signInWithGoogle();
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(null);
    }
  }

  return (
    <Screen width={420}>
      <Stack.Screen options={{ title: t('auth.signInTitle') }} />
      <View style={styles.head}>
        <Logo name={t('app.name')} />
        <Txt variant="lead" tone="mist">
          {t('app.tagline')}
        </Txt>
      </View>
      {demo ? <Notice>{t('demo.signInNotice')}</Notice> : null}
      <View style={styles.form}>
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          textContentType="emailAddress"
        />
        <TextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={signIn}
        />
        {error ? (
          <Txt tone="danger" role="alert">
            {error}
          </Txt>
        ) : null}
        <Button label={t('auth.signIn')} onPress={signIn} loading={busy === 'password'} fullWidth />
        {!demo ? (
          <Button label={t('auth.continueWithGoogle')} icon="logo-google" variant="secondary" onPress={google} loading={busy === 'google'} fullWidth />
        ) : null}
      </View>
      <Divider />
      <View style={styles.links}>
        <Button href="/sign-up" label={t('auth.createAccount')} variant="quiet" />
        {!demo ? (
          <Button href="/forgot-password" label={t('auth.forgotPassword')} variant="quiet" />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: SPACE.md, paddingTop: SPACE.xl },
  form: { gap: SPACE.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
