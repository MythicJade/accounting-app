// js/charts/pie-chart.js — Canvas donut chart with no dependencies
// data: [{ label, value, color }]
// options: { onSelect, selected, centerLabel, centerValue, topLabels }
//   - selected: index of currently selected slice (or null)
//   - centerLabel / centerValue: override center text (optional)
//   - topLabels: number of top slices to label with leader lines (default 3)

// 读取 CSS 变量（带 hex fallback）：Canvas 无法直接使用 var() 字符串
function readVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// 每次绘制重新读取，兼容动态主题
function pieColors() {
  return {
    border: readVar('--border', '#e5e5ea'),
    text: readVar('--text', '#1d1d1f'),
    text2: readVar('--text-2', '#6e6e73'),
    text3: readVar('--text-3', '#aeaeb2'),
    primary: readVar('--c-primary', '#007AFF'),
    card: readVar('--card', '#ffffff'),
    leader: readVar('--leader-line', '#c7c7cc')
  };
}

export function drawPieChart(canvas, data, options = {}) {
  if (canvas._pieAnimationFrame) cancelAnimationFrame(canvas._pieAnimationFrame);
  canvas._pieAnimationFrame = 0;
  canvas._pieAnimating = false;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 220;
  const cssH = canvas.clientHeight || 240;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = pieColors();
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = cssW / 2;
  const cy = cssH / 2;
  const radius = Math.min(cssW, cssH) / 2 - 28; // reserve room for leader lines
  const innerRadius = radius * 0.58; // donut hole
  const slices = [];

  // Cache geometry on canvas instance so click handler doesn't close over stale data
  canvas._pieGeom = { cx, cy, radius, innerRadius };
  canvas._pieOnSelect = options.onSelect;

  // Click handler is registered once and always reads the latest geometry.
  if (!canvas._pieHandlerBound) {
    canvas._pieHandlerBound = true;
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', (e) => {
      const geom = canvas._pieGeom;
      const onSelect = canvas._pieOnSelect;
      const sl = canvas._pieSlices || [];
      if (!geom || !onSelect || canvas._pieAnimating) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - geom.cx;
      const y = e.clientY - rect.top - geom.cy;
      const dist = Math.sqrt(x * x + y * y);
      if (dist < geom.innerRadius || dist > geom.radius + 6) {
        onSelect(null);
        return;
      }
      let angle = Math.atan2(y, x);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      for (const s of sl) {
        if (angle >= s.startAngle && angle <= s.endAngle) {
          onSelect(s.index);
          return;
        }
      }
      onSelect(null);
    });
  }

  if (total <= 0) {
    ctx.clearRect(0, 0, cssW, cssH);
    canvas._pieSlices = [];
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = C.border;
    ctx.fill();
    ctx.fillStyle = C.text3;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', cx, cy);
    return slices;
  }

  // Compute slice angles and skip 0-value
  let startAngle = -Math.PI / 2;
  data.forEach((d, i) => {
    if (d.value <= 0) return;
    const angle = (d.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    slices.push({
      index: i,
      startAngle, endAngle,
      midAngle: (startAngle + endAngle) / 2,
      value: d.value,
      label: d.label,
      color: d.color || C.primary,
      pct: d.value / total
    });
    startAngle = endAngle;
  });
  function paint(rotation = 0) {
    ctx.clearRect(0, 0, cssW, cssH);
    const rotated = slices.map(slice => ({
      ...slice,
      startAngle: slice.startAngle + rotation,
      endAngle: slice.endAngle + rotation,
      midAngle: slice.midAngle + rotation
    }));
    canvas._pieSlices = rotated;

    rotated.forEach(s => {
      const isSelected = options.selected === s.index;
      const outerR = isSelected ? radius + 4 : radius;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, s.startAngle, s.endAngle);
      ctx.arc(cx, cy, innerRadius, s.endAngle, s.startAngle, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = C.card;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    const topN = options.topLabels != null ? options.topLabels : 3;
    [...rotated].sort((a, b) => b.value - a.value).slice(0, topN).forEach(s => {
      drawLeaderLabel(ctx, cx, cy, radius, s, options.selected === s.index, C);
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sel = options.selected != null ? rotated.find(x => x.index === options.selected) : null;
    if (sel) {
      ctx.fillStyle = sel.color;
      ctx.font = 'bold 13px sans-serif';
      let lbl = sel.label || '';
      const maxW = innerRadius * 1.6;
      if (ctx.measureText(lbl).width > maxW) {
        while (lbl.length > 1 && ctx.measureText(lbl + '…').width > maxW) lbl = lbl.slice(0, -1);
        lbl += '…';
      }
      ctx.fillText(lbl, cx, cy - 16);
      ctx.fillStyle = C.text;
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(formatMoneyShort(sel.value), cx, cy + 2);
      ctx.fillStyle = C.text3;
      ctx.font = '11px sans-serif';
      ctx.fillText(Math.round(sel.pct * 100) + '%', cx, cy + 20);
    } else {
      ctx.fillStyle = C.text;
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(formatMoneyShort(total), cx, cy - 6);
      ctx.fillStyle = C.text3;
      ctx.font = '11px sans-serif';
      ctx.fillText('总计', cx, cy + 14);
    }
  }

  const signature = JSON.stringify([
    cssW, cssH,
    data.map(d => [d.label, d.value, d.color || C.primary])
  ]);
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = canvas._pieAnimationSignature !== signature && !reduceMotion;
  canvas._pieAnimationSignature = signature;

  if (shouldAnimate) {
    const duration = 680;
    const startedAt = performance.now();
    canvas._pieAnimating = true;
    const frame = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      paint(-Math.PI * 2 * (1 - eased));
      if (progress < 1) {
        canvas._pieAnimationFrame = requestAnimationFrame(frame);
      } else {
        canvas._pieAnimationFrame = 0;
        canvas._pieAnimating = false;
        paint(0);
      }
    };
    canvas._pieAnimationFrame = requestAnimationFrame(frame);
  } else {
    paint(0);
  }

  return slices;
}

function drawLeaderLabel(ctx, cx, cy, radius, slice, isSelected, C) {
  const mid = slice.midAngle;
  const r1 = radius + 2;
  const r2 = radius + 10;
  const x1 = cx + Math.cos(mid) * r1;
  const y1 = cy + Math.sin(mid) * r1;
  const x2 = cx + Math.cos(mid) * r2;
  const y2 = cy + Math.sin(mid) * r2;
  // leader line goes outward then horizontal
  const isRight = x2 >= cx;
  const x3 = isRight ? x2 + 8 : x2 - 8;

  ctx.strokeStyle = isSelected ? slice.color : C.leader;
  ctx.lineWidth = isSelected ? 1.5 : 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y2);
  ctx.stroke();

  // small dot at slice edge
  ctx.fillStyle = slice.color;
  ctx.beginPath();
  ctx.arc(x1, y1, 2, 0, Math.PI * 2);
  ctx.fill();

  // label
  const labelText = slice.label || '';
  const moneyText = formatMoneyShort(slice.value);
  const fontSize = isSelected ? 12 : 11;
  ctx.font = isSelected ? 'bold ' + fontSize + 'px sans-serif' : fontSize + 'px sans-serif';
  ctx.textBaseline = 'middle';
  if (isRight) {
    ctx.textAlign = 'left';
    ctx.fillStyle = isSelected ? slice.color : C.text2;
    ctx.fillText(labelText, x3 + 2, y2 - 6);
    ctx.fillStyle = C.text3;
    ctx.font = '10px sans-serif';
    ctx.fillText(moneyText, x3 + 2, y2 + 6);
  } else {
    ctx.textAlign = 'right';
    ctx.fillStyle = isSelected ? slice.color : C.text2;
    ctx.font = isSelected ? 'bold ' + fontSize + 'px sans-serif' : fontSize + 'px sans-serif';
    ctx.fillText(labelText, x3 - 2, y2 - 6);
    ctx.fillStyle = C.text3;
    ctx.font = '10px sans-serif';
    ctx.fillText(moneyText, x3 - 2, y2 + 6);
  }
}

function formatMoneyShort(n) {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
  return '¥' + n.toFixed(0);
}
