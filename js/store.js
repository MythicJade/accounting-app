// js/store.js — business data access layer
import { openDB, put, get, getAll, deleteRecord, clearStore, count, bulkPut, Stores } from './db.js';
import { ensureCategories } from './categories.js';
import { ensureAccounts } from './accounts.js';
import { monthKeyFromDateStr, currentMonthKey } from './format.js';

let _initialized = false;
export async function initStore() {
  if (_initialized) return;
  await openDB();
  await ensureCategories();
  await ensureAccounts();
  await migrateTransactionsAccountId();
  _initialized = true;
}

// v2 migration: backfill missing accountId on old transactions
async function migrateTransactionsAccountId() {
  const all = await getAll(Stores.TRANSACTIONS);
  const needFix = all.filter(t => !t.accountId);
  if (needFix.length === 0) return;
  for (const t of needFix) {
    t.accountId = 'cash'; // default account
    t.updatedAt = Date.now();
  }
  await bulkPut(Stores.TRANSACTIONS, needFix);
}

// ===== Transactions =====
export async function addTransaction(t) {
  const now = Date.now();
  const record = {
    type: t.type,
    amount: Number(t.amount),
    categoryId: t.categoryId || null,
    note: t.note || '',
    date: t.date,
    accountId: t.accountId || 'cash',
    toAccountId: t.toAccountId || null,
    createdAt: now,
    updatedAt: now
  };
  if (t.id != null) record.id = t.id;
  return put(Stores.TRANSACTIONS, record);
}

export async function updateTransaction(id, patch) {
  const existing = await get(Stores.TRANSACTIONS, id);
  if (!existing) throw new Error('记录不存在');
  Object.assign(existing, patch, { updatedAt: Date.now() });
  return put(Stores.TRANSACTIONS, existing);
}

export async function deleteTransaction(id) {
  return deleteRecord(Stores.TRANSACTIONS, id);
}

export async function getTransaction(id) {
  return get(Stores.TRANSACTIONS, id);
}

export async function listTransactions(opts = {}) {
  const all = await getAll(Stores.TRANSACTIONS);
  let result = all;
  if (opts.dateFrom) result = result.filter(t => t.date >= opts.dateFrom);
  if (opts.dateTo) result = result.filter(t => t.date <= opts.dateTo);
  if (opts.type) result = result.filter(t => t.type === opts.type);
  if (opts.categoryId) result = result.filter(t => t.categoryId === opts.categoryId);
  if (opts.accountId) {
    // For transfer records, also include records where toAccountId matches
    result = result.filter(t => t.accountId === opts.accountId || t.toAccountId === opts.accountId);
  }
  // sort: by date desc, then by createdAt desc
  result.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  if (opts.limit) result = result.slice(0, opts.limit);
  return result;
}

export async function getAllTransactions() {
  return getAll(Stores.TRANSACTIONS);
}

export async function bulkPutTransactions(records) {
  return bulkPut(Stores.TRANSACTIONS, records);
}

export async function countTransactions() {
  return count(Stores.TRANSACTIONS);
}

// ===== Budgets =====
export async function getBudget(monthKey) {
  return get(Stores.BUDGETS, monthKey);
}

export async function setBudget(monthKey, limit) {
  const existing = await get(Stores.BUDGETS, monthKey);
  return put(Stores.BUDGETS, {
    key: monthKey,
    limit: Number(limit),
    updatedAt: Date.now(),
    createdAt: existing ? existing.createdAt : Date.now()
  });
}

export async function listBudgets() {
  return getAll(Stores.BUDGETS);
}

// ===== Aggregations =====
export async function sumByType(dateFrom, dateTo, accountId) {
  const all = await listTransactions({ dateFrom, dateTo, accountId });
  let income = 0, expense = 0;
  for (const t of all) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
    // transfers excluded from income/expense totals
  }
  return { income, expense, balance: income - expense };
}

export async function monthlySummary(monthKey, accountId) {
  // monthKey: 'YYYY-MM'
  const start = monthKey + '-01';
  const [y, m] = monthKey.split('-').map(Number);
  const end = new Date(y, m, 0).toISOString().slice(0, 10); // last day
  return sumByType(start, end, accountId);
}

export async function categoryBreakdown(dateFrom, dateTo, type = 'expense', accountId) {
  const all = await listTransactions({ dateFrom, dateTo, type, accountId });
  const map = new Map();
  for (const t of all) {
    const cur = map.get(t.categoryId) || 0;
    map.set(t.categoryId, cur + t.amount);
  }
  return map; // Map<categoryId, sum>
}

export async function dailyTotals(dateFrom, dateTo, type = 'expense', accountId) {
  const all = await listTransactions({ dateFrom, dateTo, type, accountId });
  const map = new Map();
  for (const t of all) {
    const cur = map.get(t.date) || 0;
    map.set(t.date, cur + t.amount);
  }
  return map;
}

