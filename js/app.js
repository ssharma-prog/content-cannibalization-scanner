// Orchestrator: UI events, workflow coordination

import { discoverSitemap } from './sitemap.js';
import { extractPosts } from './extractor.js';
import { computeAllPairs } from './tfidf.js';
import { setApiKey, clearApiKey, hasApiKey, analyzeWithGemini } from './gemini.js';
import { renderHeatmap } from './heatmap.js';
import { renderTable, scrollToPair, exportCsv, filterTable } from './table.js';

// State
let posts = [];
let pairs = [];
let matrix = [];
let labels = [];
let scanController = null;

// DOM refs
const urlInput = document.getElementById('site-url');
const maxPostsInput = document.getElementById('max-posts');
const scanBtn = document.getElementById('scan-btn');
const cancelBtn = document.getElementById('cancel-btn');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const heatmapContainer = document.getElementById('heatmap');
const tableContainer = document.getElementById('table-container');
const thresholdSlider = document.getElementById('threshold');
const thresholdVal = document.getElementById('threshold-val');
const exportBtn = document.getElementById('export-csv');
const geminiKeyInput = document.getElementById('gemini-key');
const geminiSetBtn = document.getElementById('gemini-set');
const geminiClearBtn = document.getElementById('gemini-clear');
const geminiStatus = document.getElementById('gemini-status');
const geminiRunBtn = document.getElementById('gemini-run');
const resultsSection = document.getElementById('results');
const statsEl = document.getElementById('stats');

function setStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

function showProgress(current, total, label) {
  progressBar.style.display = 'block';
  const pct = Math.round((current / total) * 100);
  progressFill.style.width = `${pct}%`;
  progressText.textContent = label || `${current} / ${total}`;
}

function hideProgress() {
  progressBar.style.display = 'none';
}

// Main scan workflow
scanBtn.addEventListener('click', async () => {
  let url = urlInput.value.trim();
  if (!url) { setStatus('Enter a URL', 'error'); return; }
  if (!url.startsWith('http')) url = 'https://' + url;

  const maxPosts = parseInt(maxPostsInput.value) || 200;
  scanController = new AbortController();
  const signal = scanController.signal;
  scanBtn.style.display = 'none';
  cancelBtn.style.display = '';
  resultsSection.style.display = 'none';
  posts = [];
  pairs = [];

  try {
    // Step 1: Discover sitemap
    setStatus('Discovering sitemap...');
    const urls = await discoverSitemap(url, (msg) => setStatus(msg), signal);
    setStatus(`Found ${urls.length} URLs in sitemap`);

    if (urls.length > maxPosts) {
      setStatus(`Found ${urls.length} posts, capping at ${maxPosts}. Adjust limit if needed.`, 'warning');
    }
    const targetUrls = urls.slice(0, maxPosts);

    // Step 2: Extract content
    setStatus(`Extracting content from ${targetUrls.length} posts...`);
    showProgress(0, targetUrls.length, 'Extracting...');
    const { posts: extracted, failures } = await extractPosts(targetUrls, (current, total) => {
      showProgress(current, total, `Extracted ${current} / ${total} posts`);
    }, signal);
    posts = extracted;
    hideProgress();

    if (posts.length < 2) {
      setStatus('Need at least 2 posts to compare. Check if the site is accessible.', 'error');
      scanBtn.style.display = '';
      cancelBtn.style.display = 'none';
      scanController = null;
      return;
    }

    setStatus(`Extracted ${posts.length} posts (${failures.length} failed). Computing similarity...`);

    // Step 3: TF-IDF
    const t0 = performance.now();
    const result = computeAllPairs(posts);
    const elapsed = Math.round(performance.now() - t0);
    pairs = result.pairs;
    matrix = result.matrix;
    labels = posts.map(p => p.title);

    const aboveThreshold = pairs.filter(p => p.tfidfScore >= 0.3).length;
    setStatus(`Done! ${posts.length} posts, ${pairs.length} pairs analyzed in ${elapsed}ms. ${aboveThreshold} pairs above 0.3 threshold.`, 'success');

    // Step 4: Show results
    resultsSection.style.display = 'block';
    statsEl.innerHTML = `
      <strong>${posts.length}</strong> posts analyzed |
      <strong>${pairs.length}</strong> pairs |
      <strong>${aboveThreshold}</strong> pairs with similarity &gt; 0.3 |
      <strong>${failures.length}</strong> extraction failures |
      Computed in <strong>${elapsed}ms</strong>
    `;

    renderHeatmap(heatmapContainer, matrix);

    renderTable(tableContainer, pairs.filter(p => p.tfidfScore >= parseFloat(thresholdSlider.value)));

  } catch (err) {
    hideProgress();
    if (err.message === 'Cancelled') {
      setStatus('Scan cancelled.', 'warning');
    } else {
      setStatus(`Error: ${err.message}`, 'error');
    }
  }

  scanBtn.style.display = '';
  cancelBtn.style.display = 'none';
  scanController = null;
});

