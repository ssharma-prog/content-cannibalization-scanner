// Sortable results table + CSV export

import { escapeHtml, shortenTitle } from './utils.js';

let currentData = [];
let sortCol = 'tfidfScore';
let sortDir = -1; // -1 = desc
let hasNgramData = false;

function renderTable(container, pairs, ngramResults) {
  // Merge n-gram results if available
  if (ngramResults) {
    hasNgramData = true;
    const ngramMap = new Map();
    for (const r of ngramResults) {
      ngramMap.set(`${r.urlA}|${r.urlB}`, r);
    }
    currentData = pairs.map(p => {
      const key = `${p.urlA}|${p.urlB}`;
      const n = ngramMap.get(key);
      return {
        ...p,
        phraseScore: n?.phraseScore ?? null,
        sharedPhrases: n?.sharedPhrases ?? []
      };
    });
  } else {
    currentData = pairs.map(p => ({
      ...p,
      phraseScore: p.phraseScore ?? null,
      sharedPhrases: p.sharedPhrases ?? []
    }));
    if (currentData.some(p => p.phraseScore !== null)) hasNgramData = true;
  }

  sortAndRender(container);
}

function sortAndRender(container) {
  currentData.sort((a, b) => {
    let va = a[sortCol] ?? -1;
    let vb = b[sortCol] ?? -1;
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return -sortDir;
    if (va > vb) return sortDir;
    return 0;
  });

  const arrow = (col) => {
    if (sortCol !== col) return '';
    return sortDir === -1 ? ' \u25BC' : ' \u25B2';
  };

  const phraseHeader = hasNgramData
    ? `<th data-col="phraseScore" class="sortable num">Phrase Overlap${arrow('phraseScore')}</th><th>Shared Phrases</th>`
    : '';

  const phraseCell = (p) => {
    if (!hasNgramData) return '';
    const score = p.phraseScore !== null ? p.phraseScore.toFixed(3) : '\u2014';
    const phrases = (p.sharedPhrases || []).slice(0, 3).map(ph => escapeHtml(ph)).join(', ');
    const count = (p.sharedPhrases || []).length;
    const more = count > 3 ? ` (+${count - 3} more)` : '';
    return `<td class="num">${score}</td><td class="phrases" title="${escapeHtml((p.sharedPhrases || []).join('; '))}">${phrases}${more}</td>`;
  };

  container.innerHTML = `
    <table class="results-table">
      <thead>
        <tr>
          <th data-col="titleA" class="sortable">Post A${arrow('titleA')}</th>
          <th data-col="titleB" class="sortable">Post B${arrow('titleB')}</th>
          <th data-col="tfidfScore" class="sortable num">Similarity Score${arrow('tfidfScore')}</th>
          ${phraseHeader}
        </tr>
      </thead>
      <tbody>
        ${currentData.map((p) => `
          <tr id="pair-${p.indexA}-${p.indexB}" class="${p.tfidfScore >= 0.5 ? 'high-sim' : p.tfidfScore >= 0.3 ? 'med-sim' : ''}">
            <td><a href="${escapeHtml(p.urlA)}" target="_blank" rel="noopener" title="${escapeHtml(p.titleA)}">${escapeHtml(shortenTitle(p.titleA, 60))}</a></td>
            <td><a href="${escapeHtml(p.urlB)}" target="_blank" rel="noopener" title="${escapeHtml(p.titleB)}">${escapeHtml(shortenTitle(p.titleB, 60))}</a></td>
            <td class="num">${p.tfidfScore.toFixed(3)}</td>
            ${phraseCell(p)}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Attach sort handlers
  container.querySelectorAll('.sortable').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir *= -1;
      } else {
        sortCol = col;
        sortDir = -1;
      }
      sortAndRender(container);
    });
  });
}

// Neutralize CSV formula injection: prefix dangerous chars with a tab
function csvSafe(val) {
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) return `\t${str}`;
  return str;
}

function csvQuote(val) {
  const safe = csvSafe(val);
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportCsv() {
  if (currentData.length === 0) return;

  const headers = ['Post A Title', 'Post A URL', 'Post B Title', 'Post B URL', 'Similarity Score'];
  if (hasNgramData) headers.push('Phrase Overlap', 'Shared Phrases');

  const rows = currentData.map(p => {
    const row = [
      csvQuote(p.titleA),
      csvQuote(p.urlA),
      csvQuote(p.titleB),
      csvQuote(p.urlB),
      p.tfidfScore
    ];
    if (hasNgramData) {
      row.push(p.phraseScore ?? '');
      row.push(csvQuote((p.sharedPhrases || []).join('; ')));
    }
    return row;
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `content-cannibalization-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function resetNgramData() {
  hasNgramData = false;
}

export { renderTable, exportCsv, resetNgramData };
