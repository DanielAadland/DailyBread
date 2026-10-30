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

const visible = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();

/** Demo mode: Sam (whom you follow) made a card 9 hours ago, so today's set is his card plus 7 curated ones. */
test("today's cards: a small set, then done for today", async ({ page }) => {
  await signUp(page, 'Anna', 'anna.cards@example.com');
  await expect(visible(page, '8 cards for today')).toBeVisible();
  await page.getByRole('link', { name: 'Open today’s cards' }).filter({ visible: true }).first().click();

  await expect(visible(page, /^From Sam,/)).toBeVisible();
  await expect(page.getByLabel('Card 1 of 8')).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
  }
  await expect(page.getByRole('heading', { name: 'You’re done for today' })).toBeInViewport();
  await page.getByRole('button', { name: 'Back to Today' }).click();
  await expect(visible(page, 'Done for today')).toBeVisible();
});

test('make a verse card, save it as an image and post it', async ({ page }) => {
  await signUp(page, 'Ben', 'ben.cards@example.com');
  await page.goto('/cards/new?passage=PSA.23.4');
  await expect(page.getByRole('img', { name: /Even though I walk through the valley/ })).toBeVisible();

  await page.getByRole('radio', { name: 'Night sky' }).click();
  await expect(page.getByRole('radio', { name: 'Night sky' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Italic' }).click();
  await page.getByRole('textbox', { name: 'Your words (optional)' }).fill('For a friend in hospital.');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('psalm-23-4-bsb.png');

  await page.getByRole('button', { name: 'Post card' }).click();
  const post = page.getByRole('article', { name: 'Verse card by Ben' }).filter({ visible: true }).first();
  await expect(post.getByText('For a friend in hospital.')).toBeVisible();
  await expect(post.getByRole('img', { name: /Even though I walk through the valley/ })).toBeVisible();
});
