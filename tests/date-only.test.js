import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalDate, isValidDateOnly, monthRange, normalizeDateOnly, timestampForDateAndTime } from '../js/date-only.js';

test('calendar dates stay local instead of shifting through UTC', () => {
  const localMidnight = new Date(2026, 7, 23, 0, 5);
  assert.equal(formatLocalDate(localMidnight), '2026-08-23');
  assert.equal(new Date(timestampForDateAndTime('2026-08-23', '00:05')).getDate(), 23);
});

test('date-only validation and month boundaries are exact', () => {
  assert.equal(isValidDateOnly('2024-02-29'), true);
  assert.equal(isValidDateOnly('2023-02-29'), false);
  assert.deepEqual(monthRange('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
  assert.equal(normalizeDateOnly('2026/8/3'), '2026-08-03');
  assert.equal(normalizeDateOnly(45292, { excelSerial: true }), '2024-01-01');
});
