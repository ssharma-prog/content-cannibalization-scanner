// Text cleaning, stopwords, URL normalization

const STOPWORDS = new Set([
  'a','about','above','after','again','against','all','am','an','and','any','are',
  "aren't",'as','at','be','because','been','before','being','below','between','both',
  'but','by','can','could','did','do','does','doing','down','during','each','few',
  'for','from','further','get','got','had','has','have','having','he','her','here',
  'hers','herself','him','himself','his','how','i','if','in','into','is','it','its',
  'itself','just','know','let','like','make','me','might','more','most','must','my',
  'myself','no','nor','not','now','of','off','on','once','one','only','or','other',
  'our','ours','ourselves','out','over','own','re','s','said','same','she','should',
  'so','some','such','t','than','that','the','their','theirs','them','themselves',
  'then','there','these','they','this','those','through','to','too','under','until',
  'up','us','very','want','was','we','were','what','when','where','which','while',
  'who','whom','why','will','with','would','you','your','yours','yourself','yourselves',
  'also','been','being','come','came','did','do','does','done','get','gets','getting',
  'go','goes','going','gone','got','gotten','has','have','having','here','how','i',
  'its','just','keep','let','may','much','new','next','no','not','now','old','other',
  'put','say','says','see','seen','take','tell','thing','things','think','use','used',
  'using','way','well','went','what','will','work','works','year','years','still',
  'even','back','made','many','first','last','long','great','little','own','old',
  'right','big','high','different','small','large','good','best','better','bad',
  'really','need','every','look','find','give','day','most','us','another',
  'wordpress','plugin','site','website','page','post','blog','content','wp',
  'click','step','section','option','need','want','using','guide','learn','read',
  'check','add','create','set','help','including','example','following','etc',
  'however','also','sure','able','already','actually','always','simply','without'
]);

// Simple Porter stemmer (covers most common cases)
function stem(word) {
  if (word.length < 4) return word;

  // Step 1a
  if (word.endsWith('sses')) word = word.slice(0, -2);
  else if (word.endsWith('ies')) word = word.slice(0, -2);
  else if (word.endsWith('ss')) { /* keep */ }
  else if (word.endsWith('s')) word = word.slice(0, -1);

  // Step 1b
  if (word.endsWith('eed')) {
    if (word.length > 4) word = word.slice(0, -1);
  } else if (word.endsWith('ed') && word.length > 4) {
    word = word.slice(0, -2);
  } else if (word.endsWith('ing') && word.length > 5) {
    word = word.slice(0, -3);
  }

  // Step 2 - common suffixes
  const step2 = {
    'ational': 'ate', 'tional': 'tion', 'enci': 'ence', 'anci': 'ance',
    'izer': 'ize', 'alli': 'al', 'entli': 'ent', 'eli': 'e',
    'ousli': 'ous', 'ization': 'ize', 'ation': 'ate', 'ator': 'ate',
    'alism': 'al', 'iveness': 'ive', 'fulness': 'ful', 'ousness': 'ous',
    'aliti': 'al', 'iviti': 'ive', 'biliti': 'ble'
  };
  for (const [suffix, replacement] of Object.entries(step2)) {
    if (word.endsWith(suffix) && word.length - suffix.length > 2) {
      word = word.slice(0, -suffix.length) + replacement;
      break;
    }
  }

  // Step 3
  const step3 = {
    'icate': 'ic', 'ative': '', 'alize': 'al', 'iciti': 'ic',
    'ical': 'ic', 'ful': '', 'ness': ''
  };
  for (const [suffix, replacement] of Object.entries(step3)) {
    if (word.endsWith(suffix) && word.length - suffix.length > 2) {
      word = word.slice(0, -suffix.length) + replacement;
      break;
    }
  }

  return word;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/+$/, '') || '/';
    return u.origin + path;
  } catch {
    return url;
  }
}

function getBaseUrl(url) {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return url;
  }
}

function shortenTitle(title, maxLen = 50) {
  if (!title || title.length <= maxLen) return title || '(untitled)';
  return title.slice(0, maxLen - 3) + '...';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { STOPWORDS, stem, tokenize, normalizeUrl, getBaseUrl, shortenTitle, escapeHtml };
