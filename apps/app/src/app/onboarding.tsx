import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Stack } from 'expo-router';
import { HOME_FOR, useAccess } from '../api/access';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { usePlans, useProfile, useStartPlan, useUpdateProfile } from '../api/hooks';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Button } from '../ui/Button';
import { errorMessage, Loading, Notice } from '../ui/misc';
import { ReminderSettings } from '../ui/ReminderSettings';
import { Screen } from '../ui/Screen';
import { Txt } from '../ui/Text';
import { TextField } from '../ui/TextField';

/** A short first-run setup. Every step can be skipped. */
const SUGGESTED = ['psalms-30', 'gospels-30', 'peace-in-anxious-times', 'bible-in-a-year'];
const STEPS = 3;

export default function Onboarding() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const profile = useProfile();
  const plans = usePlans();
  const updateProfile = useUpdateProfile();
  const startPlan = useStartPlan();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const access = useAccess();

  useEffect(() => {
    if (profile.data?.displayName) setName(profile.data.displayName);
  }, [profile.data?.displayName]);

  if (access !== 'needs-onboarding') return <Redirect href={HOME_FOR[access]} />;

  const finish = async () => {
    if (planId) await startPlan.mutateAsync(planId);
    await updateProfile.mutateAsync({ displayName: name.trim(), onboarded: true });
  };
  const error = updateProfile.error ?? startPlan.error;
  const suggestions = (plans.data ?? []).filter((p) => SUGGESTED.includes(p.slug)).sort((a, b) => SUGGESTED.indexOf(a.slug) - SUGGESTED.indexOf(b.slug));

  return (
    <Screen width={480}>
      <Stack.Screen options={{ title: t('onboarding.title') }} />
      <Txt tone="mist" style={{ paddingTop: SPACE.lg }}>
        {t('onboarding.step', { step, total: STEPS })}
      </Txt>

      {step === 1 ? (
        <>
          <Txt variant="h1">{t('onboarding.nameTitle')}</Txt>
          <Txt tone="mist">{t('onboarding.nameBody')}</Txt>
          <TextField label={t('auth.name')} value={name} onChangeText={setName} maxLength={50} autoFocus onSubmitEditing={() => setStep(2)} />
          <Button label={t('common.continue')} onPress={() => setStep(2)} fullWidth />
        </>
      ) : step === 2 ? (
        <>
          <Txt variant="h1">{t('onboarding.planTitle')}</Txt>
          <Txt tone="mist">{t('onboarding.planBody')}</Txt>
          {plans.isPending ? (
            <Loading />
          ) : (
            <View role="radiogroup" aria-label={t('onboarding.planTitle')} style={{ gap: SPACE.sm }}>
              {suggestions.map((p) => {
                const selected = planId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    role="radio"
                    aria-checked={selected}
                    accessibilityLabel={`${p.title}. ${t('plans.length', { count: p.days })}`}
                    onPress={() => setPlanId(selected ? null : p.id)}
                    style={(s) => [
                      styles.option,
                      { borderColor: selected ? colors.tide : colors.rule, backgroundColor: selected ? colors.tideSoft : colors.surface },
                      (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="label">{p.title}</Txt>
                      <Txt variant="small" tone="mist">
                        {p.description}
                      </Txt>
                    </View>
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.tide : colors.mist} />
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={styles.row}>
            <Button label={planId ? t('common.continue') : t('onboarding.skipPlan')} onPress={() => setStep(3)} variant={planId ? 'primary' : 'secondary'} />
            <Button label={t('common.back')} variant="quiet" onPress={() => setStep(1)} />
          </View>
        </>
      ) : (
        <>
          <Txt variant="h1">{t('onboarding.reminderTitle')}</Txt>
          <Txt tone="mist">{t('onboarding.reminderBody')}</Txt>
          <ReminderSettings compact />
          {error ? <Notice tone="warning">{errorMessage(t, error)}</Notice> : null}
          <View style={styles.row}>
            <Button label={t('onboarding.finish')} onPress={finish} loading={updateProfile.isPending || startPlan.isPending} />
            <Button label={t('common.back')} variant="quiet" onPress={() => setStep(2)} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, borderWidth: 1.5, borderRadius: RADIUS.panel, padding: SPACE.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center' },
});
