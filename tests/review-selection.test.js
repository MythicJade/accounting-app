import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeType, importParsedData, resolveExcelTypes } from '../js/excel-io.js';
import { safeReturnRoute } from '../js/navigation.js';
import { readableCategoryColor } from '../js/theme.js';
import { summarizeTransactions } from '../js/store.js';

test('Excel types use exact recognized labels, never substring guesses or default expenses', () => {
  for (const raw of ['', null, undefined, '未知类型', '退款', '借入', 'incoming unknown', 'print', 'expense refund', '余额调整']) assert.equal(normalizeType(raw), null);
  for (const raw of ['expense', '支出', '支出（钱流出）', 'OUT']) assert.equal(normalizeType(raw), 'expense');
  for (const raw of [' income ', '收入', '进账', 'in']) assert.equal(normalizeType(raw), 'income');
  for (const raw of ['内部转账', '转账', 'transfer']) assert.equal(normalizeType(raw), 'transfer');
});

test('unresolved Excel rows cannot enter the ledger; explicit decisions rebuild category types', async () => {
  const preview = { parsedRows: [{ rowNumber: 4, type: null, rawType: 'unknown', rawCat: '迁移类别', amountCents: 100 }], totalRows: 1, skipped: 0 };
  await assert.rejects(importParsedData(preview), /需要确认/);
  const unresolved = await resolveExcelTypes(preview, new Map());
  assert.equal(unresolved.needsConfirmation.length, 1);
  const resolved = await resolveExcelTypes(preview, new Map([[4, 'income']]));
  assert.equal(resolved.needsConfirmation.length, 0);
  assert.equal(resolved.parsedRows[0].type, 'income');
  assert.ok(resolved.detectedCategories.some(category => category.type === 'income' && category.name === '迁移类别'));
  const transfer = await resolveExcelTypes(preview, new Map([[4, 'transfer']]));
  assert.equal(transfer.parsedRows[0].rawCat, '');
});

test('return routes reject external and unrelated paths and preserve internal queries', () => {
  for (const route of ['https://example.com', '//example.com', '#/edit/1', '#/not-real', '#/transactions-other']) assert.equal(safeReturnRoute(route), '#/');
  for (const route of ['#/', '#/transactions?mode=search&page=2', '#/stats/category/abc?from=2024-01-01', '#/accounts/bank/transactions?year=2024']) assert.equal(safeReturnRoute(route), route);
});

test('category color is stable and gains contrast on a dark surface', () => {
  assert.equal(readableCategoryColor('#374151', false), '#374151');
  assert.notEqual(readableCategoryColor('#374151', true), '#374151');
  assert.equal(readableCategoryColor('#374151', true), readableCategoryColor('#374151', true));
  assert.match(readableCategoryColor('bad', false), /^#[0-9a-f]{6}$/);
});

test('actual total joins a future record on its date without rewriting its data', () => {
  const rows = [{ date: '2026-10-05', type: 'expense', amountCents: 101 }, { date: '2026-10-06', type: 'income', amountCents: 50000 }];
  assert.equal(summarizeTransactions(rows, '2026-10-05').balanceCents, -101);
  assert.equal(summarizeTransactions(rows, '2026-10-06').balanceCents, 49899);
});
