import { checkGroupInput } from '@bible-app/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useCreateGroup } from '../../../../api/hooks';
import type { GroupInput } from '../../../../api/types';
import { SPACE } from '../../../../theme/tokens';
import { Button } from '../../../../ui/Button';
import { GroupFields, PlanPicker, useStartDate, type PlanChoice } from '../../../../ui/GroupForm';
import { Divider, errorMessage, Notice } from '../../../../ui/misc';
import { Screen } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Text';

/** Start a group: who it's for, who can join, and (optionally) a plan to read together. */
export default function NewGroupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const create = useCreateGroup();
  const startDate = useStartDate();
  const [input, setInput] = useState<GroupInput>({ name: '', description: '', kind: 'small_group', access: 'invite' });
  const [plan, setPlan] = useState<PlanChoice>({ planId: null, start: 'tomorrow' });
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const issue = checkGroupInput(input);
    if (issue) return setProblem(t(`groups.form.problems.${issue}`));
    setProblem(null);
    create.mutate(
      { ...input, planId: plan.planId ?? undefined, planStart: plan.planId ? startDate(plan.start) : undefined },
      { onSuccess: (g) => router.replace(`/feed/groups/${g.id}`) },
    );
  };

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('groups.title')} icon="chevron-back" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed/groups'))} />
      </View>
      <Txt variant="h1">{t('groups.newTitle')}</Txt>
      <GroupFields value={input} onChange={setInput} />
      <Divider />
      <PlanPicker value={plan} onChange={setPlan} />
      <Txt variant="small" tone="mist">
        {t('groups.joinPrivacy')}
      </Txt>
      {problem || create.error ? <Notice tone="warning">{problem ?? errorMessage(t, create.error)}</Notice> : null}
      <View style={{ gap: SPACE.sm }}>
        <Button label={t('groups.createButton')} icon="checkmark" onPress={submit} loading={create.isPending} fullWidth />
      </View>
    </Screen>
  );
}
