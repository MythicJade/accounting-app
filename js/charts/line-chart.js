// js/charts/line-chart.js — Canvas line chart, no dependencies
// data: [{ label, value, fullLabel? }]
// options: { color, selected, onSelect }
//   - selected: index of selected point (or null)
//   - onSelect(idx|null): called when user taps a point
export function drawLineChart(canvas, data, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 220;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!data.length) {
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', cssW / 2, cssH / 2);
    return null;
  }

  const pad = { top: 18, right: 16, bottom: 26, left: 38 };
  const w = cssW - pad.left - pad.right;
  const h = cssH - pad.top - pad.bottom;

  const values = data.map(d => d.value);
  const maxVal = Math.max(1, ...values);
  const niceMax = niceNumber(maxVal);
  const minVal = 0;

  // Y-axis grid lines + labels
  ctx.strokeStyle = '#F3F4F6';
  ctx.fillStyle = '#9CA3AF';
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
    const val = (niceMax / gridLines) * i;
    ctx.fillText(formatShort(val), pad.left - 6, y);
  }

  // X-axis labels (subset to avoid clutter)
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(data.length / 6));
  data.forEach((d, i) => {
    if (i % step !== 0 && i !== data.length - 1) return;
    const x = pad.left + (w / Math.max(1, data.length - 1)) * i;
    ctx.fillText(d.label, x, pad.top + h + 6);
  });

  // Points
  const lineColor = options.color || '#4ECDC4';
  const points = data.map((d, i) => ({
    index: i,
    x: pad.left + (w / Math.max(1, data.length - 1)) * i,
    y: pad.top + h - ((d.value - minVal) / (niceMax - minVal)) * h,
    value: d.value,
    label: d.label,
    fullLabel: d.fullLabel || d.label
  }));

  // Cache latest points/options for click handler so it doesn't close over stale data
  canvas._linePoints = points;
  canvas._lineChartW = w;
  canvas._lineOnSelect = options.onSelect;

  // Gradient area
  if (points.length > 1) {
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
    gradient.addColorStop(0, hexToRgba(lineColor, 0.25));
    gradient.addColorStop(1, hexToRgba(lineColor, 0));
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + h);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // Line
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

  // Points (visible only if not too many)
  const showDots = points.length <= 31;
  if (showDots) {
    points.forEach((p, i) => {
      const isSel = options.selected === i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSel ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.stroke();
    });
  }

  // Tooltip for selected point
  const selIdx = options.selected;
  if (selIdx != null && selIdx >= 0 && selIdx < points.length) {
    const p = points[selIdx];
    drawTooltip(ctx, p, lineColor, options.valueFormatter);
  } else {
    // Show peak label by default (no selection)
    const peakIdx = values.indexOf(Math.max(...values));
    if (peakIdx >= 0 && values[peakIdx] > 0) {
      // peak label skipped if too many points and not selectable
      const p = points[peakIdx];
      const label = formatShort(p.value);
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      // background
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      const boxW = tw + 10;
      const boxH = 16;
      const boxX = clamp(p.x - boxW / 2, 1, cssW - boxW - 1);
      const boxY = clamp(p.y - boxH - 8, 1, cssH - boxH - 1);
      roundRect(ctx, boxX, boxY, boxW, boxH, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, boxX + boxW / 2, boxY + boxH / 2 + 1);
    }
  }

  // Click handler (register once; reads latest points from canvas instance)
  if (!canvas._lineHandlerBound) {
    canvas._lineHandlerBound = true;
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', (e) => {
      const pts = canvas._linePoints || [];
      const onSelect = canvas._lineOnSelect;
      if (!pts.length || !onSelect) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      // Find nearest point by x distance
      let nearest = null;
      let minDist = Infinity;
      pts.forEach(p => {
        const d = Math.abs(p.x - cx);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      });
      const chartW = canvas._lineChartW || 280;
      // Threshold: max half of step + tolerance
      const threshold = Math.max(20, chartW / Math.max(1, pts.length) / 2 + 8);
      if (nearest && minDist <= threshold) {
        onSelect(nearest.index);
      } else {
        onSelect(null);
      }
    });
  }

  return points;
}

