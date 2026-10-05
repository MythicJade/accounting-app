import 'fake-indexeddb/auto';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { atomicWrite, Stores, get, getAll } from '../js/db.js';
import * as ledger from '../js/store.js';
import { addAccount, updateAccount } from '../js/accounts.js';
import { addCategory, updateCategory } from '../js/categories.js';

const date = '2026-01-15';
let cash, bank, food, salary;
beforeEach(async () => {
  await ledger.initStore();
  await atomicWrite(Object.values(Stores), stores => Object.values(stores).forEach(store => store.clear()));
  cash = await addAccount({ name: '现金', openingBalance: 100, openingDate: '2026-01-01' });
  bank = await addAccount({ name: '银行卡', openingBalance: 500, openingDate: '2026-01-01' });
  food = await addCategory({ name: '餐饮', type: 'expense' });
  salary = await addCategory({ name: '工资', type: 'income' });
});
const expense = (patch = {}) => ({ type: 'expense', amount: '10.00', date, accountId: cash.id, categoryId: food.id, ...patch });
const clone = value => structuredClone(value);
const legacy = value => { const copy = clone(value); delete copy.checksum; copy.version = 3; copy.schemaVersion = 5; copy.transactions.forEach(t => delete t.uid); return copy; };

test('future transactions stay in history but current balances and actual totals stop at today', async () => {
  await ledger.addTransaction(expense());
  const future = '2099-12-15';
  await ledger.addTransaction({ type: 'income', amount: '500', date: future, accountId: cash.id, categoryId: salary.id });
  await ledger.transferMoney({ fromId: cash.id, toId: bank.id, amount: '40', date: future });
  await addAccount({ name: '未来期初', openingBalance: 99, openingDate: future });
  assert.equal(await ledger.getAccountBalance(cash.id), 90);
  assert.equal((await ledger.getAllAccountBalances()).get(cash.id), 90);
  assert.equal(await ledger.getTotalBalance(), 590);
  assert.equal((await ledger.getAssetsSummary()).netAssets, 590);
  assert.equal(await ledger.getAccountBalance(cash.id, future), 550);
  assert.equal(await ledger.getTotalBalance(future), 1189);
  assert.equal((await ledger.getAllTransactions()).length, 3);
  assert.deepEqual(await ledger.monthlySummary('2099-12'), { income: 0, expense: 0, balance: 0 });
  const page = await ledger.listTransactions({ returnPage: true, limit: 1 });
  assert.equal(page.total, 3);
  assert.equal(page.incomeCents, 0);
  assert.equal(page.days[future].incomeCents, 50000);
});

test('full daily and filter totals are independent of the 50/200 record page boundaries', async () => {
  await ledger.bulkPutTransactions(Array.from({ length: 205 }, () => expense({ amount: '1.01' })));
  await ledger.addTransaction(expense({ accountId: bank.id, amount: '10' }));
  for (const [offset, limit] of [[0, 50], [200, 50], [0, 200]]) {
    const page = await ledger.listTransactions({ accountId: cash.id, categoryId: food.id, returnPage: true, offset, limit });
    assert.equal(page.days[date].expenseCents, 20705);
    assert.equal(page.expenseCents, 20705);
    assert.equal(page.total, 205);
  }
  assert.equal((await ledger.listTransactions({ amountMinCents: 101, amountMaxCents: 101, limit: 200, returnPage: true })).total, 205);
  assert.equal((await ledger.listTransactions({ amountMinCents: 1000, amountMaxCents: 1000, limit: 200 })).length, 1);
  assert.deepEqual(await ledger.listTransactions({ dateFrom: '2026-02-01', dateTo: '2026-01-01' }), []);
});

test('editing a hydrated transaction changes cents, type and balances', async () => {
  const id = await ledger.addTransaction(expense());
  const uid = (await ledger.getTransaction(id)).uid;
  await ledger.updateTransaction(id, { amount: '25.37' });
  assert.equal((await ledger.getTransaction(id)).amountCents, 2537);
  assert.equal((await ledger.getTransaction(id)).uid, uid);
  assert.equal(await ledger.getAccountBalance(cash.id), 74.63);
  await ledger.updateTransaction(id, { type: 'income', categoryId: salary.id, amount: '99.99', accountId: bank.id });
  assert.equal(await ledger.getAccountBalance(cash.id), 100);
  assert.equal(await ledger.getAccountBalance(bank.id), 599.99);
  await ledger.deleteTransaction(id);
  assert.equal(await ledger.getAccountBalance(bank.id), 500);
});