// ===== Transfers =====
// Transfer money between two accounts. Creates a single transfer record.
// type='transfer', accountId = source (money out), toAccountId = dest (money in).
export async function transferMoney({ fromId, toId, amount, note, date }) {
  if (!fromId || !toId) throw new Error('请选择源账户和目标账户');
  if (fromId === toId) throw new Error('源账户和目标账户不能相同');
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) throw new Error('金额必须大于 0');
  return addTransaction({
    type: 'transfer',
    amount: amt,
    accountId: fromId,
    toAccountId: toId,
    note: note || '',
    date: date
  });
}

// Compute balance for a single account: openingBalance + income + transfers in - expense - transfers out
export async function getAccountBalance(accountId) {
  const all = await getAll(Stores.TRANSACTIONS);
  const acc = await getAccountFromStore(accountId);
  let bal = acc && acc.openingBalance ? Number(acc.openingBalance) : 0;
  for (const t of all) {
    if (t.accountId === accountId) {
      if (t.type === 'income') bal += t.amount;
      else if (t.type === 'expense') bal -= t.amount;
      else if (t.type === 'transfer') bal -= t.amount; // out
    }
    if (t.toAccountId === accountId && t.type === 'transfer') {
      bal += t.amount; // in
    }
  }
  return bal;
}

// Helper: fetch a single account by id (avoids circular import with accounts.js)
async function getAccountFromStore(id) {
  const all = await getAll(Stores.ACCOUNTS);
  return all.find(a => a.id === id);
}

// Compute balances for all accounts at once (efficient single pass)
// Returns { balances: Map<accountId, balance>, totals: { opening: number, netChange: number } }
export async function getAllAccountBalances() {
  const all = await getAll(Stores.TRANSACTIONS);
  const accounts = await getAll(Stores.ACCOUNTS);
  const map = new Map(); // accountId -> balance
  let totalOpening = 0;
  for (const a of accounts) {
    const ob = a.openingBalance ? Number(a.openingBalance) : 0;
    map.set(a.id, ob);
    totalOpening += ob;
  }
  let netChange = 0;
  for (const t of all) {
    if (t.type === 'income' && t.accountId) {
      map.set(t.accountId, (map.get(t.accountId) || 0) + t.amount);
      netChange += t.amount;
    } else if (t.type === 'expense' && t.accountId) {
      map.set(t.accountId, (map.get(t.accountId) || 0) - t.amount);
      netChange -= t.amount;
    } else if (t.type === 'transfer') {
      if (t.accountId) map.set(t.accountId, (map.get(t.accountId) || 0) - t.amount);
      if (t.toAccountId) map.set(t.toAccountId, (map.get(t.toAccountId) || 0) + t.amount);
      // transfers cancel out in net worth, do not touch netChange
    }
  }
  // Stash totals on the Map for callers that need them
  map._totals = { opening: totalOpening, netChange };
  return map;
}

// Total net worth across all accounts (openingBalance + income - expense; transfers cancel out)
export async function getTotalBalance() {
  const all = await getAll(Stores.TRANSACTIONS);
  const accounts = await getAll(Stores.ACCOUNTS);
  let bal = 0;
  for (const a of accounts) {
    if (a.openingBalance) bal += Number(a.openingBalance);
  }
  for (const t of all) {
    if (t.type === 'income') bal += t.amount;
    else if (t.type === 'expense') bal -= t.amount;
  }
  return bal;
}

// 资产负债汇总：净资产 = 总资产 - 总负债；按账户 type 分组小计
// 净资产口径与 getTotalBalance 一致；总资产 = 余额为正的账户之和；总负债 = 余额为负的账户绝对值之和
export async function getAssetsSummary() {
  const balances = await getAllAccountBalances();
  const accounts = await getAll(Stores.ACCOUNTS);
  const accMap = new Map(accounts.map(a => [a.id, a]));
  let totalAssets = 0;
  let totalLiabilities = 0;
  const byType = { asset: 0, credit: 0 };
  for (const a of accounts) {
    const bal = balances.get(a.id) || 0;
    const type = a.type === 'credit' ? 'credit' : 'asset';
    byType[type] = (byType[type] || 0) + bal;
    if (bal >= 0) totalAssets += bal;
    else totalLiabilities += -bal;
  }
  return {
    netAssets: totalAssets - totalLiabilities,
    totalAssets,
    totalLiabilities,
    byType
  };
}

