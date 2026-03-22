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

async function fetchViaProxy(url, { timeoutMs = 15000, signal } = {}) {
  for (let i = 0; i < PROXIES.length; i++) {
    const idx = (activeProxy + i) % PROXIES.length;
    const proxy = PROXIES[idx];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // If external signal aborts, abort this request too
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort);

    try {
      const resp = await fetch(proxy.wrap(url), { signal: controller.signal });
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      activeProxy = idx;
      const text = await resp.text();
      return text;
    } catch (err) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
      if (signal?.aborted) throw new Error('Cancelled');
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
