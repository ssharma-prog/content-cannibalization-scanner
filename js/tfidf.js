// Custom TF-IDF + cosine similarity engine

import { tokenize } from './utils.js';

function buildTfidf(documents) {
  const N = documents.length;
  const docTokens = documents.map(doc => tokenize(doc.text));
  const df = {}; // document frequency per term

  // Count document frequency
  for (const tokens of docTokens) {
    const seen = new Set(tokens);
    for (const term of seen) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  // Build TF-IDF vectors (sparse representation)
  const vectors = docTokens.map(tokens => {
    const tf = {};
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1;
    }
    const totalTerms = tokens.length || 1;
    const vector = {};
    for (const [term, count] of Object.entries(tf)) {
      const tfVal = count / totalTerms;
      const idfVal = Math.log(N / (df[term] || 1));
      const score = tfVal * idfVal;
      if (score > 0) vector[term] = score;
    }
    return vector;
  });

  return vectors;
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0, magA = 0, magB = 0;

  for (const term in vecA) {
    magA += vecA[term] * vecA[term];
    if (term in vecB) {
      dot += vecA[term] * vecB[term];
    }
  }
  for (const term in vecB) {
    magB += vecB[term] * vecB[term];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

function computeAllPairs(documents) {
  const vectors = buildTfidf(documents);
  const N = documents.length;
  const pairs = [];
  const matrix = Array.from({ length: N }, () => new Float32Array(N));

  for (let i = 0; i < N; i++) {
    matrix[i][i] = 1.0;
    for (let j = i + 1; j < N; j++) {
      const score = cosineSimilarity(vectors[i], vectors[j]);
      const rounded = Math.round(score * 1000) / 1000;
      matrix[i][j] = rounded;
      matrix[j][i] = rounded;
      pairs.push({
        indexA: i,
        indexB: j,
        urlA: documents[i].url,
        urlB: documents[j].url,
        titleA: documents[i].title,
        titleB: documents[j].title,
        tfidfScore: rounded
      });
    }
  }

  // Sort pairs by score descending
  pairs.sort((a, b) => b.tfidfScore - a.tfidfScore);

  return { pairs, matrix, vectors };
}

export { computeAllPairs, buildTfidf, cosineSimilarity };