// Cancel
cancelBtn.addEventListener('click', () => {
  scanController?.abort();
});

// Threshold slider
thresholdSlider.addEventListener('input', () => {
  const val = parseFloat(thresholdSlider.value);
  thresholdVal.textContent = val.toFixed(2);
  renderTable(tableContainer, pairs.filter(p => p.tfidfScore >= val));
});

// Export CSV
exportBtn.addEventListener('click', exportCsv);

// Gemini key management
geminiSetBtn.addEventListener('click', () => {
  const key = geminiKeyInput.value.trim();
  if (!key) return;
  setApiKey(key);
  geminiKeyInput.value = '';
  geminiStatus.textContent = 'Key set (memory only)';
  geminiStatus.className = 'gemini-status active';
  geminiRunBtn.disabled = false;
  geminiClearBtn.style.display = 'inline-block';
});

geminiClearBtn.addEventListener('click', () => {
  clearApiKey();
  geminiStatus.textContent = 'No key set';
  geminiStatus.className = 'gemini-status';
  geminiRunBtn.disabled = true;
  geminiClearBtn.style.display = 'none';
});

geminiRunBtn.addEventListener('click', async () => {
  if (!hasApiKey()) { setStatus('Set a Gemini API key first', 'error'); return; }
  if (pairs.length === 0) { setStatus('Run a scan first', 'error'); return; }

  const topPairs = pairs.filter(p => p.tfidfScore >= 0.3).slice(0, 20);
  if (topPairs.length === 0) {
    setStatus('No pairs above 0.3 threshold to analyze with Gemini', 'warning');
    return;
  }

  // Attach text snippets for Gemini
  const postsMap = new Map(posts.map(p => [p.url, p]));
  const pairsWithText = topPairs.map(p => ({
    ...p,
    textA: postsMap.get(p.urlA)?.text?.slice(0, 2000) || '',
    textB: postsMap.get(p.urlB)?.text?.slice(0, 2000) || ''
  }));

  geminiRunBtn.disabled = true;
  setStatus(`Analyzing ${pairsWithText.length} pairs with Gemini...`);

  try {
    const geminiResults = await analyzeWithGemini(pairsWithText);
    setStatus(`Gemini analysis complete for ${geminiResults.length} pairs`, 'success');
    const threshold = parseFloat(thresholdSlider.value);
    renderTable(tableContainer, pairs.filter(p => p.tfidfScore >= threshold), geminiResults);
  } catch (err) {
    setStatus(`Gemini error: ${err.message}`, 'error');
    if (!hasApiKey()) {
      geminiStatus.textContent = 'Key cleared (invalid)';
      geminiStatus.className = 'gemini-status';
      geminiRunBtn.disabled = true;
      geminiClearBtn.style.display = 'none';
    }
  }

  geminiRunBtn.disabled = !hasApiKey();
});

// Enter key on URL input
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') scanBtn.click();
});
