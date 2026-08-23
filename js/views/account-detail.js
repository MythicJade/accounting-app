// js/views/account-detail.js — 账户详情页：年度统计 + 编辑信息 tab 切换
import { getAccount, updateAccount, deleteAccount, archiveAccount, restoreAccount } from '../accounts.js';
import { listTransactions, getAccountBalance, sumByType, monthlyAccountTrend } from '../store.js';
import { getAccountsMap } from '../accounts.js';
import { listCategories } from '../categories.js';
import { formatMoney, todayStr } from '../format.js';
import { drawLineChart } from '../charts/line-chart.js';
import { toast, confirmDialog, el } from '../ui.js';
import { router } from '../router.js';

export async function renderAccountDetail(mount, { id }) {
  const acc = await getAccount(id);
  if (!acc) {
    mount.appendChild(el('div', { class: 'empty' }, [el('p', { text: '账户不存在' })]));
    return;
  }

  const balance = await getAccountBalance(id);

  let activeTab = 'stats'; // 'stats' | 'edit'
  let year = String(new Date().getFullYear());

  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'back', type: 'button', 'aria-label': '返回账户管理', onclick: () => location.hash = '#/accounts' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: acc.icon + ' ' + acc.name }),
    el('button', { class: 'btn-text', onclick: onArchiveToggle, style: acc.archived ? 'color:var(--c-primary);' : 'color:var(--warning);' }, [el('span', { text: acc.archived ? '恢复' : '归档' })])
  ]);

  // 当前余额卡（按账户色，精简：只显示余额）
  const balClass = balance < 0 ? 'expense' : '';
  const balanceCard = el('section', {
    class: 'card summary-card account-balance-card',
    style: `background:linear-gradient(135deg, ${acc.color} 0%, ${acc.color}cc 100%);`
  }, [
    el('div', { class: 'summary-month', text: '当前余额' }),
    el('div', { class: 'summary-balance' }, [
      el('div', { class: 'summary-amount ' + balClass, text: formatMoney(balance) })
    ])
  ]);

  // tab 切换
  const tabSwitcher = el('div', { class: 'tab-switcher' });
  const statsBtn = el('button', { class: 'tab-btn active', text: '月度统计' });
  const editBtn = el('button', { class: 'tab-btn', text: '编辑信息' });
  tabSwitcher.append(statsBtn, editBtn);

  // 内容容器
  const content = el('div', { class: 'tab-content' });

  mount.append(topbar, balanceCard, tabSwitcher, content);

  // 初始渲染
  renderTab();

  statsBtn.addEventListener('click', () => { activeTab = 'stats'; updateTabButtons(); renderTab(); });
  editBtn.addEventListener('click', () => { activeTab = 'edit'; updateTabButtons(); renderTab(); });

  function updateTabButtons() {
    statsBtn.classList.toggle('active', activeTab === 'stats');
    editBtn.classList.toggle('active', activeTab === 'edit');
  }

  async function renderTab() {
    content.innerHTML = '';
    if (activeTab === 'stats') {
      await renderStatsTab(content);
    } else {
      renderEditTab(content);
    }
  }

  // === 年度统计 tab ===
  async function renderStatsTab(container) {
    const yNum = Number(year);
    const yearStart = year + '-01-01';
    const yearEnd = year + '-12-31';

    // 年份导航
    const navRow = el('div', { class: 'between items-center range-nav', style: 'margin-bottom:12px;' }, [
      el('button', { class: 'range-btn', type: 'button', 'aria-label': '上一年', onclick: () => { year = String(yNum - 1); renderTab(); }, text: '‹' }),
      el('span', { class: 'range-label', text: year + '年' }),
      el('button', { class: 'range-btn', type: 'button', 'aria-label': '下一年', onclick: () => { year = String(yNum + 1); renderTab(); }, text: '›' })
    ]);
    container.appendChild(navRow);

    // 年度汇总（横排）
    const summary = await sumByType(yearStart, yearEnd, id);
    const summaryRow = el('div', { class: 'stat-row', style: 'background:var(--bg);border-radius:12px;padding:12px;margin-bottom:12px;' }, [
      el('div', { class: 'stat-cell' }, [
        el('div', { class: 'stat-label', text: '收入' }),
        el('div', { class: 'stat-value income', text: formatMoney(summary.income) })
      ]),
      el('div', { class: 'stat-cell' }, [
        el('div', { class: 'stat-label', text: '支出' }),
        el('div', { class: 'stat-value expense', text: formatMoney(summary.expense) })
      ]),
      el('div', { class: 'stat-cell' }, [
        el('div', { class: 'stat-label', text: '结余' }),
        el('div', { class: 'stat-value', text: formatMoney(summary.balance) })
      ])
    ]);
    container.appendChild(summaryRow);

    // 折线图（1-12 月每月末余额；未到月底的月份用当前余额）
    const chartCard = el('section', { class: 'card chart-card' }, [
      el('div', { class: 'card-title', text: '账户余额趋势（按月）' })
    ]);
    const canvas = el('canvas', { style: 'width:100%;height:200px;', role: 'img', tabindex: '0', 'aria-label': `${year}年${acc.name}账户余额趋势` });
    chartCard.appendChild(canvas);
    container.appendChild(chartCard);

    // 计算每月末余额：包含期初日期与跨年度结转；未来月份留空
    const allAccTx = await listTransactions({ accountId: id });
    const lineData = await monthlyAccountTrend(id, yNum);

    let chartSelected = null;
    const drawChartNow = () => drawLineChart(canvas, lineData, {
      color: acc.color,
      selected: chartSelected,
      onSelect: (idx) => { chartSelected = idx; drawChartNow(); },
      valueFormatter: (v) => formatMoney(v)
    });
    // 延迟绘制（等 canvas 挂载）
    requestAnimationFrame(drawChartNow);

    // 本年交易列表
    const yearTxs = allAccTx.filter(t => t.date >= yearStart && t.date <= yearEnd);
    const txCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-title', text: '本年交易（' + yearTxs.length + '笔）' })
    ]);
    const catMap = await getCategoriesMap();
    if (yearTxs.length === 0) {
      txCard.appendChild(el('div', { class: 'empty', style: 'padding:20px 0;' }, [el('p', { text: '本年暂无交易' })]));
    } else {
      const list = el('div', {});
      const recent = yearTxs.slice(0, 20);
      for (const t of recent) {
        let nameText, amountText, amountClass;
        if (t.type === 'transfer') {
          const fromName = await getAccountName(t.accountId);
          const toName = await getAccountName(t.toAccountId);
          nameText = '🔄 ' + fromName + ' → ' + toName;
          amountText = formatMoney(t.amount);
          amountClass = 'transfer';
        } else {
          const cat = catMap.get(t.categoryId) || { name: '未分类', icon: '❓', color: '#aeaeb2' };
          nameText = cat.icon + ' ' + cat.name;
          amountText = (t.type === 'income' ? '+' : '-') + formatMoney(t.amount);
          amountClass = t.type;
        }
        const item = el('button', { class: 'list-item list-item-button', type: 'button', onclick: () => { location.hash = '#/edit/' + t.id; } }, [
          el('div', { class: 'meta', style: 'flex:1;' }, [
            el('div', { class: 'between' }, [
              el('span', { class: 'text-sm', text: nameText }),
              el('span', { class: 'text-sm ' + amountClass, text: amountText })
            ]),
            el('div', { class: 'text-sm text-3', style: 'margin-top:2px;', text: (t.note || '') + ' · ' + t.date.slice(5) })
          ])
        ]);
        list.appendChild(item);
      }
      txCard.appendChild(list);
    }
    container.appendChild(txCard);
  }

  // === 编辑信息 tab ===
  function renderEditTab(container) {
    const form = el('div', {});

    const nameInput = el('input', { class: 'input', type: 'text', 'aria-label': '账户名称', placeholder: '账户名称', value: acc.name, maxlength: 12 });
    const openingInput = el('input', { class: 'input', type: 'number', 'aria-label': '期初余额', placeholder: '0.00', step: '0.01', value: acc.openingBalance != null ? acc.openingBalance : '' });
    const openingDateInput = el('input', { class: 'input', type: 'date', 'aria-label': '期初日期', value: acc.openingDate || todayStr() });

    // 账户类型
    let selectedType = acc.type === 'credit' ? 'credit' : 'asset';
    const typeToggle = el('div', { class: 'type-toggle' });
    const assetBtn = el('button', { class: 'type-btn' + (selectedType === 'asset' ? ' active' : ''), text: '💰 资金' });
    const creditBtn = el('button', { class: 'type-btn' + (selectedType === 'credit' ? ' active' : ''), text: '💳 信用' });
    assetBtn.addEventListener('click', () => { selectedType = 'asset'; assetBtn.classList.add('active'); creditBtn.classList.remove('active'); });
    creditBtn.addEventListener('click', () => { selectedType = 'credit'; creditBtn.classList.add('active'); assetBtn.classList.remove('active'); });
    typeToggle.append(assetBtn, creditBtn);

    const icons = ['💵', '💳', '💙', '💚', '💛', '🏦', '📱', '💰', '📈', '🏠', '👛', '💎'];
    let selectedIcon = acc.icon;
    let selectedColor = acc.color;
    const colors = ['#007AFF', '#34C759', '#5856D6', '#FF9500', '#FF3B30', '#FF2D55', '#AF52DE', '#5AC8FA', '#FFCC00', '#00C7BE'];

    const iconGrid = el('div', { class: 'cat-grid', style: 'margin:8px 0;' });
    function renderIcons() {
      iconGrid.innerHTML = '';
      icons.forEach(ic => {
        const item = el('button', { class: 'cat-item' + (selectedIcon === ic ? ' selected' : ''), type: 'button', 'aria-label': `选择图标 ${ic}`, onclick: () => { selectedIcon = ic; renderIcons(); } }, [
          el('div', { class: 'cat-icon', style: 'background:var(--fill-1);color:var(--text)' }, [document.createTextNode(ic)]),
          el('div', { class: 'cat-name', text: '' })
        ]);
        iconGrid.appendChild(item);
      });
    }
    renderIcons();

    const colorRow = el('div', { style: 'display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;' });
    function renderColors() {
      colorRow.innerHTML = '';
      colors.forEach(c => {
        const sw = el('button', { type: 'button', 'aria-label': `选择颜色 ${c}`, style: `width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:${selectedColor === c ? '3px solid var(--text)' : '3px solid transparent'};`, onclick: () => { selectedColor = c; renderColors(); } });
        colorRow.appendChild(sw);
      });
    }
    renderColors();

    form.append(
      el('label', { class: 'field', style: 'display:block;margin-bottom:8px;', text: '账户名称' }),
      nameInput,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '账户类型' }),
      typeToggle,
      el('label', { class: 'text-sm text-2', style: 'display:block;margin:12px 0 4px;', text: '期初余额' }),
      openingInput,
      el('label', { class: 'text-sm text-2', style: 'display:block;margin:12px 0 4px;', text: '期初日期（余额从该日期起计入）' }),
      openingDateInput,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择图标' }),
      iconGrid,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择颜色' }),
      colorRow,
      el('button', {
        class: 'btn btn-block',
        style: 'margin-top:16px;',
        onclick: async () => {
          if (!nameInput.value.trim()) { toast('请输入账户名称'); return; }
          const openingBal = openingInput.value === '' ? 0 : (parseFloat(openingInput.value) || 0);
          try {
            await updateAccount(acc.id, {
              name: nameInput.value.trim(),
              icon: selectedIcon,
              color: selectedColor,
              type: selectedType,
              openingBalance: openingBal,
              openingDate: openingDateInput.value
            });
            toast('已保存');
            router.dispatch();
          } catch (e) {
            toast('保存失败：' + (e.message || e));
          }
        }
      }, [el('span', { text: '保存' })]),
      el('button', {
        class: 'btn btn-danger btn-block',
        style: 'margin-top:10px;',
        onclick: onDelete
      }, [el('span', { text: '永久删除未使用账户' })])
    );
    container.appendChild(form);
  }

  async function onArchiveToggle() {
    try {
      if (acc.archived) {
        await restoreAccount(acc.id);
        toast('账户已恢复');
      } else {
        await archiveAccount(acc.id);
        toast('账户已归档，历史流水仍保留');
      }
      location.hash = '#/accounts';
    } catch (e) {
      toast('操作失败：' + (e.message || e));
    }
  }

  async function onDelete() {
    const ok = await confirmDialog('只有未关联任何流水的账户才能永久删除。确定继续吗？', { danger: true, okText: '永久删除' });
    if (!ok) return;
    try {
      await deleteAccount(acc.id);
      toast('账户已永久删除');
      location.hash = '#/accounts';
    } catch (e) {
      toast('删除失败：' + (e.message || e));
    }
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

// 获取账户名（缓存）
let _accMapCache = null;
async function getAccountName(id) {
  if (!_accMapCache) {
    const m = await getAccountsMap();
    _accMapCache = m;
  }
  const a = _accMapCache.get(id);
  return a ? a.name : '?';
}

async function getCategoriesMap() {
  const list = await listCategories(null, { includeArchived: true });
  const map = new Map();
  list.forEach(c => map.set(c.id, c));
  return map;
}
