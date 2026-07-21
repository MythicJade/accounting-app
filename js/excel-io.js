// js/excel-io.js — Excel(.xlsx) 导入导出，兼容其他记账软件格式
// 列定义（按用户提供的格式）：
//   记账日期 | 记账时间（可不填） | 分类（转账无需填写分类） | 记账类型 | 金额（勿填正负号、0） | 流出账户 | 流入账户 | 备注
import { listAccounts, addAccount } from './accounts.js';
import { listCategories } from './categories.js';
import { addTransaction, bulkPutTransactions, getAllTransactions } from './store.js';
import { Stores } from './db.js';
import { openDB } from './db.js';
import { todayStr } from './format.js';

const HEADERS = [
  '记账日期',
  '记账时间（可不填）',
  '分类（转账无需填写分类）',
  '记账类型',
  '金额（勿填正负号、0）',
  '流出账户',
  '流入账户',
  '备注'
];

// 类型标准化映射：其他记账软件可能用不同写法
const TYPE_KEYWORDS = {
  expense: ['支出', '支出(钱流出)', '钱流出', '花费', '消费', 'expense', 'out'],
  income:  ['收入', '收入(钱流入)', '钱流入', '进账', 'income', 'in'],
  transfer: ['转账', '内部转账', 'transfer', 'move']
};

function normalizeType(raw) {
  if (!raw) return 'expense';
  const s = String(raw).trim().toLowerCase();
  for (const [type, keys] of Object.entries(TYPE_KEYWORDS)) {
    if (keys.some(k => s.includes(k.toLowerCase()))) return type;
  }
  // 默认：含"支"或"出"算支出，含"收"或"入"且不含"转"算收入
  if (s.includes('支') || s.includes('出')) return 'expense';
  if (s.includes('收') || s.includes('入')) return 'income';
  return 'expense';
}

// 把日期字符串（支持 YYYY-MM-DD / YYYY/MM/DD / YYYY-MM-DD HH:mm / Excel 数字序列号）统一成 YYYY-MM-DD
function normalizeDate(raw) {
  if (raw == null || raw === '') return todayStr();
  if (typeof raw === 'number') {
    // Excel serial date: days since 1899-12-30
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY/MM/DD
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) {
    const [y, m, d] = s.split(/[/\s]/);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // YYYY-MM-DD HH:mm
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const [datePart] = s.split(/\s+/);
    const [y, m, d] = datePart.split('-');
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // Date 对象
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  return todayStr();
}

// 等待 SheetJS 全局加载完成（异步加载 vendor 脚本）
function ensureXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const existing = document.getElementById('xlsx-script');
    if (existing) {
      existing.addEventListener('load', () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX 加载失败')));
      return;
    }
    const s = document.createElement('script');
    s.id = 'xlsx-script';
    s.src = './js/lib/xlsx.full.min.js';
    s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX 加载失败'));
    s.onerror = () => reject(new Error('XLSX 脚本加载失败'));
    document.head.appendChild(s);
  });
}

// 查账户 by name，找不到则自动创建（导入时）
async function getOrCreateAccount(name, cache) {
  if (!name) return null;
  const s = String(name).trim();
  if (cache.has(s)) return cache.get(s);
  // 模糊匹配：去掉 emoji 和空格
  const norm = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim().toLowerCase();
  for (const [k, v] of cache) {
    const kn = k.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim().toLowerCase();
    if (kn === norm) { cache.set(s, v); return v; }
  }
  // create new account
  const acc = await addAccount({ name: s, icon: '💰', color: '#868E96' });
  cache.set(s, acc);
  cache.set(acc.id, acc);
  return acc;
}

function getCategoryIdByName(catName, catMap, type) {
  if (!catName) return null;
  const s = String(catName).trim();
  // exact match within same type
  for (const [id, c] of catMap) {
    if (c.name === s && (type == null || c.type === type)) return id;
  }
  // fuzzy match: includes
  for (const [id, c] of catMap) {
    if (c.name.includes(s) || s.includes(c.name)) {
      if (type == null || c.type === type) return id;
    }
  }
  return null;
}

