// js/views/settings.js — settings: export/import/clear + about
import { exportAll, importAll, previewBackupImport, clearAllData, countTransactions, getAllTransactions, getAssetsSummary, monthlySummary, getBudget } from '../store.js';
import { formatMoney, currentMonthKey } from '../format.js';
import { exportToExcel, previewExcelImport, importParsedData } from '../excel-io.js';
import { toast, confirmDialog, showModal, promptDialog, el } from '../ui.js';
import { encryptBackup, decryptBackup, isEncryptedBackup } from '../backup-crypto.js';
import { router } from '../router.js';
import { APP_VERSION } from '../version.js';
import { isNativeApp, shareTextFile } from '../native-bridge.js';
import { THEMES, getThemeKey, setThemeKey } from '../theme.js';

export async function renderSettings(mount) {
  // ===== v2.3.0 用户头部 + 功能台数据 =====
  const count = await countTransactions();
  let streakDays = 1;
  try {
    const all = await getAllTransactions();
    if (all.length) {
      let minDate = null;
      all.forEach(t => { if (!minDate || t.date < minDate) minDate = t.date; });
      const d0 = new Date(minDate + 'T00:00:00');
      streakDays = Math.max(1, Math.floor((Date.now() - d0.getTime()) / 86400000) + 1);
    }
  } catch (e) { /* ignore */ }
  const assets = await getAssetsSummary();
  const mk = currentMonthKey();
  const [monthSum, monthBudget] = await Promise.all([monthlySummary(mk, null), getBudget(mk)]);
  const goalLimit = monthBudget ? monthBudget.limit : 0;
  const goalPct = goalLimit > 0 ? Math.min(100, Math.round(monthSum.expense / goalLimit * 100)) : 0;

  const profileHead = el('header', { class: 'profile-head' }, [
    el('div', { class: 'profile-avatar', 'aria-hidden': 'true', text: '📒' }),
    el('div', { class: 'profile-main' }, [
      el('div', { class: 'profile-name' }, [
        document.createTextNode('我的记账'),
        el('span', { class: 'profile-badge', text: 'v' + APP_VERSION })
      ]),
      el('div', { class: 'profile-streak' }, [
        document.createTextNode('坚持记账的第 '),
        el('b', { class: 'streak-num', text: String(streakDays) }),
        document.createTextNode(` 天 · 已记 ${count} 笔`)
      ])
    ]),
    el('button', { class: 'profile-gear', type: 'button', 'aria-label': '关于', onclick: onShowAbout }, [
      el('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'aria-hidden': 'true', html: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>' })
    ])
  ]);

  // 快捷功能 4×2 图标格
  const quickDefs = [
    { icon: '📤', label: '导出数据', run: onExport },
    { icon: '📥', label: '导入数据', run: onImport },
    { icon: '📊', label: 'Excel导出', run: onExportExcel },
    { icon: '📑', label: 'Excel导入', run: onImportExcel },
    { icon: '🎯', label: '预算管理', run: () => { location.hash = '#/budget'; } },
    { icon: '💳', label: '账户管理', run: () => { location.hash = '#/accounts'; } },
    { icon: '🏷️', label: '分类管理', run: () => { location.hash = '#/categories'; } },
    { icon: '📱', label: '安装/帮助', run: onShowInstallGuide }
  ];
  const quickCard = el('section', { class: 'card quick-card' }, [
    el('div', { class: 'quick-grid' },
      quickDefs.map(d => el('button', { class: 'quick-tile', type: 'button', onclick: d.run }, [
        el('span', { class: 'quick-icon', 'aria-hidden': 'true', text: d.icon }),
        el('span', { class: 'lbl', text: d.label })
      ]))
    )
  ]);

  // 净资产总览卡
  const naCard = el('section', { class: 'card na-card' }, [
    el('div', { class: 'na-main' }, [
      el('div', { class: 'na-label', text: '净资产' }),
      el('div', { class: 'na-value', text: formatMoney(assets.netAssets) }),
      el('div', { class: 'na-sub' }, [
        el('span', { text: '资产 ' + formatMoney(assets.totalAssets) }),
        el('span', { class: 'neg', text: '负债 ' + formatMoney(assets.totalLiabilities) })
      ])
    ]),
    el('div', { class: 'na-div', 'aria-hidden': 'true' }),
    el('a', { class: 'na-link', href: '#/assets' }, [
      el('span', { class: 'ic', 'aria-hidden': 'true', text: '🏦' }),
      el('span', { text: '查看总资产' })
    ])
  ]);

  // 本月预算完成度卡
  const goalCard = el('section', { class: 'card goal-card' }, [
    el('div', { class: 'goal-top' }, [
      el('span', { class: 'goal-label', text: goalLimit > 0 ? '本月预算完成度' : '本月预算' }),
      el('span', { class: 'goal-pct', text: goalLimit > 0 ? `${goalPct}%` : '未设置' })
    ]),
    el('div', { class: 'goal-bar' }, [
      el('i', { class: goalPct >= 100 ? 'over' : '', style: `width:${goalLimit > 0 ? goalPct : 0}%` })
    ]),
    el('a', { class: 'goal-link', href: '#/budget', text: goalLimit > 0 ? `已消费 ${formatMoney(monthSum.expense)} / 预算 ${formatMoney(goalLimit)} · 管理 ›` : '设置预算，让消费更有数 ›' })
  ]);

  // 功能管理：首页显示开关（行内开关，设置即时生效于下次进入首页）
  const prefGet = (k) => { try { return localStorage.getItem(k) !== '0'; } catch (e) { return true; } };
  const prefSet = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* ignore */ } };
  const switchDefs = [
    { key: 'pref-home-gauge', title: '首页预算仪表', desc: '关闭后首页隐藏半圆预算卡' },
    { key: 'pref-home-wallet', title: '首页资产入口', desc: '关闭后隐藏顶栏右侧钱包按钮' }
  ];
  const switchCard = el('section', { class: 'card switch-card' }, [
    el('div', { class: 'card-title section-heading', text: '功能管理' }),
    ...switchDefs.map(d => {
      const toggle = el('button', {
        class: 'sw-toggle', type: 'button', role: 'switch',
        'aria-checked': String(prefGet(d.key)),
        'aria-label': d.title,
        onclick: () => {
          const next = toggle.getAttribute('aria-checked') !== 'true';
          toggle.setAttribute('aria-checked', String(next));
          prefSet(d.key, next);
        }
      });
      return el('div', { class: 'sw-row' }, [
        el('div', { class: 'sw-main' }, [
          el('div', { class: 'sw-title', text: d.title }),
          el('div', { class: 'sw-desc', text: d.desc })
        ]),
        toggle
      ]);
    })
  ]);


  // ===== v2.2.0 外观（主题选择）：鎏金暖阳 / 青屿 / 靛夜星辉 / 暗夜模式 =====
  const appearanceGrid = el('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': '选择主题' });
  function renderThemeTiles() {
    const current = getThemeKey();
    appearanceGrid.innerHTML = '';
    THEMES.forEach(t => {
      const tile = el('button', {
        class: 'theme-tile' + (current === t.key ? ' active' : ''),
        type: 'button', role: 'radio',
        'aria-checked': String(current === t.key),
        'aria-label': '切换到主题：' + t.name,
        onclick: () => { if (getThemeKey() !== t.key) { setThemeKey(t.key); renderThemeTiles(); } }
      }, [
        el('span', { class: 'theme-preview', style: `background:linear-gradient(135deg,${t.g1},${t.g2})` }, [
          el('i', { style: `background:${t.inc}` }),
          el('i', { style: `background:${t.exp}` }),
          el('i', { style: `background:${t.chart}` })
        ]),
        el('span', { class: 'theme-name', text: t.name }),
        el('span', { class: 'theme-check', 'aria-hidden': 'true', text: '✓' })
      ]);
      appearanceGrid.appendChild(tile);
    });
  }
  renderThemeTiles();
  const appearanceCard = el('section', { class: 'card appearance-card' }, [
    el('div', { class: 'card-title section-heading', text: '外观主题' }),
    appearanceGrid,
    el('p', { class: 'text-sm text-3', style: 'margin-top:8px;', text: '四套配色即点即换，选择自动保存；图表颜色随主题统一' })
  ]);

  // Danger group
  const dangerGroup = el('div', { class: 'setting-list mt-16' }, [
    el('button', { class: 'setting-item danger', type: 'button', onclick: onClear }, [
      el('div', { class: 'icon', text: '🗑️' }),
      el('div', { class: 'text', text: '清空所有数据' }),
      el('div', { class: 'arrow', text: '›' })
    ])
  ]);

  // Help group
  const helpGroup = el('div', { class: 'setting-list mt-16' }, [
    el('button', { class: 'setting-item', type: 'button', onclick: onShowInstallGuide }, [
      el('div', { class: 'icon', text: '📱' }),
      el('div', { class: 'text' }, [
        el('div', { text: isNativeApp() ? 'Android 应用信息' : '安装到手机主屏' }),
        el('div', { class: 'text-sm text-3', text: isNativeApp() ? '本机离线版与数据说明' : '查看真机安装步骤' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ]),
    el('button', { class: 'setting-item', type: 'button', onclick: onShowExcelSpec }, [
      el('div', { class: 'icon', text: 'ℹ️' }),
      el('div', { class: 'text' }, [
        el('div', { text: 'Excel 格式说明' }),
        el('div', { class: 'text-sm text-3', text: '查看支持的列定义' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ]),
    el('button', { class: 'setting-item', type: 'button', onclick: onShowAbout }, [
      el('div', { class: 'icon', text: 'ℹ️' }),
      el('div', { class: 'text', text: '关于' }),
      el('div', { class: 'arrow', text: '›' })
    ])
  ]);

  const about = el('div', { class: 'about-block' }, [
    el('div', { class: 'logo', text: '📒' }),
    el('div', { text: '我的记账 v' + APP_VERSION }),
    el('div', { class: 'text-sm', text: '默认纯本地运行 · 备份可密码加密' })
  ]);

  mount.append(profileHead, appearanceCard, quickCard, naCard, goalCard, switchCard, dangerGroup, helpGroup, about);

  // Hidden file input for import
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let data = JSON.parse(text);
      if (isEncryptedBackup(data)) {
        const password = await promptDialog({ title: '解密备份', label: '备份密码', inputType: 'password', placeholder: '至少 8 个字符', okText: '解密' });
        if (!password) { fileInput.value = ''; return; }
        data = await decryptBackup(data, password);
      }
      const preview = await previewBackupImport(data, 'merge');
      const body = el('div', { style: 'font-size:14px;line-height:1.8;' }, [
        el('p', { text: `流水 ${preview.transactions} 条 · 账户 ${preview.accounts} 个 · 分类 ${preview.categories} 个` }),
        el('p', { class: 'text-2', text: `检测到可能重复 ${preview.duplicateCount} 条；安全合并会自动跳过。` }),
        el('p', { class: 'text-sm text-3', text: '完全替换会先清空当前数据，并在同一事务中恢复；失败会自动回滚。' })
      ]);
      const mode = await showModal({
        title: '备份导入预检',
        body,
        actions: [
          { label: '取消', type: 'ghost', value: null },
          { label: '安全合并', type: 'primary', value: 'merge' },
          { label: '完全替换', type: 'danger', value: 'replace' }
        ]
      });
      if (!mode) { fileInput.value = ''; return; }
      if (mode === 'replace') {
        const confirmed = await confirmDialog('完全替换当前全部账目？事务失败时会自动回滚。', { danger: true, okText: '确认替换' });
        if (!confirmed) { fileInput.value = ''; return; }
      }
      const result = await importAll(data, mode);
      toast(`已导入 ${result.imported} 条，跳过重复 ${result.skippedDuplicates} 条`);
      router.dispatch();
    } catch (err) {
      console.error(err);
      toast('导入失败：' + (err.message || err));
    }
    fileInput.value = '';
  });
  mount.appendChild(fileInput);

  // Hidden file input for Excel import
  const excelInput = document.createElement('input');
  excelInput.type = 'file';
  excelInput.accept = '.xlsx,.xls';
  excelInput.style.display = 'none';
  excelInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const sizeKB = Math.round(file.size / 1024);
      // Phase 1: 预扫描
      toast('正在解析 Excel...');
      const preview = await previewExcelImport(file);

      // Phase 2: 显示预览，让用户输入期初余额
      const proceed = await showImportPreview(file, sizeKB, preview);
      if (!proceed) { excelInput.value = ''; return; }

      // Phase 3: 实际导入
      const result = await importParsedData(preview, { mode: 'merge', openingBalances: proceed.openingBalances });
      await showModal({
        title: '导入完成',
        body: el('div', { style: 'font-size:14px;line-height:1.8;' }, [
          el('div', { text: '工作表：' + result.sheetName }),
          el('div', { text: '总行数：' + result.total }),
          el('div', { text: '成功导入：' + result.imported + ' 条' }),
          el('div', { text: '跳过：' + result.skipped + ' 条（金额无效或空行）' }),
          el('div', { text: '新增账户：' + (result.newAccounts || 0) + ' 个', style: 'margin-top:6px;color:var(--c-primary);' }),
          el('div', { text: '新增分类：' + (result.newCategories || 0) + ' 个', style: 'color:var(--c-primary);' })
        ]),
        actions: [{ label: '完成', type: 'primary' }]
      });
      router.dispatch();
    } catch (err) {
      console.error(err);
      toast('Excel 导入失败：' + (err.message || err));
    }
    excelInput.value = '';
  });
  mount.appendChild(excelInput);

  // 显示导入预览，让用户确认并输入各账户期初余额
  // 返回 { openingBalances: Map<name, number> } 表示继续；返回 null 表示取消
  async function showImportPreview(file, sizeKB, preview) {
    const form = el('div', { style: 'font-size:14px;line-height:1.6;' });

    form.appendChild(el('div', { style: 'color:var(--text-2);margin-bottom:8px;' }, [
      el('span', { text: '文件：' + file.name + '（' + sizeKB + ' KB）' })
    ]));
    form.appendChild(el('div', { style: 'color:var(--text-2);margin-bottom:8px;' }, [
      el('span', { text: '工作表：' + preview.sheetName + ' · 共 ' + preview.totalRows + ' 行（其中有效 ' + preview.parsedRows.length + ' 条）' })
    ]));

    // 账户预览 + 期初余额输入
    const balInputs = [];
    const openingBalances = new Map();
    if (preview.detectedAccounts.length > 0) {
      form.appendChild(el('div', { style: 'margin:14px 0 6px;font-weight:600;' }, [el('span', { text: '💳 检测到的账户' })]));
      form.appendChild(el('div', { style: 'color:var(--text-3);font-size:12px;margin-bottom:6px;' }, [
          el('span', { text: '可输入首笔导入流水发生前的账户余额。已存在账户保留原值；导入更早流水时会自动前移期初日期。' })
      ]));
      preview.detectedAccounts.forEach((acc) => {
        const cur = acc.currentOpening != null ? Number(acc.currentOpening) : 0;
        const row = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);' });
        const label = el('div', { style: 'flex:1;' }, [
          el('div', { text: acc.name + (acc.exists ? '' : ' (新建)') }),
          el('div', { class: 'text-sm text-3', text: acc.exists ? '已存在账户' : '将自动创建' })
        ]);
        const input = el('input', { type: 'number', step: '0.01', 'aria-label': `${acc.name}期初余额`, placeholder: '0.00', value: cur !== 0 ? String(cur) : '', style: 'width:110px;text-align:right;' });
        input.className = 'input';
        balInputs.push({ name: acc.name, input });
        row.append(label, input);
        form.appendChild(row);
      });
    }

    // 分类预览（只读，导入时自动同步）
    const newCats = preview.detectedCategories.filter(c => !c.exists);
    if (preview.detectedCategories.length > 0) {
      form.appendChild(el('div', { style: 'margin:14px 0 6px;font-weight:600;' }, [el('span', { text: '🏷️ 检测到的分类' })]));
      if (newCats.length > 0) {
        form.appendChild(el('div', { style: 'color:var(--text-3);font-size:12px;margin-bottom:6px;' }, [
          el('span', { text: '以下 ' + newCats.length + ' 个新分类将自动创建（其余已存在）：' })
        ]));
        const catList = el('div', { style: 'font-size:13px;color:var(--text-2);max-height:120px;overflow-y:auto;' });
        newCats.forEach(c => {
          catList.appendChild(el('div', { text: '• ' + (c.type === 'income' ? '收入' : '支出') + ' / ' + c.name }));
        });
        form.appendChild(catList);
      } else {
        form.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;' }, [
          el('span', { text: '所有分类均已存在，无需新建。' })
        ]));
      }
    }

    const result = await showModal({
      title: '导入预览',
      body: form,
      actions: [
        { label: '取消', type: 'ghost', value: 'cancel' },
        { label: '确认导入', type: 'primary', value: 'ok' }
      ]
    });

    if (result !== 'ok') return null;

    // 收集期初余额
    for (const { name, input } of balInputs) {
      const v = input.value.trim();
      if (v !== '') {
        openingBalances.set(name, parseFloat(v) || 0);
      }
    }
    return { openingBalances };
  }

  async function onExportExcel() {
    try {
      toast('正在生成 Excel...');
      const filename = await exportToExcel();
      toast('已导出 ' + filename);
    } catch (e) {
      console.error(e);
      toast('导出失败：' + (e.message || e));
    }
  }

  function onImportExcel() {
    excelInput.click();
  }

  async function onShowExcelSpec() {
    const body = el('div', { style: 'font-size:13px;line-height:1.7;color:var(--text);' });
    body.innerHTML = `
      <p style="margin-bottom:8px;color:var(--text-2);">支持从其他记账软件导入 Excel（.xlsx）文件。第一行需为表头，格式如下：</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;">
        <thead>
          <tr style="background:var(--fill-1);">
            <th style="padding:6px;border:1px solid var(--border);text-align:left;">列名</th>
            <th style="padding:6px;border:1px solid var(--border);text-align:left;">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:6px;border:1px solid var(--border);">记账日期</td><td style="padding:6px;border:1px solid var(--border);">格式 YYYY-MM-DD 或 YYYY/MM/DD</td></tr>
          <tr><td style="padding:6px;border:1px solid var(--border);">记账时间</td><td style="padding:6px;border:1px solid var(--border);">可选，如 18:30</td></tr>
          <tr><td style="padding:6px;border:1px solid var(--border);">分类</td><td style="padding:6px;border:1px solid var(--border);">支出/收入必填，转账留空</td></tr>
          <tr><td style="padding:6px;border:1px solid var(--border);">记账类型</td><td style="padding:6px;border:1px solid var(--border);">支出 / 收入 / 转账</td></tr>
          <tr><td style="padding:6px;border:1px solid var(--border);">金额</td><td style="padding:6px;border:1px solid var(--border);">正数，不要正负号</td></tr>
          <tr><td style="padding:6px;border:1px solid var(--border);">流出账户</td><td style="padding:6px;border:1px solid var(--border);">账户名（找不到自动创建）</td></tr>
          <tr><td style="padding:6px;border:1px solid var(--border);">流入账户</td><td style="padding:6px;border:1px solid var(--border);">仅转账填写</td></tr>
          <tr><td style="padding:6px;border:1px solid var(--border);">备注</td><td style="padding:6px;border:1px solid var(--border);">可选</td></tr>
        </tbody>
      </table>
      <p style="margin-bottom:6px;color:var(--text-2);"><b>说明：</b></p>
      <ul style="padding-left:18px;color:var(--text-2);font-size:12px;line-height:1.7;">
        <li>系统会自动查找包含"记账日期"表头的工作表</li>
        <li>列名会模糊匹配（如"记账时间（可不填）"会匹配"记账时间"）</li>
        <li>账户不存在会自动创建（自定义类型）</li>
        <li>分类不存在会自动创建（按支出/收入类型，默认图标颜色可后续修改）</li>
        <li>导入前可预览账户与分类，并输入各账户当前余额作为初始余额</li>
        <li>日期格式支持多种：YYYY-MM-DD / YYYY/MM/DD / Excel 序列号</li>
      </ul>
      <p style="margin-top:12px;color:var(--text-3);font-size:12px;">提示：导入前建议先"导出 Excel"备份当前数据。</p>
    `;
    await showModal({ title: 'Excel 格式说明', body, actions: [{ label: '知道了', type: 'primary' }] });
  }

  async function onExport() {
    try {
      const data = await exportAll();
      const choice = await showModal({
        title: '导出备份',
        body: el('p', { class: 'text-sm text-2', text: '加密备份需要密码才能恢复，适合保存到网盘或传输。' }),
        actions: [
          { label: '取消', type: 'ghost', value: null },
          { label: '普通 JSON', type: 'ghost', value: 'plain' },
          { label: '密码加密', type: 'primary', value: 'encrypted' }
        ]
      });
      if (!choice) return;
      let payload = data;
      let suffix = '';
      if (choice === 'encrypted') {
        const password = await promptDialog({ title: '设置备份密码', label: '密码（至少 8 个字符）', inputType: 'password', okText: '继续' });
        if (!password) return;
        const confirmation = await promptDialog({ title: '确认备份密码', label: '再次输入密码', inputType: 'password', okText: '加密导出' });
        if (password !== confirmation) throw new Error('两次输入的密码不一致');
        payload = await encryptBackup(data, password);
        suffix = '-encrypted';
      }
      const d = new Date();
      const ts = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      await downloadJson(payload, 'accounting-backup-' + ts + suffix + '.json');
      toast('已导出 ' + data.transactions.length + ' 条记录');
    } catch (e) {
      console.error(e);
      toast('导出失败：' + (e.message || e));
    }
  }

  async function downloadJson(data, filename) {
    const json = JSON.stringify(data, null, 2);
    if (await shareTextFile(filename, json, 'application/json')) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onImport() {
    fileInput.click();
  }

  async function onClear() {
    const ok1 = await confirmDialog('此操作将清空所有记账数据，且无法恢复！', { danger: true, okText: '继续' });
    if (!ok1) return;
    const ok2 = await confirmDialog('再次确认清空？所有流水和预算将被删除。', { danger: true, okText: '确认清空' });
    if (!ok2) return;
    try {
      await clearAllData();
      toast('数据已清空');
      router.dispatch();
    } catch (e) {
      toast('清空失败');
    }
  }

  async function onShowInstallGuide() {
    const body = el('div', { style: 'font-size:14px;line-height:1.7;color:var(--text);' });
    if (isNativeApp()) {
      body.innerHTML = `
        <p style="margin-bottom:8px;"><b>本机离线版</b></p>
        <p style="color:var(--text-2);">当前运行的是 Android 原生安装版。页面、图标和 Excel 组件均已随应用打包，无网络也能记账、统计和导入导出。</p>
        <p style="margin-top:12px;color:var(--text-2);">账目存放在本应用的本机数据空间中。卸载前请先从「导出备份」保存 JSON 文件，升级时直接覆盖安装即可保留数据。</p>
        <p style="margin-top:14px;color:var(--text-3);font-size:12px;">版本：v${APP_VERSION}</p>
      `;
      await showModal({ title: 'Android 应用信息', body, actions: [{ label: '知道了', type: 'primary' }] });
      return;
    }
    body.innerHTML = `
      <p style="margin-bottom:8px;"><b>本机预览</b></p>
      <ol style="padding-left:18px;margin-bottom:14px;color:var(--text-2);">
        <li>电脑上启动：<code style="background:var(--fill-1);padding:2px 4px;border-radius:3px;">python -m http.server 8080</code></li>
        <li>电脑浏览器访问 <code style="background:var(--fill-1);padding:2px 4px;border-radius:3px;">http://localhost:8080</code></li>
      </ol>
      <p style="margin-bottom:8px;"><b>安装到手机</b></p>
      <p style="color:var(--text-2);">请部署到支持 HTTPS 的静态托管，手机访问后在浏览器菜单中选择「添加到主屏幕」。iPhone 使用 Safari 的分享菜单，Android 使用 Chrome 菜单。</p>
      <p style="margin-top:14px;color:var(--text-3);font-size:12px;">普通局域网 HTTP 地址不满足 Service Worker 的安全要求，不能保证离线安装。</p>
    `;
    await import('../ui.js').then(m => m.showModal({ title: '📱 安装到手机主屏', body, actions: [{ label: '知道了', type: 'primary' }] }));
  }

  async function onShowAbout() {
    const body = el('div', { style: 'font-size:14px;line-height:1.7;color:var(--text);text-align:center;' });
    body.innerHTML = `
      <div style="font-size:48px;margin-bottom:8px;">📒</div>
      <p style="font-weight:600;margin-bottom:4px;">我的记账 v${APP_VERSION}</p>
      <p style="color:var(--text-2);margin-bottom:12px;">个人离线记账${isNativeApp() ? ' Android' : ' PWA'} 应用</p>
      <p style="color:var(--text-3);font-size:12px;">账目使用 IndexedDB 存储在本机<br>${isNativeApp() ? '应用可全程离线运行，数据不会自动上传' : '应用更新会联网检查静态文件，账目不会自动上传'}</p>
    `;
    await import('../ui.js').then(m => m.showModal({ title: '关于', body, actions: [{ label: '关闭', type: 'primary' }] }));
  }
}
