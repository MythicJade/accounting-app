// js/accounts.js — accounts CRUD (默认为空，由用户自定义)
import { put, getAll, get, deleteRecord, bulkPut, Stores } from './db.js';

// 初始默认为空：用户自定义账户类型、图标和颜色
export const DEFAULT_ACCOUNTS = [];

// 兼容老版本：仍可调用 ensureAccounts，但不再自动填充任何账户
export async function ensureAccounts() {
  return getAll(Stores.ACCOUNTS);
}

export async function listAccounts() {
  const all = await getAll(Stores.ACCOUNTS);
  return all.sort((a, b) => (a.sort || 99) - (b.sort || 99));
}

export async function getAccount(id) {
  return get(Stores.ACCOUNTS, id);
}

export async function addAccount(acc) {
  const all = await getAll(Stores.ACCOUNTS);
  const sort = acc.sort != null ? acc.sort : (all.length + 1);
  const record = {
    id: acc.id || ('acc_' + Date.now()),
    name: acc.name,
    icon: acc.icon || '💰',
    color: acc.color || '#868E96',
    sort,
    builtin: false,
    openingBalance: acc.openingBalance == null ? 0 : Number(acc.openingBalance) || 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await put(Stores.ACCOUNTS, record);
  return record;
}

export async function updateAccount(id, patch) {
  const existing = await get(Stores.ACCOUNTS, id);
  if (!existing) throw new Error('账户不存在');
  // 允许更新 openingBalance 字段
  if (patch && patch.openingBalance != null) {
    patch.openingBalance = Number(patch.openingBalance) || 0;
  }
  Object.assign(existing, patch, { updatedAt: Date.now() });
  return put(Stores.ACCOUNTS, existing);
}

export async function deleteAccount(id) {
  // 默认为空后所有账户均为用户自建，均可删除
  // 仍保留 builtin 字段以兼容历史数据
  const acc = await get(Stores.ACCOUNTS, id);
  if (acc && acc.builtin) throw new Error('内置账户不可删除');
  return deleteRecord(Stores.ACCOUNTS, id);
}

// Build a Map<id, account> for quick lookup
export async function getAccountsMap() {
  const all = await listAccounts();
  return new Map(all.map(a => [a.id, a]));
}
