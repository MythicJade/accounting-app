// js/store.js — validated business data access layer (schema v5 / backup v3).
import { openDB, put, get, getAll, getAllByIndex, deleteRecord, count, atomicWrite, Stores } from './db.js';
import { ensureCategories, addCategory, STARTER_CATEGORIES } from './categories.js';
import { ensureAccounts, addAccount } from './accounts.js';
import { toCents, fromCents, assertCents } from './money.js';
import { assertDateOnly, monthRange, timestampToDateOnly, todayDateOnly, timestampForDateAndTime } from './date-only.js';

const TRANSACTION_TYPES = new Set(['expense', 'income', 'transfer']);
let initialized = false;

export async function initStore() {
  if (initialized) return;
  await openDB();
  await Promise.all([ensureCategories(), ensureAccounts()]);
  initialized = true;
}

// ===== Transactions =====
export async function addTransaction(input) {
  const record = await validateTransactionInput(input);
  return put(Stores.TRANSACTIONS, record);
}

export async function updateTransaction(id, patch) {
  const existing = await get(Stores.TRANSACTIONS, Number(id));
  if (!existing) throw new Error('记录不存在');
  const merged = {
    ...hydrateTransaction(existing),
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now()
  };
  if (merged.type === 'transfer') merged.categoryId = null;
  else merged.toAccountId = null;
  const record = await validateTransactionInput(merged, {
    preserveId: true,
    allowArchivedIds: new Set([existing.accountId, existing.toAccountId, existing.categoryId].filter(Boolean))
  });
  record.createdAt = existing.createdAt || Date.now();
  record.updatedAt = Date.now();
  return put(Stores.TRANSACTIONS, record);
}

export function deleteTransaction(id) {
  return deleteRecord(Stores.TRANSACTIONS, Number(id));
}

export async function getTransaction(id) {
  const record = await get(Stores.TRANSACTIONS, Number(id));
  return record ? hydrateTransaction(record) : undefined;
}

export async function listTransactions(options = {}) {
  let raw;
  if ((options.dateFrom || options.dateTo) && globalThis.IDBKeyRange) {
    const lower = options.dateFrom || '0000-01-01';
    const upper = options.dateTo || '9999-12-31';
    raw = await getAllByIndex(Stores.TRANSACTIONS, 'date', globalThis.IDBKeyRange.bound(lower, upper));
  } else {
    raw = await getAll(Stores.TRANSACTIONS);
  }
  let result = raw.map(hydrateTransaction);
  if (options.dateFrom) result = result.filter(transaction => transaction.date >= options.dateFrom);
  if (options.dateTo) result = result.filter(transaction => transaction.date <= options.dateTo);
  if (options.type) result = result.filter(transaction => transaction.type === options.type);
  if (options.categoryId) result = result.filter(transaction => transaction.categoryId === options.categoryId);
  if (options.accountId) {
    result = result.filter(transaction => transaction.accountId === options.accountId || transaction.toAccountId === options.accountId);
  }
  if (options.search) {
    const needle = String(options.search).trim().toLocaleLowerCase('zh-CN');
    const [accounts, categories] = await Promise.all([getAll(Stores.ACCOUNTS), getAll(Stores.CATEGORIES)]);
    const accountNames = new Map(accounts.map(account => [account.id, account.name]));
    const categoryNames = new Map(categories.map(category => [category.id, category.name]));
    result = result.filter(transaction => [
      transaction.note,
      accountNames.get(transaction.accountId),
      accountNames.get(transaction.toAccountId),
      categoryNames.get(transaction.categoryId),
      transaction.date
    ].some(value => String(value || '').toLocaleLowerCase('zh-CN').includes(needle)));
  }
  result.sort(compareTransactionsDesc);
  const total = result.length;
  const offset = Math.max(0, Number(options.offset || 0));
  if (offset) result = result.slice(offset);
  if (options.limit) result = result.slice(0, Number(options.limit));
  return options.returnPage ? { items: result, total } : result;
}

