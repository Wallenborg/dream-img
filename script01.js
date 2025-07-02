const upload = document.getElementById("upload");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const controls = document.getElementById("controls");
const toggleBtn = document.getElementById("toggle");
const resetBtn = document.getElementById("reset");
const saveBtn = document.getElementById("save");
const startScreen = document.getElementById("start-screen");
const liveTitle = document.getElementById("live-title");

let imageLoaded = false;
let paused = false;
let animationFrame;
const agents = [];

upload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
 img.onload = () => {
  const maxWidth = 1280;
  const maxHeight = window.innerHeight * 0.7;

  let width = img.width;
  let height = img.height;

  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const scale = Math.min(1, widthRatio, heightRatio);

  width = Math.floor(width * scale);
  height = Math.floor(height * scale);

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(img, 0, 0, width, height);

  imageLoaded = true;
  startScreen.style.display = "none";
  canvas.style.display = "block";
  controls.style.display = "flex";
  liveTitle.style.display = "block";
  animate();
};

  img.src = URL.createObjectURL(file);
});

toggleBtn.addEventListener("click", () => {
  paused = !paused;
  toggleBtn.textContent = paused ? "Resume" : "Stop";
  if (!paused) animate();
});

// resetBtn.addEventListener("click", () => {
//   window.location.reload();
// });

saveBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "dream-machine.png";
  link.href = canvas.toDataURL();
  link.click();
});