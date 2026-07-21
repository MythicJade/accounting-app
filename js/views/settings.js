// js/views/settings.js — settings: export/import/clear + about
import { exportAll, importAll, clearAllData, countTransactions } from '../store.js';
import { exportToExcel, importFromExcel } from '../excel-io.js';
import { toast, confirmDialog, showModal, el } from '../ui.js';
import { router } from '../router.js';

export async function renderSettings(mount) {
  const topbar = el('header', { class: 'topbar' }, [
    el('h1', { text: '我的' })
  ]);

  const count = await countTransactions();

  // Data group
  const dataGroup = el('div', { class: 'setting-list' }, [
    el('div', { class: 'setting-item', onclick: () => location.hash = '#/accounts' }, [
      el('div', { class: 'icon', text: '💳' }),
      el('div', { class: 'text' }, [
        el('div', { text: '账户管理' }),
        el('div', { class: 'text-sm text-3', text: '多账户分开管理 + 账户间转账' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ]),
    el('div', { class: 'setting-item', onclick: onExport }, [
      el('div', { class: 'icon', text: '📤' }),
      el('div', { class: 'text' }, [
        el('div', { text: '导出备份' }),
        el('div', { class: 'text-sm text-3', text: '导出 JSON 文件到本地' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ]),
    el('div', { class: 'setting-item', onclick: onImport }, [
      el('div', { class: 'icon', text: '📥' }),
      el('div', { class: 'text' }, [
        el('div', { text: '导入备份' }),
        el('div', { class: 'text-sm text-3', text: '从 JSON 文件恢复数据' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ])
  ]);

  // Excel group
  const excelGroup = el('div', { class: 'setting-list mt-16' }, [
    el('div', { class: 'setting-item', onclick: onExportExcel }, [
      el('div', { class: 'icon', text: '📊' }),
      el('div', { class: 'text' }, [
        el('div', { text: '导出 Excel' }),
        el('div', { class: 'text-sm text-3', text: '导出 .xlsx 文件（含流水/账户/分类）' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ]),
    el('div', { class: 'setting-item', onclick: onImportExcel }, [
      el('div', { class: 'icon', text: '📑' }),
      el('div', { class: 'text' }, [
        el('div', { text: '导入 Excel' }),
        el('div', { class: 'text-sm text-3', text: '从其他记账软件的 .xlsx 导入' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ]),
    el('div', { class: 'setting-item', onclick: onShowExcelSpec }, [
      el('div', { class: 'icon', text: 'ℹ️' }),
      el('div', { class: 'text' }, [
        el('div', { text: 'Excel 格式说明' }),
        el('div', { class: 'text-sm text-3', text: '查看支持的列定义' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ])
  ]);

  const dataStats = el('p', { class: 'text-sm text-3 center mt-8', text: '当前已记录 ' + count + ' 笔流水' });

  // Danger group
  const dangerGroup = el('div', { class: 'setting-list mt-16' }, [
    el('div', { class: 'setting-item danger', onclick: onClear }, [
      el('div', { class: 'icon', text: '🗑️' }),
      el('div', { class: 'text', text: '清空所有数据' }),
      el('div', { class: 'arrow', text: '›' })
    ])
  ]);

  // Help group
  const helpGroup = el('div', { class: 'setting-list mt-16' }, [
    el('div', { class: 'setting-item', onclick: onShowInstallGuide }, [
      el('div', { class: 'icon', text: '📱' }),
      el('div', { class: 'text' }, [
        el('div', { text: '安装到手机主屏' }),
        el('div', { class: 'text-sm text-3', text: '查看真机安装步骤' })
      ]),
      el('div', { class: 'arrow', text: '›' })
    ]),
    el('div', { class: 'setting-item', onclick: onShowAbout }, [
      el('div', { class: 'icon', text: 'ℹ️' }),
      el('div', { class: 'text', text: '关于' }),
      el('div', { class: 'arrow', text: '›' })
    ])
  ]);

  const about = el('div', { class: 'about-block' }, [
    el('div', { class: 'logo', text: '📒' }),
    el('div', { text: '我的记账 v1.0' }),
    el('div', { class: 'text-sm', text: '纯本地离线运行 · 数据不离开你的设备' })
  ]);

  mount.append(topbar, dataGroup, dataStats, excelGroup, dangerGroup, helpGroup, about);

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
      const data = JSON.parse(text);
      const ok = await confirmDialog(
        '将合并导入 ' + (data.transactions ? data.transactions.length : 0) + ' 条记录，是否继续？',
        { okText: '导入' }
      );
      if (!ok) { fileInput.value = ''; return; }
      await importAll(data, 'merge');
      toast('已导入 ' + (data.transactions ? data.transactions.length : 0) + ' 条记录');
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
      const ok = await confirmDialog(
        '即将导入文件：' + file.name + '（' + sizeKB + ' KB）\n\n' +
        '选择导入模式：\n"合并"将追加到现有数据，"替换"将先清空再导入。',
        { okText: '合并导入', cancelText: '取消' }
      );
      if (!ok) { excelInput.value = ''; return; }
      const result = await importFromExcel(file, 'merge');
      await showModal({
        title: '导入完成',
        body: el('div', { style: 'font-size:14px;line-height:1.8;' }, [
          el('div', { text: '工作表：' + result.sheetName }),
          el('div', { text: '总行数：' + result.total }),
          el('div', { text: '成功导入：' + result.imported + ' 条' }),
          el('div', { text: '跳过：' + result.skipped + ' 条（金额无效或空行）' })
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
          <tr style="background:#f0f0f0;">
            <th style="padding:6px;border:1px solid #ddd;text-align:left;">列名</th>
            <th style="padding:6px;border:1px solid #ddd;text-align:left;">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:6px;border:1px solid #ddd;">记账日期</td><td style="padding:6px;border:1px solid #ddd;">格式 YYYY-MM-DD 或 YYYY/MM/DD</td></tr>
          <tr><td style="padding:6px;border:1px solid #ddd;">记账时间</td><td style="padding:6px;border:1px solid #ddd;">可选，如 18:30</td></tr>
          <tr><td style="padding:6px;border:1px solid #ddd;">分类</td><td style="padding:6px;border:1px solid #ddd;">支出/收入必填，转账留空</td></tr>
          <tr><td style="padding:6px;border:1px solid #ddd;">记账类型</td><td style="padding:6px;border:1px solid #ddd;">支出 / 收入 / 转账</td></tr>
          <tr><td style="padding:6px;border:1px solid #ddd;">金额</td><td style="padding:6px;border:1px solid #ddd;">正数，不要正负号</td></tr>
          <tr><td style="padding:6px;border:1px solid #ddd;">流出账户</td><td style="padding:6px;border:1px solid #ddd;">账户名（找不到自动创建）</td></tr>
          <tr><td style="padding:6px;border:1px solid #ddd;">流入账户</td><td style="padding:6px;border:1px solid #ddd;">仅转账填写</td></tr>
          <tr><td style="padding:6px;border:1px solid #ddd;">备注</td><td style="padding:6px;border:1px solid #ddd;">可选</td></tr>
        </tbody>
      </table>
      <p style="margin-bottom:6px;color:var(--text-2);"><b>说明：</b></p>
      <ul style="padding-left:18px;color:var(--text-2);font-size:12px;line-height:1.7;">
        <li>系统会自动查找包含"记账日期"表头的工作表</li>
        <li>列名会模糊匹配（如"记账时间（可不填）"会匹配"记账时间"）</li>
        <li>账户不存在会自动创建（自定义类型）</li>
        <li>分类不存在会显示为"未分类"，不会阻断导入</li>
        <li>日期格式支持多种：YYYY-MM-DD / YYYY/MM/DD / Excel 序列号</li>
      </ul>
      <p style="margin-top:12px;color:var(--text-3);font-size:12px;">提示：导入前建议先"导出 Excel"备份当前数据。</p>
    `;
    await showModal({ title: 'Excel 格式说明', body, actions: [{ label: '知道了', type: 'primary' }] });
  }

  async function onExport() {
    try {
      const data = await exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const ts = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      a.href = url;
      a.download = 'accounting-backup-' + ts + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('已导出 ' + data.transactions.length + ' 条记录');
    } catch (e) {
      console.error(e);
      toast('导出失败：' + (e.message || e));
    }
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
    body.innerHTML = `
      <p style="margin-bottom:8px;"><b>方法一：电脑同一 WiFi 共享</b></p>
      <ol style="padding-left:18px;margin-bottom:14px;color:var(--text-2);">
        <li>电脑上启动：<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;">cd accounting-app && python3 -m http.server 8080</code></li>
        <li>查电脑 IP：终端执行 <code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;">ip addr | grep inet</code></li>
        <li>手机和电脑连同一 WiFi，浏览器访问 <code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;">http://电脑IP:8080</code></li>
        <li>Chrome 菜单（⋮）→「添加到主屏幕」</li>
      </ol>
      <p style="margin-bottom:8px;"><b>方法二：部署到静态托管</b></p>
      <p style="color:var(--text-2);">把整个 accounting-app 目录上传到 GitHub Pages / Netlify / Vercel 等免费静态托管，手机访问该网址后同样「添加到主屏幕」。</p>
      <p style="margin-top:14px;color:var(--text-3);font-size:12px;">注：iOS Safari 也支持「添加到主屏幕」，但部分 PWA 特性有限制。</p>
    `;
    await import('../ui.js').then(m => m.showModal({ title: '📱 安装到手机主屏', body, actions: [{ label: '知道了', type: 'primary' }] }));
  }

  async function onShowAbout() {
    const body = el('div', { style: 'font-size:14px;line-height:1.7;color:var(--text);text-align:center;' });
    body.innerHTML = `
      <div style="font-size:48px;margin-bottom:8px;">📒</div>
      <p style="font-weight:600;margin-bottom:4px;">我的记账 v1.0</p>
      <p style="color:var(--text-2);margin-bottom:12px;">个人离线记账 PWA 应用</p>
      <p style="color:var(--text-3);font-size:12px;">数据使用 IndexedDB 完全本地存储<br>不联网 · 不上传 · 隐私无忧</p>
    `;
    await import('../ui.js').then(m => m.showModal({ title: '关于', body, actions: [{ label: '关闭', type: 'primary' }] }));
  }
}