export async function getAllTransactions() {
  return (await getAll(Stores.TRANSACTIONS)).map(hydrateTransaction).sort(compareTransactionsDesc);
}

export async function bulkPutTransactions(records) {
  const prepared = [];
  for (const record of records) prepared.push(await validateTransactionInput(record, { preserveId: record.id != null }));
  return atomicWrite([Stores.TRANSACTIONS], stores => prepared.forEach(record => stores[Stores.TRANSACTIONS].put(record)));
}

export function countTransactions() {
  return count(Stores.TRANSACTIONS);
}

async function validateTransactionInput(input, { preserveId = false, allowArchivedIds = new Set() } = {}) {
  const type = String(input.type || '');
  if (!TRANSACTION_TYPES.has(type)) throw new Error('记账类型无效');
  const amountCents = input.amountCents != null
    ? assertCents(input.amountCents, { positive: true })
    : toCents(input.amount, { allowNegative: false });
  if (amountCents <= 0) throw new Error('金额必须大于 0');
  const date = assertDateOnly(input.date);
  const accountId = input.accountId || null;
  const toAccountId = type === 'transfer' ? (input.toAccountId || null) : null;
  const categoryId = type === 'transfer' ? null : (input.categoryId || null);
  if (!accountId) throw new Error('请选择账户');
  const account = await get(Stores.ACCOUNTS, accountId);
  if (!account || (account.archived && !allowArchivedIds.has(accountId))) throw new Error('账户不存在或已归档');
  await alignZeroBalanceOpeningDate(account, date, '账户');
  if (type === 'transfer') {
    if (!toAccountId || toAccountId === accountId) throw new Error('请选择不同的目标账户');
    const target = await get(Stores.ACCOUNTS, toAccountId);
    if (!target || (target.archived && !allowArchivedIds.has(toAccountId))) throw new Error('目标账户不存在或已归档');
    await alignZeroBalanceOpeningDate(target, date, '目标账户');
  } else {
    if (!categoryId) throw new Error('请选择分类');
    const category = await get(Stores.CATEGORIES, categoryId);
    if (!category || (category.archived && !allowArchivedIds.has(categoryId)) || category.type !== type) throw new Error('分类不存在、已归档或类型不匹配');
  }
  const now = Date.now();
  const result = {
    type,
    amountCents,
    categoryId,
    note: String(input.note || '').trim().slice(0, 200),
    date,
    accountId,
    toAccountId,
    createdAt: Number(input.createdAt) || now,
    updatedAt: Number(input.updatedAt) || now
  };
  if (preserveId && input.id != null) result.id = Number(input.id);
  if (input.sourceFingerprint) result.sourceFingerprint = String(input.sourceFingerprint);
  return result;
}

async function alignZeroBalanceOpeningDate(account, date, label) {
  if (!account.openingDate || date >= account.openingDate) return;
  if (Number(account.openingBalanceCents || 0) !== 0) {
    throw new Error(`流水日期早于${label}期初日期 ${account.openingDate}，请先调整期初日期`);
  }
  account.openingDate = date;
  account.updatedAt = Date.now();
  await put(Stores.ACCOUNTS, account);
}

export function hydrateTransaction(record) {
  const amountCents = Number.isSafeInteger(record.amountCents) ? record.amountCents : toCents(record.amount || 0);
  return { ...record, amountCents, amount: fromCents(amountCents) };
}

// ===== Budgets =====
export async function getBudget(monthKey) {
  const record = await get(Stores.BUDGETS, monthKey);
  return record ? { ...record, limit: fromCents(record.limitCents || 0) } : undefined;
}

export async function setBudget(monthKey, limit) {
  monthRange(monthKey);
  const existing = await get(Stores.BUDGETS, monthKey);
  return put(Stores.BUDGETS, {
    key: monthKey,
    limitCents: toCents(limit, { allowNegative: false }),
    updatedAt: Date.now(),
    createdAt: existing?.createdAt || Date.now()
  });
}

