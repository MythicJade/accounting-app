import { getTransaction } from '../store.js';
import { listAccounts } from '../accounts.js';
import { listCategories } from '../categories.js';
import { formatMoney } from '../format.js';
import { todayDateOnly } from '../date-only.js';
import { el } from '../ui.js';
import { categoryIconNode } from '../category-icons.js';
import { contextualRoute, safeReturnRoute } from '../navigation.js';

export async function renderTransactionDetail(mount, { id, query }) {
  const back = safeReturnRoute(query?.get('return'));
  const [transaction, accounts, categories] = await Promise.all([
    getTransaction(id), listAccounts({ includeArchived: true }), listCategories(null, { includeArchived: true })
  ]);
  const topbar = el('div', { class: 'topbar' }, [
    el('a', { class: 'back', href: back, 'aria-label': '返回流水', text: '‹' }),
    el('h1', { text: '账单详情' })
  ]);
  mount.append(topbar);
  if (!transaction) { mount.append(el('p', { class: 'empty', text: '这条账单已不存在' })); return; }
  const account = accounts.find(item => item.id === transaction.accountId);
  const target = accounts.find(item => item.id === transaction.toAccountId);
  const category = categories.find(item => item.id === transaction.categoryId);
  const typeName = { expense: '支出', income: '收入', transfer: '转账' }[transaction.type];
  const rows = [['类型', typeName], ['日期', transaction.date], ['账户', account?.name || '未知账户']];
  if (transaction.type === 'transfer') rows.push(['转入账户', target?.name || '未知账户']);
  else rows.push(['分类', category?.name || '未分类']);
  rows.push(['备注', transaction.note || '无']);
  mount.append(el('section', { class: 'card transaction-detail-card' }, [
    categoryIconNode(category || { name: '转账', icon: '💰' }, { size: 32 }),
    el('h2', { text: category?.name || typeName }),
    el('div', { class: 'detail-amount amount ' + transaction.type, text: formatMoney(transaction.amount) }),
    transaction.date > todayDateOnly() ? el('span', { class: 'future-date', text: '未来日期' }) : null,
    ...rows.map(([label, value]) => el('div', { class: 'detail-field' }, [
      el('span', { class: 'text-2', text: label }), el('span', { text: value })
    ])),
    el('a', { class: 'btn', href: contextualRoute('#/edit/' + id, back), text: '编辑账单' })
  ]));
}
