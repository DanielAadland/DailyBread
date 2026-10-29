import { expect, test, type Page } from '@playwright/test';

async function signUp(page: Page, name: string, email: string) {
  await page.goto('/sign-up');
  await page.getByRole('textbox', { name: 'Your name' }).fill(name);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('checkbox', { name: 'I am 13 or older' }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page.getByRole('heading', { name: 'Today’s reading' })).toBeVisible();
}

/** Demo mode puts you in "Morning Psalms" (Psalms in 30 Days, on day 5) with Sam, Maria and Jo. */
test('group plan: read the day, talk about it, see who has read, cheer someone on', async ({ page }) => {
  await signUp(page, 'Anna', 'anna.groups@example.com');

  await page.goto('/feed/groups');
  await page.getByRole('link', { name: 'Open Morning Psalms' }).first().click();
  await expect(page.getByRole('heading', { name: 'Morning Psalms' }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reading together' }).getByText('2 of 4 read today')).toBeVisible();

  // Read the group's day; the plan starts on the way.
  await page.getByRole('button', { name: 'Read day 5' }).first().click();
  await expect(page.getByRole('heading', { name: 'Psalms 21–25' }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mark day 5 as read' }).first().click();
  await expect(page.getByRole('heading', { name: 'Day 5 done' }).filter({ visible: true }).first()).toBeVisible();

  // Talk about it in the day's thread.
  await page.getByRole('button', { name: 'Talk about it in Morning Psalms' }).first().click();
  await expect(page.getByText('Psalm 23 never gets old', { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Your thoughts on today’s reading' }).or(page.getByRole('textbox', { name: "Your thoughts on today's reading" })).first().fill('The Lord is my shepherd stayed with me all day.');
  await page.getByRole('button', { name: 'Send' }).first().click();
  await expect(page.getByText('The Lord is my shepherd stayed with me all day.').filter({ visible: true }).first()).toBeVisible();

  // Who has read: now 3 of 4. Cheer Jo on, once.
  await page.goto('/feed/groups/demo-g-psalms');
  await expect(page.getByRole('region', { name: 'Reading together' }).getByText('3 of 4 read today')).toBeVisible();
  await page.goto('/feed/groups/demo-g-psalms/members');
  await page.getByRole('button', { name: 'Cheer Jo on' }).first().click();
  await expect(page.getByText('Cheered on').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cheer Jo on' })).toHaveCount(0);
});

test('start a group, share its invite link, and join a public group', async ({ page }) => {
  await signUp(page, 'Ben', 'ben.groups@example.com');

  await page.goto('/feed/groups/new');
  await page.getByRole('textbox', { name: 'Group name' }).fill('Thursday youth group');
  await page.getByRole('radio', { name: /^Friends/ }).first().click();
  await page.getByRole('radio', { name: /^Proverbs in a Month/ }).first().click();
  await page.getByRole('radio', { name: 'Today' }).first().click();
  await page.getByRole('button', { name: 'Create group' }).click();

  await expect(page.getByRole('heading', { name: 'Thursday youth group' }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Day 1 of 31 · Proverbs in a Month').filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Invite people' }).first().click();
  await expect(page.getByText(/\/join\/[a-z0-9]{10}$/).filter({ visible: true }).first()).toBeVisible();

  // Opening my own invite link takes me straight to the group.
  const link = await page.getByText(/\/join\/[a-z0-9]{10}$/).first().textContent();
  await page.goto(new URL(link!).pathname);
  await expect(page.getByRole('heading', { name: 'Thursday youth group' }).filter({ visible: true }).first()).toBeVisible();

  // Discover and join a public group.
  await page.goto('/feed/groups');
  await page.getByRole('button', { name: 'Join Gospels in 30 Days readers' }).first().click();
  await expect(page.getByRole('heading', { name: 'Gospels in 30 Days readers' }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite people' }).filter({ visible: true }).first()).toBeVisible();

  // Post to the group from the composer; it shows in the group, labelled in the feed.
  await page.getByRole('link', { name: 'Write in the group' }).first().click();
  await page.getByRole('textbox', { name: 'What would you like prayer for?' }).first().fill('Exams next week, thank you for praying.');
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Exams next week, thank you for praying.').filter({ visible: true }).first()).toBeVisible();
  await page.goto('/feed');
  await expect(page.getByRole('link', { name: 'Posted in Gospels in 30 Days readers. Open the group' }).filter({ visible: true }).first()).toBeVisible();
});
