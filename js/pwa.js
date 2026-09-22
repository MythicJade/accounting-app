// js/pwa.js — service-worker registration, controlled updates and connection hints.
import { showModal, toast } from './ui.js';

let updatePromptOpen = false;
let updateRequested = false;

export function registerPWA() {
  if (globalThis.NativeApp?.isNative) return;
  if (!('serviceWorker' in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !updateRequested) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('online', () => toast('网络已恢复'));
  window.addEventListener('offline', () => toast('当前离线，仍可继续记账'));
  const startRegistration = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  };
  if (document.readyState === 'complete') startRegistration();
  else window.addEventListener('load', startRegistration, { once: true });
}

async function offerUpdate(worker) {
  if (updatePromptOpen) return;
  updatePromptOpen = true;
  const updateNow = await showModal({
    title: '发现新版本',
    body: '新版本已下载完成，已保存的账目不会受影响。编辑页面需先保存或退出，再更新。',
    actions: [
      { label: '稍后', type: 'ghost', value: false },
      { label: '立即更新', type: 'primary', value: true }
    ]
  });
  updatePromptOpen = false;
  if (updateNow) {
    if (/^#\/(add|edit|categories\/(new|edit))/.test(location.hash)) {
      toast('请先保存或退出编辑页面，再刷新检查更新', 'info', 3500);
      return;
    }
    updateRequested = true;
    if (worker.state === 'activated') location.reload();
    else worker.postMessage({ type: 'SKIP_WAITING' });
  }
}