export async function listBudgets() {
  return (await getAll(Stores.BUDGETS)).map(record => ({ ...record, limit: fromCents(record.limitCents || 0) }));
}

// ===== Aggregations =====
export async function sumByType(dateFrom, dateTo, accountId) {
  const transactions = await listTransactions({ dateFrom, dateTo, accountId });
  let incomeCents = 0;
  let expenseCents = 0;
  for (const transaction of transactions) {
    if (transaction.type === 'income') incomeCents += transaction.amountCents;
    else if (transaction.type === 'expense') expenseCents += transaction.amountCents;
  }
  return {
    income: fromCents(incomeCents),
    expense: fromCents(expenseCents),
    balance: fromCents(incomeCents - expenseCents)
  };
}

export async function monthlySummary(monthKey, accountId) {
  const range = monthRange(monthKey);
  return sumByType(range.start, range.end, accountId);
}

export async function categoryBreakdown(dateFrom, dateTo, type = 'expense', accountId) {
  const transactions = await listTransactions({ dateFrom, dateTo, type, accountId });
  const cents = new Map();
  for (const transaction of transactions) cents.set(transaction.categoryId, (cents.get(transaction.categoryId) || 0) + transaction.amountCents);
  return new Map(Array.from(cents, ([key, value]) => [key, fromCents(value)]));
}

export async function dailyTotals(dateFrom, dateTo, type = 'expense', accountId) {
  const transactions = await listTransactions({ dateFrom, dateTo, type, accountId });
  const cents = new Map();
  for (const transaction of transactions) cents.set(transaction.date, (cents.get(transaction.date) || 0) + transaction.amountCents);
  return new Map(Array.from(cents, ([key, value]) => [key, fromCents(value)]));
}

export async function transferMoney({ fromId, toId, amount, note, date }) {
  return addTransaction({ type: 'transfer', amount, accountId: fromId, toAccountId: toId, note, date });
}

export async function getAccountBalance(accountId, cutoff = '9999-12-31') {
  const account = await get(Stores.ACCOUNTS, accountId);
  if (!account) return 0;
  let balanceCents = account.openingDate <= cutoff ? Number(account.openingBalanceCents || 0) : 0;
  const transactions = await getAll(Stores.TRANSACTIONS);
  for (const transaction of transactions) {
    if (transaction.date > cutoff || transaction.date < account.openingDate) continue;
    balanceCents += transactionDeltaCents(transaction, accountId);
  }
  return fromCents(balanceCents);
}

export async function getAllAccountBalances(cutoff = '9999-12-31') {
  const [transactions, accounts] = await Promise.all([getAll(Stores.TRANSACTIONS), getAll(Stores.ACCOUNTS)]);
  const cents = new Map();
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  for (const account of accounts) {
    const opening = account.openingDate <= cutoff ? Number(account.openingBalanceCents || 0) : 0;
    cents.set(account.id, opening);
  }
  for (const transaction of transactions) {
    if (transaction.date > cutoff) continue;
    const amount = transaction.amountCents || 0;
    const source = accountsById.get(transaction.accountId);
    if (source && transaction.date >= source.openingDate) {
      cents.set(transaction.accountId, (cents.get(transaction.accountId) || 0) + transactionDeltaCents(transaction, transaction.accountId));
    }
    const target = accountsById.get(transaction.toAccountId);
    if (transaction.type === 'transfer' && target && transaction.date >= target.openingDate) {
      cents.set(transaction.toAccountId, (cents.get(transaction.toAccountId) || 0) + amount);
    }
  }
  return new Map(Array.from(cents, ([key, value]) => [key, fromCents(value)]));
}

export async function getTotalBalance(cutoff = '9999-12-31') {
  const balances = await getAllAccountBalances(cutoff);
  let cents = 0;
  for (const value of balances.values()) cents += toCents(value);
  return fromCents(cents);
}

