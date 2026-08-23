import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

const isNative = Capacitor.isNativePlatform();

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function writeAndShare({ filename, base64, mimeType }) {
  const result = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
    recursive: true
  });
  await Share.share({
    title: filename,
    dialogTitle: '保存或分享备份文件',
    files: [result.uri]
  });
  return { uri: result.uri, mimeType };
}

globalThis.NativeApp = {
  isNative,
  platform: Capacitor.getPlatform(),
  shareTextFile: ({ filename, text, mimeType }) => writeAndShare({
    filename,
    base64: utf8ToBase64(text),
    mimeType
  }),
  shareBase64File: ({ filename, base64, mimeType }) => writeAndShare({ filename, base64, mimeType })
};

if (isNative) {
  document.documentElement.classList.add('native-platform');

  Promise.allSettled([
    StatusBar.setOverlaysWebView({ overlay: false }),
    StatusBar.setBackgroundColor({ color: '#F4F5F8' }),
    StatusBar.setStyle({ style: Style.Light })
  ]).catch(() => {});

  App.addListener('backButton', () => {
    const modal = document.querySelector('.modal-mask');
    if (modal) {
      modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    const route = location.hash.slice(1) || '/';
    if (route !== '/') {
      if (history.length > 1) history.back();
      else location.hash = '#/';
      return;
    }
    App.exitApp();
  });

  let splashHidden = false;
  const hideSplash = () => {
    if (splashHidden) return;
    splashHidden = true;
    setTimeout(() => SplashScreen.hide().catch(() => {}), 120);
  };
  if (document.readyState === 'complete') hideSplash();
  else window.addEventListener('load', hideSplash, { once: true });
  // WebView module loading can occasionally finish after the load event was queued.
  setTimeout(hideSplash, 900);
}
