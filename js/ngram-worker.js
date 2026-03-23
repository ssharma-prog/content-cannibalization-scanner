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

function buildBoilerplateSet(posts, n) {
  const phraseCounts = {};
  for (const p of posts) {
    const ngrams = getNgrams(p.text || '', n);
    for (const phrase of ngrams) {
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    }
  }
  const threshold = Math.max(2, posts.length * 0.3);
  const boilerplate = new Set();
  for (const [phrase, count] of Object.entries(phraseCounts)) {
    if (count >= threshold) boilerplate.add(phrase);
  }
  return boilerplate;
}

function computePhraseOverlap(textA, textB, boilerplate, n) {
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

self.onmessage = function(e) {
  const { pairs, posts, ngramSize = 6 } = e.data;
  const n = ngramSize;
  const postsMap = {};
  for (const p of posts) {
    postsMap[p.url] = p.text;
  }

  const boilerplate = buildBoilerplateSet(posts, n);

  const results = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const textA = postsMap[pair.urlA] || '';
    const textB = postsMap[pair.urlB] || '';
    const { score, sharedPhrases } = computePhraseOverlap(textA, textB, boilerplate, n);

    results.push({
      urlA: pair.urlA,
      urlB: pair.urlB,
      phraseScore: score,
      sharedPhrases
    });

    if ((i + 1) % 5 === 0 || i === pairs.length - 1) {
      self.postMessage({ type: 'progress', current: i + 1, total: pairs.length });
    }
  }

  self.postMessage({ type: 'done', results });
};
