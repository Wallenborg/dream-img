const TIME_SCALE = 0.7; 

const MAX_AGENTS = 6;

const SAMPLER_CHANCE = 0.004;
const SAMPLER_COOLDOWN_MIN = 200;
const SAMPLER_COOLDOWN_MAX = 600;
let samplerCooldown = 0;

const PATCH_FLIP_CHANCE = 0.28;

const RANDOMCOLOR_CHANCE = 0.003;
const RANDOMCOLOR_COOLDOWN_MIN = 180;
const RANDOMCOLOR_COOLDOWN_MAX = 520;
let randomColorCooldown = 0;

const EDGE_CONFUSION_CHANCE = 0.0025;
const EDGE_CONFUSION_COOLDOWN_MIN = 220;
const EDGE_CONFUSION_COOLDOWN_MAX = 650;
let edgeConfusionCooldown = 0;

/* ---------------- Temporal Echo Agent ---------------- */
const ECHO_CHANCE = 0.0022;
const ECHO_COOLDOWN_MIN = 240;
const ECHO_COOLDOWN_MAX = 680;
let echoCooldown = 0;

const ECHO_BUFFER_MAX = 10;
const ECHO_STORE_EVERY = 2;
let echoStoreCounter = 0;

let echoBuffer = []; 

const hudEl = document.getElementById("agentHud");
let hudLastUpdate = 0;
const HUD_INTERVAL_MS = 250;
let hudPulseUntil = 0;
let hudPulseText = "";

const statusEl = document.getElementById("statusHud");

// --- DONE logic: distance from ORIGINAL 
const METRIC_INTERVAL_MS = 2000; 
const DIST_SAMPLE_STEP = 10;

const DIST_TARGET_MIN = 0.08;
const DIST_TARGET_MAX = 0.26;

const MIN_RUNTIME_MS = 0;
const FAILSAFE_MAX_MS = 240 * 60 * 1000;

// --- Smooth metric
let distEMA = 0;
const DIST_EMA_ALPHA = 0.25;

let lastMetricMs = 0;
let done = false;

let sampleIdx = null;
let sampleCount = 0;

let distTarget = null;
let lastOriginalRef = null;

let AGENT_ID = 0;

// ---------------- Agents (FieldDrift) ----------------

function createAgent() {
  const agent = {
    id: ++AGENT_ID,
    label: `FieldDrift@${String(AGENT_ID).padStart(2, "0")}`,

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

// ---------------- Utils ----------------

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
function hash2(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = (n * 1274126177) | 0;
  n = (n ^ (n >> 16)) | 0;
  return (n >>> 0) / 4294967295;
}
function pad3(n) {
  return String(Math.max(0, Math.min(999, n)) | 0).padStart(3, "0");
}
function dreamTimeStr() {
  if (window.DM?.formatElapsed && window.DM?.getElapsedMs) {
    return window.DM.formatElapsed(window.DM.getElapsedMs());
  }
  return "";
}
function pulseHud(text) {
  hudPulseText = text || "";
  hudPulseUntil = performance.now() + 900;
}
function sleepStageFromTarget(target) {
  if (target == null) return "—";
  const tRaw = (target - DIST_TARGET_MIN) / (DIST_TARGET_MAX - DIST_TARGET_MIN);
  const t = clamp(tRaw, 0, 1);

  if (t < 0.33) return "LOW";
  if (t < 0.66) return "MID";
  return "HIGH";
}

// ---------------- SourcePatch ----------------

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

  let flipX = false,
    flipY = false;
  if (Math.random() < PATCH_FLIP_CHANCE) {
    flipX = Math.random() < 0.5;
    flipY = !flipX ? Math.random() < 0.5 : Math.random() < 0.2;
  }

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

      let rx = ox * ca - oy * sa;
      let ry = ox * sa + oy * ca;

      if (flipX) rx = -rx;
      if (flipY) ry = -ry;

      const sx = (srcCX + Math.round(rx)) | 0;
      const sy = (srcCY + Math.round(ry)) | 0;
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;

      const di = (dy * w + dx) * 4;
      const si = (sy * w + sx) * 4;

      data[di] = lerp(snap[di], orig[si], alpha);
      data[di + 1] = lerp(snap[di + 1], orig[si + 1], alpha);
      data[di + 2] = lerp(snap[di + 2], orig[si + 2], alpha);
      data[di + 3] = lerp(snap[di + 3], orig[si + 3], alpha);
    }
  }

  return true;
}

