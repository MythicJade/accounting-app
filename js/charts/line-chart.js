// js/charts/line-chart.js — Canvas line chart, no dependencies
// data: [{ label, value }]
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
    return;
  }

  const pad = { top: 16, right: 12, bottom: 24, left: 36 };
  const w = cssW - pad.left - pad.right;
  const h = cssH - pad.top - pad.bottom;

  const values = data.map(d => d.value);
  const maxVal = Math.max(1, ...values);
  // Round up to nice number
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

  // X-axis labels (show subset to avoid clutter)
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

  // Line + area
  const lineColor = options.color || '#4ECDC4';
  const points = data.map((d, i) => ({
    x: pad.left + (w / Math.max(1, data.length - 1)) * i,
    y: pad.top + h - ((d.value - minVal) / (niceMax - minVal)) * h,
    value: d.value
  }));

  // Gradient area
  if (points.length > 1) {
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
    gradient.addColorStop(0, 'rgba(78, 205, 196, 0.25)');
    gradient.addColorStop(1, 'rgba(78, 205, 196, 0)');
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

  // Points (only if not too many)
  if (points.length <= 16) {
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  // Hover/peak label
  const peakIdx = values.indexOf(Math.max(...values));
  if (peakIdx >= 0 && values[peakIdx] > 0) {
    const p = points[peakIdx];
    const label = formatShort(p.value);
    ctx.fillStyle = lineColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // background
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(p.x - tw/2 - 4, p.y - 22, tw + 8, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, p.x, p.y - 6);
  }
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
