// Web Worker: N-gram phrase overlap analysis
// Runs off main thread to avoid freezing the browser

function getNgrams(text, n) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const ngrams = new Set();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function computePhraseOverlap(textA, textB) {
  const ngramsA = getNgrams(textA, 5);
  const ngramsB = getNgrams(textB, 5);

  if (ngramsA.size === 0 || ngramsB.size === 0) return { score: 0, sharedPhrases: [] };

  const shared = [];
  for (const phrase of ngramsA) {
    if (ngramsB.has(phrase)) shared.push(phrase);
  }

  const avgSize = (ngramsA.size + ngramsB.size) / 2;
  const score = Math.round((shared.length / avgSize) * 1000) / 1000;

  // Return top 10 shared phrases sorted by length (longer = more specific)
  shared.sort((a, b) => b.length - a.length);

  return { score, sharedPhrases: shared.slice(0, 10) };
}

self.onmessage = function(e) {
  const { pairs, posts } = e.data;
  const postsMap = {};
  for (const p of posts) {
    postsMap[p.url] = p.text;
  }

  const results = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const textA = postsMap[pair.urlA] || '';
    const textB = postsMap[pair.urlB] || '';
    const { score, sharedPhrases } = computePhraseOverlap(textA, textB);

    results.push({
      urlA: pair.urlA,
      urlB: pair.urlB,
      phraseScore: score,
      sharedPhrases
    });

    // Report progress every 5 pairs
    if ((i + 1) % 5 === 0 || i === pairs.length - 1) {
      self.postMessage({ type: 'progress', current: i + 1, total: pairs.length });
    }
  }

  self.postMessage({ type: 'done', results });
};
