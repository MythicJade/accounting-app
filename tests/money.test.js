import test from 'node:test';
import assert from 'node:assert/strict';
test('the fractional cents cannot overflow the maximum safe integer', () => {
  assert.throws(() => toCents('90071992547409.99'), /超出支持范围/);
  assert.equal(toCents('90071992547409.91'), Number.MAX_SAFE_INTEGER);
});
import { toCents, fromCents, assertCents, roundYuan } from '../js/money.js';

test('money is converted to exact integer cents', () => {
  assert.equal(toCents('1,234.56'), 123456);
  assert.equal(toCents('¥0.10'), 10);
  assert.equal(toCents(-12.34), -1234);
  assert.equal(fromCents(123456), 1234.56);
  assert.equal(roundYuan(0.1 + 0.2), 0.3);
});

test('money validation rejects unsafe or over-precise values', () => {
  assert.throws(() => toCents('1.001'), /两位小数/);
  assert.throws(() => toCents('-1', { allowNegative: false }), /不能为负数/);
  assert.throws(() => assertCents(1.5), /整数分/);
});