export async function getAssetsSummary(cutoff = '9999-12-31') {
  const [balances, accounts] = await Promise.all([getAllAccountBalances(cutoff), getAll(Stores.ACCOUNTS)]);
  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  const byTypeCents = { asset: 0, credit: 0 };
  for (const account of accounts) {
    const balanceCents = toCents(balances.get(account.id) || 0);
    const type = account.type === 'credit' ? 'credit' : 'asset';
    byTypeCents[type] += balanceCents;
    if (balanceCents >= 0) totalAssetsCents += balanceCents;
    else totalLiabilitiesCents += -balanceCents;
  }
  return {
    netAssets: fromCents(totalAssetsCents - totalLiabilitiesCents),
    totalAssets: fromCents(totalAssetsCents),
    totalLiabilities: fromCents(totalLiabilitiesCents),
    byType: { asset: fromCents(byTypeCents.asset), credit: fromCents(byTypeCents.credit) }
  };
}

export async function monthlyAssetTrend(year) {
  const numericYear = Number(year);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const result = [];
  for (let month = 1; month <= 12; month++) {
    const future = numericYear > currentYear || (numericYear === currentYear && month > currentMonth);
    const label = `${month}月`;
    if (future) {
      result.push({ month, label, netAssets: null, totalAssets: null, totalLiabilities: null });
      continue;
    }
    const key = `${numericYear}-${String(month).padStart(2, '0')}`;
    const summary = await getAssetsSummary(monthRange(key).end);
    result.push({ month, label, ...summary });
  }
  return result;
}

export async function monthlyAccountTrend(accountId, year) {
  const numericYear = Number(year);
  const now = new Date();
  const result = [];
  for (let month = 1; month <= 12; month++) {
    const future = numericYear > now.getFullYear() || (numericYear === now.getFullYear() && month > now.getMonth() + 1);
    const key = `${numericYear}-${String(month).padStart(2, '0')}`;
    result.push({
      label: `${month}月`,
      fullLabel: `${numericYear}年${month}月`,
      value: future ? null : await getAccountBalance(accountId, monthRange(key).end)
    });
  }
  return result;
}

function transactionDeltaCents(transaction, accountId) {
  const amount = Number(transaction.amountCents || 0);
  if (transaction.accountId === accountId) {
    if (transaction.type === 'income') return amount;
    if (transaction.type === 'expense' || transaction.type === 'transfer') return -amount;
  }
  if (transaction.type === 'transfer' && transaction.toAccountId === accountId) return amount;
  return 0;
}

// ===== Starter data =====
export async function setupStarterData() {
  const [accounts, categories] = await Promise.all([getAll(Stores.ACCOUNTS), getAll(Stores.CATEGORIES)]);
  let accountsCreated = 0;
  let categoriesCreated = 0;
  if (!accounts.some(account => !account.archived)) {
    const archivedAccount = accounts.find(account => account.archived);
    if (archivedAccount) {
      await put(Stores.ACCOUNTS, { ...archivedAccount, archived: false, updatedAt: Date.now() });
    } else {
      await addAccount({ name: '现金', icon: '💵', color: '#34C759', openingBalance: 0, openingDate: todayDateOnly() });
      await addAccount({ name: '银行卡', icon: '💳', color: '#007AFF', openingBalance: 0, openingDate: todayDateOnly() });
      accountsCreated = 2;
    }
  }
  for (const starter of STARTER_CATEGORIES) {
    if (categories.some(category => !category.archived && category.type === starter.type && category.name === starter.name)) continue;
    const archived = categories.find(category => category.archived && category.type === starter.type && category.name === starter.name);
    if (archived) {
      await put(Stores.CATEGORIES, { ...archived, archived: false, updatedAt: Date.now() });
    } else {
      await addCategory(starter);
      categoriesCreated += 1;
    }
  }
  return { accountsCreated, categoriesCreated };
}

