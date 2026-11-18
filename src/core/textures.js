// Procedural canvas textures — no external assets needed.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Tileable fractal value noise in [0,1].
export function tileFbm(size, seed, oct = 5, base = 4) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0, cells = base;
  for (let o = 0; o < oct && cells <= size; o++) {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells, y0 = Math.floor(fy), y1 = (y0 + 1) % cells;
      let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells, x0 = Math.floor(fx), x1 = (x0 + 1) % cells;
        let tx = fx - x0; tx = tx * tx * (3 - 2 * tx);
        const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
        out[y * size + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
    }
    tot += amp; amp *= 0.5; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

export function normalFromHeight(h, size, strength) {
  const c = canvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x + size - 1) % size, xr = (x + 1) % size, yu = (y + size - 1) % size, yd = (y + 1) % size;
    const dx = (h[y * size + xr] - h[y * size + xl]) * strength;
    const dy = (h[yd * size + x] - h[yu * size + x]) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    d[i] = ((-dx / l) * 0.5 + 0.5) * 255; d[i + 1] = ((dy / l) * 0.5 + 0.5) * 255; d[i + 2] = ((1 / l) * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c, false);
}
function heightOf(c) {
  const s = c.width, d = c.getContext('2d').getImageData(0, 0, s, s).data, h = new Float32Array(s * s);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  return h;
}
function speckle(g, S, rnd, n, a) {
  for (let i = 0; i < n; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${a * rnd()})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 2);
  }
}

function blocks(seed, rows, minW, maxW, baseRGB, vary, mortar, gap) {
  const S = 512, rnd = mulberry32(seed);
  const c = canvas(S, S), g = c.getContext('2d'), hc = canvas(S, S), hg = hc.getContext('2d');
  g.fillStyle = mortar; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const ws = []; let sum = 0;
    while (sum < S) { const w = minW + rnd() * (maxW - minW); ws.push(w); sum += w; }
    const k = S / sum, off = rnd() * 80;
    let x = -off;
    for (const w0 of ws) {
      const w = w0 * k, sh = 1 - vary * rnd(), warm = 0.96 + rnd() * 0.06;
      const col = `rgb(${(baseRGB[0] * sh * warm) | 0},${(baseRGB[1] * sh) | 0},${(baseRGB[2] * sh / warm) | 0})`;
      const hv = (170 + rnd() * 85) | 0;
      for (const xx of [x, x + S]) {
        g.fillStyle = col; g.fillRect(xx + gap, r * rh + gap, w - gap * 2, rh - gap * 2);
        const gr = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
        gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.10)');
        g.fillStyle = gr; g.fillRect(xx + gap, r * rh + gap, w - gap * 2, rh - gap * 2);
        hg.fillStyle = `rgb(${hv},${hv},${hv})`; hg.fillRect(xx + gap + 1, r * rh + gap + 1, w - gap * 2 - 2, rh - gap * 2 - 2);
      }
      x += w;
    }
  }
  speckle(g, S, rnd, 9000, 0.07);
  speckle(hg, S, rnd, 5000, 0.12);
  return { map: toTex(c), normal: normalFromHeight(heightOf(hc), S, 2.2) };
}

function marble(seed) {
  const S = 512, c = canvas(S, S), g = c.getContext('2d');
  const n = tileFbm(S, seed, 6, 3), v = tileFbm(S, seed + 7, 5, 2);
  const img = g.createImageData(S, S), d = img.data, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const vein = Math.max(0, 1 - Math.abs(v[i] - 0.5) * 38);
    const b = 0.9 + 0.1 * n[i] - vein * 0.13;
    d[i * 4] = 244 * b; d[i * 4 + 1] = 240 * b; d[i * 4 + 2] = 232 * b; d[i * 4 + 3] = 255;
    h[i] = 0.8 + n[i] * 0.08;
  }
  // ashlar joints
  for (let r = 0; r < 4; r++) for (let x = 0; x < S; x++) {
    for (let t = 0; t < 2; t++) { const i = (r * 128 + t) * S + x; d[i * 4] *= 0.8; d[i * 4 + 1] *= 0.8; d[i * 4 + 2] *= 0.8; h[i] = 0.3; }
  }
  for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
    const x = (k * 256 + (r % 2) * 128) % S;
    for (let y = r * 128; y < r * 128 + 128; y++) for (let t = 0; t < 2; t++) { const i = y * S + x + t; d[i * 4] *= 0.82; d[i * 4 + 1] *= 0.82; d[i * 4 + 2] *= 0.82; h[i] = 0.3; }
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normal: normalFromHeight(h, S, 2.0) };
}

