// js/views/categories.js — 分类管理页面（支出/收入分类 CRUD + 图标颜色）
import { listCategories, getCategory, addCategory, updateCategory, deleteCategory, archiveCategory, restoreCategory } from '../categories.js';
import { toast, confirmDialog, el } from '../ui.js';
import { CATEGORY_ICON_OPTIONS, categoryIconNode, resolveCategoryIconKey, ICON_GROUPS, ICON_META } from '../category-icons.js';

const COLORS = ['#FFC62E','#FFD36B','#FFAE72','#FFA526','#FF7248','#FF94A8','#F36AA8','#C77C86','#A56C8E','#5BC0D0','#26B982','#15A6A1','#93BF38','#6677E8'];
const MAX_NAME_LENGTH = 4;

export async function renderCategories(mount) {
  let currentType = 'expense';
  let cats = await listCategories(currentType);

  const addTopButton = el('button', { class: 'btn-text', type: 'button', onclick: () => onAdd() }, [el('span', { text: '+ 新增' })]);
  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'back', type: 'button', 'aria-label': '返回设置', onclick: () => location.hash = '#/settings' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: '分类管理' }),
    addTopButton
  ]);

  // 类型切换 tabs
  const tabs = el('div', { class: 'type-tabs type-tabs-3' });
  const tabExpense = el('button', { class: currentType === 'expense' ? 'active expense' : '', text: '支出', onclick: () => switchType('expense') });
  const tabIncome = el('button', { class: currentType === 'income' ? 'active income' : '', text: '收入', onclick: () => switchType('income') });
  const tabArchived = el('button', { text: '已归档', onclick: () => switchType('archived') });
  tabs.append(tabExpense, tabIncome, tabArchived);

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
      const item = el('button', { class: 'cat-item', onclick: () => onEdit(c), 'aria-label': `${c.name}，${c.archived ? '已归档' : '编辑分类'}` }, [
        el('div', { class: 'cat-icon category-line-icon', style: `background:${c.color}18;color:${c.color}` }, [categoryIconNode(c, { size: 23 })]),
        el('div', { class: 'cat-name', text: c.name })
      ]);
      grid.appendChild(item);
    });
    // 末尾追加一个"+"按钮便于快速新增
    if (currentType === 'archived') return;
    const addBtn = el('button', { class: 'cat-item', onclick: () => onAdd(), 'aria-label': '新增分类' }, [
      el('div', { class: 'cat-icon', style: 'background:var(--fill-1);color:var(--text-3);border:2px dashed var(--fill-2);' }, [document.createTextNode('+')]),
      el('div', { class: 'cat-name', text: '新增' })
    ]);
    grid.appendChild(addBtn);
  }

  async function switchType(t) {
    currentType = t;
    tabExpense.className = t === 'expense' ? 'active expense' : '';
    tabIncome.className = t === 'income' ? 'active income' : '';
    tabArchived.className = t === 'archived' ? 'active transfer' : '';
    addTopButton.hidden = t === 'archived';
    cats = t === 'archived'
      ? (await listCategories(null, { includeArchived: true })).filter(category => category.archived)
      : await listCategories(t);
    renderGrid();
  }

  function onAdd() {
    const type = currentType === 'income' ? 'income' : 'expense';
    location.hash = `#/categories/new/${type}`;
  }
  function onEdit(c) {
    location.hash = `#/categories/edit/${encodeURIComponent(c.id)}`;
  }
}

