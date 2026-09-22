import { test, expect } from '@playwright/test';

async function seed(page, count = 0) {
  await page.goto('/');
  await page.evaluate(async count => {
    const ledger = await import('/js/store.js');
    await ledger.initStore();
    await ledger.setupStarterData();
    if (count) {
      const { listAccounts } = await import('/js/accounts.js');
      const { listCategories } = await import('/js/categories.js');
      const { atomicWrite, Stores } = await import('/js/db.js');
      const accounts = await listAccounts(), cats = await listCategories('expense');
      const date = new Date().toLocaleDateString('sv-SE');
      await atomicWrite([Stores.TRANSACTIONS], stores => {
        for (let i = 0; i < count; i++) stores[Stores.TRANSACTIONS].put({
          uid: 'test-' + i, type: 'expense', amountCents: 101 + i,
          date, createdAt: Date.now() + i, updatedAt: Date.now(),
          accountId: accounts[i % 2].id, categoryId: cats[i % cats.length].id, note: '布局测试'
        });
      });
    }
  }, count);
}
const go = async (page, route) => {
  await page.goto('/#' + route);
  await page.locator('#view').evaluate(el => el.scrollTop = 0);
  await expect(page.locator('#view')).not.toBeEmpty();
  await expect(page.locator('#view')).not.toHaveClass(/route-enter/);
};

test('account selection matches saved record, rapid double-save creates one, edit persists amount', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await seed(page);
  await go(page, '/add');
  const chips = page.locator('.acct-chip');
  await chips.nth(1).click();
  await expect(chips.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(chips.nth(0)).toHaveAttribute('aria-checked', 'false');
  await page.locator('.kb-key', { hasText: /^1$/ }).click();
  await page.locator('.kb-key', { hasText: /^0$/ }).click();
  await page.locator('.kb-done').evaluate(button => { button.click(); button.click(); });
  await expect(page).toHaveURL(/#\/$/);
  const tx = await page.evaluate(async () => (await (await import('/js/store.js')).getAllTransactions()));
  expect(tx).toHaveLength(1);
  const bankId = await page.evaluate(async () => (await (await import('/js/accounts.js')).listAccounts())[1].id);
  expect(tx[0].accountId).toBe(bankId);
  await go(page, '/edit/' + tx[0].id);
  await page.locator('.kb-key.danger').click(); await page.locator('.kb-key.danger').click();
  await page.locator('.kb-key', { hasText: /^2$/ }).click(); await page.locator('.kb-key', { hasText: /^5$/ }).click();
  await page.locator('.kb-done').click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await page.evaluate(async id => (await (await import('/js/store.js')).getTransaction(id)).amountCents, tx[0].id)).toBe(2500);
  expect(errors).toEqual([]);
});

for (const [width, height] of [[360,640],[412,906],[480,1056]]) {
  test(`mobile layout ${width}x${height}: all category rows, keyboard and pages fit`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await seed(page, 220);
    await go(page, '/add');
    const labels = page.locator('.tile-page').first().locator('.t-label');
    await expect(labels).toHaveCount(10);
    await expect(labels.last()).toBeInViewport();
    await expect(page.locator('.kb-done')).toBeInViewport();
    await expect(page.locator('.acct-row')).toBeInViewport();
    const bounds = await page.locator('.cat-section').evaluate(el => {
      const label = el.querySelector('.tile-page .cat-tile:last-child').getBoundingClientRect();
      const area = el.getBoundingClientRect();
      return { bottom: label.bottom, edge: area.bottom };
    });
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.edge);
    await page.screenshot({ path: info.outputPath('add.png'), fullPage: true });
    for (const route of ['/', '/stats', '/accounts', '/assets', '/settings', '/categories/new/expense']) {
      await go(page, route);
      await expect(page.locator('#view')).not.toContainText('加载失败');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath(route.replaceAll('/', '-') + '.png'), fullPage: true });
    }
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
    await expect(page.locator('.category-editor-action.primary')).toBeInViewport();
  });
}

