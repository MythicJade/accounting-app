// js/views/home.js — v2.3.0 明细流首页
// 紧凑顶栏（账本 + 资产入口）/ 半圆仪表预算卡（可左右滑切换月份）
// / 日期分组流水（每组头带收支小计，每笔独立卡片 + 彩色实心图标 + 渠道小标签）/ 右下 FAB
import { listTransactions, monthlySummary, getBudget, setupStarterData } from '../store.js';
import { listCategories } from '../categories.js';
import { getAccountsMap, listAccounts } from '../accounts.js';
import { formatMoney, dateWithWeekday } from '../format.js';
import { el, toast } from '../ui.js';
import { router } from '../router.js';
import { categoryIconNode } from '../category-icons.js';
import { todayDateOnly } from '../date-only.js';
import { openTransaction } from '../navigation.js';

let _categoriesCache = null;

async function getCategoriesMap() {
  if (!_categoriesCache) {
    _categoriesCache = await listCategories(null, { includeArchived: true });
  }
  const map = new Map();
  _categoriesCache.forEach(c => map.set(c.id, c));
  return map;
}

function monthKeyByOffset(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${ym}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    daysInMonth: lastDay
  };
}

function shortRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${String(m).padStart(2, '0')}/01-${String(m).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;
}

function getHomePref(key, fallback = '1') {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; }
}

