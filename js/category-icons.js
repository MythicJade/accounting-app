// js/category-icons.js — offline, code-native line icons for transaction categories.
// v2.4.1: 图标库扩充至 91 个，并按生活场景分组（ICON_GROUPS），
//         供分类编辑弹窗的「分组 + 搜索」选择器使用。
// Existing emoji tokens stay in storage for backup compatibility; the UI maps them to SVG.

const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  // —— 餐饮 ——
  food: '<path d="M5 3v6a2 2 0 0 0 2 2h1V3M5 7h3M6.5 11v10M15 3v18M15 3c3 1 4 3 4 6s-2 5-4 5"/>',
  snack: '<path d="m7 9-4-3 2-3 4 4M17 9l4-3-2-3-4 4"/><path d="M8 7h8l2 5-2 5H8l-2-5 2-5Z"/>',
  drink: '<path d="M7 3h10l-1 17H8L7 3ZM8 8h8M14 3l3-2"/>',
  coffee: '<path d="M4 9h12v5.5A4.5 4.5 0 0 1 11.5 19h-3A4.5 4.5 0 0 1 4 14.5V9Z"/><path d="M16 10.5h1.6a2.7 2.7 0 0 1 0 5.4H16"/><path d="M7.5 3v2.5M11 3v2.5"/>',
  alcohol: '<path d="M6 5h9v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5Z"/><path d="M15 8.5h2.4a2.1 2.1 0 0 1 2.1 2.1v2.3a2.1 2.1 0 0 1-2.1 2.1H15"/><path d="M8.5 2.5V5M12.5 2.5V5"/>',
  fruit: '<path d="M12 8c-3.8-1.8-8 .8-6.8 5.4C6.2 17.4 9 21 12 21s5.8-3.6 6.8-7.6C20 8.8 15.8 6.2 12 8Z"/><path d="M12 8c.2-2 1.2-3.4 3-4.2"/>',
  bread: '<path d="M6 9.5A4 4 0 0 1 9.8 5h4.4A4 4 0 0 1 18 9.5V20H6V9.5Z"/><path d="M9 10v2M12 8.5v2M15 10v2"/>',
  burger: '<path d="M5 10c.5-3 3-5 7-5s6.5 2 7 5H5Z"/><path d="M4 13h16M5 17h14M6 13l2 4 3-4 3 4 2-4M6 20h12"/>',
  noodle: '<path d="M4 11h16c0 5-3.2 9-8 9s-8-4-8-9Z"/><path d="M7 7c0-2 2-2 2-4M11 7c0-2 2-2 2-4M15 7c0-2 2-2 2-4"/>',
  icecream: '<path d="m8 11 4 10 4-10H8Z"/><path d="M7 9a3 3 0 0 1 3-3 3 3 0 0 1 6 0 3 3 0 0 1 1 5H7a2 2 0 0 1 0-4"/>',
  grocery: '<path d="M3 5h2l2.2 10h9.9l2-7H6"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M10 8v4M14 8v4"/>',
  carrot: '<path d="M8 8c3 0 7 4 8 7l-4 6c-3-1-7-5-7-8l3-5Z"/><path d="M9 7c0-3 2-4 4-5M10 7c3-2 5-1 7 0"/>',
  salad: '<path d="M4 11h16c0 5-3.2 9-8 9s-8-4-8-9Z"/><path d="M7 10c0-3 2-5 5-5 0 3-2 5-5 5ZM12 10c1-3 4-4 6-2-1 2-3 3-6 2Z"/>',
  pizza: '<path d="m5 20 7-16 7 16H5Z"/><path d="M7 16h10"/><circle cx="11" cy="12" r="1"/><circle cx="14.5" cy="16" r="1"/>',
  chicken: '<path d="M6 15c-3-3-2-8 2-10s8 0 9 4-2 7-5 8c-2 .7-4-.5-6-2Z"/><path d="m6 15-2 2M4 17l-2-1M4 17l1 2"/>',
  seafood: '<path d="M5 14c3-6 8-8 14-5-1 6-6 9-12 8L4 20"/><path d="m19 9 2-3M19 9l2 2M8 13h.01"/>',
  hotpot: '<path d="M4 10h16v3a8 8 0 0 1-16 0v-3Z"/><path d="M2 10h20M8 6c0-2 1-2 1-4M12 6c0-2 1-2 1-4M16 6c0-2 1-2 1-4"/>',
  dumpling: '<path d="M4 15c1-6 4-9 8-9s7 3 8 9c-4 4-12 4-16 0Z"/><path d="M8 8.5 9 12m3-6v6m4-3.5L15 12"/>',
  rice: '<path d="M4 11h16c0 5-3.2 9-8 9s-8-4-8-9Z"/><path d="M7 10c1-3 3-5 5-5s4 2 5 5M9 8h6"/>',
  milk: '<path d="m7 7 3-4h5l2 4v14H7V7Z"/><path d="M7 7h10M10 3l2 4M11 12h2"/>',
  tea: '<path d="M5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9Z"/><path d="M17 11h2a2 2 0 0 1 0 4h-2M9 5c0-2 2-2 2-4M13 5c0-2 2-2 2-4"/>',
  cookie: '<circle cx="12" cy="12" r="8"/><path d="M17 5.8c-1 2 .5 3 2.6 2.8M8 9h.01M13 8h.01M10 14h.01M15 15h.01"/>',
  juice: '<path d="M7 5h10l-1 16H8L7 5Z"/><path d="M8 10h8M13 5l4-3M11 14h2"/>',
  egg: '<path d="M12 3c-4 0-7 7-7 11a7 7 0 0 0 14 0c0-4-3-11-7-11Z"/><circle cx="12" cy="14" r="2.5"/>',
  fries: '<path d="M6 9h12l-1 12H7L6 9Z"/><path d="M8 9 7 3M11 9l1-7M14 9l2-6M17 9l1-5"/>',
  bento: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 11h18M12 11v9"/><circle cx="8" cy="8" r="1.5"/>',
  // —— 交通出行 ——
  transit: '<rect x="5" y="3" width="14" height="16" rx="4"/><path d="M8 7h8M7 12h10M8 19v2M16 19v2"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/>',
  car: '<path d="m4.6 14.5 1.6-4.6A2.4 2.4 0 0 1 8.5 8h7a2.4 2.4 0 0 1 2.3 1.9l1.6 4.6"/><rect x="3.5" y="14" width="17" height="4.5" rx="1.8"/><path d="M7 16.2h.01M17 16.2h.01M6 18.5V20M18 18.5V20"/>',
  plane: '<path d="m3 11 7 2 3 7 2-1-1-7 6-4c1-.8 1.3-2 .7-2.7S19 4 18 4.7l-6 4-7-1L3 11Z"/>',
  lodging: '<path d="M3 6v13"/><path d="M3 11.5h10.5a4.5 4.5 0 0 1 4.5 4.5V19"/><path d="M3 15.5h18V19"/><circle cx="7.8" cy="9.3" r="2"/>',
  parcel: '<path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z"/><path d="M4.3 7.4 12 11.2l7.7-3.8M12 11.2V21"/>',
  bike: '<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="m6 17 4-8h4l4 8M10 9l4 8H6M9 6h3M14 9l2-3"/>',
  train: '<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M8 7h8M7 12h10M8 18l-2 3M16 18l2 3M9 21h6"/><circle cx="8.5" cy="15" r="1"/><circle cx="15.5" cy="15" r="1"/>',
  fuel: '<path d="M5 4h9v17H5zM7 7h5v4H7z"/><path d="M14 8h2l2 2v7a1.5 1.5 0 0 0 3 0V8l-2-2"/>',
  parking: '<circle cx="12" cy="12" r="9"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9M9 13h4"/>',
  boat: '<path d="m4 13 2 6h12l2-6-8 3-8-3Z"/><path d="M12 4v11M12 5l5 5h-5M12 7 8 11h4"/>',
  // —— 购物 ——
  shopping: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  cosmetic: '<rect x="8.5" y="11" width="7" height="10" rx="2"/><path d="M10.5 11V7c0-1.5 1-2.6 1.5-2.6S13.5 5.5 13.5 7v4"/><path d="M8.5 15.5h7"/>',
  beauty: '<circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="m9 15 7-12M15 15 8 3"/>',
  clothes: '<path d="m8 4-5 3 2 5 3-1v9h8v-9l3 1 2-5-5-3c-1 2-7 2-8 0Z"/>',
  phone: '<path d="M8 3h3l1.2 5-2.2 1.4a16 16 0 0 0 4.6 4.6l1.4-2.2 5 1.2v3c0 2-1.7 3.5-3.7 3.2A16.5 16.5 0 0 1 4.8 6.7C4.5 4.7 6 3 8 3Z"/>',
  shoes: '<path d="M5 5h5c0 5 2 7 7 8l3 1v5H5a2 2 0 0 1-2-2c0-2 1-3 3-4L5 5Z"/><path d="M10 10H7M12 13H8"/>',
  handbag: '<path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  jewelry: '<path d="m5 9 7 11 7-11-3-5H8L5 9Z"/><path d="M5 9h14M8 4l4 5 4-5M12 9v11"/>',
  laptop: '<rect x="5" y="4" width="14" height="11" rx="1.5"/><path d="m3 18 2-3h14l2 3H3Z"/>',
  appliance: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 9h14M8 6h.01M11 6h.01"/><circle cx="12" cy="15" r="3.5"/>',
  // —— 居家生活 ——
  home: '<path d="m3 11 9-8 9 8"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/>',
  utility: '<path d="M9 18h6M10 21h4"/><path d="M8 14a6 6 0 1 1 8 0c-1 .8-1.5 1.7-1.5 3h-5c0-1.3-.5-2.2-1.5-3Z"/>',
  tools: '<path d="M14.3 6.7a4.6 4.6 0 0 0-6.2 5.6L4 16.4V20h3.6l4.1-4.1a4.6 4.6 0 0 0 5.6-6.2l-2.9 2.9-2.4-.6-.6-2.4 2.9-2.9Z"/>',
  medical: '<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/>',
  pet: '<circle cx="7.6" cy="9.6" r="1.7"/><circle cx="12" cy="7.6" r="1.9"/><circle cx="16.4" cy="9.6" r="1.7"/><path d="M12 11.5c-2.9 0-5.2 2.1-5.2 4.7 0 1.5 1.2 2.8 2.7 2.8 1 0 1.7-.4 2.5-.4s1.5.4 2.5.4c1.5 0 2.7-1.3 2.7-2.8 0-2.6-2.3-4.7-5.2-4.7Z"/>',
  baby: '<circle cx="12" cy="12" r="8.5"/><path d="M9 13.6a4.2 4.2 0 0 0 6 0"/><path d="M9.3 10h.01M14.7 10h.01"/>',
  rent: '<circle cx="9" cy="9" r="4"/><path d="m12 12 8 8M15 15l2-2M17 17l2-2"/>',
  furniture: '<path d="M5 12V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4"/><path d="M4 11a2 2 0 0 0-2 2v5h20v-5a2 2 0 0 0-2-2M5 18v3M19 18v3"/>',
  cleaning: '<path d="m14 3-5 13M11 15l7 3-2 3-8-3 3-3Z"/><path d="m15 5 2-1"/>',
  garden: '<path d="M12 21v-9M12 14c-5 0-7-3-7-7 4 0 7 2 7 7ZM12 12c5 0 7-3 7-7-4 0-7 2-7 7Z"/>',
  // —— 文教娱乐 ——
  learning: '<path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12v4c3 2 7 2 10 0v-4M21 9v6"/>',
  game: '<path d="M8 8h8a5 5 0 0 1 4.7 6.7l-1 2.8a2.2 2.2 0 0 1-3.5 1l-2.1-1.7H9.9l-2.1 1.7a2.2 2.2 0 0 1-3.5-1l-1-2.8A5 5 0 0 1 8 8Z"/><path d="M7 12v4M5 14h4M16 12h.01M18 14h.01"/>',
  movie: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="m4 11 4-4m2 4 4-4m2 4 4-4M4 4h16v3H4z"/>',
  mic: '<rect x="9" y="3" width="6" height="10.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/>',
  sport: '<circle cx="12" cy="12" r="8.5"/><path d="m12 7.6 3.4 2.5-1.3 4h-4.2l-1.3-4L12 7.6Z"/><path d="M12 3.5v4.1M4.6 9.4l3.5 2M19.4 9.4l-3.5 2M8 19.5l1.9-2.4M16 19.5 14.1 17.1"/>',
  fitness: '<path d="M7.5 7.5v9M4.5 9.5v5M16.5 7.5v9M19.5 9.5v5M7.5 12h9"/>',
  book: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 3H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 3H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z"/>',
  stationery: '<path d="m4 16 12-12 4 4L8 20l-5 1 1-5Z"/><path d="m14 6 4 4M4 16l4 4"/>',
  exam: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3M7.5 8h.01M7.5 12h.01M7.5 16h.01"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/><path d="M9 9l10-2"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="m8 7 1.5-3h5L16 7"/><circle cx="12" cy="13.5" r="3.5"/>',
  ticket: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"/><path d="M12 8v2M12 14v2"/>',
  // —— 人情往来 ——
  gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13"/><path d="M12 7H8.7a2.2 2.2 0 1 1 2.4-3.2L12 7Zm0 0h3.3a2.2 2.2 0 1 0-2.4-3.2L12 7Z"/>',
  redpacket: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M5.8 6.8C8.2 9 10 9.9 12 9.9s3.8-.9 6.2-3.1"/><path d="M12 9.9V14M10 14h4"/>',
  cake: '<path d="M5 11h14v9H5zM4 15h16M8 11V8h8v3M10 5h.01M14 5h.01"/>',
  family: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 2-6 5-6s5 2 5 6M13 15c1-.8 2.2-1.2 3.5-1.2 2.8 0 4.5 2 4.5 5.2"/>',
  charity: '<path d="M12 20s-8-4.8-8-10a4 4 0 0 1 7-2.7L12 9l1-1.7A4 4 0 0 1 20 10c0 5.2-8 10-8 10Z"/><path d="M7 18h10"/>',
  dental: '<path d="M8 3c-3 0-5 2.3-4 6 .7 2.7 2 3.7 2.5 7.5.3 2.4 1.2 4.5 2.5 4.5 2 0 1.4-5 3-5s1 5 3 5c1.3 0 2.2-2.1 2.5-4.5.5-3.8 1.8-4.8 2.5-7.5 1-3.7-1-6-4-6-1.5 0-2.6.8-4 .8S9.5 3 8 3Z"/>',
  glasses: '<circle cx="7" cy="13" r="4"/><circle cx="17" cy="13" r="4"/><path d="M11 13h2M3 12l1-5M21 12l-1-5"/>',
  heart: '<path d="M12 21S3 15.5 3 9.5A4.5 4.5 0 0 1 11 6.7L12 8l1-1.3a4.5 4.5 0 0 1 8 2.8C21 15.5 12 21 12 21Z"/><path d="M7 12h3l1-2 2 4 1-2h3"/>',
  // —— 收入理财 ——
  salary: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5h8v2M3 12h18M10 12v2h4v-2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.7-1.6-1-3-1-1.7 0-3 .8-3 2s1 1.8 3 2.3 3 1 3 2.3-1.3 2.4-3 2.4c-1.4 0-2.5-.4-3.2-1.2M12 5.5v13"/>',
  chart: '<path d="M4 19V9M10 19V5M16 19v-7M3 21h18"/><path d="m4 6 5-3 5 4 6-5"/>',
  insurance: '<path d="M12 3l7.2 2.7v5c0 4.7-3 8-7.2 10.3C7.8 18.7 4.8 15.4 4.8 10.7v-5L12 3Z"/><path d="m9 11.5 2.2 2.2 3.8-3.9"/>',
  bank: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
  wallet: '<path d="M4 6.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M15 12h5v4h-5a2 2 0 1 1 0-4Z"/>',
  receipt: '<path d="M6.5 3h11v18l-2.2-1.5L13 21l-2.2-1.5L8.5 21l-2-1.5V3Z"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3"/>',
  savings: '<path d="M5 11c0-4 3-6 7-6 2 0 3.8.5 5 1.5L20 6v4c1 1 1 3 0 4l-2 1c-.7 3-3 5-6 5H8l-1-3H4v-5l1-1Z"/><path d="M10 8h4M16 10h.01"/>',
  loan: '<path d="m3 12 4-4 5 3 5-3 4 4-7 7-4-3-2 2-5-6Z"/><path d="m8 8 3-3h4l3 3M10 16l3-3"/>',
  tax: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18"/><path d="M12 6h.01"/>',
  office: '<path d="M5 3h10v18H5zM15 9h4v12h-4M8 7h2M8 11h2M8 15h2M8 19h2"/>',
  subscription: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>',
  // —— 其他 ——
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5.2H5.6a1.1 1.1 0 0 0-1.1 1.1C4.5 8.5 6 10 8 10.2M16 5.2h2.4a1.1 1.1 0 0 1 1.1 1.1C19.5 8.5 18 10 16 10.2"/><path d="M12 13v3.5M9.5 17h5v3.5h-5M8.5 20.5h7"/>',
  other: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'
};

