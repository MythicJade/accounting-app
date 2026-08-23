// js/views/accounts.js — accounts management page (重构布局：净资产汇总 + 资金/信用分区)
import { listAccounts, addAccount, updateAccount, deleteAccount, archiveAccount, restoreAccount } from '../accounts.js';
import { getAllAccountBalances, getAssetsSummary, transferMoney } from '../store.js';
import { formatMoney, todayStr } from '../format.js';
import { toast, confirmDialog, showModal, el } from '../ui.js';
import { router } from '../router.js';

export async function renderAccounts(mount) {
  const [accounts, balances, summary] = await Promise.all([
    listAccounts({ includeArchived: true }),
    getAllAccountBalances(),
    getAssetsSummary()
  ]);

  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'back', type: 'button', 'aria-label': '返回首页', onclick: () => location.hash = '#/' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: '账户资产' }),
    el('button', { class: 'btn-text topbar-action', onclick: () => showAccountForm(null) }, [el('span', { text: '新增' })])
  ]);

  // === 顶部净资产汇总 + 右侧两个入口框 ===
  const summaryArea = el('div', { class: 'accounts-summary-area' }, [
    // 左：净资产汇总卡
    el('div', { class: 'card summary-card account-summary-card' }, [
      el('div', { class: 'summary-month', text: '净资产' }),
      el('div', { class: 'summary-balance' }, [
        el('div', { class: 'summary-amount', text: formatMoney(summary.netAssets) })
      ]),
      el('div', { class: 'summary-row' }, [
        el('div', { class: 'summary-item' }, [
          el('div', { class: 'summary-sub-label', text: '总资产' }),
          el('div', { class: 'summary-sub-amount income', text: formatMoney(summary.totalAssets) })
        ]),
        el('div', { class: 'summary-item' }, [
          el('div', { class: 'summary-sub-label', text: '总负债' }),
          el('div', { class: 'summary-sub-amount expense', text: formatMoney(summary.totalLiabilities) })
        ])
      ])
    ]),
    // 右：两个小入口框
    el('div', { class: 'accounts-entry-boxes' }, [
      el('button', { class: 'entry-box', type: 'button', onclick: () => location.hash = '#/assets' }, [
        el('div', { class: 'entry-icon entry-icon-trend' }, [
          el('svg', { viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'aria-hidden': 'true', html: '<path d="M4 17 9 12l3 3 7-8"/><path d="M14 7h5v5"/>' })
        ]),
        el('div', { class: 'entry-label', text: '资产趋势' })
      ]),
      el('button', { class: 'entry-box', type: 'button', onclick: () => showAccountForm(null) }, [
        el('div', { class: 'entry-icon entry-icon-add' }, [
          el('svg', { viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'aria-hidden': 'true', html: '<path d="M12 5v14M5 12h14"/>' })
        ]),
        el('div', { class: 'entry-label', text: '增加账户' })
      ])
    ])
  ]);

  // === 下方账户分区（资金/信用 上下纵向排列）===
  const assetAccounts = accounts.filter(a => !a.archived && a.type !== 'credit');
  const creditAccounts = accounts.filter(a => !a.archived && a.type === 'credit');
  const archivedAccounts = accounts.filter(a => a.archived);

  const listsArea = el('div', { class: 'account-lists' });

  // 资金分区
  listsArea.appendChild(buildSection('资金', 'asset', summary.byType.asset || 0, assetAccounts, balances));
  // 信用分区
  listsArea.appendChild(buildSection('信用', 'credit', summary.byType.credit || 0, creditAccounts, balances));
  if (archivedAccounts.length) {
    const archivedSubtotal = archivedAccounts.reduce((sum, account) => sum + (balances.get(account.id) || 0), 0);
    listsArea.appendChild(buildSection('已归档', 'archived', archivedSubtotal, archivedAccounts, balances));
  }

  // 转账按钮
  const transferBtn = el('button', {
    class: 'btn btn-block',
    style: 'margin-top:8px;',
    onclick: onTransfer
  }, [el('span', { text: '🔄 账户间转账' })]);

  mount.append(topbar, summaryArea, listsArea, transferBtn);

  // === 构建单个分区（标题 + 小计 + 账户卡网格）===
  function buildSection(title, sectionType, subtotal, accs, balances) {
    const grid = el('div', { class: 'account-section-grid' });
    if (accs.length === 0) {
      grid.appendChild(el('div', { class: 'account-empty', text: '暂无账户' }));
    } else {
      accs.forEach(acc => {
        const bal = balances.get(acc.id) || 0;
        const balClass = bal < 0 ? 'expense' : '';
        const card = el('button', {
          class: 'account-mini-card' + (acc.type === 'credit' ? ' credit' : '') + (acc.archived ? ' archived' : ''),
          type: 'button',
          style: `--account-color:${acc.color};--account-ink:${contrastInk(acc.color)}`,
          onclick: () => location.hash = '#/accounts/' + acc.id
        }, [
          el('div', { class: 'mini-icon' }, [document.createTextNode(acc.icon)]),
          el('div', { class: 'mini-copy' }, [
            el('div', { class: 'mini-name', text: acc.name }),
            el('div', { class: 'mini-kind', text: acc.archived ? '历史账户' : (acc.type === 'credit' ? '信用账户' : '资金账户') })
          ]),
          el('div', { class: 'mini-amount ' + balClass, text: formatMoney(bal) })
        ]);
        grid.appendChild(card);
      });
    }
    return el('section', { class: 'card account-type-section' }, [
      el('div', { class: 'account-section-head' }, [
        el('span', { class: `account-section-dot ${sectionType}`, 'aria-hidden': 'true' }),
        el('span', { class: 'section-title', text: title }),
        el('span', { class: 'section-subtotal ' + (subtotal < 0 ? 'expense' : ''), text: formatMoney(subtotal) })
      ]),
      grid
    ]);
  }

  // === Handlers ===
  async function showAccountForm(acc) {
    const isEdit = !!acc;
    const form = el('div', { style: 'font-size:14px;' });

    const nameInput = el('input', { class: 'input', type: 'text', 'aria-label': '账户名称', placeholder: '账户名称', value: acc ? acc.name : '', maxlength: 12 });
    const openingInput = el('input', { class: 'input', type: 'number', 'aria-label': '期初余额', placeholder: '0.00', step: '0.01', value: (acc && acc.openingBalance != null) ? acc.openingBalance : '' });
    const openingDateInput = el('input', { class: 'input', type: 'date', 'aria-label': '期初日期', value: acc?.openingDate || todayStr() });

    // 账户类型选择（资金/信用）
    let selectedType = acc ? (acc.type === 'credit' ? 'credit' : 'asset') : 'asset';
    const typeToggle = el('div', { class: 'type-toggle' });
    const assetBtn = el('button', { class: 'type-btn' + (selectedType === 'asset' ? ' active' : ''), text: '💰 资金' });
    const creditBtn = el('button', { class: 'type-btn' + (selectedType === 'credit' ? ' active' : ''), text: '💳 信用' });
    assetBtn.addEventListener('click', () => { selectedType = 'asset'; assetBtn.classList.add('active'); creditBtn.classList.remove('active'); });
    creditBtn.addEventListener('click', () => { selectedType = 'credit'; creditBtn.classList.add('active'); assetBtn.classList.remove('active'); });
    typeToggle.append(assetBtn, creditBtn);

    const icons = selectedType === 'credit'
      ? ['💳', '💙', '🏦', '📱', '📈', '💰', '🏠', '👛', '💎', '💵', '💚', '💛']
      : ['💵', '💳', '💙', '💚', '💛', '🏦', '📱', '💰', '📈', '🏠', '👛', '💎'];
    let selectedIcon = acc ? acc.icon : (selectedType === 'credit' ? '💳' : '💰');
    const colors = ['#007AFF', '#34C759', '#5856D6', '#FF9500', '#FF3B30', '#FF2D55', '#AF52DE', '#5AC8FA', '#FFCC00', '#00C7BE'];
    let selectedColor = acc ? acc.color : '#007AFF';

    const iconGrid = el('div', { class: 'cat-grid', style: 'margin:8px 0;' });
    function renderIcons() {
      iconGrid.innerHTML = '';
      icons.forEach(ic => {
        const item = el('button', { class: 'cat-item' + (selectedIcon === ic ? ' selected' : ''), type: 'button', 'aria-label': `选择图标 ${ic}`, onclick: () => { selectedIcon = ic; renderIcons(); } }, [
          el('div', { class: 'cat-icon', style: 'background:var(--fill-1);color:var(--text)' }, [document.createTextNode(ic)]),
          el('div', { class: 'cat-name', text: '' })
        ]);
        iconGrid.appendChild(item);
      });
    }
    renderIcons();

    const colorRow = el('div', { style: 'display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;' });
    function renderColors() {
      colorRow.innerHTML = '';
      colors.forEach(c => {
        const sw = el('button', { type: 'button', 'aria-label': `选择颜色 ${c}`, style: `width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:${selectedColor === c ? '3px solid var(--text)' : '3px solid transparent'};`, onclick: () => { selectedColor = c; renderColors(); } });
        colorRow.appendChild(sw);
      });
    }
    renderColors();

    form.append(
      el('label', { class: 'field', style: 'display:block;margin-bottom:8px;', text: '账户名称' }),
      nameInput,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '账户类型' }),
      typeToggle,
      el('label', { class: 'text-sm text-2', style: 'display:block;margin:12px 0 4px;', text: '期初余额（创建账户时的初始金额，可填负数表示欠款）' }),
      openingInput,
      el('label', { class: 'text-sm text-2', style: 'display:block;margin:12px 0 4px;', text: '期初日期（余额从该日期起计入）' }),
      openingDateInput,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择图标' }),
      iconGrid,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择颜色' }),
      colorRow
    );

    const result = await showModal({
      title: isEdit ? '编辑账户' : '新增账户',
      body: form,
      actions: [
        { label: '取消', type: 'ghost', value: 'cancel' },
        ...(isEdit ? [{ label: acc.archived ? '恢复' : '归档', type: 'ghost', value: acc.archived ? 'restore' : 'archive' }] : []),
        ...(isEdit ? [{ label: '永久删除', type: 'danger', value: 'delete' }] : []),
        { label: '保存', type: 'primary', value: 'save', onClick: () => {
          if (!nameInput.value.trim()) { toast('请输入账户名称'); return false; }
        } }
      ]
    });

    if (result === 'save') {
      const openingBal = openingInput.value === '' ? 0 : (parseFloat(openingInput.value) || 0);
      const payload = {
        name: nameInput.value.trim(),
        icon: selectedIcon,
        color: selectedColor,
        type: selectedType,
        openingBalance: openingBal,
        openingDate: openingDateInput.value
      };
      try {
        if (isEdit) {
          await updateAccount(acc.id, payload);
          toast('已更新');
        } else {
          await addAccount(payload);
          toast('已新增');
        }
        router.dispatch();
      } catch (e) {
        toast('保存失败：' + (e.message || e));
      }
    } else if (result === 'archive') {
      await archiveAccount(acc.id);
      toast('账户已归档，历史流水仍保留');
      router.dispatch();
    } else if (result === 'restore') {
      await restoreAccount(acc.id);
      toast('账户已恢复');
      router.dispatch();
    } else if (result === 'delete') {
      const ok = await confirmDialog('只有未关联流水的账户才能永久删除。确定继续吗？', { danger: true, okText: '永久删除' });
      if (ok) {
        try {
          await deleteAccount(acc.id);
          toast('已删除');
          router.dispatch();
        } catch (e) {
          toast('删除失败：' + (e.message || e));
        }
      }
    }
  }

  async function onTransfer() {
    const accs = await listAccounts();
    if (accs.length < 2) {
      toast('至少需要 2 个账户才能转账');
      return;
    }

    const form = el('div', { style: 'font-size:14px;' });
    let fromId = accs[0].id;
    let toId = accs[1].id;
    let amount = '';
    let note = '';

    const fromRow = el('div', { class: 'field', style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;' }, [
      el('label', { text: '从', style: 'flex:0 0 40px;' })
    ]);
    const fromSelect = el('select', { class: 'input', style: 'flex:1;' });
    accs.forEach(a => {
      const opt = el('option', { value: a.id, text: a.icon + ' ' + a.name });
      fromSelect.appendChild(opt);
    });
    fromSelect.value = fromId;
    fromSelect.addEventListener('change', e => { fromId = e.target.value; });
    fromRow.appendChild(fromSelect);

    const toRow = el('div', { class: 'field', style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;' }, [
      el('label', { text: '到', style: 'flex:0 0 40px;' })
    ]);
    const toSelect = el('select', { class: 'input', style: 'flex:1;' });
    accs.forEach(a => {
      const opt = el('option', { value: a.id, text: a.icon + ' ' + a.name });
      toSelect.appendChild(opt);
    });
    toSelect.value = toId;
    toSelect.addEventListener('change', e => { toId = e.target.value; });
    toRow.appendChild(toSelect);

    const amountInput = el('input', { class: 'input', type: 'number', placeholder: '金额', step: '0.01' });
    amountInput.addEventListener('input', e => { amount = e.target.value; });

    const noteInput = el('input', { class: 'input', type: 'text', placeholder: '备注（可选）', maxlength: 50 });
    noteInput.addEventListener('input', e => { note = e.target.value; });

    form.append(
      fromRow,
      toRow,
      el('label', { class: 'text-sm text-2', style: 'display:block;margin:8px 0 4px;', text: '金额' }),
      amountInput,
      el('label', { class: 'text-sm text-2', style: 'display:block;margin:8px 0 4px;', text: '备注' }),
      noteInput
    );

    const result = await showModal({
      title: '🔄 账户间转账',
      body: form,
      actions: [
        { label: '取消', type: 'ghost', value: 'cancel' },
        { label: '转账', type: 'primary', value: 'ok', onClick: () => {
          if (fromId === toId) { toast('源账户和目标账户不能相同'); return false; }
          const amt = parseFloat(amount);
          if (isNaN(amt) || amt <= 0) { toast('请输入有效金额'); return false; }
        } }
      ]
    });

    if (result === 'ok') {
      try {
        await transferMoney({ fromId, toId, amount: parseFloat(amount), note, date: todayStr() });
        toast('转账成功');
        router.dispatch();
      } catch (e) {
        toast('转账失败：' + (e.message || e));
      }
    }
  }

  // 右滑返回首页
  let touchStartX = 0, touchStartY = 0, touchActive = false;
  const onStart = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchActive = true;
  };
  const onEnd = (e) => {
    if (!touchActive) return;
    touchActive = false;
    const touch = e.changedTouches ? e.changedTouches[0] : e;
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    // 右滑返回：deltaX > 80 且水平为主（避免误触发垂直滚动）
    if (deltaX > 80 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      location.hash = '#/';
    }
  };
  mount.addEventListener('touchstart', onStart, { passive: true });
  mount.addEventListener('touchend', onEnd, { passive: true });

  // 返回 cleanup，路由切换时移除监听
  return () => {
    mount.removeEventListener('touchstart', onStart);
    mount.removeEventListener('touchend', onEnd);
  };
}

function contrastInk(hex) {
  const value = String(hex || '').replace('#', '');
  const normalized = value.length === 3 ? value.split('').map(ch => ch + ch).join('') : value;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '#ffffff';
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 172 ? '#25272b' : '#ffffff';
}
