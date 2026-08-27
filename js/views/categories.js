// js/views/categories.js — 分类管理页面（支出/收入分类 CRUD + 图标颜色）
import { listCategories, addCategory, updateCategory, deleteCategory, archiveCategory, restoreCategory } from '../categories.js';
import { toast, confirmDialog, showModal, el } from '../ui.js';
import { CATEGORY_ICON_OPTIONS, categoryIconNode, resolveCategoryIconKey, ICON_GROUPS, ICON_META } from '../category-icons.js';

const COLORS = ['#F36F62','#C77C86','#A56C8E','#5BC0D0','#26B982','#15A6A1','#93BF38','#FFC62E','#F39B35','#6677E8'];

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

  async function onAdd() {
    await showCategoryForm(null);
  }
  async function onEdit(c) {
    await showCategoryForm(c);
  }

  async function showCategoryForm(cat) {
    const isEdit = !!cat;
    const form = el('div', { class: 'category-form' });

    const nameInput = el('input', { class: 'category-name-input', type: 'text', 'aria-label': '分类名称', placeholder: '输入分类名称', value: cat ? cat.name : '', maxlength: 8 });
    // 类型选择（编辑时锁定，避免类型与流水不匹配）
    let selectedType = cat ? cat.type : (currentType === 'income' ? 'income' : 'expense');
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

    const exactOption = cat ? CATEGORY_ICON_OPTIONS.find(option => option.token === cat.icon) : null;
    const compatibleOption = cat ? CATEGORY_ICON_OPTIONS.find(option => option.key === resolveCategoryIconKey(cat)) : null;
    let selectedIcon = exactOption?.token || compatibleOption?.token || (selectedType === 'income' ? '💼' : '🍜');
    let selectedColor = cat ? cat.color : '#F36F62';

    const previewIcon = el('div', { class: 'category-preview-icon' });
    const nameCount = el('span', { class: 'category-name-count', text: `${nameInput.value.length}/8` });
    const nameEditor = el('div', { class: 'category-name-editor' }, [previewIcon, nameInput, nameCount]);

    function updatePreview() {
      previewIcon.style.background = `${selectedColor}18`;
      previewIcon.style.color = selectedColor;
      previewIcon.replaceChildren(categoryIconNode({ icon: selectedIcon, name: nameInput.value }, { size: 25 }));
      nameCount.textContent = `${nameInput.value.length}/8`;
    }
    nameInput.addEventListener('input', updatePreview);

    // v2.1.2 图标选择器：分组展示 + 关键字搜索
    const iconSearch = el('input', {
      class: 'input icon-search-input',
      type: 'text',
      placeholder: '搜索图标，如：咖啡 / 宠物 / 旅行',
      maxlength: 12,
      'aria-label': '搜索图标'
    });
    const iconSection = el('div', { class: 'category-icon-section', role: 'listbox', 'aria-label': '图标列表' });

    function buildIconNode(option) {
      return el('button', { class: 'cat-item' + (selectedIcon === option.token ? ' selected' : ''), type: 'button', 'aria-label': `选择${option.label}图标`, onclick: () => { selectedIcon = option.token; renderIcons(); } }, [
        el('div', { class: 'cat-icon category-line-icon' }, [categoryIconNode({ icon: option.token, name: option.label }, { size: 23 })]),
        el('div', { class: 'cat-name', text: option.label })
      ]);
    }
    function renderIcons() {
      const q = iconSearch.value.trim();
      iconSection.innerHTML = '';
      if (q) {
        // 搜索模式：跨分组平铺匹配结果
        const matches = CATEGORY_ICON_OPTIONS.filter(o => o.label.includes(q));
        if (matches.length) {
          const grid = el('div', { class: 'cat-grid category-icon-grid category-icon-grid--flat' });
          matches.forEach(option => grid.appendChild(buildIconNode(option)));
          iconSection.appendChild(grid);
        } else {
          iconSection.appendChild(el('div', { class: 'icon-search-empty' }, [
            el('p', { text: `没有匹配「${q}」的图标` })
          ]));
        }
      } else {
        ICON_GROUPS.forEach(group => {
          const sec = el('div', { class: 'icon-group' });
          sec.appendChild(el('div', { class: 'icon-group-label', text: group.label }));
          const grid = el('div', { class: 'cat-grid category-icon-grid' });
          group.keys.forEach(key => {
            grid.appendChild(buildIconNode({ key, token: ICON_META[key].token, label: ICON_META[key].label }));
          });
          sec.appendChild(grid);
          iconSection.appendChild(sec);
        });
      }
      updatePreview();
    }
    iconSearch.addEventListener('input', () => renderIcons());
    renderIcons();

    const colorRow = el('div', { class: 'category-color-row' });
    function renderColors() {
      colorRow.innerHTML = '';
      COLORS.forEach(c => {
        const sw = el('button', { class: 'category-color-swatch' + (selectedColor === c ? ' selected' : ''), type: 'button', 'aria-label': `选择颜色 ${c}`, style: `--swatch:${c}`, onclick: () => { selectedColor = c; renderColors(); } });
        colorRow.appendChild(sw);
      });
      updatePreview();
    }
    renderColors();

    form.append(
      nameEditor,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '类型' }),
      typeRow,
      el('div', { class: 'category-form-label', text: '选择图标' }),
      iconSearch,
      iconSection,
      el('div', { class: 'category-form-label', text: '选择颜色' }),
      colorRow
    );

    const result = await showModal({
      title: isEdit ? '编辑分类' : '新增分类',
      body: form,
      actions: [
        { label: '取消', type: 'ghost', value: 'cancel' },
        ...(isEdit ? [{ label: cat.archived ? '恢复' : '归档', type: 'ghost', value: cat.archived ? 'restore' : 'archive' }] : []),
        ...(isEdit ? [{ label: '永久删除', type: 'danger', value: 'delete' }] : []),
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
        cats = currentType === 'archived'
          ? (await listCategories(null, { includeArchived: true })).filter(category => category.archived)
          : await listCategories(currentType);
        renderGrid();
      } catch (e) {
        toast('保存失败：' + (e.message || e));
      }
    } else if (result === 'archive') {
      try {
        await archiveCategory(cat.id);
        toast('分类已归档，历史流水仍保留');
        cats = await listCategories(currentType);
        renderGrid();
      } catch (e) {
        toast('归档失败：' + (e.message || e));
      }
    } else if (result === 'restore') {
      try {
        await restoreCategory(cat.id);
        toast('分类已恢复');
        cats = (await listCategories(null, { includeArchived: true })).filter(category => category.archived);
        renderGrid();
      } catch (e) {
        toast('恢复失败：' + (e.message || e));
      }
    } else if (result === 'delete') {
      const ok = await confirmDialog('只有未关联任何流水的分类才能永久删除。确定继续吗？', { danger: true, okText: '永久删除' });
      if (ok) {
        try {
          await deleteCategory(cat.id);
          toast('已删除');
          cats = currentType === 'archived'
            ? (await listCategories(null, { includeArchived: true })).filter(category => category.archived)
            : await listCategories(currentType);
          renderGrid();
        } catch (e) {
          toast('删除失败：' + (e.message || e));
        }
      }
    }
  }
}