// 多系列折线图：用于资产趋势等场景
// series: [{ data: [{label, value, fullLabel?}], color, label }]
// options: { selected, onSelect(idx, seriesIdx) }
export function drawMultiLineChart(canvas, series, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 220;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const validSeries = series.filter(s => s.data && s.data.length);
  if (!validSeries.length) {
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', cssW / 2, cssH / 2);
    return null;
  }

  const pad = { top: 18, right: 16, bottom: 26, left: 48 };
  const w = cssW - pad.left - pad.right;
  const h = cssH - pad.top - pad.bottom;

  // 计算所有系列的统一 Y 轴范围
  const allValues = [];
  validSeries.forEach(s => s.data.forEach(d => { if (d.value != null) allValues.push(d.value); }));
  const maxVal = Math.max(1, ...allValues);
  const niceMax = niceNumber(maxVal);
  const minVal = 0;

  // Y 轴网格 + 标签
  ctx.strokeStyle = '#F3F4F6';
  ctx.fillStyle = '#9CA3AF';
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
    const val = (niceMax / gridLines) * i;
    ctx.fillText(formatShort(val), pad.left - 6, y);
  }

  // X 轴标签（用第一个系列的 labels）
  const firstData = validSeries[0].data;
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(firstData.length / 6));
  firstData.forEach((d, i) => {
    if (i % step !== 0 && i !== firstData.length - 1) return;
    const x = pad.left + (w / Math.max(1, firstData.length - 1)) * i;
    ctx.fillText(d.label, x, pad.top + h + 6);
  });

  // 为每个系列绘制折线和点
  const allPoints = []; // [seriesIdx][pointIdx] = {x, y, value, label, fullLabel}
  validSeries.forEach((s, sIdx) => {
    const color = s.color || '#4ECDC4';
    const points = s.data.map((d, i) => ({
      index: i,
      seriesIndex: sIdx,
      x: pad.left + (w / Math.max(1, s.data.length - 1)) * i,
      y: pad.top + h - ((d.value - minVal) / (niceMax - minVal)) * h,
      value: d.value,
      label: d.label,
      fullLabel: d.fullLabel || d.label,
      color: color,
      seriesLabel: s.label || ''
    }));
    allPoints.push(points);

    // 折线
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // 点
    if (points.length <= 31) {
      points.forEach((p, i) => {
        const isSel = options.selected && options.selected.seriesIdx === sIdx && options.selected.pointIdx === i;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isSel ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.stroke();
      });
    }
  });

  // 缓存所有点用于点击处理
  canvas._multiLinePoints = allPoints;
  canvas._multiChartW = w;
  canvas._multiOnSelect = options.onSelect;

  // Tooltip（选中点）
  if (options.selected) {
    const { seriesIdx, pointIdx } = options.selected;
    const pts = allPoints[seriesIdx];
    if (pts && pts[pointIdx]) {
      const p = pts[pointIdx];
      drawMultiTooltip(ctx, p, allPoints, pointIdx);
    }
  } else {
    // 默认显示最后一个有数据的月份的数值
    for (let i = firstData.length - 1; i >= 0; i--) {
      let hasData = false;
      validSeries.forEach(s => { if (s.data[i] && s.data[i].value != null) hasData = true; });
      if (hasData) {
        const p = allPoints[0][i];
        if (p && p.value != null) {
          drawMultiTooltip(ctx, p, allPoints, i);
        }
        break;
      }
    }
  }

  // 点击处理（只绑定一次）
  if (!canvas._multiLineHandlerBound) {
    canvas._multiLineHandlerBound = true;
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', (e) => {
      const allPts = canvas._multiLinePoints || [];
      const onSelect = canvas._multiOnSelect;
      if (!allPts.length || !onSelect) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      // 在所有系列中找最近的点
      let nearest = null;
      let minDist = Infinity;
      allPts.forEach(pts => {
        pts.forEach(p => {
          const d = Math.abs(p.x - cx);
          if (d < minDist) {
            minDist = d;
            nearest = p;
          }
        });
      });
      const chartW = canvas._multiChartW || 280;
      const threshold = Math.max(20, chartW / Math.max(1, allPts[0].length) / 2 + 8);
      if (nearest && minDist <= threshold) {
        onSelect(nearest.index, nearest.seriesIndex);
      } else {
        onSelect(null, null);
      }
    });
  }

  return allPoints;
}

