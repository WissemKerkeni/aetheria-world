// Trees, rocks, grass and wildflowers — all instanced, wind-animated in the vertex shader.
import * as THREE from 'three';
import { mulberry32, fbm } from '../core/noise.js';
import { M } from '../core/materials.js';
import { mergeAll } from './kit.js';
import { height, normalY, cityDist, TAU, FLATS, LIGHTHOUSE } from './heightfield.js';

function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function jitter(geo, amt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const kx = Math.round(x * 50), ky = Math.round(y * 50), kz = Math.round(z * 50);
    p.setXYZ(i, x + (hash3(kx, ky, kz) - 0.5) * amt, y + (hash3(ky, kz, kx) - 0.5) * amt * 0.6, z + (hash3(kz, kx, ky) - 0.5) * amt);
  }
  geo.computeVertexNormals();
  return geo;
}
function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const trunkCol = new THREE.Color('#4a3524');
const grad = (lo, hi, y0, y1) => { const a = new THREE.Color(lo), b = new THREE.Color(hi); return (x, y, z, c) => { const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0))); const r = Math.min(1, Math.hypot(x, z) * 0.4); c.copy(a).lerp(b, t * (0.55 + 0.45 * r)); }; };

function cypressGeo() {
  const H = 11, pts = [];
  for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push(new THREE.Vector2(1.25 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.9) + 0.02, 1.0 + t * H)); }
  const fol = paint(jitter(new THREE.LatheGeometry(pts, 7), 0.28), grad('#12240f', '#33561f', 1, 12));
  const tr = paint(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 5).translate(0, 0.7, 0), (x, y, z, c) => c.copy(trunkCol));
  return mergeAll([fol, tr]);
}
function pineGeo() {
  const parts = [[2.7, 4.4, 3.4], [2.1, 4.0, 5.9], [1.4, 3.6, 8.3]].map(([r, h, y]) => new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0));
  const fol = parts.map((g) => paint(jitter(g, 0.35), grad('#0d2014', '#2b5329', 1.5, 10)));
  const tr = paint(new THREE.CylinderGeometry(0.22, 0.34, 3, 4, 1, true).translate(0, 1.5, 0), (x, y, z, c) => c.copy(trunkCol));
  return mergeAll([...fol, tr]);
}
function broadleafGeo() {
  const blobs = [[2.7, 0, 5.2, 0], [2.0, 1.6, 4.3, 0.6], [1.9, -1.3, 4.5, -0.9], [1.6, 0.3, 6.6, 0.5]].map(([r, x, y, z], i) => new THREE.IcosahedronGeometry(r, i === 0 ? 1 : 0).translate(x, y, z));
  const fol = blobs.map((g) => paint(jitter(g, 0.5), grad('#2c4217', '#7b9440', 2.5, 8)));
  const tr = paint(new THREE.CylinderGeometry(0.28, 0.45, 3.6, 5, 1, true).translate(0, 1.8, 0), (x, y, z, c) => c.copy(trunkCol));
  return mergeAll([...fol, tr]);
}
function grassGeo(R) {
  const pos = [], col = [], nor = [];
  for (let b = 0; b < 6; b++) {
    const a = R() * TAU, lean = 0.15 + R() * 0.35, h = 0.55 + R() * 0.5, w = 0.07, ox = (R() - 0.5) * 0.35, oz = (R() - 0.5) * 0.35;
    const px = Math.cos(a + 1.57) * w, pz = Math.sin(a + 1.57) * w;
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(a) * lean, h, oz + Math.sin(a) * lean);
    col.push(0.05, 0.1, 0.025, 0.05, 0.1, 0.025, 0.42, 0.5, 0.14);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
function flowerGeo(R) {
  const pos = [], nor = [];
  for (let b = 0; b < 5; b++) {
    const x = (R() - 0.5) * 0.7, z = (R() - 0.5) * 0.7, y = 0.3 + R() * 0.3, s = 0.07;
    pos.push(x - s, y, z, x + s, y, z, x, y + s * 0.5, z + s * 1.4, x - s, y, z, x, y + s * 0.5, z - s * 1.4, x + s, y, z);
    for (let k = 0; k < 6; k++) nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export function registerVegetation(kit) {
  const R = mulberry32(99);
  kit.proto('cypress', cypressGeo(), M.foliage);
  const pg = pineGeo();
  kit.proto('pine', pg, M.foliage);
  kit.proto('pineFar', pg, M.foliage, { cast: false });
  kit.proto('broadleaf', broadleafGeo(), M.foliage);
  kit.proto('rock', jitter(new THREE.DodecahedronGeometry(1, 0), 0.4), M.rock);
  kit.proto('grass', grassGeo(R), M.grass, { cast: false, layer: 1 });
  kit.proto('flower', flowerGeo(R), M.flower, { cast: false, layer: 1 });
}

const TINTS = ['#ffffff', '#e9f2d8', '#d9e6c4', '#fff2d2', '#cfe0c0'].map((h) => new THREE.Color(h));
const BLOOMS = ['#ffffff', '#ffd84a', '#e9508a', '#9a6cff', '#ff7b3a', '#fff3a0'].map((h) => new THREE.Color(h).multiplyScalar(1.3));

export function scatterVegetation(kit, quality) {
  const R = mulberry32(31337);
  const free = (x, z) => {
    for (const f of FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r * 1.05) return false;
    if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 40) return false;
    if (Math.abs(x) < 215 && z > 312 && z < 440) return false;
    return true;
  };
  const tint = () => TINTS[Math.floor(R() * TINTS.length)];
  // forests
  let pines = 0, leaves = 0, rocks = 0;
  for (let i = 0; i < 90000 && (pines < 7500 || leaves < 2600); i++) {
    const x = -1300 + R() * 2600, z = -1500 + R() * 2150;
    const d = cityDist(x, z); if (d < 372) continue;
    const h = height(x, z); if (h < 4.5 || h > 250) continue;
    if (!free(x, z)) continue;
    const ny = normalY(x, z);
    const forest = fbm(x * 0.0045 + 11, z * 0.0045 - 7, 3);
    if (ny > 0.9 && h < 70 && forest > 0.02 && forest < 0.5 && leaves < 2600 && R() < 0.5) {
      const s = 0.7 + R() * 0.7;
      kit.place('broadleaf', x, h - 0.3, z, R() * TAU, s, s * (0.85 + R() * 0.3), s, tint()); leaves++;
    } else if (ny > 0.6 && pines < 7500 && (forest > -0.12 || h > 60) && R() < 0.35 + Math.min(0.5, h / 200)) {
      const s = 0.8 + R() * 0.9;
      kit.place(d > 640 ? 'pineFar' : 'pine', x, h - 0.4, z, R() * TAU, s, s * (0.9 + R() * 0.5), s, tint()); pines++;
    }
  }
  // boulders on steep ground and the shoreline
  for (let i = 0; i < 60000 && rocks < 1600; i++) {
    const x = -1300 + R() * 2600, z = -1500 + R() * 2150;
    if (cityDist(x, z) < 365 || !free(x, z)) continue;
    const h = height(x, z); if (h < -2) continue;
    const ny = normalY(x, z);
    if ((ny < 0.72 && R() < 0.6) || (h < 2.5 && R() < 0.5)) {
      const s = 1 + R() * R() * 7;
      kit.place('rock', x, h - s * 0.3, z, R() * 6, s, s * (0.5 + R() * 0.6), s * (0.7 + R() * 0.6)); rocks++;
    }
  }
  // meadows around the city
  const GR = quality === 'low' ? 18000 : 60000, FL = quality === 'low' ? 3000 : 9000;
  let gr = 0, fl = 0;
  for (let i = 0; i < 600000 && gr < GR; i++) {
    const a = R() * TAU, rr = 360 + R() * R() * 420;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (!free(x, z)) continue;
    const h = height(x, z); if (h < 5 || h > 110) continue;
    const patch = fbm(x * 0.012, z * 0.012, 2);
    if (patch < -0.05) continue;
    if (normalY(x, z) < 0.82) continue;
    const s = 1.1 + R() * 1.6;
    kit.place('grass', x, h - 0.05, z, R() * TAU, s, s * (0.8 + R() * 0.7), s); gr++;
    if (fl < FL && patch > 0.25 && R() < 0.4) { kit.place('flower', x + R(), h, z + R(), R() * TAU, 1.6 + R(), 1.4 + R(), 1.6 + R(), BLOOMS[Math.floor(R() * BLOOMS.length)]); fl++; }
  }
  return { pines, leaves, rocks, gr };
}
