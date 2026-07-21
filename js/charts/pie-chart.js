// js/charts/pie-chart.js — Canvas pie chart with no dependencies
// data: [{ label, value, color }]
// options: { onSelect, selected }
export function drawPieChart(canvas, data, options = {}) {
  const ctx = canvas.getContext('2d');
  // Handle high-DPI
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 220;
  const cssH = canvas.clientHeight || 220;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = cssW / 2;
  const cy = cssH / 2;
  const radius = Math.min(cssW, cssH) / 2 - 12;
  const innerRadius = radius * 0.55; // donut

  // Save slice info for click detection
  const slices = [];

  if (total <= 0) {
    // Empty state
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = '#E5E7EB';
    ctx.fill();
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', cx, cy);
    return slices;
  }

  let startAngle = -Math.PI / 2;
  data.forEach((d, i) => {
    if (d.value <= 0) return;
    const angle = (d.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const isSelected = options.selected === i;
    const r = isSelected ? radius + 6 : radius;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = d.color || '#4ECDC4';
    ctx.fill();

    slices.push({ index: i, startAngle, endAngle, value: d.value, label: d.label, color: d.color });
    startAngle = endAngle;
  });

  // Inner circle (donut hole)
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Center label
  ctx.fillStyle = '#1F2937';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatMoneyShort(total), cx, cy - 8);
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '11px sans-serif';
  ctx.fillText('总计', cx, cy + 12);

  // Click handler
  if (options.onSelect && !canvas._pieHandlerBound) {
    canvas._pieHandlerBound = true;
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - cx;
      const y = e.clientY - rect.top - cy;
      const dist = Math.sqrt(x * x + y * y);
      if (dist < innerRadius || dist > radius + 8) {
        options.onSelect(null);
        return;
      }
      let angle = Math.atan2(y, x);
      // normalize to start from -PI/2
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      for (const s of slices) {
        if (angle >= s.startAngle && angle <= s.endAngle) {
          options.onSelect(s.index);
          return;
        }
      }
      options.onSelect(null);
    });
  }

  return slices;
}

function formatMoneyShort(n) {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
  return '¥' + n.toFixed(0);
}