// ---------------- RandomColor Agent-Event (ANY RGB) ----------------
function applyRandomColorBlob(imgData) {
  const alpha = Math.random() * 0.7 + 0.1;
  const data = imgData.data;

  const R = (Math.random() * 256) | 0;
  const G = (Math.random() * 256) | 0;
  const B = (Math.random() * 256) | 0;

  const cellSize = Math.floor(Math.random() * 5 + 6);
  const steps = Math.floor(Math.random() * 29 + 12);
  const compactness = Math.random() * 0.55 + 0.25;

  const x = Math.random() * master.width;
  const y = Math.random() * master.height;

  const shape = generateMask(x, y, cellSize, steps, compactness);

  shape.forEach(({ x, y, w, h }) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= master.width || py >= master.height)
          continue;

        const i = (py * master.width + px) * 4;
        const r0 = data[i];
        const g0 = data[i + 1];
        const b0 = data[i + 2];

        data[i] = lerp(r0, R, alpha);
        data[i + 1] = lerp(g0, G, alpha);
        data[i + 2] = lerp(b0, B, alpha);
      }
    }
  });

  return true;
}

function applyEdgeConfusion(imgData) {
  const w = master.width;
  const h = master.height;
  const data = imgData.data;

  const cellSize = Math.floor(Math.random() * 5 + 6);
  const steps = Math.floor(Math.random() * 34 + 18);
  const compactness = Math.random() * 0.55 + 0.35;

  const x = Math.random() * w;
  const y = Math.random() * h;
  const shape = generateMask(x, y, cellSize, steps, compactness);

  const EDGE_THRESHOLD = 28 + Math.random() * 38;
  const SHIFT = Math.random() < 0.5 ? 1 : 2;
  const strength = 0.35 + Math.random() * 0.45;

  const snap = new Uint8ClampedArray(data);

  for (const cell of shape) {
    for (let dy = 0; dy < cell.h; dy++) {
      const py = cell.y + dy;
      if (py <= 0 || py >= h - 1) continue;

      for (let dx = 0; dx < cell.w; dx++) {
        const px = cell.x + dx;
        if (px <= 0 || px >= w - 1) continue;

        const i = (py * w + px) * 4;
        const ir = i + 4;
        const id = i + w * 4;

        const dr =
          Math.abs(snap[i] - snap[ir]) +
          Math.abs(snap[i + 1] - snap[ir + 1]) +
          Math.abs(snap[i + 2] - snap[ir + 2]);

        const dd =
          Math.abs(snap[i] - snap[id]) +
          Math.abs(snap[i + 1] - snap[id + 1]) +
          Math.abs(snap[i + 2] - snap[id + 2]);

        const edge = Math.max(dr, dd);
        if (edge < EDGE_THRESHOLD) continue;

        const useRight = dr >= dd;
        const tx = px + (useRight ? SHIFT : 0);
        const ty = py + (useRight ? 0 : SHIFT);
        if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue;

        const ti = (ty * w + tx) * 4;

        data[ti] = lerp(snap[ti], snap[i], strength);
        data[ti + 1] = lerp(snap[ti + 1], snap[i + 1], strength);
        data[ti + 2] = lerp(snap[ti + 2], snap[i + 2], strength);
        data[ti + 3] = lerp(snap[ti + 3], snap[i + 3], strength);
      }
    }
  }

  return true;
}

/* ---------------- Temporal Echo ---------------- */

function storeEchoFrame(imgData) {
  echoStoreCounter++;
  if (echoStoreCounter % ECHO_STORE_EVERY !== 0) return;

  echoBuffer.push({
    w: master.width,
    h: master.height,
    data: new Uint8ClampedArray(imgData.data),
  });

  if (echoBuffer.length > ECHO_BUFFER_MAX) echoBuffer.shift();
}

function applyTemporalEcho(imgData) {
  if (echoBuffer.length < 3) return false;

  const w = master.width;
  const h = master.height;
  const data = imgData.data;

  const maxIdx = echoBuffer.length - 2;
  const pickIdx = Math.floor(Math.random() * maxIdx);
  const past = echoBuffer[pickIdx];
  if (!past || !past.data) return false;

  const rw = clamp(Math.floor(Math.random() * 240 + 90), 40, w);
  const rh = clamp(Math.floor(Math.random() * 240 + 90), 40, h);

  const x0 = Math.floor(Math.random() * Math.max(1, w - rw));
  const y0 = Math.floor(Math.random() * Math.max(1, h - rh));

  const feather = Math.floor(Math.random() * 28 + 12);
  const strength = 0.10 + Math.random() * 0.22;

  const offX = Math.floor(Math.random() * 9 - 4);
  const offY = Math.floor(Math.random() * 9 - 4);

  for (let oy = 0; oy < rh; oy++) {
    const y = y0 + oy;

    const topFade = feather > 0 ? clamp(oy / feather, 0, 1) : 1;
    const botFade = feather > 0 ? clamp((rh - 1 - oy) / feather, 0, 1) : 1;
    const fy = Math.min(topFade, botFade);

    for (let ox = 0; ox < rw; ox++) {
      const x = x0 + ox;

      const leftFade = feather > 0 ? clamp(ox / feather, 0, 1) : 1;
      const rightFade = feather > 0 ? clamp((rw - 1 - ox) / feather, 0, 1) : 1;
      const fx = Math.min(leftFade, rightFade);

      const a = strength * fx * fy;
      if (a <= 0.001) continue;

      const sx = clamp(x + offX, 0, w - 1);
      const sy = clamp(y + offY, 0, h - 1);

      const di = (y * w + x) * 4;
      const si = (sy * w + sx) * 4;

      data[di] = lerp(data[di], past.data[si], a);
      data[di + 1] = lerp(data[di + 1], past.data[si + 1], a);
      data[di + 2] = lerp(data[di + 2], past.data[si + 2], a);
    }
  }

  return true;
}

