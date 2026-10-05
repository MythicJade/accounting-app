import { test, expect } from '@playwright/test';
import { CATEGORY_ICON_OPTIONS, ICON_GROUPS } from '../../js/category-icons.js';

test.use({ serviceWorkers: 'block' });

async function seed(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const store = await import('/js/store.js');
    await store.initStore(); await store.setupStarterData();
  });
}

test('all native icon paths fit their viewBox, render uniquely, and produce a labeled visual inventory', async ({ page }, info) => {
  await seed(page);
  await page.setViewportSize({ width: 1000, height: 1100 });
  await page.evaluate(async () => {
    const { ICON_GROUPS, ICON_META, categoryIconNode } = await import('/js/category-icons.js');
    document.getElementById('app').hidden = true;
    document.body.style.cssText = 'margin:0;padding:24px;max-width:none;background:var(--bg);';
    const style = document.createElement('style');
    style.textContent = `
      .icon-inventory { max-width:952px;margin:auto;display:grid;grid-template-columns:1fr 1fr;gap:18px; }
      .inventory-title { grid-column:1/-1; font-size:22px;color:var(--text);line-height:1.8; }
      .inventory-card { background:var(--card);border-radius:20px;padding:20px; }
      .inventory-card h2 { font-size:17px;margin:0 0 18px;color:var(--text); }
      .inventory-grid { display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px 8px; }
      .inventory-tile { text-align:center;min-width:0;color:var(--text-2); }
      .inventory-tile > div { width:50px;height:50px;margin:0 auto 6px;display:grid;place-items:center;background:var(--fill-1);border-radius:14px; }
      .inventory-tile span { display:block;font-size:12px;line-height:1.5;white-space:nowrap; }
      .inventory-tile.selected > div { background:#FFC62E;color:#3C310D; }
    `;
    document.head.appendChild(style);
    const gallery = document.createElement('section'); gallery.className = 'icon-inventory';
    const title = document.createElement('h1'); title.className = 'inventory-title';
    title.textContent = '本地图标库 · 155 个 · 12 组'; gallery.appendChild(title);
    for (const group of ICON_GROUPS) {
      const card = document.createElement('article'); card.className = 'inventory-card'; card.dataset.group = group.id;
      const heading = document.createElement('h2'); heading.textContent = `${group.label} · ${group.keys.length}`; card.appendChild(heading);
      const grid = document.createElement('div'); grid.className = 'inventory-grid';
      for (const key of group.keys) {
        const meta = ICON_META[key];
        const tile = document.createElement('div'); tile.className = 'inventory-tile' + (key === group.keys[0] ? ' selected' : ''); tile.dataset.key = key;
        const icon = document.createElement('div'); icon.appendChild(categoryIconNode(meta.token, { size: 30, title: meta.label }));
        const label = document.createElement('span'); label.textContent = meta.label;
        tile.append(icon, label); grid.appendChild(tile);
      }
      card.appendChild(grid); gallery.appendChild(card);
    }
    document.body.appendChild(gallery);
  });
  await expect(page.locator('.inventory-tile svg')).toHaveCount(155);
  const errors = await page.locator('.inventory-tile svg').evaluateAll(icons => icons.flatMap(svg => {
    const box = svg.getBBox(); const label = svg.getAttribute('aria-label');
    const markup = svg.innerHTML;
    // Geometry plus half the 1.8px stroke must remain inside 24×24.
    return (box.width <= 0 || box.height <= 0 || box.x < .89 || box.y < .89 || box.x + box.width > 23.11 || box.y + box.height > 23.11 || /NaN|undefined/.test(markup))
      ? [{ label, x:box.x, y:box.y, width:box.width, height:box.height }] : [];
  }));
  expect(errors).toEqual([]);
  for (let sheet = 0; sheet < 3; sheet++) {
    await page.locator('.inventory-card').evaluateAll((cards, sheet) => cards.forEach((card, index) => { card.hidden = Math.floor(index / 4) !== sheet; }), sheet);
    await page.screenshot({ path: info.outputPath(`icon-library-${sheet + 1}.png`), fullPage: true, scale: 'css' });
  }
  await page.evaluate(async () => { (await import('/js/theme.js')).setThemeKey('dark'); });
  await page.screenshot({ path: info.outputPath('icon-library-dark.png'), fullPage: true, scale: 'css' });
});

