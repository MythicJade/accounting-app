// js/views/add-transaction.js — add/edit transaction form
// 固定不可滑动布局：顶部金额/类型，中部分类轮播，底部字段 + 固定数字键盘
import { addTransaction, updateTransaction, getTransaction, deleteTransaction, transferMoney } from '../store.js';
import { listCategories } from '../categories.js';
import { listAccounts } from '../accounts.js';
import { todayStr } from '../format.js';
import { toast, confirmDialog, vibrate, el } from '../ui.js';

const CATS_PER_PAGE = 10; // 5 列 × 2 行

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

  const allAccounts = await listAccounts();

  // state
  const state = {
    type: editing ? editing.type : 'expense',
    amount: editing ? String(editing.amount) : '',
    categoryId: editing ? editing.categoryId : null,
    note: editing ? editing.note : '',
    date: editing ? editing.date : todayStr(),
    accountId: editing ? editing.accountId : (allAccounts[0] ? allAccounts[0].id : null),
    toAccountId: editing ? editing.toAccountId : (allAccounts[1] ? allAccounts[1].id : null)
  };

  const allCats = await listCategories();
  let cats = allCats.filter(c => c.type === state.type);

  // === Build DOM ===
  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'back', onclick: () => location.hash = '#/' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: editId ? '编辑记录' : '记一笔' }),
    editId ? el('button', { class: 'btn-text danger', onclick: () => onDelete(editId) }, [el('span', { text: '删除' })]) : el('span')
  ]);

  // Amount display（键盘固定显示，无需点击弹窗）
  const amountValue = el('span', { class: 'value ' + (state.amount ? '' : 'empty'), text: state.amount || '0.00' });
  const amountDisplay = el('div', { class: 'amount-display amount-compact' }, [
    el('span', { class: 'currency', text: '¥' }),
    amountValue
  ]);

  // Type tabs (支出 / 收入 / 转账)
  const typeBtns = {};
  const typeTabs = el('div', { class: 'type-tabs type-tabs-3' }, [
    typeBtns.expense = el('button', { class: state.type === 'expense' ? 'active expense' : '', text: '支出', onclick: () => setType('expense') }),
    typeBtns.income = el('button', { class: state.type === 'income' ? 'active income' : '', text: '收入', onclick: () => setType('income') }),
    typeBtns.transfer = el('button', { class: state.type === 'transfer' ? 'active transfer' : '', text: '转账', onclick: () => setType('transfer') })
  ]);

  // ===== Category carousel (5 cols × 2 rows per page, horizontal swipe) =====
  const catCarousel = el('div', { class: 'cat-carousel' });
  const catTrack = el('div', { class: 'cat-pages-track' });
  catCarousel.appendChild(catTrack);
  const catDots = el('div', { class: 'cat-dots' });
  let currentPageIdx = 0;

  function renderCats() {
    catTrack.innerHTML = '';
    catDots.innerHTML = '';
    if (cats.length === 0) {
      const empty = el('div', { class: 'empty', style: 'padding:16px 8px;' }, [
        el('p', { text: '暂无' + (state.type === 'income' ? '收入' : '支出') + '分类' }),
        el('button', { class: 'btn', style: 'margin-top:8px;background:var(--c-primary);color:#fff;', onclick: () => location.hash = '#/categories' }, [el('span', { text: '去创建分类' })])
      ]);
      catTrack.appendChild(empty);
      return;
    }
    const itemsWithAdd = cats.concat([{ _isAdd: true }]);
    const pageCount = Math.ceil(itemsWithAdd.length / CATS_PER_PAGE);
    for (let p = 0; p < pageCount; p++) {
      const pageItems = itemsWithAdd.slice(p * CATS_PER_PAGE, (p + 1) * CATS_PER_PAGE);
      const page = el('div', { class: 'cat-page' });
      pageItems.forEach(c => {
        let item;
        if (c._isAdd) {
          item = el('div', { class: 'cat-item', onclick: () => location.hash = '#/categories' }, [
            el('div', { class: 'cat-icon', style: 'background:#f0f0f0;color:#999;border:2px dashed #ccc;' }, [document.createTextNode('+')]),
            el('div', { class: 'cat-name', text: '管理' })
          ]);
        } else {
          item = el('div', { class: 'cat-item' + (state.categoryId === c.id ? ' selected' : ''), onclick: () => selectCat(c.id) }, [
            el('div', { class: 'cat-icon', style: `background:${c.color}22;color:${c.color}` }, [document.createTextNode(c.icon)]),
            el('div', { class: 'cat-name', text: c.name })
          ]);
        }
        page.appendChild(item);
      });
      catTrack.appendChild(page);
      const dot = el('span', { class: 'cat-dot' + (p === 0 ? ' active' : '') });
      catDots.appendChild(dot);
    }
    catDots.style.display = pageCount > 1 ? 'flex' : 'none';
    currentPageIdx = 0;
    updateTrackPosition();
  }

  function updateTrackPosition() {
    const pages = catTrack.children;
    if (pages.length === 0) return;
    const carouselWidth = catCarousel.clientWidth || 320;
    catTrack.style.transform = `translateX(${-currentPageIdx * carouselWidth}px)`;
    Array.from(catDots.children).forEach((d, i) => {
      d.className = 'cat-dot' + (i === currentPageIdx ? ' active' : '');
    });
  }

  // 拖动/滑动切换页面
  let dragStartX = 0;
  let dragDelta = 0;
  let isDragging = false;
  catCarousel.addEventListener('touchstart', (e) => {
    isDragging = true;
    dragStartX = e.touches[0].clientX;
    dragDelta = 0;
    catTrack.style.transition = 'none';
  }, { passive: true });
  catCarousel.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    dragDelta = e.touches[0].clientX - dragStartX;
    const carouselWidth = catCarousel.clientWidth || 320;
    catTrack.style.transform = `translateX(${-currentPageIdx * carouselWidth + dragDelta}px)`;
  }, { passive: true });
  catCarousel.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    catTrack.style.transition = 'transform .25s ease';
    const carouselWidth = catCarousel.clientWidth || 320;
    const threshold = carouselWidth * 0.18;
    const pageCount = catTrack.children.length;
    if (dragDelta < -threshold && currentPageIdx < pageCount - 1) {
      currentPageIdx++;
    } else if (dragDelta > threshold && currentPageIdx > 0) {
      currentPageIdx--;
    }
    updateTrackPosition();
  });
  // 鼠标拖动支持（桌面端调试）
  let mouseStartX = 0;
  catCarousel.addEventListener('mousedown', (e) => {
    isDragging = true;
    mouseStartX = e.clientX;
    dragDelta = 0;
    catTrack.style.transition = 'none';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    dragDelta = e.clientX - mouseStartX;
    const carouselWidth = catCarousel.clientWidth || 320;
    catTrack.style.transform = `translateX(${-currentPageIdx * carouselWidth + dragDelta}px)`;
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    catTrack.style.transition = 'transform .25s ease';
    const carouselWidth = catCarousel.clientWidth || 320;
    const threshold = carouselWidth * 0.18;
    const pageCount = catTrack.children.length;
    if (dragDelta < -threshold && currentPageIdx < pageCount - 1) {
      currentPageIdx++;
    } else if (dragDelta > threshold && currentPageIdx > 0) {
      currentPageIdx--;
    }
    updateTrackPosition();
  });

  renderCats();
  const catCard = el('section', { class: 'card add-cat-card' }, [catCarousel, catDots]);

  // Transfer-specific fields (from / to account selectors)
  const fromSelect = el('select', { class: 'input' });
  allAccounts.forEach(a => {
    fromSelect.appendChild(el('option', { value: a.id, text: a.icon + ' ' + a.name }));
  });
  fromSelect.value = state.accountId;
  fromSelect.addEventListener('change', (e) => { state.accountId = e.target.value; });

  const toSelect = el('select', { class: 'input' });
  allAccounts.forEach(a => {
    toSelect.appendChild(el('option', { value: a.id, text: a.icon + ' ' + a.name }));
  });
  toSelect.value = state.toAccountId || (allAccounts[1] ? allAccounts[1].id : '');
  toSelect.addEventListener('change', (e) => { state.toAccountId = e.target.value; });

  const transferCard = el('section', { class: 'card add-transfer-card' }, [
    el('div', { class: 'field' }, [
      el('label', { text: '从账户' }),
      fromSelect
    ]),
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [
      el('label', { text: '到账户' }),
      toSelect
    ])
  ]);

  // Account selector for expense/income (single account picker)
  const accountSelect = el('select', { class: 'input' });
  allAccounts.forEach(a => {
    accountSelect.appendChild(el('option', { value: a.id, text: a.icon + ' ' + a.name }));
  });
  accountSelect.value = state.accountId || '';
  accountSelect.addEventListener('change', (e) => { state.accountId = e.target.value; });

  const accountCell = el('div', { class: 'add-field' }, [
    el('label', { text: '账户' }),
    allAccounts.length === 0
      ? el('button', { class: 'btn', style: 'background:var(--c-primary);color:#fff;padding:6px 8px;font-size:12px;', onclick: () => location.hash = '#/accounts' }, [el('span', { text: '去创建' })])
      : accountSelect
  ]);

  // Note + Date
  const noteInput = el('input', { class: 'input', type: 'text', placeholder: '备注', value: state.note, maxlength: 50 });
  noteInput.addEventListener('input', (e) => { state.note = e.target.value; });
  const dateInput = el('input', { class: 'input', type: 'date', value: state.date });
  dateInput.addEventListener('change', (e) => { state.date = e.target.value; });

  const noteCell = el('div', { class: 'add-field' }, [
    el('label', { text: '备注' }),
    noteInput
  ]);
  const dateCell = el('div', { class: 'add-field' }, [
    el('label', { text: '日期' }),
    dateInput
  ]);

  // 字段行（账户 / 日期 / 备注）放在键盘上方
  const fieldsRow = el('div', { class: 'add-fields' }, [accountCell, dateCell, noteCell]);

  // ===== 固定数字键盘（始终显示在页面底部）+ 保存按钮 =====
  const keypadGrid = el('div', { class: 'keypad' });
  const keys = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];
  keys.forEach(k => {
    const btn = el('button', { text: k, onclick: () => onKey(k) });
    if (k === '⌫') btn.classList.add('danger');
    keypadGrid.appendChild(btn);
  });
  const saveBtn = el('button', { class: 'keypad-save', onclick: onSave }, [el('span', { text: '保存' })]);
  const keypadRow = el('div', { class: 'keypad-row' }, [keypadGrid, saveBtn]);
  const bottom = el('div', { class: 'add-bottom' }, [fieldsRow, keypadRow]);

  // 中部内容容器（分类轮播 或 转账字段）
  const main = el('div', { class: 'add-main' });

  // 整体固定布局
  const layout = el('div', { class: 'add-layout' }, [topbar, amountDisplay, typeTabs, main, bottom]);
  mount.append(layout);
  applyTypeVisibility();

  // 进入记账页时隐藏底部 tabbar，腾出空间给固定键盘
  document.body.classList.add('route-add');

  // 返回 cleanup：路由切换时恢复 tabbar
  return () => {
    document.body.classList.remove('route-add');
  };

  function applyTypeVisibility() {
    main.innerHTML = '';
    if (state.type === 'transfer') {
      main.appendChild(transferCard);
      accountCell.style.display = 'none';
    } else {
      main.appendChild(catCard);
      accountCell.style.display = '';
      requestAnimationFrame(updateTrackPosition);
    }
  }

  function refreshAmount() {
    amountValue.textContent = state.amount || '0.00';
    amountValue.className = 'value ' + (state.amount ? '' : 'empty');
  }
  function refreshType() {
    typeBtns.expense.className = state.type === 'expense' ? 'active expense' : '';
    typeBtns.income.className = state.type === 'income' ? 'active income' : '';
    typeBtns.transfer.className = state.type === 'transfer' ? 'active transfer' : '';
    cats = allCats.filter(c => c.type === state.type);
    if (state.categoryId && !cats.find(c => c.id === state.categoryId)) {
      state.categoryId = null;
    }
    renderCats();
    applyTypeVisibility();
  }
  function selectCat(id) {
    state.categoryId = id;
    vibrate(8);
    renderCats();
  }
  function setType(t) {
    state.type = t;
    refreshType();
  }
  function onKey(k) {
    if (k === '⌫') {
      state.amount = state.amount.slice(0, -1);
    } else if (k === '.') {
      if (state.amount.includes('.')) return;
      if (!state.amount) state.amount = '0';
      state.amount += '.';
    } else {
      if (state.amount.includes('.') && state.amount.split('.')[1].length >= 2) return;
      const intPart = state.amount.split('.')[0];
      if (!state.amount.includes('.') && intPart.length >= 8) return;
      if (state.amount === '0') state.amount = '';
      state.amount += k;
    }
    refreshAmount();
  }
  async function onSave() {
    if (!state.amount || parseFloat(state.amount) <= 0) {
      toast('请输入金额');
      return;
    }
    const amount = parseFloat(state.amount);
    if (isNaN(amount) || amount <= 0) {
      toast('金额无效');
      return;
    }

    // Transfer mode
    if (state.type === 'transfer') {
      if (!state.accountId || !state.toAccountId) {
        toast('请选择源账户和目标账户');
        return;
      }
      if (state.accountId === state.toAccountId) {
        toast('源账户和目标账户不能相同');
        return;
      }
      try {
        if (editId) {
          await updateTransaction(editId, {
            type: 'transfer',
            amount,
            accountId: state.accountId,
            toAccountId: state.toAccountId,
            categoryId: null,
            note: state.note.trim(),
            date: state.date
          });
          toast('已更新');
        } else {
          await transferMoney({
            fromId: state.accountId,
            toId: state.toAccountId,
            amount,
            note: state.note.trim(),
            date: state.date
          });
          toast('已转账');
        }
        vibrate(15);
        setTimeout(() => { location.hash = '#/'; }, 250);
      } catch (e) {
        console.error(e);
        toast('保存失败：' + (e.message || e));
      }
      return;
    }

    // Expense / income mode
    if (!state.categoryId) {
      toast('请选择分类');
      return;
    }
    if (!state.accountId) {
      toast('请选择账户');
      return;
    }
    const payload = {
      type: state.type,
      amount,
      categoryId: state.categoryId,
      accountId: state.accountId,
      note: state.note.trim(),
      date: state.date
    };
    try {
      if (editId) {
        await updateTransaction(editId, payload);
        toast('已更新');
      } else {
        await addTransaction(payload);
        toast('已保存');
      }
      vibrate(15);
      setTimeout(() => { location.hash = '#/'; }, 250);
    } catch (e) {
      console.error(e);
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