export async function renderHome(mount) {
  let disposed = false;
  let gaugeRevision = 0;
  const timers = [];
  const recentPage = await listTransactions({ limit: 200, returnPage: true });
  const recent = recentPage.items;
  const [catMap, accMap, activeAccounts, activeCategories] = await Promise.all([
    getCategoriesMap(),
    getAccountsMap(),
    listAccounts(),
    listCategories()
  ]);
  _categoriesCache = null;

  const showGauge = getHomePref('pref-home-gauge') !== '0';
  const showWallet = getHomePref('pref-home-wallet') !== '0';

  const nodes = [];

  // ===== 紧凑顶栏：账本名 + 资产入口 =====
  const bookBtn = el('span', { class: 'book-btn', text: '我的账本' });
  const topbar = el('header', { class: 'home-topbar' }, [
    bookBtn,
    ...(showWallet ? [el('a', {
      class: 'wallet-btn', href: '#/assets', 'aria-label': '查看总资产'
    }, [
      el('svg', { viewBox: '0 0 24 24', width: '21', height: '21', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true', html: '<path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h11.5"/><path d="M15.5 12h4.5v4h-4.5a2 2 0 1 1 0-4Z"/>' })
    ])] : [])
  ]);
  nodes.push(topbar);

  // ===== 首次使用引导 =====
  if (!activeAccounts.length || !activeCategories.length) {
    const setupButton = el('button', { class: 'btn', type: 'button', text: '一键初始化' });
    setupButton.addEventListener('click', async () => {
      setupButton.disabled = true;
      try {
        await setupStarterData();
        toast('基础账户和分类已准备好');
        router.dispatch();
      } catch (error) {
        toast('初始化失败：' + (error.message || error));
        setupButton.disabled = false;
      }
    });
    nodes.push(el('section', { class: 'card onboarding-card' }, [
      el('div', { class: 'onboarding-icon', 'aria-hidden': 'true', text: '👋' }),
      el('div', { class: 'onboarding-copy' }, [
        el('h2', { text: '先把账本准备好' }),
        el('p', { text: '创建现金、银行卡和常用收支分类，之后都可以修改或归档。' }),
        el('div', { class: 'onboarding-actions' }, [
          setupButton,
          el('a', { class: 'btn btn-ghost', href: '#/accounts', text: '自己设置' })
        ])
      ])
    ]));
  }

  // ===== 半圆仪表预算卡（可左右滑动切换月份，3 个月范围） =====
  if (showGauge) {
    let gaugeOffset = 0; // 0 = 本月, -1, -2
    const gaugeCard = el('section', { class: 'gauge-card', 'aria-label': '预算仪表，左右滑动切换月份' });

    async function renderGauge() {
      const revision = ++gaugeRevision;
      const offset = gaugeOffset;
      const ym = monthKeyByOffset(offset);
      const { start, end, daysInMonth } = monthRange(ym);
      const [sum, budget] = await Promise.all([
        monthlySummary(ym, null),
        getBudget(ym)
      ]);
      if (disposed || revision !== gaugeRevision) return;
      const spent = sum.expense;
      const limit = budget ? budget.limit : 0;
      const remainingCents = Math.round(limit * 100) - Math.round(spent * 100);
      const remaining = remainingCents / 100;
      const over = limit > 0 && remaining < 0;
      const pct = limit > 0 ? Math.min(140, Math.round(spent / limit * 100)) : 0;

      const isCurrent = offset === 0;
      let daysLeft = 0;
      if (isCurrent) {
        const now = new Date();
        daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);
      }

      gaugeCard.innerHTML = '';
      gaugeCard.classList.toggle('is-empty', limit <= 0);
      const monthLabel = isCurrent ? '本月' : ym.replace('-', '年') + '月';
      const flag = limit > 0 ? (over ? monthLabel + '预算已超支' : monthLabel + '预算') : monthLabel + '未设预算';
      const title = el('div', { class: 'gauge-title', text: flag });
      const range = el('div', { class: 'gauge-range', text: shortRange(ym) });

      const arcColor = limit > 0 ? (over ? 'var(--expense)' : 'var(--c-primary)') : 'var(--text-3)';
      const arcPct = limit > 0 ? Math.min(100, pct) : 0;
      const svg = el('svg', { class: 'gauge-svg', viewBox: '0 0 200 104', 'aria-hidden': 'true' }, []);
      svg.innerHTML =
        `<path d="M 22 96 A 78 78 0 0 1 178 96" fill="none" stroke="var(--fill-2)" stroke-width="11" stroke-linecap="round"/>` +
        `<path class="gauge-progress" d="M 22 96 A 78 78 0 0 1 178 96" fill="none" stroke="${arcColor}" stroke-width="11" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - arcPct}" style="--gauge-offset:${100 - arcPct}"/>`;

      let leftVal, leftLabel, centerVal, centerLabel;
      if (limit > 0) {
        if (over) {
          leftVal = '超支 ' + formatMoney(Math.abs(remaining));
          leftLabel = '预算已超支';
        } else {
          leftVal = formatMoney(Math.max(0, remaining));
          leftLabel = '还可消费';
        }
        if (isCurrent) {
          centerVal = over ? '0' : formatMoney(Math.floor(Math.max(0, remainingCents) / daysLeft) / 100);
          centerLabel = over ? '剩余日均可消费' : '剩余日均可消费';
        } else {
          centerVal = formatMoney(Math.floor(Math.round(spent * 100) / daysInMonth) / 100);
          centerLabel = '日均支出';
        }
      } else {
        leftVal = formatMoney(sum.income);
        leftLabel = isCurrent ? '本月收入' : '该月收入';
        centerVal = '—';
        centerLabel = '去设置预算 ›';
      }
      const rightVal = formatMoney(spent);
      const rightLabel = isCurrent ? '本月已消费' : '该月已消费';

      const left = el('div', { class: 'gauge-col' }, [
        el('div', { class: 'gv' + (over ? ' over' : ''), text: leftVal }),
        el('div', { class: 'gl', text: leftLabel })
      ]);
      const center = el('div', { class: 'gauge-col center' }, [
        el('div', { class: 'gv big', text: centerVal }),
        el('div', { class: 'gl', text: centerLabel })
      ]);
      const right = el('div', { class: 'gauge-col right' }, [
        el('div', { class: 'gv', text: rightVal }),
        el('div', { class: 'gl', text: rightLabel })
      ]);
      const cols = el('div', { class: 'gauge-cols' }, [left, center, right]);

      const dots = el('div', { class: 'gauge-dots' }, [-2, -1, 0].map(off =>
        el('button', {
          class: 'g-dot' + (offset === off ? ' on' : ''), type: 'button',
          'aria-label': off === 0 ? '本月' : `${-off} 个月前`,
          onclick: (e) => { e.stopPropagation(); gaugeOffset = off; renderGauge(); }
        })
      ));

      const foot = el('div', { class: 'gauge-foot' }, [
        el('span', { text: `收入 ${formatMoney(sum.income)}` }),
        el('span', { class: 'g-sep', text: '·' }),
        el('span', { text: `支出 ${formatMoney(sum.expense)}` }),
        el('span', { class: 'g-sep', text: '·' }),
        el('span', { text: `结余 ${formatMoney(sum.balance)}` }),
        el('a', { class: 'g-more', href: '#/stats?' + new URLSearchParams({ period: 'month', type: 'expense', from: start, to: end }), text: '统计 ›', onclick: (e) => e.stopPropagation() })
      ]);

      gaugeCard.append(title, range, svg, cols, dots, foot);
      gaugeCard.dataset.month = ym;
    }

    await renderGauge();

    // 卡上左右滑切换月份（阻止冒泡，避免触发页面级左滑进账户）
    let sx = 0, sy = 0, sActive = false;
    gaugeCard.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      sActive = true;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    gaugeCard.addEventListener('touchend', (e) => {
      e.stopPropagation();
      if (!sActive) return;
      sActive = false;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const next = Math.min(0, Math.max(-2, gaugeOffset + (dx > 0 ? 1 : -1)));
        if (next !== gaugeOffset) { gaugeOffset = next; renderGauge(); }
      }
    }, { passive: true });
    gaugeCard.addEventListener('click', () => { location.hash = '#/budget?month=' + gaugeCard.dataset.month; });

    nodes.push(gaugeCard);
  }

  // 左滑进入账户管理提示（仅首次显示）
  if (!localStorage.getItem('swipe_hint_shown')) {
    const hint = el('div', { class: 'swipe-hint', text: '← 左滑管理账户' });
    nodes.push(hint);
    timers.push(setTimeout(() => {
      if (disposed) return;
      localStorage.setItem('swipe_hint_shown', '1');
      if (hint.parentNode) hint.classList.add('fade-out');
      timers.push(setTimeout(() => { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 500));
    }, 3000));
  }

  // ===== 日期分组流水 =====
  const recentCard = el('section', { class: 'tx-section' });
  const header = el('div', { class: 'card-title section-heading' }, [
    el('span', { text: '最近流水' }),
    recent.length > 0 ? el('a', { class: 'text-sm', href: '#/transactions', text: '全部流水 ›' }) : null
  ]);
  recentCard.appendChild(header);

  if (recent.length === 0) {
    recentCard.appendChild(el('div', { class: 'empty' }, [
      el('svg', { viewBox: '0 0 24 24', width: '48', height: '48', fill: 'currentColor' }, []),
      el('p', { text: '还没有记录，点击右下角「+」记一笔吧' })
    ]));
    const emptySvg = recentCard.querySelector('svg');
    if (emptySvg) emptySvg.innerHTML = '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4h2v4zm0-6h-2V7h2v4z"/>';
  } else {
    const list = el('div', { class: 'transaction-list' });
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
    });

    groups.forEach(g => {
      const totals = recentPage.days[g.date];
      g.income = totals.incomeCents / 100;
      g.expense = totals.expenseCents / 100;
      const headerRight = [];
      if (g.income > 0) headerRight.push(el('span', { class: 'day-income', text: '收入' + formatMoney(g.income) }));
      if (g.expense > 0) headerRight.push(el('span', { class: 'day-expense', text: '支出' + formatMoney(g.expense) }));
      list.appendChild(el('div', { class: 'tx-date-header' }, [
        el('span', { class: 'tx-date-label', text: dateWithWeekday(g.date) }),
        el('div', { class: 'tx-date-totals' }, headerRight)
      ]));

      g.items.forEach(t => {
        let iconNode, nameText, amountText, amountClass, channelText = '';
        if (t.type === 'transfer') {
          const fromAcc = accMap.get(t.accountId) || { name: '?', color: '#aeaeb2' };
          const toAcc = accMap.get(t.toAccountId) || { name: '?', color: '#aeaeb2' };
          iconNode = el('div', { class: 'tx-icon-solid', style: 'background:var(--transfer)' }, [
            el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'aria-hidden': 'true', html: '<path d="M6.5 8h9l-2.6-2.6M17.5 16h-9l2.6 2.6"/>' })
          ]);
          nameText = fromAcc.name + ' → ' + toAcc.name;
          amountText = formatMoney(t.amount);
          amountClass = 'transfer';
        } else {
          const cat = catMap.get(t.categoryId) || { name: '未分类', color: '#aeaeb2' };
          const acc = accMap.get(t.accountId);
          iconNode = el('div', { class: 'tx-icon-solid', style: `background:${cat.color}` }, [
            categoryIconNode(cat, { size: 21 })
          ]);
          nameText = cat.name;
          channelText = acc ? acc.name : '';
          amountText = (t.type === 'income' ? '+' : '-') + formatMoney(t.amount);
          amountClass = t.type;
        }
        const item = el('button', { class: 'tx-item tx-item-button', type: 'button', dataset: { id: t.id }, 'aria-label': `查看 ${nameText} ${amountText}` }, [
          el('div', { class: 'tx-left' }, [
            iconNode,
            el('span', { class: 'tx-copy' }, [
              el('span', { class: 'name', text: nameText }),
              t.date > todayDateOnly() ? el('span', { class: 'future-date', text: '未来日期' }) : null
            ])
          ]),
          el('div', { class: 'tx-right' }, [
            el('span', { class: 'amount ' + amountClass, text: amountText }),
            ...(channelText ? [el('span', { class: 'chan-pill', text: channelText })] : [])
          ])
        ]);
        item.addEventListener('click', () => openTransaction(t.id));
        list.appendChild(item);
      });
    });
    recentCard.appendChild(list);
  }
  nodes.push(recentCard);

  // ===== FAB =====
  nodes.push(el('button', { class: 'fab-add', 'aria-label': '记一笔', onclick: () => location.hash = '#/add' }, [
    el('svg', { viewBox: '0 0 24 24', width: '28', height: '28', fill: 'currentColor', html: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>' })
  ]));

  mount.append(...nodes);

  // 左滑手势进入账户管理
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
    if (deltaX < -80 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      location.hash = '#/accounts';
    }
  };
  mount.addEventListener('touchstart', onStart, { passive: true });
  mount.addEventListener('touchend', onEnd, { passive: true });

  return () => {
    disposed = true; gaugeRevision++;
    timers.forEach(clearTimeout);
    mount.removeEventListener('touchstart', onStart);
    mount.removeEventListener('touchend', onEnd);
  };
}

export function invalidateCategoryCache() { _categoriesCache = null; }
