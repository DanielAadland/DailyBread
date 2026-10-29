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

/** Demo mode seeds a few people: you follow Sam, Sam follows you, Jo has asked to follow you. */
test('feed: react, comment, accept a follow request, and reach the end', async ({ page }) => {
  await signUp(page, 'Anna', 'anna.social@example.com');
  await page.getByRole('tab', { name: /Friends/ }).click();

  const feed = page.getByRole('main').or(page.locator('body'));
  await expect(feed.getByText('Be still and know that I am God', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You’re all caught up' }).or(page.getByRole('heading', { name: "You're all caught up" })).first()).toBeVisible();

  // React with Amen on Sam's verse post.
  const samPost = page.getByRole('article', { name: 'Verses by Sam' }).first();
  await samPost.getByRole('button', { name: /^Amen/ }).click();
  await expect(samPost.getByRole('button', { name: 'Amen, 2' })).toHaveAttribute('aria-pressed', 'true');

  // Comment on it.
  await samPost.getByRole('link', { name: /comment/ }).click();
  await page.getByRole('textbox', { name: 'Add a comment' }).first().fill('Thank you for sharing this.');
  await page.getByRole('button', { name: 'Send' }).first().click();
  await expect(page.getByText('Thank you for sharing this.').first()).toBeVisible();

  // Notifications: accept Jo's request.
  await page.goto('/feed/notifications');
  await expect(page.getByText('Jo asked to follow you').first()).toBeVisible();
  await page.getByRole('button', { name: 'Accept Jo' }).first().click();
  await expect(page.getByRole('button', { name: 'Accept Jo' })).toHaveCount(0);
  await page.goto('/feed/people?tab=followers');
  await expect(page.getByRole('link', { name: "Open Jo's profile" }).first()).toBeVisible();
});

test('share verses from the reader; links are refused; report a post', async ({ page }) => {
  await signUp(page, 'Ben', 'ben.social@example.com');

  // Select John 3:16 in the reader and share it.
  await page.goto('/read/JHN/3?verse=16');
  await page.getByRole('button', { name: 'Share as a post' }).first().click();
  await expect(page.getByRole('heading', { name: 'Share verses' })).toBeVisible();
  await expect(page.getByText('For God so loved the world', { exact: false }).first()).toBeVisible();

  // Links are not allowed.
  await page.getByRole('textbox', { name: 'Your thoughts (optional)' }).fill('More at example.com/verses');
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Links aren’t allowed', { exact: false }).or(page.getByText("Links aren't allowed", { exact: false })).first()).toBeVisible();

  await page.getByRole('textbox', { name: 'Your thoughts (optional)' }).fill('My favourite verse.');
  await page.getByRole('button', { name: 'Post' }).click();
  const mine = page.getByRole('article', { name: 'Verses by Ben' }).first();
  await expect(mine.getByText('My favourite verse.')).toBeVisible();

  // Report someone else's post.
  const samPost = page.getByRole('article', { name: 'Verses by Sam' }).first();
  await samPost.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Report post' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Spam or advertising' }).click();
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByRole('heading', { name: 'Thank you' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
});
