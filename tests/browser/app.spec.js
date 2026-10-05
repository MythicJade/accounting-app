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

test('bill search lives in My, while the detail page keeps a non-search history entry', async ({ page }) => {
  await seed(page, 2);
  await go(page, '/');
  await expect(page.locator('.home-search')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '全部流水 ›', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '全部流水 ›', exact: true }).click();
  await expect(page.locator('.transaction-search-input')).toHaveCount(0);
  await go(page, '/settings');
  await expect(page.locator('.quick-tile', { hasText: '安装/帮助' })).toHaveCount(0);
  await page.getByRole('button', { name: '搜索账单', exact: true }).click();
  await expect(page.getByRole('heading', { name: '搜索账单' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: '搜索流水' })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
  await page.getByRole('searchbox', { name: '搜索流水' }).fill('不存在的备注');
  await expect(page.locator('.transaction-result-summary')).toHaveText('没有符合条件的流水');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.locator('.tx-item')).toHaveCount(2);
  await page.getByRole('link', { name: '返回我的', exact: true }).click();
  await expect(page.locator('.profile-head')).toBeVisible();
});

async function seedCategoryHistory(page) {
  await seed(page);
  return page.evaluate(async () => {
    const { listAccounts } = await import('/js/accounts.js');
    const { listCategories, archiveCategory } = await import('/js/categories.js');
    const { atomicWrite, Stores } = await import('/js/db.js');
    const accounts = await listAccounts();
    const expenses = await listCategories('expense');
    const incomes = await listCategories('income');
    const rows = Array.from({ length: 205 }, (_, i) => ({
      uid: 'category-match-' + i, type: 'expense', amountCents: 101,
      date: '2024-05-15', createdAt: 100000 + i, updatedAt: 100000 + i,
      accountId: accounts[0].id, categoryId: expenses[0].id, note: '匹配记录 ' + i
    }));
    rows.push(
      { ...rows[0], uid: 'other-account', accountId: accounts[1].id, amountCents: 99900, note: '另一个账户' },
      { ...rows[0], uid: 'outside-date', date: '2024-04-30', note: '日期范围外' },
      { ...rows[0], uid: 'other-category', categoryId: expenses[1].id, note: '其他分类' },
      { ...rows[0], uid: 'income-match', type: 'income', categoryId: incomes[0].id, amountCents: 4242, note: '收入记录' }
    );
    await atomicWrite([Stores.TRANSACTIONS], stores => rows.forEach(row => stores[Stores.TRANSACTIONS].put(row)));
    await archiveCategory(expenses[0].id);
    return { accountName: accounts[0].name, expenseName: expenses[0].name, incomeName: incomes[0].name };
  });
}

test('category drilldown preserves custom dates, account and type, reaches every record beyond 200', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = await seedCategoryHistory(page);
  await go(page, '/stats');
  await page.locator('.period-tabs button', { hasText: '自定义' }).click();
  await page.locator('.stats-custom-panel input').nth(0).fill('2024-05-01');
  await page.locator('.stats-custom-panel input').nth(1).fill('2024-05-31');
  await page.locator('.stats-account-chips button', { hasText: fixture.accountName }).click();
  const ranking = page.getByRole('link', { name: '查看' + fixture.expenseName + '的支出流水', exact: true });
  await expect(ranking).toContainText('¥207.05');
  await ranking.click();
  await expect(page.locator('.category-history-total')).toHaveText('205 笔 · 支出合计 ¥207.05');
  await expect(page.locator('.category-history-range')).toHaveText('2024-05-01 至 2024-05-31');
  await expect(page.locator('.category-history-account')).toHaveText('账户：' + fixture.accountName);
  await expect(page.locator('.transaction-filters')).toHaveCount(0);
  await expect(page.locator('.tab[data-route="/stats"]')).toHaveClass(/active/);
  await expect(page.locator('.day-expense')).toHaveText('支出 ¥207.05');
  const notes = [];
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('.tx-item')).toHaveCount(i === 4 ? 5 : 50);
    notes.push(...await page.locator('.tx-note').allTextContents());
    if (i < 4) await page.getByRole('button', { name: '下一页', exact: true }).click();
  }
  expect(new Set(notes).size).toBe(205);
  expect(notes.every(note => note.startsWith('匹配记录 '))).toBe(true);
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator('.category-history-total')).toHaveText('205 笔 · 支出合计 ¥207.05');
  await expect(page.locator('.tx-item')).toHaveCount(5);
  for (const [width, height] of [[360,640],[412,906],[480,1056]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('category-' + width + '.png'), fullPage: true });
  }
  await page.getByRole('link', { name: '返回统计', exact: true }).click();
  await expect(page.locator('.period-tabs .active')).toHaveText('自定义');
  await expect(page.locator('.stats-account-chips .active')).toContainText(fixture.accountName);
  await expect(page.locator('.stats-custom-panel input').nth(0)).toHaveValue('2024-05-01');
  await page.locator('.stats-type-tabs button', { hasText: '收入' }).click();
  await page.getByRole('link', { name: '查看' + fixture.incomeName + '的收入流水', exact: true }).click();
  await expect(page.locator('.category-history-total')).toHaveText('1 笔 · 收入合计 ¥42.42');
  await expect(page.locator('.tx-note')).toHaveText('收入记录');
  expect(errors).toEqual([]);
});

