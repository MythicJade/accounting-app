// js/native-bridge.js — optional bridge exposed by the Capacitor build.
// The regular PWA does not load native-runtime.js, so every helper keeps a web fallback.

export function isNativeApp() {
  return Boolean(globalThis.NativeApp?.isNative);
}

export async function shareTextFile(filename, text, mimeType = 'application/json') {
  if (!isNativeApp() || typeof globalThis.NativeApp.shareTextFile !== 'function') return false;
  await globalThis.NativeApp.shareTextFile({ filename, text, mimeType });
  return true;
}

export async function shareBase64File(filename, base64, mimeType) {
  if (!isNativeApp() || typeof globalThis.NativeApp.shareBase64File !== 'function') return false;
  await globalThis.NativeApp.shareBase64File({ filename, base64, mimeType });
  return true;
}
