import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Shanghai' });
async function seed(page, count = 0) {
  await page.goto('/');
  return page.evaluate(async count => {
    const ledger = await import('/js/store.js');
    await ledger.initStore(); await ledger.setupStarterData();
    const accounts = await (await import('/js/accounts.js')).listAccounts();
    const cats = await (await import('/js/categories.js')).listCategories('expense');
    const incomes = await (await import('/js/categories.js')).listCategories('income');
    const { atomicWrite, Stores } = await import('/js/db.js');
    await atomicWrite([Stores.TRANSACTIONS], stores => {
      for (let i = 0; i < count; i++) stores[Stores.TRANSACTIONS].put({
        uid: 'review-' + i, type: 'expense', amountCents: 101, date: '2024-05-15',
        createdAt: 1000 + i, updatedAt: 1000 + i, accountId: accounts[0].id,
        categoryId: cats[0].id, note: '对账记录 ' + i
      });
    });
    return { account: accounts[0], target: accounts[1], category: cats[0], income: incomes[0] };
  }, count);
}
async function go(page, hash) {
  await page.goto('/#' + hash);
  await expect(page.locator('#view')).not.toBeEmpty();
  await expect(page.locator('#view')).not.toHaveClass(/route-enter/);
}
const count = page => page.evaluate(async () => (await import('/js/store.js')).countTransactions());

test('all daily totals, amount/category search, years and invalid summaries remain correct', async ({ page }, info) => {
  const fixture = await seed(page, 205);
  await go(page, '/');
  await expect(page.locator('.tx-item')).toHaveCount(200);
  await expect(page.locator('.day-expense')).toHaveText('支出¥207.05');
  await expect(page.locator('.tx-date-label')).toContainText('2024年');
  await go(page, '/transactions?mode=search');
  await page.getByLabel('按分类筛选').selectOption(fixture.category.id);
  await page.getByLabel('最低金额').fill('1.01'); await page.getByLabel('最低金额').dispatchEvent('change');
  await page.getByLabel('最高金额', { exact: true }).fill('1.01'); await page.getByLabel('最高金额', { exact: true }).dispatchEvent('change');
  await expect(page.locator('.history-totals')).toContainText('支出 ¥207.05');
  await expect(page.locator('.day-expense')).toHaveText('支出 ¥207.05');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.day-expense')).toHaveText('支出 ¥207.05');
  await page.reload(); await expect(page.locator('.transaction-result-summary')).toContainText('第 2 / 5 页');
  await expect(page.getByLabel('按分类筛选')).toHaveValue(fixture.category.id);
  await page.getByLabel('开始日期').fill('2025-01-01'); await page.getByLabel('结束日期').fill('2024-12-31');
  await expect(page.locator('.empty')).toContainText('开始日期不能晚于结束日期');
  await expect(page.locator('.transaction-result-summary')).toBeEmpty();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.getByLabel('最低金额').fill('abc'); await page.getByLabel('最低金额').dispatchEvent('change');
  await expect(page.locator('.empty')).toContainText('请输入有效金额');
  await expect(page.locator('.transaction-result-summary')).toBeEmpty();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.screenshot({ path: info.outputPath('search-412.png'), fullPage: false });
});

test('readonly detail and editing return to filters, page and scroll; deletion clamps the last page', async ({ page }) => {
  await seed(page, 51);
  await go(page, '/transactions?mode=search&q=对账记录&page=1');
  await expect(page.locator('.tx-item')).toHaveCount(1);
  await page.locator('.tx-item').first().click();
  await expect(page.getByRole('heading', { name: '账单详情' })).toBeVisible();
  await expect(page.locator('.kb4')).toHaveCount(0);
  await page.getByRole('link', { name: '编辑账单', exact: true }).click();
  await page.locator('.kb-key.danger').evaluate(button => { for (let i = 0; i < 4; i++) button.click(); });
  await page.locator('.kb-key', { hasText: /^2$/ }).click();
  await page.locator('.kb-done').click();
  await expect(page.locator('.transaction-result-summary')).toContainText('第 2 / 2 页');
  await expect(page.getByRole('searchbox')).toHaveValue('对账记录');
  await expect(page.locator('.day-expense')).toHaveText('支出 ¥52.50');
  await page.locator('.tx-item').click();
  await page.getByRole('link', { name: '编辑账单', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).last().click();
  await expect(page.locator('.tx-item')).toHaveCount(50);
  await expect(page.locator('.transaction-result-summary')).toContainText('第 1 / 1 页');
  expect(await count(page)).toBe(50);
  await page.evaluate(() => window.scrollTo(0, 950));
  const scroll = await page.evaluate(() => window.scrollY);
  await page.locator('.tx-item').nth(13).click();
  await page.getByRole('link', { name: '返回流水', exact: true }).click();
  await expect(page.locator('.tx-item')).toHaveCount(50);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scroll - 100);
});

