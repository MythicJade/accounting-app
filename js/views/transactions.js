// js/views/transactions.js — complete searchable and paginated transaction history.
import { listTransactions } from '../store.js';
import { listAccounts } from '../accounts.js';
import { listCategories } from '../categories.js';
import { dateWithWeekday, formatMoney } from '../format.js';
import { el } from '../ui.js';

const PAGE_SIZE = 50;

export async function renderTransactions(mount) {
  const [accounts, categories] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listCategories(null, { includeArchived: true })
  ]);
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const state = { search: '', type: '', accountId: '', dateFrom: '', dateTo: '', page: 0 };

  const topbar = el('div', { class: 'topbar' }, [
    el('button', { class: 'back', type: 'button', 'aria-label': '返回首页', onclick: () => { location.hash = '#/'; } }, [
      el('span', { 'aria-hidden': 'true', text: '‹' })
    ]),
    el('h1', { text: '全部流水' }),
    el('a', { class: 'btn-text', href: '#/add', text: '+ 记一笔' })
  ]);

  const search = el('input', { class: 'input transaction-search-input', type: 'search', placeholder: '搜索账单', 'aria-label': '搜索流水' });
  const searchBox = el('div', { class: 'transaction-search-box' }, [
    el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true', html: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>' }),
    search
  ]);
  const type = el('select', { class: 'select', 'aria-label': '按类型筛选' }, [
    el('option', { value: '', text: '全部类型' }),
    el('option', { value: 'expense', text: '支出' }),
    el('option', { value: 'income', text: '收入' }),
    el('option', { value: 'transfer', text: '转账' })
  ]);
  const account = el('select', { class: 'select', 'aria-label': '按账户筛选' }, [
    el('option', { value: '', text: '全部账户' }),
    ...accounts.map(item => el('option', {
      value: item.id,
      text: `${item.name}${item.archived ? '（已归档）' : ''}`
    }))
  ]);
  const from = el('input', { class: 'input', type: 'date', 'aria-label': '开始日期' });
  const to = el('input', { class: 'input', type: 'date', 'aria-label': '结束日期' });
  const reset = el('button', { class: 'btn btn-ghost transaction-reset', type: 'button', text: '重置' });
  const filter = el('section', { class: 'card transaction-filters', 'aria-label': '流水筛选' }, [
    searchBox,
    el('div', { class: 'filter-row' }, [type, account]),
    el('div', { class: 'filter-row' }, [from, to]),
    reset
  ]);
  const resultSummary = el('div', { class: 'transaction-result-summary', 'aria-live': 'polite' });
  const listRoot = el('section', { class: 'tx-section' });
  const pager = el('nav', { class: 'transaction-pager', 'aria-label': '流水分页' });
  mount.append(topbar, filter, resultSummary, listRoot, pager);

  let renderToken = 0;
  async function renderList() {
    const token = ++renderToken;
    if (state.dateFrom && state.dateTo && state.dateFrom > state.dateTo) {
      listRoot.replaceChildren(el('div', { class: 'empty' }, [el('p', { text: '开始日期不能晚于结束日期' })]));
      pager.replaceChildren();
      return;
    }
    const page = await listTransactions({
      search: state.search,
      type: state.type,
      accountId: state.accountId,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
      offset: state.page * PAGE_SIZE,
      limit: PAGE_SIZE,
      returnPage: true
    });
    if (token !== renderToken) return;
    const maxPage = Math.max(0, Math.ceil(page.total / PAGE_SIZE) - 1);
    if (state.page > maxPage) {
      state.page = maxPage;
      return renderList();
    }
    resultSummary.textContent = page.total ? `共 ${page.total} 笔 · 第 ${state.page + 1} / ${maxPage + 1} 页` : '没有符合条件的流水';
    listRoot.replaceChildren();
    if (!page.items.length) {
      listRoot.appendChild(el('div', { class: 'empty' }, [el('p', { text: '换个筛选条件试试，或先记一笔' })]));
    } else {
      const groups = groupByDate(page.items);
      for (const group of groups) {
        const totals = [];
        if (group.income) totals.push(el('span', { class: 'day-income', text: `收入 ${formatMoney(group.income)}` }));
        if (group.expense) totals.push(el('span', { class: 'day-expense', text: `支出 ${formatMoney(group.expense)}` }));
        listRoot.appendChild(el('div', { class: 'tx-date-header' }, [
          el('span', { class: 'tx-date-label', text: dateWithWeekday(group.date) }),
          el('div', { class: 'tx-date-totals' }, totals)
        ]));
        for (const transaction of group.items) listRoot.appendChild(renderTransaction(transaction));
      }
    }
    const prev = el('button', { class: 'btn btn-ghost', type: 'button', text: '上一页', disabled: state.page === 0 ? 'disabled' : null });
    const next = el('button', { class: 'btn btn-ghost', type: 'button', text: '下一页', disabled: state.page >= maxPage ? 'disabled' : null });
    prev.addEventListener('click', () => { if (state.page > 0) { state.page -= 1; renderList(); window.scrollTo(0, 0); } });
    next.addEventListener('click', () => { if (state.page < maxPage) { state.page += 1; renderList(); window.scrollTo(0, 0); } });
    pager.replaceChildren(prev, next);
  }

  function renderTransaction(transaction) {
    let icon = '🔄';
    let color = '#5856D6';
    let name;
    let accountName = '';
    if (transaction.type === 'transfer') {
      const source = accountMap.get(transaction.accountId);
      const target = accountMap.get(transaction.toAccountId);
      name = `${source?.name || '未知账户'} → ${target?.name || '未知账户'}`;
    } else {
      const category = categoryMap.get(transaction.categoryId);
      const source = accountMap.get(transaction.accountId);
      icon = category?.icon || '❓';
      color = category?.color || '#AEAEB2';
      name = category?.name || '未分类';
      accountName = source?.name || '未知账户';
    }
    const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';
    const item = el('button', { class: 'tx-item tx-item-button', type: 'button', 'aria-label': `编辑 ${name} ${formatMoney(transaction.amount)}` }, [
      el('span', { class: 'tx-left' }, [
        el('span', { class: 'icon', style: `background:${color}22;color:${color}`, text: icon }),
        el('span', { class: 'tx-copy' }, [
          el('span', { class: 'name', text: name }),
          transaction.note ? el('span', { class: 'tx-note', text: transaction.note }) : null
        ])
      ]),
      el('span', { class: 'tx-right' }, [
        el('span', { class: `amount ${transaction.type}`, text: `${sign}${formatMoney(transaction.amount)}` }),
        accountName ? el('span', { class: 'account-name', text: accountName }) : null
      ])
    ]);
    item.addEventListener('click', () => { location.hash = `#/edit/${transaction.id}`; });
    return item;
  }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = search.value.trim(); state.page = 0; renderList(); }, 180);
  });
  type.addEventListener('change', () => { state.type = type.value; state.page = 0; renderList(); });
  account.addEventListener('change', () => { state.accountId = account.value; state.page = 0; renderList(); });
  from.addEventListener('change', () => { state.dateFrom = from.value; state.page = 0; renderList(); });
  to.addEventListener('change', () => { state.dateTo = to.value; state.page = 0; renderList(); });
  reset.addEventListener('click', () => {
    search.value = type.value = account.value = from.value = to.value = '';
    Object.assign(state, { search: '', type: '', accountId: '', dateFrom: '', dateTo: '', page: 0 });
    renderList();
  });

  await renderList();
  return () => clearTimeout(searchTimer);
}

function groupByDate(transactions) {
  const groups = [];
  const map = new Map();
  for (const transaction of transactions) {
    if (!map.has(transaction.date)) {
      const group = { date: transaction.date, items: [], income: 0, expense: 0 };
      map.set(transaction.date, group);
      groups.push(group);
    }
    const group = map.get(transaction.date);
    group.items.push(transaction);
    if (transaction.type === 'income') group.income += transaction.amount;
    if (transaction.type === 'expense') group.expense += transaction.amount;
  }
  return groups;
}
