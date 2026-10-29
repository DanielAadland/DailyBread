import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppError } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Button } from './Button';
import { Txt } from './Text';

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.rule }} />;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Txt variant="h3">{title}</Txt>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator color={colors.tide} />
    </View>
  );
}

/** Says what went wrong and offers the way forward. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} role="alert">
      <Txt align="center">{errorMessage(t, error)}</Txt>
      {onRetry ? <Button label={t('common.tryAgain')} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function errorMessage(t: (key: string, opts?: Record<string, unknown>) => string, error: unknown): string {
  const code = error instanceof AppError ? error.code : 'unknown';
  return t(`errors.${code}`, { defaultValue: t('errors.unknown') });
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.track, { backgroundColor: colors.dusk }]}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.dawn }]} />
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label">{label}</Txt>
        {hint ? (
          <Txt variant="small" tone="mist">
            {hint}
          </Txt>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.tide, false: colors.dusk }}
        thumbColor={colors.surface}
        {...({ activeThumbColor: colors.surface } as object)}
      />
    </View>
  );
}

/** A choice among a few options, shown as a row of buttons. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: SPACE.sm }}>
      <Txt variant="label">{label}</Txt>
      <View role="radiogroup" aria-label={label} style={[styles.segmented, { borderColor: colors.rule, backgroundColor: colors.surface }]}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              role="radio"
              aria-checked={selected}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={(state) => [
                styles.segment,
                selected && { backgroundColor: colors.tide },
                (state as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
              ]}
            >
              <Txt variant="small" style={{ color: selected ? colors.onTide : colors.ink, fontWeight: selected ? '600' : '400' }}>
                {o.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "−  08:00  +" for values on fixed steps (times, counts). */
export function Stepper({
  label,
  display,
  onDecrease,
  onIncrease,
  canDecrease = true,
  canIncrease = true,
}: {
  label: string;
  display: string;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const btn = (icon: ComponentProps<typeof Ionicons>['name'], a11y: string, onPress: () => void, enabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={!enabled}
      onPress={onPress}
      style={(state) => [
        styles.stepBtn,
        { borderColor: colors.rule, opacity: enabled ? 1 : 0.4 },
        (state as { focused?: boolean }).focused && { outlineColor: colors.focus, outlineWidth: 2, outlineStyle: 'solid' },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.ink} />
    </Pressable>
  );
  return (
    <View style={styles.toggleRow}>
      <Txt variant="label" style={{ flex: 1 }}>
        {label}
      </Txt>
      <View style={styles.stepper}>
        {btn('remove', t('common.decrease', { label }), onDecrease, canDecrease)}
        <Txt variant="label" style={styles.stepValue} accessibilityLiveRegion="polite">
          {display}
        </Txt>
        {btn('add', t('common.increase', { label }), onIncrease, canIncrease)}
      </View>
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: tone === 'info' ? colors.tideSoft : colors.dawnSoft }]}>
      <Txt variant="small">{children}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  center: { padding: SPACE.xl, alignItems: 'center', justifyContent: 'center', gap: SPACE.md },
  track: { height: 6, borderRadius: RADIUS.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADIUS.pill },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 48 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: RADIUS.control, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 40, borderRadius: RADIUS.control - 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  stepBtn: { width: 40, height: 40, borderRadius: RADIUS.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  notice: { borderRadius: RADIUS.control, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm + 2 },
});
