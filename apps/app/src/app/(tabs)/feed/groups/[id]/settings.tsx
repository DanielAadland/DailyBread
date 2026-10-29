import { checkGroupInput } from '@bible-app/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useDeleteGroup, useGroup, useResetGroupInvite, useSetGroupPlan, useUpdateGroup } from '../../../../../api/hooks';
import type { Group, GroupInput } from '../../../../../api/types';
import { useTheme } from '../../../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../../../theme/tokens';
import { Button } from '../../../../../ui/Button';
import { useGroupPlanLine } from '../../../../../ui/GroupCard';
import { GroupFields, PlanPicker, useStartDate, type PlanChoice } from '../../../../../ui/GroupForm';
import { InvitePanel } from '../../../../../ui/InvitePanel';
import { Divider, ErrorState, errorMessage, Loading, Notice, Section } from '../../../../../ui/misc';
import { Screen } from '../../../../../ui/Screen';
import { Txt } from '../../../../../ui/Text';

/** Group settings for admins (and the owner, who can also delete the group). */
export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const group = useGroup(id);

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={group.data?.name ?? t('groups.title')}
          icon="chevron-back"
          variant="quiet"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/feed/groups/${id}`))}
        />
      </View>
      <Txt variant="h1">{t('groups.settings')}</Txt>
      {group.isPending ? (
        <Loading />
      ) : group.isError ? (
        <ErrorState error={group.error} onRetry={() => group.refetch()} />
      ) : group.data.myRole === 'member' || !group.data.myRole ? (
        <Notice tone="warning">{t('errors.not_allowed')}</Notice>
      ) : (
        <Settings group={group.data} />
      )}
    </Screen>
  );
}

function Settings({ group }: { group: Group }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const update = useUpdateGroup();
  const setPlan = useSetGroupPlan();
  const reset = useResetGroupInvite();
  const remove = useDeleteGroup();
  const startDate = useStartDate();
  const planLine = useGroupPlanLine()(group);
  const [input, setInput] = useState<GroupInput>({ name: group.name, description: group.description, kind: group.kind, access: group.access });
  const [plan, setPlanChoice] = useState<PlanChoice>({ planId: group.plan?.id ?? null, start: 'tomorrow' });
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<'details' | 'plan' | null>(null);
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);

  useEffect(() => setSaved(null), [input, plan]);

  const saveDetails = () => {
    const issue = checkGroupInput(input);
    if (issue) return setProblem(t(`groups.form.problems.${issue}`));
    setProblem(null);
    update.mutate({ id: group.id, input }, { onSuccess: () => setSaved('details') });
  };
  const savePlan = () =>
    setPlan.mutate(
      { id: group.id, planId: plan.planId, start: plan.planId ? startDate(plan.start) : null },
      { onSuccess: () => setSaved('plan') },
    );

  return (
    <>
      <Section title={t('groups.details')}>
        <GroupFields value={input} onChange={setInput} />
        {problem || update.error ? <Notice tone="warning">{problem ?? errorMessage(t, update.error)}</Notice> : null}
        <View style={styles.row}>
          <Button label={t('common.save')} onPress={saveDetails} loading={update.isPending} />
          {saved === 'details' ? <Txt tone="mist">{t('groups.saved')}</Txt> : null}
        </View>
      </Section>
      <Divider />
      <Section title={t('groups.readingPlan')}>
        <Txt tone="mist">{planLine ?? t('groups.form.noPlan')}</Txt>
        <PlanPicker value={plan} onChange={setPlanChoice} />
        <Txt variant="small" tone="mist">
          {t('groups.planChangeNote')}
        </Txt>
        {setPlan.error ? <Notice tone="warning">{errorMessage(t, setPlan.error)}</Notice> : null}
        <View style={styles.row}>
          <Button label={t('groups.savePlan')} onPress={savePlan} loading={setPlan.isPending} />
          {saved === 'plan' ? <Txt tone="mist">{t('groups.saved')}</Txt> : null}
        </View>
      </Section>
      <Divider />
      <Section title={t('groups.inviteLink')}>
        {group.inviteCode ? <InvitePanel groupName={group.name} code={group.inviteCode} /> : null}
        {confirm === 'reset' ? (
          <View style={[styles.confirm, { borderColor: colors.rule }]} role="alertdialog">
            <Txt>{t('groups.resetConfirm')}</Txt>
            <View style={styles.row}>
              <Button label={t('groups.resetLink')} variant="danger" loading={reset.isPending} onPress={() => reset.mutate(group.id, { onSuccess: () => setConfirm(null) })} />
              <Button label={t('common.cancel')} variant="quiet" onPress={() => setConfirm(null)} />
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'flex-start' }}>
            <Button label={t('groups.resetLink')} icon="refresh" variant="quiet" onPress={() => setConfirm('reset')} />
          </View>
        )}
      </Section>
      {group.myRole === 'owner' ? (
        <>
          <Divider />
          <Section title={t('groups.deleteTitle')}>
            <Txt tone="mist">{t('groups.deleteExplain')}</Txt>
            {confirm === 'delete' ? (
              <View style={[styles.confirm, { borderColor: colors.danger }]} role="alertdialog">
                <Txt>{t('groups.deleteConfirm', { name: group.name })}</Txt>
                <View style={styles.row}>
                  <Button
                    label={t('groups.deleteButton')}
                    variant="danger"
                    loading={remove.isPending}
                    onPress={() => remove.mutate(group.id, { onSuccess: () => router.replace('/feed/groups') })}
                  />
                  <Button label={t('common.cancel')} variant="quiet" onPress={() => setConfirm(null)} />
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'flex-start' }}>
                <Button label={t('groups.deleteButton')} variant="danger" onPress={() => setConfirm('delete')} />
              </View>
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm },
  confirm: { borderWidth: 1, borderRadius: RADIUS.control, padding: SPACE.md, gap: SPACE.sm },
});
