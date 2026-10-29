import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useBackend } from '../../api/BackendProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../theme/tokens';
import { Button } from '../../ui/Button';
import { errorMessage, Notice } from '../../ui/misc';
import { Screen } from '../../ui/Screen';
import { Txt } from '../../ui/Text';
import { TextField } from '../../ui/TextField';

const MIN_PASSWORD = 8;

export default function SignUp() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { backend } = useBackend();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const demo = backend.kind === 'demo';

  async function submit() {
    setError(null);
    if (!email.includes('@')) return setError(t('auth.invalidEmail'));
    if (!demo && password.length < MIN_PASSWORD) return setError(t('auth.passwordTooShort', { count: MIN_PASSWORD }));
    if (!ageOk) return setError(t('auth.ageRequired'));
    setBusy(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await backend.auth.signUp({ email: email.trim(), password, displayName: name.trim(), timezone });
      if (result.needsConfirmation) setCheckEmail(true);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <Screen width={420}>
        <Txt variant="h1">{t('auth.checkEmailTitle')}</Txt>
        <Txt variant="lead">{t('auth.checkEmailBody', { email })}</Txt>
        <Button href="/sign-in" label={t('auth.backToSignIn')} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen width={420}>
      <Stack.Screen options={{ title: t('auth.createAccountTitle') }} />
      <View style={{ gap: SPACE.sm, paddingTop: SPACE.xl }}>
        <Txt variant="h1">{t('auth.createAccountTitle')}</Txt>
        <Txt tone="mist">{t('auth.createAccountIntro')}</Txt>
      </View>
      {demo ? <Notice>{t('demo.signUpNotice')}</Notice> : null}
      <View style={styles.form}>
        <TextField label={t('auth.name')} value={name} onChangeText={setName} autoComplete="name" maxLength={50} hint={t('auth.nameHint')} />
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {!demo ? (
          <TextField
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            hint={t('auth.passwordHint', { count: MIN_PASSWORD })}
          />
        ) : null}
        <Pressable
          role="checkbox"
          aria-checked={ageOk}
          accessibilityLabel={t('auth.ageConfirm')}
          onPress={() => setAgeOk((v) => !v)}
          style={(state) => [
            styles.check,
            (state as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
          ]}
        >
          <View style={[styles.box, { borderColor: ageOk ? colors.tide : colors.mist, backgroundColor: ageOk ? colors.tide : 'transparent' }]}>
            {ageOk ? <Ionicons name="checkmark" size={16} color={colors.onTide} /> : null}
          </View>
          <Txt style={{ flex: 1 }}>{t('auth.ageConfirm')}</Txt>
        </Pressable>
        <Txt variant="small" tone="mist">
          {t('auth.legalLine')}{' '}
          <Link href="/legal/terms">
            <Txt variant="small" tone="tide">
              {t('legal.termsTitle')}
            </Txt>
          </Link>
          {` ${t('common.and')} `}
          <Link href="/legal/privacy">
            <Txt variant="small" tone="tide">
              {t('legal.privacyTitle')}
            </Txt>
          </Link>
        </Txt>
        {error ? (
          <Txt tone="danger" role="alert">
            {error}
          </Txt>
        ) : null}
        <Button label={t('auth.createAccount')} onPress={submit} loading={busy} fullWidth />
      </View>
      <Button href="/sign-in" label={t('auth.haveAccount')} variant="quiet" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.md },
  check: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + 4, minHeight: 44, borderRadius: RADIUS.control },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
