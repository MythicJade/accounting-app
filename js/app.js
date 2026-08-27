// js/app.js — entry point
import { initStore } from './store.js';
import { router } from './router.js';
import { toast, el } from './ui.js';
import { renderHome } from './views/home.js';
import { renderAddTransaction } from './views/add-transaction.js';
import { renderStats } from './views/stats.js';
import { renderBudget } from './views/budget.js';
import { renderSettings } from './views/settings.js';
import { renderAccounts } from './views/accounts.js';
import { renderAccountDetail } from './views/account-detail.js';
import { renderAssetsTrend } from './views/assets-trend.js';
import { renderCategories } from './views/categories.js';
import { renderTransactions } from './views/transactions.js';
import { registerPWA } from './pwa.js';
import { applySavedTheme } from './theme.js';

// v2.2.0：在任何视图渲染前恢复用户选择的主题（鎏金暖阳/青屿/靛夜星辉/暗夜）
applySavedTheme();

// Make toast globally accessible for convenience (used by some inline handlers)
window.toast = toast;

router.register('/', renderHome);
router.register('/add', renderAddTransaction);
router.register('/edit/:id', renderAddTransaction);
router.register('/stats', renderStats);
router.register('/budget', renderBudget);
router.register('/settings', renderSettings);
router.register('/accounts', renderAccounts);
router.register('/accounts/:id', renderAccountDetail);
router.register('/assets', renderAssetsTrend);
router.register('/categories', renderCategories);
router.register('/transactions', renderTransactions);

async function main() {
  try {
    await initStore();
    router.start();
    registerPWA();
  } catch (e) {
    console.error('App init failed:', e);
    const view = document.getElementById('view');
    if (view) {
      const reload = el('button', { class: 'btn', type: 'button', text: '重新加载', onclick: () => location.reload() });
      view.replaceChildren(el('div', { class: 'startup-error' }, [
        el('div', { class: 'startup-error-icon', 'aria-hidden': 'true', text: '⚠️' }),
        el('h2', { text: '应用启动失败' }),
        el('p', { class: 'text-sm text-2', text: e?.message || '未知错误' }),
        reload,
        el('p', { class: 'text-xs text-3', text: '如反复出现，请清除浏览器缓存后重试' })
      ]));
    }
    toast('应用启动失败: ' + (e.message || e), 'error', 4000);
  }
}

main();
