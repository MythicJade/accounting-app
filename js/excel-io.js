// js/excel-io.js — Excel(.xlsx) 导入导出，兼容其他记账软件格式
// 列定义（按用户提供的格式）：
//   记账日期 | 记账时间（可不填） | 分类（转账无需填写分类） | 记账类型 | 金额（勿填正负号、0） | 流出账户 | 流入账户 | 备注
import { listAccounts, addAccount, updateAccount } from './accounts.js';
import { listCategories, addCategory } from './categories.js';
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

// 分类默认图标和颜色（按类型）
const DEFAULT_CAT_ICON = { expense: '💰', income: '💼' };
const DEFAULT_CAT_COLOR = { expense: '#868E96', income: '#52C41A' };

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

  // 第二张表：账户列表（含期初余额）
  const accRows = accounts.map(a => ({
    账户名称: a.name,
    图标: a.icon,
    颜色: a.color,
    期初余额: a.openingBalance != null ? Number(a.openingBalance) : 0,
    类型: a.builtin ? '内置' : '自定义'
  }));
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
// Phase 1: 预扫描 - 解析 Excel，识别账户与分类，返回结构化预览数据
export async function previewExcelImport(file) {
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

  // 解析每一行，收集账户和分类
  const existingAccounts = await listAccounts();
  const existingCategories = await listCategories();
  // accName -> { name, exists, currentOpening }
  const detectedAccountsMap = new Map();
  for (const a of existingAccounts) detectedAccountsMap.set(a.name, { name: a.name, exists: true, currentOpening: a.openingBalance || 0, id: a.id });
  // catKey (type|name) -> { name, type, exists }
  const detectedCategoriesMap = new Map();
  for (const c of existingCategories) detectedCategoriesMap.set(c.type + '|' + c.name, { name: c.name, type: c.type, exists: true });

  const parsedRows = [];
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
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

    let dateStr;
    if (typeof rawDate === 'number') {
      dateStr = normalizeDate(rawDate);
    } else if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().slice(0, 10);
    } else {
      dateStr = normalizeDate(rawDate);
    }

    // 收集账户名（用于预览）
    const fromName = rawFrom ? String(rawFrom).trim() : '';
    const toName = rawTo ? String(rawTo).trim() : '';
    if (fromName && !detectedAccountsMap.has(fromName)) {
      detectedAccountsMap.set(fromName, { name: fromName, exists: false, currentOpening: 0 });
    }
    if (toName && !detectedAccountsMap.has(toName)) {
      detectedAccountsMap.set(toName, { name: toName, exists: false, currentOpening: 0 });
    }
    // 收集分类名（用于预览）
    if (type !== 'transfer' && rawCat) {
      const catName = String(rawCat).trim();
      const key = type + '|' + catName;
      if (!detectedCategoriesMap.has(key)) {
        detectedCategoriesMap.set(key, { name: catName, type, exists: false });
      }
    }

    parsedRows.push({
      type,
      amount,
      rawCat: type !== 'transfer' ? String(rawCat || '').trim() : '',
      rawFrom: fromName,
      rawTo: toName,
      note: String(rawNote || ''),
      date: dateStr,
      time: rawTime ? String(rawTime).trim() : ''
    });
  }

  return {
    sheetName,
    totalRows: rows.length,
    parsedRows,
    skipped,
    detectedAccounts: Array.from(detectedAccountsMap.values()),
    detectedCategories: Array.from(detectedCategoriesMap.values()),
    // 用于UI显示的分类计数
    newAccountsCount: Array.from(detectedAccountsMap.values()).filter(a => !a.exists).length,
    newCategoriesCount: Array.from(detectedCategoriesMap.values()).filter(c => !c.exists).length
  };
}

