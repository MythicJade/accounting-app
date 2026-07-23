// js/views/assets-trend.js — 资产趋势统计页：年度月度净资产/总资产/总负债折线图 + 表格
import { monthlyAssetTrend } from '../store.js';
import { formatMoney } from '../format.js';
import { drawMultiLineChart } from '../charts/line-chart.js';
import { el } from '../ui.js';

export async function renderAssetsTrend(mount) {
  let year = new Date().getFullYear();
  let selected = null; // { seriesIdx, pointIdx }

  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'back', onclick: () => location.hash = '#/accounts' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: '资产趋势' })
  ]);

  mount.append(topbar, el('div', { id: 'assets-trend-content' }));

  await render();

  async function render() {
    const content = document.getElementById('assets-trend-content');
    if (!content) return;
    content.innerHTML = '';

    const data = await monthlyAssetTrend(year);

    // 年份导航
    const yearNav = el('div', { class: 'year-nav between items-center' }, [
      el('button', { class: 'range-btn', onclick: () => { year--; selected = null; render(); }, text: '‹' }),
      el('span', { class: 'range-label', text: year + '年' }),
      el('button', { class: 'range-btn', onclick: () => { year++; selected = null; render(); }, text: '›' })
    ]);
    content.appendChild(yearNav);

    // 年度汇总（取最后一个月有数据的）
    let latest = null;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].netAssets != null) { latest = data[i]; break; }
    }
    if (latest) {
      const summaryCard = el('section', { class: 'card summary-card' }, [
        el('div', { class: 'summary-month', text: latest.label + '末净资产' }),
        el('div', { class: 'summary-balance' }, [
          el('div', { class: 'summary-amount', text: formatMoney(latest.netAssets) })
        ]),
        el('div', { class: 'summary-row' }, [
          el('div', { class: 'summary-item' }, [
            el('div', { class: 'summary-sub-label', text: '总资产' }),
            el('div', { class: 'summary-sub-amount income', text: formatMoney(latest.totalAssets || 0) })
          ]),
          el('div', { class: 'summary-item' }, [
            el('div', { class: 'summary-sub-label', text: '总负债' }),
            el('div', { class: 'summary-sub-amount expense', text: formatMoney(latest.totalLiabilities || 0) })
          ])
        ])
      ]);
      content.appendChild(summaryCard);
    }

    // 折线图
    const chartCard = el('section', { class: 'card chart-card' }, [
      el('div', { class: 'card-title' }, [
        el('span', { text: '月度趋势' }),
        el('span', { class: 'text-sm text-3', style: 'display:flex;gap:12px;' }, [
          el('span', { text: '● 净资产', style: 'color:#34C759;' }),
          el('span', { text: '● 总资产', style: 'color:#007AFF;' }),
          el('span', { text: '● 总负债', style: 'color:#FF3B30;' })
        ])
      ])
    ]);
    const canvas = el('canvas', { style: 'width:100%;height:240px;' });
    chartCard.appendChild(canvas);
    content.appendChild(chartCard);

    // 构建三个系列数据（只显示有数据的月份）
    const validData = data.filter(d => d.netAssets != null);
    const series = [
      {
        label: '净资产',
        color: '#34C759',
        data: validData.map(d => ({ label: d.label, value: d.netAssets, fullLabel: year + '年' + d.label }))
      },
      {
        label: '总资产',
        color: '#007AFF',
        data: validData.map(d => ({ label: d.label, value: d.totalAssets || 0, fullLabel: year + '年' + d.label }))
      },
      {
        label: '总负债',
        color: '#FF3B30',
        data: validData.map(d => ({ label: d.label, value: d.totalLiabilities || 0, fullLabel: year + '年' + d.label }))
      }
    ];

    requestAnimationFrame(() => {
      drawMultiLineChart(canvas, series, {
        selected: selected,
        onSelect: (pointIdx, seriesIdx) => {
          if (pointIdx == null) {
            selected = null;
          } else {
            // 映射回原始 data 的索引
            const validIdx = validData[pointIdx] ? data.indexOf(validData[pointIdx]) : -1;
            selected = { seriesIdx, pointIdx: pointIdx };
          }
          render();
        }
      });
    });

    // 月度表格
    const tableCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-title', text: '月度明细' })
    ]);
    const table = el('table', { class: 'assets-trend-table' });
    const thead = el('thead', {}, [el('tr', {}, [
      el('th', { text: '月份' }),
      el('th', { text: '净资产' }),
      el('th', { text: '总资产' }),
      el('th', { text: '总负债' })
    ])]);
    table.appendChild(thead);
    const tbody = el('tbody', {});
    data.forEach(d => {
      const isFuture = d.netAssets == null;
      const tr = el('tr', { class: isFuture ? 'future' : '' }, [
        el('td', { text: d.label }),
        el('td', { text: isFuture ? '—' : formatMoney(d.netAssets), class: isFuture ? '' : (d.netAssets < 0 ? 'expense' : '') }),
        el('td', { text: isFuture ? '—' : formatMoney(d.totalAssets || 0), class: 'income' }),
        el('td', { text: isFuture ? '—' : formatMoney(d.totalLiabilities || 0), class: 'expense' })
      ]);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableCard.appendChild(table);
    content.appendChild(tableCard);
  }

  // 右滑返回账户管理
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
