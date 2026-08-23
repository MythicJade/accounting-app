// js/accounts.js — accounts CRUD, archival and reference protection.
import { put, getAll, get, deleteRecord, Stores } from './db.js';
import { toCents, fromCents } from './money.js';
import { assertDateOnly, todayDateOnly } from './date-only.js';

export async function ensureAccounts() {
  return listAccounts();
}

export async function listAccounts({ includeArchived = false } = {}) {
  const all = (await getAll(Stores.ACCOUNTS)).map(hydrateAccount);
  return all
    .filter(account => includeArchived || !account.archived)
    .sort((a, b) => (a.sort || 99) - (b.sort || 99) || a.name.localeCompare(b.name, 'zh-CN'));
}

export async function getAccount(id) {
  const account = await get(Stores.ACCOUNTS, id);
  return account ? hydrateAccount(account) : undefined;
}

export async function addAccount(account) {
  const name = normalizeName(account.name);
  await assertUniqueName(name);
  const all = await getAll(Stores.ACCOUNTS);
  const now = Date.now();
  const record = {
    id: account.id || createId('acc'),
    name,
    icon: account.icon || '💰',
    color: normalizeColor(account.color),
    type: account.type === 'credit' ? 'credit' : 'asset',
    sort: account.sort != null ? Number(account.sort) : all.length + 1,
    builtin: false,
    archived: Boolean(account.archived),
    openingBalanceCents: toCents(account.openingBalance || 0),
    openingDate: account.openingDate ? assertDateOnly(account.openingDate) : todayDateOnly(),
    createdAt: now,
    updatedAt: now
  };
  await put(Stores.ACCOUNTS, record);
  return hydrateAccount(record);
}

export async function updateAccount(id, patch) {
  const existing = await get(Stores.ACCOUNTS, id);
  if (!existing) throw new Error('账户不存在');
  const next = { ...existing };
  if (patch.name != null) {
    const name = normalizeName(patch.name);
    await assertUniqueName(name, id);
    next.name = name;
  }
  if (patch.icon != null) next.icon = String(patch.icon).slice(0, 8);
  if (patch.color != null) next.color = normalizeColor(patch.color);
  if (patch.type != null) next.type = patch.type === 'credit' ? 'credit' : 'asset';
  if (patch.sort != null) next.sort = Number(patch.sort);
  if (patch.archived != null) next.archived = Boolean(patch.archived);
  if (patch.openingBalance != null) next.openingBalanceCents = toCents(patch.openingBalance);
  if (patch.openingDate != null) {
    const openingDate = assertDateOnly(patch.openingDate);
    const transactions = await getAll(Stores.TRANSACTIONS);
    const earliest = transactions
      .filter(transaction => transaction.accountId === id || transaction.toAccountId === id)
      .reduce((min, transaction) => !min || transaction.date < min ? transaction.date : min, null);
    if (earliest && openingDate > earliest) throw new Error(`期初日期不能晚于最早流水 ${earliest}`);
    next.openingDate = openingDate;
  }
  next.updatedAt = Date.now();
  await put(Stores.ACCOUNTS, next);
  return hydrateAccount(next);
}

export async function getAccountUsage(id) {
  const transactions = await getAll(Stores.TRANSACTIONS);
  return transactions.filter(transaction => transaction.accountId === id || transaction.toAccountId === id).length;
}

export async function archiveAccount(id) {
  const usage = await getAccountUsage(id);
  await updateAccount(id, { archived: true });
  return usage;
}

export async function restoreAccount(id) {
  return updateAccount(id, { archived: false });
}

export async function deleteAccount(id) {
  const account = await get(Stores.ACCOUNTS, id);
  if (!account) return;
  const usage = await getAccountUsage(id);
  if (usage > 0) throw new Error(`该账户关联 ${usage} 笔流水，请改为归档`);
  await deleteRecord(Stores.ACCOUNTS, id);
}

export async function getAccountsMap({ includeArchived = true } = {}) {
  const all = await listAccounts({ includeArchived });
  return new Map(all.map(account => [account.id, account]));
}

export function hydrateAccount(record) {
  return {
    ...record,
    archived: Boolean(record.archived),
    openingBalance: fromCents(Number.isSafeInteger(record.openingBalanceCents) ? record.openingBalanceCents : toCents(record.openingBalance || 0)),
    openingDate: record.openingDate || todayDateOnly()
  };
}

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!name) throw new Error('请输入账户名称');
  if (name.length > 20) throw new Error('账户名称不能超过 20 个字符');
  return name;
}

function normalizeColor(value) {
  const color = String(value || '#007AFF');
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#007AFF';
}

async function assertUniqueName(name, excludeId = null) {
  const normalized = name.toLocaleLowerCase('zh-CN');
  const duplicate = (await getAll(Stores.ACCOUNTS)).find(account =>
    account.id !== excludeId && String(account.name || '').trim().toLocaleLowerCase('zh-CN') === normalized
  );
  if (duplicate) throw new Error('账户名称已存在');
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
