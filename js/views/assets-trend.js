// js/views/assets-trend.js — 资产趋势统计页：年度月度净资产/总资产/总负债折线图 + 表格
// v2.1.2: 折线图支持滑动跟手（scrub）交互；点选/滑动只局部重绘图表与快照，
//         不再整页刷新；图表上的触摸不再触发「右滑返回账户」手势。
import { monthlyAssetTrend } from '../store.js';
import { formatMoney } from '../format.js';
import { drawMultiLineChart } from '../charts/line-chart.js';
import { el } from '../ui.js';
import { cssVar } from '../theme.js';

export async function renderAssetsTrend(mount) {
  let year = new Date().getFullYear();
  let selectedIdx = null;    // X 轴索引（月），null = 未选中
  let lastSeries = [];       // 最近一次绘制的数据系列（scrub 局部重绘用）
  let latestData = null;     // 年度内最后一个月有数据的记录

  const topbar = el('header', { class: 'topbar asset-topbar' }, [
    el('button', { class: 'back', type: 'button', 'aria-label': '返回账户管理', onclick: () => location.hash = '#/accounts' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: '资产趋势' })
  ]);

  mount.append(topbar, el('div', { id: 'assets-trend-content' }));

  async function render() {
    const content = document.getElementById('assets-trend-content');
    if (!content) return;
    content.innerHTML = '';

    const data = await monthlyAssetTrend(year);

    // 年份导航
    const yearNav = el('div', { class: 'year-nav' }, [
      el('button', { class: 'range-btn', type: 'button', 'aria-label': '上一年', onclick: () => { year--; selectedIdx = null; render(); }, text: '‹' }),
      el('div', { class: 'year-nav-copy' }, [
        el('span', { class: 'range-label', text: year + '年' }),
        el('span', { class: 'range-dates', text: `${year}/01/01–${year}/12/31` })
      ]),
      el('button', { class: 'range-btn', type: 'button', 'aria-label': '下一年', onclick: () => { year++; selectedIdx = null; render(); }, text: '›' })
    ]);
    content.appendChild(yearNav);

    // 年度汇总（取最后一个月有数据的）
    latestData = null;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].netAssets != null) { latestData = data[i]; break; }
    }

    // 快照卡片：选中月份时由 updateSnapshot() 实时刷新内容
    // v2.1.3: 用「有数据的月份行」做索引映射，避免与原始 12 月数组错位
    const validRows = data.filter(d => d.netAssets != null);
    const snapshotMonth = el('div', { class: 'summary-month' });
    const snapshotNet = el('div', { class: 'summary-amount' });
    const snapshotAssets = el('div', { class: 'summary-sub-amount income' });
    const snapshotLiabilities = el('div', { class: 'summary-sub-amount expense' });
    const snapshotCard = el('section', { class: 'card summary-card asset-snapshot' }, [
      snapshotMonth,
      el('div', { class: 'summary-balance' }, [snapshotNet]),
      el('div', { class: 'summary-row' }, [
        el('div', { class: 'summary-item' }, [
          el('div', { class: 'summary-sub-label', text: '总资产' }),
          snapshotAssets
        ]),
        el('div', { class: 'summary-item' }, [
          el('div', { class: 'summary-sub-label', text: '总负债' }),
          snapshotLiabilities
        ])
      ])
    ]);

    // 更新快照显示：monthIdx 为图表 X 轴索引（validRows 下标），null 回显最新月
    function updateSnapshot(monthIdx) {
      let d = latestData;
      if (typeof monthIdx === 'number' && validRows[monthIdx]) {
        d = validRows[monthIdx];
      }
      if (!d) return;
      snapshotMonth.textContent = d.label + '末净资产';
      snapshotNet.textContent = formatMoney(d.netAssets);
      snapshotAssets.textContent = formatMoney(d.totalAssets || 0);
      snapshotLiabilities.textContent = formatMoney(d.totalLiabilities || 0);
    }
    updateSnapshot(null);
    if (latestData) content.appendChild(snapshotCard);

    // 折线图卡片
    const chartCard = el('section', { class: 'card chart-card asset-chart-card' }, [
      el('div', { class: 'card-title section-heading' }, [
        el('span', { text: '资产变化' })
      ]),
      el('div', { class: 'chart-legend' }, [
        el('span', { class: 'legend-pill net', text: '净资产' }),
        el('span', { class: 'legend-pill liability', text: '负债总额' }),
        el('span', { class: 'legend-pill asset', text: '资产总额' })
      ])
    ]);
    const canvas = el('canvas', { style: 'width:100%;height:240px;', role: 'img', tabindex: '0', 'aria-label': `${year}年净资产、总资产和总负债月度趋势，左右滑动查看各月数值` });
    const chartHint = el('div', { class: 'text-sm text-3 center', style: 'margin-top:6px;font-size:11px;', text: '在图上滑动即可查看对应月份数值' });
    chartCard.appendChild(canvas);
    chartCard.appendChild(chartHint);
    content.appendChild(chartCard);

    // 构建三个系列数据（只显示有数据的月份）
    // v2.2.0：系列颜色来自当前主题的图表变量，四套主题自动切换
    const validData = data.filter(d => d.netAssets != null);
    lastSeries = [
      {
        label: '净资产',
        color: cssVar('--chart-net', '#D98F06'),
        data: validData.map(d => ({ label: d.label, value: d.netAssets, fullLabel: year + '年' + d.label }))
      },
      {
        label: '总资产',
        color: cssVar('--chart-asset-trend', '#2E9E8F'),
        data: validData.map(d => ({ label: d.label, value: d.totalAssets || 0, fullLabel: year + '年' + d.label }))
      },
      {
        label: '总负债',
        color: cssVar('--chart-liability', '#E05648'),
        data: validData.map(d => ({ label: d.label, value: d.totalLiabilities || 0, fullLabel: year + '年' + d.label }))
      }
    ];

    // 局部重绘：scrub / 点选只刷画布 + 快照，不触发整页 render
    if (selectedIdx != null && validData.length && selectedIdx >= validData.length) {
      selectedIdx = null;
    }
    function redrawChart() {
      drawMultiLineChart(canvas, lastSeries, {
        selected: selectedIdx,
        onScrub: (idx) => {
          selectedIdx = idx;
          redrawChart();
          updateSnapshot(selectedIdx);
        },
        onSelect: (idx) => {
          selectedIdx = idx;
          redrawChart();
          updateSnapshot(selectedIdx);
        },
        valueFormatter: (v) => formatMoney(v)
      });
    }
    requestAnimationFrame(redrawChart);

    // 月度表格
    const tableCard = el('section', { class: 'card asset-table-card' }, [
      el('div', { class: 'card-title section-heading', text: '月度明细' })
    ]);
    const table = el('table', { class: 'assets-trend-table' });
    const thead = el('thead', {}, [el('tr', {}, [
      el('th', { text: '月份' }),
      el('th', { text: '净资产' }),
      el('th', { text: '总负债' }),
      el('th', { text: '总资产' })
    ])]);
    table.appendChild(thead);
    const tbody = el('tbody', {});
    data.forEach((d, i) => {
      const isFuture = d.netAssets == null;
      const tr = el('tr', { class: isFuture ? 'future' : '' }, [
        el('td', { text: d.label }),
        el('td', { text: isFuture ? '—' : formatMoney(d.netAssets), class: isFuture ? '' : (d.netAssets < 0 ? 'expense' : '') }),
        el('td', { text: isFuture ? '—' : formatMoney(d.totalLiabilities || 0), class: 'expense' }),
        el('td', { text: isFuture ? '—' : formatMoney(d.totalAssets || 0), class: 'income' })
      ]);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableCard.appendChild(table);
    content.appendChild(tableCard);
  }

  await render();

  // 右滑返回账户管理（图表区域的触摸已在图表层 stopPropagation，不会被此手势拦截）
  let touchStartX = 0, touchStartY = 0, touchActive = false;
  const onStart = (e) => {
    if (e.target && e.target.closest && e.target.closest('.chart-card')) {
      touchActive = false;   // 图表卡内的手势交给图表 scrub
      return;
    }
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
    // 右滑返回：deltaX > 80 且水平为主（避免误触发垂直滚动）
    if (deltaX > 80 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      location.hash = '#/accounts';
    }
  };
  mount.addEventListener('touchstart', onStart, { passive: true });
  mount.addEventListener('touchend', onEnd, { passive: true });

  // 返回 cleanup，路由切换时移除监听
  return () => {
    mount.removeEventListener('touchstart', onStart);
    mount.removeEventListener('touchend', onEnd);
  };
}
