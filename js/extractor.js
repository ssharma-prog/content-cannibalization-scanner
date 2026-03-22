// HTML → clean text extraction with quality gates

import { fetchViaProxy } from './proxy.js';

const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside',
  '.sidebar', '.widget', '.comment', '.comments', '.menu', '.nav',
  '.breadcrumb', '.social-share', '.related-posts', '.author-bio',
  '#sidebar', '#comments', '#menu', '#nav', '.wp-block-comments',
  '.sharedaddy', '.jp-relatedposts'
];

const CONTENT_SELECTORS = [
  'article .entry-content',
  'article .post-content',
  '.entry-content',
  '.post-content',
  '.article-content',
  'article',
  '[role="main"]',
  'main',
  '.content',
  '#content'
];

const PLACEHOLDER_PATTERNS = [
  /lorem\s+ipsum/i,
  /dolor\s+sit\s+amet/i,
  /consectetur\s+adipiscing/i,
  /this\s+(page|post)\s+is\s+(under\s+construction|coming\s+soon)/i,
  /sample\s+page/i,
  /this\s+is\s+an?\s+(example|sample|test)\s+(page|post)/i,
  /your\s+content\s+goes\s+here/i,
  /replace\s+this\s+(text|content)/i
];

const GENERIC_TITLES = new Set([
  'page not found', '404', '404 not found', 'not found',
  'untitled', 'draft', 'test', 'test page', 'sample page',
  'just another wordpress site', 'coming soon', 'under construction',
  'maintenance mode', 'website coming soon'
]);

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function extractFromHtml(html, url) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove noise
  for (const sel of NOISE_SELECTORS) {
    doc.querySelectorAll(sel).forEach(el => el.remove());
  }

  // Get title
  const title = doc.querySelector('h1')?.textContent?.trim()
    || doc.querySelector('title')?.textContent?.trim()
    || url;

  // Find content container
  let contentEl = null;
  for (const sel of CONTENT_SELECTORS) {
    contentEl = doc.querySelector(sel);
    if (contentEl && contentEl.textContent.trim().length > 100) break;
  }
  if (!contentEl) contentEl = doc.body;

  const text = contentEl?.innerText || contentEl?.textContent || '';

  return {
    url,
    title: title.replace(/\s+/g, ' ').trim(),
    text: text.replace(/\s+/g, ' ').trim()
  };
}

function isPlaceholderContent(text) {
  return PLACEHOLDER_PATTERNS.some(p => p.test(text));
}

function isGenericTitle(title) {
  return GENERIC_TITLES.has(title.toLowerCase().trim());
}

async function extractPosts(urls, onProgress, signal) {
  const results = [];
  const failures = [];
  const contentHashes = new Map(); // hash → first URL with that content
  const batchSize = 5;

  for (let i = 0; i < urls.length; i += batchSize) {
    if (signal?.aborted) throw new Error('Cancelled');

    const batch = urls.slice(i, i + batchSize);
    const promises = batch.map(async (url) => {
      try {
        const html = await fetchViaProxy(url, { signal });
        const extracted = extractFromHtml(html, url);

        // Quality gate: minimum content length (200 chars ≈ 30-40 words)
        if (extracted.text.length < 200) {
          failures.push({ url, reason: 'Too little content' });
          return null;
        }

        // Quality gate: placeholder/lorem ipsum detection
        if (isPlaceholderContent(extracted.text)) {
          failures.push({ url, reason: 'Placeholder content detected' });
          return null;
        }

        // Quality gate: generic/error page title
        if (isGenericTitle(extracted.title)) {
          failures.push({ url, reason: `Generic title: "${extracted.title}"` });
          return null;
        }

        // Quality gate: duplicate content detection (redirect/duplicate page)
        // Hash first 500 chars to catch redirects serving identical content
        const hash = simpleHash(extracted.text.slice(0, 500));
        const existing = contentHashes.get(hash);
        if (existing) {
          failures.push({ url, reason: `Duplicate content (same as ${existing})` });
          return null;
        }
        contentHashes.set(hash, url);

        return extracted;
      } catch (err) {
        if (err.message === 'Cancelled') throw err;
        failures.push({ url, reason: err.message });
        return null;
      }
    });

    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      if (r) results.push(r);
    }
    onProgress?.(Math.min(i + batchSize, urls.length), urls.length);
  }

  return { posts: results, failures };
}

export { extractPosts, extractFromHtml };
