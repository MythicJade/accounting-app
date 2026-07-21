// js/views/budget.js — budget management view
import { getBudget, setBudget, listBudgets, monthlySummary } from '../store.js';
import { currentMonthKey, monthKeyToLabel, formatMoney } from '../format.js';
import { toast, promptDialog, el } from '../ui.js';
import { router } from '../router.js';

export async function renderBudget(mount) {
  const monthKey = currentMonthKey();
  const budget = await getBudget(monthKey);
  const summary = await monthlySummary(monthKey);
  const limit = budget ? budget.limit : 0;
  const used = summary.expense;
  const remaining = limit - used;
  const pct = limit > 0 ? Math.min(150, Math.round(used / limit * 100)) : 0;
  const overBudget = limit > 0 && used > limit;

  const topbar = el('header', { class: 'topbar' }, [
    el('h1', { text: '预算管理' }),
    el('button', { class: 'btn-text', onclick: () => editBudget(monthKey, limit) }, [el('span', { text: limit > 0 ? '修改' : '设置' })])
  ]);

  // Hero card
  const pctLabel = el('div', { class: 'budget-progress' + (overBudget ? ' danger' : '') }, [ el('i', { style: `width:${Math.min(100, pct)}%` }) ]);
  const hero = el('section', { class: 'budget-hero' }, [
    el('div', { class: 'label', text: monthKeyToLabel(monthKey) + ' 已用' }),
    el('div', { class: 'used', text: formatMoney(used) }),
    pctLabel,
    el('div', { class: 'meta' }, [
      el('span', { text: '预算 ' + formatMoney(limit) }),
      el('span', { text: overBudget ? '超支 ' + formatMoney(Math.abs(remaining)) : '剩余 ' + formatMoney(remaining) })
    ])
  ]);

  // Quick set / warning
  let warningCard = null;
  if (!budget || limit === 0) {
    warningCard = el('section', { class: 'card center' }, [
      el('p', { class: 'text-2 text-sm', text: '尚未设置本月预算' }),
      el('button', { class: 'btn mt-8', onclick: () => editBudget(monthKey, 0) }, [el('span', { text: '设置预算' })])
    ]);
  } else if (overBudget) {
    warningCard = el('section', { class: 'card center', style: 'background:#FFF1F0;border:1px solid #FFCCC7;' }, [
      el('p', { style: 'color:var(--expense);font-weight:500;', text: '⚠️ 已超出预算 ' + formatMoney(Math.abs(remaining)) })
    ]);
  } else if (pct >= 80) {
    warningCard = el('section', { class: 'card center', style: 'background:#FFF7E6;border:1px solid #FFD591;' }, [
      el('p', { style: 'color:#FA8C16;font-weight:500;', text: '⚠️ 已使用 ' + pct + '%，注意控制开支' })
    ]);
  }

  // History
  const historyCard = el('section', { class: 'card' }, [
    el('div', { class: 'card-title', text: '近6个月预算执行' })
  ]);
  const historyList = el('div');

  // Compute history
  const allBudgets = await listBudgets();
  const budgetMap = new Map(allBudgets.map(b => [b.key, b.limit]));
  const months = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const mk = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0');
    months.push(mk);
  }

  const monthSums = await Promise.all(months.map(mk => monthlySummary(mk)));
  const maxVal = Math.max(1, ...months.map((mk, i) => Math.max(budgetMap.get(mk) || 0, monthSums[i].expense)));
  for (let i = 0; i < months.length; i++) {
    const mk = months[i];
    const sum = monthSums[i];
    const lim = budgetMap.get(mk) || 0;
    const used = sum.expense;
    const isCurrent = mk === monthKey;
    const pctH = lim > 0 ? Math.min(100, used / lim * 100) : (maxVal > 0 ? Math.min(100, used / maxVal * 100) : 0);
    const barColor = lim > 0 && used > lim ? '#FF4D4F' : (lim > 0 && used / lim > 0.8 ? '#FAAD14' : '#4ECDC4');
    const item = el('div', { class: 'history-item' }, [
      el('div', { class: 'month', text: (isCurrent ? '▸ ' : '') + monthKeyToLabel(mk).slice(5) }),
      el('div', { class: 'bar' }, [ el('i', { style: `width:${pctH}%;background:${barColor}` }) ]),
      el('div', { class: 'amt', text: (lim > 0 ? used.toFixed(0) + '/' + lim.toFixed(0) : used.toFixed(0)) })
    ]);
    historyList.appendChild(item);
  }
  historyCard.appendChild(historyList);

  // Tips
  const tipsCard = el('section', { class: 'card' }, [
    el('div', { class: 'card-title', text: '小贴士' }),
    el('p', { class: 'text-sm text-2', text: '• 月初设定预算上限，本月支出实时统计' }),
    el('p', { class: 'text-sm text-2 mt-8', text: '• 超支 80% 自动变色提醒，注意控制' }),
    el('p', { class: 'text-sm text-2 mt-8', text: '• 历史柱状图可对比近 6 个月执行情况' })
  ]);

  mount.append(topbar, hero);
  if (warningCard) mount.appendChild(warningCard);
  mount.append(historyCard, tipsCard);

  async function editBudget(mk, currentLimit) {
    const result = await promptDialog({
      title: '设置' + monthKeyToLabel(mk) + '预算',
      label: '月度预算上限（元）',
      defaultValue: currentLimit > 0 ? String(currentLimit) : '',
      placeholder: '例如 3000',
      inputType: 'number',
      okText: '保存'
    });
    if (result == null) return;
    const v = parseFloat(result);
    if (isNaN(v) || v < 0) {
      toast('请输入有效金额');
      return;
    }
    await setBudget(mk, v);
    toast('预算已保存');
    router.dispatch();
  }
}