// 每个图标 key 的展示信息：存储令牌(emoji) + 中文名
export const ICON_META = {
  food:      { token: '🍜', label: '三餐' },
  snack:     { token: '🍬', label: '零食' },
  drink:     { token: '🥤', label: '饮品' },
  coffee:    { token: '☕', label: '咖啡' },
  alcohol:   { token: '🍺', label: '酒水' },
  fruit:     { token: '🍎', label: '果蔬' },
  bread:     { token: '🍞', label: '面包' },
  burger:    { token: '🍔', label: '快餐' },
  noodle:    { token: '🍲', label: '面食' },
  icecream:  { token: '🍦', label: '甜品' },
  grocery:   { token: '🛒', label: '买菜' },
  carrot:    { token: '🥕', label: '蔬菜' },
  salad:     { token: '🥗', label: '沙拉' },
  pizza:     { token: '🍕', label: '披萨' },
  chicken:   { token: '🍗', label: '肉类' },
  seafood:   { token: '🦐', label: '海鲜' },
  hotpot:    { token: '🫕', label: '火锅' },
  dumpling:  { token: '🥟', label: '饺子' },
  rice:      { token: '🍚', label: '米饭' },
  milk:      { token: '🥛', label: '牛奶' },
  tea:       { token: '🫖', label: '茶饮' },
  cookie:    { token: '🍪', label: '饼干' },
  juice:     { token: '🧃', label: '果汁' },
  egg:       { token: '🥚', label: '蛋类' },
  fries:     { token: '🍟', label: '薯条' },
  bento:     { token: '🥡', label: '便当' },
  transit:   { token: '🚇', label: '公共交通' },
  car:       { token: '🚗', label: '打车' },
  plane:     { token: '✈️', label: '旅行' },
  lodging:   { token: '🏨', label: '住宿' },
  parcel:    { token: '📦', label: '快递' },
  bike:      { token: '🚲', label: '骑行' },
  train:     { token: '🚆', label: '火车' },
  fuel:      { token: '⛽', label: '加油' },
  parking:   { token: '🅿️', label: '停车' },
  boat:      { token: '⛴️', label: '轮船' },
  shopping:  { token: '🛍️', label: '购物' },
  cosmetic:  { token: '💄', label: '美妆' },
  beauty:    { token: '✂️', label: '美容' },
  clothes:   { token: '👕', label: '服饰' },
  phone:     { token: '📱', label: '数码通讯' },
  shoes:     { token: '👟', label: '鞋帽' },
  handbag:   { token: '👜', label: '箱包' },
  jewelry:   { token: '💍', label: '饰品' },
  laptop:    { token: '💻', label: '电脑' },
  appliance: { token: '🧺', label: '家电' },
  home:      { token: '🏠', label: '居住' },
  utility:   { token: '💡', label: '水电煤' },
  tools:     { token: '🔧', label: '维修' },
  medical:   { token: '💊', label: '医疗' },
  pet:       { token: '🐾', label: '宠物' },
  baby:      { token: '👶', label: '育儿' },
  rent:      { token: '🔑', label: '房租' },
  furniture: { token: '🛋️', label: '家具' },
  cleaning:  { token: '🧹', label: '清洁' },
  garden:    { token: '🌿', label: '花草' },
  learning:  { token: '📚', label: '学习' },
  game:      { token: '🎮', label: '游戏' },
  movie:     { token: '🎬', label: '影音' },
  mic:       { token: '🎤', label: '唱歌' },
  sport:     { token: '⚽', label: '球类运动' },
  fitness:   { token: '🏋️', label: '健身' },
  book:      { token: '📖', label: '书籍' },
  stationery:{ token: '✏️', label: '文具' },
  exam:      { token: '📝', label: '考试' },
  music:     { token: '🎵', label: '音乐' },
  camera:    { token: '📷', label: '摄影' },
  ticket:    { token: '🎫', label: '票务' },
  gift:      { token: '🎁', label: '礼物' },
  redpacket: { token: '🧧', label: '红包' },
  cake:      { token: '🎂', label: '庆祝' },
  family:    { token: '👪', label: '家人' },
  charity:   { token: '🤲', label: '公益' },
  dental:    { token: '🦷', label: '牙科' },
  glasses:   { token: '👓', label: '眼镜' },
  heart:     { token: '❤️', label: '健康' },
  salary:    { token: '💼', label: '工资' },
  coin:      { token: '💰', label: '收入' },
  chart:     { token: '📈', label: '投资' },
  insurance: { token: '🛡️', label: '保险' },
  bank:      { token: '🏦', label: '银行' },
  card:      { token: '💳', label: '卡券' },
  wallet:    { token: '👛', label: '钱包' },
  receipt:   { token: '🧾', label: '报销' },
  savings:   { token: '🐷', label: '储蓄' },
  loan:      { token: '🤝', label: '借贷' },
  tax:       { token: '🏛️', label: '税费' },
  office:    { token: '🏢', label: '办公' },
  subscription: { token: '🔔', label: '订阅' },
  trophy:    { token: '🏆', label: '荣誉' },
  other:     { token: '➕', label: '其他' }
};

