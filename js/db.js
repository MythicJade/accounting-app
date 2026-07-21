// js/db.js — IndexedDB thin wrapper (Promise based)
const DB_NAME = 'accounting-db';
const DB_VERSION = 3;

const STORE_TRANSACTIONS = 'transactions';
const STORE_BUDGETS = 'budgets';
const STORE_CATEGORIES = 'categories';
const STORE_ACCOUNTS = 'accounts';

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVersion = e.oldVersion;
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
      // v3: ensure all existing accounts have an openingBalance field
      if (oldVersion < 3 && db.objectStoreNames.contains(STORE_ACCOUNTS)) {
        const s = req.transaction.objectStore(STORE_ACCOUNTS);
        const cur = s.openCursor();
        cur.onsuccess = (e) => {
          const c = e.target.result;
          if (c) {
            const v = c.value;
            if (v && v.openingBalance == null) {
              v.openingBalance = 0;
              c.update(v);
            }
            c.continue();
          }
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
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