test('every group and final icon is reachable in the real picker across small, target and large mobile layouts', async ({ page }, info) => {
  await seed(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const [width, height, theme] of [[360,640,'gold'], [412,906,'dark'], [480,1056,'indigo']]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async theme => (await import('/js/theme.js')).setThemeKey(theme), theme);
    await page.goto('/#/categories/new/expense');
    await expect(page.locator('.category-editor-action.primary')).toBeInViewport();
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
    for (const group of ICON_GROUPS) {
      await page.getByRole('tab', { name: group.label, exact: true }).click();
      await expect(page.locator('.category-editor-icon')).toHaveCount(group.keys.length);
      const last = CATEGORY_ICON_OPTIONS.find(option => option.key === group.keys.at(-1));
      await page.getByRole('option', { name: `选择${last.label}图标`, exact: true }).click();
      await expect(page.locator('.category-editor-label')).toContainText(`已选：${last.label}`);
      await expect(page.locator('.category-editor-icon.selected')).toBeInViewport();
      await expect(page.locator('.category-editor-preview svg')).toHaveCount(1);
      await expect(page.locator('.category-editor-action.primary')).toBeInViewport();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
    await page.getByRole('tab', { name: '餐饮美食', exact: true }).click();
    await page.getByRole('option', { name: '选择外卖图标', exact: true }).click();
    await page.screenshot({ path: info.outputPath(`picker-${width}.png`), fullPage: false, scale: 'css' });
  }
  // Large text still leaves both scroll areas and the save action available.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; document.body.style.fontSize = '20px'; });
  await page.getByRole('tab', { name: '收入理财', exact: true }).click();
  await page.getByRole('option', { name: '选择手续费图标', exact: true }).click();
  await expect(page.locator('.category-editor-action.primary')).toBeInViewport();
  expect(errors).toEqual([]);
});

test.describe('offline category icons', () => {
test.use({ serviceWorkers: 'allow' });
test('name/color-only edits preserve legacy or unknown saved tokens; explicit choices persist through backup and offline display', async ({ page, context }) => {
  await seed(page);
  const legacy = await page.evaluate(async () => {
    const { addCategory } = await import('/js/categories.js');
    return Promise.all([
      addCategory({ name:'旧毕业帽', type:'expense', icon:'🎓', color:'#374151' }),
      addCategory({ name:'旧停车费', type:'expense', icon:'legacy?', color:'#FF7248' }),
      addCategory({ name:'旧空图标', type:'expense', icon:'➕', color:'#FF7248' })
    ]);
  });
  // Simulate a historical record without an icon (addCategory supplies a default).
  await page.evaluate(async id => {
    const { getCategory, updateCategory } = await import('/js/categories.js');
    await updateCategory((await getCategory(id)).id, { icon:'' });
  }, legacy[2].id);
  legacy[2].icon = '';
  for (const category of legacy) {
    await page.goto('/#/categories/edit/' + encodeURIComponent(category.id));
    await expect(page.getByLabel('分类名称')).toHaveValue(category.name);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
    await expect(page.locator('.category-editor-icon.selected')).toBeInViewport();
    await page.getByLabel('分类名称').fill(category.name + '改');
    await page.getByRole('radio').nth(1).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('heading', { name: '分类管理', exact: true })).toBeVisible();
    const stored = await page.evaluate(async id => (await import('/js/categories.js')).getCategory(id), category.id);
    expect(stored.icon).toBe(category.icon);
  }
  await page.goto('/#/categories/new/income');
  await expect(page.locator('.category-editor-icon.selected')).toBeInViewport();
  await page.getByRole('option', { name: '选择兼职图标', exact: true }).click();
  await page.getByLabel('分类名称').fill('自选兼职');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: '分类管理', exact: true })).toBeVisible();
  const backup = await page.evaluate(async () => (await import('/js/store.js')).exportAll());
  expect(backup.categories.find(category => category.name === '自选兼职').icon).toBe('🛠️');
  const chosen = backup.categories.find(category => category.name === '自选兼职');
  await page.goto('/#/categories/edit/' + chosen.id);
  await expect(page.getByRole('option', { name: '选择兼职图标', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('option', { name: '选择兼职图标', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
});
});
