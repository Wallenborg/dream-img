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
    // Låt bilden vara så stor som möjligt utan att förstoras.
    // Höj maxWidth om du vill tillåta ännu större canvas (t.ex. 6000).
    const maxWidth  = Math.max(window.innerWidth, 3000);
    const maxHeight = Math.floor(window.innerHeight * 0.9);

    let width = img.width;
    let height = img.height;

    // Skala NER bara om bilden är större än viewport-gränserna.
    const widthRatio  = maxWidth  / width;
    const heightRatio = maxHeight / height;
    const scale = Math.min(1, widthRatio, heightRatio); // aldrig >1 (ingen uppskalning)

    const cssWidth  = Math.floor(width  * scale);
    const cssHeight = Math.floor(height * scale);

    // HiDPI-uppritning
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.floor(cssWidth  * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    // Sätt visuell (CSS) storlek så den inte blir “för stor” på skärmen
    canvas.style.width  = cssWidth + "px";
    canvas.style.height = cssHeight + "px";

    // Rensa och skala kontexten till DPR
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Rita bilden i CSS-storlek (intern pixeltäthet = dpr)
    ctx.drawImage(img, 0, 0, cssWidth, cssHeight);

    imageLoaded = true;
    if (startScreen) startScreen.style.display = "none";
    canvas.style.display = "block";
    if (controls) controls.style.display = "flex";
    if (liveTitle) liveTitle.style.display = "block";

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