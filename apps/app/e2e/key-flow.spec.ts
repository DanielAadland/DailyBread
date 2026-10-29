import { expect, test } from '@playwright/test';

/** The core loop from the brief: sign up → start a plan → read → complete the day. */
test('sign up, start a plan, read and complete the day', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);

  // Sign up (demo mode: no password, data stays in the browser).
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Anna');
  await page.getByRole('textbox', { name: 'Email' }).fill('anna@example.com');
  await page.getByRole('checkbox', { name: 'I am 13 or older' }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();

  // Onboarding: keep the name, pick Psalms in 30 Days, finish.
  await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Psalms in 30 Days/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start reading' }).click();

  // Today: nothing read yet.
  await expect(page.getByRole('heading', { name: 'Good morning, Anna' }).or(page.getByRole('heading', { name: /Good (afternoon|evening), Anna/ }))).toBeVisible();
  await expect(page.getByText('No streak yet')).toBeVisible();

  // Read day 1 and mark it read with a reflection.
  await page.getByRole('button', { name: 'Start day 1' }).click();
  await expect(page.getByRole('heading', { name: 'Psalms 1–5' })).toBeVisible();
  await expect(page.getByText('Blessed is the man who does not walk', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your reflection (optional)' }).fill('A good start.');
  await page.getByRole('button', { name: 'Mark day 1 as read' }).click();

  // Celebration, then Today shows the day as done.
  await expect(page.getByRole('heading', { name: 'Day 1 done' })).toBeVisible();
  await expect(page.getByText('New badge: First reading')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Done for today' })).toBeVisible();
  await expect(page.getByText('1-day streak', { exact: true })).toBeVisible();
  // The finished plan-day screen stays mounted (aria-hidden) in the Plans tab; the Today copy comes first.
  await expect(page.getByText('Day 2 of 30', { exact: true }).first()).toBeVisible();

  // Progress survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Done for today' })).toBeVisible();
});

test('reader: open a verse, highlight it, add a private note', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByRole('textbox', { name: 'Email' }).fill('reader@example.com');
  await page.getByRole('checkbox', { name: 'I am 13 or older' }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page.getByRole('heading', { name: 'Today’s reading' })).toBeVisible();

  // Jump to a reference through search.
  await page.goto('/read/search');
  await page.getByRole('textbox', { name: 'Reference or words' }).fill('John 3:16');
  await page.getByRole('link', { name: 'Go to John 3:16' }).click();
  await expect(page.getByRole('heading', { name: 'John 3' })).toBeVisible();

  await page.getByRole('button', { name: 'Highlight in yellow' }).click();
  await page.getByRole('button', { name: /John 3:17\./ }).click();
  await page.getByRole('button', { name: 'Note' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Note', exact: true }).fill('God’s purpose is to save.');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('God’s purpose is to save.')).toBeVisible();

  await page.getByRole('button', { name: 'Mark chapter as read' }).click();
  await expect(page.getByText('Counted for today. 1-day streak.')).toBeVisible();
});