test('future dates are marked and automatically join actual totals on calendar rollover, without reminders', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-10-05T10:00:00+08:00') });
  const fixture = await seed(page);
  await page.evaluate(async fixture => {
    const store = await import('/js/store.js');
    await store.addTransaction({ type: 'expense', amount: '10', date: '2026-10-05', accountId: fixture.account.id, categoryId: fixture.category.id });
    await store.addTransaction({ type: 'income', amount: '500', date: '2026-10-06', accountId: fixture.account.id, categoryId: fixture.income.id });
  }, fixture);
  await go(page, '/');
  await expect(page.locator('.future-date')).toHaveCount(1);
  await expect(page.locator('.gauge-foot')).toContainText('收入 ¥0.00');
  expect(await page.evaluate(async () => (await import('/js/store.js')).getTotalBalance())).toBe(-10);
  await page.clock.fastForward('24:00:00');
  await expect(page.locator('.future-date')).toHaveCount(0);
  await expect(page.locator('.gauge-foot')).toContainText('收入 ¥500.00');
  expect(await page.evaluate(async () => (await import('/js/store.js')).getTotalBalance())).toBe(490);
  await expect(page.locator('.modal-mask')).toHaveCount(0);
  await go(page, '/add');
  await expect(page.locator('.meta-row')).not.toContainText('null');
  await page.locator('input[type=date]').fill('2028-01-01');
  await expect(page.locator('.meta-date-btn')).toContainText('2028年1月1日未来日期');
  await page.setViewportSize({ width: 360, height: 640 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('future-add-360.png'), fullPage: true });
});

test('real Excel file requires explicit decisions for unknown and missing types, cancellation writes nothing', async ({ page }) => {
  const fixture = await seed(page);
  await go(page, '/settings');
  await page.addScriptTag({ url: '/js/lib/xlsx.full.min.js' });
  const base64 = await page.evaluate(fixture => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['记账日期', '记账类型', '金额', '分类', '流出账户', '流入账户', '备注'],
      ['2024-05-15', '退款', 12.34, '迁移分类', fixture.account.name, '', '待确认退款'],
      [],
      ['2024-05-16', '', 5, '迁移分类', fixture.account.name, '', '缺失类型'],
      ['2024-05-17', '支出', 1.01, fixture.category.name, fixture.account.name, '', '标准类型']
    ]), '流水');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, fixture);
  const file = { name: 'type-review.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(base64, 'base64') };
  await page.locator('input[type=file]').nth(1).setInputFiles(file);
  await expect(page.getByRole('heading', { name: '需要确认（2 条）', exact: true })).toBeVisible();
  await expect(page.getByLabel('第 2 行类型')).toHaveValue('');
  await expect(page.getByLabel('第 4 行类型')).toHaveValue('');
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('INPUT');
  await page.getByRole('button', { name: '确认类型', exact: true }).click();
  expect(await count(page)).toBe(0);
  await expect(page.locator('.import-confirmation-list')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.modal-mask')).toHaveCount(0);
  expect(await count(page)).toBe(0);
  await page.locator('input[type=file]').nth(1).setInputFiles(file);
  await page.getByLabel('第 2 行类型').selectOption('income');
  await page.getByLabel('第 4 行类型').selectOption('expense');
  await page.getByRole('button', { name: '确认类型', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入预览', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成', exact: true })).toBeVisible();
  expect(await count(page)).toBe(3);
  const types = await page.evaluate(async () => (await (await import('/js/store.js')).getAllTransactions()).map(row => row.type));
  expect(types.sort()).toEqual(['expense', 'expense', 'income']);
});

