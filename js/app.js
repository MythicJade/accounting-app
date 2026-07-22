// js/app.js — entry point
import { initStore } from './store.js';
import { router, Router } from './router.js';
import { toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderAddTransaction } from './views/add-transaction.js';
import { renderStats } from './views/stats.js';
import { renderBudget } from './views/budget.js';
import { renderSettings } from './views/settings.js';
import { renderAccounts } from './views/accounts.js';
import { renderCategories } from './views/categories.js';

// Make toast globally accessible for convenience (used by some inline handlers)
window.toast = toast;

router.register('/', renderHome);
router.register('/add', renderAddTransaction);
router.register('/edit/:id', renderAddTransaction);
router.register('/stats', renderStats);
router.register('/budget', renderBudget);
router.register('/settings', renderSettings);
router.register('/accounts', renderAccounts);
router.register('/categories', renderCategories);

async function main() {
  try {
    await initStore();
    router.start();
  } catch (e) {
    console.error('App init failed:', e);
    const view = document.getElementById('view');
    if (view) {
      view.innerHTML = `
        <div style="padding:32px 16px;text-align:center;color:#722ED1;">
          <div style="font-size:48px;margin-bottom:8px;">⚠️</div>
          <h2 style="margin:8px 0;">应用启动失败</h2>
          <p style="color:#666;font-size:13px;margin:8px 0 16px;">${(e && e.message) ? String(e.message).replace(/</g, '&lt;') : '未知错误'}</p>
          <button onclick="location.reload()" style="background:#1677FF;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:14px;">重新加载</button>
          <p style="color:#999;font-size:12px;margin-top:16px;">如反复出现，请清除浏览器缓存后重试</p>
        </div>
      `;
    }
    toast('应用启动失败: ' + (e.message || e), 'error', 4000);
  }
}

main();
