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

// --- DELADE GLOBALS 
var imageLoaded = false;
var paused = false;
var animationFrame = null;
var agents = [];

// Preview-mått 
var PREVIEW_CSS_W = 0;
var PREVIEW_CSS_H = 0;
var DPR = window.devicePixelRatio || 1;


const EXPORT_MAX = 3000;

let currentImg = null;

function stopAnimation(){
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
}


function setupMasterFromImage(img){
  const exportScale = Math.min(
    1,
    EXPORT_MAX / img.width,
    EXPORT_MAX / img.height
  );

  const mw = Math.floor(img.width * exportScale);
  const mh = Math.floor(img.height * exportScale);

  master.width = mw;
  master.height = mh;

  mctx.setTransform(1,0,0,1,0,0);
  mctx.clearRect(0,0,mw,mh);
  mctx.drawImage(img, 0, 0, mw, mh);
}


function fitPreviewToMaster(){
  const rect = canvasWrap.getBoundingClientRect();
  const availW = Math.max(1, Math.floor(rect.width));
  const availH = Math.max(1, Math.floor(rect.height));

  const mw = master.width;
  const mh = master.height;

  const scale = Math.min(availW / mw, availH / mh, 1);

  PREVIEW_CSS_W = Math.max(1, Math.floor(mw * scale));
  PREVIEW_CSS_H = Math.max(1, Math.floor(mh * scale));

  DPR = window.devicePixelRatio || 1;

  canvas.width  = Math.floor(PREVIEW_CSS_W * DPR);
  canvas.height = Math.floor(PREVIEW_CSS_H * DPR);

  canvas.style.width  = PREVIEW_CSS_W + "px";
  canvas.style.height = PREVIEW_CSS_H + "px";

  renderPreview();
}


function renderPreview(){
 
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(
    master,
    0, 0, master.width, master.height,
    0, 0, PREVIEW_CSS_W, PREVIEW_CSS_H
  );
}


window.renderPreview = renderPreview;

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
    toggleBtn.textContent = "Stop";
    agents.length = 0;

 
    setupMasterFromImage(img);
    fitPreviewToMaster();

    stopAnimation();
    animate(); 
  };

  img.src = URL.createObjectURL(file);
});

toggleBtn.addEventListener("click", () => {
  paused = !paused;
  toggleBtn.textContent = paused ? "Resume" : "Stop";
  if (!paused) animate();
});

saveBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "dream-machine.png";
  link.href = master.toDataURL("image/png"); 
  link.click();
});


window.addEventListener("resize", () => {
  if (imageLoaded && currentImg) {
    requestAnimationFrame(() => fitPreviewToMaster());
  }
});
