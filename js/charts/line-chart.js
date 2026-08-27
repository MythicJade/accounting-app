// js/charts/line-chart.js — Canvas line chart, no dependencies
// v2.1.2: 手指滑动跟随（scrub）交互 + 十字准线 + 干净的药丸形金额气泡
//
// 单系列: drawLineChart(canvas, data, options)
//   data: [{ label, value, fullLabel? }]
//   options: { color, selected(index|null), onSelect(idx|null), onScrub(idx|null), valueFormatter }
// 多系列: drawMultiLineChart(canvas, series, options)
//   series: [{ data: [{ label, value, fullLabel? }], color, label }]
//   options: { selected(number | {seriesIdx, pointIdx} | null), onSelect(idx|null), onScrub(idx|null), valueFormatter }
//   选中按 X 轴索引（pointIdx）作用整列，气泡同时列出所有系列数值。
//
// 交互说明：
//   - touchstart/touchmove 在画布内被 stopPropagation，避免触发页面级手势（如右滑返回）
//   - 滑动过程实时回调 onScrub(最近点索引)；松手时回调 onSelect 固化选择
//   - 桌面端 hover 即预览，按下拖动等同触摸

function readVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function chartColors() {
  return {
    grid: readVar('--grid-line', '#f2f2f7'),
    zero: readVar('--zero-line', '#d1d1d6'),
    text3: readVar('--text-3', '#aeaeb2'),
    primary: readVar('--c-primary', '#007AFF'),
    tooltipBg: 'rgba(28, 28, 30, 0.88)',
    crosshair: 'rgba(120, 120, 128, 0.42)'
  };
}

/* ============================ 缩放工具 ============================ */

function niceNumber(n) {
  if (n <= 10) return 10;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const f = n / base;
  let nice;
  if (f <= 1) nice = 1;
  else if (f <= 2) nice = 2;
  else if (f <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function computeScale(values) {
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const niceMax = niceNumber(rawMax || 1);
  const minVal = rawMin < 0 ? -niceNumber(-rawMin) : 0;
  const range = (niceMax - minVal) || 1;
  return { minVal, range };
}

function formatShort(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000) return sign + (abs / 10000).toFixed(1) + '万';
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + 'k';
  return Math.round(n).toString();
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== '#') return `rgba(0,122,255,${alpha})`;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 220;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  // 触摸交互：横向拖动给图表 scrub，纵向仍交给页面滚动
  canvas.style.touchAction = 'pan-y';
  return { ctx, cssW, cssH };
}

function drawEmpty(ctx, cssW, cssH, C) {
  ctx.fillStyle = C.text3;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('暂无数据', cssW / 2, cssH / 2);
}

function drawAxisFrame(ctx, opts) {
  // opts: { pad, w, h, minVal, range, gridLabelCount, labelsData, gridColor, labelColor }
  const { pad, w, h, minVal, range, gridLines } = opts;
  const C = chartColors();
  const zeroY = pad.top + h - ((0 - minVal) / range) * h;

  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.text3;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + h - (h / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + w, y);
    ctx.stroke();
    const val = minVal + (range / gridLines) * i;
    ctx.fillText(formatShort(val), pad.left - 6, y);
  }

  if (minVal < 0 && range > 0) {
    ctx.strokeStyle = C.zero;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(pad.left + w, zeroY);
    ctx.stroke();
  }

  // X 轴标签
  ctx.fillStyle = C.text3;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  opts.labelsData.forEach((d, i) => {
    ctx.fillText(d.label, pad.left + (w / Math.max(1, opts.labelsCount - 1)) * i, pad.top + h + 6);
  });

  return zeroY;
}

function drawXLabels(ctx, firstData, pad, w, h) {
  const C = chartColors();
  ctx.fillStyle = C.text3;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(firstData.length / 6));
  firstData.forEach((d, i) => {
    if (i % step !== 0 && i !== firstData.length - 1) return;
    const x = pad.left + (w / Math.max(1, firstData.length - 1)) * i;
    ctx.fillText(d.label, x, pad.top + h + 6);
  });
}

/* ============================ 金额气泡 ============================ */
// 药丸形：圆角矩形 + 指向数据点的小箭头；多行时左侧色点标注系列
// rows: [{ color?, label?, valueText }]

