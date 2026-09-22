// js/store.js — validated business data access layer (schema v6 / backup v4).
import { openDB, put, get, getAll, getAllByIndex, getRecentTransactions, readSnapshot, deleteRecord, count, atomicWrite, Stores } from './db.js';
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
  const accountChanges = [];
  const record = await validateTransactionInput(input, { accountChanges });
  await createRecoveryPoint('每日自动恢复点', { daily: true });
  return writeTransaction(record, accountChanges);
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
  if (patch.amount != null && patch.amountCents == null) merged.amountCents = toCents(patch.amount, { allowNegative: false });
  const accountChanges = [];
  if (merged.type === 'transfer') merged.categoryId = null;
  else merged.toAccountId = null;
  const record = await validateTransactionInput(merged, {
    preserveId: true,
    accountChanges,
    allowArchivedIds: new Set([existing.accountId, existing.toAccountId, existing.categoryId].filter(Boolean))
  });
  record.createdAt = existing.createdAt || Date.now();
  record.updatedAt = Date.now();
  await createRecoveryPoint('每日自动恢复点', { daily: true });
  return writeTransaction(record, accountChanges);
}

async function writeTransaction(record, accountChanges) {
  let request;
  await atomicWrite([Stores.TRANSACTIONS, Stores.ACCOUNTS], stores => {
    accountChanges.forEach(account => stores[Stores.ACCOUNTS].put(account));
    request = stores[Stores.TRANSACTIONS].put(record);
  });
  return request.result;
}

export async function deleteTransaction(id) {
  await createRecoveryPoint('删除流水前');
  return deleteRecord(Stores.TRANSACTIONS, Number(id));
}

export async function getTransaction(id) {
  const record = await get(Stores.TRANSACTIONS, Number(id));
  return record ? hydrateTransaction(record) : undefined;
}

export async function listTransactions(options = {}) {
  if (options.limit && !options.returnPage && !options.offset &&
      !options.dateFrom && !options.dateTo && !options.type && !options.categoryId && !options.accountId && !options.search) {
    return (await getRecentTransactions(Number(options.limit))).map(hydrateTransaction);
  }
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
  const accountChanges = [];
  for (const record of records) prepared.push(await validateTransactionInput(record, { preserveId: record.id != null, accountChanges }));
  await createRecoveryPoint('批量写入前');
  return atomicWrite([Stores.TRANSACTIONS, Stores.ACCOUNTS], stores => {
    accountChanges.forEach(record => stores[Stores.ACCOUNTS].put(record));
    prepared.forEach(record => stores[Stores.TRANSACTIONS].put(record));
  });
}

export function countTransactions() {
  return count(Stores.TRANSACTIONS);
}

