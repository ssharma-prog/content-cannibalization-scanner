// Canvas-based similarity thumbnail — no dependencies

function scoreToColor(score) {
  if (score >= 0.7) return [232, 69, 69];   // red — critical
  if (score >= 0.5) return [232, 144, 5];    // orange — review
  if (score >= 0.3) return [226, 216, 16];   // yellow — flagged
  if (score >= 0.15) return [22, 33, 62];    // dark blue — low
  return [15, 15, 26];                        // near-black — negligible
}

function renderHeatmap(container, matrix) {
  const N = matrix.length;
  if (N === 0) { container.innerHTML = ''; return; }

  container.innerHTML = '';

  const cellSize = Math.max(2, Math.min(8, Math.floor(300 / N)));
  const size = N * cellSize;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'heatmap-canvas';
  canvas.title = `${N}x${N} similarity matrix — brighter = more overlap`;

  const ctx = canvas.getContext('2d');

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const [r, g, b] = scoreToColor(matrix[i][j]);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
    }
  }

  // Legend
  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.innerHTML = `
    <span class="legend-item"><span class="swatch" style="background:rgb(232,69,69)"></span> &ge;0.7 Critical</span>
    <span class="legend-item"><span class="swatch" style="background:rgb(232,144,5)"></span> &ge;0.5 Review</span>
    <span class="legend-item"><span class="swatch" style="background:rgb(226,216,16)"></span> &ge;0.3 Flagged</span>
    <span class="legend-item"><span class="swatch" style="background:rgb(22,33,62)"></span> &lt;0.3 Fine</span>
  `;

  container.appendChild(canvas);
  container.appendChild(legend);
}

export { renderHeatmap };
