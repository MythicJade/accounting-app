// js/category-icons.js — offline, code-native line icons for transaction categories.
// Existing emoji tokens stay in storage for backup compatibility; the UI maps them to SVG.

const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  food: '<path d="M5 3v6a2 2 0 0 0 2 2h1V3M5 7h3M6.5 11v10M15 3v18M15 3c3 1 4 3 4 6s-2 5-4 5"/>',
  transit: '<rect x="5" y="3" width="14" height="16" rx="4"/><path d="M8 7h8M7 12h10M8 19v2M16 19v2"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/>',
  shopping: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/>',
  game: '<path d="M8 8h8a5 5 0 0 1 4.7 6.7l-1 2.8a2.2 2.2 0 0 1-3.5 1l-2.1-1.7H9.9l-2.1 1.7a2.2 2.2 0 0 1-3.5-1l-1-2.8A5 5 0 0 1 8 8Z"/><path d="M7 12v4M5 14h4M16 12h.01M18 14h.01"/>',
  medical: '<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/>',
  learning: '<path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12v4c3 2 7 2 10 0v-4M21 9v6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.7-1.6-1-3-1-1.7 0-3 .8-3 2s1 1.8 3 2.3 3 1 3 2.3-1.3 2.4-3 2.4c-1.4 0-2.5-.4-3.2-1.2M12 5.5v13"/>',
  salary: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5h8v2M3 12h18M10 12v2h4v-2"/>',
  gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13"/><path d="M12 7H8.7a2.2 2.2 0 1 1 2.4-3.2L12 7Zm0 0h3.3a2.2 2.2 0 1 0-2.4-3.2L12 7Z"/>',
  chart: '<path d="M4 19V9M10 19V5M16 19v-7M3 21h18"/><path d="m4 6 5-3 5 4 6-5"/>',
  cake: '<path d="M5 11h14v9H5zM4 15h16M8 11V8h8v3M10 5h.01M14 5h.01"/>',
  clothes: '<path d="m8 4-5 3 2 5 3-1v9h8v-9l3 1 2-5-5-3c-1 2-7 2-8 0Z"/>',
  plane: '<path d="m3 11 7 2 3 7 2-1-1-7 6-4c1-.8 1.3-2 .7-2.7S19 4 18 4.7l-6 4-7-1L3 11Z"/>',
  movie: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="m4 11 4-4m2 4 4-4m2 4 4-4M4 4h16v3H4z"/>',
  drink: '<path d="M7 3h10l-1 17H8L7 3ZM8 8h8M14 3l3-2"/>',
  utility: '<path d="M9 18h6M10 21h4"/><path d="M8 14a6 6 0 1 1 8 0c-1 .8-1.5 1.7-1.5 3h-5c0-1.3-.5-2.2-1.5-3Z"/>',
  phone: '<path d="M8 3h3l1.2 5-2.2 1.4a16 16 0 0 0 4.6 4.6l1.4-2.2 5 1.2v3c0 2-1.7 3.5-3.7 3.2A16.5 16.5 0 0 1 4.8 6.7C4.5 4.7 6 3 8 3Z"/>',
  bank: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
  wallet: '<path d="M4 6.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M15 12h5v4h-5a2 2 0 1 1 0-4Z"/>',
  snack: '<path d="m7 9-4-3 2-3 4 4M17 9l4-3-2-3-4 4"/><path d="M8 7h8l2 5-2 5H8l-2-5 2-5Z"/>',
  beauty: '<circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="m9 15 7-12M15 15 8 3"/>',
  other: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'
};

export const CATEGORY_ICON_OPTIONS = [
  { token: '🍜', key: 'food', label: '餐饮' },
  { token: '🚇', key: 'transit', label: '交通' },
  { token: '🛍️', key: 'shopping', label: '购物' },
  { token: '🏠', key: 'home', label: '居住' },
  { token: '📚', key: 'learning', label: '学习' },
  { token: '🍬', key: 'snack', label: '零食' },
  { token: '🥤', key: 'drink', label: '饮品' },
  { token: '💊', key: 'medical', label: '医疗' },
  { token: '✂️', key: 'beauty', label: '美容' },
  { token: '📱', key: 'phone', label: '通讯' },
  { token: '🎮', key: 'game', label: '娱乐' },
  { token: '✈️', key: 'plane', label: '旅行' },
  { token: '👕', key: 'clothes', label: '服饰' },
  { token: '🎬', key: 'movie', label: '影音' },
  { token: '💡', key: 'utility', label: '生活缴费' },
  { token: '💼', key: 'salary', label: '工资' },
  { token: '💰', key: 'coin', label: '收入' },
  { token: '📈', key: 'chart', label: '理财' },
  { token: '🎁', key: 'gift', label: '礼物' },
  { token: '🎂', key: 'cake', label: '聚会' },
  { token: '💳', key: 'card', label: '卡片' },
  { token: '🏦', key: 'bank', label: '银行' },
  { token: '👛', key: 'wallet', label: '钱包' },
  { token: '➕', key: 'other', label: '其他' }
];

const TOKEN_TO_KEY = new Map(CATEGORY_ICON_OPTIONS.map(option => [option.token, option.key]));
[
  ['🍱', 'food'], ['🚗', 'transit'], ['🛒', 'shopping'], ['☕', 'drink'], ['🍷', 'drink'],
  ['💵', 'coin'], ['💎', 'gift'], ['💙', 'other'], ['💚', 'other'], ['💛', 'other']
].forEach(([token, key]) => TOKEN_TO_KEY.set(token, key));

const NAME_RULES = [
  [/餐|食|饭|早餐|午餐|晚餐|外卖/, 'food'], [/交通|地铁|公交|打车|车|油/, 'transit'],
  [/购|淘宝|网购|日用/, 'shopping'], [/房|住|租|物业|家/, 'home'], [/学|书|课程|培训/, 'learning'],
  [/零食|糖|小吃/, 'snack'], [/饮|咖啡|茶|酒|水/, 'drink'], [/医|药|健康|医院/, 'medical'],
  [/美容|理发|护肤|美甲/, 'beauty'], [/话费|通讯|手机|宽带/, 'phone'], [/娱乐|游戏/, 'game'],
  [/旅行|旅游|机票|酒店/, 'plane'], [/衣|服饰|鞋|包/, 'clothes'], [/电影|影音|会员/, 'movie'],
  [/水电|燃气|缴费|电费/, 'utility'], [/工资|薪资|奖金/, 'salary'], [/理财|投资|股票|基金/, 'chart'],
  [/礼|红包|人情/, 'gift'], [/银行/, 'bank'], [/信用|卡/, 'card'], [/钱包|现金/, 'wallet']
];

export function resolveCategoryIconKey(category) {
  const token = typeof category === 'string' ? category : category?.icon;
  if (TOKEN_TO_KEY.has(token)) return TOKEN_TO_KEY.get(token);
  const name = typeof category === 'object' ? String(category?.name || '') : '';
  const matched = NAME_RULES.find(([pattern]) => pattern.test(name));
  return matched ? matched[1] : 'other';
}

export function categoryIconNode(category, { size = 24, className = '', title = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  if (title) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.innerHTML = PATHS[resolveCategoryIconKey(category)] || PATHS.other;
  return svg;
}
