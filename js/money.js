// js/money.js — exact money helpers. Persist monetary values as integer cents.

export function toCents(value, { allowNegative = true } = {}) {
  if (value == null || value === '') return 0;

  let normalized;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('金额必须是有限数字');
    normalized = value.toFixed(2);
  } else {
    normalized = String(value)
      .trim()
      .replace(/[¥￥,\s]/g, '');
  }

  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('金额最多保留两位小数');
  }

  const negative = normalized.startsWith('-');
  if (negative && !allowNegative) throw new Error('金额不能为负数');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ''] = unsigned.split('.');
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole) || whole > Math.floor(Number.MAX_SAFE_INTEGER / 100)) {
    throw new Error('金额超出支持范围');
  }
  const fraction = Number(fractionPart.padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  return negative ? -cents : cents;
}

export function fromCents(value) {
  const cents = Number(value || 0);
  if (!Number.isSafeInteger(cents)) throw new Error('金额数据损坏');
  return cents / 100;
}

export function assertCents(value, { positive = false } = {}) {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) throw new Error('金额必须是整数分');
  if (positive && cents <= 0) throw new Error('金额必须大于 0');
  return cents;
}

export function roundYuan(value) {
  return fromCents(toCents(value));
}
