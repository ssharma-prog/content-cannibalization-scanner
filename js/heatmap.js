// Plotly.js heatmap rendering with custom tooltip

let tooltipEl = null;

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'heatmap-tooltip';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function renderHeatmap(container, matrix, labels, onCellClick) {
  const shortLabels = labels.map(l =>
    l.length > 30 ? l.slice(0, 27) + '...' : l
  );

  // Store full labels in customdata for hover events
  const customdata = [];
  for (let i = 0; i < labels.length; i++) {
    const row = [];
    for (let j = 0; j < labels.length; j++) {
      row.push([labels[i], labels[j], matrix[i][j]]);
    }
    customdata.push(row);
  }

  const data = [{
    z: matrix.map(row => Array.from(row)),
    x: shortLabels,
    y: shortLabels,
    type: 'heatmap',
    colorscale: [
      [0, '#1a1a2e'],
      [0.15, '#16213e'],
      [0.3, '#e2d810'],
      [0.5, '#e89005'],
      [0.7, '#e84545'],
      [1.0, '#ff0000']
    ],
    customdata,
    hoverinfo: 'none',
    showscale: true,
    colorbar: {
      title: 'Similarity',
      titlefont: { color: '#e0e0e0' },
      tickfont: { color: '#e0e0e0' }
    }
  }];

  const layout = {
    title: {
      text: 'Content Similarity Heatmap',
      font: { color: '#e0e0e0', size: 16 }
    },
    paper_bgcolor: '#1a1a2e',
    plot_bgcolor: '#1a1a2e',
    xaxis: {
      tickangle: -45,
      tickfont: { size: 9, color: '#a0a0a0' },
      showgrid: false
    },
    yaxis: {
      tickfont: { size: 9, color: '#a0a0a0' },
      showgrid: false,
      autorange: 'reversed'
    },
    margin: { l: 150, b: 150, t: 50, r: 30 },
    height: Math.max(400, labels.length * 18 + 200),
    width: Math.max(500, labels.length * 18 + 200)
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };

  Plotly.newPlot(container, data, layout, config);

  const tip = ensureTooltip();

  // Custom hover tooltip
  container.on('plotly_hover', (eventData) => {
    if (!eventData.points || !eventData.points[0]) return;
    const pt = eventData.points[0];
    const cd = pt.customdata;
    if (!cd) return;

    const score = typeof cd[2] === 'number' ? cd[2].toFixed(3) : '—';
    tip.innerHTML = `<strong>${cd[0]}</strong><br>vs<br><strong>${cd[1]}</strong><br>Score: ${score}`;
    tip.style.display = 'block';

    // Position above cursor
    const evt = eventData.event;
    const tipRect = tip.getBoundingClientRect();
    let left = evt.pageX - tipRect.width / 2;
    let top = evt.pageY - tipRect.height - 16;

    // Keep in viewport
    if (left < 4) left = 4;
    if (left + tipRect.width > window.innerWidth - 4) left = window.innerWidth - tipRect.width - 4;
    if (top < 4) top = evt.pageY + 16; // flip below if no room above

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  });

  container.on('plotly_unhover', () => {
    tip.style.display = 'none';
  });

  // Click handler
  container.on('plotly_click', (eventData) => {
    if (eventData.points && eventData.points[0]) {
      const pt = eventData.points[0];
      const i = pt.pointIndex[0];
      const j = pt.pointIndex[1];
      if (i !== j) {
        tip.style.display = 'none';
        onCellClick?.(i, j);
      }
    }
  });
}

function applyThreshold(container, matrix, labels, threshold, onCellClick) {
  const filtered = matrix.map(row =>
    Array.from(row).map(val => val >= threshold || val === 1.0 ? val : null)
  );

  const customdata = [];
  for (let i = 0; i < labels.length; i++) {
    const row = [];
    for (let j = 0; j < labels.length; j++) {
      row.push([labels[i], labels[j], matrix[i][j]]);
    }
    customdata.push(row);
  }

  Plotly.restyle(container, {
    z: [filtered],
    customdata: [customdata]
  });
}

export { renderHeatmap, applyThreshold };