function drawValuePill(ctx, anchor, titleText, rows, valueFormatterFallback, C) {
  if (!rows.length) return;
  const cssW = ctx.canvas.clientWidth || 320;
  const cssH = ctx.canvas.clientHeight || 220;

  // measure
  ctx.font = 'bold 12px sans-serif';
  let maxRowContent = 0;
  rows.forEach(r => {
    const vW = ctx.measureText(r.valueText).width;
    const lW = r.label ? ctx.measureText(r.label).width : 0;
    maxRowContent = Math.max(maxRowContent, (r.color ? 13 : 0) + lW + (lW ? 6 : 0) + vW);
  });
  ctx.font = '10px sans-serif';
  const titleW = titleText ? ctx.measureText(titleText).width : 0;

  const hasTitle = !!titleText;
  const rowLineH = 16;
  const padV = 8;
  const headerH = hasTitle ? 14 : 0;
  const boxW = clamp(Math.ceil(Math.max(maxRowContent, titleW)) + 20, 56, cssW - 8);
  const boxH = Math.round(padV * 2 + headerH + (hasTitle ? 3 : 0) + rows.length * rowLineH);

  const ARROW = 6;
  const GAP = 8;
  // 默认放在点上方向下指
  let boxX = anchor.x - boxW / 2;
  let boxY = anchor.y - GAP - ARROW - boxH;
  let arrowDown = true;
  if (boxY < 3) {
    arrowDown = false;
    boxY = anchor.y + GAP + ARROW;
  }
  boxX = clamp(boxX, 3, cssW - boxW - 3);
  if (!arrowDown && boxY + boxH > cssH - 3) {
    // 两边都放不下则水平错开
    boxY = clamp(anchor.y - boxH / 2, 3, cssH - boxH - 3);
    boxX = anchor.x + 12 + boxW <= cssW - 3 ? anchor.x + 12 : anchor.x - 12 - boxW;
    boxX = clamp(boxX, 3, cssW - boxW - 3);
  }

  // bubble
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = C.tooltipBg;
  roundRect(ctx, boxX, boxY, boxW, boxH, 11);
  ctx.fill();
  ctx.restore();

  // arrow（clamp 到框体内）
  const ax = clamp(anchor.x, boxX + 14, boxX + boxW - 14);
  ctx.fillStyle = C.tooltipBg;
  ctx.beginPath();
  if (arrowDown) {
    ctx.moveTo(ax - ARROW, boxY + boxH - 0.5);
    ctx.lineTo(ax, boxY + boxH + ARROW);
    ctx.lineTo(ax + ARROW, boxY + boxH - 0.5);
  } else {
    ctx.moveTo(ax - ARROW, boxY + 0.5);
    ctx.lineTo(ax, boxY - ARROW);
    ctx.lineTo(ax + ARROW, boxY + 0.5);
  }
  ctx.closePath();
  ctx.fill();

  // header
  let cursorY = boxY + padV + 4;
  if (hasTitle) {
    ctx.fillStyle = 'rgba(235,235,245,0.62)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, boxX + boxW / 2, cursorY + 3);
    cursorY += headerH + 3;
  }

  // rows
  rows.forEach((r) => {
    let x = boxX + 9;
    if (r.color) {
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(x + 3, cursorY + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      x += 13;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (r.label) {
      ctx.fillStyle = 'rgba(235,235,245,0.72)';
      ctx.font = '11px sans-serif';
      ctx.fillText(r.label, x, cursorY + 4);
      x += ctx.measureText(r.label).width + 6;
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(r.valueText, boxX + boxW - 9, cursorY + 4);
    cursorY += rowLineH;
  });
}

/* ============================ 命中测试与指针绑定 ============================ */
// 每次绘制把 hit-test 信息缓存在 canvas 上；事件只绑定一次。

function setHitTest(canvas, count, x0, step, plotLeft, plotRight) {
  canvas._chartHit = { count, x0, step, plotLeft, plotRight };
}

function hitIndexAt(canvas, clientX) {
  const ht = canvas._chartHit;
  if (!ht || !ht.count) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  if (x < ht.plotLeft - 16 || x > ht.plotRight + 16) return null;
  const idx = ht.step > 0 ? Math.round((x - ht.x0) / ht.step) : 0;
  return clamp(idx, 0, ht.count - 1);
}

function bindPointerInteraction(canvas) {
  if (canvas._chartPointerBound) return;
  canvas._chartPointerBound = true;
  const st = { active: false, last: -1 };

  const fireScrub = (idx) => {
    if (idx == null) return;
    if (st.last === idx) return;
    st.last = idx;
    const cb = canvas._chartOnScrub;
    if (cb) cb(idx);
  };

  const begin = (clientX) => {
    st.active = true;
    st.last = -1;
    st.moved = false;
    const idx = hitIndexAt(canvas, clientX);
    if (idx != null) { st.moved = false; fireScrub(idx); st.last = idx; }
  };
  const move = (clientX, requireActive) => {
    if (requireActive && !st.active) return;
    const idx = hitIndexAt(canvas, clientX);
    if (idx != null) { st.moved = st.moved || st.active; fireScrub(idx); }
  };
  const end = () => {
    if (!st.active) return;
    st.active = false;
    const cb = canvas._chartOnSelect;
    const idx = st.last >= 0 ? st.last : null;
    st.last = -1;
    st.moved = false;
    if (cb) cb(idx);
  };

  // touch：stopPropagation 避免页面级手势（右滑返回等）被误触
  canvas.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    const t = e.touches[0];
    if (t) begin(t.clientX);
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    e.stopPropagation();
    const t = e.touches[0];
    if (t) move(t.clientX, true);
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => { e.stopPropagation(); end(); }, { passive: true });
  canvas.addEventListener('touchcancel', () => { st.active = false; st.last = -1; st.moved = false; }, { passive: true });

  // 鼠标：hover 预览；按下拖动同触摸
  canvas.addEventListener('mousedown', (e) => { e.stopPropagation(); begin(e.clientX); });
  canvas.addEventListener('mousemove', (e) => { move(e.clientX, st.active); e.stopPropagation(); });
  canvas.addEventListener('mouseleave', () => { if (!st.active) { /* 悬停离开不做清理，选择状态由视图管理 */ } });
  window.addEventListener('mousemove', (e) => { if (st.active) move(e.clientX, true); });
  window.addEventListener('mouseup', () => end());
}

/* ============================ 绘制入口 ============================ */

export function drawLineChart(canvas, data, options = {}) {
  const { ctx, cssW, cssH } = setupCanvas(canvas);
  const C = chartColors();

  canvas._chartOnSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
  canvas._chartOnScrub = typeof options.onScrub === 'function' ? options.onScrub : null;

  if (!data.length) {
    setHitTest(canvas, 0, 0, 0, 0, 0);
    drawEmpty(ctx, cssW, cssH, C);
    return null;
  }

  const pad = { top: 18, right: 16, bottom: 26, left: 38 };
  const w = cssW - pad.left - pad.right;
  const h = cssH - pad.top - pad.bottom;

  const values = data.map(d => d.value);
  const { minVal, range } = computeScale(values);
  const fmtShort = options.valueFormatter || ((v) => formatShort(v));
  const lineColor = options.color || C.primary;

  drawAxisLabelsY(ctx, pad, w, h, minVal, range, C);
  drawXLabels(ctx, data, pad, w, h);

  const denom = Math.max(1, data.length - 1);
  const points = data.map((d, i) => ({
    index: i,
    x: pad.left + (w / denom) * i,
    y: pad.top + h - ((d.value - minVal) / range) * h,
    value: d.value,
    label: d.label,
    fullLabel: d.fullLabel || d.label
  }));

  setHitTest(canvas, points.length, points.length ? points[0].x : 0, w / denom, pad.left, pad.left + w);
  bindPointerInteraction(canvas);

  // 渐变面积
  const zeroY = pad.top + h - ((0 - minVal) / range) * h;
  if (points.length > 1) {
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
    gradient.addColorStop(0, hexToRgba(lineColor, 0.22));
    gradient.addColorStop(1, hexToRgba(lineColor, 0.02));
    ctx.beginPath();
    ctx.moveTo(points[0].x, zeroY);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, zeroY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // 折线
  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  const selIdx = Number.isInteger(options.selected) && options.selected >= 0 && options.selected < points.length
    ? options.selected : null;

  // 十字准线 + 高亮点
  if (selIdx != null) {
    const p = points[selIdx];
    ctx.strokeStyle = C.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(p.x, pad.top - 4);
    ctx.lineTo(p.x, pad.top + h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 数据点
  const showDots = points.length <= 31;
  if (showDots) {
    points.forEach((p, i) => {
      const isSel = selIdx === i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSel ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.stroke();
    });
  }

  // 气泡：选中优先；未选中默认显示峰值
  if (selIdx != null) {
    const p = points[selIdx];
    drawValuePill(ctx, p, p.fullLabel, [{ valueText: fmtShort(p.value) }], fmtShort, C);
  } else {
    const peakIdx = values.indexOf(Math.max(...values));
    if (peakIdx >= 0 && values[peakIdx] > 0) {
      drawValuePill(ctx, points[peakIdx], null, [{ valueText: fmtShort(points[peakIdx].value) }], fmtShort, C);
    }
  }

  return points;
}

function drawAxisLabelsY(ctx, pad, w, h, minVal, range, C) {
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.text3;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + h - (h / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + w, y);
    ctx.stroke();
    const val = minVal + (range / gridLines) * i;
    ctx.fillText(formatShort(val), pad.left - 6, y);
  }
}

// 多系列折线图
export function drawMultiLineChart(canvas, series, options = {}) {
  const { ctx, cssW, cssH } = setupCanvas(canvas);
  const C = chartColors();

  canvas._chartOnSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
  canvas._chartOnScrub = typeof options.onScrub === 'function' ? options.onScrub : null;

  const validSeries = series.filter(s => s.data && s.data.length);
  if (!validSeries.length) {
    setHitTest(canvas, 0, 0, 0, 0, 0);
    drawEmpty(ctx, cssW, cssH, C);
    return null;
  }

  const pad = { top: 18, right: 16, bottom: 26, left: 48 };
  const w = cssW - pad.left - pad.right;
  const h = cssH - pad.top - pad.bottom;
  const fmtShort = options.valueFormatter || ((v) => formatShort(v));

  const allValues = [];
  validSeries.forEach(s => s.data.forEach(d => { if (d.value != null) allValues.push(d.value); }));
  const { minVal, range } = computeScale(allValues.length ? allValues : [0]);

  drawAxisLabelsY(ctx, pad, w, h, minVal, range, C);
  if (minVal < 0) {
    const zeroY = pad.top + h - ((0 - minVal) / range) * h;
    ctx.strokeStyle = C.zero;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(pad.left + w, zeroY);
    ctx.stroke();
  }
  const firstData = validSeries[0].data;
  drawXLabels(ctx, firstData, pad, w, h);

  // 各系列折线
  const allPoints = [];
  validSeries.forEach((s, sIdx) => {
    const color = s.color || C.primary;
    const denom = Math.max(1, s.data.length - 1);
    const points = s.data.map((d, i) => ({
      index: i,
      seriesIndex: sIdx,
      x: pad.left + (w / denom) * i,
      y: pad.top + h - (((d.value != null ? d.value : minVal) - minVal) / range) * h,
      value: d.value,
      label: d.label,
      fullLabel: d.fullLabel || d.label,
      color,
      seriesLabel: s.label || ''
    }));
    allPoints.push(points);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let started = false;
    points.forEach(p => {
      if (p.value == null) return;
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  });

  const count = firstData.length;
  const denom = Math.max(1, count - 1);
  setHitTest(canvas, count, pad.left, w / denom, pad.left, pad.left + w);
  bindPointerInteraction(canvas);

  // 选中索引归一：number 或 {seriesIdx,pointIdx} → pointIdx
  let selIdx = null;
  if (typeof options.selected === 'number' && Number.isInteger(options.selected)
      && options.selected >= 0 && options.selected < count) {
    selIdx = options.selected;
  } else if (options.selected && Number.isInteger(options.selected.pointIdx)
      && options.selected.pointIdx >= 0 && options.selected.pointIdx < count) {
    selIdx = options.selected.pointIdx;
  }

  // 十字准线 + 各系列高亮点
  if (selIdx != null) {
    const ref = allPoints.find(pts => pts[selIdx] && pts[selIdx].value != null) || allPoints[0];
    const rx = ref[selIdx] ? ref[selIdx].x : pad.left;
    ctx.strokeStyle = C.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(rx, pad.top - 4);
    ctx.lineTo(rx, pad.top + h);
    ctx.stroke();
    ctx.setLineDash([]);

    allPoints.forEach(pts => {
      if (pts.length > 31) return;
      const p = pts[selIdx];
      if (!p || p.value == null) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  } else if (count <= 31) {
    allPoints.forEach(pts => {
      pts.forEach(p => {
        if (p.value == null) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });
  }

  // 气泡：选中列展示全部系列数值；否则显示最后一个月有数据的列
  let pillIdx = selIdx;
  if (pillIdx == null) {
    for (let i = count - 1; i >= 0; i--) {
      const has = validSeries.some(s => s.data[i] && s.data[i].value != null);
      if (has) { pillIdx = i; break; }
    }
  }
  if (pillIdx != null) {
    const rows = [];
    allPoints.forEach(pts => {
      const p = pts[pillIdx];
      if (p && p.value != null) {
        rows.push({ color: p.color, label: p.seriesLabel, valueText: fmtShort(p.value) });
      }
    });
    if (rows.length) {
      const refPts = allPoints.find(pts => pts[pillIdx] && pts[pillIdx].value != null) || allPoints[0];
      const anchor = refPts[pillIdx];
      const title = anchor.fullLabel || anchor.label;
      drawValuePill(ctx, anchor, title, rows, fmtShort, C);
    }
  }

  return allPoints;
}
