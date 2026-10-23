import { test, expect } from '@playwright/test';

const tree = { name: 'layout.nwk', mimeType: 'text/plain', buffer: Buffer.from('(A:1,B:2);') };
const metadata = { name: 'layout.csv', mimeType: 'text/csv', buffer: Buffer.from('name,group\nA,one\nB,two\n') };
const choose = page => page.locator('input[type=file]').setInputFiles([tree, metadata]);
const open = async page => {
  await choose(page);
  await page.getByRole('button', { name: 'Open dataset', exact: true }).click();
  await expect(page.getByText('Displaying 2 sequences', { exact: true })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  await page.goto('/');
});

test('removes the entire header while retaining the local loading page', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Open a local dataset' })).toBeVisible();
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Source code' })).toHaveCount(0);
  await expect(page.locator('a[href*="github.com/theosanderson"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose files', exact: true }).focus();
  const picker = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await picker).setFiles([tree, metadata]);
  await expect(page.getByRole('button', { name: 'Open dataset', exact: true })).toBeEnabled();
  await expect(page.locator('header')).toHaveCount(0);
});

test('places Open another dataset beneath the count and preserves viewer settings', async ({ page }) => {
  await open(page);
  const count = page.getByText('Displaying 2 sequences', { exact: true });
  const reopen = page.getByRole('button', { name: 'Open another dataset', exact: true });
  await expect(reopen).toBeVisible();
  await expect(page.locator('a[href="https://taxonium.org"]')).toHaveCount(0);
  expect(await count.evaluate(element => element.nextElementSibling?.textContent?.trim())).toBe('Open another dataset');
  await expect(page.getByRole('combobox', { name: 'Tree layout', exact: true })).toBeVisible();
  await page.getByTitle('Settings', { exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Appearance', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await reopen.click();
  await expect(page.getByRole('heading', { name: 'Open a local dataset' })).toBeVisible();
  await expect(page.getByText('Selected files', { exact: true })).toHaveCount(0);
  await expect(page.locator('header')).toHaveCount(0);
});

test('the viewer resizes without empty header space in both orientations and short or narrow windows', async ({ page }) => {
  await open(page);
  for (const size of [{ width: 1440, height: 1000 }, { width: 900, height: 480 }, { width: 390, height: 844 }, { width: 390, height: 480 }]) {
    await page.setViewportSize(size);
    for (const layout of ['standard', 'rotated']) {
      const selector = page.getByRole('combobox', { name: 'Tree layout', exact: true });
      await selector.selectOption(layout);
      await expect(selector).toHaveValue(layout);
      const canvas = await page.locator('canvas').first().boundingBox();
      expect(canvas?.width).toBeGreaterThan(0);
      expect(canvas?.height).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('header')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Open another dataset', exact: true })).toBeVisible();
    }
  }
});
