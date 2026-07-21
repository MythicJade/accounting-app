// js/router.js — minimal hash router
export class Router {
  constructor(mountEl) {
    this.mount = mountEl;
    this.routes = [];
    this.currentCleanup = null;
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
    const hash = location.hash.slice(1) || '/';
    let matched = null, params = {};
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
    // scroll top
    window.scrollTo(0, 0);
    if (!matched) {
      this.mount.innerHTML = '<div class="empty"><p>页面不存在</p></div>';
      return;
    }
    // Show skeleton immediately
    this.mount.innerHTML = '';
    try {
      const result = await matched.handler(this.mount, params);
      if (typeof result === 'function') {
        this.currentCleanup = result;
      }
    } catch (e) {
      console.error('Route render error:', e);
      this.mount.innerHTML = '<div class="empty"><p>加载失败：' + (e.message || e) + '</p></div>';
    }
  }

  updateTabbar(hash) {
    const tabs = document.querySelectorAll('.tabbar .tab[data-route]');
    tabs.forEach(t => {
      const route = t.dataset.route;
      const isActive = hash === route || (route === '/' && (hash === '' || hash === '/'));
      t.classList.toggle('active', isActive);
    });
  }

  go(path) {
    if (!path.startsWith('#')) path = '#' + path;
    location.hash = path;
  }
}

export const router = new Router(document.getElementById('view'));
