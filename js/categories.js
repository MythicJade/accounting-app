// js/categories.js — default categories
import { put, getAll, Stores } from './db.js';

export const DEFAULT_CATEGORIES = [
  // expense
  { id: 'food',      name: '餐饮', type: 'expense', icon: '🍱', color: '#FF6B6B', builtin: true },
  { id: 'transport', name: '交通', type: 'expense', icon: '🚇', color: '#4ECDC4', builtin: true },
  { id: 'shopping',  name: '购物', type: 'expense', icon: '🛒', color: '#FFA94D', builtin: true },
  { id: 'housing',   name: '住房', type: 'expense', icon: '🏠', color: '#845EF7', builtin: true },
  { id: 'entertain', name: '娱乐', type: 'expense', icon: '🎮', color: '#F783AC', builtin: true },
  { id: 'medical',   name: '医疗', type: 'expense', icon: '💊', color: '#51CF66', builtin: true },
  { id: 'education', name: '教育', type: 'expense', icon: '📚', color: '#339AF0', builtin: true },
  { id: 'other_exp', name: '其他', type: 'expense', icon: '💰', color: '#868E96', builtin: true },
  // income
  { id: 'salary',    name: '工资', type: 'income',  icon: '💼', color: '#52C41A', builtin: true },
  { id: 'bonus',     name: '奖金', type: 'income',  icon: '🎁', color: '#FAAD14', builtin: true },
  { id: 'invest',    name: '理财', type: 'income',  icon: '📈', color: '#13C2C2', builtin: true },
  { id: 'other_inc', name: '其他', type: 'income',  icon: '➕', color: '#868E96', builtin: true }
];

export async function ensureCategories() {
  const existing = await getAll(Stores.CATEGORIES);
  if (existing.length === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await put(Stores.CATEGORIES, c);
    }
  }
  return getAll(Stores.CATEGORIES);
}

export async function listCategories(type) {
  const all = await getAll(Stores.CATEGORIES);
  if (!type) return all;
  return all.filter(c => c.type === type);
}

export async function getCategory(id) {
  const all = await getAll(Stores.CATEGORIES);
  return all.find(c => c.id === id);
}

export async function addCategory(cat) {
  const c = Object.assign({ builtin: false }, cat);
  return put(Stores.CATEGORIES, c);
}