function drawMultiTooltip(ctx, p, allPoints, pointIdx) {
  // 显示该 X 位置所有系列的数值
  const lines = [];
  allPoints.forEach(pts => {
    if (pts[pointIdx] && pts[pointIdx].value != null) {
      lines.push({ color: pts[pointIdx].color, label: pts[pointIdx].seriesLabel, value: pts[pointIdx].value });
    }
  });
  if (!lines.length) return;
  const labelText = p.fullLabel || p.label;
  ctx.font = 'bold 12px sans-serif';
  const valueW = Math.max(...lines.map(l => ctx.measureText(formatShort(l.value)).width));
  ctx.font = '10px sans-serif';
  const labelW = ctx.measureText(labelText).width;
  const lineLabelW = Math.max(...lines.map(l => ctx.measureText(l.label).width));
  const boxW = Math.max(valueW + lineLabelW + 24, labelW + 14, 80);
  const boxH = 20 + lines.length * 16 + 6;

  const cssW = ctx.canvas.clientWidth || 320;
  const cssH = ctx.canvas.clientHeight || 220;
  let boxX = p.x - boxW / 2;
  let boxY = p.y - boxH - 10;
  boxX = clamp(boxX, 2, cssW - boxW - 2);
  if (boxY < 2) boxY = p.y + 10;

  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  roundRect(ctx, boxX, boxY, boxW, boxH, 6);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '10px sans-serif';
  ctx.fillText(labelText, boxX + boxW / 2, boxY + 11);

  lines.forEach((l, i) => {
    const y = boxY + 26 + i * 16;
    ctx.textAlign = 'left';
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.arc(boxX + 8, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.fillText(l.label, boxX + 16, y);
    ctx.textAlign = 'right';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(formatShort(l.value), boxX + boxW - 8, y);
  });
}

function drawTooltip(ctx, p, color, valueFormatter) {
  const fmt = valueFormatter || ((v) => formatShort(v));
  const valueText = fmt(p.value);
  const labelText = p.fullLabel || p.label;
  const valueLine = valueText;

  ctx.font = 'bold 12px sans-serif';
  const valueW = ctx.measureText(valueLine).width;
  ctx.font = '10px sans-serif';
  const labelW = ctx.measureText(labelText).width;
  const boxW = Math.max(valueW, labelW) + 14;
  const boxH = 36;

  const cssW = ctx.canvas.clientWidth || 320;
  const cssH = ctx.canvas.clientHeight || 220;
  let boxX = p.x - boxW / 2;
  let boxY = p.y - boxH - 10;
  boxX = clamp(boxX, 2, cssW - boxW - 2);
  if (boxY < 2) boxY = p.y + 10;

  // background
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  roundRect(ctx, boxX, boxY, boxW, boxH, 6);
  ctx.fill();

  // left color bar
  ctx.fillStyle = color;
  roundRect(ctx, boxX, boxY, 3, boxH, 1.5);
  ctx.fill();

  // text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '10px sans-serif';
  ctx.fillText(labelText, boxX + boxW / 2, boxY + 11);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(valueLine, boxX + boxW / 2, boxY + 25);

  // pointer line from box to point
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(boxX + boxW / 2, boxY + boxH);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
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
  // accepts #RGB or #RRGGBB
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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

function formatShort(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toString();
}
