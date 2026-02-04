// script01.js (upload + layout-fit + UI)
const upload = document.getElementById("upload");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const startScreen = document.getElementById("start-screen");
const canvasWrap = document.getElementById("canvasWrap");

const controlsArea = document.getElementById("controlsArea");
const toggleBtn = document.getElementById("toggle");
const saveBtn = document.getElementById("save");

let imageLoaded = false;
let paused = false;
let animationFrame = null;

const agents = []; // used by script02.js
let currentImg = null; // keep original image for resize refit

function stopAnimation(){
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function fitAndDraw(img){
  const rect = canvasWrap.getBoundingClientRect();
  const availW = Math.floor(rect.width);
  const availH = Math.floor(rect.height);

  const scale = Math.min(availW / img.width, availH / img.height, 1); // never upscale
  const cssW = Math.floor(img.width * scale);
  const cssH = Math.floor(img.height * scale);

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);

  canvas.style.width  = cssW + "px";
  canvas.style.height = cssH + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.drawImage(img, 0, 0, cssW, cssH);
}

upload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    currentImg = img;

    // Show stage elements so measurements are correct
    if (startScreen) startScreen.style.display = "none";
    canvas.style.display = "block";
    controlsArea.style.display = "flex";

    // Reset sim state
    imageLoaded = true;
    paused = false;
    toggleBtn.textContent = "Stop";
    agents.length = 0;

    // Fit and draw
    fitAndDraw(img);

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
  link.href = canvas.toDataURL();
  link.click();
});

// Auto-refit on resize (keeps “never bigger than screen” promise)
window.addEventListener("resize", () => {
  if (currentImg && imageLoaded) {
    requestAnimationFrame(() => fitAndDraw(currentImg));
  }
});