// 月度资产趋势：按月计算净资产/总资产/总负债（截至该月末）
// 口径：以所有账户 openingBalance 为起点，按交易日期累加 income/expense（transfer 互转不影响总额）
// 返回 [{ month, label, netAssets, totalAssets, totalLiabilities }]（全年 12 个月，未来月份为 null）
export async function monthlyAssetTrend(year) {
  const accounts = await getAll(Stores.ACCOUNTS);
  const allTx = await getAll(Stores.TRANSACTIONS);
  const yearPrefix = String(year) + '-';
  // 起始净资产 = 所有账户 openingBalance 之和
  let baseNet = 0;
  for (const a of accounts) {
    if (a.openingBalance) baseNet += Number(a.openingBalance);
  }
  // 该年交易按月分组，计算每月净收入（income - expense，transfer 不计入总额）
  const monthlyNetChange = new Array(12).fill(0);
  for (const t of allTx) {
    if (!t.date || !t.date.startsWith(yearPrefix)) continue;
    const m = parseInt(t.date.slice(5, 7), 10) - 1;
    if (m < 0 || m > 11) continue;
    if (t.type === 'income') monthlyNetChange[m] += t.amount;
    else if (t.type === 'expense') monthlyNetChange[m] -= t.amount;
  }
  // 累加得到每月末净资产
  const result = [];
  let cumNet = baseNet;
  const now = new Date();
  const isCurrentYear = now.getFullYear() === year;
  const currentMonth = now.getMonth(); // 0-11
  for (let i = 0; i < 12; i++) {
    cumNet += monthlyNetChange[i];
    const monthLabel = (i + 1) + '月';
    if (isCurrentYear && i > currentMonth) {
      // 未来月份：无数据
      result.push({ month: i + 1, label: monthLabel, netAssets: null, totalAssets: null, totalLiabilities: null });
    } else {
      // 该月末的资产/负债分布需要按账户逐个计算（信用账户余额为负算负债）
      // 简化：用月末净资产推算，但总资产/总负债需要各账户单独算
      result.push({ month: i + 1, label: monthLabel, netAssets: cumNet, totalAssets: null, totalLiabilities: null });
    }
  }
  // 精确计算每月末各账户余额，得到总资产/总负债
  // 按账户逐个累加该年截至每月末的交易
  for (const a of accounts) {
    const ob = a.openingBalance ? Number(a.openingBalance) : 0;
    let accBal = ob;
    // 该账户在该年的交易按月排序累加
    const accTx = allTx
      .filter(t => t.date && t.date.startsWith(yearPrefix) && (t.accountId === a.id || t.toAccountId === a.id))
      .sort((x, y) => x.date < y.date ? -1 : 1);
    let txIdx = 0;
    for (let i = 0; i < 12; i++) {
      const monthEnd = yearPrefix + String(i + 1).padStart(2, '0') + '-31';
      // 累加该月所有该账户交易
      while (txIdx < accTx.length && accTx[txIdx].date <= monthEnd) {
        const t = accTx[txIdx];
        if (t.accountId === a.id) {
          if (t.type === 'income') accBal += t.amount;
          else if (t.type === 'expense') accBal -= t.amount;
          else if (t.type === 'transfer') accBal -= t.amount;
        }
        if (t.toAccountId === a.id && t.type === 'transfer') accBal += t.amount;
        txIdx++;
      }
      const r = result[i];
      if (r.netAssets === null) continue; // 未来月份跳过
      if (r.totalAssets === null) r.totalAssets = 0;
      if (r.totalLiabilities === null) r.totalLiabilities = 0;
      if (accBal >= 0) r.totalAssets += accBal;
      else r.totalLiabilities += -accBal;
    }
  }
  return result;
}

// ===== Backup / Restore =====
export async function exportAll() {
  const [transactions, budgets, categories, accounts] = await Promise.all([
    getAll(Stores.TRANSACTIONS),
    getAll(Stores.BUDGETS),
    getAll(Stores.CATEGORIES),
    getAll(Stores.ACCOUNTS)
  ]);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    transactions,
    budgets,
    categories,
    accounts
  };
}

export async function importAll(data, mode = 'merge') {
  if (!data || typeof data !== 'object') throw new Error('数据格式错误');
  if (!Array.isArray(data.transactions)) throw new Error('缺少 transactions 字段');
  if (mode === 'replace') {
    await clearStore(Stores.TRANSACTIONS);
    await clearStore(Stores.BUDGETS);
    // keep categories if present in import, else keep existing
    if (data.categories && data.categories.length) {
      await clearStore(Stores.CATEGORIES);
    }
    if (data.accounts && data.accounts.length) {
      await clearStore(Stores.ACCOUNTS);
    }
  }
  // Use put for upsert by key path; transactions without id will autoincrement
  // For transactions, we use bulkPut preserving IDs
  if (data.transactions.length) {
    await bulkPut(Stores.TRANSACTIONS, data.transactions);
  }
  if (data.budgets && data.budgets.length) {
    await bulkPut(Stores.BUDGETS, data.budgets);
  }
  if (data.categories && data.categories.length) {
    await bulkPut(Stores.CATEGORIES, data.categories);
  }
  if (data.accounts && data.accounts.length) {
    await bulkPut(Stores.ACCOUNTS, data.accounts);
  }
}

export async function clearAllData() {
  await clearStore(Stores.TRANSACTIONS);
  await clearStore(Stores.BUDGETS);
  // 清空所有分类与账户（新模型下默认为空，用户重新创建）
  await clearStore(Stores.CATEGORIES);
  await clearStore(Stores.ACCOUNTS);
}
