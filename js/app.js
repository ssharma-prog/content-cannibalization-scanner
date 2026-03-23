// Orchestrator: UI events, workflow coordination

import { discoverSitemap, setExcludeSlugs } from './sitemap.js';
import { extractPosts } from './extractor.js';
import { computeAllPairs } from './tfidf.js';
import { renderHeatmap } from './heatmap.js';
import { renderTable, exportCsv, resetNgramData } from './table.js';
import { buildClusters, renderNetworkGraph, renderPostBreakdown } from './cluster.js';
import { parseWordPressExport } from './wp-import.js';
import { escapeHtml } from './utils.js';

// State
let posts = [];
let pairs = [];
let matrix = [];
let labels = [];
let scanController = null;
let ngramResults = null;
let ngramWorker = null;

// DOM refs — tabs
const tabUpload = document.getElementById('tab-upload');
const tabUrl = document.getElementById('tab-url');
const modeUpload = document.getElementById('mode-upload');
const modeUrl = document.getElementById('mode-url');
const wpFileInput = document.getElementById('wp-file');
const uploadBtn = document.getElementById('upload-btn');
const urlInput = document.getElementById('site-url');
const maxPostsInput = document.getElementById('max-posts');
const excludeSlugsInput = document.getElementById('exclude-slugs');
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
const ngramBtn = document.getElementById('ngram-btn');
const ngramTopInput = document.getElementById('ngram-top');
const ngramSizeInput = document.getElementById('ngram-size');
const ngramStatusEl = document.getElementById('ngram-status');
const clusterBtn = document.getElementById('cluster-btn');
const clusterStatusEl = document.getElementById('cluster-status');
const clusterResultsEl = document.getElementById('cluster-results');
const networkGraphEl = document.getElementById('network-graph');
const postBreakdownEl = document.getElementById('post-breakdown');
const resultsSection = document.getElementById('results');
const statsEl = document.getElementById('stats');
const failureReport = document.getElementById('failure-report');
const failureSummary = document.getElementById('failure-summary');
const failureList = document.getElementById('failure-list');

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

function getVisiblePairs() {
  const threshold = parseFloat(thresholdSlider.value);
  return pairs.filter(p => p.tfidfScore >= threshold);
}

// Debounce helper
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Tab switching
tabUpload.addEventListener('click', () => {
  tabUpload.classList.add('active');
  tabUrl.classList.remove('active');
  modeUpload.style.display = '';
  modeUrl.style.display = 'none';
});

tabUrl.addEventListener('click', () => {
  tabUrl.classList.add('active');
  tabUpload.classList.remove('active');
  modeUrl.style.display = '';
  modeUpload.style.display = 'none';
});

function showFailures(failures) {
  if (!failures || failures.length === 0) {
    failureReport.style.display = 'none';
    return;
  }
  failureReport.style.display = '';
  failureSummary.textContent = `${failures.length} page${failures.length !== 1 ? 's' : ''} skipped`;
  failureList.innerHTML = failures.map(f =>
    `<li><span class="failure-url">${escapeHtml(f.url)}</span><span class="failure-reason">${escapeHtml(f.reason)}</span></li>`
  ).join('');
}

// Shared: run TF-IDF and show results
function runAnalysis(extractedPosts) {
  posts = extractedPosts;

  if (posts.length < 2) {
    setStatus('Need at least 2 posts to compare.', 'error');
    return;
  }

  setStatus(`Analyzing ${posts.length} posts...`);

  const t0 = performance.now();
  const result = computeAllPairs(posts);
  const elapsed = Math.round(performance.now() - t0);
  pairs = result.pairs;
  matrix = result.matrix;
  labels = posts.map(p => p.title);

  const aboveThreshold = pairs.filter(p => p.tfidfScore >= 0.3).length;
  setStatus(`Done! ${posts.length} posts, ${pairs.length} pairs analyzed in ${elapsed}ms. ${aboveThreshold} pairs above 0.3 threshold.`, 'success');

  resultsSection.style.display = 'block';
  ngramBtn.disabled = false;
  clusterBtn.disabled = false;
  clusterResultsEl.style.display = 'none';
  statsEl.innerHTML = `
    <strong>${posts.length}</strong> posts analyzed |
    <strong>${pairs.length}</strong> pairs |
    <strong>${aboveThreshold}</strong> pairs with similarity &gt; 0.3 |
    Computed in <strong>${elapsed}ms</strong>
  `;

  renderHeatmap(heatmapContainer, matrix);
  renderTable(tableContainer, getVisiblePairs());
}

