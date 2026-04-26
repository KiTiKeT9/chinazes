// User-Agent presets. Applied via session.setUserAgent() in main process.
// NOTE: Chinazes is built on Electron/Chromium and cannot use a different engine.
// Spoofing UA only changes how sites *think* about your browser; rendering is still Chromium.

export const UA_PRESETS = [
  {
    id: 'default',
    name: 'Chinazes (Chromium)',
    desc: 'Стандартный Chromium от Electron',
    ua: '', // empty = use Electron default
  },
  {
    id: 'chrome-win',
    name: 'Google Chrome (Windows)',
    desc: 'Свежий Chrome 135 / Win 10',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  },
  {
    id: 'firefox-win',
    name: 'Mozilla Firefox',
    desc: 'Firefox 134 на Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  },
  {
    id: 'safari-mac',
    name: 'Safari (macOS)',
    desc: 'Safari 18 на Mac',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  },
  {
    id: 'edge-win',
    name: 'Microsoft Edge',
    desc: 'Edge 131 на Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  },
  {
    id: 'opera',
    name: 'Opera',
    desc: 'Opera 116 на Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/116.0.0.0',
  },
  {
    id: 'iphone-safari',
    name: 'iPhone Safari',
    desc: 'Мобильная версия — сайты покажут адаптивный дизайн',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
];

const STORAGE_KEY = 'chinazes:user-agent';

export function getStoredUA() {
  return localStorage.getItem(STORAGE_KEY) || 'default';
}

export function setStoredUA(id) {
  localStorage.setItem(STORAGE_KEY, id);
}