// ===== Backup / Restore =====
export async function exportAll() {
  const [transactions, budgets, categories, accounts] = await Promise.all([
    getAll(Stores.TRANSACTIONS),
    getAll(Stores.BUDGETS),
    getAll(Stores.CATEGORIES),
    getAll(Stores.ACCOUNTS)
  ]);
  return { version: 3, schemaVersion: 5, exportedAt: new Date().toISOString(), transactions, budgets, categories, accounts };
}

export async function previewBackupImport(data, mode = 'merge') {
  const normalized = normalizeBackup(data);
  const existing = await getAll(Stores.TRANSACTIONS);
  const existingFingerprints = new Set(existing.map(transactionFingerprint));
  const duplicateCount = normalized.transactions.filter(transaction => existingFingerprints.has(transactionFingerprint(transaction))).length;
  return {
    mode,
    transactions: normalized.transactions.length,
    accounts: normalized.accounts.length,
    categories: normalized.categories.length,
    budgets: normalized.budgets.length,
    duplicateCount,
    version: normalized.version
  };
}

export async function importAll(data, mode = 'merge') {
  const normalized = normalizeBackup(data);
  if (!['merge', 'replace'].includes(mode)) throw new Error('导入模式无效');
  const [existingTransactions, existingAccounts, existingCategories, existingBudgets] = await Promise.all([
    getAll(Stores.TRANSACTIONS), getAll(Stores.ACCOUNTS), getAll(Stores.CATEGORIES), getAll(Stores.BUDGETS)
  ]);

  const accountPlan = buildEntityPlan(normalized.accounts, mode === 'merge' ? existingAccounts : [], accountSemanticKey, 'acc');
  const categoryPlan = buildEntityPlan(normalized.categories, mode === 'merge' ? existingCategories : [], categorySemanticKey, 'cat');
  const validAccountIds = new Set([
    ...(mode === 'merge' ? existingAccounts.map(account => account.id) : []),
    ...accountPlan.toWrite.map(account => account.id),
    ...accountPlan.idMap.values()
  ]);
  const validAccounts = new Map([
    ...(mode === 'merge' ? existingAccounts : []),
    ...accountPlan.toWrite
  ].map(account => [account.id, account]));
  const validCategoryIds = new Set([
    ...(mode === 'merge' ? existingCategories.map(category => category.id) : []),
    ...categoryPlan.toWrite.map(category => category.id),
    ...categoryPlan.idMap.values()
  ]);
  const validCategories = new Map([
    ...(mode === 'merge' ? existingCategories : []),
    ...categoryPlan.toWrite
  ].map(category => [category.id, category]));
  const transactions = [];
  const seen = new Set((mode === 'merge' ? existingTransactions : []).map(transactionFingerprint));
  let skippedDuplicates = 0;
  for (const source of normalized.transactions) {
    const transaction = {
      ...source,
      accountId: accountPlan.idMap.get(source.accountId) || source.accountId || null,
      toAccountId: accountPlan.idMap.get(source.toAccountId) || source.toAccountId || null,
      categoryId: categoryPlan.idMap.get(source.categoryId) || source.categoryId || null
    };
    if (!transaction.accountId || !validAccountIds.has(transaction.accountId)) throw new Error('备份中存在找不到来源账户的流水');
    if (transaction.date < validAccounts.get(transaction.accountId).openingDate) throw new Error('备份中存在早于账户期初日期的流水');
    if (transaction.type === 'transfer') {
      if (!transaction.toAccountId || transaction.toAccountId === transaction.accountId || !validAccountIds.has(transaction.toAccountId)) {
        throw new Error('备份中存在目标账户无效的转账');
      }
      if (transaction.date < validAccounts.get(transaction.toAccountId).openingDate) throw new Error('备份中存在早于目标账户期初日期的转账');
    } else if (!transaction.categoryId || !validCategoryIds.has(transaction.categoryId)) {
      throw new Error('备份中存在找不到分类的流水');
    } else if (validCategories.get(transaction.categoryId)?.type !== transaction.type) {
      throw new Error('备份中存在分类类型与流水类型不一致的记录');
    }
    delete transaction.id;
    const fingerprint = transactionFingerprint(transaction);
    if (seen.has(fingerprint)) {
      skippedDuplicates++;
      continue;
    }
    transaction.sourceFingerprint = fingerprint;
    seen.add(fingerprint);
    transactions.push(transaction);
  }

  const budgets = mergeBudgets(normalized.budgets, mode === 'merge' ? existingBudgets : []);
  const storeNames = [Stores.TRANSACTIONS, Stores.BUDGETS, Stores.CATEGORIES, Stores.ACCOUNTS];
  await atomicWrite(storeNames, stores => {
    if (mode === 'replace') storeNames.forEach(name => stores[name].clear());
    accountPlan.toWrite.forEach(record => stores[Stores.ACCOUNTS].put(record));
    categoryPlan.toWrite.forEach(record => stores[Stores.CATEGORIES].put(record));
    budgets.forEach(record => stores[Stores.BUDGETS].put(record));
    transactions.forEach(record => stores[Stores.TRANSACTIONS].put(record));
  });
  return {
    imported: transactions.length,
    skippedDuplicates,
    accountsAdded: accountPlan.added,
    categoriesAdded: categoryPlan.added,
    budgetsImported: budgets.length
  };
}