// Upload WordPress XML
uploadBtn.addEventListener('click', () => {
  const file = wpFileInput.files[0];
  if (!file) { setStatus('Select a WordPress export file', 'error'); return; }

  setStatus('Reading file...');
  ngramResults = null;
  resetNgramData();
  resultsSection.style.display = 'none';

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const xmlText = e.target.result;
      setStatus('Parsing WordPress export...');
      const imported = parseWordPressExport(xmlText);
      if (imported.length === 0) {
        setStatus('No posts found in the export file. Make sure it contains published posts.', 'error');
        return;
      }
      setStatus(`Parsed ${imported.length} posts from export.`);
      showFailures(null);
      runAnalysis(imported);
    } catch (err) {
      setStatus(`Error parsing file: ${err.message}`, 'error');
    }
  };
  reader.onerror = () => setStatus('Error reading file', 'error');
  reader.readAsText(file);
});

// URL scan workflow
scanBtn.addEventListener('click', async () => {
  let url = urlInput.value.trim();
  if (!url) { setStatus('Enter a URL', 'error'); return; }
  if (!url.startsWith('http')) url = 'https://' + url;

  // Parse exclude slugs
  const excludeText = excludeSlugsInput.value.trim();
  setExcludeSlugs(excludeText ? excludeText.split(',') : []);

  const maxPosts = parseInt(maxPostsInput.value) || 200;
  scanController = new AbortController();
  const signal = scanController.signal;
  scanBtn.style.display = 'none';
  cancelBtn.style.display = '';
  resultsSection.style.display = 'none';
  posts = [];
  pairs = [];
  ngramResults = null;
  resetNgramData();

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

    setStatus(`Extracted ${extracted.length} posts (${failures.length} failed). Computing similarity...`);
    showFailures(failures);
    runAnalysis(extracted);

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

// Threshold slider — debounced to prevent Chrome freeze
const debouncedRender = debounce(() => {
  renderTable(tableContainer, getVisiblePairs(), ngramResults);
}, 200);

thresholdSlider.addEventListener('input', () => {
  const val = parseFloat(thresholdSlider.value);
  thresholdVal.textContent = val.toFixed(2);
  debouncedRender();
});

// Export CSV
exportBtn.addEventListener('click', exportCsv);

// N-gram phrase overlap analysis — inline fallback if Worker fails
function getNgrams(text, n) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const ngrams = new Set();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function computePhraseOverlap(textA, textB) {
  const ngramsA = getNgrams(textA, 4);
  const ngramsB = getNgrams(textB, 4);
  if (ngramsA.size === 0 || ngramsB.size === 0) return { score: 0, sharedPhrases: [] };
  const shared = [];
  for (const phrase of ngramsA) {
    if (ngramsB.has(phrase)) shared.push(phrase);
  }
  const avgSize = (ngramsA.size + ngramsB.size) / 2;
  const score = Math.round((shared.length / avgSize) * 1000) / 1000;
  shared.sort((a, b) => b.length - a.length);
  return { score, sharedPhrases: shared.slice(0, 10) };
}

function buildBoilerplateSet(postsData, n) {
  const phraseCounts = {};
  for (const p of postsData) {
    const ngrams = getNgrams(p.text || '', n);
    for (const phrase of ngrams) {
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    }
  }
  const threshold = Math.max(2, postsData.length * 0.3);
  const boilerplate = new Set();
  for (const [phrase, count] of Object.entries(phraseCounts)) {
    if (count >= threshold) boilerplate.add(phrase);
  }
  return boilerplate;
}

function computePhraseOverlapFiltered(textA, textB, boilerplate, n) {
  const ngramsA = getNgrams(textA, n);
  const ngramsB = getNgrams(textB, n);
  if (ngramsA.size === 0 || ngramsB.size === 0) return { score: 0, sharedPhrases: [] };
  const shared = [];
  for (const phrase of ngramsA) {
    if (ngramsB.has(phrase) && !boilerplate.has(phrase)) shared.push(phrase);
  }
  const avgSize = (ngramsA.size + ngramsB.size) / 2;
  const score = Math.round((shared.length / avgSize) * 1000) / 1000;
  shared.sort((a, b) => b.length - a.length);
  return { score, sharedPhrases: shared.slice(0, 10) };
}

function runNgramInline(topPairs, postsData, n) {
  const postsMap = {};
  for (const p of postsData) postsMap[p.url] = p.text;
  const boilerplate = buildBoilerplateSet(postsData, n);
  const results = [];
  let totalShared = 0;
  for (const pair of topPairs) {
    const textA = postsMap[pair.urlA] || '';
    const textB = postsMap[pair.urlB] || '';
    const { score, sharedPhrases } = computePhraseOverlapFiltered(textA, textB, boilerplate, n);
    totalShared += sharedPhrases.length;
    results.push({ urlA: pair.urlA, urlB: pair.urlB, phraseScore: score, sharedPhrases });
  }
  results._totalShared = totalShared;
  results._boilerplateCount = boilerplate.size;
  return results;
}

ngramBtn.addEventListener('click', () => {
  if (pairs.length === 0) return;

  const topN = parseInt(ngramTopInput.value) || 20;
  const ngramSize = parseInt(ngramSizeInput.value) || 6;
  const topPairs = pairs.slice(0, topN);
  const pairData = topPairs.map(p => ({ urlA: p.urlA, urlB: p.urlB }));
  const postData = posts.map(p => ({ url: p.url, text: p.text }));

  ngramBtn.disabled = true;
  ngramStatusEl.textContent = 'Analyzing...';

  // Try Web Worker first, fall back to main thread
  try {
    if (ngramWorker) ngramWorker.terminate();
    ngramWorker = new Worker('js/ngram-worker.js');

    ngramWorker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        ngramStatusEl.textContent = `Analyzing ${msg.current} / ${msg.total} pairs...`;
      } else if (msg.type === 'done') {
        ngramResults = msg.results;
        ngramStatusEl.textContent = `Done! ${msg.results.length} pairs analyzed.`;
        ngramBtn.disabled = false;
        ngramWorker.terminate();
        ngramWorker = null;
        renderTable(tableContainer, getVisiblePairs(), ngramResults);
      }
    };

    ngramWorker.onerror = () => {
      // Worker failed — run inline instead
      ngramWorker.terminate();
      ngramWorker = null;
      ngramStatusEl.textContent = 'Running analysis...';
      setTimeout(() => {
        ngramResults = runNgramInline(pairData, postData, ngramSize);
        const ts = ngramResults._totalShared || 0;
        const bp = ngramResults._boilerplateCount || 0;
        ngramStatusEl.textContent = `Done! ${ngramResults.length} pairs. ${ts} shared phrases found. ${bp} boilerplate phrases filtered.`;
        ngramBtn.disabled = false;
        renderTable(tableContainer, getVisiblePairs(), ngramResults);
      }, 10);
    };

    ngramWorker.postMessage({ pairs: pairData, posts: postData, ngramSize });
  } catch {
    // Worker creation failed — run inline
    ngramStatusEl.textContent = 'Running analysis...';
    setTimeout(() => {
      ngramResults = runNgramInline(pairData, postData, ngramSize);
      const ts = ngramResults._totalShared || 0;
      const sl = ngramResults._sampleTextLen || 0;
      ngramStatusEl.textContent = `Done! ${ngramResults.length} pairs. ${ts} shared phrases found. First post: ${sl} chars.`;
      ngramBtn.disabled = false;
      renderTable(tableContainer, getVisiblePairs(), ngramResults);
    }, 10);
  }
});