async function validateTransactionInput(input, { preserveId = false, allowArchivedIds = new Set(), accountChanges = [] } = {}) {
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
  alignZeroBalanceOpeningDate(account, date, '账户', accountChanges);
  if (type === 'transfer') {
    if (!toAccountId || toAccountId === accountId) throw new Error('请选择不同的目标账户');
    const target = await get(Stores.ACCOUNTS, toAccountId);
    if (!target || (target.archived && !allowArchivedIds.has(toAccountId))) throw new Error('目标账户不存在或已归档');
    alignZeroBalanceOpeningDate(target, date, '目标账户', accountChanges);
  } else {
    if (!categoryId) throw new Error('请选择分类');
    const category = await get(Stores.CATEGORIES, categoryId);
    if (!category || (category.archived && !allowArchivedIds.has(categoryId)) || category.type !== type) throw new Error('分类不存在、已归档或类型不匹配');
  }
  const now = Date.now();
  const result = {
    uid: input.uid || createId('tx'),
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

function alignZeroBalanceOpeningDate(account, date, label, accountChanges) {
  if (!account.openingDate || date >= account.openingDate) return;
  if (Number(account.openingBalanceCents || 0) !== 0) {
    throw new Error(`流水日期早于${label}期初日期 ${account.openingDate}，请先调整期初日期`);
  }
  account.openingDate = date;
  account.updatedAt = Date.now();
  const pending = accountChanges.find(item => item.id === account.id);
  if (pending) pending.openingDate = pending.openingDate < date ? pending.openingDate : date;
  else accountChanges.push(account);
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
  await createRecoveryPoint('每日自动恢复点', { daily: true });
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
  const { transactions, accounts } = await readSnapshot([Stores.TRANSACTIONS, Stores.ACCOUNTS]);
  return balancesFromSnapshot(transactions, accounts, cutoff);
}

function balancesFromSnapshot(transactions, accounts, cutoff) {
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
  const { transactions, accounts } = await readSnapshot([Stores.TRANSACTIONS, Stores.ACCOUNTS]);
  return assetsFromSnapshot(transactions, accounts, cutoff);
}

function assetsFromSnapshot(transactions, accounts, cutoff) {
  const balances = balancesFromSnapshot(transactions, accounts, cutoff);
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
  const { transactions, accounts } = await readSnapshot([Stores.TRANSACTIONS, Stores.ACCOUNTS]);
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
    const cutoff = numericYear === currentYear && month === currentMonth ? todayDateOnly() : monthRange(key).end;
    const summary = assetsFromSnapshot(transactions, accounts, cutoff);
    result.push({ month, label, ...summary });
  }
  return result;
}

export async function monthlyAccountTrend(accountId, year) {
  const { transactions, accounts } = await readSnapshot([Stores.TRANSACTIONS, Stores.ACCOUNTS]);
  const numericYear = Number(year);
  const now = new Date();
  const result = [];
  for (let month = 1; month <= 12; month++) {
    const future = numericYear > now.getFullYear() || (numericYear === now.getFullYear() && month > now.getMonth() + 1);
    const key = `${numericYear}-${String(month).padStart(2, '0')}`;
    result.push({
      label: `${month}月`,
      fullLabel: `${numericYear}年${month}月`,
      value: future ? null : (balancesFromSnapshot(transactions, accounts, key === todayDateOnly().slice(0, 7) ? todayDateOnly() : monthRange(key).end).get(accountId) || 0)
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
  const snapshot = await readSnapshot([Stores.TRANSACTIONS, Stores.BUDGETS, Stores.CATEGORIES, Stores.ACCOUNTS]);
  const data = { version: 4, schemaVersion: 6, exportedAt: new Date().toISOString(), ...snapshot };
  data.checksum = await backupChecksum(data);
  return data;
}

async function backupChecksum(data) {
  const bytes = new TextEncoder().encode(JSON.stringify([data.transactions, data.budgets, data.categories, data.accounts]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyBackup(data) {
  if (Number(data?.version) > 4 || Number(data?.schemaVersion) > 6) throw new Error('备份来自较新版本，请先升级应用');
  if (data?.checksum && data.checksum !== await backupChecksum(data)) throw new Error('备份完整性校验失败，请使用原始备份文件');
}

let recoveryQueue = Promise.resolve();
export function createRecoveryPoint(reason, { daily = false } = {}) {
  const operation = recoveryQueue.then(async () => {
    const day = todayDateOnly();
    if (daily && (await get(Stores.META, 'dailyRecovery'))?.value === day) return;
    const data = await exportAll();
    const existing = await getAll(Stores.RECOVERY);
    const point = { id: createId('recovery'), createdAt: Date.now(), reason, data };
    await atomicWrite([Stores.RECOVERY, Stores.META], stores => {
      stores[Stores.RECOVERY].put(point);
      existing.sort((a, b) => b.createdAt - a.createdAt).slice(2).forEach(item => stores[Stores.RECOVERY].delete(item.id));
      if (daily) stores[Stores.META].put({ key: 'dailyRecovery', value: day });
    });
    return point.id;
  });
  recoveryQueue = operation.catch(() => {});
  return operation;
}

export async function listRecoveryPoints() {
  return (await getAll(Stores.RECOVERY)).sort((a, b) => b.createdAt - a.createdAt).map(({ data, ...point }) => ({
    ...point, transactions: data.transactions.length
  }));
}

export async function restoreRecoveryPoint(id) {
  const point = await get(Stores.RECOVERY, id);
  if (!point) throw new Error('恢复点已不存在');
  return importAll(point.data, 'replace');
}

export async function getBackupStatus() {
  return (await get(Stores.META, 'lastExport'))?.value || null;
}

export async function recordBackupExport(count) {
  await put(Stores.META, { key: 'lastExport', value: { at: Date.now(), count } });
}

export async function previewBackupImport(data, mode = 'merge') {
  await verifyBackup(data);
  const normalized = normalizeBackup(data);
  const snapshot = await readSnapshot([Stores.TRANSACTIONS, Stores.ACCOUNTS, Stores.CATEGORIES]);
  const existing = mode === 'merge' ? snapshot.transactions : [];
  const accountPlan = buildEntityPlan(normalized.accounts, mode === 'merge' ? snapshot.accounts : [], accountSemanticKey, 'acc');
  const categoryPlan = buildEntityPlan(normalized.categories, mode === 'merge' ? snapshot.categories : [], categorySemanticKey, 'cat');
  const match = createTransactionMatcher(existing);
  const outcomes = normalized.transactions.map(transaction => match({
    ...transaction,
    accountId: accountPlan.idMap.get(transaction.accountId) || transaction.accountId,
    toAccountId: accountPlan.idMap.get(transaction.toAccountId) || transaction.toAccountId,
    categoryId: categoryPlan.idMap.get(transaction.categoryId) || transaction.categoryId
  }));
  const duplicateCount = outcomes.filter(value => value === 'duplicate').length;
  return {
    mode,
    transactions: normalized.transactions.length,
    accounts: normalized.accounts.length,
    categories: normalized.categories.length,
    budgets: normalized.budgets.length,
    duplicateCount,
    conflictCount: outcomes.filter(value => value === 'conflict').length + accountPlan.conflicts.length + categoryPlan.conflicts.length,
    incomeCents: normalized.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amountCents, 0),
    expenseCents: normalized.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amountCents, 0),
    checked: Boolean(data.checksum),
    version: normalized.version
  };
}

export async function importAll(data, mode = 'merge') {
  await verifyBackup(data);
  const normalized = normalizeBackup(data);
  if (!['merge', 'replace'].includes(mode)) throw new Error('导入模式无效');
  const [existingTransactions, existingAccounts, existingCategories, existingBudgets] = await Promise.all([
    getAll(Stores.TRANSACTIONS), getAll(Stores.ACCOUNTS), getAll(Stores.CATEGORIES), getAll(Stores.BUDGETS)
  ]);

  const accountPlan = mode === 'replace' ? replacementEntityPlan(normalized.accounts) : buildEntityPlan(normalized.accounts, existingAccounts, accountSemanticKey, 'acc');
  const categoryPlan = mode === 'replace' ? replacementEntityPlan(normalized.categories) : buildEntityPlan(normalized.categories, existingCategories, categorySemanticKey, 'cat');
  if (accountPlan.conflicts?.length || categoryPlan.conflicts?.length) throw new Error('账户期初余额、期初日期或分类类型存在冲突，合并已中止；请核对备份与本机账本');
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
  const match = createTransactionMatcher(mode === 'merge' ? existingTransactions : []);
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
    const outcome = mode === 'merge' ? match(transaction) : 'new';
    if (outcome === 'conflict') throw new Error('同一笔流水在本机与备份中内容不同，合并已中止。请核对后选择完整恢复');
    if (outcome === 'duplicate') {
      skippedDuplicates++;
      continue;
    }
    if (mode === 'merge') delete transaction.id;
    transaction.uid ||= createId('tx');
    transactions.push(transaction);
  }

  const budgets = mergeBudgets(normalized.budgets, mode === 'merge' ? existingBudgets : []);
  const storeNames = [Stores.TRANSACTIONS, Stores.BUDGETS, Stores.CATEGORIES, Stores.ACCOUNTS];
  await createRecoveryPoint(mode === 'replace' ? '完整恢复前' : '合并备份前');
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
    if (Number(account.openingBalanceCents || 0) !== 0) {
      throw new Error(`流水早于「${account.name}」的非零期初余额日期，请先核对并调整该账户期初日期`);
    }
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

  const matchTransaction = createTransactionMatcher(existingTransactions);
  const transactions = [];
  let skipped = 0;
  for (const row of rows) {
    try {
      const type = row.type;
      if (!TRANSACTION_TYPES.has(type)) throw new Error('流水类型无效');
      const amountCents = row.amountCents != null ? assertCents(row.amountCents, { positive: true }) : toCents(row.amount, { allowNegative: false });
      assertCents(amountCents, { positive: true });
      assertDateOnly(row.date);
      let account = ensureAccount(row.rawFrom || (type === 'income' ? row.rawTo : ''));
      let target = type === 'transfer' ? ensureAccount(row.rawTo) : null;
      if (account) account = alignOpeningDate(account, row.date);
      if (target) target = alignOpeningDate(target, row.date);
      const category = ensureCategory(row.rawCat, type);
      if (!account || (type === 'transfer' && (!target || target.id === account.id)) || (type !== 'transfer' && !category)) throw new Error('账户或分类缺失');
      const record = {
        type,
        amountCents,
        categoryId: category?.id || null,
        accountId: account.id,
        toAccountId: target?.id || null,
        note: String(row.note || '').trim().slice(0, 200),
        date: assertDateOnly(row.date),
        createdAt: timestampForDateAndTime(row.date, row.time || '12:00'),
        updatedAt: Date.now()
      };
      if (matchTransaction(record) === 'duplicate') { skipped++; continue; }
      record.uid = createId('tx');
      record.sourceFingerprint = transactionFingerprint(record);
      transactions.push(record);
    } catch (error) {
      throw new Error(`第 ${transactions.length + skipped + 1} 条流水：${error.message}，未写入任何数据`);
    }
  }
  if (transactions.length === 0) throw new Error('没有可导入的新流水；可能全部重复或格式无效');
  await createRecoveryPoint('表格导入前');
  await atomicWrite([Stores.TRANSACTIONS, Stores.CATEGORIES, Stores.ACCOUNTS], stores => {
    accountsToWrite.forEach(record => stores[Stores.ACCOUNTS].put(record));
    categoriesToWrite.forEach(record => stores[Stores.CATEGORIES].put(record));
    transactions.forEach(record => stores[Stores.TRANSACTIONS].put(record));
  });
  return { imported: transactions.length, skipped, newAccounts, newCategories };
}

export async function clearAllData() {
  await createRecoveryPoint('清空账本前');
  const names = [Stores.TRANSACTIONS, Stores.BUDGETS, Stores.CATEGORIES, Stores.ACCOUNTS];
  return atomicWrite(names, stores => names.forEach(name => stores[name].clear()));
}

export function transactionFingerprint(transaction) {
  return JSON.stringify([
    transaction.type,
    transaction.date,
    Number(transaction.amountCents || 0),
    transaction.accountId || '',
    transaction.toAccountId || '',
    transaction.categoryId || '',
    String(transaction.note || '').trim()
  ]);
}

function createTransactionMatcher(existing) {
  const byUid = new Map(existing.filter(t => t.uid).map(t => [t.uid, t]));
  const legacyCounts = new Map();
  const legacyKey = t => JSON.stringify([transactionFingerprint(t), Number(t.createdAt || 0)]);
  for (const t of existing) {
    const key = legacyKey(t);
    legacyCounts.set(key, (legacyCounts.get(key) || 0) + 1);
  }
  return transaction => {
    if (transaction.uid) {
      const match = byUid.get(transaction.uid);
      return !match ? 'new' : transactionFingerprint(match) === transactionFingerprint(transaction) ? 'duplicate' : 'conflict';
    }
    const key = legacyKey(transaction);
    const count = legacyCounts.get(key) || 0;
    if (!count) return 'new';
    legacyCounts.set(key, count - 1);
    return 'duplicate';
  };
}

function replacementEntityPlan(records) {
  return { toWrite: records, idMap: new Map(records.map(r => [r.id, r.id])), added: records.length };
}

function normalizeBackup(data) {
  if (!data || typeof data !== 'object') throw new Error('备份格式错误');
  if (!Array.isArray(data.transactions)) throw new Error('备份缺少 transactions 数组');
  const version = Number(data.version || 1);
  if (version >= 3 && !['accounts', 'categories', 'budgets'].every(key => Array.isArray(data[key]))) throw new Error('备份内容不完整，缺少账户、分类或预算数组');
  const accounts = (Array.isArray(data.accounts) ? data.accounts : []).map((account, index) => ({
    id: String(account.id || createId('acc')),
    name: String(account.name || `账户${index + 1}`).trim().slice(0, 20),
    icon: String(account.icon || '💰').slice(0, 8),
    color: safeColor(account.color),
    type: account.type === 'credit' ? 'credit' : 'asset',
    sort: Number(account.sort || index + 1),
    builtin: false,
    archived: Boolean(account.archived),
    openingBalanceCents: account.openingBalanceCents != null ? assertCents(account.openingBalanceCents) : toCents(account.openingBalance || 0),
    openingDate: account.openingDate ? assertDateOnly(account.openingDate) : null,
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
    const amountCents = transaction.amountCents != null ? assertCents(transaction.amountCents) : toCents(transaction.amount, { allowNegative: false });
    assertCents(amountCents, { positive: true });
    return {
      id: transaction.id,
      uid: typeof transaction.uid === 'string' && transaction.uid ? transaction.uid : undefined,
      type,
      amountCents,
      categoryId: type === 'transfer' ? null : (transaction.categoryId || null),
      accountId: transaction.accountId || null,
      toAccountId: type === 'transfer' ? (transaction.toAccountId || null) : null,
      note: String(transaction.note || '').trim().slice(0, 200),
      date: assertDateOnly(transaction.date),
      createdAt: Number(transaction.createdAt) || timestampForDateAndTime(transaction.date, '12:00'),
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
    limitCents: budget.limitCents != null ? assertCents(budget.limitCents) : toCents(budget.limit || 0, { allowNegative: false }),
    createdAt: Number(budget.createdAt) || Date.now(),
    updatedAt: Number(budget.updatedAt) || Date.now()
  }));
  for (const [label, records, key] of [['账户', accounts, 'id'], ['分类', categories, 'id'], ['流水', transactions, 'id'], ['流水标识', transactions, 'uid'], ['预算', budgets, 'key']]) {
    const values = records.map(r => r[key]).filter(value => value != null);
    if (new Set(values).size !== values.length) throw new Error(`备份中的${label}标识重复，无法安全恢复`);
  }
  for (const transaction of transactions) {
    if (transaction.id != null && (!Number.isSafeInteger(transaction.id) || transaction.id <= 0)) delete transaction.id;
  }
  for (const budget of budgets) {
    assertCents(budget.limitCents);
    if (budget.limitCents < 0) throw new Error('备份预算不能为负数');
  }
  return { version, accounts, categories, transactions, budgets };
}

function buildEntityPlan(imported, existing, semanticKey, prefix) {
  const byId = new Map(existing.map(record => [record.id, record]));
  const bySemantic = new Map(existing.map(record => [semanticKey(record), record]));
  const usedIds = new Set(existing.map(record => record.id));
  const idMap = new Map();
  const toWrite = [];
  let added = 0;
  const conflicts = [];
  for (const source of imported) {
    const key = semanticKey(source);
    const match = byId.get(source.id) || bySemantic.get(key);
    if (match) {
      if (prefix === 'acc') {
        if (source.openingBalanceCents !== match.openingBalanceCents ||
            (source.openingBalanceCents !== 0 && source.openingDate !== match.openingDate)) {
          conflicts.push(source.id);
        } else if (source.openingDate < match.openingDate) {
          match.openingDate = source.openingDate;
          toWrite.push({ ...match });
        }
      } else if (source.type !== match.type) conflicts.push(source.id);
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
  return { idMap, toWrite, added, conflicts };
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