export async function importExternalRows(rows, { openingBalances = new Map() } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('没有有效的数据行可导入');
  const [existingTransactions, existingAccounts, existingCategories] = await Promise.all([
    getAll(Stores.TRANSACTIONS), getAll(Stores.ACCOUNTS), getAll(Stores.CATEGORIES)
  ]);
  const accountsByName = new Map(existingAccounts.map(account => [normalizeKey(account.name), account]));
  const categoriesByName = new Map(existingCategories.map(category => [`${category.type}|${normalizeKey(category.name)}`, category]));
  const accountsToWrite = [];
  const categoriesToWrite = [];
  let newAccounts = 0;
  let newCategories = 0;

  const ensureAccount = (name) => {
    if (!name) return null;
    const key = normalizeKey(name);
    if (accountsByName.has(key)) return accountsByName.get(key);
    const record = {
      id: createId('acc'), name: String(name).trim(), icon: '💳', color: pickColor(accountsByName.size), type: 'asset',
      sort: accountsByName.size + 1, builtin: false, archived: false,
      openingBalanceCents: openingBalances.has(name) ? toCents(openingBalances.get(name)) : 0,
      openingDate: rows.reduce((min, row) => !min || row.date < min ? row.date : min, todayDateOnly()),
      createdAt: Date.now(), updatedAt: Date.now()
    };
    accountsByName.set(key, record);
    accountsToWrite.push(record);
    newAccounts++;
    return record;
  };
  const ensureCategory = (name, type) => {
    if (!name || type === 'transfer') return null;
    const key = `${type}|${normalizeKey(name)}`;
    if (categoriesByName.has(key)) return categoriesByName.get(key);
    const record = {
      id: createId('cat'), name: String(name).trim(), type, icon: type === 'income' ? '💼' : '💰',
      color: pickColor(categoriesByName.size), sort: categoriesByName.size + 1, builtin: false, archived: false,
      createdAt: Date.now(), updatedAt: Date.now()
    };
    categoriesByName.set(key, record);
    categoriesToWrite.push(record);
    newCategories++;
    return record;
  };
  const alignOpeningDate = (account, date) => {
    if (!account.openingDate || date >= account.openingDate) return account;
    const updated = { ...account, openingDate: date, updatedAt: Date.now() };
    accountsByName.set(normalizeKey(account.name), updated);
    accountsToWrite.push(updated);
    return updated;
  };

  for (const [name, value] of openingBalances) {
    const account = accountsByName.get(normalizeKey(name));
    if (account) {
      const updated = { ...account, openingBalanceCents: toCents(value), updatedAt: Date.now() };
      accountsByName.set(normalizeKey(name), updated);
      accountsToWrite.push(updated);
    }
  }

  const seen = new Set(existingTransactions.map(transactionFingerprint));
  const transactions = [];
  let skipped = 0;
  for (const row of rows) {
    try {
      const type = TRANSACTION_TYPES.has(row.type) ? row.type : 'expense';
      let account = ensureAccount(row.rawFrom || (type === 'income' ? row.rawTo : '')) || existingAccounts[0];
      let target = type === 'transfer' ? ensureAccount(row.rawTo) : null;
      if (account) account = alignOpeningDate(account, row.date);
      if (target) target = alignOpeningDate(target, row.date);
      const category = ensureCategory(row.rawCat, type);
      if (!account || (type === 'transfer' && (!target || target.id === account.id)) || (type !== 'transfer' && !category)) throw new Error('账户或分类缺失');
      const record = {
        type,
        amountCents: row.amountCents != null ? assertCents(row.amountCents, { positive: true }) : toCents(row.amount, { allowNegative: false }),
        categoryId: category?.id || null,
        accountId: account.id,
        toAccountId: target?.id || null,
        note: String(row.note || '').trim().slice(0, 200),
        date: assertDateOnly(row.date),
        createdAt: timestampForDateAndTime(row.date, row.time || '12:00'),
        updatedAt: Date.now()
      };
      const fingerprint = transactionFingerprint(record);
      if (seen.has(fingerprint)) { skipped++; continue; }
      record.sourceFingerprint = fingerprint;
      seen.add(fingerprint);
      transactions.push(record);
    } catch {
      skipped++;
    }
  }
  if (transactions.length === 0) throw new Error('没有可导入的新流水；可能全部重复或格式无效');
  await atomicWrite([Stores.TRANSACTIONS, Stores.CATEGORIES, Stores.ACCOUNTS], stores => {
    accountsToWrite.forEach(record => stores[Stores.ACCOUNTS].put(record));
    categoriesToWrite.forEach(record => stores[Stores.CATEGORIES].put(record));
    transactions.forEach(record => stores[Stores.TRANSACTIONS].put(record));
  });
  return { imported: transactions.length, skipped, newAccounts, newCategories };
}