// Cluster analysis
clusterBtn.addEventListener('click', () => {
  if (pairs.length === 0) return;

  const threshold = parseFloat(thresholdSlider.value);
  clusterStatusEl.textContent = 'Analyzing clusters...';
  clusterBtn.disabled = true;

  setTimeout(() => {
    const { posts: problemPosts, clusters, edges } = buildClusters(pairs, threshold);
    const totalClusters = clusters.length;
    const largestCluster = clusters.length > 0 ? clusters[0].length : 0;
    clusterStatusEl.textContent = `${problemPosts.length} problem posts in ${totalClusters} cluster${totalClusters !== 1 ? 's' : ''}. Largest cluster: ${largestCluster} posts.`;
    clusterBtn.disabled = false;
    clusterResultsEl.style.display = 'block';

    renderNetworkGraph(networkGraphEl, clusters, edges);
    renderPostBreakdown(postBreakdownEl, problemPosts);

    clusterResultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 10);
});

// Clear all data
document.getElementById('clear-btn').addEventListener('click', () => {
  posts = [];
  pairs = [];
  matrix = [];
  labels = [];
  ngramResults = null;
  resetNgramData();
  resultsSection.style.display = 'none';
  clusterResultsEl.style.display = 'none';
  wpFileInput.value = '';
  setStatus('All data cleared.', 'info');
});

// Support button
document.getElementById('support-btn').addEventListener('click', (e) => {
  e.preventDefault();
  window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank', 'noopener,noreferrer');
});

// Enter key on URL input
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') scanBtn.click();
});
