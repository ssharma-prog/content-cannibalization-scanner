// Secure Gemini API integration — optional semantic analysis

let apiKey = null;

function setApiKey(key) {
  apiKey = key;
}

function clearApiKey() {
  apiKey = null;
}

function hasApiKey() {
  return !!apiKey;
}

async function analyzeWithGemini(pairs) {
  if (!apiKey || pairs.length === 0) return [];

  const results = [];
  const batchSize = 5;

  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    const prompt = buildPrompt(batch);

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (resp.status === 401 || resp.status === 403) {
        clearApiKey();
        throw new Error('Invalid Gemini API key. Key has been cleared.');
      }

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(`Gemini API ${resp.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        batch.forEach(p => results.push({ ...p, geminiScore: null, recommendation: 'no_response' }));
      } else {
        try {
          const parsed = JSON.parse(text);
          const analyses = Array.isArray(parsed) ? parsed : parsed.analyses || [parsed];
          for (let j = 0; j < batch.length && j < analyses.length; j++) {
            results.push({
              ...batch[j],
              geminiScore: analyses[j].similarity_score ?? null,
              overlappingTopics: analyses[j].overlapping_topics ?? [],
              recommendation: analyses[j].recommendation ?? 'unknown'
            });
          }
        } catch {
          // If JSON parse fails, still return pairs without Gemini data
          batch.forEach(p => results.push({ ...p, geminiScore: null, recommendation: 'parse_error' }));
        }
      }
    } catch (err) {
      if (err.message.includes('Invalid Gemini API key')) throw err;
      // Surface the actual error so the user sees what went wrong
      throw new Error(err.message);
    }
  }

  return results;
}

function buildPrompt(pairs) {
  const pairDescriptions = pairs.map((p, i) => {
    const textA = p.textA ? p.textA.slice(0, 1500) : '(no text)';
    const textB = p.textB ? p.textB.slice(0, 1500) : '(no text)';
    return `Pair ${i + 1}:
Title A: ${p.titleA}
URL A: ${p.urlA}
Content A: ${textA}

Title B: ${p.titleB}
URL B: ${p.urlB}
Content B: ${textB}`;
  }).join('\n\n---\n\n');

  return `You are an SEO content analyst. Analyze the following ${pairs.length} pairs of blog posts for content cannibalization (overlapping topics that compete for the same search queries).

For each pair, return a JSON array with objects containing:
- "pair_index": the pair number (1-based)
- "similarity_score": 0.0 to 1.0 semantic similarity
- "overlapping_topics": array of shared topic strings
- "recommendation": one of "merge", "differentiate", "keep"
  - "merge" = substantially the same topic, combine into one post
  - "differentiate" = overlapping but can be made distinct with edits
  - "keep" = sufficiently different, no action needed

Return ONLY a JSON array, no other text.

${pairDescriptions}`;
}

// Clear key on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', clearApiKey);
}

export { setApiKey, clearApiKey, hasApiKey, analyzeWithGemini };
