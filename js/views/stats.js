// js/views/stats.js — statistics page with charts
import { listTransactions, categoryBreakdown, dailyTotals, sumByType } from '../store.js';
import { listCategories } from '../categories.js';
import { listAccounts } from '../accounts.js';
import { getRange, shiftRange, rangeLabel, listDates, formatMoney, formatDateStr, monthKeyToLabel } from '../format.js';
import { el } from '../ui.js';
import { drawPieChart } from '../charts/pie-chart.js';
import { drawLineChart } from '../charts/line-chart.js';

const PERIODS = [
  { key: 'day',   label: '日' },
  { key: 'week',  label: '周' },
  { key: 'month', label: '月' },
  { key: 'year',  label: '年' }
];

let _state = {
  period: 'month',
  range: null,
  view: 'expense', // 'expense' | 'income'
  selectedSlice: null,
  accountId: null   // null = all accounts
};

// Restore range on first load
function ensureRange() {
  if (!_state.range) {
    _state.range = getRange(_state.period);
  }
}

export async function renderStats(mount) {
  ensureRange();

  const topbar = el('header', { class: 'topbar' }, [
    el('h1', { text: '统计' })
  ]);

  // Account filter chips
  const accounts = await listAccounts();
  const accountChips = el('div', { class: 'account-chips' });
  const allAccChip = el('button', { class: 'chip' + (_state.accountId === null ? ' active' : ''), text: '全部' });
  allAccChip.addEventListener('click', () => { _state.accountId = null; render(); });
  accountChips.appendChild(allAccChip);
  accounts.forEach(acc => {
    const chip = el('button', { class: 'chip' + (_state.accountId === acc.id ? ' active' : '') }, [
      document.createTextNode(acc.icon + ' ' + acc.name)
    ]);
    chip.addEventListener('click', () => { _state.accountId = acc.id; render(); });
    accountChips.appendChild(chip);
  });

  // Period tabs
  const periodTabs = el('div', { class: 'period-tabs' });
  PERIODS.forEach(p => {
    const btn = el('button', {
      class: _state.period === p.key ? 'active' : '',
      text: p.label,
      onclick: () => { _state.period = p.key; _state.range = getRange(p.key); _state.selectedSlice = null; render(); }
    });
    periodTabs.appendChild(btn);
  });

  // Range nav
  const rangeLabelEl = el('span', { class: 'label', text: rangeLabel(_state.range, _state.period) });
  const rangeNav = el('div', { class: 'range-nav' }, [
    el('button', { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>', onclick: () => { _state.range = shiftRange(_state.range, _state.period, -1); _state.selectedSlice = null; render(); } }),
    rangeLabelEl,
    el('button', { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>', onclick: () => { _state.range = shiftRange(_state.range, _state.period, 1); _state.selectedSlice = null; render(); } })
  ]);

  // Type toggle (支出/收入)
  const typeToggle = el('div', { class: 'type-tabs', style: 'margin-bottom:8px;' }, [
    el('button', { class: _state.view === 'expense' ? 'active expense' : '', text: '支出', onclick: () => { _state.view = 'expense'; _state.selectedSlice = null; render(); } }),
    el('button', { class: _state.view === 'income' ? 'active income' : '', text: '收入', onclick: () => { _state.view = 'income'; _state.selectedSlice = null; render(); } })
  ]);

  // Summary row
  const summaryRow = el('div', { class: 'card', style: 'padding:12px 16px;' });
  const summaryIncome = el('div', { style: 'flex:1;' }, [
    el('div', { class: 'text-sm text-3', text: '期间收入' }),
    el('div', { class: 'text-lg', style: 'color:var(--income);font-weight:600;', text: '¥0.00' })
  ]);
  const summaryExpense = el('div', { style: 'flex:1;text-align:right;' }, [
    el('div', { class: 'text-sm text-3', text: '期间支出' }),
    el('div', { class: 'text-lg', style: 'color:var(--expense);font-weight:600;', text: '¥0.00' })
  ]);
  summaryRow.append(summaryIncome, summaryExpense);

  // Charts
  const pieCanvas = el('canvas');
  const pieCard = el('section', { class: 'card chart-card' }, [
    el('div', { class: 'card-title', text: '分类占比' }),
    pieCanvas
  ]);

  const lineCanvas = el('canvas');
  const lineCard = el('section', { class: 'card chart-card' }, [
    el('div', { class: 'card-title', text: '趋势' }),
    lineCanvas
  ]);

  // Category rank list
  const rankCard = el('section', { class: 'card' }, [
    el('div', { class: 'card-title', text: '分类排行' })
  ]);
  const rankList = el('div');
  rankCard.appendChild(rankList);

  mount.append(topbar, accountChips, periodTabs, rangeNav, typeToggle, summaryRow, pieCard, lineCard, rankCard);

  // Render function (re-renders in place)
  async function render() {
    rangeLabelEl.textContent = rangeLabel(_state.range, _state.period);
    // Re-render period tabs and type toggle
    periodTabs.querySelectorAll('button').forEach((b, i) => {
      b.className = _state.period === PERIODS[i].key ? 'active' : '';
    });
    typeToggle.querySelectorAll('button').forEach((b, i) => {
      const isExp = i === 0;
      b.className = _state.view === (isExp ? 'expense' : 'income') ? 'active ' + (isExp ? 'expense' : 'income') : '';
    });

    const range = _state.range;
    const accId = _state.accountId || undefined;
    // summary
    const sums = await sumByType(range.start, range.end, accId);
    summaryIncome.lastChild.textContent = formatMoney(sums.income);
    summaryExpense.lastChild.textContent = formatMoney(sums.expense);

    // pie data
    const catMap = await categoryBreakdown(range.start, range.end, _state.view, accId);
    const allCats = await listCategories();
    const catById = new Map(allCats.map(c => [c.id, c]));
    let pieData = [];
    catMap.forEach((val, id) => {
      const c = catById.get(id) || { name: '未分类', color: '#999', icon: '❓' };
      pieData.push({ label: c.name, value: val, color: c.color, id });
    });
    pieData.sort((a, b) => b.value - a.value);

    drawPieChart(pieCanvas, pieData, {
      selected: _state.selectedSlice,
      onSelect: (idx) => { _state.selectedSlice = idx; render(); }
    });

    // line data
    const dates = listDates(range.start, range.end);
    const dailyMap = await dailyTotals(range.start, range.end, _state.view, accId);
    let lineData;
    if (_state.period === 'year') {
      // Aggregate by month
      const monthMap = new Map();
      dates.forEach(d => {
        const mk = d.slice(0, 7);
        monthMap.set(mk, (monthMap.get(mk) || 0) + (dailyMap.get(d) || 0));
      });
      lineData = Array.from(monthMap.entries()).map(([k, v]) => ({ label: k.slice(5) + '月', value: v }));
    } else if (_state.period === 'month' || dates.length > 30) {
      // Aggregate every few days for month view
      lineData = dates.map(d => ({ label: d.slice(8), value: dailyMap.get(d) || 0 }));
    } else {
      lineData = dates.map(d => ({ label: d.slice(5), value: dailyMap.get(d) || 0 }));
    }
    drawLineChart(lineCanvas, lineData, { color: _state.view === 'income' ? '#52C41A' : '#FF4D4F' });

    // Rank list
    rankList.innerHTML = '';
    if (pieData.length === 0) {
      rankList.appendChild(el('div', { class: 'empty' }, [
        el('p', { text: '此期间暂无' + (_state.view === 'income' ? '收入' : '支出') + '记录' })
      ]));
    } else {
      const total = pieData.reduce((s, d) => s + d.value, 0);
      pieData.forEach(d => {
        const pct = total > 0 ? Math.round(d.value / total * 100) : 0;
        const item = el('div', { class: 'cat-rank-item' }, [
          el('div', { class: 'icon', style: `background:${d.color}22;color:${d.color}` }, [document.createTextNode(allCats.find(c => c.id === d.id)?.icon || '💰')]),
          el('div', { class: 'info' }, [
            el('div', { class: 'row1' }, [
              el('span', { class: 'name', text: d.label }),
              el('span', { class: 'pct', text: pct + '%' })
            ]),
            el('div', { class: 'bar' }, [ el('i', { style: `width:${pct}%;background:${d.color}` }) ])
          ]),
          el('div', { class: 'amount', text: formatMoney(d.value) })
        ]);
        rankList.appendChild(item);
      });
    }
  }

  await render();
}
