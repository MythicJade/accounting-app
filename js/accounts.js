// js/accounts.js — default accounts + CRUD
import { put, getAll, get, deleteRecord, bulkPut, Stores } from './db.js';

export const DEFAULT_ACCOUNTS = [
  { id: 'cash',   name: '现金',   icon: '💵', color: '#52C41A', sort: 1, builtin: true },
  { id: 'alipay', name: '支付宝', icon: '💙', color: '#1677FF', sort: 2, builtin: true },
  { id: 'wechat', name: '微信',   icon: '💚', color: '#07C160', sort: 3, builtin: true },
  { id: 'card',   name: '银行卡', icon: '💳', color: '#722ED1', sort: 4, builtin: true }
];

export async function ensureAccounts() {
  const existing = await getAll(Stores.ACCOUNTS);
  if (existing.length === 0) {
    for (const a of DEFAULT_ACCOUNTS) {
      await put(Stores.ACCOUNTS, { ...a, createdAt: Date.now(), updatedAt: Date.now() });
    }
  }
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
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await put(Stores.ACCOUNTS, record);
  return record;
}

export async function updateAccount(id, patch) {
  const existing = await get(Stores.ACCOUNTS, id);
  if (!existing) throw new Error('账户不存在');
  Object.assign(existing, patch, { updatedAt: Date.now() });
  return put(Stores.ACCOUNTS, existing);
}

export async function deleteAccount(id) {
  // builtin accounts cannot be deleted
  const acc = await get(Stores.ACCOUNTS, id);
  if (acc && acc.builtin) throw new Error('内置账户不可删除');
  return deleteRecord(Stores.ACCOUNTS, id);
}

// Build a Map<id, account> for quick lookup
export async function getAccountsMap() {
  const all = await listAccounts();
  return new Map(all.map(a => [a.id, a]));
}