// 分组结构：分组标签 + 组内图标 key（顺序即选择器中的展示顺序）
export const ICON_GROUPS = [
  { id: 'food',      short: '食', label: '餐饮美食', keys: ['food', 'noodle', 'snack', 'drink', 'coffee', 'alcohol', 'fruit', 'bread', 'burger', 'icecream', 'carrot', 'salad', 'pizza', 'chicken', 'seafood', 'hotpot', 'dumpling', 'rice', 'milk', 'tea', 'cookie', 'juice', 'egg', 'fries', 'bento'] },
  { id: 'shopping',  short: '购', label: '购物消费', keys: ['shopping', 'grocery', 'phone', 'laptop', 'appliance', 'parcel'] },
  { id: 'living',    short: '住', label: '居家生活', keys: ['home', 'rent', 'furniture', 'utility', 'cleaning', 'garden', 'tools'] },
  { id: 'transport', short: '行', label: '交通出行', keys: ['transit', 'train', 'car', 'bike', 'fuel', 'parking', 'plane', 'boat', 'lodging'] },
  { id: 'fun',       short: '乐', label: '休闲娱乐', keys: ['game', 'movie', 'music', 'mic', 'camera', 'ticket', 'sport', 'fitness'] },
  { id: 'edu',       short: '育', label: '学习教育', keys: ['learning', 'book', 'stationery', 'exam'] },
  { id: 'social',    short: '情', label: '人情往来', keys: ['gift', 'redpacket', 'cake', 'family', 'charity'] },
  { id: 'health',    short: '医', label: '健康医疗', keys: ['medical', 'dental', 'glasses', 'heart', 'pet', 'baby'] },
  { id: 'personal',  short: '装', label: '穿搭护理', keys: ['cosmetic', 'beauty', 'clothes', 'shoes', 'handbag', 'jewelry'] },
  { id: 'public',    short: '公', label: '公共服务', keys: ['insurance', 'tax', 'office', 'subscription', 'trophy', 'other'] },
  { id: 'finance',   short: '财', label: '收入理财', keys: ['salary', 'coin', 'chart', 'bank', 'card', 'wallet', 'receipt', 'savings', 'loan'] }
];

