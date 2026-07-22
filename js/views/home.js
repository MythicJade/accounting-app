// js/views/home.js — home view: monthly summary + recent transactions
import { listTransactions, monthlySummary, getBudget } from '../store.js';
import { listCategories } from '../categories.js';
import { getAccountsMap } from '../accounts.js';
import { formatMoney, dateWithWeekday, currentMonthKey, monthKeyToLabel } from '../format.js';
import { el } from '../ui.js';
import { router } from '../router.js';

let _categoriesCache = null;

async function getCategoriesMap() {
  if (!_categoriesCache) {
    _categoriesCache = await listCategories();
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
  const catMap = await getCategoriesMap();
  const accMap = await getAccountsMap();

  // Invalidate cache when returning to home
  _categoriesCache = null;

  const used = summary.expense;
  const limit = budget ? budget.limit : 0;
  const remaining = limit - used;
  const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
  const progressClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : '';

  const nodes = [];

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

  // Summary card
  const summaryCard = el('section', { class: 'card summary-card' }, [
    el('div', { class: 'summary-month', text: monthKeyToLabel(monthKey) }),
    el('div', { class: 'summary-balance' }, [
      el('span', { class: 'summary-label', text: '本月结余（全部）' }),
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
    ])
  ]);
  nodes.push(summaryCard);

  // Budget progress card (only if budget set)
  if (limit > 0) {
    const budgetCard = el('section', { class: 'card budget-mini' }, [
      el('div', { class: 'between items-center', style: 'margin-bottom:8px;' }, [
        el('span', { class: 'text-sm text-2', text: '本月预算' }),
        el('span', { class: 'text-sm', text: `${formatMoney(used)} / ${formatMoney(limit)}` })
      ]),
      el('div', { class: 'progress ' + progressClass }, [ el('i', { style: `width:${pct}%` }) ]),
      el('div', { class: 'between items-center text-sm text-2', style: 'margin-top:6px;' }, [
        el('span', { text: pct >= 100 ? '已超支' : '剩余' }),
        el('span', { text: formatMoney(Math.abs(remaining)) })
      ])
    ]);
    nodes.push(budgetCard);
  } else {
    const setBudget = el('section', { class: 'card budget-mini center' }, [
      el('span', { class: 'text-sm text-2', text: '尚未设置本月预算，' }),
      el('a', { class: 'text-sm', href: '#/budget', text: '去设置 →' })
    ]);
    nodes.push(setBudget);
  }

  // Recent transactions — 不使用 card 容器，让每个 tx-item 独立显示为白底分框
  const recentCard = el('section', { class: 'tx-section' });
  const header = el('div', { class: 'card-title', style: 'padding:0 4px;' }, [
    el('span', { text: '最近流水' }),
    recent.length > 0 ? el('a', { class: 'text-sm', href: '#/stats', text: '查看统计' }) : null
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
          const fromAcc = accMap.get(t.accountId) || { name: '?', icon: '📤', color: '#999' };
          const toAcc = accMap.get(t.toAccountId) || { name: '?', icon: '📥', color: '#999' };
          iconNode = el('div', { class: 'icon', style: 'background:#F3F4F6;color:#6B7280' }, [document.createTextNode('🔄')]);
          nameText = fromAcc.name + ' → ' + toAcc.name;
          amountText = formatMoney(t.amount);
          amountClass = 'transfer';
        } else {
          const cat = catMap.get(t.categoryId) || { name: '未分类', icon: '❓', color: '#999' };
          const acc = accMap.get(t.accountId);
          iconNode = el('div', { class: 'icon', style: `background:${cat.color}22;color:${cat.color}` }, [document.createTextNode(cat.icon)]);
          nameText = cat.name;
          // 移除账户筛选后，始终显示账户名
          accountName = acc ? acc.name : '';
          amountText = (t.type === 'income' ? '+' : '-') + formatMoney(t.amount);
          amountClass = t.type;
        }
        // 两行布局：第一行 = 名称 + 金额；第二行 = 备注 + 账户名
        // icon 跨两行，垂直居中
        const item = el('div', { class: 'tx-item', dataset: { id: t.id } }, [
          iconNode,
          el('div', { class: 'meta' }, [
            el('div', { class: 'top' }, [
              el('span', { class: 'name', text: nameText }),
              el('span', { class: 'amount ' + amountClass, text: amountText })
            ]),
            el('div', { class: 'bottom' }, [
              el('span', { class: 'note', text: t.note || '' }),
              accountName ? el('span', { class: 'account-name', text: accountName }) : null
            ].filter(Boolean))
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
