// Sortable results table + CSV export

import { escapeHtml, shortenTitle } from './utils.js';

let currentData = [];
let sortCol = 'tfidfScore';
let sortDir = -1; // -1 = desc
let highlightedRow = null;

function renderTable(container, pairs, geminiResults) {
  const geminiMap = new Map();
  if (geminiResults) {
    for (const r of geminiResults) {
      const key = `${r.urlA}|${r.urlB}`;
      geminiMap.set(key, r);
    }
  }

  currentData = pairs.map(p => {
    const key = `${p.urlA}|${p.urlB}`;
    const g = geminiMap.get(key);
    return {
      ...p,
      geminiScore: g?.geminiScore ?? null,
      recommendation: g?.recommendation ?? '',
      overlappingTopics: g?.overlappingTopics ?? []
    };
  });

  sortAndRender(container);
}

function sortAndRender(container) {
  currentData.sort((a, b) => {
    let va = a[sortCol] ?? -1;
    let vb = b[sortCol] ?? -1;
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir;
    if (va > vb) return -sortDir;
    return 0;
  });

  const tierClass = (score) => {
    if (score >= 0.7) return 'tier-danger';
    if (score >= 0.5) return 'tier-warning';
    return '';
  };

  const scoreClass = (score) => {
    if (score >= 0.7) return 'score-danger';
    if (score >= 0.5) return 'score-warning';
    return '';
  };

  const recClass = (rec) => {
    if (rec === 'merge') return 'rec-merge';
    if (rec === 'differentiate') return 'rec-diff';
    if (rec === 'keep') return 'rec-keep';
    return '';
  };

  const recLabel = (rec) => {
    if (rec === 'merge') return 'Merge';
    if (rec === 'differentiate') return 'Differentiate';
    if (rec === 'keep') return 'Keep';
    return rec || '\u2014';
  };

  const arrow = (col) => {
    if (sortCol !== col) return '';
    return sortDir === -1 ? ' \u25BC' : ' \u25B2';
  };

  container.innerHTML = `
    <table class="results-table">
      <thead>
        <tr>
          <th data-col="titleA" class="sortable">Post A${arrow('titleA')}</th>
          <th data-col="titleB" class="sortable">Post B${arrow('titleB')}</th>
          <th data-col="tfidfScore" class="sortable num">TF-IDF Score${arrow('tfidfScore')}</th>
          <th data-col="geminiScore" class="sortable num">Gemini Score${arrow('geminiScore')}</th>
          <th data-col="recommendation" class="sortable">Recommendation${arrow('recommendation')}</th>
        </tr>
      </thead>
      <tbody>
        ${currentData.map((p) => `
          <tr id="pair-${p.indexA}-${p.indexB}" class="${tierClass(p.tfidfScore)}">
            <td><a href="${escapeHtml(p.urlA)}" target="_blank" rel="noopener" title="${escapeHtml(p.titleA)}">${escapeHtml(shortenTitle(p.titleA, 60))}</a></td>
            <td><a href="${escapeHtml(p.urlB)}" target="_blank" rel="noopener" title="${escapeHtml(p.titleB)}">${escapeHtml(shortenTitle(p.titleB, 60))}</a></td>
            <td class="num ${scoreClass(p.tfidfScore)}">${p.tfidfScore.toFixed(3)}</td>
            <td class="num">${p.geminiScore !== null ? p.geminiScore.toFixed(2) : '\u2014'}</td>
            <td class="${recClass(p.recommendation)}">${recLabel(p.recommendation)}</td>
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

function highlightPair(indexA, indexB) {
  // Clear previous
  clearHighlight();

  const row = document.getElementById(`pair-${indexA}-${indexB}`)
    || document.getElementById(`pair-${indexB}-${indexA}`);
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('active-highlight');
    highlightedRow = row;
  }
}

function clearHighlight() {
  if (highlightedRow) {
    highlightedRow.classList.remove('active-highlight');
    highlightedRow = null;
  }
}

// Kept for backwards compat but now highlightPair is preferred
function scrollToPair(indexA, indexB) {
  highlightPair(indexA, indexB);
}

function exportCsv() {
  if (currentData.length === 0) return;

  const headers = ['Post A Title', 'Post A URL', 'Post B Title', 'Post B URL', 'TF-IDF Score', 'Gemini Score', 'Recommendation', 'Overlapping Topics'];
  const rows = currentData.map(p => [
    `"${p.titleA.replace(/"/g, '""')}"`,
    p.urlA,
    `"${p.titleB.replace(/"/g, '""')}"`,
    p.urlB,
    p.tfidfScore,
    p.geminiScore ?? '',
    p.recommendation,
    `"${(p.overlappingTopics || []).join('; ').replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `content-cannibalization-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export { renderTable, scrollToPair, highlightPair, clearHighlight, exportCsv };