test('transfer/edit/delete preserves net assets and never counts as income or expense', async () => {
  const id = await ledger.transferMoney({ fromId: cash.id, toId: bank.id, amount: '12.34', date });
  await ledger.updateTransaction(id, { amount: '27.01' });
  assert.equal(await ledger.getAccountBalance(cash.id), 72.99);
  assert.equal(await ledger.getAccountBalance(bank.id), 527.01);
  assert.equal((await ledger.getAssetsSummary()).netAssets, 600);
  assert.deepEqual(await ledger.sumByType('2026-01-01', '2026-01-31'), { income: 0, expense: 0, balance: 0 });
  await ledger.deleteTransaction(id);
  assert.equal((await ledger.getAssetsSummary()).netAssets, 600);
});

test('invalid category or target leaves zero-opening account date unchanged', async () => {
  const zero = await addAccount({ name: '空账户', openingDate: '2026-02-01' });
  await assert.rejects(ledger.addTransaction(expense({ accountId: zero.id, categoryId: 'missing' })), /分类/);
  assert.equal((await get(Stores.ACCOUNTS, zero.id)).openingDate, '2026-02-01');
  await assert.rejects(ledger.addTransaction({ type: 'transfer', accountId: zero.id, toAccountId: 'missing', date, amount: '1' }), /目标账户/);
  assert.equal((await get(Stores.ACCOUNTS, zero.id)).openingDate, '2026-02-01');
  await ledger.bulkPutTransactions([expense({ accountId: zero.id, date: '2026-01-01' }), expense({ accountId: zero.id, date: '2026-01-20' })]);
  assert.equal((await get(Stores.ACCOUNTS, zero.id)).openingDate, '2026-01-01');
  assert.equal(await ledger.getAccountBalance(zero.id), -20);
});

test('full restore preserves identical genuine expenses, ids, opening balances and budgets', async () => {
  await ledger.addTransaction(expense({ createdAt: 1768478400000 }));
  await ledger.addTransaction(expense({ createdAt: 1768478400000 }));
  await ledger.setBudget('2026-01', '1300.50');
  const original = await ledger.exportAll();
  const result = await ledger.importAll(original, 'replace');
  assert.equal(result.imported, 2);
  assert.equal(result.skippedDuplicates, 0);
  const restored = await ledger.exportAll();
  assert.deepEqual(restored.transactions, original.transactions);
  assert.equal((await ledger.getBudget('2026-01')).limit, 1300.50);
  assert.equal(await ledger.getAccountBalance(cash.id), 80);
  const again = await ledger.importAll(original, 'merge');
  assert.equal(again.imported, 0);
  assert.equal(again.skippedDuplicates, 2);
});

test('legacy backup multiset merge preserves twin expenses and is idempotent', async () => {
  await ledger.addTransaction(expense({ createdAt: 1768478400000 }));
  await ledger.addTransaction(expense({ createdAt: 1768478400000 }));
  const original = legacy(await ledger.exportAll());
  await ledger.importAll(original, 'replace');
  assert.equal(await ledger.countTransactions(), 2);
  const again = await ledger.importAll(original, 'merge');
  assert.equal(again.imported, 0);
  assert.equal(again.skippedDuplicates, 2);
});

test('same-looking new uid is new; conflicting same uid aborts merge without data loss', async () => {
  const id = await ledger.addTransaction(expense());
  const original = await ledger.exportAll();
  await ledger.updateTransaction(id, { amount: '15.00' });
  await assert.rejects(ledger.importAll(original, 'merge'), /内容不同/);
  assert.equal((await ledger.getTransaction(id)).amount, 15);
  assert.equal(await ledger.countTransactions(), 1);
  const next = legacy(original);
  next.transactions[0].uid = 'tx-another-genuine-event';
  await ledger.importAll(next, 'merge');
  assert.equal(await ledger.countTransactions(), 2);
});

test('corrupt checksum, negative budget, missing reference, duplicate ids and future schema are rejected', async () => {
  await ledger.addTransaction(expense());
  const original = await ledger.exportAll();
  const corrupt = clone(original); corrupt.transactions[0].amountCents++;
  await assert.rejects(ledger.importAll(corrupt, 'replace'), /校验/);
  const negative = legacy(original); negative.budgets = [{ key: '2026-01', limitCents: -100 }];
  await assert.rejects(ledger.importAll(negative, 'replace'), /负数/);
  const missing = legacy(original); missing.transactions[0].accountId = 'missing';
  await assert.rejects(ledger.importAll(missing, 'replace'), /来源账户/);
  const duplicates = legacy(original); duplicates.transactions.push(clone(duplicates.transactions[0]));
  await assert.rejects(ledger.importAll(duplicates, 'replace'), /标识重复/);
  const future = clone(original); future.version = 99;
  await assert.rejects(ledger.importAll(future, 'replace'), /版本/);
  assert.deepEqual((await ledger.exportAll()).transactions, original.transactions);
});

