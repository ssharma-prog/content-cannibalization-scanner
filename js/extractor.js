// HTML → clean text extraction

import { fetchViaProxy } from './proxy.js';

const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside',
  '.sidebar', '.widget', '.comment', '.comments', '.menu', '.nav',
  '.breadcrumb', '.social-share', '.related-posts', '.author-bio',
  '#sidebar', '#comments', '#menu', '#nav', '.wp-block-comments',
  '.sharedaddy', '.jp-relatedposts',
  '.share', '.social', '.sharing', '.addtoany', '.post-share',
  '[class*="share"]', '[class*="social"]', '[class*="sharing"]',
  '.author-box', '.post-author', '.entry-author', '.byline',
  '.post-meta', '.entry-meta', '.post-tags', '.tag-links'
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

const LOGIN_SIGNALS = [
  /name=["']log["']/i,
  /name=["']pwd["']/i,
  /name=["']password["']/i,
  /id=["']loginform["']/i,
  /id=["']user_login["']/i,
  /action=["'][^"']*wp-login/i,
  /action=["'][^"']*login/i,
  /<title>[^<]*(log\s*in|sign\s*in|authenticate)[^<]*<\/title>/i
];

function isLoginPage(html) {
  let matches = 0;
  for (const pattern of LOGIN_SIGNALS) {
    if (pattern.test(html)) matches++;
  }
  return matches >= 2; // require 2+ signals to avoid false positives
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

async function extractPosts(urls, onProgress, signal) {
  const results = [];
  const failures = [];
  const batchSize = 5;

  for (let i = 0; i < urls.length; i += batchSize) {
    if (signal?.aborted) throw new Error('Cancelled');
    const batch = urls.slice(i, i + batchSize);
    const promises = batch.map(async (url) => {
      try {
        const html = await fetchViaProxy(url, { signal });
        if (isLoginPage(html)) {
          failures.push({ url, reason: 'Login page detected' });
          return null;
        }
        const extracted = extractFromHtml(html, url);
        if (extracted.text.length < 50) {
          failures.push({ url, reason: 'Too little content' });
          return null;
        }
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

export { extractPosts };