// ---------------- Morph ----------------

function applyMorph(agent, imgData) {
  const data = imgData.data;
  const original = new Uint8ClampedArray(data);
  const cellSize = 10;

  const shape = generateMask(
    agent.x,
    agent.y,
    cellSize,
    agent.formSize,
    agent.formCompactness
  );

  let zoomR = 0,
    zoomG = 0,
    zoomB = 0,
    zoomA = 255;
  if (agent.doPixelZoom && shape.length > 0) {
    const center = shape[(Math.random() * shape.length) | 0];
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

// ---------------- Distance metric ----------------

function initDistanceSampler() {
  const w = master.width;
  const h = master.height;
  const step = DIST_SAMPLE_STEP;

  const idx = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      idx.push((y * w + x) * 4);
    }
  }

  sampleIdx = new Uint32Array(idx);
  sampleCount = sampleIdx.length;
}

function computeDistanceFromOriginal(imgData) {
  if (!window.__ORIGINAL || !window.__ORIGINAL.data) return 0;
  if (!sampleIdx) initDistanceSampler();

  const data = imgData.data;
  const orig = window.__ORIGINAL.data;

  let sum = 0;

  const W_LUMA = 0.35;
  const W_COLOR = 0.65;

  for (let k = 0; k < sampleCount; k++) {
    const i = sampleIdx[k];

    const r1 = data[i],
      g1 = data[i + 1],
      b1 = data[i + 2];
    const r0 = orig[i],
      g0 = orig[i + 1],
      b0 = orig[i + 2];

    const y1 = (0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1) / 255;
    const y0 = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255;
    const dl = Math.abs(y1 - y0);

    const dr = r1 - r0;
    const dg = g1 - g0;
    const db = b1 - b0;
    const dc = Math.sqrt(dr * dr + dg * dg + db * db) / 441.67295593;

    sum += W_LUMA * dl + W_COLOR * dc;
  }

  return sum / sampleCount;
}

// ---------------- HUD / DONE ----------------

function setStatus(text, isDone = false) {
  if (!statusEl) return;
  statusEl.innerHTML = isDone ? `<span class="done">${text}</span>` : text;
}

function renderAgentHud(nowMs) {
  if (!hudEl) return;

  const pulse = nowMs < hudPulseUntil;

  const list = agents
    .slice(0, 10)
    .map((a) => a.label)
    .join(" · ");

  hudEl.innerHTML = `
    <div class="hud-inner">
      <span>Agents: ${agents.length}</span>
      <span> — ${list}</span>
      ${pulse ? ` <span class="pulse">— ${hudPulseText}</span>` : ``}
    </div>
  `;
}

function markDone(reason = "DIST") {
  if (done) return;
  done = true;

  if (window.DM?.stopAndPause) window.DM.stopAndPause();
  if (window.DM?.setToggleDone) window.DM.setToggleDone();

  const t = dreamTimeStr();
  const sleep = sleepStageFromTarget(distTarget);
  setStatus(`STATE: DONE | SLEEP MODE: ${sleep} | DREAM TIME: ${t}`, true);
}

// ---------------- Run reset ----------------

function resetRunStateIfNewImage() {
  if (window.__ORIGINAL && window.__ORIGINAL !== lastOriginalRef) {
    lastOriginalRef = window.__ORIGINAL;

    done = false;
    distEMA = 0;
    lastMetricMs = 0;

    sampleIdx = null;
    sampleCount = 0;

    distTarget =
      DIST_TARGET_MIN + Math.random() * (DIST_TARGET_MAX - DIST_TARGET_MIN);

    samplerCooldown = 0;
    randomColorCooldown = 0;
    edgeConfusionCooldown = 0;

    echoCooldown = 0;
    echoStoreCounter = 0;
    echoBuffer = [];

    hudPulseUntil = 0;
    hudPulseText = "";

    AGENT_ID = 0;

    const sleep = sleepStageFromTarget(distTarget);
    setStatus(
      `STATE: DREAMING | SLEEP MODE: ${sleep} | DREAMING: 000% | DREAM TIME: 00m00s`
    );
  }
}