test('category drilldown works offline and rejects invalid or reversed ranges', async ({ page, context }) => {
  const fixture = await seedCategoryHistory(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await go(page, '/stats');
  await page.locator('.period-tabs button', { hasText: /^年$/ }).click();
  const year = Number(await page.locator('.range-nav .label').textContent().then(text => text.slice(0, 4)));
  for (let i = year; i > 2024; i--) await page.getByRole('button', { name: '上一时段', exact: true }).click();
  const rank = page.getByRole('link', { name: '查看' + fixture.expenseName + '的支出流水', exact: true });
  await expect(rank).toContainText('¥1,207.06');
  const href = await rank.getAttribute('href');
  await rank.click();
  await expect(page.locator('.category-history-total')).toHaveText('207 笔 · 支出合计 ¥1,207.06');
  await expect(page.locator('.category-history-range')).toHaveText('2024-01-01 至 2024-12-31');
  await page.goto('/' + href.replace('from=2024-01-01', 'from=not-a-date'));
  await expect(page.locator('#view')).toContainText('筛选条件无效');
  await page.goto('/' + href.replace('from=2024-01-01', 'from=2025-01-01'));
  await expect(page.locator('#view')).toContainText('筛选条件无效');
  await page.getByRole('link', { name: '返回统计', exact: true }).click();
  await expect(page.locator('.stats-intro')).toBeVisible();
});

test('monthly category drilldown agrees with its ranking and remains readable in dark mode', async ({ page }, info) => {
  await seed(page, 220);
  await go(page, '/stats');
  const rank = page.locator('.cat-rank-link').first();
  const rankingAmount = await rank.locator('.amount').textContent();
  const href = await rank.getAttribute('href');
  const expected = await page.evaluate(async href => {
    const [path, search] = href.slice(1).split('?');
    const query = new URLSearchParams(search);
    const rows = await (await import('/js/store.js')).listTransactions({
      categoryId: decodeURIComponent(path.split('/').at(-1)),
      type: query.get('type'), dateFrom: query.get('from'), dateTo: query.get('to')
    });
    return { count: rows.length, from: query.get('from'), to: query.get('to') };
  }, href);
  await rank.click();
  await expect(page.locator('.category-history-total')).toHaveText(expected.count + ' 笔 · 支出合计 ' + rankingAmount);
  await expect(page.locator('.category-history-range')).toHaveText(expected.from + ' 至 ' + expected.to);
  await page.evaluate(async () => (await import('/js/theme.js')).setThemeKey('dark'));
  const themeColors = await page.evaluate(() => {
    const sample = document.createElement('div');
    sample.style.backgroundColor = 'var(--card)';
    sample.style.color = 'var(--text)';
    document.body.appendChild(sample);
    const expected = getComputedStyle(sample);
    const cardColor = expected.backgroundColor, textColor = expected.color;
    sample.remove();
    const row = document.querySelector('.tx-item');
    const back = document.querySelector('.topbar .back');
    return {
      cardColor, textColor,
      rowBackground: getComputedStyle(row).backgroundColor,
      rowText: getComputedStyle(row.querySelector('.name')).color,
      backBackground: getComputedStyle(back).backgroundColor,
      backText: getComputedStyle(back).color
    };
  });
  expect(themeColors.rowBackground).toBe(themeColors.cardColor);
  expect(themeColors.rowText).toBe(themeColors.textColor);
  expect(themeColors.backBackground).toBe(themeColors.cardColor);
  expect(themeColors.backText).toBe(themeColors.textColor);
  await page.screenshot({ path: info.outputPath('dark-category.png'), fullPage: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.goto('/' + href.replace(/from=[^&]+/, 'from=1970-01-01').replace(/to=[^&]+/, 'to=1970-01-01'));
  await expect(page.locator('.category-history-total')).toHaveText('0 笔 · 支出合计 ¥0.00');
  await expect(page.locator('.tx-item')).toHaveCount(0);
  await expect(page.locator('.empty')).toHaveText('该时段没有这个分类的流水');
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
});