export async function renderCategoryEditor(mount, params = {}) {
  const isEdit = Boolean(params.id);
  const category = isEdit ? await getCategory(params.id) : null;
  if (isEdit && !category) {
    toast('分类不存在');
    location.hash = '#/categories';
    return;
  }

  const selectedType = category?.type || (params.type === 'income' ? 'income' : 'expense');
  const exactOption = category ? CATEGORY_ICON_OPTIONS.find(option => option.token === category.icon) : null;
  const compatibleOption = category ? CATEGORY_ICON_OPTIONS.find(option => option.key === resolveCategoryIconKey(category)) : null;
  let selectedIcon = exactOption?.token || compatibleOption?.token || (selectedType === 'income' ? ICON_META.salary.token : ICON_META.food.token);
  let selectedColor = category?.color || COLORS[0];
  let selectedKey = CATEGORY_ICON_OPTIONS.find(option => option.token === selectedIcon)?.key || (selectedType === 'income' ? 'salary' : 'food');
  let activeGroupId = ICON_GROUPS.find(group => group.keys.includes(selectedKey))?.id || ICON_GROUPS[0].id;
  let saving = false;

  const editor = el('section', { class: 'category-editor-page', tabindex: '-1', 'aria-label': isEdit ? '编辑分类' : '添加分类' });
  const backButton = el('button', { class: 'category-editor-back', type: 'button', 'aria-label': '返回分类管理', onclick: () => { location.hash = '#/categories'; } }, [
    el('svg', { viewBox: '0 0 24 24', width: '28', height: '28', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'aria-hidden': 'true', html: '<path d="m15 5-7 7 7 7"/>' })
  ]);
  const headerActions = el('div', { class: 'category-editor-head-actions' });
  const header = el('header', { class: 'category-editor-head' }, [
    backButton,
    el('h1', { text: isEdit ? '编辑分类' : '添加分类' }),
    headerActions
  ]);

  const previewIcon = el('span', { class: 'category-editor-preview', 'aria-hidden': 'true' });
  const nameInput = el('input', {
    class: 'category-editor-name', type: 'text', value: category?.name || '',
    placeholder: '请输入分类名称', maxlength: String(MAX_NAME_LENGTH),
    'aria-label': '分类名称', autocomplete: 'off', enterkeyhint: 'done'
  });
  const nameCount = el('span', { class: 'category-editor-count' });
  const nameCard = el('div', { class: 'category-editor-name-card' }, [previewIcon, nameInput, nameCount]);

  const colorRow = el('div', { class: 'category-editor-colors', role: 'radiogroup', 'aria-label': '分类颜色' });
  const colorCard = el('section', { class: 'category-editor-color-card' }, [colorRow]);
  const groupRail = el('div', { class: 'category-editor-groups', role: 'tablist', 'aria-label': '图标分组' });
  const iconGrid = el('div', { class: 'category-editor-icons', role: 'listbox', 'aria-label': '分类图标' });
  const iconPicker = el('div', { class: 'category-editor-picker' }, [groupRail, iconGrid]);

  const secondaryButton = el('button', {
    class: 'category-editor-action secondary', type: 'button',
    text: isEdit ? (category.archived ? '恢复分类' : '归档分类') : '继续添加',
    onclick: () => { if (isEdit) toggleArchive(); else saveCategory(true); }
  });
  const saveButton = el('button', { class: 'category-editor-action primary', type: 'button', text: '保存', onclick: () => saveCategory(false) });
  const actionBar = el('footer', { class: 'category-editor-actions' }, [secondaryButton, saveButton]);

  editor.append(
    header,
    el('div', { class: 'category-editor-scroll' }, [
      nameCard,
      colorCard,
      el('div', { class: 'category-editor-label', text: '分类图标' }),
      iconPicker
    ]),
    actionBar
  );
  mount.appendChild(editor);
  document.body.classList.add('route-category-editor');

  if (isEdit) {
    headerActions.appendChild(el('button', { class: 'category-editor-delete', type: 'button', text: '删除', onclick: deleteCurrent }));
  } else {
    headerActions.appendChild(el('span', { class: 'category-editor-head-spacer' }));
  }

  function refreshPreview() {
    previewIcon.style.background = selectedColor;
    previewIcon.replaceChildren(categoryIconNode({ icon: selectedIcon, name: nameInput.value }, { size: 29 }));
    nameCount.textContent = `${nameInput.value.length}/${MAX_NAME_LENGTH}`;
    nameCount.classList.toggle('over', nameInput.value.length > MAX_NAME_LENGTH);
  }

  function renderColors() {
    colorRow.replaceChildren(...COLORS.map(color => el('button', {
      class: 'category-editor-swatch' + (selectedColor === color ? ' selected' : ''),
      type: 'button', role: 'radio', 'aria-checked': String(selectedColor === color),
      'aria-label': `选择颜色 ${color}`, style: `--swatch:${color}`,
      onclick: () => { selectedColor = color; renderColors(); refreshPreview(); }
    }, selectedColor === color ? [el('span', { text: '✓', 'aria-hidden': 'true' })] : [])));
  }

  function renderGroups() {
    groupRail.replaceChildren(...ICON_GROUPS.map(group => el('button', {
      class: 'category-editor-group' + (activeGroupId === group.id ? ' active' : ''),
      type: 'button', role: 'tab', 'aria-selected': String(activeGroupId === group.id),
      text: group.short || group.label.slice(0, 1),
      'aria-label': group.label,
      onclick: () => { activeGroupId = group.id; renderGroups(); renderIcons(); }
    })));
  }

  function renderIcons() {
    const group = ICON_GROUPS.find(item => item.id === activeGroupId) || ICON_GROUPS[0];
    iconGrid.replaceChildren(...group.keys.map(key => {
      const meta = ICON_META[key];
      const selected = selectedIcon === meta.token;
      return el('button', {
        class: 'category-editor-icon' + (selected ? ' selected' : ''), type: 'button',
        role: 'option', 'aria-selected': String(selected), 'aria-label': `选择${meta.label}图标`,
        onclick: () => { selectedIcon = meta.token; selectedKey = key; renderIcons(); refreshPreview(); }
      }, [categoryIconNode({ icon: meta.token, name: meta.label }, { size: 27 }), el('span', { text: meta.label })]);
    }));
    iconGrid.scrollTop = 0;
  }

  nameInput.addEventListener('input', refreshPreview);
  renderColors();
  renderGroups();
  renderIcons();
  refreshPreview();

  async function saveCategory(keepAdding) {
    if (saving) return;
    const name = nameInput.value.trim();
    if (!name) { toast('请输入分类名称'); return; }
    if (name.length > MAX_NAME_LENGTH) { toast(`分类名称最多 ${MAX_NAME_LENGTH} 个字`); return; }
    saving = true;
    saveButton.disabled = true;
    secondaryButton.disabled = true;
    try {
      const payload = { name, type: selectedType, icon: selectedIcon, color: selectedColor };
      if (isEdit) {
        await updateCategory(category.id, payload);
        toast('分类已更新');
      } else {
        await addCategory(payload);
        toast('分类已添加');
      }
      if (keepAdding && !isEdit) {
        nameInput.value = '';
        selectedIcon = selectedType === 'income' ? ICON_META.salary.token : ICON_META.food.token;
        selectedKey = selectedType === 'income' ? 'salary' : 'food';
        activeGroupId = ICON_GROUPS.find(group => group.keys.includes(selectedKey))?.id || ICON_GROUPS[0].id;
        renderGroups();
        renderIcons();
        refreshPreview();
        editor.focus({ preventScroll: true });
      } else {
        location.hash = '#/categories';
      }
    } catch (error) {
      toast('保存失败：' + (error.message || error));
    } finally {
      saving = false;
      saveButton.disabled = false;
      secondaryButton.disabled = false;
    }
  }

  async function toggleArchive() {
    if (saving) return;
    try {
      if (category.archived) {
        await restoreCategory(category.id);
        toast('分类已恢复');
      } else {
        await archiveCategory(category.id);
        toast('分类已归档，历史流水仍保留');
      }
      location.hash = '#/categories';
    } catch (error) {
      toast('操作失败：' + (error.message || error));
    }
  }

  async function deleteCurrent() {
    const ok = await confirmDialog('只有未关联任何流水的分类才能永久删除。确定继续吗？', { danger: true, okText: '永久删除' });
    if (!ok) return;
    try {
      await deleteCategory(category.id);
      toast('分类已删除');
      location.hash = '#/categories';
    } catch (error) {
      toast('删除失败：' + (error.message || error));
    }
  }

  return () => {
    document.body.classList.remove('route-category-editor');
  };
}
