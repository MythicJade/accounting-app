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
  // Exclude transfers from default listings unless explicitly requested
  if (!opts.includeTransfers) {
    // keep transfers in listTransactions only when caller asks; but for stats we filter separately
  }
  // sort: by date desc, then by createdAt desc
  result.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  if (opts.limit) result = result.slice(0, opts.limit);
  return result;
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

// Compute balance for a single account: income + transfers in - expense - transfers out
export async function getAccountBalance(accountId) {
  const all = await getAll(Stores.TRANSACTIONS);
  let bal = 0;
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

// Compute balances for all accounts at once (efficient single pass)
export async function getAllAccountBalances() {
  const all = await getAll(Stores.TRANSACTIONS);
  const map = new Map(); // accountId -> balance
  for (const t of all) {
    if (t.type === 'income' && t.accountId) {
      map.set(t.accountId, (map.get(t.accountId) || 0) + t.amount);
    } else if (t.type === 'expense' && t.accountId) {
      map.set(t.accountId, (map.get(t.accountId) || 0) - t.amount);
    } else if (t.type === 'transfer') {
      if (t.accountId) map.set(t.accountId, (map.get(t.accountId) || 0) - t.amount);
      if (t.toAccountId) map.set(t.toAccountId, (map.get(t.toAccountId) || 0) + t.amount);
    }
  }
  return map;
}

// Total net worth across all accounts (income - expense; transfers cancel out)
export async function getTotalBalance() {
  const all = await getAll(Stores.TRANSACTIONS);
  let bal = 0;
  for (const t of all) {
    if (t.type === 'income') bal += t.amount;
    else if (t.type === 'expense') bal -= t.amount;
  }
  return bal;
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
  // Keep categories (builtin) but clear user categories too? Plan says "清空所有数据"
  await clearStore(Stores.CATEGORIES);
  await ensureCategories();
  await clearStore(Stores.ACCOUNTS);
  await ensureAccounts();
}
