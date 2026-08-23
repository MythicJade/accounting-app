// js/views/home.js — home view: monthly summary + recent transactions
import { listTransactions, monthlySummary, getBudget, setupStarterData } from '../store.js';
import { listCategories } from '../categories.js';
import { getAccountsMap, listAccounts } from '../accounts.js';
import { formatMoney, dateWithWeekday, currentMonthKey, monthKeyToLabel } from '../format.js';
import { el, toast } from '../ui.js';
import { router } from '../router.js';

let _categoriesCache = null;

async function getCategoriesMap() {
  if (!_categoriesCache) {
    _categoriesCache = await listCategories(null, { includeArchived: true });
  }
  const map = new Map();
  _categoriesCache.forEach(c => map.set(c.id, c));
  return map;
}

export async function renderHome(mount) {
  const monthKey = currentMonthKey();
  const summary = await monthlySummary(monthKey, null);
  const budget = await getBudget(monthKey);
  const recent = await listTransactions({ limit: 30 });
  const [catMap, accMap, activeAccounts, activeCategories] = await Promise.all([
    getCategoriesMap(),
    getAccountsMap(),
    listAccounts(),
    listCategories()
  ]);

  // Invalidate cache when returning to home
  _categoriesCache = null;

  const used = summary.expense;
  const limit = budget ? budget.limit : 0;
  const remaining = limit - used;
  const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
  const progressClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : '';

  const nodes = [];

  const homeHeader = el('header', { class: 'home-header' }, [
    el('div', { class: 'home-title-block' }, [
      el('span', { class: 'home-kicker', text: '离线账本' }),
      el('h1', { text: '我的账本' })
    ]),
    el('a', { class: 'home-account-button', href: '#/accounts', 'aria-label': '查看账户与资产' }, [
      el('svg', { viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true', html: '<path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h11.5"/><path d="M15.5 12h4.5v4h-4.5a2 2 0 1 1 0-4Z"/>' })
    ])
  ]);
  const searchEntry = el('a', { class: 'home-search', href: '#/transactions', 'aria-label': '搜索账单' }, [
    el('svg', { viewBox: '0 0 24 24', width: '21', height: '21', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true', html: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>' }),
    el('span', { text: '搜索账单、账户或备注' }),
    el('span', { class: 'search-arrow', 'aria-hidden': 'true', text: '›' })
  ]);
  nodes.push(homeHeader, searchEntry);

  if (!activeAccounts.length || !activeCategories.length) {
    const setupButton = el('button', { class: 'btn', type: 'button', text: '一键初始化' });
    setupButton.addEventListener('click', async () => {
      setupButton.disabled = true;
      try {
        await setupStarterData();
        toast('基础账户和分类已准备好');
        router.dispatch();
      } catch (error) {
        toast('初始化失败：' + (error.message || error));
        setupButton.disabled = false;
      }
    });
    nodes.push(el('section', { class: 'card onboarding-card' }, [
      el('div', { class: 'onboarding-icon', 'aria-hidden': 'true', text: '👋' }),
      el('div', { class: 'onboarding-copy' }, [
        el('h2', { text: '先把账本准备好' }),
        el('p', { text: '创建现金、银行卡和常用收支分类，之后都可以修改或归档。' }),
        el('div', { class: 'onboarding-actions' }, [
          setupButton,
          el('a', { class: 'btn btn-ghost', href: '#/accounts', text: '自己设置' })
        ])
      ])
    ]));
  }

  // 左滑进入账户管理提示（仅首次显示）
  if (!localStorage.getItem('swipe_hint_shown')) {
    const hint = el('div', { class: 'swipe-hint', text: '← 左滑管理账户' });
    nodes.push(hint);
    setTimeout(() => {
      localStorage.setItem('swipe_hint_shown', '1');
      if (hint.parentNode) hint.classList.add('fade-out');
      setTimeout(() => { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 500);
    }, 3000);
  }

  const budgetDetails = limit > 0
    ? el('a', { class: 'overview-budget', href: '#/budget' }, [
        el('div', { class: 'overview-budget-copy' }, [
          el('span', { text: pct >= 100 ? '预算已超支' : '本月预算' }),
          el('strong', { text: pct >= 100 ? `超出 ${formatMoney(Math.abs(remaining))}` : `还可用 ${formatMoney(Math.max(0, remaining))}` })
        ]),
        el('div', { class: 'overview-budget-progress' }, [
          el('i', { class: progressClass, style: `width:${pct}%` })
        ]),
        el('span', { class: 'overview-budget-percent', text: `${pct}%` })
      ])
    : el('a', { class: 'overview-budget is-empty', href: '#/budget' }, [
        el('div', { class: 'overview-budget-copy' }, [
          el('span', { text: '本月预算' }),
          el('strong', { text: '设置预算，让消费更有数' })
        ]),
        el('span', { class: 'overview-budget-action', text: '去设置' })
      ]);

  // Summary card
  const summaryCard = el('section', { class: 'card summary-card home-overview' }, [
    el('div', { class: 'summary-card-head' }, [
      el('div', { class: 'summary-month', text: monthKeyToLabel(monthKey) }),
      el('a', { class: 'summary-detail-link', href: '#/stats', text: '查看统计 ›' })
    ]),
    el('div', { class: 'summary-balance' }, [
      el('span', { class: 'summary-label', text: '本月结余' }),
      el('div', { class: 'summary-amount', text: formatMoney(summary.balance) })
    ]),
    el('div', { class: 'summary-row' }, [
      el('div', { class: 'summary-item' }, [
        el('div', { class: 'summary-sub-label', text: '收入' }),
        el('div', { class: 'summary-sub-amount income', text: formatMoney(summary.income) })
      ]),
      el('div', { class: 'summary-item' }, [
        el('div', { class: 'summary-sub-label', text: '支出' }),
        el('div', { class: 'summary-sub-amount expense', text: formatMoney(summary.expense) })
      ])
    ]),
    budgetDetails
  ]);
  nodes.push(summaryCard);

  // Recent transactions — 不使用 card 容器，让每个 tx-item 独立显示为白底分框
  const recentCard = el('section', { class: 'tx-section' });
  const header = el('div', { class: 'card-title section-heading' }, [
    el('span', { text: '最近流水' }),
    recent.length > 0 ? el('a', { class: 'text-sm', href: '#/transactions', text: '全部流水 ›' }) : null
  ]);
  recentCard.appendChild(header);

  if (recent.length === 0) {
    recentCard.appendChild(el('div', { class: 'empty' }, [
      el('svg', { viewBox: '0 0 24 24', width: '48', height: '48', fill: 'currentColor' }, [
        // placeholder path added via innerHTML
      ]),
      el('p', { text: '还没有记录，点击右下角「+」记一笔吧' })
    ]));
    const emptySvg = recentCard.querySelector('svg');
    if (emptySvg) emptySvg.innerHTML = '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4h2v4zm0-6h-2V7h2v4z"/>';
  } else {
    const list = el('div', { class: 'transaction-list' });
    // 按日期分组：同一天的条目上面统一显示日期头
    // 日期头：左 = 日期 + 星期，右 = 当日收入/支出合计
    const groups = [];
    const groupMap = new Map();
    recent.forEach(t => {
      if (!groupMap.has(t.date)) {
        const g = { date: t.date, items: [], income: 0, expense: 0 };
        groupMap.set(t.date, g);
        groups.push(g);
      }
      const g = groupMap.get(t.date);
      g.items.push(t);
      if (t.type === 'income') g.income += t.amount;
      else if (t.type === 'expense') g.expense += t.amount;
    });

    groups.forEach(g => {
      // 日期头
      const headerRight = [];
      if (g.income > 0) headerRight.push(el('span', { class: 'day-income', text: '收入 ' + formatMoney(g.income) }));
      if (g.expense > 0) headerRight.push(el('span', { class: 'day-expense', text: '支出 ' + formatMoney(g.expense) }));
      const dayHeader = el('div', { class: 'tx-date-header' }, [
        el('span', { class: 'tx-date-label', text: dateWithWeekday(g.date) }),
        el('div', { class: 'tx-date-totals' }, headerRight)
      ]);
      list.appendChild(dayHeader);

      // 当日条目
      g.items.forEach(t => {
        let iconNode, nameText, amountText, amountClass, accountName = '';
        if (t.type === 'transfer') {
          const fromAcc = accMap.get(t.accountId) || { name: '?', icon: '📤', color: '#aeaeb2' };
          const toAcc = accMap.get(t.toAccountId) || { name: '?', icon: '📥', color: '#aeaeb2' };
          iconNode = el('div', { class: 'icon', style: 'background:var(--fill-1);color:var(--text-2)' }, [document.createTextNode('🔄')]);
          nameText = fromAcc.name + ' → ' + toAcc.name;
          amountText = formatMoney(t.amount);
          amountClass = 'transfer';
        } else {
          const cat = catMap.get(t.categoryId) || { name: '未分类', icon: '❓', color: '#aeaeb2' };
          const acc = accMap.get(t.accountId);
          iconNode = el('div', { class: 'icon', style: `background:${cat.color}22;color:${cat.color}` }, [document.createTextNode(cat.icon)]);
          nameText = cat.name;
          // 移除账户筛选后，始终显示账户名
          accountName = acc ? acc.name : '';
          amountText = (t.type === 'income' ? '+' : '-') + formatMoney(t.amount);
          amountClass = t.type;
        }
        // 两列布局：左 = 图标 + 分类名（垂直居中）；右 = 金额（上） + 账户名（下）
        const item = el('button', { class: 'tx-item tx-item-button', type: 'button', dataset: { id: t.id }, 'aria-label': `编辑 ${nameText} ${amountText}` }, [
          el('div', { class: 'tx-left' }, [
            iconNode,
            el('span', { class: 'name', text: nameText })
          ]),
          el('div', { class: 'tx-right' }, [
            el('span', { class: 'amount ' + amountClass, text: amountText }),
            ...(accountName ? [el('span', { class: 'account-name', text: accountName })] : [])
          ])
        ]);
        item.addEventListener('click', () => { location.hash = '#/edit/' + t.id; });
        list.appendChild(item);
      });
    });
    recentCard.appendChild(list);
  }
  nodes.push(recentCard);

  // FAB 加号按钮（首页右下角浮动）
  const fab = el('button', { class: 'fab-add', 'aria-label': '记一笔', onclick: () => location.hash = '#/add' }, [
    el('svg', { viewBox: '0 0 24 24', width: '28', height: '28', fill: 'currentColor', html: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>' })
  ]);
  nodes.push(fab);

  mount.append(...nodes);

  // 左滑手势：从屏幕向左滑动进入账户管理页
  let touchStartX = 0, touchStartY = 0, touchActive = false;
  const onStart = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchActive = true;
  };
  const onEnd = (e) => {
    if (!touchActive) return;
    touchActive = false;
    const touch = e.changedTouches ? e.changedTouches[0] : e;
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    // 左滑：deltaX < -80 且水平为主（避免误触发垂直滚动）
    if (deltaX < -80 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      location.hash = '#/accounts';
    }
  };
  mount.addEventListener('touchstart', onStart, { passive: true });
  mount.addEventListener('touchend', onEnd, { passive: true });

  // 返回 cleanup 函数，路由切换时移除监听
  return () => {
    mount.removeEventListener('touchstart', onStart);
    mount.removeEventListener('touchend', onEnd);
  };
}

// invalidate category cache when categories change (called from other views if needed)
export function invalidateCategoryCache() { _categoriesCache = null; }
