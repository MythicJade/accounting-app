// js/ui.js — shared UI helpers (toast, modal, confirm)
let toastTimer = null;

export function toast(msg, type = 'info', duration = 2000) {
  const el = document.getElementById('toast');
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.hidden = false;
  // force reflow
  void el.offsetWidth;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 250);
  }, duration);
}

export function showModal({ title, body, actions }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const modal = document.createElement('div');
    modal.className = 'modal';
    if (title) {
      const h = document.createElement('h3');
      h.textContent = title;
      modal.appendChild(h);
    }
    const bodyEl = document.createElement('div');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof Node) bodyEl.appendChild(body);
    modal.appendChild(bodyEl);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'modal-actions';
    const acts = actions || [{ label: '确定', type: 'primary' }];
    acts.forEach(act => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (act.type === 'danger' ? 'btn-danger' : act.type === 'ghost' ? 'btn-ghost' : '');
      btn.textContent = act.label;
      btn.onclick = () => {
        let result = act.value !== undefined ? act.value : act.label;
        if (typeof act.onClick === 'function') {
          const r = act.onClick();
          if (r === false) return; // keep open
        }
        close(result);
      };
      actionsEl.appendChild(btn);
    });
    modal.appendChild(actionsEl);
    mask.appendChild(modal);
    mask.addEventListener('click', (e) => { if (e.target === mask) close(null); });
    root.appendChild(mask);

    function close(result) {
      mask.style.opacity = '0';
      setTimeout(() => {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }, 200);
      resolve(result);
    }
  });
}

export function confirmDialog(message, { title = '确认操作', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return showModal({
    title,
    body: `<p style="text-align:center;color:var(--text-2);font-size:14px;">${escapeHtml(message)}</p>`,
    actions: [
      { label: cancelText, type: 'ghost', value: false },
      { label: okText, type: danger ? 'danger' : 'primary', value: true }
    ]
  });
}

export function promptDialog({ title = '输入', label = '', defaultValue = '', placeholder = '', okText = '确定', inputType = 'text' }) {
  const input = document.createElement('input');
  input.className = 'input';
  input.type = inputType;
  input.value = defaultValue;
  input.placeholder = placeholder;

  let bodyEl = input;
  if (label) {
    const lab = document.createElement('label');
    lab.className = 'field';
    lab.style.display = 'block';
    lab.textContent = label;
    const wrap = document.createElement('div');
    wrap.appendChild(lab);
    wrap.appendChild(input);
    bodyEl = wrap;
  }

  return new Promise((resolve) => {
    showModal({
      title,
      body: bodyEl,
      actions: [
        { label: '取消', type: 'ghost', value: null },
        { label: okText, type: 'primary', value: 'ok', onClick: () => {
          if (!input.value || (inputType === 'number' && isNaN(parseFloat(input.value)))) {
            toast('请输入有效内容');
            return false;
          }
        } }
      ]
    }).then(result => {
      if (result === 'ok') {
        resolve(inputType === 'number' ? parseFloat(input.value) : input.value);
      } else {
        resolve(null);
      }
    });
  });
}

export function vibrate(pattern = 10) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function el(tag, props = {}, children = []) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg','path','circle','rect','line','polyline','polygon','ellipse','g','defs','use','text','tspan','linearGradient','radialGradient','stop']);
  const isSVG = SVG_TAGS.has(tag);
  const node = isSVG
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  for (const k in props) {
    if (k === 'class') {
      if (isSVG) node.setAttribute('class', props[k]);
      else node.className = props[k];
    }
    else if (k === 'html') node.innerHTML = props[k];
    else if (k === 'text') node.textContent = props[k];
    else if (k.startsWith('on') && typeof props[k] === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), props[k]);
    } else if (k === 'dataset') {
      for (const d in props[k]) node.dataset[d] = props[k][d];
    } else if (k === 'attrs') {
      for (const a in props[k]) node.setAttribute(a, props[k][a]);
    } else {
      node.setAttribute(k, props[k]);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      node.appendChild(document.createTextNode(String(c)));
    } else {
      node.appendChild(c);
    }
  }
  return node;
}
