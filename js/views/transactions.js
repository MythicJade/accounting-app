// js/views/transactions.js — complete searchable and paginated transaction history.
import { listTransactions, summarizeTransactions } from '../store.js';
import { listAccounts } from '../accounts.js';
import { listCategories } from '../categories.js';
import { dateWithWeekday, formatMoney } from '../format.js';
import { el } from '../ui.js';
import { categoryIconNode } from '../category-icons.js';
import { isValidDateOnly, todayDateOnly } from '../date-only.js';
import { toCents } from '../money.js';
import { openTransaction, contextualRoute } from '../navigation.js';
import { router } from '../router.js';
import { categoryColorStyle } from '../theme.js';

const PAGE_SIZE = 50;

export async function renderTransactions(mount, { query } = {}) {
  return renderHistory(mount, { searching: query?.get('mode') === 'search', query });
}

export async function renderCategoryTransactions(mount, { categoryId, query }) {
  const type = query?.get('type');
  const dateFrom = query?.get('from');
  const dateTo = query?.get('to');
  if (!['expense', 'income'].includes(type) || !isValidDateOnly(dateFrom) ||
      !isValidDateOnly(dateTo) || dateFrom > dateTo) {
    mount.append(
      el('a', { class: 'btn btn-ghost', href: '#/stats', text: '返回统计' }),
      el('p', { class: 'empty', text: '筛选条件无效，请返回统计页重新选择分类' })
    );
    return;
  }
  return renderHistory(mount, {
    categoryFilter: { categoryId, type, dateFrom, dateTo, accountId: query.get('account') || '' },
    sourcePeriod: query.get('period') || 'custom', query
  });
}

export async function renderAccountTransactions(mount, { id, query }) {
  const year = /^\d{4}$/.test(query?.get('year')) ? query.get('year') : String(new Date().getFullYear());
  return renderHistory(mount, { accountFilter: { accountId: id, dateFrom: year + '-01-01', dateTo: year + '-12-31' }, query, accountYear: year });
}