test('atomic failure rolls back all writes, including a new account', async () => {
  await ledger.addTransaction(expense());
  const record = (await getAll(Stores.TRANSACTIONS))[0];
  await assert.rejects(atomicWrite([Stores.TRANSACTIONS, Stores.ACCOUNTS], stores => {
    stores[Stores.ACCOUNTS].put({ id: 'must-not-exist', name: 'rollback' });
    const duplicate = { ...record }; delete duplicate.id;
    stores[Stores.TRANSACTIONS].put(duplicate);
  }));
  assert.equal(await get(Stores.ACCOUNTS, 'must-not-exist'), undefined);
  assert.equal(await ledger.countTransactions(), 1);
});

test('recovery restores deletion and saves the pre-restore ledger, retaining at most three points', async () => {
  const id = await ledger.addTransaction(expense());
  await ledger.deleteTransaction(id);
  const points = await ledger.listRecoveryPoints();
  const beforeDelete = points.find(point => point.reason === '删除流水前');
  assert.equal(beforeDelete.transactions, 1);
  await ledger.restoreRecoveryPoint(beforeDelete.id);
  assert.equal(await ledger.countTransactions(), 1);
  await ledger.createRecoveryPoint('第四个点');
  assert.equal((await ledger.listRecoveryPoints()).length, 3);
});

test('archived references can be edited but not used for new transactions', async () => {
  const id = await ledger.addTransaction(expense());
  await updateAccount(cash.id, { archived: true });
  await updateCategory(food.id, { archived: true });
  await ledger.updateTransaction(id, { amount: '12.30' });
  await assert.rejects(ledger.addTransaction(expense()), /归档/);
  assert.equal((await ledger.getTransaction(id)).amount, 12.3);
});

test('table import preserves identical rows but skips repeat import by multiplicity and time', async () => {
  const row = { type: 'expense', amount: '5.00', date, time: '18:30', rawFrom: '现金', rawCat: '餐饮' };
  await ledger.importExternalRows([row, row, { ...row, time: '19:30' }]);
  assert.equal(await ledger.countTransactions(), 3);
  await assert.rejects(ledger.importExternalRows([row, row, { ...row, time: '19:30' }]), /没有可导入/);
  assert.equal(await ledger.countTransactions(), 3);
  await assert.rejects(ledger.importExternalRows([{ ...row, amount: '8' }, { ...row, date: 'bad' }]), /未写入/);
  assert.equal(await ledger.countTransactions(), 3);
});

test('table import cannot silently pick an account or move a nonzero opening date', async () => {
  const row = { type: 'expense', amount: '5.00', date: '2025-12-31', rawFrom: '现金', rawCat: '餐饮' };
  await assert.rejects(ledger.importExternalRows([row]), /期初日期/);
  await assert.rejects(ledger.importExternalRows([{ ...row, date, rawFrom: '' }]), /账户或分类缺失/);
  assert.equal(await ledger.countTransactions(), 0);
  assert.equal((await get(Stores.ACCOUNTS, cash.id)).openingDate, '2026-01-01');
  assert.equal(await ledger.getAccountBalance(cash.id), 100);
});

test('backup merge preflight catches conflicting opening balances and never changes the ledger', async () => {
  await ledger.addTransaction(expense());
  const original = await ledger.exportAll();
  await updateAccount(cash.id, { openingBalance: '200' });
  const preview = await ledger.previewBackupImport(original);
  assert.equal(preview.conflictCount, 1);
  await assert.rejects(ledger.importAll(original, 'merge'), /期初余额/);
  assert.equal(await ledger.getAccountBalance(cash.id), 190);
});

test('indexed recent 200 and annual trend are correct with ten thousand entries', async () => {
  const base = expense();
  await atomicWrite([Stores.TRANSACTIONS], stores => {
    for (let i = 0; i < 10000; i++) stores[Stores.TRANSACTIONS].put({ ...base, uid: 'scale-' + i, amountCents: 1, createdAt: 1768478400000 + i });
  });
  const recent = await ledger.listTransactions({ limit: 200 });
  assert.equal(recent.length, 200);
  assert.equal(recent[0].uid, 'scale-9999');
  assert.equal(recent[199].uid, 'scale-9800');
  const trend = await ledger.monthlyAssetTrend(2026);
  assert.equal(trend[0].netAssets, 500);
});
