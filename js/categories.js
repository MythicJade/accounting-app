// js/categories.js — categories CRUD, archival and reference protection.
import { put, getAll, get, deleteRecord, Stores } from './db.js';

export const STARTER_CATEGORIES = [
  { name: '餐饮', type: 'expense', icon: '🍜', color: '#FF9500' },
  { name: '交通', type: 'expense', icon: '🚇', color: '#5AC8FA' },
  { name: '购物', type: 'expense', icon: '🛍️', color: '#FF2D55' },
  { name: '居住', type: 'expense', icon: '🏠', color: '#5856D6' },
  { name: '工资', type: 'income', icon: '💼', color: '#34C759' },
  { name: '其他收入', type: 'income', icon: '💰', color: '#00C7BE' }
];

export async function ensureCategories() {
  return listCategories();
}

export async function listCategories(type, { includeArchived = false } = {}) {
  const all = (await getAll(Stores.CATEGORIES))
    .map(category => ({ ...category, archived: Boolean(category.archived) }))
    .filter(category => includeArchived || !category.archived)
    .sort((a, b) => (a.sort || 99) - (b.sort || 99) || a.name.localeCompare(b.name, 'zh-CN'));
  return type ? all.filter(category => category.type === type) : all;
}

export async function getCategory(id) {
  const category = await get(Stores.CATEGORIES, id);
  return category ? { ...category, archived: Boolean(category.archived) } : undefined;
}

export async function addCategory(category) {
  const name = normalizeName(category.name);
  const type = category.type === 'income' ? 'income' : 'expense';
  await assertUniqueName(name, type);
  const all = await getAll(Stores.CATEGORIES);
  const now = Date.now();
  const record = {
    id: category.id || createId('cat'),
    name,
    type,
    icon: category.icon || '💰',
    color: normalizeColor(category.color),
    sort: category.sort != null ? Number(category.sort) : all.length + 1,
    builtin: false,
    archived: Boolean(category.archived),
    createdAt: now,
    updatedAt: now
  };
  await put(Stores.CATEGORIES, record);
  return { ...record };
}

export async function updateCategory(id, patch) {
  const existing = await get(Stores.CATEGORIES, id);
  if (!existing) throw new Error('分类不存在');
  const nextType = patch.type == null ? existing.type : (patch.type === 'income' ? 'income' : 'expense');
  const nextName = patch.name == null ? existing.name : normalizeName(patch.name);
  await assertUniqueName(nextName, nextType, id);
  const next = {
    ...existing,
    name: nextName,
    type: nextType,
    icon: patch.icon == null ? existing.icon : String(patch.icon).slice(0, 8),
    color: patch.color == null ? existing.color : normalizeColor(patch.color),
    archived: patch.archived == null ? Boolean(existing.archived) : Boolean(patch.archived),
    updatedAt: Date.now()
  };
  await put(Stores.CATEGORIES, next);
  return next;
}

export async function getCategoryUsage(id) {
  const transactions = await getAll(Stores.TRANSACTIONS);
  return transactions.filter(transaction => transaction.categoryId === id).length;
}

export async function archiveCategory(id) {
  const usage = await getCategoryUsage(id);
  await updateCategory(id, { archived: true });
  return usage;
}

export async function restoreCategory(id) {
  return updateCategory(id, { archived: false });
}

export async function deleteCategory(id) {
  const category = await get(Stores.CATEGORIES, id);
  if (!category) return;
  const usage = await getCategoryUsage(id);
  if (usage > 0) throw new Error(`该分类关联 ${usage} 笔流水，请改为归档`);
  await deleteRecord(Stores.CATEGORIES, id);
}

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!name) throw new Error('请输入分类名称');
  if (name.length > 20) throw new Error('分类名称不能超过 20 个字符');
  return name;
}

function normalizeColor(value) {
  const color = String(value || '#007AFF');
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#007AFF';
}

async function assertUniqueName(name, type, excludeId = null) {
  const normalized = name.toLocaleLowerCase('zh-CN');
  const duplicate = (await getAll(Stores.CATEGORIES)).find(category =>
    category.id !== excludeId && category.type === type &&
    String(category.name || '').trim().toLocaleLowerCase('zh-CN') === normalized
  );
  if (duplicate) throw new Error('同类型分类名称已存在');
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
