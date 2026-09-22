import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDB, getAll, get, Stores } from '../js/db.js';

test('upgrade from v2.4.1 schema v5 preserves legacy records and assigns stable unique identities', async () => {
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('accounting-db', 5);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
      for (const name of ['date','type','accountId','toAccountId','categoryId']) tx.createIndex(name, name);
      db.createObjectStore('accounts', { keyPath: 'id' });
      db.createObjectStore('categories', { keyPath: 'id' });
      db.createObjectStore('budgets', { keyPath: 'key' });
      const meta = db.createObjectStore('meta', { keyPath: 'key' });
      meta.put({ key: 'schemaVersion', value: 5 });
      for (let id = 1; id <= 2; id++) tx.put({ id, type: 'expense', amountCents: 1010, date: '2026-01-01', createdAt: 1000, accountId: 'cash', categoryId: 'food' });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  await openDB();
  const rows = await getAll(Stores.TRANSACTIONS);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.amountCents), [1010, 1010]);
  assert.equal(new Set(rows.map(row => row.uid)).size, 2);
  assert.equal((await get(Stores.META, 'schemaVersion')).value, 6);
  assert.deepEqual((await getAll(Stores.TRANSACTIONS)).map(row => row.uid), rows.map(row => row.uid));
});