test('dark theme, 200 records, enlarged fonts and rapid navigation remain usable', async ({ page }, info) => {
  await seed(page, 220);
  await page.evaluate(async () => (await import('/js/theme.js')).setThemeKey('dark'));
  await go(page, '/');
  await expect(page.locator('.tx-item')).toHaveCount(200);
  const colors = await page.locator('.tabbar').evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--card').trim()]);
  expect(colors[0]).not.toBe('rgb(255, 255, 255)');
  await go(page, '/add');
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; document.body.style.fontSize = '20px'; });
  await expect(page.locator('.kb-done')).toBeInViewport();
  await page.screenshot({ path: info.outputPath('dark-add.png'), fullPage: true });
  await page.evaluate(async () => {
    const { router } = await import('/js/router.js');
    for (const route of ['/stats','/settings','/add']) { location.hash = '#' + route; router.dispatch(); }
  });
  await expect(page.locator('.kb-done')).toHaveCount(1);
  await expect(page.locator('.profile-head')).toHaveCount(0);
  await expect(page.locator('.stats-intro')).toHaveCount(0);
});

test('backup export/import and recovery display actual counts without focusing keyboard', async ({ page }) => {
  await seed(page, 2); await go(page, '/settings');
  await page.locator('.backup-actions .btn').first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '普通 JSON', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/accounting-backup-.*\.json/);
  await expect(page.locator('.backup-status')).toContainText('2 笔');
  await page.evaluate(async () => {
    const ledger = await import('/js/store.js');
    const tx = await ledger.getAllTransactions(); await ledger.deleteTransaction(tx[0].id);
  });
  await go(page, '/settings');
  await page.getByRole('button', { name: '本机恢复点', exact: true }).click();
  await expect(page.locator('.recovery-item')).toContainText('2 笔');
  await expect(page.locator('.recovery-item')).not.toContainText('undefined');
  await page.getByRole('button', { name: '恢复所选', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/js/store.js')).countTransactions())).toBe(2);
  await expect(page.locator('.profile-streak')).toContainText('2 笔');
});

test('offline reload and reduced-motion mode keep add form functional', async ({ page, context }) => {
  await seed(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.evaluate(async () => { if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once:true })); });
  await context.setOffline(true);
  await go(page, '/add');
  await expect(page.locator('.tile-page').first().locator('.cat-tile')).toHaveCount(10);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animation = await page.locator('#view').evaluate(el => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
  await expect(page.locator('.kb-done')).toBeVisible();
});

test('downloaded JSON restores through the real file picker with preflight and confirmation', async ({ page }) => {
  await seed(page, 2); await go(page, '/settings');
  await page.locator('.backup-actions .btn').first().click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '普通 JSON', exact: true }).click();
  const download = await pending;
  await expect(page.locator('.backup-status')).toContainText('2 笔');
  await page.evaluate(async () => {
    const store = await import('/js/store.js');
    await store.deleteTransaction((await store.getAllTransactions())[0].id);
  });
  await go(page, '/settings');
  await page.locator('input[type=file]').first().setInputFiles(await download.path());
  await expect(page.getByRole('dialog')).toContainText('文件完整性校验通过');
  await page.getByRole('button', { name: '完全替换', exact: true }).click();
  await page.getByRole('button', { name: '确认替换', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/js/store.js')).countTransactions())).toBe(2);
  await expect(page.locator('.profile-streak')).toContainText('2 笔');
  const total = await page.evaluate(async () => (await (await import('/js/store.js')).getAllTransactions()).reduce((sum, tx) => sum + tx.amountCents, 0));
  expect(total).toBe(203);
});

test('a waiting update cannot reload or activate while the user is entering a transaction', async ({ page }) => {
  await page.addInitScript(() => {
    const controller = new EventTarget();
    const waiting = { state: 'installed', postMessage: message => { window.updateMessage = message; } };
    controller.controller = {};
    controller.register = async () => ({ waiting, addEventListener() {} });
    Object.defineProperty(navigator, 'serviceWorker', { value: controller });
    window.testController = controller;
  });
  await page.goto('/#/add');
  await page.getByRole('button', { name: '稍后', exact: true }).click();
  await page.locator('.kb-key', { hasText: /^1$/ }).click();
  await page.locator('.kb-key', { hasText: /^2$/ }).click();
  await page.evaluate(() => window.testController.dispatchEvent(new Event('controllerchange')));
  await expect(page.locator('.amt-val')).toHaveText('12');
  await page.evaluate(async () => (await import('/js/pwa.js')).registerPWA());
  await page.getByRole('button', { name: '立即更新', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('请先保存或退出');
  expect(await page.evaluate(() => window.updateMessage)).toBeUndefined();
  await expect(page.locator('.amt-val')).toHaveText('12');
});
