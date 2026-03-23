// Cluster analysis: identify problem posts and their connections

import { escapeHtml, shortenTitle } from './utils.js';

function buildClusters(pairs, threshold) {
  const flagged = pairs.filter(p => p.tfidfScore >= threshold);
  if (flagged.length === 0) return { posts: [], clusters: [], edges: flagged };

  // Build adjacency map
  const adj = new Map();
  for (const p of flagged) {
    if (!adj.has(p.urlA)) adj.set(p.urlA, { url: p.urlA, title: p.titleA, connections: [] });
    if (!adj.has(p.urlB)) adj.set(p.urlB, { url: p.urlB, title: p.titleB, connections: [] });
    adj.get(p.urlA).connections.push({ url: p.urlB, title: p.titleB, score: p.tfidfScore });
    adj.get(p.urlB).connections.push({ url: p.urlA, title: p.titleA, score: p.tfidfScore });
  }

  // Sort each post's connections by score desc
  for (const node of adj.values()) {
    node.connections.sort((a, b) => b.score - a.score);
  }

  // Find connected components (clusters) via BFS
  const visited = new Set();
  const clusters = [];
  for (const url of adj.keys()) {
    if (visited.has(url)) continue;
    const cluster = [];
    const queue = [url];
    visited.add(url);
    while (queue.length > 0) {
      const curr = queue.shift();
      cluster.push(adj.get(curr));
      for (const conn of adj.get(curr).connections) {
        if (!visited.has(conn.url)) {
          visited.add(conn.url);
          queue.push(conn.url);
        }
      }
    }
    clusters.push(cluster);
  }

  // Sort clusters by size desc, posts within by connection count desc
  clusters.sort((a, b) => b.length - a.length);
  for (const cluster of clusters) {
    cluster.sort((a, b) => b.connections.length - a.connections.length);
  }

  // All posts sorted by number of conflicts
  const allPosts = Array.from(adj.values()).sort((a, b) => b.connections.length - a.connections.length);

  return { posts: allPosts, clusters, edges: flagged };
}

function renderNetworkGraph(container, clusters, edges) {
  container.innerHTML = '';
  const allNodes = clusters.flat();
  if (allNodes.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary)">No clusters found above threshold.</p>';
    return;
  }

  const canvas = document.createElement('canvas');
  const width = Math.min(800, container.clientWidth || 800);
  const height = Math.max(400, allNodes.length * 20);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.maxWidth = width + 'px';
  canvas.style.height = 'auto';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Position nodes using simple force-directed layout
  const positions = layoutNodes(allNodes, edges, width, height);

  // Draw edges
  for (const edge of edges) {
    const posA = positions.get(edge.urlA);
    const posB = positions.get(edge.urlB);
    if (!posA || !posB) continue;

    const alpha = Math.min(1, edge.tfidfScore * 1.5);
    const lineWidth = 1 + edge.tfidfScore * 3;

    ctx.beginPath();
    ctx.moveTo(posA.x, posA.y);
    ctx.lineTo(posB.x, posB.y);
    if (edge.tfidfScore >= 0.7) {
      ctx.strokeStyle = `rgba(232, 69, 69, ${alpha})`;
    } else if (edge.tfidfScore >= 0.5) {
      ctx.strokeStyle = `rgba(232, 144, 5, ${alpha})`;
    } else {
      ctx.strokeStyle = `rgba(226, 216, 16, ${alpha * 0.6})`;
    }
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  // Draw nodes
  for (const node of allNodes) {
    const pos = positions.get(node.url);
    if (!pos) continue;

    const radius = 4 + node.connections.length * 2;
    const maxScore = node.connections.length > 0 ? node.connections[0].score : 0;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    if (maxScore >= 0.7) {
      ctx.fillStyle = '#e84545';
    } else if (maxScore >= 0.5) {
      ctx.fillStyle = '#e89005';
    } else {
      ctx.fillStyle = '#e2d810';
    }
    ctx.fill();
    ctx.strokeStyle = '#0f0f1a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    const label = shortenTitle(node.title, 25);
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = '#a0a0b0';
    ctx.textAlign = 'center';
    ctx.fillText(label, pos.x, pos.y + radius + 12);
  }

  // Hover tooltip
  let tip = document.querySelector('.graph-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'graph-tooltip';
    document.body.appendChild(tip);
  }

  const nodeData = allNodes.map(node => {
    const pos = positions.get(node.url);
    const radius = 4 + node.connections.length * 2;
    return { ...node, x: pos.x, y: pos.y, radius };
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let found = null;
    for (const node of nodeData) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy <= (node.radius + 4) * (node.radius + 4)) {
        found = node;
        break;
      }
    }

    if (found) {
      canvas.style.cursor = 'pointer';
      tip.innerHTML = `<strong>${escapeHtml(found.title)}</strong><br><span style="font-size:0.8rem;color:#a0a0b0">${escapeHtml(found.url)}</span><br>${found.connections.length} conflict${found.connections.length !== 1 ? 's' : ''}`;
      tip.style.display = 'block';
      let left = e.pageX - tip.offsetWidth / 2;
      let top = e.pageY - tip.offsetHeight - 14;
      if (left < 4) left = 4;
      if (top < 4) top = e.pageY + 14;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    } else {
      canvas.style.cursor = '';
      tip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tip.style.display = 'none';
    canvas.style.cursor = '';
  });
}