// ===== 导出 =====
export async function exportToExcel() {
  const XLSX = await ensureXLSX();
  const [txs, accounts, categories] = await Promise.all([
    getAllTransactions(),
    listAccounts(),
    listCategories()
  ]);

  const accMap = new Map(accounts.map(a => [a.id, a]));
  const catMap = new Map(categories.map(c => [c.id, c]));

  const rows = txs.map(t => {
    const typeLabel = t.type === 'income' ? '收入' : t.type === 'transfer' ? '转账' : '支出';
    const cat = catMap.get(t.categoryId);
    const fromAcc = accMap.get(t.accountId);
    const toAcc = accMap.get(t.toAccountId);
    const dateObj = new Date(t.date + 'T00:00:00');
    const dateStr = dateObj.toISOString().slice(0, 10);
    // 拆日期时间（如有 createdAt 则附上时间）
    const timeStr = t.createdAt ? new Date(t.createdAt).toTimeString().slice(0, 5) : '';
    return {
      [HEADERS[0]]: dateStr,
      [HEADERS[1]]: timeStr,
      [HEADERS[2]]: t.type === 'transfer' ? '' : (cat ? cat.name : ''),
      [HEADERS[3]]: typeLabel,
      [HEADERS[4]]: Number(t.amount.toFixed(2)),
      [HEADERS[5]]: fromAcc ? fromAcc.name : '',
      [HEADERS[6]]: toAcc ? toAcc.name : (t.type === 'transfer' ? '' : ''),
      [HEADERS[7]]: t.note || ''
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
  // 列宽
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '流水');

  // 第二张表：账户列表
  const accRows = accounts.map(a => ({ 账户名称: a.name, 图标: a.icon, 颜色: a.color, 类型: a.builtin ? '内置' : '自定义' }));
  const wsAcc = XLSX.utils.json_to_sheet(accRows);
  XLSX.utils.book_append_sheet(wb, wsAcc, '账户');

  // 第三张表：分类列表
  const catRows = categories.map(c => ({ 分类名称: c.name, 图标: c.icon, 颜色: c.color, 类型: c.type === 'income' ? '收入' : '支出' }));
  const wsCat = XLSX.utils.json_to_sheet(catRows);
  XLSX.utils.book_append_sheet(wb, wsCat, '分类');

  const filename = 'accounting-export-' + todayStr() + '.xlsx';
  XLSX.writeFile(wb, filename);
  return filename;
}

// ===== 导入 =====
// mode: 'merge' (默认，仅添加) | 'replace' (清空后导入)
export async function importFromExcel(file, mode = 'merge') {
  const XLSX = await ensureXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  // 找包含"记账日期"的工作表
  let ws = null;
  let sheetName = null;
  for (const name of wb.SheetNames) {
    const s = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(s, { header: 1 });
    if (aoa.length > 0 && aoa[0] && aoa[0].some(c => String(c || '').includes('记账日期'))) {
      ws = s;
      sheetName = name;
      break;
    }
  }
  if (!ws) {
    throw new Error('未找到包含"记账日期"列的工作表');
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (rows.length === 0) {
    throw new Error('Excel 中没有数据行');
  }

  const accounts = await listAccounts();
  const categories = await listCategories();
  const accCache = new Map(accounts.map(a => [a.name, a]));
  const catMap = new Map(categories.map(c => [c.id, c]));

  // replace mode：清空 transactions
  if (mode === 'replace') {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(Stores.TRANSACTIONS, 'readwrite');
      tx.objectStore(Stores.TRANSACTIONS).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  const records = [];
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // 按列标题模糊匹配取值
    const get = (key) => {
      for (const k of Object.keys(r)) {
        if (k.includes(key)) return r[k];
      }
      return '';
    };
    const rawDate = get('记账日期');
    const rawTime = get('记账时间');
    const rawCat = get('分类');
    const rawType = get('记账类型');
    const rawAmount = get('金额');
    const rawFrom = get('流出账户');
    const rawTo = get('流入账户');
    const rawNote = get('备注');

    // 跳过空行
    if (!rawDate && !rawAmount && !rawType) {
      skipped++;
      continue;
    }

    const type = normalizeType(rawType);
    let amount = Number(String(rawAmount).replace(/[^\d.]/g, ''));
    if (isNaN(amount) || amount <= 0) {
      skipped++;
      continue;
    }

    // 处理日期：可能需要合并日期+时间
    let dateStr;
    if (typeof rawDate === 'number') {
      dateStr = normalizeDate(rawDate);
    } else if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().slice(0, 10);
    } else {
      dateStr = normalizeDate(rawDate);
    }

    // 账户：流出账户=accountId，流入账户=toAccountId
    let accountId = null;
    let toAccountId = null;
    if (rawFrom) {
      const acc = await getOrCreateAccount(rawFrom, accCache);
      accountId = acc.id;
    }
    if (rawTo) {
      const acc = await getOrCreateAccount(rawTo, accCache);
      toAccountId = acc.id;
    }
    // 如果只填了流入账户没填流出账户，对收入来说流入=accountId
    if (!accountId && toAccountId && type === 'income') {
      accountId = toAccountId;
      toAccountId = null;
    }
    // 默认账户兜底
    if (!accountId) accountId = accounts[0] ? accounts[0].id : 'cash';

    // 分类（仅支出/收入需要）
    let categoryId = null;
    if (type !== 'transfer' && rawCat) {
      categoryId = getCategoryIdByName(rawCat, catMap, type);
      // 找不到分类不阻断，保留 null（前端会显示"未分类"）
    }

    records.push({
      type,
      amount,
      categoryId,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      note: String(rawNote || ''),
      date: dateStr,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  if (records.length === 0) {
    throw new Error('没有有效的数据行可导入（请检查格式）');
  }

  await bulkPutTransactions(records);

  return {
    total: rows.length,
    imported: records.length,
    skipped,
    sheetName
  };
}
