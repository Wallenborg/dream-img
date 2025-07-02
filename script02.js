const MAX_AGENTS = 20;

function createAgent() {
  const agent = {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
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

function randomizeMood(agent) {
  agent.driftX = Math.floor(Math.random() * 9 - 4);
  agent.driftY = Math.floor(Math.random() * 9 - 4);
  agent.formSize = Math.floor(Math.random() * 80 + 10);
  agent.formCompactness = Math.random();
  agent.doColor = Math.random() < 0.8;
  agent.doDrift = Math.random() < 0.6;
  agent.doPixelZoom = Math.random() < 0.1;
  agent.nextMoodChange = Math.floor(Math.random() * 200 + 100);
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

    if (px < 0 || py < 0 || px + cellSize > canvas.width || py + cellSize > canvas.height) continue;

    shape.push({ x: px, y: py, w: cellSize, h: cellSize });

    const dirs = [[1,0], [-1,0], [0,1], [0,-1]].sort(() => Math.random() - 0.5);
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
  const shape = generateMask(agent.x, agent.y, cellSize, agent.formSize, agent.formCompactness);

  let zoomR = 0, zoomG = 0, zoomB = 0, zoomA = 255;
  if (agent.doPixelZoom && shape.length > 0) {
    const center = shape[Math.floor(Math.random() * shape.length)];
    const cx = center.x;
    const cy = center.y;
    const i = (cy * canvas.width + cx) * 4;
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

        if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;

        const i = (sy * canvas.width + sx) * 4;
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

        if (agent.doDrift && tx >= 0 && ty >= 0 && tx < canvas.width && ty < canvas.height) {
          const ti = (ty * canvas.width + tx) * 4;
          r = original[ti];
          g = original[ti + 1];
          b = original[ti + 2];
          a = original[ti + 3];
        }

        data[i]     = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      }
    }
  });
}

function animate() {
  if (!imageLoaded || paused) return;

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (agents.length < MAX_AGENTS && Math.random() < 0.1) {
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

    if (Math.random() < 0.2) {
      agent.angle += (Math.random() - 0.5) * 0.3;
    }
    if (Math.random() < 0.005) {
      agent.angle = Math.random() * Math.PI * 2;
    }

    agent.x += Math.cos(agent.angle) * agent.speed;
    agent.y += Math.sin(agent.angle) * agent.speed;

    if (agent.x < 0 || agent.x > canvas.width) agent.angle = Math.PI - agent.angle;
    if (agent.y < 0 || agent.y > canvas.height) agent.angle = -agent.angle;

    if (agent.age > agent.lifeSpan && agents.length > 1) {
      agents.splice(i, 1);
    } else if (agents.length === 1 && agent.age > agent.lifeSpan) {
      // Keep one slow dream-agent alive
      agent.age = 0;
      agent.lifeSpan = Math.floor(Math.random() * 600 + 300);
      agent.speed = 0.2;
      agent.formCompactness = 0.9;
      agent.formSize = 50;
      agent.doColor = true;
      agent.doDrift = false;
      agent.doPixelZoom = false;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  animationFrame = requestAnimationFrame(animate);
}