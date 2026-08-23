// js/db.js — IndexedDB wrapper and schema migrations.
import { toCents } from './money.js';
import { timestampToDateOnly, todayDateOnly } from './date-only.js';

const DB_NAME = 'accounting-db';
const DB_VERSION = 5;

const STORE_TRANSACTIONS = 'transactions';
const STORE_BUDGETS = 'budgets';
const STORE_CATEGORIES = 'categories';
const STORE_ACCOUNTS = 'accounts';
const STORE_META = 'meta';

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
        const store = db.createObjectStore(STORE_TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('categoryId', 'categoryId', { unique: false });
        store.createIndex('accountId', 'accountId', { unique: false });
        store.createIndex('toAccountId', 'toAccountId', { unique: false });
      } else {
        const store = transaction.objectStore(STORE_TRANSACTIONS);
        if (!store.indexNames.contains('accountId')) store.createIndex('accountId', 'accountId', { unique: false });
        if (!store.indexNames.contains('toAccountId')) store.createIndex('toAccountId', 'toAccountId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BUDGETS)) db.createObjectStore(STORE_BUDGETS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        const store = db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ACCOUNTS)) {
        const store = db.createObjectStore(STORE_ACCOUNTS, { keyPath: 'id' });
        store.createIndex('sort', 'sort', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
      event.target.transaction.onerror = () => reject(event.target.transaction.error);
    };
    request.onsuccess = async () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      try {
        await migrateToV5(db);
        resolve(db);
      } catch (error) {
        db.close();
        _dbPromise = null;
        reject(error);
      }
    };
    request.onblocked = () => reject(new Error('数据库升级被其他页面阻止，请关闭旧页面后重试'));
    request.onerror = () => {
      _dbPromise = null;
      reject(request.error);
    };
  });
  return _dbPromise;
}

async function migrateToV5(db) {
  const meta = await readOneFromDb(db, STORE_META, 'schemaVersion');
  if (Number(meta?.value || 0) >= 5) return;

  await migrateCursor(db, STORE_TRANSACTIONS, (record) => {
    if (!Number.isSafeInteger(record.amountCents)) record.amountCents = toCents(record.amount || 0);
    delete record.amount;
    record.categoryId = record.categoryId || null;
    record.accountId = record.accountId || null;
    record.toAccountId = record.toAccountId || null;
    return record;
  });

  await migrateCursor(db, STORE_BUDGETS, (record) => {
    if (!Number.isSafeInteger(record.limitCents)) record.limitCents = toCents(record.limit || 0, { allowNegative: false });
    delete record.limit;
    return record;
  });

  const transactions = await readAllFromDb(db, STORE_TRANSACTIONS);
  const earliestByAccount = new Map();
  for (const transaction of transactions) {
    for (const accountId of [transaction.accountId, transaction.toAccountId]) {
      if (!accountId || !transaction.date) continue;
      const current = earliestByAccount.get(accountId);
      if (!current || transaction.date < current) earliestByAccount.set(accountId, transaction.date);
    }
  }

  await migrateCursor(db, STORE_ACCOUNTS, (record) => {
    if (!Number.isSafeInteger(record.openingBalanceCents)) {
      record.openingBalanceCents = toCents(record.openingBalance || 0);
    }
    delete record.openingBalance;
    record.type = record.type === 'credit' ? 'credit' : 'asset';
    record.archived = Boolean(record.archived);
    record.openingDate = record.openingDate || earliestByAccount.get(record.id) ||
      (record.createdAt ? timestampToDateOnly(record.createdAt, todayDateOnly()) : todayDateOnly());
    return record;
  });

  await migrateCursor(db, STORE_CATEGORIES, (record) => {
    record.archived = Boolean(record.archived);
    return record;
  });

  await writeOneToDb(db, STORE_META, { key: 'schemaVersion', value: 5, migratedAt: Date.now() });
}

function migrateCursor(db, storeName, transform) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      try {
        cursor.update(transform({ ...cursor.value }));
        cursor.continue();
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('数据库迁移已中止'));
  });
}

function readAllFromDb(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function readOneFromDb(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeOneToDb(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('数据库写入已中止'));
  });
}

function objectStore(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

export function put(storeName, value) {
  return objectStore(storeName, 'readwrite').then(store => requestPromise(store.put(value)));
}

export function get(storeName, key) {
  return objectStore(storeName, 'readonly').then(store => requestPromise(store.get(key)));
}

export function getAll(storeName) {
  return objectStore(storeName, 'readonly').then(store => requestPromise(store.getAll()).then(result => result || []));
}

export function getAllByIndex(storeName, indexName, range = null) {
  return objectStore(storeName, 'readonly').then(store => requestPromise(store.index(indexName).getAll(range)).then(result => result || []));
}

export function deleteRecord(storeName, key) {
  return objectStore(storeName, 'readwrite').then(store => requestPromise(store.delete(key)).then(() => undefined));
}

export function clearStore(storeName) {
  return objectStore(storeName, 'readwrite').then(store => requestPromise(store.clear()).then(() => undefined));
}

export function count(storeName) {
  return objectStore(storeName, 'readonly').then(store => requestPromise(store.count()));
}

export function bulkPut(storeName, items) {
  return atomicWrite([storeName], (stores) => {
    for (const item of items) stores[storeName].put(item);
  });
}

// The callback synchronously enqueues requests. The promise resolves only after
// every store commits, or rejects after the whole transaction rolls back.
export async function atomicWrite(storeNames, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, 'readwrite');
    const stores = Object.fromEntries(storeNames.map(name => [name, transaction.objectStore(name)]));
    let result;
    try {
      result = callback(stores, transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('数据库事务已回滚'));
  });
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const Stores = {
  TRANSACTIONS: STORE_TRANSACTIONS,
  BUDGETS: STORE_BUDGETS,
  CATEGORIES: STORE_CATEGORIES,
  ACCOUNTS: STORE_ACCOUNTS,
  META: STORE_META
};
