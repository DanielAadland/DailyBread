import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useBackend } from '../api/BackendProvider';
import { useNotificationPrefs, useUpdateNotificationPrefs } from '../api/hooks';
import { language } from '../i18n';
import { pushSupport, subscribeToPush } from '../lib/push';
import { formatTime, stepTime } from '../lib/time';
import { SPACE } from '../theme/tokens';
import { Button } from './Button';
import { ErrorState, errorMessage, Loading, Notice, Stepper, ToggleRow } from './misc';
import { Txt } from './Text';

/** Daily reminder, quiet hours, daily limit, social switches, and this device's push permission. */
export function ReminderSettings({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { backend } = useBackend();
  const prefs = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const [pushState, setPushState] = useState<'idle' | 'busy' | 'on' | 'declined' | 'error'>('idle');

  if (prefs.isPending) return <Loading />;
  if (prefs.isError) return <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />;
  const p = prefs.data;
  const support = backend.kind === 'demo' ? 'demo' : pushSupport();

  const enablePush = async () => {
    setPushState('busy');
    try {
      const sub = await subscribeToPush();
      if (!sub) return setPushState('declined');
      await backend.savePushSubscription(sub);
      setPushState('on');
    } catch {
      setPushState('error');
    }
  };

  return (
    <View style={{ gap: SPACE.md }}>
      <ToggleRow
        label={t('reminders.daily')}
        hint={t('reminders.dailyHint')}
        value={p.remindersEnabled}
        onChange={(v) => update.mutate({ remindersEnabled: v })}
      />
      {p.remindersEnabled ? (
        <Stepper
          label={t('reminders.time')}
          display={formatTime(p.reminderTime, language)}
          onDecrease={() => update.mutate({ reminderTime: stepTime(p.reminderTime, -1) })}
          onIncrease={() => update.mutate({ reminderTime: stepTime(p.reminderTime, 1) })}
        />
      ) : null}

      {support === 'supported' ? (
        <View style={{ gap: SPACE.sm, alignItems: 'flex-start' }}>
          {pushState === 'on' ? (
            <Txt tone="mist">{t('reminders.pushOn')}</Txt>
          ) : (
            <Button label={t('reminders.enablePush')} variant="secondary" icon="notifications-outline" loading={pushState === 'busy'} onPress={enablePush} />
          )}
          {pushState === 'declined' ? <Txt variant="small" tone="mist">{t('reminders.pushDeclined')}</Txt> : null}
          {pushState === 'error' ? <Txt variant="small" tone="danger">{t('reminders.pushError')}</Txt> : null}
        </View>
      ) : (
        <Notice>{t(`reminders.push_${support}`)}</Notice>
      )}

      {!compact ? (
        <>
          <Stepper
            label={t('reminders.quietStart')}
            display={p.quietStart ? formatTime(p.quietStart, language) : t('reminders.off')}
            onDecrease={() => update.mutate({ quietStart: stepTime(p.quietStart ?? '22:00', -2) })}
            onIncrease={() => update.mutate({ quietStart: stepTime(p.quietStart ?? '22:00', 2) })}
          />
          <Stepper
            label={t('reminders.quietEnd')}
            display={p.quietEnd ? formatTime(p.quietEnd, language) : t('reminders.off')}
            onDecrease={() => update.mutate({ quietEnd: stepTime(p.quietEnd ?? '07:00', -2) })}
            onIncrease={() => update.mutate({ quietEnd: stepTime(p.quietEnd ?? '07:00', 2) })}
          />
          <Stepper
            label={t('reminders.dailyCap')}
            display={String(p.dailyCap)}
            canDecrease={p.dailyCap > 1}
            canIncrease={p.dailyCap < 10}
            onDecrease={() => update.mutate({ dailyCap: p.dailyCap - 1 })}
            onIncrease={() => update.mutate({ dailyCap: p.dailyCap + 1 })}
          />
          <Txt variant="small" tone="mist">
            {t('reminders.socialIntro')}
          </Txt>
          <ToggleRow label={t('reminders.socialComments')} value={p.socialComments} onChange={(v) => update.mutate({ socialComments: v })} />
          <ToggleRow label={t('reminders.socialReactions')} value={p.socialReactions} onChange={(v) => update.mutate({ socialReactions: v })} />
          <ToggleRow label={t('reminders.socialNudges')} value={p.socialNudges} onChange={(v) => update.mutate({ socialNudges: v })} />
        </>
      ) : null}
      {update.error ? <Notice tone="warning">{errorMessage(t, update.error)}</Notice> : null}
    </View>
  );
}