function rock(seed) {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const n = tileFbm(S, seed, 6, 3), v = tileFbm(S, seed + 3, 5, 4), img = g.createImageData(S, S), d = img.data, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const crack = Math.max(0, 1 - Math.abs(v[i] - 0.5) * 22);
    const b = 0.62 + 0.5 * n[i] - crack * 0.3;
    d[i * 4] = 235 * b; d[i * 4 + 1] = 230 * b; d[i * 4 + 2] = 224 * b; d[i * 4 + 3] = 255;
    h[i] = n[i] - crack * 0.25;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normal: normalFromHeight(h, S, 5) };
}

function facade(cols, rows, seed) {
  const S = 512, rnd = mulberry32(seed);
  const c = canvas(S, S), g = c.getContext('2d'), e = canvas(S, S), eg = e.getContext('2d');
  g.fillStyle = '#f5f0e7'; g.fillRect(0, 0, S, S);
  speckle(g, S, rnd, 7000, 0.05);
  let gr = g.createLinearGradient(0, S * 0.7, 0, S);
  gr.addColorStop(0, 'rgba(70,58,44,0)'); gr.addColorStop(1, 'rgba(70,58,44,0.38)');
  g.fillStyle = gr; g.fillRect(0, S * 0.7, S, S * 0.3);
  gr = g.createLinearGradient(0, 0, 0, S * 0.1);
  gr.addColorStop(0, 'rgba(40,34,28,0.45)'); gr.addColorStop(1, 'rgba(40,34,28,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S * 0.1);
  // vertical edge shading (fake corner AO)
  for (const [a, b] of [[0, 0.06], [1, 0.94]]) {
    gr = g.createLinearGradient(a * S, 0, b * S, 0);
    gr.addColorStop(0, 'rgba(40,34,28,0.22)'); gr.addColorStop(1, 'rgba(40,34,28,0)');
    g.fillStyle = gr; g.fillRect(Math.min(a, b) * S, 0, S * 0.06, S);
  }
  eg.fillStyle = '#000'; eg.fillRect(0, 0, S, S);
  const cw = S / cols, ch = S / rows;
  for (let r = 1; r < rows; r++) { g.fillStyle = 'rgba(120,108,92,0.4)'; g.fillRect(0, S - r * ch - 3, S, 5); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, S - r * ch - 5, S, 2); }
  const shutter = ['#2f6f73', '#3b5d8a', '#587a48', '#8a4b3b', '#34506b'][Math.floor(rnd() * 5)];
  const doorCol = Math.floor(cols / 2);
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const cx = q * cw + cw / 2, top = S - (r + 1) * ch;
    if (r === 0 && q === doorCol) {
      const w = cw * 0.44, h = ch * 0.74, x = cx - w / 2, y = S - h;
      g.fillStyle = '#d6cdbb'; g.beginPath(); g.rect(x - 6, y + w / 2, w + 12, h - w / 2); g.arc(cx, y + w / 2, w / 2 + 6, Math.PI, 0); g.fill();
      g.fillStyle = '#4b3423'; g.beginPath(); g.rect(x, y + w / 2, w, h - w / 2); g.arc(cx, y + w / 2, w / 2, Math.PI, 0); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, y + 4); g.lineTo(cx, S); g.stroke();
      continue;
    }
    const ww = cw * 0.34, wh = ch * 0.52, x = cx - ww / 2, y = top + ch * 0.22;
    g.fillStyle = '#ddd5c4'; g.fillRect(x - 5, y - 5, ww + 10, wh + 10);
    g.fillStyle = '#1e2c3a'; g.fillRect(x, y, ww, wh);
    gr = g.createLinearGradient(x, y, x + ww, y + wh); gr.addColorStop(0, 'rgba(160,190,220,0.35)'); gr.addColorStop(0.5, 'rgba(160,190,220,0)');
    g.fillStyle = gr; g.fillRect(x, y, ww, wh);
    g.fillStyle = '#ddd5c4'; g.fillRect(cx - 1.5, y, 3, wh); g.fillRect(x, y + wh * 0.45, ww, 3);
    g.fillStyle = '#b9b09d'; g.fillRect(x - 9, y + wh + 4, ww + 18, 6);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 9, y + wh + 10, ww + 18, 5);
    const sw = ww * 0.44;
    for (const sx of [x - sw - 6, x + ww + 6]) {
      g.fillStyle = shutter; g.fillRect(sx, y - 2, sw, wh + 4);
      g.fillStyle = 'rgba(0,0,0,0.22)'; for (let k = 0; k < wh; k += 7) g.fillRect(sx, y + k, sw, 2);
    }
    gr = eg.createLinearGradient(0, y, 0, y + wh); gr.addColorStop(0, '#ffd28a'); gr.addColorStop(1, '#ff9c47');
    eg.fillStyle = gr; eg.fillRect(x, y, ww, wh);
    eg.fillStyle = '#000'; eg.fillRect(cx - 1.5, y, 3, wh); eg.fillRect(x, y + wh * 0.45, ww, 3);
  }
  const map = toTex(c), em = toTex(e);
  map.wrapS = map.wrapT = em.wrapS = em.wrapT = THREE.ClampToEdgeWrapping;
  return { map, emissive: em };
}

