// js/views/categories.js — 分类管理页面（支出/收入分类 CRUD + 图标颜色）
import { listCategories, addCategory, updateCategory, deleteCategory } from '../categories.js';
import { toast, confirmDialog, showModal, el } from '../ui.js';
import { router } from '../router.js';

const ICONS = ['🍱','🍜','🚇','🚗','🛒','🏠','🎮','💊','📚','💰','💼','🎁','📈','➕','🎂','👕','💊','✈️','🎬','☕','🍷','🛍️','💡','💵','💳','💙','💚','💛','🏦','📱','💎','👛'];
const COLORS = ['#FF6B6B','#4ECDC4','#FFA94D','#845EF7','#F783AC','#51CF66','#339AF0','#FAAD14','#52C41A','#1677FF','#07C160','#722ED1','#FA8C16','#13C2C2','#868E96','#EB2F96'];

export async function renderCategories(mount) {
  let currentType = 'expense';
  let cats = await listCategories(currentType);

  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'back', onclick: () => location.hash = '#/settings' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: '分类管理' }),
    el('button', { class: 'btn-text', onclick: () => onAdd() }, [el('span', { text: '+ 新增' })])
  ]);

  // 类型切换 tabs
  const tabs = el('div', { class: 'type-tabs type-tabs-2' });
  const tabExpense = el('button', { class: currentType === 'expense' ? 'active expense' : '', text: '支出', onclick: () => switchType('expense') });
  const tabIncome = el('button', { class: currentType === 'income' ? 'active income' : '', text: '收入', onclick: () => switchType('income') });
  tabs.append(tabExpense, tabIncome);

  // 分类网格
  const grid = el('div', { class: 'cat-grid', style: 'padding:8px 0;' });
  const card = el('section', { class: 'card' }, [grid]);

  mount.append(topbar, tabs, card);

  renderGrid();

  function renderGrid() {
    grid.innerHTML = '';
    if (cats.length === 0) {
      grid.appendChild(el('div', { class: 'empty', style: 'grid-column:1/-1;' }, [
        el('p', { text: '暂无分类' }),
        el('p', { class: 'text-sm text-3', text: '点击右上角「新增」创建' })
      ]));
      return;
    }
    cats.forEach(c => {
      const item = el('div', { class: 'cat-item', onclick: () => onEdit(c) }, [
        el('div', { class: 'cat-icon', style: `background:${c.color}22;color:${c.color}` }, [document.createTextNode(c.icon)]),
        el('div', { class: 'cat-name', text: c.name })
      ]);
      grid.appendChild(item);
    });
    // 末尾追加一个"+"按钮便于快速新增
    const addBtn = el('div', { class: 'cat-item', onclick: () => onAdd() }, [
      el('div', { class: 'cat-icon', style: 'background:#f0f0f0;color:#999;border:2px dashed #ccc;' }, [document.createTextNode('+')]),
      el('div', { class: 'cat-name', text: '新增' })
    ]);
    grid.appendChild(addBtn);
  }

  async function switchType(t) {
    currentType = t;
    tabExpense.className = t === 'expense' ? 'active expense' : '';
    tabIncome.className = t === 'income' ? 'active income' : '';
    cats = await listCategories(currentType);
    renderGrid();
  }

  async function onAdd() {
    await showCategoryForm(null);
  }
  async function onEdit(c) {
    await showCategoryForm(c);
  }

  async function showCategoryForm(cat) {
    const isEdit = !!cat;
    const form = el('div', { style: 'font-size:14px;' });

    const nameInput = el('input', { class: 'input', type: 'text', placeholder: '分类名称', value: cat ? cat.name : '', maxlength: 8 });
    // 类型选择（编辑时锁定，避免类型与流水不匹配）
    let selectedType = cat ? cat.type : currentType;
    const typeRow = el('div', { class: 'type-tabs type-tabs-2', style: 'margin:8px 0;' });
    const tExp = el('button', { class: selectedType === 'expense' ? 'active expense' : '', text: '支出', onclick: () => { if (isEdit) return; selectedType = 'expense'; tExp.className = 'active expense'; tInc.className = ''; } });
    const tInc = el('button', { class: selectedType === 'income' ? 'active income' : '', text: '收入', onclick: () => { if (isEdit) return; selectedType = 'income'; tInc.className = 'active income'; tExp.className = ''; } });
    if (isEdit) {
      tExp.style.opacity = '0.5';
      tInc.style.opacity = '0.5';
      tExp.style.cursor = 'not-allowed';
      tInc.style.cursor = 'not-allowed';
    }
    typeRow.append(tExp, tInc);

    let selectedIcon = cat ? cat.icon : '💰';
    let selectedColor = cat ? cat.color : '#868E96';

    const iconGrid = el('div', { class: 'cat-grid', style: 'margin:8px 0;max-height:160px;overflow-y:auto;' });
    function renderIcons() {
      iconGrid.innerHTML = '';
      ICONS.forEach(ic => {
        const item = el('div', { class: 'cat-item' + (selectedIcon === ic ? ' selected' : ''), onclick: () => { selectedIcon = ic; renderIcons(); } }, [
          el('div', { class: 'cat-icon', style: `background:#f0f0f0;color:#333` }, [document.createTextNode(ic)]),
          el('div', { class: 'cat-name', text: '' })
        ]);
        iconGrid.appendChild(item);
      });
    }
    renderIcons();

    const colorRow = el('div', { style: 'display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;' });
    function renderColors() {
      colorRow.innerHTML = '';
      COLORS.forEach(c => {
        const sw = el('div', { style: `width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:${selectedColor === c ? '3px solid #333' : '3px solid transparent'};`, onclick: () => { selectedColor = c; renderColors(); } });
        colorRow.appendChild(sw);
      });
    }
    renderColors();

    form.append(
      el('label', { class: 'field', style: 'display:block;margin-bottom:8px;', text: '分类名称' }),
      nameInput,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '类型' }),
      typeRow,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择图标' }),
      iconGrid,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择颜色' }),
      colorRow
    );

    const result = await showModal({
      title: isEdit ? '编辑分类' : '新增分类',
      body: form,
      actions: [
        { label: '取消', type: 'ghost', value: 'cancel' },
        ...(isEdit ? [{ label: '删除', type: 'danger', value: 'delete' }] : []),
        { label: '保存', type: 'primary', value: 'save', onClick: () => {
          if (!nameInput.value.trim()) { toast('请输入分类名称'); return false; }
        } }
      ]
    });

    if (result === 'save') {
      const payload = {
        name: nameInput.value.trim(),
        type: selectedType,
        icon: selectedIcon,
        color: selectedColor
      };
      try {
        if (isEdit) {
          await updateCategory(cat.id, payload);
          toast('已更新');
        } else {
          await addCategory(payload);
          toast('已新增');
        }
        cats = await listCategories(currentType);
        renderGrid();
      } catch (e) {
        toast('保存失败：' + (e.message || e));
      }
    } else if (result === 'delete') {
      const ok = await confirmDialog('确定要删除此分类吗？关联的流水记录仍保留但会显示为"未分类"。', { danger: true, okText: '删除' });
      if (ok) {
        try {
          await deleteCategory(cat.id);
          toast('已删除');
          cats = await listCategories(currentType);
          renderGrid();
        } catch (e) {
          toast('删除失败：' + (e.message || e));
        }
      }
    }
  }
}