test('account full history and archived statistics retain the selected year and account', async ({ page }) => {
  const fixture = await seed(page, 51);
  await page.evaluate(async fixture => {
    await (await import('/js/store.js')).transferMoney({ fromId: fixture.target.id, toId: fixture.account.id, amount: '3', date: '2024-05-15' });
    await (await import('/js/accounts.js')).archiveAccount(fixture.account.id);
  }, fixture);
  await go(page, '/accounts/' + fixture.account.id + '?year=2024');
  await expect(page.locator('.card-title').last()).toContainText('最近20笔 · 共52笔');
  await page.getByRole('link', { name: '查看全部 ›', exact: true }).click();
  await expect(page.locator('.transaction-result-summary')).toContainText('共 52 笔');
  await expect(page.locator('.tx-item').first()).toContainText('转入');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.locator('.tx-item').last().click();
  await page.getByRole('link', { name: '返回流水', exact: true }).click();
  await expect(page.locator('.transaction-result-summary')).toContainText('第 2 / 2 页');
  await page.getByRole('link', { name: '返回账户', exact: true }).click();
  await expect(page.locator('.range-label')).toHaveText('2024年');
  await go(page, '/stats?period=year&type=expense&from=2024-01-01&to=2024-12-31&account=' + fixture.account.id);
  await expect(page.locator('.stats-account-chips .active')).toContainText('已归档');
  await expect(page.locator('.cat-rank-link')).toContainText('¥51.51');
});

test('budget month links, copy and historical gauge labels are coherent', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T10:00:00+08:00') });
  await seed(page);
  await page.evaluate(async () => {
    const store = await import('/js/store.js');
    await store.setBudget('2026-09', '1234.56'); await store.setBudget('2026-08', '200');
  });
  await go(page, '/');
  await page.getByRole('button', { name: '1 个月前', exact: true }).click();
  await expect(page.locator('.gauge-title')).toHaveText('2026年09月预算');
  await expect(page.locator('.gauge-card')).not.toHaveClass(/is-empty/);
  await expect(page.locator('.gauge-card')).toContainText('该月已消费');
  await page.locator('.gauge-title').click();
  await expect(page).toHaveURL(/month=2026-09/);
  await expect(page.locator('.budget-hero')).toContainText('¥1,234.56');
  await page.getByRole('link', { name: '下个月', exact: true }).click();
  await page.getByRole('button', { name: '复制上月预算', exact: true }).click();
  await expect(page.locator('.modal input')).toHaveValue('1234.56');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.budget-hero')).toContainText('¥1,234.56');
  await page.getByRole('link', { name: '查看2026年8月预算', exact: true }).click();
  await expect(page.locator('.budget-hero')).toContainText('2026年8月');
  await expect(page.locator('.budget-hero')).toContainText('¥200.00');
});

test('category identities keep colors as ranking changes and dark icons gain contrast', async ({ page }) => {
  const fixture = await seed(page, 1);
  await page.evaluate(async fixture => {
    const cats = await (await import('/js/categories.js')).listCategories('expense');
    await (await import('/js/categories.js')).updateCategory(fixture.category.id, { color: '#374151' });
    await (await import('/js/store.js')).addTransaction({ type: 'expense', amount: '5', date: '2024-05-15', accountId: fixture.account.id, categoryId: cats[1].id });
  }, fixture);
  const route = '/stats?period=month&type=expense&from=2024-05-01&to=2024-05-31';
  await go(page, route);
  const rank = page.getByRole('link', { name: '查看' + fixture.category.name + '的支出流水', exact: true });
  const color = await rank.locator('.icon').evaluate(node => getComputedStyle(node).color);
  await page.evaluate(async fixture => {
    await (await import('/js/store.js')).addTransaction({ type: 'expense', amount: '100', date: '2024-05-15', accountId: fixture.account.id, categoryId: fixture.category.id });
  }, fixture);
  await go(page, route);
  expect(await rank.locator('.icon').evaluate(node => getComputedStyle(node).color)).toBe(color);
  await page.evaluate(async () => (await import('/js/theme.js')).setThemeKey('dark'));
  await expect.poll(() => rank.locator('.icon').evaluate(node => getComputedStyle(node).color)).not.toBe(color);
  expect(await rank.locator('.icon').evaluate(node => getComputedStyle(node).color)).toBe(await rank.locator('.bar i').evaluate(node => getComputedStyle(node).backgroundColor));
});

