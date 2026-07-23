// js/categories.js — categories CRUD (默认为空，由用户自定义)
import { put, getAll, get, deleteRecord, Stores } from './db.js';

// 初始默认为空：用户自定义分类类型、图标和颜色
export const DEFAULT_CATEGORIES = [];

// 兼容老版本：仍可调用 ensureCategories，但不再自动填充任何分类
export async function ensureCategories() {
  return getAll(Stores.CATEGORIES);
}

export async function listCategories(type) {
  const all = await getAll(Stores.CATEGORIES);
  const sorted = all.sort((a, b) => (a.sort || 99) - (b.sort || 99));
  if (!type) return sorted;
  return sorted.filter(c => c.type === type);
}

export async function getCategory(id) {
  return get(Stores.CATEGORIES, id);
}

export async function addCategory(cat) {
  const all = await getAll(Stores.CATEGORIES);
  const sort = cat.sort != null ? cat.sort : (all.length + 1);
  const record = {
    id: cat.id || ('cat_' + Date.now()),
    name: cat.name,
    type: cat.type || 'expense',
    icon: cat.icon || '💰',
    color: cat.color || '#007AFF',
    sort,
    builtin: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await put(Stores.CATEGORIES, record);
  return record;
}

export async function updateCategory(id, patch) {
  const existing = await get(Stores.CATEGORIES, id);
  if (!existing) throw new Error('分类不存在');
  Object.assign(existing, patch, { updatedAt: Date.now() });
  return put(Stores.CATEGORIES, existing);
}

export async function deleteCategory(id) {
  // 默认为空后所有分类均为用户自建，均可删除
  const cat = await get(Stores.CATEGORIES, id);
  if (cat && cat.builtin) throw new Error('内置分类不可删除');
  return deleteRecord(Stores.CATEGORIES, id);
}
