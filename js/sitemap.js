// Sitemap discovery and XML parsing

import { fetchViaProxy } from './proxy.js';
import { normalizeUrl, getBaseUrl } from './utils.js';

const BLOG_INCLUDE = ['/blog/', /\/\d{4}\/\d{2}\//, /\/\d{4}\/\d{2}\/\d{2}\//];
const BLOG_EXCLUDE = ['/category/', '/tag/', '/author/', '/page/', '/feed/', '/wp-content/', '/wp-admin/', '/wp-json/'];

let excludeSlugs = new Set();

function setExcludeSlugs(slugs) {
  excludeSlugs = new Set(
    slugs.map(s => s.trim().toLowerCase().replace(/^\/|\/$/g, '')).filter(Boolean)
  );
}

function isBlogPost(url) {
  const path = new URL(url).pathname;
  // Exclude known non-post patterns
  if (BLOG_EXCLUDE.some(ex => path.includes(ex))) return false;
  // Exclude user-specified slugs
  const segments = path.split('/').filter(Boolean);
  const slug = segments.length > 0 ? segments[segments.length - 1].toLowerCase() : '';
  if (excludeSlugs.has(slug)) return false;
  // Include if matches blog patterns, or if it's a leaf page (has a slug)
  if (BLOG_INCLUDE.some(inc => typeof inc === 'string' ? path.includes(inc) : inc.test(path))) return true;
  // Fallback: include paths that look like posts (not just /)
  return segments.length >= 1 && !path.endsWith('.xml');
}

function parseUrlsFromXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const urls = [];

  // Check for sitemap index
  const sitemaps = doc.querySelectorAll('sitemap > loc');
  if (sitemaps.length > 0) {
    return { type: 'index', urls: Array.from(sitemaps).map(el => el.textContent.trim()) };
  }

  // Regular sitemap
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

  // Try each candidate
  for (const candidate of candidates) {
    onStatus?.(`Trying ${candidate}...`);
    try {
      const xml = await fetchViaProxy(candidate, { signal });
      const result = parseUrlsFromXml(xml);
      if (result.type === 'index') {
        // Follow sub-sitemaps
        for (const subUrl of result.urls) {
          onStatus?.(`Following sub-sitemap: ${subUrl}`);
          try {
            const subXml = await fetchViaProxy(subUrl, { signal });
            const subResult = parseUrlsFromXml(subXml);
            if (subResult.type === 'urlset') {
              allUrls.push(...subResult.urls);
            }
          } catch { /* skip failed sub-sitemaps */ }
        }
      } else {
        allUrls.push(...result.urls);
      }
      if (allUrls.length > 0) break;
    } catch { /* try next */ }
  }

  // Fallback: check robots.txt
  if (allUrls.length === 0) {
    onStatus?.('Checking robots.txt for sitemap directives...');
    try {
      const robots = await fetchViaProxy(`${base}/robots.txt`, { signal });
      const sitemapUrls = parseSitemapsFromRobots(robots, base);
      for (const smUrl of sitemapUrls) {
        onStatus?.(`Found in robots.txt: ${smUrl}`);
        try {
          const xml = await fetchViaProxy(smUrl);
          const result = parseUrlsFromXml(xml);
          if (result.type === 'index') {
            for (const subUrl of result.urls) {
              try {
                const subXml = await fetchViaProxy(subUrl, { signal });
                const subResult = parseUrlsFromXml(subXml);
                if (subResult.type === 'urlset') allUrls.push(...subResult.urls);
              } catch { /* skip */ }
            }
          } else {
            allUrls.push(...result.urls);
          }
        } catch { /* skip */ }
      }
    } catch { /* no robots.txt */ }
  }

  if (allUrls.length === 0) {
    throw new Error('No sitemap found. Tried standard paths and robots.txt.');
  }

  // Normalize and deduplicate
  allUrls = [...new Set(allUrls.map(normalizeUrl))];

  // Filter to blog posts
  const blogUrls = allUrls.filter(isBlogPost);

  return blogUrls.length > 0 ? blogUrls : allUrls;
}

export { discoverSitemap, setExcludeSlugs };