// 兼容旧接口的平铺列表（group 顺序展开）
export const CATEGORY_ICON_OPTIONS = ICON_GROUPS.flatMap(group =>
  group.keys.map(key => ({ key, token: ICON_META[key].token, label: ICON_META[key].label }))
);

const TOKEN_TO_KEY = new Map(CATEGORY_ICON_OPTIONS.map(option => [option.token, option.key]));
[
  ['🍱', 'food'], ['🚗', 'transit'], ['🛒', 'shopping'], ['☕', 'drink'], ['🍷', 'drink'],
  ['💵', 'coin'], ['💎', 'gift'], ['💙', 'other'], ['💚', 'other'], ['💛', 'other'],
  ['🏥', 'medical'], ['🎓', 'learning'], ['🧻', 'cleaning'], ['🎉', 'cake'], ['🧰', 'tools']
].forEach(([token, key]) => TOKEN_TO_KEY.set(token, key));

const NAME_RULES = [
  [/咖啡机|饮水机/, 'utility'],
  [/买菜|超市|菜场|杂货/, 'grocery'],
  [/蔬菜|青菜|胡萝卜/, 'carrot'],
  [/沙拉|轻食/, 'salad'],
  [/披萨/, 'pizza'],
  [/鸡肉|鸡腿|肉类/, 'chicken'],
  [/海鲜|虾|螃蟹/, 'seafood'],
  [/火锅/, 'hotpot'],
  [/饺子|馄饨/, 'dumpling'],
  [/米饭|便当|盒饭/, 'bento'],
  [/牛奶|乳品/, 'milk'],
  [/茶饮|茶叶/, 'tea'],
  [/饼干|曲奇/, 'cookie'],
  [/果汁/, 'juice'],
  [/鸡蛋|蛋类/, 'egg'],
  [/薯条/, 'fries'],
  [/面包|烘焙/, 'bread'],
  [/汉堡|快餐/, 'burger'],
  [/面食|面条|粉面/, 'noodle'],
  [/甜品|冰淇淋/, 'icecream'],
  [/餐|食|饭|早餐|午餐|晚餐|外卖/, 'food'],
  [/咖啡|奶茶|星巴克/, 'coffee'],
  [/啤酒|白酒|红酒|洋酒|酒吧|酒/, 'alcohol'],
  [/零食|糖|小吃|薯片/, 'snack'],
  [/水果|果蔬|生鲜|菜市场/, 'fruit'],
  [/饮|茶|水/, 'drink'],
  [/滴滴|网约车|出租|打车/, 'car'],
  [/加油|油费|汽油|充电桩/, 'fuel'],
  [/停车|停车费|车位/, 'parking'],
  [/骑行|单车|自行车|共享单车/, 'bike'],
  [/火车|高铁|动车|铁路/, 'train'],
  [/轮船|渡轮|游轮|船票/, 'boat'],
  [/洗车|养车/, 'car'],
  [/交通|地铁|公交|车费|车票|汽车|电动车/, 'transit'],
  [/机票|航班/, 'plane'],
  [/旅行|旅游|出游|景点/, 'plane'],
  [/酒店|民宿|宾馆|住宿/, 'lodging'],
  [/快递|包裹|物流|邮费|邮政/, 'parcel'],
  [/化妆品|美妆|口红|护肤|精华|面膜/, 'cosmetic'],
  [/美容|理发|美甲|美发/, 'beauty'],
  [/鞋|鞋帽|袜子/, 'shoes'],
  [/箱包|包包|皮包/, 'handbag'],
  [/首饰|珠宝|戒指|饰品/, 'jewelry'],
  [/衣服|服饰|裤子|裙子|帽子|西装|童装/, 'clothes'],
  [/话费|通讯|宽带|流量/, 'phone'],
  [/电脑|笔记本/, 'laptop'],
  [/家电|洗衣机|冰箱|空调/, 'appliance'],
  [/摄影|相机|拍照/, 'camera'],
  [/数码|手机|耳机|电子设备/, 'phone'],
  [/房租|租金|租房/, 'rent'],
  [/家具|沙发|家居/, 'furniture'],
  [/清洁|保洁|洗衣|日用|纸巾/, 'cleaning'],
  [/花草|园艺|绿植/, 'garden'],
  [/房|住|物业|家/, 'home'],
  [/水电|燃气|缴费|电费|水费|煤气|暖气/, 'utility'],
  [/维修|修理|五金|工具/, 'tools'],
  [/牙科|牙医|牙齿/, 'dental'],
  [/眼镜|配镜/, 'glasses'],
  [/医|药|健康|医院|看病|体检|疫苗/, 'medical'],
  [/宠物|猫粮|狗粮|萌宠|猫|狗/, 'pet'],
  [/宝宝|婴儿|育儿|奶粉|尿布|母婴/, 'baby'],
  [/书籍|图书/, 'book'],
  [/文具|铅笔|纸笔/, 'stationery'],
  [/考试|考证/, 'exam'],
  [/学|课程|培训|教育|学费/, 'learning'],
  [/游戏|网游|充值|装备/, 'game'],
  [/音乐|歌曲/, 'music'],
  [/票务|门票|演出票/, 'ticket'],
  [/电影|影音|会员|视频|演出/, 'movie'],
  [/唱歌|KTV|ktv|麦克风/, 'mic'],
  [/篮球|足球|羽毛球|乒乓球|网球|排球|球类/, 'sport'],
  [/健身|运动|瑜伽|游泳|跑步|健身房/, 'fitness'],
  [/礼|礼品|伴手礼/, 'gift'],
  [/红包|压岁钱|打赏/, 'redpacket'],
  [/生日|蛋糕|聚会|派对|聚餐/, 'cake'],
  [/工资|薪资|薪水|奖金|年终奖/, 'salary'],
  [/兼职|外快|稿费|劳务|报酬/, 'receipt'],
  [/储蓄|存款/, 'savings'],
  [/借贷|贷款|还款/, 'loan'],
  [/税|税费/, 'tax'],
  [/办公|公司|写字楼/, 'office'],
  [/订阅|续费/, 'subscription'],
  [/理财|投资|股票|基金|分红|利息/, 'chart'],
  [/保险|保费|保障/, 'insurance'],
  [/利息|收益|回款/, 'coin'],
  [/礼金|彩礼|份子钱|人情/, 'redpacket'],
  [/红包封面/, 'redpacket'],
  [/奖杯|奖牌|荣誉|成就|徽章/, 'trophy'],
  [/银行/, 'bank'], [/信用|卡/, 'card'], [/钱包|现金/, 'wallet']
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