async function renderHistory(mount, { searching = false, categoryFilter = null, accountFilter = null, sourcePeriod = 'custom', query, accountYear } = {}) {
  const [accounts, categories] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listCategories(null, { includeArchived: true })
  ]);
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const state = {
    search: query?.get('q') || '', type: query?.get('type') || '', accountId: query?.get('account') || '',
    categoryId: query?.get('category') || '', dateFrom: query?.get('from') || '', dateTo: query?.get('to') || '',
    amountMin: query?.get('min') || '', amountMax: query?.get('max') || '',
    ...categoryFilter, ...accountFilter, page: Math.max(0, Number.parseInt(query?.get('page'), 10) || 0)
  };
  const category = categoryFilter && categoryMap.get(categoryFilter.categoryId);
  const typeLabel = state.type === 'income' ? '收入' : '支出';
  const returnQuery = categoryFilter && new URLSearchParams({
    period: sourcePeriod, type: state.type, from: state.dateFrom, to: state.dateTo
  });
  if (categoryFilter && state.accountId) returnQuery.set('account', state.accountId);
  const backRoute = categoryFilter ? `#/stats?${returnQuery}` : accountFilter ? `#/accounts/${encodeURIComponent(state.accountId)}?year=${accountYear}` : searching ? '#/settings' : '#/';
  const backLabel = categoryFilter ? '返回统计' : accountFilter ? '返回账户' : searching ? '返回我的' : '返回明细';

  const topbar = el('div', { class: 'topbar' }, [
    el('a', { class: 'back', href: backRoute, 'aria-label': backLabel }, [
      el('span', { 'aria-hidden': 'true', text: '‹' })
    ]),
    el('h1', { text: categoryFilter ? '分类流水' : accountFilter ? '账户流水' : searching ? '搜索账单' : '全部流水' }),
    el('a', { class: 'btn-text', href: contextualRoute('#/add'), text: '+ 记一笔', onclick: event => { event.currentTarget.href = contextualRoute('#/add'); } })
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
  const categorySelect = el('select', { class: 'select', 'aria-label': '按分类筛选' }, [
    el('option', { value: '', text: '全部分类' }),
    ...categories.map(item => el('option', { value: item.id, text: item.name + (item.type === 'income' ? ' · 收入' : ' · 支出') + (item.archived ? '（已归档）' : '') }))
  ]);
  const amountMin = el('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '最低金额', 'aria-label': '最低金额' });
  const amountMax = el('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '最高金额', 'aria-label': '最高金额' });
  search.value = state.search; type.value = state.type; account.value = state.accountId;
  from.value = state.dateFrom; to.value = state.dateTo; categorySelect.value = state.categoryId;
  amountMin.value = state.amountMin; amountMax.value = state.amountMax;
  const reset = el('button', { class: 'btn btn-ghost transaction-reset', type: 'button', text: '重置' });
  const filter = el('section', { class: 'card transaction-filters', 'aria-label': '流水筛选' }, [
    searching ? searchBox : null,
    el('div', { class: 'filter-row' }, [type, account]),
    el('div', { class: 'filter-row' }, [from, to]),
    categorySelect,
    el('div', { class: 'filter-amount-label', text: '金额范围 · 两框相同为精确金额' }),
    el('div', { class: 'filter-row' }, [amountMin, amountMax]),
    reset
  ]);
  const resultSummary = el('div', { class: 'transaction-result-summary', 'aria-live': 'polite' });
  const listRoot = el('section', { class: 'tx-section' });
  const pager = el('nav', { class: 'transaction-pager', 'aria-label': '流水分页' });
  mount.append(topbar);
  if (categoryFilter) {
    mount.append(el('section', { class: 'card category-history-summary' }, [
      el('div', { class: 'category-history-heading' }, [
        el('span', { class: 'icon category-line-icon', style: categoryColorStyle(category?.color) }, [
          categoryIconNode(category || { name: '未分类', icon: '➕' }, { size: 26 })
        ]),
        el('h2', { text: `${category?.name || '未分类'} · ${typeLabel}` })
      ]),
      el('p', { class: 'category-history-range', text: `${state.dateFrom} 至 ${state.dateTo}` }),
      el('p', { class: 'category-history-account', text: state.accountId ? `账户：${accountMap.get(state.accountId)?.name || '未知账户'}` : '全部账户' }),
      el('div', { class: 'category-history-total', 'aria-live': 'polite' }),
      null
    ]));
  } else if (!accountFilter) {
    mount.append(filter);
  } else {
    mount.append(el('p', { class: 'text-2', text: `${accountMap.get(state.accountId)?.name || '未知账户'} · ${accountYear}年` }));
  }
  mount.append(resultSummary, listRoot, pager);

  let renderToken = 0;
  let disposed = false;
  let categoryEntries;
  let categoryDayTotals;
  function saveState() {
    const values = new URLSearchParams(query || '');
    if (!categoryFilter && !accountFilter) {
      for (const [key, value] of Object.entries({ q: state.search, type: state.type, account: state.accountId, category: state.categoryId, from: state.dateFrom, to: state.dateTo, min: state.amountMin, max: state.amountMax })) {
        if (value) values.set(key, value); else values.delete(key);
      }
    }
    if (state.page) values.set('page', String(state.page)); else values.delete('page');
    const path = location.hash.split('?')[0] || '#/transactions';
    router.replaceState(path + (values.size ? '?' + values : ''));
  }
  async function renderList() {
    const token = ++renderToken;
    let validationError = '';
    if ((state.dateFrom && !isValidDateOnly(state.dateFrom)) || (state.dateTo && !isValidDateOnly(state.dateTo))) validationError = '日期无效';
    if (state.dateFrom && state.dateTo && state.dateFrom > state.dateTo) validationError = '开始日期不能晚于结束日期';
    let amountMinCents, amountMaxCents;
    try {
      if (state.amountMin) amountMinCents = toCents(state.amountMin, { allowNegative: false });
      if (state.amountMax) amountMaxCents = toCents(state.amountMax, { allowNegative: false });
      if (amountMinCents != null && amountMaxCents != null && amountMinCents > amountMaxCents) validationError = '最低金额不能大于最高金额';
    } catch { validationError = '请输入有效金额，最多两位小数'; }
    saveState();
    if (validationError) {
      resultSummary.textContent = '';
      listRoot.replaceChildren(el('div', { class: 'empty' }, [el('p', { text: validationError })]));
      pager.replaceChildren();
      return;
    }
    let page;
    if (categoryFilter) {
      if (!categoryEntries) {
        const entries = await listTransactions(categoryFilter);
        if (disposed || token !== renderToken) return;
        categoryEntries = entries;
        const actualTotals = summarizeTransactions(entries);
        categoryDayTotals = actualTotals.days;
        const totalCents = state.type === 'income' ? actualTotals.incomeCents : actualTotals.expenseCents;
        mount.querySelector('.category-history-total').textContent =
          `${entries.length} 笔 · ${typeLabel}合计 ${formatMoney(totalCents / 100)}`;
      }
      page = { items: categoryEntries.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE), total: categoryEntries.length };
    } else {
      page = await listTransactions({
        search: state.search,
        type: state.type,
        accountId: state.accountId,
        categoryId: state.categoryId,
        amountMinCents, amountMaxCents,
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        offset: state.page * PAGE_SIZE,
        limit: PAGE_SIZE,
        returnPage: true
      });
    }
    if (disposed || token !== renderToken) return;
    const maxPage = Math.max(0, Math.ceil(page.total / PAGE_SIZE) - 1);
    if (state.page > maxPage) {
      state.page = maxPage;
      return renderList();
    }
    resultSummary.textContent = page.total ? `共 ${page.total} 笔 · 第 ${state.page + 1} / ${maxPage + 1} 页` : '没有符合条件的流水';
    if (!categoryFilter && page.total) {
      resultSummary.appendChild(el('div', { class: 'history-totals', text: `收入 ${formatMoney(page.incomeCents / 100)} · 支出 ${formatMoney(page.expenseCents / 100)} · 结余 ${formatMoney(page.balanceCents / 100)}` }));
    }
    listRoot.replaceChildren();
    if (!page.items.length) {
      listRoot.appendChild(el('div', { class: 'empty' }, [el('p', { text: categoryFilter ? '该时段没有这个分类的流水' : '换个筛选条件试试，或先记一笔' })]));
    } else {
      const groups = groupByDate(page.items);
      for (const group of groups) {
        const dailyCents = (categoryDayTotals || page.days)?.[group.date];
        const dailyTotal = dailyCents ? { income: dailyCents.incomeCents / 100, expense: dailyCents.expenseCents / 100 } : group;
        const totals = [];
        if (dailyTotal.income) totals.push(el('span', { class: 'day-income', text: `收入 ${formatMoney(dailyTotal.income)}` }));
        if (dailyTotal.expense) totals.push(el('span', { class: 'day-expense', text: `支出 ${formatMoney(dailyTotal.expense)}` }));
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
    let iconNode = el('span', { text: '↔' });
    let color = '#5856D6';
    let name;
    let accountName = '';
    if (transaction.type === 'transfer') {
      const source = accountMap.get(transaction.accountId);
      const target = accountMap.get(transaction.toAccountId);
      name = `${source?.name || '未知账户'} → ${target?.name || '未知账户'}`;
      if (accountFilter) accountName = transaction.toAccountId === state.accountId ? '转入' : '转出';
    } else {
      const category = categoryMap.get(transaction.categoryId);
      const source = accountMap.get(transaction.accountId);
      color = category?.color || '#AEAEB2';
      name = category?.name || '未分类';
      accountName = source?.name || '未知账户';
      iconNode = categoryIconNode(category || { name: '未分类', icon: '➕' }, { size: 23 });
    }
    const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';
    const item = el('button', { class: 'tx-item tx-item-button', type: 'button', 'aria-label': `查看 ${name} ${formatMoney(transaction.amount)}` }, [
      el('span', { class: 'tx-left' }, [
        el('span', { class: 'icon category-line-icon', style: categoryColorStyle(color) }, [iconNode]),
        el('span', { class: 'tx-copy' }, [
          el('span', { class: 'name', text: name }),
          transaction.note ? el('span', { class: 'tx-note', text: transaction.note }) : null,
          transaction.date > todayDateOnly() ? el('span', { class: 'future-date', text: '未来日期' }) : null
        ])
      ]),
      el('span', { class: 'tx-right' }, [
        el('span', { class: `amount ${transaction.type}`, text: `${sign}${formatMoney(transaction.amount)}` }),
        accountName ? el('span', { class: 'account-name', text: accountName }) : null
      ])
    ]);
    item.addEventListener('click', () => { saveState(); openTransaction(transaction.id); });
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
  categorySelect.addEventListener('change', () => { state.categoryId = categorySelect.value; state.page = 0; renderList(); });
  for (const [input, key] of [[amountMin, 'amountMin'], [amountMax, 'amountMax']]) input.addEventListener('change', () => { state[key] = input.value.trim(); state.page = 0; renderList(); });
  reset.addEventListener('click', () => {
    search.value = type.value = account.value = from.value = to.value = categorySelect.value = amountMin.value = amountMax.value = '';
    Object.assign(state, { search: '', type: '', accountId: '', categoryId: '', dateFrom: '', dateTo: '', amountMin: '', amountMax: '', page: 0 });
    renderList();
  });

  await renderList();
  return () => { disposed = true; renderToken++; clearTimeout(searchTimer); };
}

function groupByDate(transactions) {
  const groups = [];
  const map = new Map();
  for (const transaction of transactions) {
    if (!map.has(transaction.date)) {
      const group = { date: transaction.date, items: [], incomeCents: 0, expenseCents: 0 };
      map.set(transaction.date, group);
      groups.push(group);
    }
    const group = map.get(transaction.date);
    group.items.push(transaction);
    if (transaction.type === 'income') group.incomeCents += transaction.amountCents;
    if (transaction.type === 'expense') group.expenseCents += transaction.amountCents;
  }
  return groups.map(group => ({ ...group, income: group.incomeCents / 100, expense: group.expenseCents / 100 }));
}