test('My consolidates data tools and hides destructive operations; user help has no developer commands', async ({ page }, info) => {
  await seed(page);
  await go(page, '/settings');
  await expect(page.locator('.quick-tile')).toHaveCount(4);
  await expect(page.locator('.na-card, .goal-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '清空所有数据', exact: true })).not.toBeVisible();
  await page.getByText('危险操作', { exact: true }).click();
  await expect(page.getByRole('button', { name: '先导出备份', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清空所有数据', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.setting-item', { hasText: '安装到手机主屏' }).click();
  await expect(page.locator('.modal')).not.toContainText('python');
  await expect(page.locator('.modal')).toContainText('换手机');
  await page.getByRole('button', { name: '知道了', exact: true }).click();
  for (const [width, height] of [[360,640], [412,906], [480,1056]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('my-' + width + '.png'), fullPage: true });
  }
});

test('delayed reads and ten rapid switches cannot overwrite gauge, asset year or account tab', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-05T10:00:00+08:00') });
  await page.addInitScript(() => {
    window.__heldReads = [];
    window.__delayKey = '';
    window.__testDelay = (name, key) => name + ':' + key === window.__delayKey
      ? new Promise(resolve => window.__heldReads.push(resolve)) : Promise.resolve();
    window.__releaseReads = () => { window.__delayKey = ''; window.__heldReads.splice(0).forEach(resolve => resolve()); };
  });
  // Only the isolated browser receives these delays; production files remain unchanged.
  await page.route('**/js/store.js', async route => {
    const response = await route.fetch();
    let body = await response.text();
    for (const [signature, name, key] of [
      ['export async function monthlySummary(monthKey, accountId) {', 'monthlySummary', 'monthKey'],
      ['export async function monthlyAssetTrend(year) {', 'monthlyAssetTrend', 'year'],
      ['export async function sumByType(dateFrom, dateTo, accountId) {', 'sumByType', 'dateFrom']
    ]) {
      expect(body).toContain(signature);
      body = body.replace(signature, signature + `\n await globalThis.__testDelay?.('${name}', ${key});`);
    }
    await route.fulfill({ response, body });
  });
  const fixture = await seed(page, 2);
  await page.evaluate(async () => { await (await import('/js/store.js')).setBudget('2026-10', '200'); });
  // Use hash navigation so the deliberately held reads share this one JS lifetime.
  const navigate = async hash => {
    await page.evaluate(hash => { location.hash = hash; }, hash);
    await expect(page.locator('#view')).not.toHaveClass(/route-enter/);
  };
  await navigate('#/');
  await expect(page.locator('.gauge-title')).toContainText('本月预算');
  await page.evaluate(() => {
    window.__delayKey = 'monthlySummary:2026-09';
    for (let i = 0; i < 10; i++) document.querySelector(i % 2 === 0 ? '.g-dot[aria-label="1 个月前"]' : '.g-dot[aria-label="本月"]').click();
  });
  await expect.poll(() => page.evaluate(() => window.__heldReads.length)).toBe(5);
  await expect(page.locator('.gauge-card')).toHaveAttribute('data-month', '2026-10');
  await page.evaluate(() => window.__releaseReads());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await expect(page.locator('.gauge-title')).toContainText('本月预算');
  await expect(page.locator('.gauge-card')).not.toHaveClass(/is-empty/);
  await navigate('#/assets?year=2026');
  await expect(page.locator('.asset-chart-card canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector('.asset-chart-card canvas')?._chartPointerBound)).toBe(true);
  await page.evaluate(() => { window.__oldCanvas = document.querySelector('.asset-chart-card canvas'); window.__delayKey = 'monthlyAssetTrend:2025'; });
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: i % 2 === 0 ? '上一年' : '下一年', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__heldReads.length)).toBe(5);
  await expect(page.locator('.asset-chart-card canvas')).toHaveAttribute('aria-label', /^2026年/);
  expect(await page.evaluate(() => window.__oldCanvas._chartPointerController)).toBeNull();
  await page.evaluate(() => window.__releaseReads());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await expect(page.locator('.asset-chart-card')).toHaveCount(1);
  await expect(page.locator('.year-nav .range-label')).toHaveText('2026年');
  expect(await page.evaluate(() => document.querySelector('.asset-chart-card canvas')._chartHit.count)).toBe(10);
  await navigate('#/accounts/' + fixture.account.id + '?year=2026');
  await expect(page.locator('.tab-content canvas')).toBeVisible();
  await page.evaluate(() => { window.__delayKey = 'sumByType:2025-01-01'; });
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: i % 2 === 0 ? '上一年' : '下一年', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__heldReads.length)).toBe(5);
  await expect(page.locator('.tab-content canvas')).toHaveAttribute('aria-label', /^2026年/);
  await page.evaluate(() => window.__releaseReads());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await expect(page.locator('.tab-content canvas')).toHaveCount(1);
  await expect(page.locator('.range-label')).toHaveText('2026年');
  await page.evaluate(() => { window.__delayKey = 'sumByType:2025-01-01'; });
  await page.getByRole('button', { name: '上一年', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__heldReads.length)).toBe(1);
  await page.getByRole('button', { name: '编辑信息', exact: true }).click();
  await page.evaluate(() => window.__releaseReads());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await expect(page.getByLabel('账户名称')).toBeVisible();
  await expect(page.locator('.tab-content canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
