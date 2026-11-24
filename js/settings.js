// Settings + small cache, backed by chrome.storage (falls back to localStorage
// so the page can also be previewed from a plain web server).
const DEFAULTS = { city: '', units: 'metric', hour12: false, sound: true, volume: 0.6, webClientId: '' };
const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
const LS_KEY = 'airport-settings';

export async function loadSettings() {
  if (hasChrome) {
    const s = await chrome.storage.sync.get(DEFAULTS);
    return { ...DEFAULTS, ...s };
  }
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export async function saveSettings(patch) {
  if (hasChrome) return chrome.storage.sync.set(patch);
  const cur = await loadSettings();
  localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...patch }));
}

export function onSettingsChanged(cb) {
  if (hasChrome) chrome.storage.onChanged.addListener((_c, area) => { if (area === 'sync') cb(); });
  else window.addEventListener('storage', cb);
}

export async function cacheGet(key) {
  try {
    if (hasChrome) return (await chrome.storage.local.get(key))[key];
    return JSON.parse(localStorage.getItem('airport-cache-' + key));
  } catch { return undefined; }
}

export async function cacheSet(key, value) {
  try {
    if (hasChrome) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem('airport-cache-' + key, JSON.stringify(value));
  } catch { /* ignore */ }
}
