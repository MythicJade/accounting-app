// js/db.js — IndexedDB thin wrapper (Promise based)
const DB_NAME = 'accounting-db';
const DB_VERSION = 4;

const STORE_TRANSACTIONS = 'transactions';
const STORE_BUDGETS = 'budgets';
const STORE_CATEGORIES = 'categories';
const STORE_ACCOUNTS = 'accounts';

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let upgradeFromVersion = 0;
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVersion = e.oldVersion;
      upgradeFromVersion = oldVersion;
      if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
        const s = db.createObjectStore(STORE_TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date', { unique: false });
        s.createIndex('type', 'type', { unique: false });
        s.createIndex('categoryId', 'categoryId', { unique: false });
        s.createIndex('accountId', 'accountId', { unique: false });
      } else if (oldVersion < 2) {
        // v2: add accountId index to existing transactions store
        const s = req.transaction.objectStore(STORE_TRANSACTIONS);
        if (!s.indexNames.contains('accountId')) {
          s.createIndex('accountId', 'accountId', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(STORE_BUDGETS)) {
        db.createObjectStore(STORE_BUDGETS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        const s = db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
        s.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ACCOUNTS)) {
        const s = db.createObjectStore(STORE_ACCOUNTS, { keyPath: 'id' });
        s.createIndex('sort', 'sort', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // v3 数据迁移：为现有 accounts 补全 openingBalance 字段
      // 在 onsuccess 中独立事务执行，避免在 versionchange 事务中异步 cursor 失败
      if (upgradeFromVersion < 3) {
        migrateAccountsOpeningBalance(db).catch(err => console.warn('v3 migration skipped:', err));
      }
      if (upgradeFromVersion < 4) {
        migrateAccountsType(db).catch(err => console.warn('v4 migration skipped:', err));
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

// v3 migration: backfill openingBalance:0 on existing accounts (safe, idempotent)
function migrateAccountsOpeningBalance(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACCOUNTS, 'readwrite');
    const store = tx.objectStore(STORE_ACCOUNTS);
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const accounts = getAllReq.result || [];
      const toUpdate = accounts.filter(a => a.openingBalance == null);
      if (toUpdate.length === 0) return; // nothing to do
      for (const a of toUpdate) {
        a.openingBalance = 0;
        store.put(a);
      }
    };
    getAllReq.onerror = () => reject(getAllReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// v4 migration: backfill type:'asset' on existing accounts (区分资金/信用)
function migrateAccountsType(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACCOUNTS, 'readwrite');
    const store = tx.objectStore(STORE_ACCOUNTS);
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const accounts = getAllReq.result || [];
      const toUpdate = accounts.filter(a => !a.type);
      if (toUpdate.length === 0) return;
      for (const a of toUpdate) {
        a.type = 'asset';
        store.put(a);
      }
    };
    getAllReq.onerror = () => reject(getAllReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

export function put(storeName, value) {
  return tx(storeName, 'readwrite').then(store => new Promise((resolve, reject) => {
    const r = store.put(value);
    r.onsuccess = () => resolve(r.result); // returns key
    r.onerror = () => reject(r.error);
  }));
}

export function get(storeName, key) {
  return tx(storeName, 'readonly').then(store => new Promise((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

export function getAll(storeName) {
  return tx(storeName, 'readonly').then(store => new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  }));
}

export function deleteRecord(storeName, key) {
  return tx(storeName, 'readwrite').then(store => new Promise((resolve, reject) => {
    const r = store.delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  }));
}

export function clearStore(storeName) {
  return tx(storeName, 'readwrite').then(store => new Promise((resolve, reject) => {
    const r = store.clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  }));
}

export function count(storeName) {
  return tx(storeName, 'readonly').then(store => new Promise((resolve, reject) => {
    const r = store.count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

// Bulk put many records in a single transaction
export function bulkPut(storeName, items) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    items.forEach(item => store.put(item));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }));
}

export const Stores = {
  TRANSACTIONS: STORE_TRANSACTIONS,
  BUDGETS: STORE_BUDGETS,
  CATEGORIES: STORE_CATEGORIES,
  ACCOUNTS: STORE_ACCOUNTS
};
