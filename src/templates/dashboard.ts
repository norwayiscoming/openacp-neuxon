export function generateDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NEUXON — AI Journey Graph</title>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js"
  }
}
</script>
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
    grid-template-columns: 220px 1fr 320px;
    grid-template-rows: 48px 1fr 36px;
    height: 100vh;
  }

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
    z-index: 10;
  }
  .logo {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 4px;
    color: #c084fc;
    text-shadow: 0 0 12px #c084fc50;
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
    color: #22d3ee;
    font-weight: 600;
  }
  .live-badge::before {
    content: '';
    width: 8px; height: 8px;
    background: #22d3ee;
    border-radius: 50%;
    box-shadow: 0 0 8px #22d3ee;
    animation: pulse 2s infinite;
  }
  .live-badge.disconnected { color: #ff4444; }
  .live-badge.disconnected::before { background: #ff4444; box-shadow: 0 0 8px #ff4444; animation: none; }
  @keyframes pulse {
    0%,100% { opacity:1; box-shadow:0 0 8px #22d3ee; }
    50% { opacity:.5; box-shadow:0 0 4px #22d3ee; }
  }

  /* ── LEFT PANEL: Steps ── */
  .steps-panel {
    grid-column: 1;
    grid-row: 2;
    background: #0d1117;
    border-right: 1px solid #1a2030;
    padding: 16px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 5;
  }
  .steps-panel h3 {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 2px;
    color: #8b949e;
    text-transform: uppercase;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #1a2030;
  }
  .step-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    font-size: 11px;
    line-height: 1.4;
  }
  .step-item:hover { background: #161b22; }
  .step-item.selected { background: #1c2030; border-left: 2px solid #a78bfa; }
  .step-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-top: 3px;
    flex-shrink: 0;
  }
  .step-dot.done { background: #22d3ee; opacity: 0.6; }
  .step-dot.active { background: #a78bfa; box-shadow: 0 0 6px #a78bfa; animation: pulse-violet 1.5s infinite; }
  .step-dot.detour { background: #f97316; }
  .step-dot.pending { background: #4b5563; }
  @keyframes pulse-violet {
    0%,100% { box-shadow: 0 0 6px #a78bfa; }
    50% { box-shadow: 0 0 12px #a78bfa; }
  }
  .step-label {
    color: #c9d1d9;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }
  .step-layman {
    color: #8b949e;
    font-size: 10px;
    margin-top: 2px;
  }

  /* ── CENTER: Three.js canvas wrapper ── */
  .canvas-wrap {
    grid-column: 2;
    grid-row: 2;
    position: relative;
    overflow: hidden;
    background: #0a0e14;
  }
  #three-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  #label-canvas {
    position: absolute;
    top: 0; left: 0;
    pointer-events: none;
    width: 100%;
    height: 100%;
  }

  /* ── RIGHT PANEL: Detail ── */
  .detail-panel {
    grid-column: 3;
    grid-row: 2;
    background: #0d1117;
    border-left: 1px solid #1a2030;
    padding: 20px 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: 12px;
    resize: horizontal;
    min-width: 200px;
    max-width: 500px;
    z-index: 5;
  }
  .detail-panel h3 {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 2px;
    color: #8b949e;
    text-transform: uppercase;
    padding-bottom: 8px;
    border-bottom: 1px solid #1a2030;
  }
  .detail-empty {
    color: #4b5563;
    font-size: 11px;
    text-align: center;
    margin-top: 40px;
    line-height: 1.8;
  }
  .detail-field { display: flex; flex-direction: column; gap: 4px; }
  .detail-field-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #6b7280;
  }
  .detail-field-value {
    color: #c9d1d9;
    line-height: 1.5;
    font-size: 11px;
  }
  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.5px;
  }
  .status-badge.done { background: #0e3a4a; color: #22d3ee; }
  .status-badge.active { background: #2d1f4a; color: #a78bfa; }
  .status-badge.detour { background: #3a1f0a; color: #f97316; }
  .status-badge.pending { background: #1a1f2a; color: #6b7280; }

  /* ── BOTTOM BAR ── */
  .bottombar {
    grid-column: 1 / -1;
    grid-row: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    background: #0d1117;
    border-top: 1px solid #1a2030;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #8b949e;
    z-index: 10;
  }
  .progress-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    max-width: 400px;
  }
  .progress-bar-bg {
    flex: 1;
    height: 3px;
    background: #1a2030;
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #22d3ee, #c084fc);
    border-radius: 2px;
    transition: width 0.4s ease;
    width: 0%;
  }
  .progress-pct {
    color: #c9d1d9;
    min-width: 32px;
    text-align: right;
  }

  /* ── TOOLTIP ── */
  #tooltip {
    position: fixed;
    pointer-events: none;
    background: rgba(13,17,23,0.92);
    border: 1px solid #1a2030;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: #c9d1d9;
    z-index: 100;
    display: none;
    max-width: 220px;
    line-height: 1.5;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  /* ── SESSION SELECTOR ── */
  .session-select {
    background: #161b22;
    border: 1px solid #1a2030;
    color: #c9d1d9;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    outline: none;
  }
  .session-select:focus { border-color: #c084fc; }
</style>
</head>
<body>
<div class="layout" id="layout">
  <!-- TOP BAR -->
  <div class="topbar">
    <div class="logo">NEUXON</div>
    <div class="topbar-right">
      <select class="session-select" id="sessionSelect">
        <option value="">All sessions</option>
      </select>
      <span id="sessionCount" style="color:#8b949e">0 sessions</span>
      <span id="nodeCount" style="color:#8b949e">0 nodes</span>
      <span class="live-badge disconnected" id="liveBadge">LIVE</span>
    </div>
  </div>

  <!-- LEFT STEPS PANEL -->
  <div class="steps-panel" id="stepsPanel">
    <h3>Steps</h3>
    <div id="stepsList" style="display:flex;flex-direction:column;gap:6px"></div>
  </div>

  <!-- CENTER THREE.JS -->
  <div class="canvas-wrap" id="canvasWrap">
    <canvas id="three-canvas"></canvas>
    <canvas id="label-canvas"></canvas>
  </div>

  <!-- RIGHT DETAIL PANEL -->
  <div class="detail-panel" id="detailPanel">
    <h3>Node Detail</h3>
    <div id="detailContent">
      <div class="detail-empty">Click a node<br>to inspect it</div>
    </div>
  </div>

  <!-- BOTTOM BAR -->
  <div class="bottombar">
    <div class="progress-wrap">
      <span style="color:#6b7280;white-space:nowrap">Progress</span>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" id="progressFill"></div>
      </div>
      <span class="progress-pct" id="progressPct">0%</span>
    </div>
    <div style="display:flex;gap:20px;align-items:center">
      <span id="bottomStatus" style="color:#6b7280">Waiting for data…</span>
      <span style="color:#4b5563">Drag=pan · Scroll=zoom</span>
    </div>
  </div>
</div>

<div id="tooltip"></div>

<script type="module">
import * as THREE from 'three';

// ── Color palette ──────────────────────────────────────────────────────────
const C = {
  qa:      0x22d3ee,
  creative:0xc084fc,
  active:  0xa78bfa,
  detour:  0xf97316,
  init:    0xc0c0c0,
  result:  0x22d3ee,
  bg:      0x0a0e14,
  grid:    0x22d3ee,
};
const CSS = {
  qa:      '#22d3ee',
  creative:'#c084fc',
  active:  '#a78bfa',
  detour:  '#f97316',
  init:    '#c0c0c0',
  done:    '#22d3ee',
  pending: '#4b5563',
};

// ── State ──────────────────────────────────────────────────────────────────
let graphData = { nodes: [], edges: [] };
let sessionId = null;
let selectedNodeId = null;
let hoveredNodeId = null;
let sseSource = null;
let animationId = null;

// camera pan state
let panX = 0, panZ = 0;
let targetZoom = 350;
let currentZoom = 350;
let isDragging = false;
let dragStartX = 0, dragStartZ = 0;
let dragStartMouseX = 0, dragStartMouseY = 0;

// Three.js objects
let renderer, scene, camera;
const nodeMeshes = new Map();  // nodeId -> mesh
const edgeLines  = new Map();  // edgeId -> line
const particles  = [];         // {mesh, fromId, toId, t, speed}
let  clockTime   = 0;

// ── Boot ──────────────────────────────────────────────────────────────────
const wrap        = document.getElementById('canvasWrap');
const threeCanvas = document.getElementById('three-canvas');
const labelCanvas = document.getElementById('label-canvas');
const labelCtx    = labelCanvas.getContext('2d');

initThree();
fetchSessions();
fetchGraph();
connectSSE();

// ── Three.js init ─────────────────────────────────────────────────────────
function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(C.bg, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(C.bg, 0.0025);

  camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
  camera.position.set(0, 350, 200);
  camera.lookAt(0, 0, 0);

  // Grid
  const grid = new THREE.GridHelper(2000, 80, C.grid, C.grid);
  grid.position.y = -30;
  grid.material.opacity = 0.03;
  grid.material.transparent = true;
  scene.add(grid);

  // Ambient light
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));

  resize();
  window.addEventListener('resize', resize);
  setupMouseControls();
  animate();
}

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  labelCanvas.width  = w * window.devicePixelRatio;
  labelCanvas.height = h * window.devicePixelRatio;
  labelCanvas.style.width  = w + 'px';
  labelCanvas.style.height = h + 'px';
  labelCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ── Camera controls (pan + zoom, NO rotation) ─────────────────────────────
function setupMouseControls() {
  const el = threeCanvas;

  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isDragging = true;
    dragStartMouseX = e.clientX;
    dragStartMouseY = e.clientY;
    dragStartX = panX;
    dragStartZ = panZ;
    el.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    el.style.cursor = 'grab';
  });

  window.addEventListener('mousemove', e => {
    if (isDragging) {
      const dx = e.clientX - dragStartMouseX;
      const dy = e.clientY - dragStartMouseY;
      panX = dragStartX - dx * 0.3;
      panZ = dragStartZ - dy * 0.3;
      updateCamera();
      return;
    }
    handleHover(e);
  });

  el.addEventListener('wheel', e => {
    e.preventDefault();
    targetZoom = Math.max(100, Math.min(800, targetZoom + e.deltaY * 0.5));
  }, { passive: false });

  el.style.cursor = 'grab';
}

function updateCamera() {
  camera.position.set(panX * 0.3, currentZoom, panZ * 0.3 + 200);
  camera.lookAt(panX * 0.3, 0, panZ * 0.3);
}

// ── Client-side radial layout (for SSE-received nodes without positions) ──
function computeClientLayout(nodes, edges) {
  if (nodes.length === 0) return;

  const children = new Map();
  for (const e of edges) {
    if (!children.has(e.from)) children.set(e.from, []);
    children.get(e.from).push(e.to);
  }

  const root = nodes.find(n => n.label === 'INIT') || nodes[0];
  if (root.x == null) { root.x = 0; root.y = 0; root.z = 0; }

  const positioned = new Set();
  // Keep nodes that already have positions
  for (const n of nodes) {
    if (n.x != null && n.y != null && n.z != null) positioned.add(n.id);
  }
  if (!positioned.has(root.id)) positioned.add(root.id);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const allRootChildren = children.get(root.id) || [];
  // If only 1 branch from root, spread its sub-steps in an arc instead of a line
  const angleStep = allRootChildren.length > 1
    ? (2 * Math.PI) / allRootChildren.length
    : Math.PI / 3; // 60 degree arc for single branch

  let seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  allRootChildren.forEach((childId, i) => {
    const baseAngle = allRootChildren.length > 1
      ? angleStep * i
      : -Math.PI / 6; // start single branch slightly left
    const queue = [{ id: childId, depth: 1, angle: baseAngle }];

    while (queue.length > 0) {
      const cur = queue.shift();
      const node = nodeMap.get(cur.id);
      if (!node || positioned.has(cur.id)) {
        if (node) {
          const ch = children.get(cur.id) || [];
          ch.forEach((cid, j) => {
            // Wider spread for branching: each child gets a distinct angle offset
            const spread = ch.length > 1 ? 0.8 : 0.4;
            const subAngle = cur.angle + (j - (ch.length - 1) / 2) * spread;
            queue.push({ id: cid, depth: cur.depth + 1, angle: subAngle });
          });
        }
        continue;
      }
      positioned.add(cur.id);

      const dist = cur.depth * 80;
      // Add progressive angle offset per depth to create an arc, not a line
      const arcOffset = (allRootChildren.length <= 1) ? cur.depth * 0.15 : 0;
      const finalAngle = cur.angle + arcOffset;

      node.x = Math.cos(finalAngle) * dist + (rand() - 0.5) * 30;
      node.y = (rand() - 0.5) * 20;
      node.z = Math.sin(finalAngle) * dist + (rand() - 0.5) * 30;

      const ch = children.get(cur.id) || [];
      ch.forEach((cid, j) => {
        const spread = ch.length > 1 ? 0.8 : 0.4;
        const subAngle = finalAngle + (j - (ch.length - 1) / 2) * spread;
        queue.push({ id: cid, depth: cur.depth + 1, angle: subAngle });
      });
    }
  });

  // Position any remaining unpositioned nodes near their parent
  for (const n of nodes) {
    if (!positioned.has(n.id)) {
      // Find parent from edges
      const parentEdge = edges.find(e => e.to === n.id);
      const parent = parentEdge ? nodeMap.get(parentEdge.from) : null;
      if (parent && parent.x != null) {
        n.x = parent.x + (rand() - 0.5) * 60;
        n.y = (parent.y || 0) + (rand() - 0.5) * 20;
        n.z = (parent.z || 0) + (rand() - 0.5) * 60;
      } else {
        n.x = (rand() - 0.5) * 100;
        n.y = (rand() - 0.5) * 30;
        n.z = (rand() - 0.5) * 100;
      }
      positioned.add(n.id);
    }
  }
}

// ── Scene build ────────────────────────────────────────────────────────────
function buildScene() {
  // Remove old nodes/edges/particles
  for (const m of nodeMeshes.values()) {
    if (m._light) scene.remove(m._light);
    scene.remove(m);
  }
  nodeMeshes.clear();
  for (const l of edgeLines.values()) scene.remove(l);
  edgeLines.clear();
  for (const p of particles) scene.remove(p.mesh);
  particles.length = 0;

  const { nodes, edges } = graphData;

  // Determine session type for color
  const sessionColor = (sessionId && sessionId.includes('creative')) ? C.creative : C.qa;

  // Build nodes
  for (const node of nodes) {
    const type = node.label === 'INIT'   ? 'init'
               : node.label === 'RESULT' ? 'result'
               : node.label === 'TOOL'   ? 'tool'
               : 'step';

    const radius = type === 'init'   ? 6
                 : type === 'result' ? 4.5
                 : type === 'tool'   ? 2
                 : 3;

    const geo  = new THREE.SphereGeometry(radius, 16, 12);
    const color = node.status === 'detour' ? C.detour
                : node.label === 'INIT'    ? C.init
                : node.status === 'active' ? C.active
                : sessionColor;
    const opacity = node.status === 'done'    ? 0.85
                  : node.status === 'active'  ? 1.0
                  : node.status === 'detour'  ? 0.9
                  : 0.7;

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: node.status === 'active' ? 0.6 : 0.2,
      transparent: true,
      opacity,
      roughness: 0.3,
      metalness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
    mesh._nodeId   = node.id;
    mesh._baseY    = node.y ?? 0;
    mesh._baseScale = 1;
    mesh._status   = node.status;
    mesh._isActive = node.status === 'active';

    // Point light for special nodes
    if (type === 'init' || type === 'result' || node.status === 'active') {
      const light = new THREE.PointLight(color, node.status === 'active' ? 1.2 : 0.6, 120);
      light.position.copy(mesh.position);
      scene.add(light);
      mesh._light = light;
    }

    scene.add(mesh);
    nodeMeshes.set(node.id, mesh);
  }

  // Build edges + particles
  for (const edge of edges) {
    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode   = nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) continue;

    const pts = [
      new THREE.Vector3(fromNode.x ?? 0, fromNode.y ?? 0, fromNode.z ?? 0),
      new THREE.Vector3(toNode.x   ?? 0, toNode.y   ?? 0, toNode.z   ?? 0),
    ];
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const mat  = new THREE.LineBasicMaterial({
      color: edge.type === 'detour' ? C.detour : sessionColor,
      transparent: true,
      opacity: 0.4,
    });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    edgeLines.set(edge.id, line);

    // Particle along edge
    const pGeo = new THREE.SphereGeometry(1.2, 8, 6);
    const pMat = new THREE.MeshBasicMaterial({
      color: edge.type === 'detour' ? C.detour : sessionColor,
      transparent: true,
      opacity: 0.8,
    });
    const pMesh = new THREE.Mesh(pGeo, pMat);
    scene.add(pMesh);
    particles.push({
      mesh:   pMesh,
      fromId: edge.from,
      toId:   edge.to,
      t:      Math.random(),
      speed:  0.002 + Math.random() * 0.003,
    });
  }

  updateStepsPanel();
  updateNodeCount();
}

// ── Animation loop ─────────────────────────────────────────────────────────
function animate() {
  animationId = requestAnimationFrame(animate);
  clockTime += 0.016;

  // Smooth zoom lerp
  currentZoom += (targetZoom - currentZoom) * 0.08;
  camera.position.y = currentZoom;

  // Float animation + active pulse
  for (const [id, mesh] of nodeMeshes) {
    const floatY = mesh._baseY + Math.sin(clockTime + mesh.position.x * 0.1) * 1.5;
    mesh.position.y = floatY;
    if (mesh._light) {
      mesh._light.position.y = floatY;
    }
    if (mesh._isActive) {
      const pulse = 0.6 + Math.abs(Math.sin(clockTime * 2)) * 0.5;
      mesh.material.emissiveIntensity = pulse;
      if (mesh._light) mesh._light.intensity = pulse * 1.5;
      const s = 1 + Math.abs(Math.sin(clockTime * 1.5)) * 0.08;
      mesh.scale.setScalar(s);
    }
    if (id === hoveredNodeId) {
      mesh.scale.setScalar(mesh._isActive ? 1.4 + Math.abs(Math.sin(clockTime * 1.5)) * 0.08 : 1.4);
    } else if (!mesh._isActive) {
      mesh.scale.setScalar(1);
    }
  }

  // Particle travel
  const nodes = graphData.nodes;
  for (const p of particles) {
    p.t = (p.t + p.speed) % 1;
    const from = nodes.find(n => n.id === p.fromId);
    const to   = nodes.find(n => n.id === p.toId);
    if (from && to) {
      p.mesh.position.lerpVectors(
        new THREE.Vector3(from.x ?? 0, from.y ?? 0, from.z ?? 0),
        new THREE.Vector3(to.x   ?? 0, to.y   ?? 0, to.z   ?? 0),
        p.t
      );
    }
  }

  renderer.render(scene, camera);
  drawLabels();
}

// ── Label overlay ──────────────────────────────────────────────────────────
function drawLabels() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  labelCtx.clearRect(0, 0, w, h);
  labelCtx.font = 'bold 10px JetBrains Mono, monospace';

  for (const node of graphData.nodes) {
    const mesh = nodeMeshes.get(node.id);
    if (!mesh) continue;

    const worldPos = mesh.position.clone();
    worldPos.project(camera);
    const sx = (worldPos.x  *  0.5 + 0.5) * w;
    const sy = (-worldPos.y *  0.5 + 0.5) * h;

    if (worldPos.z > 1) continue; // behind camera

    const depth = worldPos.z;
    const isSpecial = node.label === 'INIT' || node.label === 'RESULT' || node.status === 'active';
    const baseAlpha = isSpecial ? 1.0 : Math.max(0, 1 - depth * 1.2);
    if (baseAlpha < 0.05 && !isSpecial) continue;

    const alpha = node.id === selectedNodeId ? 1.0 : baseAlpha;
    const color = node.status === 'detour'   ? CSS.detour
                : node.status === 'active'   ? CSS.active
                : node.label === 'INIT'      ? CSS.init
                : CSS.done;

    labelCtx.globalAlpha = alpha;
    labelCtx.fillStyle = color;

    const meshRadius = mesh.geometry.parameters.radius ?? 3;
    const labelY = sy - meshRadius * 1.2 - 6;

    const text = node.label;
    const maxLen = 20;
    const display = text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
    const tw = labelCtx.measureText(display).width;

    // background pill
    labelCtx.globalAlpha = alpha * 0.6;
    labelCtx.fillStyle = '#0d1117';
    labelCtx.beginPath();
    labelCtx.roundRect(sx - tw / 2 - 4, labelY - 10, tw + 8, 14, 3);
    labelCtx.fill();

    labelCtx.globalAlpha = alpha;
    labelCtx.fillStyle = color;
    labelCtx.textAlign = 'center';
    labelCtx.fillText(display, sx, labelY);
  }
  labelCtx.globalAlpha = 1;
}

// ── Hover / raycasting ────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse2D   = new THREE.Vector2();
const tooltip   = document.getElementById('tooltip');

function handleHover(e) {
  const rect = threeCanvas.getBoundingClientRect();
  mouse2D.x =  ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
  mouse2D.y = -((e.clientY - rect.top)   / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse2D, camera);
  const meshList = Array.from(nodeMeshes.values());
  const hits = raycaster.intersectObjects(meshList);

  if (hits.length > 0) {
    const mesh = hits[0].object;
    hoveredNodeId = mesh._nodeId;
    const node = graphData.nodes.find(n => n.id === mesh._nodeId);
    if (node) {
      tooltip.style.display = 'block';
      tooltip.style.left    = (e.clientX + 14) + 'px';
      tooltip.style.top     = (e.clientY - 6)  + 'px';
      tooltip.innerHTML = \`<strong style="color:\${node.status==='active'?CSS.active:CSS.done}">\${escHtml(node.label)}</strong><br>
        <span style="color:#8b949e">\${escHtml(node.layman || '')}</span><br>
        <span style="color:#4b5563">\${node.status}</span>\`;
    }
  } else {
    hoveredNodeId = null;
    tooltip.style.display = 'none';
  }
}

threeCanvas.addEventListener('click', e => {
  const rect = threeCanvas.getBoundingClientRect();
  mouse2D.x =  ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
  mouse2D.y = -((e.clientY - rect.top)   / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse2D, camera);
  const hits = raycaster.intersectObjects(Array.from(nodeMeshes.values()));
  if (hits.length > 0) {
    selectNode(hits[0].object._nodeId);
  }
});

// ── Selection / detail panel ──────────────────────────────────────────────
function selectNode(id) {
  selectedNodeId = id;
  const node = graphData.nodes.find(n => n.id === id);
  const detail = document.getElementById('detailContent');
  if (!node) {
    detail.innerHTML = '<div class="detail-empty">Node not found</div>';
    return;
  }

  // highlight in steps panel
  document.querySelectorAll('.step-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.nodeId === id);
  });

  const statusClass = node.status || 'pending';
  detail.innerHTML = \`
    <div class="detail-field">
      <div class="detail-field-label">Label</div>
      <div class="detail-field-value" style="font-family:monospace">\${escHtml(node.label)}</div>
    </div>
    <div class="detail-field">
      <div class="detail-field-label">Status</div>
      <div class="detail-field-value"><span class="status-badge \${statusClass}">\${statusClass.toUpperCase()}</span></div>
    </div>
    \${node.layman ? \`
    <div class="detail-field">
      <div class="detail-field-label">Description</div>
      <div class="detail-field-value">\${escHtml(node.layman)}</div>
    </div>\` : ''}
    \${node.cause ? \`
    <div class="detail-field">
      <div class="detail-field-label">Cause</div>
      <div class="detail-field-value">\${escHtml(node.cause)}</div>
    </div>\` : ''}
    \${node.expect ? \`
    <div class="detail-field">
      <div class="detail-field-label">Expected</div>
      <div class="detail-field-value">\${escHtml(node.expect)}</div>
    </div>\` : ''}
    \${node.startedAt ? \`
    <div class="detail-field">
      <div class="detail-field-label">Started</div>
      <div class="detail-field-value" style="color:#6b7280">\${fmtTime(node.startedAt)}</div>
    </div>\` : ''}
    \${node.completedAt ? \`
    <div class="detail-field">
      <div class="detail-field-label">Completed</div>
      <div class="detail-field-value" style="color:#6b7280">\${fmtTime(node.completedAt)}</div>
    </div>\` : ''}
    \${node.activity && node.activity.length > 0 ? \`
    <div class="detail-field">
      <div class="detail-field-label">Activity (\${node.activity.length})</div>
      <div class="detail-field-value" style="color:#6b7280;font-size:10px;max-height:120px;overflow-y:auto">
        \${node.activity.slice(-5).map(a => \`<div>\${escHtml(a.type || String(a))}</div>\`).join('')}
      </div>
    </div>\` : ''}
  \`;
}

// ── Steps panel ────────────────────────────────────────────────────────────
function updateStepsPanel() {
  const list = document.getElementById('stepsList');
  const nodes = graphData.nodes.filter(n => n.label !== 'TOOL');
  list.innerHTML = nodes.map(node => {
    const dotCls = node.status === 'active' ? 'active'
                 : node.status === 'done'   ? 'done'
                 : node.status === 'detour' ? 'detour'
                 : 'pending';
    return \`<div class="step-item" data-node-id="\${escAttr(node.id)}" onclick="window._selectNode('\${escAttr(node.id)}')">
      <div class="step-dot \${dotCls}"></div>
      <div>
        <div class="step-label">\${escHtml(node.label)}</div>
        \${node.layman ? \`<div class="step-layman">\${escHtml(node.layman.slice(0, 40))}</div>\` : ''}
      </div>
    </div>\`;
  }).join('');
}

window._selectNode = (id) => selectNode(id);

// ── Data fetch ─────────────────────────────────────────────────────────────
async function fetchGraph() {
  try {
    const url = sessionId ? \`/api/graph/\${encodeURIComponent(sessionId)}\` : '/api/graph';
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (data.nodes) {
      graphData = { nodes: data.nodes, edges: data.edges || [] };
    } else if (Array.isArray(data)) {
      const allNodes = [], allEdges = [];
      for (const g of data) {
        allNodes.push(...(g.nodes || []));
        allEdges.push(...(g.edges || []));
      }
      graphData = { nodes: allNodes, edges: allEdges };
    }
    // Ensure all nodes have positions (API already computes them, but fallback)
    computeClientLayout(graphData.nodes, graphData.edges);
    buildScene();
  } catch(e) { /* silent */ }
}

async function fetchSessions() {
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return;
    const body = await res.json();
    const sessions = body.sessions || [];
    const sel = document.getElementById('sessionSelect');
    document.getElementById('sessionCount').textContent = sessions.length + ' session' + (sessions.length !== 1 ? 's' : '');
    // populate dropdown
    while (sel.options.length > 1) sel.remove(1);
    for (const s of sessions) {
      const opt = document.createElement('option');
      opt.value = s.sessionId;
      opt.textContent = s.sessionId.slice(0, 20) + (s.sessionId.length > 20 ? '…' : '');
      sel.appendChild(opt);
    }
  } catch(e) { /* silent */ }
}

document.getElementById('sessionSelect').addEventListener('change', e => {
  sessionId = e.target.value || null;
  fetchGraph();
  if (sseSource) {
    sseSource.close();
    connectSSE();
  }
});

function updateNodeCount() {
  document.getElementById('nodeCount').textContent = graphData.nodes.length + ' nodes';
}

// ── SSE ────────────────────────────────────────────────────────────────────
function connectSSE() {
  const url = sessionId
    ? \`/api/events?sessionId=\${encodeURIComponent(sessionId)}\`
    : '/api/events';

  sseSource = new EventSource(url);

  sseSource.addEventListener('open', () => {
    setBadge(true);
    document.getElementById('bottomStatus').textContent = 'Connected';
  });

  sseSource.addEventListener('error', () => {
    setBadge(false);
    document.getElementById('bottomStatus').textContent = 'Reconnecting…';
  });

  sseSource.addEventListener('graph:full', e => {
    try {
      const data = JSON.parse(e.data);
      // Server sends { type, sessionId, graph: { nodes, edges, ... } }
      const graph = data.graph || data;
      graphData = { nodes: graph.nodes || [], edges: graph.edges || [] };
      // Compute client-side radial layout for nodes without positions
      computeClientLayout(graphData.nodes, graphData.edges);
      buildScene();
      fetchSessions();
    } catch(_) {}
  });

  sseSource.addEventListener('node:added', e => {
    try {
      const data = JSON.parse(e.data);
      // Server sends { type, sessionId, node }
      const node = data.node;
      if (node && !graphData.nodes.find(n => n.id === node.id)) {
        graphData.nodes.push(node);
        // Re-layout to position new node
        computeClientLayout(graphData.nodes, graphData.edges);
        buildScene();
      }
    } catch(_) {}
  });

  sseSource.addEventListener('node:updated', e => {
    try {
      const data = JSON.parse(e.data);
      // Server sends { type, sessionId, nodeId, patch }
      const nodeId = data.nodeId;
      const patch = data.patch || {};
      const idx = graphData.nodes.findIndex(n => n.id === nodeId);
      if (idx >= 0) {
        Object.assign(graphData.nodes[idx], patch);
        buildScene();
        if (selectedNodeId === nodeId) selectNode(nodeId);
      }
    } catch(_) {}
  });

  sseSource.addEventListener('edge:added', e => {
    try {
      const data = JSON.parse(e.data);
      // Server sends { type, sessionId, edge }
      const edge = data.edge;
      if (edge && !graphData.edges.find(ex => ex.id === edge.id)) {
        graphData.edges.push(edge);
        // Re-layout with new edge info
        computeClientLayout(graphData.nodes, graphData.edges);
        buildScene();
      }
    } catch(_) {}
  });

  sseSource.addEventListener('progress', e => {
    try {
      const data = JSON.parse(e.data);
      // Server sends { type, sessionId, progress }
      setProgress(data.progress ?? 0);
    } catch(_) {}
  });
}

function setBadge(on) {
  const b = document.getElementById('liveBadge');
  b.classList.toggle('disconnected', !on);
}

function setProgress(pct) {
  const clamped = Math.min(100, Math.max(0, pct));
  document.getElementById('progressFill').style.width = clamped + '%';
  document.getElementById('progressPct').textContent  = Math.round(clamped) + '%';
}

// ── Utilities ──────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString(); } catch(_) { return iso; }
}
</script>
</body>
</html>`;
}
