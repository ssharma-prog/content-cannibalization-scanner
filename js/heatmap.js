// Plotly.js heatmap rendering

function renderHeatmap(container, matrix, labels, onCellClick) {
  const shortLabels = labels.map(l =>
    l.length > 30 ? l.slice(0, 27) + '...' : l
  );

  // Build full-title text array for hover (row = y, col = x)
  const fullTitleX = [];
  const fullTitleY = [];
  for (let i = 0; i < labels.length; i++) {
    const rowX = [];
    const rowY = [];
    for (let j = 0; j < labels.length; j++) {
      rowY.push(labels[i]);
      rowX.push(labels[j]);
    }
    fullTitleX.push(rowX);
    fullTitleY.push(rowY);
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
    customdata: fullTitleX.map((rowX, i) =>
      rowX.map((xTitle, j) => [fullTitleY[i][j], xTitle])
    ),
    hovertemplate:
      '<b>%{customdata[0]}</b><br>vs<br><b>%{customdata[1]}</b><br>Score: %{z:.3f}<extra></extra>',
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

  // Click handler
  container.on('plotly_click', (eventData) => {
    if (eventData.points && eventData.points[0]) {
      const pt = eventData.points[0];
      const i = pt.pointIndex[0];
      const j = pt.pointIndex[1];
      if (i !== j) {
        onCellClick?.(i, j);
      }
    }
  });
}

function applyThreshold(container, matrix, labels, threshold, onCellClick) {
  const filtered = matrix.map(row =>
    Array.from(row).map(val => val >= threshold || val === 1.0 ? val : null)
  );

  const fullTitleX = [];
  const fullTitleY = [];
  for (let i = 0; i < labels.length; i++) {
    const rowX = [];
    const rowY = [];
    for (let j = 0; j < labels.length; j++) {
      rowY.push(labels[i]);
      rowX.push(labels[j]);
    }
    fullTitleX.push(rowX);
    fullTitleY.push(rowY);
  }

  Plotly.restyle(container, {
    z: [filtered],
    customdata: [fullTitleX.map((rowX, i) =>
      rowX.map((xTitle, j) => [fullTitleY[i][j], xTitle])
    )]
  });
}

export { renderHeatmap, applyThreshold };