// Phase 2: 实际导入 - 接收 preview 返回的数据 + 用户输入的期初余额
// openingBalances: Map<accountName, number>
export async function importParsedData(preview, options = {}) {
  const { mode = 'merge', openingBalances = new Map() } = options;

  const existingAccounts = await listAccounts();
  const existingCategories = await listCategories();
  const accCache = new Map(existingAccounts.map(a => [a.name, a]));
  const catMap = new Map(existingCategories.map(c => [c.id, c]));
  const catNameMap = new Map();
  for (const c of existingCategories) {
    catNameMap.set(c.type + '|' + c.name, c);
  }

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

  // 预创建所有新账户（含期初余额）和新分类，避免重复创建
  for (const accInfo of preview.detectedAccounts) {
    if (!accCache.has(accInfo.name)) {
      const ob = openingBalances.has(accInfo.name)
        ? (parseFloat(openingBalances.get(accInfo.name)) || 0)
        : 0;
      const acc = await addAccount({
        name: accInfo.name,
        icon: '💰',
        color: '#868E96',
        openingBalance: ob
      });
      accCache.set(accInfo.name, acc);
    } else {
      // 已存在账户：若用户在导入时输入了期初余额，则更新
      if (openingBalances.has(accInfo.name)) {
        const existing = accCache.get(accInfo.name);
        const newOb = parseFloat(openingBalances.get(accInfo.name)) || 0;
        if (Number(existing.openingBalance) !== newOb) {
          await updateAccount(existing.id, { openingBalance: newOb });
          existing.openingBalance = newOb;
        }
      }
    }
  }

  // 预创建所有新分类
  for (const catInfo of preview.detectedCategories) {
    const key = catInfo.type + '|' + catInfo.name;
    if (!catNameMap.has(key)) {
      const c = await addCategory({
        name: catInfo.name,
        type: catInfo.type,
        icon: DEFAULT_CAT_ICON[catInfo.type] || '💰',
        color: DEFAULT_CAT_COLOR[catInfo.type] || '#868E96'
      });
      catMap.set(c.id, c);
      catNameMap.set(key, c);
    } else {
      // 确保已在 catMap 中
      const c = catNameMap.get(key);
      if (!catMap.has(c.id)) catMap.set(c.id, c);
    }
  }

  // 构建记录
  const records = [];
  let skippedInBuild = 0;
  for (const p of preview.parsedRows) {
    let accountId = null;
    let toAccountId = null;
    if (p.rawFrom) {
      const acc = accCache.get(p.rawFrom);
      if (acc) accountId = acc.id;
    }
    if (p.rawTo) {
      const acc = accCache.get(p.rawTo);
      if (acc) toAccountId = acc.id;
    }
    // 如果只填了流入账户没填流出账户，对收入来说流入=accountId
    if (!accountId && toAccountId && p.type === 'income') {
      accountId = toAccountId;
      toAccountId = null;
    }
    // 默认账户兜底
    if (!accountId) {
      const firstAcc = accCache.values().next().value;
      if (firstAcc) accountId = firstAcc.id;
    }
    if (!accountId) {
      skippedInBuild++;
      continue;
    }

    // 分类（仅支出/收入需要）
    let categoryId = null;
    if (p.type !== 'transfer' && p.rawCat) {
      const key = p.type + '|' + p.rawCat;
      const c = catNameMap.get(key);
      if (c) categoryId = c.id;
    }

    const createdAt = p.time
      ? new Date(p.date + 'T' + p.time.padStart(5, '0').padEnd(5, '0') + ':00').getTime() || Date.now()
      : Date.now();

    records.push({
      type: p.type,
      amount: p.amount,
      categoryId,
      accountId,
      toAccountId: p.type === 'transfer' ? toAccountId : null,
      note: p.note,
      date: p.date,
      createdAt,
      updatedAt: Date.now()
    });
  }

  if (records.length === 0) {
    throw new Error('没有有效的数据行可导入（请检查格式）');
  }

  await bulkPutTransactions(records);

  return {
    total: preview.totalRows,
    imported: records.length,
    skipped: preview.skipped + skippedInBuild,
    sheetName: preview.sheetName,
    newAccounts: preview.newAccountsCount,
    newCategories: preview.newCategoriesCount
  };
}

// 向后兼容：保留 importFromExcel 但默认走预扫描流程
// 调用方可使用 previewExcelImport + importParsedData 获得更好的体验
export async function importFromExcel(file, mode = 'merge') {
  const preview = await previewExcelImport(file);
  return importParsedData(preview, { mode });
}
