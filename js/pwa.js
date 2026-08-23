// js/pwa.js — service-worker registration, controlled updates and connection hints.
import { showModal, toast } from './ui.js';

let updatePromptOpen = false;

export function registerPWA() {
  if (!('serviceWorker' in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
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
    body: '新版本已下载完成。刷新后生效，账目数据不会受影响。',
    actions: [
      { label: '稍后', type: 'ghost', value: false },
      { label: '立即更新', type: 'primary', value: true }
    ]
  });
  updatePromptOpen = false;
  if (updateNow) worker.postMessage({ type: 'SKIP_WAITING' });
}
