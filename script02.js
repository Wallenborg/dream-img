const MAX_AGENTS = 8;


const SAMPLER_CHANCE = 0.004;
const SAMPLER_COOLDOWN_MIN = 200;
const SAMPLER_COOLDOWN_MAX = 600;


let samplerCooldown = 0;

const hudEl = document.getElementById("agentHud");
let hudLastUpdate = 0;
const HUD_INTERVAL_MS = 250;
let hudPulseUntil = 0;

let AGENT_ID = 0;

function createAgent() {
  const agent = {
    id: ++AGENT_ID,
    label: `FieldDrift@${String(AGENT_ID).padStart(2, "0")}`,
    type: "FieldDrift",

    x: Math.random() * master.width,
    y: Math.random() * master.height,
    angle: Math.random() * Math.PI * 2,
    speed: Math.random() * 1.2 + 0.4,
    age: 0,
    lifeSpan: Math.floor(Math.random() * 600 + 300),
    moodTimer: 0,
    nextMoodChange: Math.floor(Math.random() * 200 + 100),
  };
  randomizeMood(agent);
  return agent;
}

function updateAgentLabel(agent) {
  const ops = [];
  if (agent.doColor) ops.push("Color");
  if (agent.doDrift) ops.push("Drift");
  if (agent.doPixelZoom) ops.push("Zoom");

  const opTag = ops.length ? `+${ops.join("+")}` : "";
  const idTag = `@${String(agent.id).padStart(2, "0")}`;
  agent.label = `FieldDrift${opTag}${idTag}`;
}

function randomizeMood(agent) {
  agent.driftX = Math.floor(Math.random() * 9 - 4);
  agent.driftY = Math.floor(Math.random() * 9 - 4);
  agent.formSize = Math.floor(Math.random() * 80 + 10);
  agent.formCompactness = Math.random();
  agent.doColor = Math.random() < 0.8;
  agent.doDrift = Math.random() < 0.6;
  agent.doPixelZoom = Math.random() < 0.1;
  agent.nextMoodChange = Math.floor(Math.random() * 200 + 100);

  updateAgentLabel(agent);
}

function generateMask(x, y, cellSize, steps, compactness = 1) {
  const gx = Math.floor(x / cellSize);
  const gy = Math.floor(y / cellSize);
  const visited = new Set();
  const queue = [[gx, gy]];
  visited.add(`${gx},${gy}`);
  const shape = [];

  while (shape.length < steps && queue.length > 0) {
    const [cx, cy] = queue.shift();
    const px = cx * cellSize;
    const py = cy * cellSize;

    if (
      px < 0 ||
      py < 0 ||
      px + cellSize > master.width ||
      py + cellSize > master.height
    )
      continue;

    shape.push({ x: px, y: py, w: cellSize, h: cellSize });

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      if (Math.random() < compactness) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push([nx, ny]);
        }
      }
    }
  }
  return shape;
}

function applyMorph(agent, imgData) {
  const data = imgData.data;
  const original = new Uint8ClampedArray(data);
  const cellSize = 10;

  const shape = generateMask(
    agent.x,
    agent.y,
    cellSize,
    agent.formSize,
    agent.formCompactness,
  );

  let zoomR = 0,
    zoomG = 0,
    zoomB = 0,
    zoomA = 255;
  if (agent.doPixelZoom && shape.length > 0) {
    const center = shape[Math.floor(Math.random() * shape.length)];
    const cx = center.x;
    const cy = center.y;
    const i = (cy * master.width + cx) * 4;
    zoomR = original[i];
    zoomG = original[i + 1];
    zoomB = original[i + 2];
    zoomA = original[i + 3];
  }

  shape.forEach(({ x, y, w, h }) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const sx = x + dx;
        const sy = y + dy;
        const tx = sx + agent.driftX;
        const ty = sy + agent.driftY;

        if (sx < 0 || sy < 0 || sx >= master.width || sy >= master.height)
          continue;

        const i = (sy * master.width + sx) * 4;

        let r = original[i];
        let g = original[i + 1];
        let b = original[i + 2];
        let a = original[i + 3];

        if (agent.doPixelZoom) {
          r = zoomR;
          g = zoomG;
          b = zoomB;
          a = zoomA;
        }

        if (agent.doColor) {
          const shift = Math.random() * 18 - 9;
          r = Math.min(255, Math.max(0, r + shift));
          g = Math.min(255, Math.max(0, g + shift));
          b = Math.min(255, Math.max(0, b + shift));
        }

        if (
          agent.doDrift &&
          tx >= 0 &&
          ty >= 0 &&
          tx < master.width &&
          ty < master.height
        ) {
          const ti = (ty * master.width + tx) * 4;
          r = original[ti];
          g = original[ti + 1];
          b = original[ti + 2];
          a = original[ti + 3];
        }

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      }
    }
  });
}

// ----------------------------
// Helper: clamp + smoothstep
// ----------------------------
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Tiny hash-noise
function hash2(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = (n * 1274126177) | 0;
  n = (n ^ (n >> 16)) | 0;
  return (n >>> 0) / 4294967295;
}



