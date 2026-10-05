// js/router.js — minimal hash router
export class Router {
  constructor(mountEl) {
    this.mount = mountEl;
    this.routes = [];
    this.currentCleanup = null;
    this.enterAnimationTimer = null;
    this.scrollPositions = new Map();
    this.currentHash = null;
    this.currentPath = null;
  }

  register(pattern, handler) {
    // pattern: '/add/:id'
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([^/]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    }) + '$');
    this.routes.push({ pattern, re, keys, handler });
    return this;
  }

  start() {
    window.addEventListener('hashchange', () => this.dispatch());
    // Also intercept clicks on [href^="#"]
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (a) {
        // let hashchange handle it; just trigger if same hash
        const href = a.getAttribute('href');
        if (location.hash === href) {
          e.preventDefault();
          this.dispatch();
        }
      }
    });
    this.dispatch();
  }

  async dispatch() {
    this.pending = true;
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      while (this.pending) {
        this.pending = false;
        await this.renderCurrent();
      }
    } finally {
      this.dispatching = false;
    }
  }

  async renderCurrent() {
    const fullHash = location.hash || '#/';
    if (this.currentHash && this.currentHash !== fullHash) this.scrollPositions.set(this.currentHash, window.scrollY);
    const rawHash = location.hash.slice(1) || '/';
    const queryStart = rawHash.indexOf('?');
    const hash = queryStart === -1 ? rawHash : rawHash.slice(0, queryStart);
    let matched = null, params = { query: new URLSearchParams(queryStart === -1 ? '' : rawHash.slice(queryStart + 1)) };
    for (const r of this.routes) {
      const m = r.re.exec(hash);
      if (m) {
        matched = r;
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        break;
      }
    }
    // cleanup previous
    if (typeof this.currentCleanup === 'function') {
      try { this.currentCleanup(); } catch (e) { console.warn(e); }
      this.currentCleanup = null;
    }
    // update tab active state
    this.updateTabbar(hash);
    const samePath = this.currentPath === hash;
    const restoreScroll = this.currentHash === fullHash ? window.scrollY : (this.scrollPositions.get(fullHash) || 0);
    this.currentHash = fullHash;
    this.currentPath = hash;
    // scroll top
    window.scrollTo(0, 0);
    if (!matched) {
      this.mount.innerHTML = '<div class="empty"><p>页面不存在</p></div>';
      this.playEnterAnimation();
      return;
    }
    // Show skeleton immediately
    this.mount.innerHTML = '';
    try {
      const result = await matched.handler(this.mount, params);
      if (typeof result === 'function') {
        this.currentCleanup = result;
      }
      if (!this.pending) {
        if (!samePath) this.playEnterAnimation();
        this.mount.focus({ preventScroll: true });
        window.scrollTo(0, restoreScroll);
      }
    } catch (e) {
      console.error('Route render error:', e);
      this.mount.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: '加载失败：' + (e.message || e) }));
      this.playEnterAnimation();
    }
  }

  playEnterAnimation() {
    if (this.enterAnimationTimer) clearTimeout(this.enterAnimationTimer);
    this.mount.classList.remove('route-enter');
    // Restart the short entrance animation when the same route is rendered again.
    void this.mount.offsetWidth;
    this.mount.classList.add('route-enter');
    this.enterAnimationTimer = setTimeout(() => {
      this.mount.classList.remove('route-enter');
      this.enterAnimationTimer = null;
    }, 500);
  }

  updateTabbar(hash) {
    const tabs = document.querySelectorAll('.tabbar .tab[data-route]');
    tabs.forEach(t => {
      const route = t.dataset.route;
      const isActive = hash === route || (route !== '/' && hash.startsWith(route + '/')) ||
        (route === '/' && (hash === '' || hash === '/'));
      t.classList.toggle('active', isActive);
    });
  }

  go(path) {
    if (!path.startsWith('#')) path = '#' + path;
    location.hash = path;
  }

  replaceState(path) {
    const hash = path.startsWith('#') ? path : '#' + path;
    if (hash.slice(1).split('?')[0] !== this.currentPath ||
        (location.hash.slice(1).split('?')[0] || '/') !== this.currentPath || this.pending) return;
    history.replaceState(null, '', hash);
    this.currentHash = hash;
  }
}

export const router = new Router(document.getElementById('view'));