function layoutNodes(nodes, edges, width, height) {
  const positions = new Map();
  const padding = 60;
  const w = width - padding * 2;
  const h = height - padding * 2;

  // Initialize positions in a circle
  for (let i = 0; i < nodes.length; i++) {
    const angle = (2 * Math.PI * i) / nodes.length;
    positions.set(nodes[i].url, {
      x: padding + w / 2 + (w / 3) * Math.cos(angle),
      y: padding + h / 2 + (h / 3) * Math.sin(angle),
      vx: 0,
      vy: 0
    });
  }

  // Build edge lookup
  const edgeSet = new Map();
  for (const e of edges) {
    edgeSet.set(`${e.urlA}|${e.urlB}`, e.tfidfScore);
    edgeSet.set(`${e.urlB}|${e.urlA}`, e.tfidfScore);
  }

  // Simple force simulation (50 iterations)
  for (let iter = 0; iter < 50; iter++) {
    const temp = 1 - iter / 50;

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const posA = positions.get(nodes[i].url);
        const posB = positions.get(nodes[j].url);
        let dx = posB.x - posA.x;
        let dy = posB.y - posA.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = 500 / (dist * dist);
        dx = (dx / dist) * force * temp;
        dy = (dy / dist) * force * temp;
        posA.x -= dx;
        posA.y -= dy;
        posB.x += dx;
        posB.y += dy;
      }
    }

    // Attraction along edges
    for (const e of edges) {
      const posA = positions.get(e.urlA);
      const posB = positions.get(e.urlB);
      if (!posA || !posB) continue;
      let dx = posB.x - posA.x;
      let dy = posB.y - posA.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = (dist - 80) * 0.01 * e.tfidfScore * temp;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      posA.x += dx;
      posA.y += dy;
      posB.x -= dx;
      posB.y -= dy;
    }

    // Keep in bounds
    for (const pos of positions.values()) {
      pos.x = Math.max(padding, Math.min(width - padding, pos.x));
      pos.y = Math.max(padding, Math.min(height - padding, pos.y));
    }
  }

  return positions;
}

function renderPostBreakdown(container, posts) {
  if (posts.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary)">No problem posts found.</p>';
    return;
  }

  container.innerHTML = `
    <div class="post-breakdown">
      ${posts.map(post => `
        <div class="problem-post">
          <div class="problem-post-header">
            <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener">${escapeHtml(shortenTitle(post.title, 80))}</a>
            <span class="conflict-count">${post.connections.length} conflict${post.connections.length !== 1 ? 's' : ''}</span>
          </div>
          <ul class="conflict-list">
            ${post.connections.map(c => `
              <li>
                <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(shortenTitle(c.title, 60))}</a>
                <span class="score ${c.score >= 0.7 ? 'score-danger' : c.score >= 0.5 ? 'score-warning' : ''}">${c.score.toFixed(3)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  `;
}

export { buildClusters, renderNetworkGraph, renderPostBreakdown };