// ----------------------------
// Original Patch Sampler
// ----------------------------
function applyOriginalPatchSampler(imgData) {
  if (!window.__ORIGINAL || !window.__ORIGINAL.data) return false;

  const w = master.width;
  const h = master.height;

  const data = imgData.data;
  const snap = new Uint8ClampedArray(data);
  const orig = window.__ORIGINAL.data;

 
  const base = Math.floor(Math.random() * 520 + 140); 
  const ratio = Math.random() * 0.25 + 0.875;        
  const patchW = Math.floor(base * ratio);
  const patchH = Math.floor(base / ratio);

  const halfW = (patchW / 2) | 0;
  const halfH = (patchH / 2) | 0;

 
  const srcCX = Math.floor(Math.random() * w);
  const srcCY = Math.floor(Math.random() * h);

  const dstCX = Math.floor(Math.random() * w);
  const dstCY = Math.floor(Math.random() * h);


  const angle = Math.random() * Math.PI * 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);

  const seed = (Math.random() * 1e9) | 0;
  const feather = Math.random() * 0.22 + 0.18;     
  const ragged = Math.random() * 0.55 + 0.25;      


  const opacity = Math.min(1, Math.random() * 0.22 + 0.78);

  for (let oy = -halfH; oy <= halfH; oy++) {
    const dy = dstCY + oy;
    if (dy < 0 || dy >= h) continue;

    for (let ox = -halfW; ox <= halfW; ox++) {
      const dx = dstCX + ox;
      if (dx < 0 || dx >= w) continue;

    
      const nx = ox / halfW;
      const ny = oy / halfH;
      const radial = Math.sqrt(nx * nx + ny * ny);

      const n = hash2(dx, dy, seed) * ragged;
      const blobEdge = 1.0 + (n - ragged * 0.5) * 0.35;

      if (radial > blobEdge) continue;

      const edgeStart = 1.0 - feather;
      const edgeT = smoothstep(edgeStart, 1.0, radial / blobEdge);

     
      const alpha = Math.min(1, Math.max(0, opacity * (1.0 - edgeT)));
      if (alpha <= 0.001) continue;

   
      const rx = (ox * ca - oy * sa);
      const ry = (ox * sa + oy * ca);

      const sx = (srcCX + Math.round(rx)) | 0;
      const sy = (srcCY + Math.round(ry)) | 0;

      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;

      const di = (dy * w + dx) * 4;
      const si = (sy * w + sx) * 4;

      data[di]     = lerp(snap[di],     orig[si],     alpha);
      data[di + 1] = lerp(snap[di + 1], orig[si + 1], alpha);
      data[di + 2] = lerp(snap[di + 2], orig[si + 2], alpha);
      data[di + 3] = lerp(snap[di + 3], orig[si + 3], alpha);
    }
  }

  return true;
}

// ----------------------------
// HUD render
// ----------------------------
function renderHud(nowMs) {
  if (!hudEl) return;

  const pulse = nowMs < hudPulseUntil;

  const list = agents
    .slice(0, 10)
    .map((a) => a.label)
    .join(" · ");

  hudEl.innerHTML = `
  <div class="hud-inner">
    <span>Agents: ${agents.length}</span>
    <span> — ${list}</span
    ${pulse ? ` <span class="pulse">— SOURCE PATCH</span>` : ``}
  </div>
`;
}

// ----------------------------
// Animate
// ----------------------------
function animate() {
  if (!imageLoaded || paused) return;

  if (agents.length === 0) agents.push(createAgent());

  const imgData = mctx.getImageData(0, 0, master.width, master.height);

  if (agents.length < MAX_AGENTS && Math.random() < 0.02) {
    agents.push(createAgent());
  }

  for (let i = agents.length - 1; i >= 0; i--) {
    const agent = agents[i];
    agent.age++;
    agent.moodTimer++;

    if (agent.moodTimer > agent.nextMoodChange) {
      randomizeMood(agent);
      agent.moodTimer = 0;
    }

    applyMorph(agent, imgData);

    if (Math.random() < 0.2) agent.angle += (Math.random() - 0.5) * 0.3;
    if (Math.random() < 0.005) agent.angle = Math.random() * Math.PI * 2;

    agent.x += Math.cos(agent.angle) * agent.speed;
    agent.y += Math.sin(agent.angle) * agent.speed;

    if (agent.x < 0 || agent.x > master.width)
      agent.angle = Math.PI - agent.angle;
    if (agent.y < 0 || agent.y > master.height) agent.angle = -agent.angle;

    if (agent.age > agent.lifeSpan && agents.length > 1) {
      agents.splice(i, 1);
    } else if (agents.length === 1 && agent.age > agent.lifeSpan) {
      agent.age = 0;
      agent.lifeSpan = Math.floor(Math.random() * 600 + 300);
      agent.speed = 0.2;
      agent.formCompactness = 0.9;
      agent.formSize = 50;
      agent.doColor = true;
      agent.doDrift = false;
      agent.doPixelZoom = false;
      updateAgentLabel(agent);
    }
  }

  let didSample = false;
  if (samplerCooldown > 0) {
    samplerCooldown--;
  } else if (Math.random() < SAMPLER_CHANCE) {
    didSample = applyOriginalPatchSampler(imgData);
    samplerCooldown = Math.floor(
      Math.random() * (SAMPLER_COOLDOWN_MAX - SAMPLER_COOLDOWN_MIN + 1) +
        SAMPLER_COOLDOWN_MIN,
    );
  }

  if (didSample) {
    hudPulseUntil = performance.now() + 900;
  }

  mctx.putImageData(imgData, 0, 0);

  if (typeof window.renderPreview === "function") {
    window.renderPreview();
  }

  const now = performance.now();
  if (now - hudLastUpdate > HUD_INTERVAL_MS) {
    renderHud(now);
    hudLastUpdate = now;
  }

  animationFrame = requestAnimationFrame(animate);
}

window.agents = agents;
