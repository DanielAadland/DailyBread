import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays, GROUP_ACCESS, GROUP_KINDS, GROUP_LIMITS, localDate, type LocalDate } from '@bible-app/core';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { usePlans, useProfile } from '../api/hooks';
import type { GroupAccess, GroupInput, GroupKind } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Loading, Segmented } from './misc';
import { Txt } from './Text';
import { TextField } from './TextField';

/** A vertical list of choices with an optional line of explanation each. */
export function RadioList<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; hint?: string }>;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: SPACE.sm }}>
      <Txt variant="label">{label}</Txt>
      <View role="radiogroup" aria-label={label} style={{ gap: SPACE.xs }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              role="radio"
              aria-checked={selected}
              accessibilityLabel={o.hint ? `${o.label}. ${o.hint}` : o.label}
              onPress={() => onChange(o.value)}
              style={(s) => [
                styles.option,
                { borderColor: selected ? colors.tide : colors.rule, backgroundColor: selected ? colors.tideSoft : colors.surface },
                (s as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
              ]}
            >
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.tide : colors.mist} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt>{o.label}</Txt>
                {o.hint ? (
                  <Txt variant="small" tone="mist">
                    {o.hint}
                  </Txt>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Name, description, kind and who can join. */
export function GroupFields({ value, onChange }: { value: GroupInput; onChange: (v: GroupInput) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: SPACE.md }}>
      <TextField
        label={t('groups.form.name')}
        hint={t('groups.form.nameHint', { min: GROUP_LIMITS.nameMin, max: GROUP_LIMITS.nameMax })}
        value={value.name}
        onChangeText={(name) => onChange({ ...value, name })}
        maxLength={GROUP_LIMITS.nameMax}
      />
      <TextField
        label={t('groups.form.description')}
        hint={t('groups.form.descriptionHint', { count: GROUP_LIMITS.descriptionMax })}
        value={value.description}
        onChangeText={(description) => onChange({ ...value, description })}
        maxLength={GROUP_LIMITS.descriptionMax}
        multiline
      />
      <RadioList<GroupKind>
        label={t('groups.form.kind')}
        value={value.kind}
        onChange={(kind) => onChange({ ...value, kind })}
        options={GROUP_KINDS.map((k) => ({ value: k, label: t(`groups.kinds.${k}`) }))}
      />
      <RadioList<GroupAccess>
        label={t('groups.form.access')}
        value={value.access}
        onChange={(access) => onChange({ ...value, access })}
        options={GROUP_ACCESS.map((a) => ({ value: a, label: t(`groups.access.${a}`), hint: t(`groups.accessHint.${a}`) }))}
      />
    </View>
  );
}

export interface PlanChoice {
  planId: string | null;
  start: 'today' | 'tomorrow' | 'monday';
}

/** The local date a start choice means, in the person's timezone. */
export function useStartDate() {
  const profile = useProfile();
  return (choice: PlanChoice['start']): LocalDate => {
    const today = localDate(new Date(), profile.data?.timezone ?? 'UTC');
    if (choice === 'today') return today;
    if (choice === 'tomorrow') return addDays(today, 1);
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    return addDays(today, ((8 - weekday) % 7) || 7);
  };
}

/** Pick the group's reading plan (or none) and when everyone starts. */
export function PlanPicker({ value, onChange }: { value: PlanChoice; onChange: (v: PlanChoice) => void }) {
  const { t } = useTranslation();
  const plans = usePlans();
  if (plans.isPending) return <Loading />;
  return (
    <View style={{ gap: SPACE.md }}>
      <RadioList<string>
        label={t('groups.form.plan')}
        value={value.planId ?? 'none'}
        onChange={(id) => onChange({ ...value, planId: id === 'none' ? null : id })}
        options={[
          { value: 'none', label: t('groups.form.noPlan'), hint: t('groups.form.noPlanHint') },
          ...(plans.data ?? []).map((p) => ({ value: p.id, label: p.title, hint: t('groups.form.planDays', { count: p.days }) })),
        ]}
      />
      {value.planId ? (
        <Segmented<PlanChoice['start']>
          label={t('groups.form.start')}
          value={value.start}
          onChange={(start) => onChange({ ...value, start })}
          options={[
            { value: 'today', label: t('groups.form.startToday') },
            { value: 'tomorrow', label: t('groups.form.startTomorrow') },
            { value: 'monday', label: t('groups.form.startMonday') },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm + 4, borderWidth: 1, borderRadius: RADIUS.control, padding: SPACE.sm + 4 },
});
