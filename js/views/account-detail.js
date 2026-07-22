// js/views/account-detail.js — 账户详情页：月度统计 + 编辑信息 tab 切换
import { getAccount, updateAccount, deleteAccount } from '../accounts.js';
import { listTransactions, monthlySummary, getAccountBalance } from '../store.js';
import { getAccountsMap } from '../accounts.js';
import { listCategories } from '../categories.js';
import { formatMoney, currentMonthKey, monthKeyToLabel, todayStr, getRange, shiftRange, rangeLabel, listDates, monthKeyFromDateStr } from '../format.js';
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
  const opening = acc.openingBalance ? Number(acc.openingBalance) : 0;
  const netChange = balance - opening;

  let activeTab = 'stats'; // 'stats' | 'edit'
  let monthKey = currentMonthKey();

  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'back', onclick: () => location.hash = '#/accounts' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: acc.icon + ' ' + acc.name }),
    el('button', { class: 'btn-text', onclick: onDelete, style: 'color:var(--expense);' }, [el('span', { text: '删除' })])
  ]);

  // 当前余额卡（按账户色）
  const balClass = balance < 0 ? 'expense' : '';
  const balanceCard = el('section', {
    class: 'card summary-card',
    style: `background:linear-gradient(135deg, ${acc.color} 0%, ${acc.color}cc 100%);`
  }, [
    el('div', { class: 'summary-month', text: '当前余额' }),
    el('div', { class: 'summary-balance' }, [
      el('div', { class: 'summary-amount ' + balClass, text: formatMoney(balance) })
    ]),
    el('div', { class: 'summary-row' }, [
      el('div', { class: 'summary-item' }, [
        el('div', { class: 'summary-sub-label', text: '期初余额' }),
        el('div', { class: 'summary-sub-amount', text: formatMoney(opening) })
      ]),
      el('div', { class: 'summary-item' }, [
        el('div', { class: 'summary-sub-label', text: '净变动' }),
        el('div', { class: 'summary-sub-amount ' + (netChange >= 0 ? 'income' : 'expense'), text: (netChange >= 0 ? '+' : '') + formatMoney(netChange).replace('¥', '¥') })
      ])
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

  // === 月度统计 tab ===
  async function renderStatsTab(container) {
    // 月份导航
    const [y, m] = monthKey.split('-').map(Number);
    const refDate = new Date(y, m - 1, 1);
    const range = getRange('month', refDate);

    const navRow = el('div', { class: 'between items-center range-nav', style: 'margin-bottom:12px;' }, [
      el('button', { class: 'range-btn', onclick: () => { monthKey = shiftMonth(monthKey, -1); renderTab(); }, text: '‹' }),
      el('span', { class: 'range-label', text: monthKeyToLabel(monthKey) }),
      el('button', { class: 'range-btn', onclick: () => { monthKey = shiftMonth(monthKey, 1); renderTab(); }, text: '›' })
    ]);
    container.appendChild(navRow);

    // 月度汇总
    const summary = await monthlySummary(monthKey, id);
    const summaryRow = el('div', { class: 'summary-row', style: 'background:var(--bg);border-radius:12px;padding:12px;margin-bottom:12px;' }, [
      el('div', { class: 'summary-item' }, [
        el('div', { class: 'summary-sub-label', text: '收入' }),
        el('div', { class: 'summary-sub-amount income', text: formatMoney(summary.income) })
      ]),
      el('div', { class: 'summary-item' }, [
        el('div', { class: 'summary-sub-label', text: '支出' }),
        el('div', { class: 'summary-sub-amount expense', text: formatMoney(summary.expense) })
      ]),
      el('div', { class: 'summary-item' }, [
        el('div', { class: 'summary-sub-label', text: '结余' }),
        el('div', { class: 'summary-sub-amount', text: formatMoney(summary.balance) })
      ])
    ]);
    container.appendChild(summaryRow);

    // 折线图（该账户本月每日趋势）
    const chartCard = el('section', { class: 'card chart-card' }, [
      el('div', { class: 'card-title', text: '每日趋势' })
    ]);
    const canvas = el('canvas', { style: 'width:100%;height:200px;' });
    chartCard.appendChild(canvas);
    container.appendChild(chartCard);

    // 按日聚合该账户交易
    const txs = await listTransactions({ accountId: id, dateFrom: range.start, dateTo: range.end });
    const dailyMap = new Map();
    txs.forEach(t => {
      if (t.type === 'transfer') return; // 转账不计入收支趋势
      const cur = dailyMap.get(t.date) || 0;
      if (t.type === 'income') dailyMap.set(t.date, cur + t.amount);
      else if (t.type === 'expense') dailyMap.set(t.date, cur - t.amount);
    });
    const dates = listDates(range.start, range.end);
    const lineData = dates.map(d => ({
      label: d.slice(8),
      value: Math.max(0, dailyMap.get(d) || 0),
      fullLabel: d
    }));

    // 延迟绘制（等 canvas 挂载）
    requestAnimationFrame(() => {
      drawLineChart(canvas, lineData, { color: acc.color });
    });

    // 最近交易列表（该账户）
    const txCard = el('section', { class: 'card' }, [
      el('div', { class: 'card-title', text: '本月交易（' + txs.length + '笔）' })
    ]);
    const catMap = await getCategoriesMap();
    if (txs.length === 0) {
      txCard.appendChild(el('div', { class: 'empty', style: 'padding:20px 0;' }, [el('p', { text: '本月暂无交易' })]));
    } else {
      const list = el('div', {});
      const recent = txs.slice(0, 20);
      for (const t of recent) {
        let nameText, amountText, amountClass;
        if (t.type === 'transfer') {
          const fromName = await getAccountName(t.accountId);
          const toName = await getAccountName(t.toAccountId);
          nameText = '🔄 ' + fromName + ' → ' + toName;
          amountText = formatMoney(t.amount);
          amountClass = 'transfer';
        } else {
          const cat = catMap.get(t.categoryId) || { name: '未分类', icon: '❓', color: '#999' };
          nameText = cat.icon + ' ' + cat.name;
          amountText = (t.type === 'income' ? '+' : '-') + formatMoney(t.amount);
          amountClass = t.type;
        }
        const item = el('div', { class: 'list-item', onclick: () => { location.hash = '#/edit/' + t.id; } }, [
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

    const nameInput = el('input', { class: 'input', type: 'text', placeholder: '账户名称', value: acc.name, maxlength: 12 });
    const openingInput = el('input', { class: 'input', type: 'number', placeholder: '0.00', step: '0.01', value: acc.openingBalance != null ? acc.openingBalance : '' });

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
    const colors = ['#52C41A', '#1677FF', '#07C160', '#722ED1', '#FA8C16', '#FF6B6B', '#13C2C2', '#868E96', '#FAAD14', '#EB2F96'];

    const iconGrid = el('div', { class: 'cat-grid', style: 'margin:8px 0;' });
    function renderIcons() {
      iconGrid.innerHTML = '';
      icons.forEach(ic => {
        const item = el('div', { class: 'cat-item' + (selectedIcon === ic ? ' selected' : ''), onclick: () => { selectedIcon = ic; renderIcons(); } }, [
          el('div', { class: 'cat-icon', style: 'background:#f0f0f0;color:#333' }, [document.createTextNode(ic)]),
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
        const sw = el('div', { style: `width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:${selectedColor === c ? '3px solid #333' : '3px solid transparent'};`, onclick: () => { selectedColor = c; renderColors(); } });
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
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择图标' }),
      iconGrid,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择颜色' }),
      colorRow,
      el('button', {
        class: 'btn btn-block',
        style: 'background:var(--c-primary);color:#fff;margin-top:16px;',
        onclick: async () => {
          if (!nameInput.value.trim()) { toast('请输入账户名称'); return; }
          const openingBal = openingInput.value === '' ? 0 : (parseFloat(openingInput.value) || 0);
          try {
            await updateAccount(acc.id, {
              name: nameInput.value.trim(),
              icon: selectedIcon,
              color: selectedColor,
              type: selectedType,
              openingBalance: openingBal
            });
            toast('已保存');
            router.dispatch();
          } catch (e) {
            toast('保存失败：' + (e.message || e));
          }
        }
      }, [el('span', { text: '保存' })])
    );
    container.appendChild(form);
  }

  async function onDelete() {
    const ok = await confirmDialog('确定要删除此账户吗？关联的流水记录仍保留但会显示为未分类。', { danger: true, okText: '删除' });
    if (!ok) return;
    try {
      await deleteAccount(acc.id);
      toast('已删除');
      location.hash = '#/accounts';
    } catch (e) {
      toast('删除失败：' + (e.message || e));
    }
  }
}

// 月份加减：'YYYY-MM' 加减 N 个月
function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  const list = await listCategories();
  const map = new Map();
  list.forEach(c => map.set(c.id, c));
  return map;
}
