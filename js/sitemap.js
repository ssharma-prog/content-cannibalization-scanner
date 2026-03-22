// Sitemap discovery and XML parsing

import { fetchViaProxy } from './proxy.js';
import { normalizeUrl, getBaseUrl } from './utils.js';

const BLOG_INCLUDE = ['/blog/', /\/\d{4}\/\d{2}\//, /\/\d{4}\/\d{2}\/\d{2}\//];
const BLOG_EXCLUDE = [
  '/category/', '/tag/', '/author/', '/page/', '/feed/',
  '/wp-content/', '/wp-admin/', '/wp-json/', '/wp-login',
  '/cart/', '/checkout/', '/my-account/', '/shop/',
  '/attachment/', '/embed/'
];

const DEFAULT_EXCLUDE_SLUGS = new Set([
  'about', 'about-us', 'contact', 'contact-us', 'privacy', 'privacy-policy',
  'terms', 'terms-of-service', 'terms-and-conditions', 'cookie-policy',
  'disclaimer', 'sitemap', 'search', 'login', 'register', 'signup',
  'cart', 'checkout', 'account', 'my-account', 'wishlist',
  'thank-you', 'thanks', '404', 'sample-page', 'hello-world',
  'home', 'homepage', 'landing', 'coming-soon', 'maintenance',
  'subscribe', 'unsubscribe', 'confirmation', 'opt-in'
]);

let customExcludeSlugs = new Set();

function setCustomExcludeSlugs(slugs) {
  customExcludeSlugs = new Set(
    slugs.map(s => s.trim().toLowerCase().replace(/^\/|\/$/g, '')).filter(Boolean)
  );
}

function isBlogPost(url) {
  const path = new URL(url).pathname;

  // Exclude known non-post patterns
  if (BLOG_EXCLUDE.some(ex => path.includes(ex))) return false;

  // Exclude known non-post slugs + custom slugs
  const segments = path.split('/').filter(Boolean);
  const slug = segments.length > 0 ? segments[segments.length - 1].toLowerCase() : '';
  const fullPath = segments.join('/').toLowerCase();

  if (DEFAULT_EXCLUDE_SLUGS.has(slug) || customExcludeSlugs.has(slug) || customExcludeSlugs.has(fullPath)) {
    return false;
  }

  // Include if matches blog patterns
  if (BLOG_INCLUDE.some(inc => typeof inc === 'string' ? path.includes(inc) : inc.test(path))) return true;

  // Fallback: accept 1+ segments (original behavior)
  return segments.length >= 1 && !path.endsWith('.xml');
}

function parseUrlsFromXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const urls = [];

  const sitemaps = doc.querySelectorAll('sitemap > loc');
  if (sitemaps.length > 0) {
    return { type: 'index', urls: Array.from(sitemaps).map(el => el.textContent.trim()) };
  }

  const locs = doc.querySelectorAll('url > loc');
  locs.forEach(el => urls.push(el.textContent.trim()));
  return { type: 'urlset', urls };
}

function parseSitemapsFromRobots(robotsText, baseUrl) {
  const sitemaps = [];
  for (const line of robotsText.split('\n')) {
    const match = line.match(/^Sitemap:\s*(.+)/i);
    if (match) sitemaps.push(match[1].trim());
  }
  return sitemaps;
}

async function discoverSitemap(siteUrl, onStatus, signal) {
  const base = getBaseUrl(siteUrl);
  const candidates = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/wp-sitemap.xml`,
    `${base}/post-sitemap.xml`,
    `${base}/sitemap-posts.xml`,
  ];

  let allUrls = [];

  for (const candidate of candidates) {
    if (signal?.aborted) throw new Error('Cancelled');
    onStatus?.(`Trying ${candidate}...`);
    try {
      const xml = await fetchViaProxy(candidate, { signal });
      const result = parseUrlsFromXml(xml);
      if (result.type === 'index') {
        for (const subUrl of result.urls) {
          if (signal?.aborted) throw new Error('Cancelled');
          onStatus?.(`Following sub-sitemap: ${subUrl}`);
          try {
            const subXml = await fetchViaProxy(subUrl, { signal });
            const subResult = parseUrlsFromXml(subXml);
            if (subResult.type === 'urlset') {
              allUrls.push(...subResult.urls);
            }
          } catch (e) { if (e.message === 'Cancelled') throw e; }
        }
      } else {
        allUrls.push(...result.urls);
      }
      if (allUrls.length > 0) break;
    } catch (e) { if (e.message === 'Cancelled') throw e; }
  }

  if (allUrls.length === 0) {
    if (signal?.aborted) throw new Error('Cancelled');
    onStatus?.('Checking robots.txt for sitemap directives...');
    try {
      const robots = await fetchViaProxy(`${base}/robots.txt`, { signal });
      const sitemapUrls = parseSitemapsFromRobots(robots, base);
      for (const smUrl of sitemapUrls) {
        if (signal?.aborted) throw new Error('Cancelled');
        onStatus?.(`Found in robots.txt: ${smUrl}`);
        try {
          const xml = await fetchViaProxy(smUrl, { signal });
          const result = parseUrlsFromXml(xml);
          if (result.type === 'index') {
            for (const subUrl of result.urls) {
              if (signal?.aborted) throw new Error('Cancelled');
              try {
                const subXml = await fetchViaProxy(subUrl, { signal });
                const subResult = parseUrlsFromXml(subXml);
                if (subResult.type === 'urlset') allUrls.push(...subResult.urls);
              } catch (e) { if (e.message === 'Cancelled') throw e; }
            }
          } else {
            allUrls.push(...result.urls);
          }
        } catch (e) { if (e.message === 'Cancelled') throw e; }
      }
    } catch (e) { if (e.message === 'Cancelled') throw e; }
  }

  if (allUrls.length === 0) {
    throw new Error('No sitemap found. Tried standard paths and robots.txt.');
  }

  allUrls = [...new Set(allUrls.map(normalizeUrl))];

  const blogUrls = allUrls.filter(isBlogPost);

  return blogUrls.length > 0 ? blogUrls : allUrls;
}

export { discoverSitemap, setCustomExcludeSlugs };