function roofTiles(seed) {
  const S = 256, rnd = mulberry32(seed), c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#8f8880'; g.fillRect(0, 0, S, S);
  const rows = 8, cols = 8, tw = S / cols, th = S / rows;
  for (let r = 0; r < rows; r++) for (let q = -1; q < cols; q++) {
    const x = q * tw + (r % 2) * tw * 0.5, y = r * th, b = 215 + rnd() * 40;
    const gr = g.createLinearGradient(x, 0, x + tw, 0);
    gr.addColorStop(0, `rgb(${b * 0.8},${b * 0.78},${b * 0.76})`); gr.addColorStop(0.5, `rgb(${b},${b * 0.98},${b * 0.95})`); gr.addColorStop(1, `rgb(${b * 0.8},${b * 0.78},${b * 0.76})`);
    g.fillStyle = gr; g.fillRect(x, y, tw, th);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + th - 3, tw, 3);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, tw, 2);
  }
  speckle(g, S, rnd, 2500, 0.08);
  return { map: toTex(c), normal: normalFromHeight(heightOf(c), S, 3.0) };
}

function wood(seed) {
  const S = 256, rnd = mulberry32(seed), c = canvas(S, S), g = c.getContext('2d');
  for (let p = 0; p < 8; p++) {
    const b = 0.8 + rnd() * 0.3;
    g.fillStyle = `rgb(${118 * b},${82 * b},${52 * b})`; g.fillRect(p * 32, 0, 32, S);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(p * 32, 0, 2, S);
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(40,24,10,${0.1 + rnd() * 0.15})`; g.fillRect(p * 32 + 3 + rnd() * 26, 0, 1, S); }
  }
  return toTex(c);
}

function puff() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const n = tileFbm(S, 91, 4, 4), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x / S - 0.5, dy = y / S - 0.5, r = Math.hypot(dx, dy) * 2;
    let a = Math.max(0, 1 - r); a = a * a * (3 - 2 * a) * (0.55 + 0.75 * n[y * S + x]);
    const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

function noiseRGB() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const a = tileFbm(S, 5, 6, 4), b = tileFbm(S, 6, 6, 8), q = tileFbm(S, 7, 5, 2), img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { d[i * 4] = a[i] * 255; d[i * 4 + 1] = b[i] * 255; d[i * 4 + 2] = q[i] * 255; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return toTex(c, false);
}

export function buildTextures() {
  const T = {};
  T.masonry = blocks(101, 8, 90, 170, [232, 222, 204], 0.2, '#9a9080', 2);
  T.paving = blocks(202, 7, 55, 120, [222, 211, 192], 0.15, '#b0a48e', 1.5);
  T.marble = marble(303);
  T.rock = rock(404);
  T.facadeA = facade(3, 2, 11);
  T.facadeB = facade(4, 3, 22);
  T.facadeC = facade(2, 5, 33);
  T.roof = roofTiles(505);
  T.wood = wood(606);
  T.puff = puff();
  T.noise = noiseRGB();
  T.groundNormal = normalFromHeight(tileFbm(256, 77, 6, 4), 256, 9);
  T.waterNormal = normalFromHeight(tileFbm(256, 88, 5, 3), 256, 7);
  return T;
}
