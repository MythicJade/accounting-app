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

// Make toast globally accessible for convenience (used by some inline handlers)
window.toast = toast;

router.register('/', renderHome);
router.register('/add', renderAddTransaction);
router.register('/edit/:id', renderAddTransaction);
router.register('/stats', renderStats);
router.register('/budget', renderBudget);
router.register('/settings', renderSettings);
router.register('/accounts', renderAccounts);

// Floating + button
document.getElementById('fab-add').addEventListener('click', () => {
  location.hash = '#/add';
});

async function main() {
  try {
    await initStore();
    router.start();
  } catch (e) {
    console.error(e);
    toast('应用启动失败: ' + (e.message || e), 'error', 4000);
  }
}

main();
