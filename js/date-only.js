// js/date-only.js — calendar-date helpers that never round-trip through UTC.

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatLocalDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('日期无效');
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayDateOnly() {
  return formatLocalDate(new Date());
}

export function isValidDateOnly(value) {
  const match = DATE_ONLY_RE.exec(String(value || ''));
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function assertDateOnly(value) {
  const result = String(value || '');
  if (!isValidDateOnly(result)) throw new Error('日期格式无效');
  return result;
}

export function normalizeDateOnly(value, { excelSerial = false } = {}) {
  if (value instanceof Date) return formatLocalDate(value);
  if (typeof value === 'number' && excelSerial) {
    if (!Number.isFinite(value)) throw new Error('Excel 日期无效');
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return [utc.getUTCFullYear(), String(utc.getUTCMonth() + 1).padStart(2, '0'), String(utc.getUTCDate()).padStart(2, '0')].join('-');
  }

  const text = String(value || '').trim();
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s|$)/.exec(text);
  if (!match) throw new Error(`无法识别日期：${text || '空值'}`);
  const normalized = `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
  return assertDateOnly(normalized);
}

export function monthRange(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!match) throw new Error('月份格式无效');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('月份格式无效');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${match[1]}-${match[2]}-01`,
    end: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`
  };
}

export function timestampToDateOnly(timestamp, fallback = '1970-01-01') {
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.getTime()) ? fallback : formatLocalDate(date);
}

export function timestampForDateAndTime(dateOnly, time = '12:00') {
  assertDateOnly(dateOnly);
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(String(time || '')) ? String(time) : '12:00';
  const [hour, minute] = normalizedTime.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('时间格式无效');
  const date = new Date(`${dateOnly}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
  if (Number.isNaN(date.getTime())) throw new Error('日期时间无效');
  return date.getTime();
}
