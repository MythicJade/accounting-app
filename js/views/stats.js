// js/views/stats.js — statistics page with charts
import { listTransactions, categoryBreakdown, dailyTotals, sumByType } from '../store.js';
import { listCategories } from '../categories.js';
import { listAccounts } from '../accounts.js';
import { getRange, shiftRange, rangeLabel, listDates, formatMoney, formatDateStr, monthKeyToLabel, getCustomRange, todayStr } from '../format.js';
import { el } from '../ui.js';
import { drawPieChart } from '../charts/pie-chart.js';
import { drawLineChart } from '../charts/line-chart.js';

const PERIODS = [
  { key: 'month',   label: '月' },
  { key: 'year',    label: '年' },
  { key: 'custom',  label: '自定义' }
];

let _state = {
  period: 'month',
  range: null,
  view: 'expense',          // 'expense' | 'income'
  selectedSlice: null,      // pie selected slice index
  selectedPoint: null,     // line selected point index
  accountId: null,         // null = all accounts
  customStart: null,       // YYYY-MM-DD
  customEnd: null
};

function ensureRange() {
  if (!_state.range) {
    _state.range = getRange(_state.period);
  }
  if (_state.period === 'custom' && (!_state.customStart || !_state.customEnd)) {
    // Default custom range = current month
    const r = getRange('month');
    _state.customStart = r.start;
    _state.customEnd = r.end;
    _state.range = getCustomRange(r.start, r.end);
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
      onclick: () => onPeriodChange(p.key)
    });
    periodTabs.appendChild(btn);
  });

  // Range nav (hidden in custom mode)
  const rangeLabelEl = el('span', { class: 'label', text: rangeLabel(_state.range, _state.period) });
  const rangeNav = el('div', { class: 'range-nav' }, [
    el('button', { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>', onclick: () => { _state.range = shiftRange(_state.range, _state.period, -1); _state.selectedSlice = null; _state.selectedPoint = null; render(); } }),
    rangeLabelEl,
    el('button', { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>', onclick: () => { _state.range = shiftRange(_state.range, _state.period, 1); _state.selectedSlice = null; _state.selectedPoint = null; render(); } })
  ]);

  // Custom date range panel (hidden by default)
  const startInput = el('input', {
    type: 'date',
    class: 'input',
    value: _state.customStart || todayStr(),
    style: 'flex:1;'
  });
  startInput.addEventListener('change', (e) => {
    _state.customStart = e.target.value;
    if (_state.customStart && _state.customEnd) {
      _state.range = getCustomRange(_state.customStart, _state.customEnd);
      _state.selectedSlice = null; _state.selectedPoint = null;
      render();
    }
  });
  const endInput = el('input', {
    type: 'date',
    class: 'input',
    value: _state.customEnd || todayStr(),
    style: 'flex:1;'
  });
  endInput.addEventListener('change', (e) => {
    _state.customEnd = e.target.value;
    if (_state.customStart && _state.customEnd) {
      _state.range = getCustomRange(_state.customStart, _state.customEnd);
      _state.selectedSlice = null; _state.selectedPoint = null;
      render();
    }
  });
  const quickMonthBtn = el('button', { class: 'btn-text', text: '本月', style: 'font-size:12px;', onclick: () => {
    const r = getRange('month');
    _state.customStart = r.start; _state.customEnd = r.end;
    startInput.value = r.start; endInput.value = r.end;
    _state.range = getCustomRange(r.start, r.end);
    _state.selectedSlice = null; _state.selectedPoint = null;
    render();
  }});
  const quickLast30Btn = el('button', { class: 'btn-text', text: '近30天', style: 'font-size:12px;', onclick: () => {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 29);
    const s = formatDateStr(start), e = formatDateStr(end);
    _state.customStart = s; _state.customEnd = e;
    startInput.value = s; endInput.value = e;
    _state.range = getCustomRange(s, e);
    _state.selectedSlice = null; _state.selectedPoint = null;
    render();
  }});
  const quickYearBtn = el('button', { class: 'btn-text', text: '今年', style: 'font-size:12px;', onclick: () => {
    const r = getRange('year');
    _state.customStart = r.start; _state.customEnd = r.end;
    startInput.value = r.start; endInput.value = r.end;
    _state.range = getCustomRange(r.start, r.end);
    _state.selectedSlice = null; _state.selectedPoint = null;
    render();
  }});
  const customPanel = el('div', { class: 'card', style: 'padding:10px 12px;display:none;' }, [
    el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
      el('span', { text: '起', style: 'font-size:12px;color:var(--text-3);' }),
      startInput,
      el('span', { text: '止', style: 'font-size:12px;color:var(--text-3);' }),
      endInput
    ]),
    el('div', { style: 'display:flex;gap:12px;margin-top:8px;' }, [
      quickMonthBtn, quickLast30Btn, quickYearBtn
    ])
  ]);

  function onPeriodChange(newPeriod) {
    _state.period = newPeriod;
    if (newPeriod === 'custom') {
      if (!_state.customStart || !_state.customEnd) {
        const r = getRange('month');
        _state.customStart = r.start; _state.customEnd = r.end;
      }
      _state.range = getCustomRange(_state.customStart, _state.customEnd);
      startInput.value = _state.customStart;
      endInput.value = _state.customEnd;
    } else {
      _state.range = getRange(newPeriod);
    }
    _state.selectedSlice = null;
    _state.selectedPoint = null;
    render();
  }

  // Type toggle (支出/收入)
  const typeToggle = el('div', { class: 'type-tabs', style: 'margin-bottom:8px;' }, [
    el('button', { class: _state.view === 'expense' ? 'active expense' : '', text: '支出', onclick: () => { _state.view = 'expense'; _state.selectedSlice = null; _state.selectedPoint = null; render(); } }),
    el('button', { class: _state.view === 'income' ? 'active income' : '', text: '收入', onclick: () => { _state.view = 'income'; _state.selectedSlice = null; _state.selectedPoint = null; render(); } })
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
  pieCanvas.style.height = '260px';
  const pieHint = el('div', { class: 'text-sm text-3 center', style: 'margin-top:6px;font-size:11px;', text: '点击扇区查看详情' });
  const pieCard = el('section', { class: 'card chart-card' }, [
    el('div', { class: 'card-title', text: '分类占比' }),
    pieCanvas,
    pieHint
  ]);

  const lineCanvas = el('canvas');
  lineCanvas.style.height = '220px';
  const lineHint = el('div', { class: 'text-sm text-3 center', style: 'margin-top:6px;font-size:11px;', text: '点击折线查看具体金额' });
  const lineCard = el('section', { class: 'card chart-card' }, [
    el('div', { class: 'card-title', text: '趋势' }),
    lineCanvas,
    lineHint
  ]);

  // Category rank list
  const rankCard = el('section', { class: 'card' }, [
    el('div', { class: 'card-title', text: '分类排行' })
  ]);
  const rankList = el('div');
  rankCard.appendChild(rankList);

  mount.append(topbar, accountChips, periodTabs, rangeNav, customPanel, typeToggle, summaryRow, pieCard, lineCard, rankCard);

  // Render function (re-renders in place)
  async function render() {
    rangeLabelEl.textContent = rangeLabel(_state.range, _state.period);

    // Show/hide range nav vs custom panel
    if (_state.period === 'custom') {
      rangeNav.style.display = 'none';
      customPanel.style.display = 'block';
      startInput.value = _state.customStart;
      endInput.value = _state.customEnd;
    } else {
      rangeNav.style.display = 'flex';
      customPanel.style.display = 'none';
    }

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

    // reset selection if out of range
    if (_state.selectedSlice != null && _state.selectedSlice >= pieData.length) {
      _state.selectedSlice = null;
    }

    drawPieChart(pieCanvas, pieData, {
      selected: _state.selectedSlice,
      topLabels: 3,
      onSelect: (idx) => {
        _state.selectedSlice = (_state.selectedSlice === idx) ? null : idx;
        render();
      }
    });

    // line data — build label/fullLabel for tooltip
    const dates = listDates(range.start, range.end);
    const dailyMap = await dailyTotals(range.start, range.end, _state.view, accId);
    let lineData;
    const totalDays = dates.length;
    if (totalDays > 90) {
      // Aggregate by month
      const monthMap = new Map();
      dates.forEach(d => {
        const mk = d.slice(0, 7);
        monthMap.set(mk, (monthMap.get(mk) || 0) + (dailyMap.get(d) || 0));
      });
      lineData = Array.from(monthMap.entries()).map(([k, v]) => ({
        label: k.slice(5) + '月',
        value: v,
        fullLabel: monthKeyToLabel(k)
      }));
    } else if (totalDays > 31) {
      // Aggregate by week bucket (every 7 days)
      const buckets = [];
      for (let i = 0; i < dates.length; i += 7) {
        const slice = dates.slice(i, i + 7);
        const sum = slice.reduce((s, d) => s + (dailyMap.get(d) || 0), 0);
        buckets.push({
          label: slice[0].slice(5),
          value: sum,
          fullLabel: slice[0] + ' ~ ' + slice[slice.length - 1]
        });
      }
      lineData = buckets;
    } else {
      lineData = dates.map(d => ({
        label: d.slice(5),
        value: dailyMap.get(d) || 0,
        fullLabel: d
      }));
    }
    // reset selected point if out of range
    if (_state.selectedPoint != null && _state.selectedPoint >= lineData.length) {
      _state.selectedPoint = null;
    }
    drawLineChart(lineCanvas, lineData, {
      color: _state.view === 'income' ? '#52C41A' : '#FF4D4F',
      selected: _state.selectedPoint,
      onSelect: (idx) => {
        _state.selectedPoint = (_state.selectedPoint === idx) ? null : idx;
        render();
      },
      valueFormatter: (v) => formatMoney(v)
    });

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
        const catObj = allCats.find(c => c.id === d.id);
        const item = el('div', { class: 'cat-rank-item' }, [
          el('div', { class: 'icon', style: `background:${d.color}22;color:${d.color}` }, [document.createTextNode(catObj?.icon || '💰')]),
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
