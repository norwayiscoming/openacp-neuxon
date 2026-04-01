export function generateDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NEUXON — AI Journey Graph</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background: #0a0e14;
    color: #e0e0e0;
    font-family: 'Inter', 'SF Pro', -apple-system, system-ui, sans-serif;
    overflow: hidden;
    height: 100vh;
    user-select: none;
  }

  /* ── LAYOUT ── */
  .layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    grid-template-rows: 48px 1fr var(--panel-height, 220px) 36px;
    height: 100vh;
  }

  /* ── EMPTY STATE ── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: #8b949e;
    font-size: 16px;
    text-align: center;
  }
  .empty-state h1 {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 24px;
    color: #00ff41;
    text-shadow: 0 0 12px #00ff4150;
    letter-spacing: 4px;
    margin-bottom: 24px;
  }
  .empty-state p { max-width: 400px; line-height: 1.7; }

  /* ── TOP BAR ── */
  .topbar {
    grid-column: 1 / -1;
    grid-row: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    background: #0d1117;
    border-bottom: 1px solid #1a2030;
  }
  .logo {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 4px;
    color: #00ff41;
    text-shadow: 0 0 12px #00ff4150;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 20px;
    font-size: 12px;
    color: #8b949e;
    font-family: 'JetBrains Mono', monospace;
  }
  .live-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #00ff41;
    font-weight: 600;
  }
  .live-badge::before {
    content: '';
    width: 8px; height: 8px;
    background: #00ff41;
    border-radius: 50%;
    box-shadow: 0 0 8px #00ff41;
    animation: pulse 2s infinite;
  }
  .live-badge.disconnected { color: #ff4444; }
  .live-badge.disconnected::before { background: #ff4444; box-shadow: 0 0 8px #ff4444; }
  @keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 8px #00ff41} 50%{opacity:.5;box-shadow:0 0 4px #00ff41} }

  /* ── LEFT PANEL: Steps ── */
  .steps-panel {
    grid-column: 1;
    grid-row: 2;
    background: #0d1117;
    border-right: 1px solid #1a2030;
    padding: 20px 16px;
    overflow-y: auto;
  }
  .steps-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #8b949e;
    text-transform: uppercase;
    margin-bottom: 16px;
  }
  .step {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 4px;
    padding: 6px 8px;
    border-radius: 6px;
    transition: background .2s;
    cursor: pointer;
  }
  .step:hover { background: #161b22; }
  .step-marker {
    width: 20px; height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .step-content { flex: 1; }
  .step-name { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
  .step-desc { font-size: 12px; color: #8b949e; }

  .step-done .step-marker { background: #00ff41; color: #0a0e14; }
  .step-done .step-name { color: #00ff41; }

  .step-result .step-marker { background: #818cf8; color: #fff; box-shadow: 0 0 12px #818cf860; }
  .step-result .step-name { color: #a5b4fc; font-weight: 700; }
  .step-result { background: #818cf810; border-radius: 6px; }

  .step-active .step-marker {
    background: #facc15; color: #0a0e14;
    box-shadow: 0 0 12px #facc1560;
    animation: marker-pulse 2s infinite;
  }
  @keyframes marker-pulse { 0%,100%{box-shadow:0 0 8px #facc1560} 50%{box-shadow:0 0 20px #facc1580} }
  .step-active .step-name { color: #facc15; font-weight: 700; }
  .step-active { background: #facc1510; border-radius: 6px; }

  .step-pending .step-marker { background: transparent; border: 2px solid #4a5a70; color: #5a6a7e; }
  .step-pending .step-name { color: #6a7a8e; }
  .step-pending .step-desc { color: #4a5a6e; }

  .step-detour { margin-left: 20px; }
  .step-detour .step-marker { background: #ff4444; color: #fff; font-size: 9px; box-shadow: 0 0 8px #ff444440; }
  .step-detour .step-name { color: #ff8888; font-size: 12px; }

  .step-connector {
    width: 2px; height: 12px;
    background: #1a2030;
    margin-left: 17px;
    margin-bottom: 4px;
  }
  .step-connector-done { background: #00ff4140; }

  .progress-section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #1a2030;
  }
  .progress-label {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #8b949e;
    margin-bottom: 6px;
    font-weight: 600;
    letter-spacing: 1px;
  }
  .progress-track {
    height: 6px;
    background: #1a2030;
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00ff41, #00ff4180);
    border-radius: 3px;
    box-shadow: 0 0 10px #00ff4140;
    transition: width 0.5s ease;
  }

  /* ── CENTER: Graph Canvas ── */
  .graph-area {
    grid-column: 2;
    grid-row: 2;
    position: relative;
    background: #0a0e14;
    overflow: hidden;
  }
  .graph-area canvas { display: block; cursor: grab; }
  .zoom-controls {
    position: absolute;
    bottom: 12px;
    right: 12px;
    display: flex;
    gap: 4px;
    z-index: 20;
  }
  .zoom-btn {
    width: 32px; height: 32px;
    background: #161b22;
    border: 1px solid #2a3040;
    border-radius: 6px;
    color: #8b949e;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background .2s;
  }
  .zoom-btn:hover { background: #1f2937; color: #e0e0e0; }

  /* ── BOTTOM PANEL: Detail ── */
  .detail-panel {
    grid-column: 1 / -1;
    grid-row: 3;
    background: #0d1117;
    border-top: 1px solid #1a2030;
    padding: 12px 24px;
    overflow-y: auto;
    position: relative;
    min-height: 120px;
    max-height: 400px;
  }

  /* Resize handle */
  .resize-handle {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 6px;
    cursor: row-resize;
    z-index: 10;
    transition: background .2s;
  }
  .resize-handle:hover, .resize-handle.dragging {
    background: #facc1540;
  }
  .dp-row {
    display: flex;
    gap: 24px;
    align-items: flex-start;
  }
  .dp-col { flex: 1; min-width: 0; }
  .dp-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid #1a2030;
  }
  .dp-icon {
    width: 32px; height: 32px;
    background: #facc15;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #0a0e14;
    font-weight: 700;
    box-shadow: 0 0 16px #facc1530;
  }
  .dp-title { font-size: 18px; font-weight: 700; color: #facc15; }
  .dp-subtitle { font-size: 13px; color: #8b949e; }

  .dp-section { margin-bottom: 16px; }
  .dp-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: #6b7280;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .dp-value { font-size: 14px; color: #e0e0e0; line-height: 1.7; }
  .dp-file {
    display: inline-block;
    background: #1a2030;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #facc15;
    margin: 2px 0;
  }
  .dp-change {
    font-size: 11px;
    color: #00ff41;
    font-family: 'JetBrains Mono', monospace;
  }
  .dp-dim { color: #6b7280; }

  .dp-decision {
    background: #161b22;
    border-left: 3px solid #818cf8;
    padding: 8px 12px;
    border-radius: 0 6px 6px 0;
    font-size: 12px;
    color: #c4b5fd;
    line-height: 1.6;
  }

  .dp-layman {
    background: #111820;
    border: 1px solid #1a2535;
    border-radius: 8px;
    padding: 14px 16px;
    font-size: 14px;
    color: #d0d8e0;
    line-height: 1.8;
    max-height: 160px;
    overflow-y: auto;
    white-space: pre-wrap;
  }
  .dp-layman-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #facc15;
    margin-bottom: 6px;
    text-transform: uppercase;
  }
  .dp-cause {
    background: #0d1520;
    border-left: 3px solid #00ff41;
    padding: 8px 12px;
    border-radius: 0 6px 6px 0;
    font-size: 12px;
    color: #a0b0c0;
    line-height: 1.7;
    margin-top: 8px;
  }
  .dp-cause b { color: #00ff41; font-weight: 600; }
  .dp-expect {
    background: #0d1520;
    border-left: 3px solid #818cf8;
    padding: 8px 12px;
    border-radius: 0 6px 6px 0;
    font-size: 12px;
    color: #a0b0c0;
    line-height: 1.7;
    margin-top: 8px;
  }
  .dp-expect b { color: #818cf8; font-weight: 600; }

  .dp-activity {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid #1a2030;
  }
  .dp-log-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #6b7280;
    line-height: 2;
    display: flex;
    gap: 6px;
  }
  .dp-log-time { color: #4a5568; }
  .dp-log-action { color: #00ff41; }
  .dp-log-new { color: #e0e0e0; }
  .dp-log-new .dp-log-action { color: #facc15; }

  .typing-indicator {
    display: inline-flex;
    gap: 3px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .typing-indicator span {
    width: 4px; height: 4px;
    background: #facc15;
    border-radius: 50%;
    animation: typing 1.2s infinite;
  }
  .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
  .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing { 0%,100%{opacity:.2;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }

  /* ── BOTTOM BAR ── */
  .bottombar {
    grid-column: 1 / -1;
    grid-row: 4;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    background: #0d1117;
    border-top: 1px solid #1a2030;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #4a5568;
  }

  /* ── TOOLTIP ── */
  #tooltip {
    position: fixed;
    z-index: 300;
    background: #161b22;
    border: 1px solid #2a3040;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 12px;
    pointer-events: none;
    display: none;
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
    max-width: 240px;
  }
  #tooltip .tt-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
  #tooltip .tt-desc { color: #8b949e; font-size: 11px; line-height: 1.6; white-space: pre-line; }
  #tooltip .tt-status { margin-top: 6px; font-size: 11px; font-weight: 600; }

  .dp-empty {
    text-align: center;
    color: #4a5568;
    padding: 40px 20px;
    font-size: 13px;
    line-height: 1.8;
  }
  .dp-empty-icon { font-size: 32px; margin-bottom: 12px; }
</style>
</head>
<body>

<div id="app"></div>
<div id="tooltip">
  <div class="tt-name"></div>
  <div class="tt-desc"></div>
  <div class="tt-status"></div>
</div>

<script>
// ── BOOTSTRAP ──
const params = new URLSearchParams(location.search);
const sessionId = params.get('sessionId');

// No sessionId = show all sessions as knowledge graph
boot(sessionId);

function boot(sessionId) {
  const isAllMode = !sessionId;
  const headerLabel = isAllMode ? 'Knowledge Graph' : ('Session #' + sessionId.slice(0, 4));
  // Render the layout shell
  document.getElementById('app').innerHTML = \`
  <div class="layout">
    <div class="topbar">
      <div class="logo">NEUXON</div>
      <div class="topbar-right">
        <span class="live-badge" id="live-badge">LIVE</span>
        <span>\${headerLabel}</span>
        <span id="session-count"></span>
      </div>
    </div>
    <div class="steps-panel" id="steps-panel">
      <div class="steps-title">Journey</div>
      <div id="steps-list"></div>
      <div class="progress-section">
        <div class="progress-label">
          <span>PROGRESS</span>
          <span id="progress-pct" style="color:#00ff41">0%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" id="progress-fill" style="width:0%"></div>
        </div>
      </div>
    </div>
    <div class="graph-area">
      <canvas id="graph"></canvas>
      <div class="zoom-controls">
        <button class="zoom-btn" id="zoom-in" title="Zoom in">+</button>
        <button class="zoom-btn" id="zoom-out" title="Zoom out">-</button>
        <button class="zoom-btn" id="zoom-reset" title="Reset zoom">R</button>
      </div>
    </div>
    <div class="detail-panel" id="detail-panel">
      <div class="resize-handle" id="resize-handle"></div>
      <div id="panel-content">
        <div class="dp-empty">
          <div class="dp-empty-icon">&#128269;</div>
          Click a node to see details
        </div>
      </div>
    </div>
    <div class="bottombar">
      <span>NEUXON v0.1.0 — OpenACP Plugin</span>
      <span id="stats-bar">loading...</span>
      <span>hover node for details</span>
    </div>
  </div>\`;

  // ── STATE ──
  let NODES = [];
  let EDGES = [];
  let particles = [];
  let selectedNodeId = null;
  let hoveredNode = null;
  let time = 0;
  let sseConnected = false;

  const PALETTE = {
    done:     { fill:'#00ff41', bg:'#0a2a12', text:'#00ff41', glow:'#00ff4130' },
    active:   { fill:'#facc15', bg:'#2a2206', text:'#facc15', glow:'#facc1530' },
    pending:  { fill:'#4a5a70', bg:'#141a24', text:'#6a7a8e', glow:'#4a5a7010' },
    detour:   { fill:'#ff4444', bg:'#2a0a0a', text:'#ff8888', glow:'#ff444425' },
    resolved: { fill:'#22d3ee', bg:'#0a1a20', text:'#22d3ee', glow:'#22d3ee20' },
    result:   { fill:'#818cf8', bg:'#1a1040', text:'#a5b4fc', glow:'#818cf840' },
    cache:    { fill:'#22d3ee', bg:'#0a1a20', text:'#22d3ee', glow:'#22d3ee30' },
  };

  // ── CANVAS SETUP ──
  const canvas = document.getElementById('graph');
  const ctx = canvas.getContext('2d');
  const area = canvas.parentElement;
  let W, H, scale;
  let zoom = 1;
  let panX = 0, panY = 0;
  let isPanning = false, panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0;

  function resize() {
    const rect = area.getBoundingClientRect();
    scale = devicePixelRatio;
    W = rect.width;
    H = rect.height;
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // ── POSITION NODES (Force-directed) ──
  const SIM_W = 1200;
  const SIM_H = 800;

  function positionNodes() {
    if (NODES.length === 0) return;

    // Set initial positions if not yet placed
    const children = {};
    const hasParent = new Set();
    EDGES.forEach(e => {
      if (!children[e.from]) children[e.from] = [];
      children[e.from].push(e.to);
      hasParent.add(e.to);
    });

    // Size nodes
    NODES.forEach(n => {
      const isResult = n.label === 'RESULT';
      const isInit = n.label === 'INIT';
      const isPhase = (children[n.id] || []).length > 1;
      n.r = isResult ? 32 : isInit ? 34 : isPhase ? 30 : (n.status === 'active' ? 28 : 22);
    });

    // Place unpositioned nodes
    NODES.forEach((n, i) => {
      if (n.x !== undefined && n.y !== undefined) return;
      if (n.label === 'INIT' || n.id === '__init__') {
        n.x = 120; n.y = SIM_H / 2;
      } else {
        // Place near parent if possible
        const parentEdge = EDGES.find(e => e.to === n.id);
        const parent = parentEdge ? NODES.find(nd => nd.id === parentEdge.from) : null;
        if (parent && parent.x !== undefined) {
          const angle = (Math.random() - 0.5) * Math.PI * 0.8;
          n.x = parent.x + 180 + Math.random() * 40;
          n.y = parent.y + Math.sin(angle) * 120;
        } else {
          n.x = 200 + i * 100;
          n.y = SIM_H / 2 + (Math.random() - 0.5) * 300;
        }
      }
    });

    // Run force simulation (few iterations for smooth incremental layout)
    for (let iter = 0; iter < 60; iter++) {
      // Repulsion between all nodes
      for (let i = 0; i < NODES.length; i++) {
        for (let j = i + 1; j < NODES.length; j++) {
          const a = NODES[i], b = NODES[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = (a.r + b.r) * 3.5;
          if (dist < minDist) {
            const force = (minDist - dist) / dist * 0.3;
            const fx = dx * force, fy = dy * force;
            if (a.label !== 'INIT' && a.id !== '__init__') { a.x -= fx; a.y -= fy; }
            if (b.label !== 'INIT' && b.id !== '__init__') { b.x += fx; b.y += fy; }
          }
        }
      }

      // Attraction along edges (spring)
      EDGES.forEach(e => {
        const from = NODES.find(n => n.id === e.from);
        const to = NODES.find(n => n.id === e.to);
        if (!from || !to || from.x === undefined || to.x === undefined) return;
        let dx = to.x - from.x, dy = to.y - from.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const idealDist = 200;
        const force = (dist - idealDist) / dist * 0.05;
        const fx = dx * force, fy = dy * force;
        if (from.label !== 'INIT' && from.id !== '__init__') { from.x += fx; from.y += fy; }
        if (to.label !== 'INIT' && to.id !== '__init__') { to.x -= fx * 0.3; to.y -= fy * 0.3; }
      });

      // Pull children to the right of parents (directional bias)
      EDGES.forEach(e => {
        const from = NODES.find(n => n.id === e.from);
        const to = NODES.find(n => n.id === e.to);
        if (!from || !to || from.x === undefined || to.x === undefined) return;
        if (to.x < from.x + 100) {
          if (to.label !== 'INIT' && to.id !== '__init__') {
            to.x += (from.x + 160 - to.x) * 0.1;
          }
        }
      });

      // Keep nodes in bounds
      NODES.forEach(n => {
        if (n.label === 'INIT' || n.id === '__init__') return;
        n.x = Math.max(60, Math.min(SIM_W - 60, n.x));
        n.y = Math.max(60, Math.min(SIM_H - 60, n.y));
      });
    }
  }

  function scaleX(x) { return (x * (W / SIM_W)) * zoom + panX; }
  function scaleY(y) { return (y * (H / SIM_H)) * zoom + panY; }
  function scaleR(r) { return r * Math.min(W / SIM_W, H / SIM_H) * zoom; }

  // ── PARTICLES ──
  function rebuildParticles() {
    particles = [];
    EDGES.forEach(e => {
      if (e.type === 'pending') return;
      const from = NODES.find(n => n.id === e.from);
      const to = NODES.find(n => n.id === e.to);
      if (!from || !to) return;
      const count = e.type === 'detour' ? 2 : 3;
      for (let i = 0; i < count; i++) {
        particles.push({
          from, to, edge: e,
          t: i / count,
          speed: 0.002 + Math.random() * 0.003,
        });
      }
    });
  }

  // ── DRAWING ──
  function getEdgeMidpoint(e) {
    const from = NODES.find(n => n.id === e.from);
    const to = NODES.find(n => n.id === e.to);
    if (!from || !to) return { x: 0, y: 0 };
    const x1 = scaleX(from.x), y1 = scaleY(from.y);
    const x2 = scaleX(to.x), y2 = scaleY(to.y);
    if (e.curve) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const nx = -dy/len, ny = dx/len;
      return { x: mx + nx * e.curve, y: my + ny * e.curve };
    }
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }

  function drawEdge(e) {
    const from = NODES.find(n => n.id === e.from);
    const to = NODES.find(n => n.id === e.to);
    if (!from || !to || from.x === undefined || to.x === undefined) return;
    const x1 = scaleX(from.x), y1 = scaleY(from.y);
    const x2 = scaleX(to.x), y2 = scaleY(to.y);

    const pal = e.type === 'detour' ? PALETTE.detour :
                e.type === 'resolved' ? PALETTE.resolved :
                e.type === 'pending' ? PALETTE.pending : PALETTE.done;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (e.curve) {
      const mid = getEdgeMidpoint(e);
      ctx.quadraticCurveTo(mid.x, mid.y, x2, y2);
    } else {
      ctx.lineTo(x2, y2);
    }
    ctx.strokeStyle = pal.fill;
    ctx.globalAlpha = e.type === 'pending' ? 0.35 : 0.45;
    ctx.lineWidth = e.type === 'pending' ? 2 : 2.5;
    if (e.type === 'pending') ctx.setLineDash([8, 6]);
    else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Arrow
    {
      let dx, dy;
      if (e.curve) {
        const mid = getEdgeMidpoint(e);
        dx = x2 - mid.x;
        dy = y2 - mid.y;
      } else {
        dx = x2 - x1;
        dy = y2 - y1;
      }
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const ux = dx/len, uy = dy/len;
      const toR = scaleR(to.r);
      const ax = x2 - ux * (toR + 4), ay = y2 - uy * (toR + 4);
      const aLen = 14, aWidth = 7;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - ux * aLen - uy * aWidth, ay - uy * aLen + ux * aWidth);
      ctx.lineTo(ax - ux * aLen + uy * aWidth, ay - uy * aLen - ux * aWidth);
      ctx.closePath();
      ctx.fillStyle = pal.fill;
      ctx.globalAlpha = e.type === 'pending' ? 0.4 : 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Label pill
    const mid = getEdgeMidpoint(e);
    const lbl = e.label || '';
    if (lbl) {
      const lx = mid.x, ly = mid.y - 12;
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const textW = ctx.measureText(lbl).width;
      {
        ctx.beginPath();
        const px = lx - textW/2 - 8, py = ly - 12, pw = textW + 16, ph = 20;
        ctx.roundRect(px, py, pw, ph, 4);
        ctx.fillStyle = '#0a0e14';
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.strokeStyle = pal.fill;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = pal.text;
      ctx.globalAlpha = e.type === 'pending' ? 0.5 : 0.9;
      ctx.fillText(lbl, lx, ly);
      ctx.globalAlpha = 1;
    }
  }

  function drawNode(n) {
    if (n.x === undefined) return;
    const x = scaleX(n.x), y = scaleY(n.y), r = scaleR(n.r);
    const isResult = n.label === 'RESULT';
    const isCache = n.label === 'CACHED';
    const pal = isCache ? PALETTE.cache : isResult ? PALETTE.result : (PALETTE[n.status] || PALETTE.pending);
    const isActive = n.status === 'active';
    const isHovered = hoveredNode === n;

    // Glow
    if (n.status !== 'pending') {
      const glowR = isActive ? r * 2.5 + Math.sin(time * 2) * 5 : (isHovered ? r * 2 : r * 1.6);
      const grad = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowR);
      grad.addColorStop(0, pal.glow);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Background circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = pal.bg;
    ctx.fill();
    ctx.strokeStyle = pal.fill;
    ctx.lineWidth = isActive ? 3 : 2;
    if (n.status === 'pending') ctx.setLineDash([5, 5]);
    else ctx.setLineDash([]);
    ctx.globalAlpha = n.status === 'pending' ? 0.5 : (isActive ? 0.7 + Math.sin(time * 3) * 0.3 : 0.9);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Active: spinning rings + "AI IS HERE"
    if (isActive) {
      ctx.beginPath();
      ctx.arc(x, y, r + 18, 0, Math.PI * 2);
      ctx.strokeStyle = pal.fill;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.12 + Math.sin(time * 1.5) * 0.06;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(x, y, r + 12, time * 0.5, time * 0.5 + Math.PI * 1.4);
      ctx.strokeStyle = pal.fill;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(x, y, r + 6, -time * 0.4, -time * 0.4 + Math.PI * 1);
      ctx.strokeStyle = pal.fill;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const labelY = y - r - 26;
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const sid = n._sessionId ? (' #' + n._sessionId.slice(0, 4)) : '';
      const hereText = '\\u26A1 AI' + sid + ' HERE';
      const tw = ctx.measureText(hereText).width;
      ctx.beginPath();
      ctx.roundRect(x - tw/2 - 10, labelY - 10, tw + 20, 22, 11);
      ctx.fillStyle = pal.fill;
      ctx.globalAlpha = 0.85 + Math.sin(time * 2) * 0.15;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0e14';
      ctx.fillText(hereText, x, labelY + 4);
    }

    // Label
    ctx.font = 'bold ' + Math.max(13, r * 0.5) + 'px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.text;
    ctx.globalAlpha = n.status === 'pending' ? 0.55 : 1;
    const rawLabel = (n.label || n.id || '').toUpperCase();
    const maxChars = Math.max(6, Math.floor(r / 4));
    const label = rawLabel.length > maxChars ? rawLabel.slice(0, maxChars - 1) + '\\u2026' : rawLabel;
    ctx.fillText(label, x, y - (n.status === 'done' || isActive ? 4 : 0));

    // Status text
    if (n.status !== 'pending') {
      const stText = isActive ? 'working...' : n.status === 'done' ? 'done \\u2713' : n.status === 'detour' ? 'patched' : '';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.globalAlpha = 0.6;
      ctx.fillText(stText, x, y + 10);
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    particles.forEach(p => {
      if (!p.from || !p.to || p.from.x === undefined || p.to.x === undefined) return;
      p.t = (p.t + p.speed) % 1;
      const x1 = scaleX(p.from.x), y1 = scaleY(p.from.y);
      const x2 = scaleX(p.to.x), y2 = scaleY(p.to.y);
      let x, y;
      if (p.edge.curve) {
        const mid = getEdgeMidpoint(p.edge);
        const t = p.t, mt = 1 - t;
        x = mt*mt*x1 + 2*mt*t*mid.x + t*t*x2;
        y = mt*mt*y1 + 2*mt*t*mid.y + t*t*y2;
      } else {
        x = x1 + (x2 - x1) * p.t;
        y = y1 + (y2 - y1) * p.t;
      }
      const fade = Math.sin(p.t * Math.PI);
      const pal = p.edge.type === 'detour' ? PALETTE.detour :
                  p.edge.type === 'resolved' ? PALETTE.resolved : PALETTE.done;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, 8);
      grad.addColorStop(0, pal.fill);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.globalAlpha = fade * 0.2;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = pal.fill;
      ctx.globalAlpha = fade * 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function draw() {
    time += 0.02;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.strokeStyle = '#1a2030';
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    for (let gx = 0; gx < W; gx += 60) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += 60) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    EDGES.forEach(drawEdge);
    drawParticles();
    NODES.forEach(drawNode);

    requestAnimationFrame(draw);
  }
  draw();

  // ── STEP LIST RENDERING ──
  function renderSteps() {
    const sorted = [...NODES].sort((a, b) => (a.order || 0) - (b.order || 0));
    const list = document.getElementById('steps-list');
    if (!list) return;

    let html = '';
    let mainIndex = 0;
    const doneCount = sorted.filter(n => n.status === 'done').length;
    const total = sorted.filter(n => n.status !== 'detour').length;
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    sorted.forEach((n, i) => {
      const isDetour = n.status === 'detour';
      const isResult = n.label === 'RESULT';
      if (!isDetour) mainIndex++;
      const statusClass = isResult ? 'step-result' : ('step-' + n.status);
      const marker = isResult ? '\\u2605' :
                     n.status === 'done' ? '\\u2713' :
                     n.status === 'active' ? mainIndex :
                     n.status === 'detour' ? '!' : mainIndex;

      // Connector before this step (except first)
      if (i > 0) {
        const prevDone = sorted[i-1].status === 'done';
        html += '<div class="step-connector ' + (prevDone ? 'step-connector-done' : '') + '"></div>';
      }

      const desc = n.layman ? (n.layman.length > 40 ? n.layman.slice(0, 40).replace(/<[^>]*>/g,'') + '...' : n.layman.replace(/<[^>]*>/g,'')) :
                   n.status === 'active' ? 'Working...' :
                   n.status === 'done' ? 'Completed' :
                   n.status === 'detour' ? 'Detour' : 'Waiting';

      html += '<div class="step ' + statusClass + (isDetour ? ' step-detour' : '') + '" data-node-id="' + n.id + '">'
            + '<div class="step-marker">' + marker + '</div>'
            + '<div class="step-content">'
            + '<div class="step-name">' + (n.label || n.id) + '</div>'
            + '<div class="step-desc">' + desc + '</div>'
            + '</div></div>';
    });

    list.innerHTML = html;

    // Update progress
    const pctEl = document.getElementById('progress-pct');
    const fillEl = document.getElementById('progress-fill');
    if (pctEl) pctEl.textContent = pct + '%';
    if (fillEl) fillEl.style.width = pct + '%';

    // Stats bar
    const statsEl = document.getElementById('stats-bar');
    const detourCount = NODES.filter(n => n.status === 'detour').length;
    if (statsEl) statsEl.textContent = NODES.length + ' nodes \\u00B7 ' + EDGES.length + ' edges \\u00B7 ' + detourCount + ' detour' + (detourCount !== 1 ? 's' : '');

    // Click handlers on steps
    list.querySelectorAll('.step').forEach(el => {
      el.addEventListener('click', () => {
        const nodeId = el.getAttribute('data-node-id');
        if (nodeId) {
          selectedNodeId = nodeId;
          renderPanel(nodeId);
          document.getElementById('detail-panel').scrollTop = 0;
        }
      });
    });

    // Auto-scroll to active step
    const activeEl = list.querySelector('.step-active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── DETAIL PANEL ──
  function renderPanel(nodeId) {
    const n = NODES.find(nd => nd.id === nodeId);
    if (!n) return;
    const isResult = n.label === 'RESULT';
    const pal = isResult ? PALETTE.result : (PALETTE[n.status] || PALETTE.pending);
    const panelEl = document.getElementById('panel-content');
    if (!panelEl) return;

    const sorted = [...NODES].filter(nd => nd.status !== 'detour').sort((a, b) => (a.order||0) - (b.order||0));
    const stepIdx = sorted.findIndex(nd => nd.id === nodeId);
    const stepText = n.status === 'detour' ? 'detour' : ((stepIdx + 1) + ' of ' + sorted.length);
    const statusText = n.status === 'active' ? 'in progress' :
                       n.status === 'done' ? 'completed' :
                       n.status === 'detour' ? 'patched' : 'waiting';

    const icon = n.status === 'active' ? '\\u26A1' :
                 n.status === 'done' ? '\\u2713' :
                 n.status === 'detour' ? '!' : '\\u2022';

    let html = '<div class="dp-header">'
      + '<div class="dp-icon" style="background:' + pal.fill + ';' + (n.status==='pending'?'opacity:0.3;':'') + '">' + icon + '</div>'
      + '<div>'
      + '<div class="dp-title" style="color:' + pal.text + '">' + (n.label || n.id) + '</div>'
      + '<div class="dp-subtitle">Step ' + stepText + ' \\u2014 ' + statusText + '</div>'
      + '</div></div>';

    html += '<div class="dp-row">';

    // Column 1: Description
    html += '<div class="dp-col">';
    if (n.layman) {
      html += '<div class="dp-section"><div class="dp-layman">'
        + '<div class="dp-layman-title" style="color:' + pal.fill + '">In plain words</div>'
        + n.layman
        + '</div></div>';
    }
    if (n.cause || n.expect) {
      if (n.cause) html += '<div class="dp-cause"><b>Because:</b> ' + n.cause + '</div>';
      if (n.expect) html += '<div class="dp-expect" style="margin-top:6px"><b>Expected:</b> ' + n.expect + '</div>';
    }
    if (n.techDetails) {
      html += '<div class="dp-section" style="margin-top:8px">'
        + '<div class="dp-label">Technical details</div>'
        + '<div class="dp-value" style="font-size:12px">' + n.techDetails + '</div>'
        + '</div>';
    }
    html += '</div>';

    // Column 2: Activity log
    html += '<div class="dp-col">';
    if (n.activity && n.activity.length > 0) {
      html += '<div class="dp-label">Live Activity <span class="typing-indicator"><span></span><span></span><span></span></span></div>';
      n.activity.forEach(a => {
        const isNew = a.isNew || false;
        const isBug = a.isBug || false;
        html += '<div class="dp-log-line ' + (isNew ? 'dp-log-new' : '') + '">'
          + '<span class="dp-log-time">' + (a.time || '') + '</span>'
          + '<span ' + (isBug ? 'style="color:#ff8888"' : 'class="dp-log-action"') + '>' + (a.action || '') + '</span> '
          + (a.text || '')
          + (a.dim ? ' <span class="dp-dim">' + a.dim + '</span>' : '')
          + '</div>';
      });
    } else {
      html += '<div class="dp-label">Activity</div><div style="color:#4a5568;font-size:12px">No activity yet</div>';
    }
    html += '</div>';

    html += '</div>'; // close dp-row

    panelEl.innerHTML = html;
  }

  // ── INTERACTION: Hover / Click on Canvas ──
  canvas.addEventListener('mousemove', function(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const tt = document.getElementById('tooltip');
    hoveredNode = null;

    for (const n of NODES) {
      if (n.x === undefined) continue;
      const nx = scaleX(n.x), ny = scaleY(n.y), nr = scaleR(n.r);
      const dx = mx - nx, dy = my - ny;
      if (dx*dx + dy*dy < nr*nr) {
        hoveredNode = n;
        const isResultNode = n.label === 'RESULT';
        const pal = isResultNode ? PALETTE.result : (PALETTE[n.status] || PALETTE.pending);
        tt.querySelector('.tt-name').textContent = (n.label || n.id);
        tt.querySelector('.tt-name').style.color = pal.text;
        tt.querySelector('.tt-desc').textContent = n.layman ? n.layman.replace(/<[^>]*>/g, '').slice(0, 120) : (n.desc || '');
        tt.querySelector('.tt-status').textContent = '\\u25CF ' + (n.status || '').toUpperCase();
        tt.querySelector('.tt-status').style.color = pal.fill;
        tt.style.display = 'block';
        tt.style.left = (e.clientX + 15) + 'px';
        tt.style.top = (e.clientY + 15) + 'px';
        canvas.style.cursor = 'pointer';
        return;
      }
    }
    tt.style.display = 'none';
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('click', function(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const n of NODES) {
      if (n.x === undefined) continue;
      const nx = scaleX(n.x), ny = scaleY(n.y), nr = scaleR(n.r);
      const dx = mx - nx, dy = my - ny;
      if (dx*dx + dy*dy < nr*nr) {
        selectedNodeId = n.id;
        renderPanel(n.id);
        document.getElementById('detail-panel').scrollTop = 0;
        return;
      }
    }
  });

  canvas.addEventListener('mouseleave', function() {
    document.getElementById('tooltip').style.display = 'none';
    hoveredNode = null;
  });

  // ── ZOOM & PAN ──
  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldZoom = zoom;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(0.3, Math.min(5, zoom * delta));
    // Zoom toward cursor
    panX = mx - (mx - panX) * (zoom / oldZoom);
    panY = my - (my - panY) * (zoom / oldZoom);
  }, { passive: false });

  canvas.addEventListener('mousedown', function(e) {
    if (e.button === 0) {
      // Check if clicking on a node — if so, don't pan
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let onNode = false;
      for (const n of NODES) {
        if (n.x === undefined) continue;
        const nx = scaleX(n.x), ny = scaleY(n.y), nr = scaleR(n.r);
        const dx = mx - nx, dy = my - ny;
        if (dx*dx + dy*dy < nr*nr) { onNode = true; break; }
      }
      if (!onNode) {
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartPanX = panX;
        panStartPanY = panY;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      }
    }
  });

  window.addEventListener('mousemove', function(e) {
    if (!isPanning) return;
    panX = panStartPanX + (e.clientX - panStartX);
    panY = panStartPanY + (e.clientY - panStartY);
  });

  window.addEventListener('mouseup', function() {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = 'grab';
    }
  });

  document.getElementById('zoom-in').addEventListener('click', function() {
    const cx = W / 2, cy = H / 2;
    const oldZoom = zoom;
    zoom = Math.min(5, zoom * 1.3);
    panX = cx - (cx - panX) * (zoom / oldZoom);
    panY = cy - (cy - panY) * (zoom / oldZoom);
  });

  document.getElementById('zoom-out').addEventListener('click', function() {
    const cx = W / 2, cy = H / 2;
    const oldZoom = zoom;
    zoom = Math.max(0.3, zoom * 0.7);
    panX = cx - (cx - panX) * (zoom / oldZoom);
    panY = cy - (cy - panY) * (zoom / oldZoom);
  });

  document.getElementById('zoom-reset').addEventListener('click', function() {
    zoom = 1;
    panX = 0;
    panY = 0;
  });

  // ── RESIZE HANDLE ──
  const handle = document.getElementById('resize-handle');
  const layout = document.querySelector('.layout');
  let dragging = false;

  handle.addEventListener('mousedown', function(e) {
    dragging = true;
    handle.classList.add('dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    const newHeight = window.innerHeight - e.clientY;
    const clamped = Math.max(120, Math.min(400, newHeight));
    layout.style.setProperty('--panel-height', clamped + 'px');
    resize();
  });

  window.addEventListener('mouseup', function() {
    dragging = false;
    handle.classList.remove('dragging');
  });

  // ── LOAD DATA ──
  function applyGraphData(graph) {
    if (graph.nodes) {
      NODES = graph.nodes.map(n => ({
        ...n,
        label: n.label || n.id,
        status: n.status || 'pending',
        order: n.order || 0,
      }));
    }
    if (graph.edges) {
      EDGES = graph.edges.map(e => ({
        ...e,
        from: e.from || e.source,
        to: e.to || e.target,
      }));
    }
    positionNodes();
    rebuildParticles();
    renderSteps();
    // Auto-select first active node or first node
    if (!selectedNodeId) {
      const active = NODES.find(n => n.status === 'active');
      if (active) {
        selectedNodeId = active.id;
        renderPanel(active.id);
      } else if (NODES.length > 0) {
        selectedNodeId = NODES[0].id;
        renderPanel(NODES[0].id);
      }
    }
  }

  const graphUrl = isAllMode ? '/api/graph' : ('/api/graph/' + sessionId);
  fetch(graphUrl)
    .then(r => r.json())
    .then(data => {
      applyGraphData(isAllMode ? data : data);
    })
    .catch(() => {
      // No graph yet, wait for SSE
    });

  fetch('/api/sessions').then(r => r.json()).then(data => {
    const el = document.getElementById('session-count');
    if (el) el.textContent = (data.sessions?.length ?? 0) + ' sessions';
  }).catch(() => {});

  // ── SSE ──
  function connectSSE() {
    const eventsUrl = isAllMode ? '/api/events' : ('/api/events?sessionId=' + sessionId);
    const es = new EventSource(eventsUrl);
    es.onopen = function() {
      sseConnected = true;
      const badge = document.getElementById('live-badge');
      if (badge) { badge.textContent = 'LIVE'; badge.classList.remove('disconnected'); }
    };
    es.onerror = function() {
      sseConnected = false;
      const badge = document.getElementById('live-badge');
      if (badge) { badge.textContent = 'RECONNECTING'; badge.classList.add('disconnected'); }
    };

    es.addEventListener('graph:full', function(e) {
      try {
        const data = JSON.parse(e.data);
        if (isAllMode) {
          // In all-mode, graph:full is per-session — merge into existing graph
          const g = data.graph || data;
          if (g.nodes) {
            let sessionInitId = null;
            g.nodes.forEach(n => {
              if (n.label === 'INIT') { sessionInitId = n.id; return; }
              const existing = NODES.findIndex(nd => nd.id === n.id);
              if (existing >= 0) NODES[existing] = { ...NODES[existing], ...n };
              else NODES.push({ ...n, label: n.label || n.id, status: n.status || 'pending', order: n.order || 0 });
            });
            // Ensure central INIT exists
            if (!NODES.find(n => n.id === '__init__')) {
              NODES.unshift({ id: '__init__', label: 'INIT', status: 'done', order: 0, layman: 'Central hub — all sessions branch from here.', cause: '', expect: '', techDetails: null, activity: [] });
            }
            if (g.edges) {
              g.edges.forEach(edge => {
                const from = edge.from === sessionInitId ? '__init__' : edge.from;
                const to = edge.to === sessionInitId ? '__init__' : edge.to;
                if (!EDGES.find(ex => ex.from === from && ex.to === to)) {
                  EDGES.push({ ...edge, from, to });
                }
              });
            }
          }
          positionNodes();
          rebuildParticles();
          renderSteps();
        } else {
          applyGraphData(data.graph || data);
        }
      } catch(err) {}
    });

    es.addEventListener('node:added', function(e) {
      try {
        const data = JSON.parse(e.data);
        const node = data.node || data;
        // In all-mode, skip per-session INIT nodes (we use central __init__)
        if (isAllMode && node.label === 'INIT') return;
        // Attach sessionId from SSE event data
        const sessionTag = data.sessionId || node.sessionId || node._sessionId;
        const existing = NODES.findIndex(n => n.id === node.id);
        if (existing >= 0) NODES[existing] = { ...NODES[existing], ...node, _sessionId: sessionTag };
        else NODES.push({ ...node, label: node.label || node.id, status: node.status || 'pending', order: node.order || 0, _sessionId: sessionTag });
        positionNodes();
        rebuildParticles();
        renderSteps();
        if (selectedNodeId === node.id) renderPanel(node.id);
      } catch(err) {}
    });

    es.addEventListener('node:updated', function(e) {
      try {
        const raw = JSON.parse(e.data);
        const data = raw.patch ? { id: raw.nodeId, ...raw.patch } : raw;
        const node = NODES.find(n => n.id === data.id);
        if (node) {
          Object.assign(node, data);
          positionNodes();
          rebuildParticles();
          renderSteps();
          if (selectedNodeId === data.id) renderPanel(data.id);
        }
      } catch(err) {}
    });

    es.addEventListener('edge:added', function(e) {
      try {
        const data = JSON.parse(e.data);
        const edge = data.edge || data;
        let from = edge.from || edge.source;
        let to = edge.to || edge.target;
        // In all-mode, remap edges from per-session INIT to central __init__
        if (isAllMode) {
          if (!NODES.find(n => n.id === from)) from = '__init__';
          if (!NODES.find(n => n.id === to)) to = '__init__';
        }
        if (!EDGES.find(ex => ex.from === from && ex.to === to)) {
          EDGES.push({ ...edge, from, to });
        }
        rebuildParticles();
        renderSteps();
      } catch(err) {}
    });

    es.addEventListener('activity', function(e) {
      try {
        const raw = JSON.parse(e.data);
        const data = { nodeId: raw.nodeId, entry: raw.entry || raw };
        const node = NODES.find(n => n.id === data.nodeId);
        if (node) {
          if (!node.activity) node.activity = [];
          node.activity.push(data.entry);
          if (selectedNodeId === data.nodeId) renderPanel(data.nodeId);
        }
      } catch(err) {}
    });

    es.addEventListener('progress', function(e) {
      try {
        const data = JSON.parse(e.data);
        const pctEl = document.getElementById('progress-pct');
        const fillEl = document.getElementById('progress-fill');
        const pct = data.progress ?? data.percent;
        if (pct !== undefined) {
          if (pctEl) pctEl.textContent = pct + '%';
          if (fillEl) fillEl.style.width = pct + '%';
        }
      } catch(err) {}
    });

    // Generic message handler for unnamed events
    es.onmessage = function(e) {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'graph:full') applyGraphData(data);
      } catch(err) {}
    };
  }

  connectSSE();
}
</script>
</body>
</html>`;
}
