// js/views/accounts.js — accounts management page (list + CRUD + transfer)
import { listAccounts, addAccount, updateAccount, deleteAccount } from '../accounts.js';
import { getAllAccountBalances, getTotalBalance, transferMoney } from '../store.js';
import { formatMoney, todayStr } from '../format.js';
import { toast, confirmDialog, promptDialog, showModal, el } from '../ui.js';
import { router } from '../router.js';

export async function renderAccounts(mount) {
  const [accounts, balances, total] = await Promise.all([
    listAccounts(),
    getAllAccountBalances(),
    getTotalBalance()
  ]);

  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'back', onclick: () => location.hash = '#/settings' }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor', html: '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>' })
    ]),
    el('h1', { text: '账户管理' }),
    el('button', { class: 'btn-text', onclick: () => onAdd() }, [el('span', { text: '+ 新增' })])
  ]);

  // Total assets card
  const totalCard = el('section', { class: 'card summary-card' }, [
    el('div', { class: 'summary-month', text: '净资产合计' }),
    el('div', { class: 'summary-balance' }, [
      el('span', { class: 'summary-label', text: '所有账户合计' }),
      el('div', { class: 'summary-amount', text: formatMoney(total) })
    ]),
    el('button', { class: 'btn btn-block mt-8', onclick: onTransfer, style: 'background:var(--c-primary);color:#fff;' }, [
      el('span', { text: '🔄 账户间转账' })
    ])
  ]);

  // Account list
  const listCard = el('section', { class: 'card' }, [
    el('div', { class: 'card-title', text: '账户列表（点击编辑）' })
  ]);
  const listEl = el('div');
  if (accounts.length === 0) {
    listEl.appendChild(el('div', { class: 'empty' }, [el('p', { text: '暂无账户' })]));
  } else {
    accounts.forEach(acc => {
      const bal = balances.get(acc.id) || 0;
      const balClass = bal < 0 ? 'expense' : '';
      const opening = acc.openingBalance ? Number(acc.openingBalance) : 0;
      const openingLabel = opening !== 0 ? ('期初: ' + formatMoney(opening) + ' · ' + (acc.builtin ? '内置' : '自定义')) : (acc.builtin ? '内置账户' : '自定义');
      const item = el('div', { class: 'list-item account-item', onclick: () => onEdit(acc) }, [
        el('div', { class: 'icon', style: `background:${acc.color}22;color:${acc.color}` }, [document.createTextNode(acc.icon)]),
        el('div', { class: 'meta' }, [
          el('div', { class: 'top' }, [
            el('span', { class: 'name', text: acc.name + (acc.builtin ? '' : '') }),
            el('span', { class: 'amount ' + balClass, text: formatMoney(bal) })
          ]),
          el('div', { class: 'between text-sm text-3' }, [
            el('span', { text: openingLabel }),
            el('span', { text: '›' })
          ])
        ])
      });
      listEl.appendChild(item);
    });
  }
  listCard.appendChild(listEl);

  mount.append(topbar, totalCard, listCard);

  // === Handlers ===
  async function onAdd() {
    await showAccountForm(null);
  }

  async function onEdit(acc) {
    await showAccountForm(acc);
  }

  async function showAccountForm(acc) {
    const isEdit = !!acc;
    const form = el('div', { style: 'font-size:14px;' });

    const nameInput = el('input', { class: 'input', type: 'text', placeholder: '账户名称', value: acc ? acc.name : '', maxlength: 12 });
    // 期初余额输入：仅创建/编辑账户时设置（不影响流水计算逻辑中的余额公式）
    const openingInput = el('input', { class: 'input', type: 'number', placeholder: '0.00', step: '0.01', value: (acc && acc.openingBalance != null) ? acc.openingBalance : '' });
    const icons = ['💵','💳','💙','💚','💛','🏦','📱','💰','📈','🏠','👛','💎'];
    let selectedIcon = acc ? acc.icon : '💰';
    const colors = ['#52C41A','#1677FF','#07C160','#722ED1','#FA8C16','#FF6B6B','#13C2C2','#868E96','#FAAD14','#EB2F96'];
    let selectedColor = acc ? acc.color : '#868E96';

    const iconGrid = el('div', { class: 'cat-grid', style: 'margin:8px 0;' });
    function renderIcons() {
      iconGrid.innerHTML = '';
      icons.forEach(ic => {
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
      colors.forEach(c => {
        const sw = el('div', { style: `width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:${selectedColor === c ? '3px solid #333' : '3px solid transparent'};`, onclick: () => { selectedColor = c; renderColors(); } });
        colorRow.appendChild(sw);
      });
    }
    renderColors();

    form.append(
      el('label', { class: 'field', style: 'display:block;margin-bottom:8px;', text: '账户名称' }),
      nameInput,
      el('label', { class: 'text-sm text-2', style: 'display:block;margin:12px 0 4px;', text: '期初余额（创建账户时的初始金额，可填负数表示欠款）' }),
      openingInput,
      el('div', { class: 'text-sm text-2 mt-8', style: 'margin:12px 0 4px;', text: '选择图标' }),
      iconGrid,
      el('div', { class: 'text-sm text-2', style: 'margin:12px 0 4px;', text: '选择颜色' }),
      colorRow
    );

    const result = await showModal({
      title: isEdit ? '编辑账户' : '新增账户',
      body: form,
      actions: [
        { label: '取消', type: 'ghost', value: 'cancel' },
        // 默认为空后，所有账户均可删除（builtin 仅为兼容历史数据）
        ...(isEdit ? [{ label: '删除', type: 'danger', value: 'delete' }] : []),
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
        openingBalance: openingBal
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
    } else if (result === 'delete') {
      const ok = await confirmDialog('确定要删除此账户吗？关联的流水记录仍保留但会显示为未分类。', { danger: true, okText: '删除' });
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
}