export async function clearAllData() {
  const names = [Stores.TRANSACTIONS, Stores.BUDGETS, Stores.CATEGORIES, Stores.ACCOUNTS];
  return atomicWrite(names, stores => names.forEach(name => stores[name].clear()));
}

export function transactionFingerprint(transaction) {
  return [
    transaction.type,
    transaction.date,
    Number(transaction.amountCents || 0),
    transaction.accountId || '',
    transaction.toAccountId || '',
    transaction.categoryId || '',
    String(transaction.note || '').trim()
  ].join('|');
}

function normalizeBackup(data) {
  if (!data || typeof data !== 'object') throw new Error('备份格式错误');
  if (!Array.isArray(data.transactions)) throw new Error('备份缺少 transactions 数组');
  const version = Number(data.version || 1);
  const accounts = (Array.isArray(data.accounts) ? data.accounts : []).map((account, index) => ({
    id: String(account.id || createId('acc')),
    name: String(account.name || `账户${index + 1}`).trim().slice(0, 20),
    icon: String(account.icon || '💰').slice(0, 8),
    color: safeColor(account.color),
    type: account.type === 'credit' ? 'credit' : 'asset',
    sort: Number(account.sort || index + 1),
    builtin: false,
    archived: Boolean(account.archived),
    openingBalanceCents: Number.isSafeInteger(account.openingBalanceCents) ? account.openingBalanceCents : toCents(account.openingBalance || 0),
    openingDate: safeDate(account.openingDate, null),
    createdAt: Number(account.createdAt) || Date.now(),
    updatedAt: Number(account.updatedAt) || Date.now()
  }));
  const categories = (Array.isArray(data.categories) ? data.categories : []).map((category, index) => ({
    id: String(category.id || createId('cat')),
    name: String(category.name || `分类${index + 1}`).trim().slice(0, 20),
    type: category.type === 'income' ? 'income' : 'expense',
    icon: String(category.icon || '💰').slice(0, 8),
    color: safeColor(category.color),
    sort: Number(category.sort || index + 1),
    builtin: false,
    archived: Boolean(category.archived),
    createdAt: Number(category.createdAt) || Date.now(),
    updatedAt: Number(category.updatedAt) || Date.now()
  }));
  const transactions = data.transactions.map((transaction, index) => {
    const type = String(transaction.type || '');
    if (!TRANSACTION_TYPES.has(type)) throw new Error(`第 ${index + 1} 条流水类型无效`);
    const amountCents = Number.isSafeInteger(transaction.amountCents) ? transaction.amountCents : toCents(transaction.amount, { allowNegative: false });
    assertCents(amountCents, { positive: true });
    return {
      id: transaction.id,
      type,
      amountCents,
      categoryId: type === 'transfer' ? null : (transaction.categoryId || null),
      accountId: transaction.accountId || null,
      toAccountId: type === 'transfer' ? (transaction.toAccountId || null) : null,
      note: String(transaction.note || '').trim().slice(0, 200),
      date: assertDateOnly(transaction.date),
      createdAt: Number(transaction.createdAt) || Date.now(),
      updatedAt: Number(transaction.updatedAt) || Date.now()
    };
  });
  const earliestByAccount = new Map();
  for (const transaction of transactions) {
    for (const accountId of [transaction.accountId, transaction.toAccountId]) {
      if (!accountId) continue;
      const current = earliestByAccount.get(accountId);
      if (!current || transaction.date < current) earliestByAccount.set(accountId, transaction.date);
    }
  }
  for (const account of accounts) {
    if (!account.openingDate) account.openingDate = earliestByAccount.get(account.id) || timestampToDateOnly(account.createdAt, todayDateOnly());
  }
  const budgets = (Array.isArray(data.budgets) ? data.budgets : []).map(budget => ({
    key: monthRange(String(budget.key)).start.slice(0, 7),
    limitCents: Number.isSafeInteger(budget.limitCents) ? budget.limitCents : toCents(budget.limit || 0, { allowNegative: false }),
    createdAt: Number(budget.createdAt) || Date.now(),
    updatedAt: Number(budget.updatedAt) || Date.now()
  }));
  return { version, accounts, categories, transactions, budgets };
}

