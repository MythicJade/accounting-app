// js/views/add-transaction.js — v2.3.0 沉浸式记一笔
// 排版对齐参考设计：下划线类型 Tabs / 深色金额条（分类+金额一体）/ 瓷砖分类网格 /
// 账户胶囊选择 / 内联元信息行（账本·日期·备注）/ 4 列键盘（+ − 连续运算、再记、完成）
import { addTransaction, updateTransaction, getTransaction, deleteTransaction, transferMoney } from '../store.js';
import { listCategories } from '../categories.js';
import { listAccounts } from '../accounts.js';
import { todayStr } from '../format.js';
import { toast, confirmDialog, vibrate, el, promptDialog } from '../ui.js';
import { categoryIconNode } from '../category-icons.js';

const CATS_PER_PAGE = 10; // 5 列 × 2 行瓷砖

export async function renderAddTransaction(mount, params = {}) {
  const editId = params.id ? Number(params.id) : null;
  let editing = null;
  if (editId) {
    editing = await getTransaction(editId);
    if (!editing) {
      toast('记录不存在');
      location.hash = '#/';
      return;
    }
  }

  const allAccounts = await listAccounts({ includeArchived: Boolean(editing) });

  // state
  const state = {
    type: editing ? editing.type : 'expense',
    expr: editing ? String(editing.amount) : '',   // 支持 + − 的表达式
    categoryId: editing ? editing.categoryId : null,
    note: editing ? editing.note : '',
    date: editing ? editing.date : todayStr(),
    accountId: editing ? editing.accountId : (allAccounts[0] ? allAccounts[0].id : null),
    toAccountId: editing ? editing.toAccountId : (allAccounts[1] ? allAccounts[1].id : null)
  };

  const allCats = await listCategories(null, { includeArchived: Boolean(editing) });
  let cats = allCats.filter(c => c.type === state.type);
  if (!state.categoryId && cats[0]) state.categoryId = cats[0].id;

  // ===== 顶部：返回 + 下划线类型 Tabs +（删除） =====
  const backBtn = el('button', { class: 'back add-back', 'aria-label': '返回首页', onclick: () => location.hash = '#/' }, [
    el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
  ]);
  const typeBtns = {};
  const segTabs = el('div', { class: 'seg-underline', role: 'tablist' }, [
    typeBtns.expense = el('button', { class: state.type === 'expense' ? 'active' : '', text: '支出', onclick: () => setType('expense') }),
    typeBtns.income = el('button', { class: state.type === 'income' ? 'active' : '', text: '收入', onclick: () => setType('income') }),
    typeBtns.transfer = el('button', { class: state.type === 'transfer' ? 'active' : '', text: '转账', onclick: () => setType('transfer') })
  ]);
  const topRow = el('div', { class: 'add-top-row' }, [
    backBtn,
    segTabs,
    editId
      ? el('button', { class: 'btn-text danger add-del-btn', onclick: () => onDelete(editId) }, [el('span', { text: '删除' })])
      : el('span', { class: 'add-right-spacer' })
  ]);

  // ===== 深色金额条：分类 + 金额一体 =====
  const amtIcon = el('span', { class: 'amt-cat', 'aria-hidden': 'true' });
  const amtName = el('span', { class: 'amt-name' });
  const amtVal = el('span', { class: 'amt-val is-empty', text: '0' });
  const amtBar = el('div', { class: 'amt-bar' }, [amtIcon, amtName, amtVal]);

  function refreshAmtBar(animate = false) {
    if (state.type === 'transfer') {
      amtIcon.style.background = 'var(--transfer)';
      amtIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 8h9l-2.6-2.6M17.5 16h-9l2.6 2.6"/></svg>';
      amtName.textContent = '转账';
    } else {
      const cat = cats.find(c => c.id === state.categoryId);
      amtIcon.style.background = cat ? cat.color : 'var(--text-3)';
      amtIcon.innerHTML = '';
      if (cat) amtIcon.appendChild(categoryIconNode(cat, { size: 21 }));
      amtName.textContent = cat ? cat.name : '选择分类';
    }
    amtVal.textContent = state.expr || '0';
    amtVal.className = 'amt-val' + (state.expr ? '' : ' is-empty');
    if (animate) {
      void amtVal.offsetWidth;
      amtVal.classList.add('is-updating');
    }
  }

  // ===== 分类瓷砖（5 列 × 2 行，横向滑页） =====
  const tileSwiper = el('div', { class: 'tile-swiper' });
  const tileTrack = el('div', { class: 'tile-track' });
  tileSwiper.appendChild(tileTrack);
  const tileDots = el('div', { class: 'cat-dots' });
  let currentPageIdx = Math.max(0, Math.floor(Math.max(0, cats.findIndex(c => c.id === state.categoryId)) / CATS_PER_PAGE));

  function renderTiles() {
    tileTrack.innerHTML = '';
    tileDots.innerHTML = '';
    if (cats.length === 0) {
      tileTrack.appendChild(el('div', { class: 'empty', style: 'padding:16px 8px;' }, [
        el('p', { text: '暂无' + (state.type === 'income' ? '收入' : '支出') + '分类' }),
        el('button', { class: 'btn', style: 'margin-top:8px;', onclick: () => location.hash = '#/categories' }, [el('span', { text: '去创建分类' })])
      ]));
      tileDots.style.display = 'none';
      return;
    }
    const items = cats.concat([{ _isManage: true }]);
    const pageCount = Math.ceil(items.length / CATS_PER_PAGE);
    for (let p = 0; p < pageCount; p++) {
      const page = el('div', { class: 'tile-page' });
      items.slice(p * CATS_PER_PAGE, (p + 1) * CATS_PER_PAGE).forEach(c => {
        let tile;
        if (c._isManage) {
          tile = el('button', { class: 'cat-tile dashed', type: 'button', onclick: () => location.hash = '#/categories' }, [
            el('span', { class: 'cube' }, [
              el('svg', { viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true', html: '<path d="M12 5v14M5 12h14"/>' })
            ]),
            el('span', { class: 't-label', text: '管理' })
          ]);
        } else {
          tile = el('button', {
            class: 'cat-tile' + (state.categoryId === c.id ? ' selected' : ''), type: 'button',
            'aria-label': c.name,
            onclick: () => { state.categoryId = c.id; vibrate(8); renderTiles(); refreshAmtBar(true); }
          }, [
            el('span', { class: 'cube' }, [categoryIconNode(c, { size: 24 })]),
            el('span', { class: 't-label', text: c.name })
          ]);
        }
        page.appendChild(tile);
      });
      tileTrack.appendChild(page);
      const dot = el('button', {
        class: 'cat-dot' + (p === currentPageIdx ? ' active' : ''), type: 'button',
        'aria-label': `第 ${p + 1} 组分类`,
        onclick: () => goTilePage(p)
      });
      tileDots.appendChild(dot);
    }
    currentPageIdx = Math.min(currentPageIdx, pageCount - 1);
    tileDots.style.display = pageCount > 1 ? 'flex' : 'none';
    updateTilePosition();
  }

  function updateTilePosition() {
    const pages = tileTrack.children;
    if (pages.length === 0) return;
    const w = tileSwiper.clientWidth || 320;
    tileTrack.style.transform = `translateX(${-currentPageIdx * w}px)`;
    Array.from(tileDots.children).forEach((d, i) => {
      d.className = 'cat-dot' + (i === currentPageIdx ? ' active' : '');
    });
  }
  function goTilePage(next) {
    const last = Math.max(0, tileTrack.children.length - 1);
    currentPageIdx = Math.max(0, Math.min(last, next));
    tileTrack.style.transition = 'transform .25s ease';
    updateTilePosition();
  }

  // 瓷砖横滑
  let dragStartX = 0, dragDelta = 0, isDragging = false;
  tileSwiper.addEventListener('touchstart', (e) => {
    isDragging = true; dragStartX = e.touches[0].clientX; dragDelta = 0;
    tileTrack.style.transition = 'none';
  }, { passive: true });
  tileSwiper.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    dragDelta = e.touches[0].clientX - dragStartX;
    const w = tileSwiper.clientWidth || 320;
    tileTrack.style.transform = `translateX(${-currentPageIdx * w + dragDelta}px)`;
  }, { passive: true });
  tileSwiper.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    tileTrack.style.transition = 'transform .25s ease';
    const w = tileSwiper.clientWidth || 320;
    const threshold = w * 0.18;
    const pageCount = tileTrack.children.length;
    if (dragDelta < -threshold && currentPageIdx < pageCount - 1) currentPageIdx++;
    else if (dragDelta > threshold && currentPageIdx > 0) currentPageIdx--;
    updateTilePosition();
  }, { passive: true });
  // 桌面拖动
  let mStart = 0;
  tileSwiper.addEventListener('mousedown', (e) => { isDragging = true; mStart = e.clientX; dragDelta = 0; tileTrack.style.transition = 'none'; e.preventDefault(); });
  const onMouseMove = (e) => {
    if (!isDragging) return;
    dragDelta = e.clientX - mStart;
    const w = tileSwiper.clientWidth || 320;
    tileTrack.style.transform = `translateX(${-currentPageIdx * w + dragDelta}px)`;
  };
  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    tileTrack.style.transition = 'transform .25s ease';
    const w = tileSwiper.clientWidth || 320;
    const threshold = w * 0.18;
    const pageCount = tileTrack.children.length;
    if (dragDelta < -threshold && currentPageIdx < pageCount - 1) currentPageIdx++;
    else if (dragDelta > threshold && currentPageIdx > 0) currentPageIdx--;
    updateTilePosition();
  };
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', updateTilePosition);

  const catSection = el('section', { class: 'cat-section' }, [tileSwiper, tileDots]);

  // ===== 账户胶囊 =====
  function buildAcctRow(labelText, selectedId, onSelect) {
    const row = el('div', { class: 'acct-row', role: 'radiogroup', 'aria-label': labelText });
    function renderChips() {
      row.innerHTML = '';
      allAccounts.forEach(a => {
        const chip = el('button', {
          class: 'acct-chip' + (selectedId === a.id ? ' active' : ''), type: 'button', role: 'radio',
          'aria-checked': String(selectedId === a.id),
          onclick: () => { onSelect(a.id); vibrate(6); }
        }, [document.createTextNode(`${a.icon || '💳'} ${a.name}`)]);
        row.appendChild(chip);
      });
    }
    renderChips();
    return { row, refresh: renderChips, setSelected: (id) => { selectedId = id; renderChips(); } };
  }

  let fromChips, toChips, acctChips;
  function buildAccountArea() {
    if (state.type === 'transfer') {
      const wrap = el('div', { class: 'xfer-wrap' });
      fromChips = buildAcctRow('从账户', state.accountId, (id) => { state.accountId = id; });
      toChips = buildAcctRow('到账户', state.toAccountId, (id) => { state.toAccountId = id; });
      wrap.appendChild(el('div', { class: 'xfer-row' }, [el('span', { class: 'xfer-label', text: '从' }), fromChips.row]));
      wrap.appendChild(el('div', { class: 'xfer-row' }, [el('span', { class: 'xfer-label', text: '到' }), toChips.row]));
      return wrap;
    }
    acctChips = buildAcctRow('账户', state.accountId, (id) => { state.accountId = id; });
    return acctChips.row;
  }

  // ===== 内联元信息行：账本 · 日期 · 备注 =====
  const metaDateBtn = el('button', { class: 'meta-btn', type: 'button' });
  const metaNoteBtn = el('button', { class: 'meta-btn', type: 'button' });
  const hiddenDate = el('input', { type: 'date', value: state.date, style: 'position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;' });
  hiddenDate.addEventListener('change', (e) => { state.date = e.target.value || state.date; refreshMeta(); });
  metaDateBtn.addEventListener('click', () => {
    try { hiddenDate.showPicker && hiddenDate.showPicker(); } catch (e) { /* ignore */ }
    hiddenDate.click();
  });
  metaNoteBtn.addEventListener('click', async () => {
    const v = await promptDialog({ title: '备注', label: '备注内容（最多 50 字）', defaultValue: state.note, placeholder: '选填', okText: '保存' });
    if (v == null) return;
    state.note = String(v).slice(0, 50);
    refreshMeta();
  });
  function refreshMeta() {
    const [y, m, d] = state.date.split('-');
    metaDateBtn.innerHTML = '';
    metaDateBtn.append(
      el('span', { class: 'mi', 'aria-hidden': 'true', text: '📅' }),
      document.createTextNode(`${Number(m)}月${Number(d)}日`)
    );
    metaNoteBtn.innerHTML = '';
    metaNoteBtn.append(
      el('span', { class: 'mi', 'aria-hidden': 'true', text: '📝' }),
      document.createTextNode(state.note ? (state.note.length > 10 ? state.note.slice(0, 10) + '…' : state.note) : '添加备注')
    );
    metaNoteBtn.classList.toggle('has-note', !!state.note);
  }
  const metaRow = el('div', { class: 'meta-row' }, [
    el('button', {
      class: 'meta-btn', type: 'button',
      onclick: () => toast('多账本开发中')
    }, [
      el('span', { class: 'mi', 'aria-hidden': 'true', text: '📖' }),
      document.createTextNode('我的账本')
    ]),
    metaDateBtn,
    metaNoteBtn,
    hiddenDate
  ]);

  // ===== 4 列键盘：+ − 连续运算 / 再记 / 完成 =====
  const kb = el('div', { class: 'kb4', role: 'group', 'aria-label': '金额键盘' });
  const againKey = el('button', { class: 'kb-key fn', type: 'button', text: '再记', onclick: () => saveCurrent(true) });
  const doneKey = el('button', { class: 'kb-key kb-done', type: 'button', text: '完成', onclick: () => saveCurrent(false) });
  const kbRows = [
    ['7', '8', '9', 'back'],
    ['4', '5', '6', '+'],
    ['1', '2', '3', '-'],
    ['.', '0', 'again', 'done']
  ];
  kbRows.flat().forEach(k => {
    if (k === 'again') { kb.appendChild(againKey); return; }
    if (k === 'done') { kb.appendChild(doneKey); return; }
    if (k === 'back') {
      kb.appendChild(el('button', { class: 'kb-key danger', type: 'button', 'aria-label': '退格', onclick: () => onKey('⌫') }, [
        el('svg', { viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true', html: '<path d="M9 5h11a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H9l-5.5-7L9 5Z"/><path d="m12.5 9.5 5 5m0-5-5 5"/>' })
      ]));
      return;
    }
    if (k === '+' || k === '-') {
      kb.appendChild(el('button', { class: 'kb-key op', type: 'button', 'aria-label': k === '+' ? '加' : '减', text: k, onclick: () => onKey(k) }));
      return;
    }
    kb.appendChild(el('button', { class: 'kb-key', type: 'button', text: k, onclick: () => onKey(k) }));
  });

  function onKey(k) {
    if (k === '⌫') {
      state.expr = state.expr.slice(0, -1);
    } else if (k === '+' || k === '-') {
      // 运算符：不能开头、不能连续
      if (!state.expr || /[+-]$/.test(state.expr)) return;
      state.expr += k;
    } else if (k === '.') {
      const seg = currentSegment();
      if (seg.includes('.')) return;
      state.expr += (seg === '' ? '0.' : '.');
    } else {
      const seg = currentSegment();
      if (seg.includes('.')) {
        if (seg.split('.')[1].length >= 2) return;
        state.expr += k;
      } else {
        if (seg === '0') state.expr = state.expr.slice(0, -1) + k;
        else {
          if (seg.length >= 8) return;
          state.expr += k;
        }
      }
    }
    if (state.expr.length > 24) state.expr = state.expr.slice(0, 24);
    refreshAmtBar(true);
  }
  function currentSegment() {
    const m = state.expr.split(/[+-]/);
    return m[m.length - 1] || '';
  }
  // 求值：整数分运算，避免浮点误差；仅 + −，从左到右
  function evaluateExpr() {
    const s = state.expr;
    if (!s) return NaN;
    if (!/^\d+(\.\d{1,2})?([+-]\d+(\.\d{1,2})?)*$/.test(s)) return NaN;
    const tokens = s.match(/(\d+\.?\d{0,2}|[+-])/g) || [];
    let cents = toCentsSafe(tokens[0]);
    if (cents == null) return NaN;
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const v = toCentsSafe(tokens[i + 1]);
      if (v == null) return NaN;
      cents = op === '+' ? cents + v : cents - v;
    }
    if (!Number.isSafeInteger(cents)) return NaN;
    if (cents <= 0) return NaN;
    return cents / 100;
  }
  function toCentsSafe(numStr) {
    if (!/^\d+(\.\d{1,2})?$/.test(numStr)) return null;
    const [i, f = ''] = numStr.split('.');
    const frac = Number((f + '00').slice(0, 2));
    return Number(i) * 100 + frac;
  }

  // ===== 组装 & 类型切换 =====
  const main = el('div', { class: 'add-main2' });
  const layout = el('div', { class: 'add-layout2' }, [topRow, amtBar, main, metaRow, kb]);
  mount.append(layout);
  document.body.classList.add('route-add');

  function applyTypeVisibility() {
    main.innerHTML = '';
    if (state.type === 'transfer') {
      main.appendChild(buildAccountArea());
      againKey.style.visibility = 'hidden';
    } else {
      main.appendChild(catSection);
      main.appendChild(buildAccountArea());
      againKey.style.visibility = 'visible';
    }
    refreshAmtBar();
  }

  function refreshType() {
    typeBtns.expense.className = state.type === 'expense' ? 'active' : '';
    typeBtns.income.className = state.type === 'income' ? 'active' : '';
    typeBtns.transfer.className = state.type === 'transfer' ? 'active' : '';
    cats = allCats.filter(c => c.type === state.type);
    if (state.categoryId && !cats.find(c => c.id === state.categoryId)) state.categoryId = null;
    if (!state.categoryId && cats[0]) state.categoryId = cats[0].id;
    currentPageIdx = 0;
    renderTiles();
    applyTypeVisibility();
  }
  function setType(t) {
    if (state.type === t) return;
    state.type = t;
    refreshType();
    main.classList.remove('is-switching');
    void main.offsetWidth;
    main.classList.add('is-switching');
  }

  renderTiles();
  applyTypeVisibility();
  refreshMeta();

  return () => {
    document.body.classList.remove('route-add');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('resize', updateTilePosition);
  };

  // ===== 保存 =====
  async function saveCurrent(continueEditing) {
    const amount = evaluateExpr();
    if (isNaN(amount)) {
      toast(state.expr ? '金额格式有误' : '请输入金额');
      return;
    }
    const amountStr = amount.toFixed(2);

    if (state.type === 'transfer') {
      if (!state.accountId || !state.toAccountId) { toast('请选择源账户和目标账户'); return; }
      if (state.accountId === state.toAccountId) { toast('源账户和目标账户不能相同'); return; }
      try {
        if (editId) {
          await updateTransaction(editId, {
            type: 'transfer', amount: amountStr,
            accountId: state.accountId, toAccountId: state.toAccountId,
            categoryId: null, note: state.note.trim(), date: state.date
          });
          toast('已更新');
        } else {
          await transferMoney({ fromId: state.accountId, toId: state.toAccountId, amount: amountStr, note: state.note.trim(), date: state.date });
          toast('已转账');
        }
        vibrate(15);
        if (continueEditing) return;
        setTimeout(() => { location.hash = '#/'; }, 250);
      } catch (e) {
        toast('保存失败：' + (e.message || e));
      }
      return;
    }

    if (!state.categoryId) { toast('请选择分类'); return; }
    if (!state.accountId) { toast('请选择账户'); return; }
    const payload = {
      type: state.type, amount: amountStr,
      categoryId: state.categoryId, accountId: state.accountId,
      note: state.note.trim(), date: state.date
    };
    try {
      if (editId) {
        await updateTransaction(editId, payload);
        toast('已更新');
      } else {
        await addTransaction(payload);
        toast(continueEditing ? '已保存，记下一笔' : '已保存');
      }
      vibrate(15);
      if (continueEditing && !editId) {
        state.expr = '';
        refreshAmtBar(true);
        return;
      }
      setTimeout(() => { location.hash = '#/'; }, 250);
    } catch (e) {
      toast('保存失败：' + (e.message || e));
    }
  }

  async function onDelete(id) {
    const ok = await confirmDialog('确定要删除这条记录吗？', { danger: true, okText: '删除' });
    if (!ok) return;
    try {
      await deleteTransaction(id);
      toast('已删除');
      vibrate(15);
      setTimeout(() => { location.hash = '#/'; }, 250);
    } catch (e) {
      toast('删除失败');
    }
  }
}
