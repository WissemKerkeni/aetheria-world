// Single source of truth for the shape of the world: every placement samples this.
import { noise, fbm, ridged } from '../core/noise.js';

export const TAU = Math.PI * 2;
export const LEVEL_R = [340, 290, 240, 195, 150, 110, 72]; // outer edge of each terrace (warped units)
export const LEVEL_H = [10, 24, 40, 56, 72, 90, 108];     // terrace elevations
export const RISER = 2.5;
export const STAIRS = Array.from({ length: 8 }, (_, k) => Math.PI / 2 + (k * Math.PI) / 4);
export const CASCADE_A = Math.PI / 2 - Math.PI / 8;
export const TEMPLE_A = Math.PI / 2 + 0.42;
export const FLATS = [{ x: 500, z: 40, r: 85, h: 14 }];
export const ISLES = [
  { x: -430, y: 250, z: 330, r: 62, seed: 11 },
  { x: 470, y: 300, z: 210, r: 48, seed: 23 },
  { x: -250, y: 370, z: -330, r: 75, seed: 37 },
  { x: 300, y: 410, z: -480, r: 55, seed: 41 },
  { x: 90, y: 330, z: 760, r: 40, seed: 53 },
  { x: -720, y: 290, z: -60, r: 50, seed: 67 },
  { x: 700, y: 360, z: -250, r: 44, seed: 79 },
];
export const LIGHTHOUSE = { x: 255, z: 478 };

export const sm = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function warp(th) {
  return 1 + 0.08 * Math.sin(3 * th + 0.6) + 0.04 * Math.sin(5 * th + 2.1) + 0.02 * Math.sin(9 * th);
}
export function cityDist(x, z) {
  const r = Math.hypot(x, z);
  return r < 1e-6 ? 0 : r / warp(Math.atan2(z, x));
}
export function cityXZ(d, th) {
  const r = d * warp(th);
  return [Math.cos(th) * r, Math.sin(th) * r];
}
// Local frame on the warped ring: position, tangent, outward normal, yaw facing outward.
export function frame(d, th) {
  const [x, z] = cityXZ(d, th);
  const a = cityXZ(d, th - 1e-3), b = cityXZ(d, th + 1e-3);
  let tx = b[0] - a[0], tz = b[1] - a[1];
  const arc = Math.hypot(tx, tz) / 2e-3; // |dp/dθ|
  const l = Math.hypot(tx, tz); tx /= l; tz /= l;
  const nx = tz, nz = -tx;
  return { x, z, tx, tz, nx, nz, ry: Math.atan2(nx, nz), arc };
}
export function cityProfile(d) {
  let h = LEVEL_H[0];
  for (let i = 1; i < 7; i++) h += (LEVEL_H[i] - LEVEL_H[i - 1]) * sm(LEVEL_R[i] + RISER, LEVEL_R[i] - RISER, d);
  return h;
}

function natural(x, z) {
  const dz = z + 350;
  const d = Math.hypot(x, dz);
  const n1 = fbm(x * 0.0012 + 3.1, z * 0.0012 - 1.7, 3);
  const e = 1 - d / (820 + n1 * 170);
  const shore = sm(-0.06, 0.07, e);
  let h = lerp(-38, 5, shore) + Math.max(e, 0) * 42;
  h += fbm(x * 0.004, z * 0.004, 4) * 15 * shore;
  h += noise(x * 0.02, z * 0.02) * 1.2 * shore;
  const mm = sm(-270, -760, z) * sm(0.04, 0.34, e);
  if (mm > 0) {
    const rg = ridged(x * 0.00125 + 5, z * 0.00125 + 9, 4);
    const massif = 0.5 + 0.5 * fbm(x * 0.0009 - 4, z * 0.0009 + 2, 2);
    h += mm * (Math.pow(rg, 1.25) * (300 + 230 * massif) + 45 * massif + fbm(x * 0.009, z * 0.009, 3) * 16);
  }
  // harbor bay
  const bx = (x - 10) / 195, bz = (z - 455) / 122;
  const bay = Math.exp(-(bx * bx + bz * bz));
  h = lerp(h, -12, sm(0.3, 0.72, bay));
  // lighthouse islet
  const dl = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
  h = Math.max(h, 4.5 * (1 - sm(14, 30, dl)) - 30 * sm(14, 44, dl));
  for (const f of FLATS) {
    const df = Math.hypot(x - f.x, z - f.z);
    h = lerp(h, f.h, sm(f.r * 1.6, f.r, df));
  }
  return h;
}

export function height(x, z) {
  const d = cityDist(x, z);
  const cm = sm(430, 345, d);
  if (cm >= 1) return cityProfile(d);
  const n = natural(x, z);
  let h = cm <= 0 ? n : lerp(n, cityProfile(d), cm);
  // harbor cut: the ground steps down from the sea gate to the quay
  const ax = Math.abs(x);
  if (ax < 205 && z > 312 && z < 420) {
    const w = sm(205, 165, ax) * sm(312, 321, z);
    h = lerp(h, Math.min(h, lerp(10.5, -8, sm(318, 350, z))), w);
  }
  return h;
}

// Height used by the coarse terrain grid: tucked safely beneath the crisp city mesh.
export function terrainMeshHeight(x, z) {
  const d = cityDist(x, z);
  if (d >= 352) return height(x, z);
  const under = cityProfile(d + 11) - 4;
  return lerp(under, height(x, z), sm(344, 352, d));
}

export function normalY(x, z) {
  const e = 2.5;
  const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
  const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
  return 1 / Math.sqrt(1 + gx * gx + gz * gz);
}

export function angDist(a, b) {
  let d = (((a - b) % TAU) + TAU) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d;
}