function buildEntityPlan(imported, existing, semanticKey, prefix) {
  const bySemantic = new Map(existing.map(record => [semanticKey(record), record]));
  const usedIds = new Set(existing.map(record => record.id));
  const idMap = new Map();
  const toWrite = [];
  let added = 0;
  for (const source of imported) {
    const key = semanticKey(source);
    const match = bySemantic.get(key);
    if (match) {
      idMap.set(source.id, match.id);
      continue;
    }
    const id = source.id && !usedIds.has(source.id) ? source.id : createId(prefix);
    const record = { ...source, id };
    usedIds.add(id);
    bySemantic.set(key, record);
    idMap.set(source.id, id);
    toWrite.push(record);
    added++;
  }
  return { idMap, toWrite, added };
}

function mergeBudgets(imported, existing) {
  const map = new Map(existing.map(budget => [budget.key, budget]));
  for (const budget of imported) {
    const current = map.get(budget.key);
    if (!current || Number(budget.updatedAt || 0) >= Number(current.updatedAt || 0)) map.set(budget.key, budget);
  }
  return Array.from(map.values());
}

function compareTransactionsDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

function accountSemanticKey(account) { return normalizeKey(account.name); }
function categorySemanticKey(category) { return `${category.type}|${normalizeKey(category.name)}`; }
function normalizeKey(value) { return String(value || '').trim().toLocaleLowerCase('zh-CN'); }
function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#007AFF'; }
function safeDate(value, fallback) { try { return assertDateOnly(value); } catch { return fallback; } }
function pickColor(index) { return ['#007AFF','#34C759','#5856D6','#FF9500','#FF3B30','#FF2D55','#AF52DE','#5AC8FA','#FFCC00','#00C7BE'][index % 10]; }
function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
