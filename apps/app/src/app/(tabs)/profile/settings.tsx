import { TRANSLATIONS } from '@bible-app/bible';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { useBackend } from '../../../api/BackendProvider';
import { useProfile, useUpdateProfile } from '../../../api/hooks';
import type { Visibility } from '../../../api/types';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Divider, errorMessage, Notice, Section, Segmented } from '../../../ui/misc';
import { ReadingSettings } from '../../../ui/ReadingSettings';
import { ReminderSettings } from '../../../ui/ReminderSettings';
import { Screen } from '../../../ui/Screen';
import { Txt } from '../../../ui/Text';
import { TextField } from '../../../ui/TextField';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('profile.settings') }} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('tabs.profile')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      </View>
      <Txt variant="h1">{t('profile.settings')}</Txt>
      <Section title={t('settings.profile')}>
        <ProfileForm />
      </Section>
      <Divider />
      <Section title={t('reading.title')}>
        <ReadingSettings />
      </Section>
      <Divider />
      <Section title={t('reminders.title')}>
        <ReminderSettings />
      </Section>
      <Divider />
      <Section title={t('settings.privacy')}>
        <PrivacyActions />
      </Section>
      <Divider />
      <Section title={t('settings.about')}>
        <About />
      </Section>
    </Screen>
  );
}

function ProfileForm() {
  const { t } = useTranslation();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.displayName);
    setUsername(profile.data.username ?? '');
    setBio(profile.data.bio);
  }, [profile.data]);

  if (!profile.data) return null;

  const save = () => {
    setSaved(false);
    const u = username.trim().toLowerCase();
    if (u && !/^[a-z0-9_]{3,24}$/.test(u)) return setUsernameError(t('settings.usernameRule'));
    setUsernameError(null);
    update.mutate({ displayName: displayName.trim(), username: u || null, bio: bio.trim() }, { onSuccess: () => setSaved(true) });
  };

  return (
    <View style={{ gap: SPACE.md }}>
      <TextField label={t('auth.name')} value={displayName} onChangeText={setDisplayName} maxLength={50} />
      <TextField
        label={t('settings.username')}
        hint={t('settings.usernameRule')}
        value={username}
        onChangeText={(v) => setUsername(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={24}
        error={usernameError}
      />
      <TextField label={t('settings.bio')} hint={t('settings.bioHint', { count: 160 })} value={bio} onChangeText={setBio} maxLength={160} multiline />
      <Segmented<Visibility>
        label={t('settings.visibility')}
        value={profile.data.visibility}
        onChange={(visibility) => update.mutate({ visibility })}
        options={[
          { value: 'public', label: t('profile.visibilityShort.public') },
          { value: 'friends', label: t('profile.visibilityShort.friends') },
          { value: 'private', label: t('profile.visibilityShort.private') },
        ]}
      />
      <Txt variant="small" tone="mist">
        {t(`settings.visibilityHelp.${profile.data.visibility}`)}
      </Txt>
      {update.error ? <Notice tone="warning">{errorMessage(t, update.error)}</Notice> : null}
      <View style={styles.row}>
        <Button label={t('settings.saveProfile')} onPress={save} loading={update.isPending} />
        {saved ? <Txt tone="mist">{t('settings.profileSaved')}</Txt> : null}
      </View>
    </View>
  );
}

function PrivacyActions() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { backend } = useBackend();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'export' | 'delete' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportData = async () => {
    setBusy('export');
    setError(null);
    try {
      const data = await backend.exportData();
      if (Platform.OS === 'web') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dailybread-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    setBusy('delete');
    setError(null);
    try {
      await backend.deleteAccount();
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: SPACE.md }}>
      <Txt tone="mist">{t('settings.privacyIntro')}</Txt>
      <View style={styles.row}>
        <Button label={t('settings.exportData')} icon="download-outline" variant="secondary" onPress={exportData} loading={busy === 'export'} />
        <Button
          label={t('settings.signOut')}
          icon="log-out-outline"
          variant="secondary"
          loading={busy === 'signout'}
          onPress={() => {
            setBusy('signout');
            backend.auth.signOut().finally(() => setBusy(null));
          }}
        />
      </View>
      {confirmDelete ? (
        <View style={[styles.confirm, { borderColor: colors.danger, backgroundColor: colors.surface }]} role="alertdialog">
          <Txt variant="label">{t('settings.deleteConfirmTitle')}</Txt>
          <Txt>{t('settings.deleteConfirmBody')}</Txt>
          <View style={styles.row}>
            <Button label={t('settings.deleteForever')} variant="danger" onPress={deleteAccount} loading={busy === 'delete'} />
            <Button label={t('common.cancel')} variant="quiet" onPress={() => setConfirmDelete(false)} />
          </View>
        </View>
      ) : (
        <View style={{ alignItems: 'flex-start' }}>
          <Button label={t('settings.deleteAccount')} variant="danger" onPress={() => setConfirmDelete(true)} />
        </View>
      )}
      {error ? <Notice tone="warning">{error}</Notice> : null}
    </View>
  );
}

function About() {
  const { t } = useTranslation();
  const { backend } = useBackend();
  return (
    <View style={{ gap: SPACE.sm }}>
      {backend.kind === 'demo' ? <Notice>{t('demo.banner')}</Notice> : null}
      <Txt variant="small" tone="mist">
        {TRANSLATIONS.bsb.attribution} {TRANSLATIONS.web.attribution}
      </Txt>
      <Txt variant="small" tone="mist">
        {t('settings.freeForever')}
      </Txt>
      <View style={styles.row}>
        <Button href="/legal/privacy" label={t('legal.privacyTitle')} variant="quiet" />
        <Button href="/legal/terms" label={t('legal.termsTitle')} variant="quiet" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center' },
  confirm: { borderWidth: 1, borderRadius: RADIUS.panel, padding: SPACE.md, gap: SPACE.sm },
});