// ---------------- Main loop ----------------

function animate() {
  if (!imageLoaded || paused) return;

  resetRunStateIfNewImage();
  if (done) return;

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

    // ---- SLOWER motion (NEW)
    agent.x += Math.cos(agent.angle) * agent.speed * TIME_SCALE;
    agent.y += Math.sin(agent.angle) * agent.speed * TIME_SCALE;

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

  // ---- Event agents: SourcePatch + RandomColor + EdgeConfusion + TemporalEcho

  let didPatch = false;
  if (samplerCooldown > 0.001) {
    samplerCooldown -= TIME_SCALE; 
  } else if (Math.random() < SAMPLER_CHANCE) {
    didPatch = applyOriginalPatchSampler(imgData);
    samplerCooldown = Math.floor(
      Math.random() * (SAMPLER_COOLDOWN_MAX - SAMPLER_COOLDOWN_MIN + 1) +
        SAMPLER_COOLDOWN_MIN
    );
  }
  if (didPatch) pulseHud("SOURCE PATCH");

  let didColor = false;
  if (randomColorCooldown > 0.001) {
    randomColorCooldown -= TIME_SCALE; 
  } else if (Math.random() < RANDOMCOLOR_CHANCE) {
    didColor = applyRandomColorBlob(imgData);
    randomColorCooldown = Math.floor(
      Math.random() *
        (RANDOMCOLOR_COOLDOWN_MAX - RANDOMCOLOR_COOLDOWN_MIN + 1) +
        RANDOMCOLOR_COOLDOWN_MIN
    );
  }
  if (didColor) pulseHud("RANDOM COLOR");

  let didEdge = false;
  if (edgeConfusionCooldown > 0.001) {
    edgeConfusionCooldown -= TIME_SCALE; 
  } else if (Math.random() < EDGE_CONFUSION_CHANCE) {
    didEdge = applyEdgeConfusion(imgData);
    edgeConfusionCooldown = Math.floor(
      Math.random() *
        (EDGE_CONFUSION_COOLDOWN_MAX - EDGE_CONFUSION_COOLDOWN_MIN + 1) +
        EDGE_CONFUSION_COOLDOWN_MIN
    );
  }
  if (didEdge) pulseHud("EDGE CONFUSION");

  let didEcho = false;
  if (echoCooldown > 0.001) {
    echoCooldown -= TIME_SCALE; 
  } else if (Math.random() < ECHO_CHANCE) {
    didEcho = applyTemporalEcho(imgData);
    echoCooldown = Math.floor(
      Math.random() * (ECHO_COOLDOWN_MAX - ECHO_COOLDOWN_MIN + 1) +
        ECHO_COOLDOWN_MIN
    );
  }
  if (didEcho) pulseHud("TEMPORAL ECHO");

  mctx.putImageData(imgData, 0, 0);

  storeEchoFrame(imgData);

  if (typeof window.renderPreview === "function") {
    window.renderPreview();
  }

  const now = performance.now();
  const elapsedMs = window.DM?.getElapsedMs ? window.DM.getElapsedMs() : 0;

  if (elapsedMs >= FAILSAFE_MAX_MS) {
    markDone("MAXTIME");
    return;
  }

  if (now - lastMetricMs >= METRIC_INTERVAL_MS) {
    lastMetricMs = now;

    const dist = computeDistanceFromOriginal(imgData);
    distEMA =
      distEMA === 0
        ? dist
        : distEMA * (1 - DIST_EMA_ALPHA) + dist * DIST_EMA_ALPHA;

    const target =
      distTarget ??
      DIST_TARGET_MIN + Math.random() * (DIST_TARGET_MAX - DIST_TARGET_MIN);
    distTarget = target;

    const progress = target > 0 ? Math.min(1, distEMA / target) : 0;
    const pct = pad3(Math.floor(progress * 100));

    const t = dreamTimeStr();
    const sleep = sleepStageFromTarget(distTarget);
    setStatus(
      `STATE: DREAMING | SLEEP MODE: ${sleep} | DREAMING: ${pct}% | DREAM TIME: ${t}`
    );

    if (elapsedMs >= MIN_RUNTIME_MS && distEMA >= target) {
      markDone("DIST");
      return;
    }
  }

  if (now - hudLastUpdate > HUD_INTERVAL_MS) {
    renderAgentHud(now);
    hudLastUpdate = now;
  }

  animationFrame = requestAnimationFrame(animate);
}

window.DM = window.DM || {};
window.DM.getSleepMode = () => sleepStageFromTarget(distTarget);

window.agents = agents;
