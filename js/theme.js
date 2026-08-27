// js/theme.js — v2.2.0 主题系统：四套配色（鎏金暖阳 / 青屿 / 靛夜星辉 / 暗夜模式）
// - 通过 <html data-theme="..."> 切换 CSS 变量主题
// - localStorage 持久化用户选择
// - 提供每套主题的「分类统一调色板」：饼图/排行按金额排名取色，根治颜色杂乱

const THEME_STORAGE_KEY = 'app-theme';

export const THEMES = [
  { key: 'gold',   name: '鎏金暖阳', g1: '#FFCC4D', g2: '#EF9E07', inc: '#1FA97A', exp: '#E2574C', chart: '#D98F06' },
  { key: 'teal',   name: '青屿',     g1: '#35CFD8', g2: '#0F94A4', inc: '#21B573', exp: '#EF584D', chart: '#0E93A6' },
  { key: 'indigo', name: '靛夜星辉', g1: '#7C8CFF', g2: '#4763F0', inc: '#00B188', exp: '#FF675A', chart: '#5568F5' },
  { key: 'dark',   name: '暗夜模式', g1: '#FFCB4F', g2: '#2C3348', inc: '#34D399', exp: '#FF8577', chart: '#F0B429' }
];

const VALID_KEYS = new Set(THEMES.map(t => t.key));

/* 每套主题的分类统一调色板（12 色，明度/饱和度已按主题调和）。
   饼图切片与排行条目按「金额排名」依序取用 —— 相邻扇区恒为不同色相，
   同一周期内分类的颜色稳定，不再受用户随手选色影响而显得杂乱。 */
const PALETTES = {
  gold: [
    '#E08A06', '#2E9E8F', '#DD5B4F', '#5871E4', '#B76ACF', '#2FA3B8',
    '#94A83C', '#E2707F', '#7E57C2', '#C77C86', '#418FB5', '#CE7226'
  ],
  teal: [
    '#149FB0', '#21B573', '#EF584D', '#5B6BE8', '#9C6ADE', '#F0A63A',
    '#E15A67', '#3B82F6', '#8FB63C', '#00A99A', '#C86EBB', '#7FA045'
  ],
  indigo: [
    '#5568F5', '#00B188', '#FF675A', '#F2B33D', '#9C6ADE', '#0BA5EC',
    '#66BB6A', '#EC6B9D', '#7986CB', '#26A69A', '#FFA726', '#8E6FE0'
  ],
  dark: [
    '#FFC94A', '#4DD8C0', '#FF7A6E', '#82A4FF', '#CE93D8', '#5FD4F4',
    '#AED581', '#F48FB1', '#B39DDB', '#4DB6AC', '#FFD54F', '#90CAF9'
  ]
};

function normalizeThemeKey(key) {
  return VALID_KEYS.has(key) ? key : 'gold';
}

export function getThemeKey() {
  const attr = document.documentElement.getAttribute('data-theme');
  return normalizeThemeKey(attr);
}

function applyTheme(key) {
  const k = normalizeThemeKey(key);
  document.documentElement.setAttribute('data-theme', k);
  document.documentElement.style.colorScheme = (k === 'dark') ? 'dark' : 'light';
  // 同步浏览器地址栏/状态栏颜色
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', k === 'dark' ? '#12141B' : getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#F6F3EC');
}

export function setThemeKey(key) {
  const k = normalizeThemeKey(key);
  try { localStorage.setItem(THEME_STORAGE_KEY, k); } catch (e) { /* 隐私模式下忽略 */ }
  applyTheme(k);
  return k;
}

/** 应用启动时调用：恢复上次选择的主题（无记录时回落到默认鎏金暖阳） */
export function applySavedTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { /* ignore */ }
  if (!saved) saved = document.documentElement.getAttribute('data-theme');
  applyTheme(saved || 'gold');
}

/** 当前主题的元信息 */
export function currentThemeMeta() {
  const k = getThemeKey();
  return THEMES.find(t => t.key === k) || THEMES[0];
}

/** 分类统一调色板：随主题切换 */
export function themePalette() {
  return PALETTES[getThemeKey()] || PALETTES.gold;
}

/**
 * 读取根节点 CSS 变量的现值（供 Canvas 图表使用）。
 * 主题切换后再次绘制会自动拿到新值。
 */
export function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
