// js/format.js — formatting helpers (Chinese)
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function formatMoney(n, withSign = false) {
  if (n == null || isNaN(n)) n = 0;
  const abs = Math.abs(n);
  let s = abs.toFixed(2);
  // group thousands
  const parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  s = parts.join('.');
  if (withSign) {
    const sign = n < 0 ? '-' : '+';
    return sign + '¥' + s;
  }
  return '¥' + s;
}

export function formatMoneyPlain(n) {
  if (n == null || isNaN(n)) n = 0;
  return n.toFixed(2);
}

export function parseMoney(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// YYYY-MM-DD
export function todayStr() {
  const d = new Date();
  return formatDateStr(d);
}

export function formatDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// current month 'YYYY-MM'
export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthKeyFromDateStr(dateStr) {
  if (!dateStr) return '';
  return dateStr.slice(0, 7);
}

export function monthKeyToLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

// friendly date: '今天' '昨天' '周X' 'M月D日'
export function friendlyDate(dateStr) {
  if (!dateStr) return '';
  const today = new Date();
  const d = new Date(dateStr + 'T00:00:00');
  const todayStr_ = formatDateStr(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = formatDateStr(yesterday);
  if (dateStr === todayStr_) return '今天';
  if (dateStr === yStr) return '昨天';
  const diff = (today.setHours(0,0,0,0) - new Date(dateStr + 'T00:00:00').getTime()) / 86400000;
  if (diff > 0 && diff < 7) return '周' + WEEK_DAYS[d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// 日期 + 星期：用于首页按日分组的日期头，如 "今天 周一" / "1月15日 周三"
export function dateWithWeekday(dateStr) {
  if (!dateStr) return '';
  const today = new Date();
  const todayStr_ = formatDateStr(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = formatDateStr(yesterday);
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = '周' + WEEK_DAYS[d.getDay()];
  if (dateStr === todayStr_) return '今天 ' + weekday;
  if (dateStr === yStr) return '昨天 ' + weekday;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekday}`;
}

export function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// Get range of dates for given period
export function getRange(period, ref = new Date()) {
  // period: 'day' | 'week' | 'month' | 'year' | 'custom'
  // For 'custom' use getCustomRange(startStr, endStr) instead
  const start = new Date(ref);
  let end = new Date(ref);
  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'week') {
    const day = (start.getDay() + 6) % 7; // Monday=0
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (period === 'custom') {
    // caller should use getCustomRange
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }
  return {
    start: formatDateStr(start),
    end: formatDateStr(end),
    startDate: start,
    endDate: end
  };
}

// Build a custom date range from user input
export function getCustomRange(startStr, endStr) {
  if (!startStr || !endStr) return null;
  // ensure start <= end
  let s = startStr, e = endStr;
  if (s > e) { const tmp = s; s = e; e = tmp; }
  const startDate = new Date(s + 'T00:00:00');
  const endDate = new Date(e + 'T23:59:59.999');
  return { start: s, end: e, startDate, endDate, isCustom: true };
}

// shift range by N periods (positive = forward, negative = back)
export function shiftRange(range, period, delta) {
  if (period === 'custom') return range; // no shift for custom
  const start = new Date(range.startDate);
  if (period === 'day') start.setDate(start.getDate() + delta);
  else if (period === 'week') start.setDate(start.getDate() + 7 * delta);
  else if (period === 'month') start.setMonth(start.getMonth() + delta);
  else if (period === 'year') start.setFullYear(start.getFullYear() + delta);
  return getRange(period, start);
}

export function rangeLabel(range, period) {
  const s = range.start;
  const e = range.end;
  if (period === 'day') return friendlyDate(s);
  if (period === 'week') return `${s.slice(5)} ~ ${e.slice(5)}`;
  if (period === 'month') return monthKeyToLabel(s.slice(0, 7));
  if (period === 'year') return s.slice(0, 4) + '年';
  if (period === 'custom') return `${s} ~ ${e}`;
  return s;
}

// list dates in range (inclusive)
export function listDates(startStr, endStr) {
  const result = [];
  const d = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (d <= end) {
    result.push(formatDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return result;
}
