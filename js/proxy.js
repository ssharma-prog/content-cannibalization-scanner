// CORS proxy abstraction — primary + fallback

const PROXIES = [
  {
    name: 'cloudflare-worker',
    wrap: (url) => `https://cors-proxy.ssharma-9a3.workers.dev/?url=${encodeURIComponent(url)}`
  },
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
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
      const resp = await fetch(proxy.wrap(url), { signal: controller.signal });
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      activeProxy = idx;
      return await resp.text();
    } catch (err) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) throw new Error('Cancelled');
      if (i === PROXIES.length - 1) {
        throw new Error(`All proxies failed for ${url}: ${err.message}`);
      }
    }
  }
}

export { fetchViaProxy };
