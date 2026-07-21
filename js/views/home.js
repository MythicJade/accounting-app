// js/views/home.js — home view: monthly summary + recent transactions
import { listTransactions, monthlySummary, getBudget } from '../store.js';
import { listCategories } from '../categories.js';
import { listAccounts, getAccountsMap } from '../accounts.js';
import { formatMoney, friendlyDate, currentMonthKey, monthKeyToLabel, todayStr } from '../format.js';
import { el } from '../ui.js';
import { router } from '../router.js';

let _categoriesCache = null;
let _selectedAccountId = null; // null = all accounts

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
  const summary = await monthlySummary(monthKey, _selectedAccountId);
  const budget = await getBudget(monthKey);
  const recent = await listTransactions({ limit: 30, accountId: _selectedAccountId || undefined });
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

  // Header
  nodes.push(el('header', { class: 'topbar' }, [
    el('h1', { text: '我的记账' }),
    el('button', { class: 'btn-text', onclick: () => location.hash = '#/settings' }, [
      el('span', { text: '⚙️' })
    ])
  ]));

  // Account filter chips (horizontal scroll)
  const accounts = await listAccounts();
  const chipsBar = el('div', { class: 'account-chips' });
  const allChip = el('button', { class: 'chip' + (_selectedAccountId === null ? ' active' : ''), text: '全部' });
  allChip.addEventListener('click', () => { _selectedAccountId = null; refresh(); });
  chipsBar.appendChild(allChip);
  accounts.forEach(acc => {
    const chip = el('button', { class: 'chip' + (_selectedAccountId === acc.id ? ' active' : '') }, [
      document.createTextNode(acc.icon + ' ' + acc.name)
    ]);
    chip.addEventListener('click', () => { _selectedAccountId = acc.id; refresh(); });
    chipsBar.appendChild(chip);
  });
  const manageChip = el('button', { class: 'chip chip-manage', onclick: () => location.hash = '#/accounts', text: '⚙️ 管理' });
  chipsBar.appendChild(manageChip);
  nodes.push(chipsBar);

  // Summary card
  const summaryCard = el('section', { class: 'card summary-card' }, [
    el('div', { class: 'summary-month', text: monthKeyToLabel(monthKey) + (_selectedAccountId ? '' : '') }),
    el('div', { class: 'summary-balance' }, [
      el('span', { class: 'summary-label', text: _selectedAccountId ? '本月结余' : '本月结余（全部）' }),
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

  // Recent transactions
  const recentCard = el('section', { class: 'card' });
  const header = el('div', { class: 'card-title' }, [
    el('span', { text: '最近流水' }),
    recent.length > 0 ? el('a', { class: 'text-sm', href: '#/stats', text: '查看统计' }) : null
  ]);
  recentCard.appendChild(header);

  if (recent.length === 0) {
    recentCard.appendChild(el('div', { class: 'empty' }, [
      el('svg', { viewBox: '0 0 24 24', width: '48', height: '48', fill: 'currentColor' }, [
        // placeholder path added via innerHTML
      ]),
      el('p', { text: '还没有记录，点击下方「+」记一笔吧' })
    ]));
    const emptySvg = recentCard.querySelector('svg');
    if (emptySvg) emptySvg.innerHTML = '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4h2v4zm0-6h-2V7h2v4z"/>';
  } else {
    const list = el('div', { class: 'transaction-list' });
    recent.forEach(t => {
      let iconNode, nameText, amountText, amountClass;
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
        nameText = cat.name + (acc && _selectedAccountId === null ? ' · ' + acc.name : '');
        amountText = (t.type === 'income' ? '+' : '-') + formatMoney(t.amount);
        amountClass = t.type;
      }
      const item = el('div', { class: 'list-item', dataset: { id: t.id } }, [
        iconNode,
        el('div', { class: 'meta' }, [
          el('div', { class: 'top' }, [
            el('span', { class: 'name', text: nameText }),
            el('span', { class: 'amount ' + amountClass, text: amountText })
          ]),
          el('div', { class: 'between text-sm text-3' }, [
            el('span', { class: 'note', text: t.note || '—' }),
            el('span', { text: friendlyDate(t.date) })
          ])
        ])
      ]);
      item.addEventListener('click', () => { location.hash = '#/edit/' + t.id; });
      list.appendChild(item);
    });
    recentCard.appendChild(list);
  }
  nodes.push(recentCard);

  mount.append(...nodes);

  // Re-render in place when account filter changes
  function refresh() {
    router.dispatch();
  }
}

// invalidate category cache when categories change (called from other views if needed)
export function invalidateCategoryCache() { _categoriesCache = null; }
