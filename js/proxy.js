// CORS proxy abstraction — primary + fallback

const PROXIES = [
  {
    name: 'corsproxy.io',
    wrap: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  },
  {
    name: 'allorigins.win',
    wrap: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  }
];

let activeProxy = 0;

async function fetchViaProxy(url, timeoutMs = 15000) {
  for (let i = 0; i < PROXIES.length; i++) {
    const idx = (activeProxy + i) % PROXIES.length;
    const proxy = PROXIES[idx];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(proxy.wrap(url), { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      activeProxy = idx; // remember which one worked
      return await resp.text();
    } catch (err) {
      clearTimeout(timer);
      if (i === PROXIES.length - 1) {
        throw new Error(`All proxies failed for ${url}: ${err.message}`);
      }
    }
  }
}

function getActiveProxyName() {
  return PROXIES[activeProxy].name;
}

export { fetchViaProxy, getActiveProxyName };
