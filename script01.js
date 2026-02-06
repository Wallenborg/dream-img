const upload = document.getElementById("upload");

// Preview
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

// Master
const master = document.getElementById("master");
const mctx = master.getContext("2d", { willReadFrequently: true });

const startScreen = document.getElementById("start-screen");
const canvasWrap = document.getElementById("canvasWrap");
const controlsArea = document.getElementById("controlsArea");

const toggleBtn = document.getElementById("toggle");
const saveBtn = document.getElementById("save");

var imageLoaded = false;
var paused = false;
var animationFrame = null;
var agents = [];

var PREVIEW_CSS_W = 0;
var PREVIEW_CSS_H = 0;
var DPR = window.devicePixelRatio || 1;

const EXPORT_MAX = 3000;

let currentImg = null;

// --- PROCESS TIMER 
let processStartMs = null;
let pauseStartedMs = null;
let pausedAccumMs = 0;

function resetProcessTimer() {
  processStartMs = performance.now();
  pauseStartedMs = null;
  pausedAccumMs = 0;
}

function getProcessedElapsedMs() {
  if (!processStartMs) return 0;

  const now = performance.now();
  const activePausedMs =
    paused && pauseStartedMs ? (now - pauseStartedMs) : 0;

  return Math.max(0, (now - processStartMs) - (pausedAccumMs + activePausedMs));
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  return h > 0 ? `${h}h${mm}m${ss}s` : `${mm}m${ss}s`;
}

function stopAnimation() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function setupMasterFromImage(img) {
  const exportScale = Math.min(
    1,
    EXPORT_MAX / img.width,
    EXPORT_MAX / img.height
  );

  const mw = Math.floor(img.width * exportScale);
  const mh = Math.floor(img.height * exportScale);

  master.width = mw;
  master.height = mh;

  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, mw, mh);
  mctx.drawImage(img, 0, 0, mw, mh);
}

function fitPreviewToMaster() {
  const rect = canvasWrap.getBoundingClientRect();
  const availW = Math.max(1, Math.floor(rect.width));
  const availH = Math.max(1, Math.floor(rect.height));

  const mw = master.width;
  const mh = master.height;

  const scale = Math.min(availW / mw, availH / mh, 1);

  PREVIEW_CSS_W = Math.max(1, Math.floor(mw * scale));
  PREVIEW_CSS_H = Math.max(1, Math.floor(mh * scale));

  DPR = window.devicePixelRatio || 1;

  canvas.width = Math.floor(PREVIEW_CSS_W * DPR);
  canvas.height = Math.floor(PREVIEW_CSS_H * DPR);

  canvas.style.width = PREVIEW_CSS_W + "px";
  canvas.style.height = PREVIEW_CSS_H + "px";

  renderPreview();
}

function renderPreview() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(
    master,
    0, 0, master.width, master.height,
    0, 0, PREVIEW_CSS_W, PREVIEW_CSS_H
  );
}

window.renderPreview = renderPreview;

// ---- Expose helper API to script02
window.DM = {
  getElapsedMs: getProcessedElapsedMs,
  formatElapsed,
 
  stopAndPause: () => {
    if (!paused) {
      paused = true;
      pauseStartedMs = performance.now();
    }
    stopAnimation();
  },
  setToggleDone: () => {
    toggleBtn.textContent = "Done";
    toggleBtn.disabled = true;
  },
  saveDone: () => {
    const tag = formatElapsed(getProcessedElapsedMs());
    const link = document.createElement("a");
    link.download = `dream-machine_DONE_${tag}.png`;
    link.href = master.toDataURL("image/png");
    link.click();
  }
};

upload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    currentImg = img;

    if (startScreen) startScreen.style.display = "none";
    canvas.style.display = "block";
    controlsArea.style.display = "flex";

    imageLoaded = true;
    paused = false;
    toggleBtn.disabled = false;
    toggleBtn.textContent = "Stop";
    agents.length = 0;

    resetProcessTimer();

    setupMasterFromImage(img);

    // Freeze ORIGINAL buffer 
    window.__ORIGINAL = mctx.getImageData(0, 0, master.width, master.height);

    fitPreviewToMaster();

    stopAnimation();
    animate();
  };

  img.src = URL.createObjectURL(file);
});

toggleBtn.addEventListener("click", () => {
  paused = !paused;

  if (paused) {
    pauseStartedMs = performance.now();
  } else {
    if (pauseStartedMs) pausedAccumMs += (performance.now() - pauseStartedMs);
    pauseStartedMs = null;
  }

  toggleBtn.textContent = paused ? "Resume" : "Stop";
  if (!paused) animate();
});

saveBtn.addEventListener("click", () => {
  const tag = formatElapsed(getProcessedElapsedMs());
  const link = document.createElement("a");
  link.download = `dream-machine_${tag}.png`;
  link.href = master.toDataURL("image/png");
  link.click();
});

window.addEventListener("resize", () => {
  if (imageLoaded && currentImg) {
    requestAnimationFrame(() => fitPreviewToMaster());
  }
});

