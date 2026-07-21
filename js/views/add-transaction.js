// js/views/add-transaction.js — add/edit transaction form
import { addTransaction, updateTransaction, getTransaction, deleteTransaction, transferMoney } from '../store.js';
import { listCategories } from '../categories.js';
import { listAccounts } from '../accounts.js';
import { todayStr, formatDateStr } from '../format.js';
import { toast, confirmDialog, vibrate, el } from '../ui.js';

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

  // Amount display
  const amountValue = el('span', { class: 'value ' + (state.amount ? '' : 'empty'), text: state.amount || '0.00' });
  const amountDisplay = el('div', { class: 'amount-display' }, [
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

  // Category grid (hidden for transfer)
  const catGrid = el('div', { class: 'cat-grid' });
  function renderCats() {
    catGrid.innerHTML = '';
    if (cats.length === 0) {
      const empty = el('div', { class: 'empty', style: 'grid-column:1/-1;padding:16px 8px;' }, [
        el('p', { text: '暂无' + (state.type === 'income' ? '收入' : '支出') + '分类' }),
        el('button', { class: 'btn', style: 'margin-top:8px;background:var(--c-primary);color:#fff;', onclick: () => location.hash = '#/categories' }, [el('span', { text: '去创建分类' })])
      ]);
      catGrid.appendChild(empty);
      return;
    }
    cats.forEach(c => {
      const item = el('div', { class: 'cat-item' + (state.categoryId === c.id ? ' selected' : ''), onclick: () => selectCat(c.id) }, [
        el('div', { class: 'cat-icon', style: `background:${c.color}22;color:${c.color}` }, [document.createTextNode(c.icon)]),
        el('div', { class: 'cat-name', text: c.name })
      ]);
      catGrid.appendChild(item);
    });
    // 末尾追加一个"+"按钮，便于跳转到分类管理
    const addBtn = el('div', { class: 'cat-item', onclick: () => location.hash = '#/categories' }, [
      el('div', { class: 'cat-icon', style: 'background:#f0f0f0;color:#999;border:2px dashed #ccc;' }, [document.createTextNode('+')]),
      el('div', { class: 'cat-name', text: '管理' })
    ]);
    catGrid.appendChild(addBtn);
  }
  renderCats();
  const catCard = el('section', { class: 'card' }, [catGrid]);

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

  const transferCard = el('section', { class: 'card' }, [
    el('div', { class: 'field' }, [
      el('label', { text: '从账户' }),
      fromSelect
    ]),
    el('div', { class: 'field' }, [
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

  const accountField = el('div', { class: 'field' }, [
    el('label', { text: '账户' }),
    allAccounts.length === 0
      ? el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
          el('span', { class: 'text-sm text-3', text: '暂无账户' }),
          el('button', { class: 'btn', style: 'background:var(--c-primary);color:#fff;padding:4px 10px;font-size:13px;', onclick: () => location.hash = '#/accounts' }, [el('span', { text: '去创建' })])
        ])
      : accountSelect
  ]);

  // Note + Date
  const noteInput = el('input', { class: 'input', type: 'text', placeholder: '备注（可选）', value: state.note, maxlength: 50 });
  noteInput.addEventListener('input', (e) => { state.note = e.target.value; });
  const dateInput = el('input', { class: 'input', type: 'date', value: state.date });
  dateInput.addEventListener('change', (e) => { state.date = e.target.value; });

  const fieldsCard = el('section', { class: 'card' }, [
    accountField,
    el('div', { class: 'field' }, [
      el('label', { text: '备注' }),
      noteInput
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: '日期' }),
      dateInput
    ])
  ]);

  // Number keypad
  const keypad = el('div', { class: 'keypad' });
  const keys = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];
  keys.forEach(k => {
    const btn = el('button', {
      text: k,
      onclick: () => onKey(k)
    });
    if (k === '⌫') btn.classList.add('danger');
    keypad.appendChild(btn);
  });

  // Save button
  const saveBtn = el('button', { class: 'btn btn-block', onclick: onSave }, [el('span', { text: '保存' })]);

  // Mount everything initially (decide which sections to show based on type)
  mount.append(topbar, amountDisplay, typeTabs);
  applyTypeVisibility();
  mount.append(keypad, saveBtn);

  function applyTypeVisibility() {
    // Remove optional sections if already attached
    [catCard, transferCard, fieldsCard].forEach(node => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    // Insert before keypad
    const keypadIdx = Array.from(mount.children).indexOf(keypad);
    if (state.type === 'transfer') {
      mount.insertBefore(transferCard, mount.children[keypadIdx]);
      mount.insertBefore(fieldsCard, mount.children[keypadIdx]);
      // remove the account field from fieldsCard for transfer (uses from/to instead)
      if (accountField.parentNode) accountField.parentNode.removeChild(accountField);
    } else {
      mount.insertBefore(catCard, mount.children[keypadIdx]);
      mount.insertBefore(fieldsCard, mount.children[keypadIdx]);
      // re-add account field to fieldsCard if not there
      if (!accountField.parentNode) {
        fieldsCard.insertBefore(accountField, fieldsCard.firstChild);
      }
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
    // If current category doesn't match new type, clear it
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
      // Limit: max 2 decimal places
      if (state.amount.includes('.') && state.amount.split('.')[1].length >= 2) return;
      // Limit: max integer part 8 digits
      const intPart = state.amount.split('.')[0];
      if (!state.amount.includes('.') && intPart.length >= 8) return;
      // No leading zeros
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
          // Update existing transfer record
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
      // small delay so user sees the toast
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

  mount.append(topbar, amountDisplay, typeTabs, el('section', { class: 'card' }, [catGrid]), fieldsCard, keypad, saveBtn);
}
