// The terraced city: crisp terrace mesh, stairways, walls, ~1500 houses,
// civic domes, bell towers, lamps, awnings, banners and the grand cascade.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { LEVEL_R, LEVEL_H, RISER, STAIRS, CASCADE_A, TEMPLE_A, TAU, cityXZ, frame, warp, height, angDist } from './heightfield.js';

const C = (h) => new THREE.Color(h);
const WALLS = ['#fdf9f0', '#f7ecd6', '#f4dec4', '#efdbad', '#f3d8d0', '#e2ecf3', '#ffffff', '#f6e4c9'].map(C);
const ROOFS = ['#c8603a', '#b5502f', '#d47a45', '#a84a30', '#bf6a43'].map(C);
const ROOF_BLUE = ['#2c5cab', '#3a74c6', '#274f96'].map(C);
const AWN = ['#b3312d', '#2c5aa0', '#e0a52e', '#2e7d6b', '#efe6cf', '#8e3b78'].map(C);
const FLAGS = ['#b3262b', '#1f4fa3', '#e2a92d', '#f1ead6'].map(C);
const DOME = { gold: C('#ffc65c'), azure: C('#2f66c4'), copper: C('#58b8a4'), white: C('#f4efe6') };

const nearStair = (th, rr, w) => STAIRS.some((s) => angDist(th, s) * rr < w);
const nearCascade = (th, rr, w) => angDist(th, CASCADE_A) * rr < w;

function polarBand(dIn, dOut, yIn, yOut, NS = 360) {
  const pos = new Float32Array(NS * 18);
  let o = 0;
  const pt = (d, th, yf) => { const [x, z] = cityXZ(d, th); return [x, typeof yf === 'function' ? yf(x, z) : yf, z]; };
  for (let j = 0; j < NS; j++) {
    const t0 = (j / NS) * TAU, t1 = ((j + 1) / NS) * TAU;
    const A = pt(dIn, t0, yIn), B = pt(dOut, t0, yOut), Cc = pt(dIn, t1, yIn), D = pt(dOut, t1, yOut);
    for (const v of [A, Cc, B, Cc, D, B]) { pos[o++] = v[0]; pos[o++] = v[1]; pos[o++] = v[2]; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function buildBase(kit) {
  for (let i = 6; i >= 0; i--) {
    const inner = i === 6 ? 0 : LEVEL_R[i + 1] + RISER;
    const outer = i === 0 ? 345 : LEVEL_R[i] - RISER;
    kit.addStatic('paving', polarBand(inner, outer, LEVEL_H[i], LEVEL_H[i]));
    if (i > 0) kit.addStatic('stone', polarBand(LEVEL_R[i] - RISER, LEVEL_R[i] + RISER, LEVEL_H[i], LEVEL_H[i - 1]));
  }
  // apron road around the walls, tucking under the terrain
  kit.addStatic('paving', polarBand(345, 350, LEVEL_H[0], (x, z) => height(x, z)));
  kit.addStatic('paving', polarBand(350, 357, (x, z) => height(x, z), (x, z) => height(x, z) - 3));
}

export function stair(kit, dTop, th, yTop, yBot, width, run = 0.8, base = yBot) {
  const f = frame(dTop, th), rise = yTop - yBot, n = Math.max(2, Math.round(rise / 0.55)), sh = rise / n;
  for (let k = 0; k < n; k++) {
    const o = (k + 0.5) * run;
    kit.place('boxStone', f.x + f.nx * o, base, f.z + f.nz * o, f.ry, width, yBot - base + rise - k * sh, run * 1.02);
  }
  // cheek walls
  for (const s of [-1, 1]) {
    const ox = f.tx * s * (width / 2 + 0.4), oz = f.tz * s * (width / 2 + 0.4);
    for (let k = 0; k < n; k += 3) {
      const o = (k + 1.5) * run;
      kit.place('boxMarble', f.x + f.nx * o + ox, base, f.z + f.nz * o + oz, f.ry, 0.8, yBot - base + rise - k * sh + 1.0, run * 3.05);
    }
  }
  return n * run;
}

function ring(kit, proto, d, y, h, thick, segLen, skip, each) {
  const n = Math.ceil((TAU * d) / segLen);
  for (let j = 0; j < n; j++) {
    const th = ((j + 0.5) / n) * TAU, f = frame(d, th);
    if (skip && skip(th, f.arc)) continue;
    kit.place(proto, f.x, y, f.z, f.ry, (f.arc * TAU) / n * 1.03, h, thick);
    if (each) each(j, th, f);
  }
}

function house(kit, R, f, y, level, type, extra = {}) {
  const whiteBias = 0.25 + level * 0.1;
  const wall = R() < whiteBias ? WALLS[R() < 0.5 ? 0 : 6] : WALLS[Math.floor(R() * WALLS.length)];
  const roof = level >= 4 && R() < 0.55 ? ROOF_BLUE[Math.floor(R() * 3)] : ROOFS[Math.floor(R() * ROOFS.length)];
  let w, h, d, rh, rp;
  if (type === 'A') { w = extra.w ?? 8 + R() * 3; h = 6.2 + R() * 1.4; d = 7 + R() * 2; rh = w * 0.3; rp = 'roofPyr'; }
  else if (type === 'B') { w = extra.w ?? 9 + R() * 3; h = 9.4 + R() * 1.8; d = 8 + R() * 2; rh = d * 0.36; rp = 'roofGable'; }
  else { w = extra.w ?? 5.6 + R() * 1.2; h = 15 + R() * 6; d = w; rh = w * 0.75; rp = 'roofPyr'; }
  kit.place('house' + type, f.x, y - 0.4, f.z, f.ry, w, h + 0.4, d, wall);
  kit.place(rp, f.x, y + h, f.z, f.ry, w * 1.14, rh, d * 1.14, roof);
  // eave band
  kit.place('boxMarble', f.x, y + h - 0.25, f.z, f.ry, w * 1.06, 0.3, d * 1.06);
  if (extra.awning && type !== 'C' && R() < 0.42) {
    const o = d / 2 + 0.75;
    kit.place('awning', f.x + f.nx * o, y + 2.9, f.z + f.nz * o, f.ry, w * (0.45 + R() * 0.3), 1, 1.7, AWN[Math.floor(R() * AWN.length)], 0.32);
  }
  if (type === 'C' && R() < 0.5) {
    kit.place('flagPole', f.x, y + h + rh, f.z, 0, 1, 4.5, 1);
    kit.place('flag', f.x, y + h + rh + 3.6, f.z, R() * TAU, 1, 1, 1, FLAGS[Math.floor(R() * FLAGS.length)]);
  }
  return w;
}

function civic(kit, R, f, y) {
  const w = 15, h = 10.5, kind = R();
  const col = kind < 0.4 ? DOME.azure : kind < 0.75 ? DOME.gold : DOME.copper;
  kit.place('boxMarble', f.x, y - 0.4, f.z, f.ry, w, h + 0.4, w);
  kit.place('boxMarble', f.x, y + h, f.z, f.ry, w + 1.2, 0.7, w + 1.2);
  kit.place('cylMarble', f.x, y + h + 0.7, f.z, 0, 5.6, 3.2, 5.6);
  kit.place('dome', f.x, y + h + 3.9, f.z, 0, 5.9, 5.4, 5.9, col);
  kit.place('goldBall', f.x, y + h + 9.6, f.z, 0, 0.5);
  // portico
  for (let k = -2; k <= 2; k++) {
    const ox = f.tx * k * 3 + f.nx * (w / 2 + 1.6), oz = f.tz * k * 3 + f.nz * (w / 2 + 1.6);
    kit.place('column', f.x + ox, y, f.z + oz, 0, 0.75, 0.82, 0.75);
  }
  kit.place('boxMarble', f.x + f.nx * (w / 2 + 1.2), y + 8.2, f.z + f.nz * (w / 2 + 1.2), f.ry, w, 1.3, 3.6);
  kit.place('boxDark', f.x + f.nx * (w / 2 + 0.05), y, f.z + f.nz * (w / 2 + 0.05), f.ry, 3, 5.5, 0.2);
  return w;
}

function campanile(kit, R, f, y) {
  const w = 5.4, h = 26 + R() * 8;
  kit.place('houseC', f.x, y - 0.4, f.z, f.ry, w, h, w, WALLS[Math.floor(R() * 3)]);
  kit.place('boxMarble', f.x, y + h - 0.4, f.z, f.ry, w + 0.9, 0.6, w + 0.9);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    kit.place('boxMarble', f.x + (f.tx * sx + f.nx * sz) * (w / 2 - 0.4), y + h, f.z + (f.tz * sx + f.nz * sz) * (w / 2 - 0.4), f.ry, 0.7, 4.2, 0.7);
  }
  kit.place('lampGlow', f.x, y + h + 2, f.z, 0, 2.2);
  kit.place('boxMarble', f.x, y + h + 4.2, f.z, f.ry, w + 0.9, 0.6, w + 0.9);
  kit.place('roofPyr', f.x, y + h + 4.8, f.z, f.ry, w + 1.2, 6.5, w + 1.2, R() < 0.5 ? ROOF_BLUE[0] : ROOFS[0]);
  kit.place('goldBall', f.x, y + h + 11.6, f.z, 0, 0.45);
  return w;
}

export function buildCity(kit) {
  const R = mulberry32(2024);
  buildBase(kit);

  // --- stairways on eight radial avenues
  for (let i = 1; i < 7; i++) for (const th of STAIRS) stair(kit, LEVEL_R[i] - RISER, th, LEVEL_H[i], LEVEL_H[i - 1], i >= 5 ? 13 : 9.5);

  // --- buttresses give the retaining walls rhythm and catch the low sun
  for (let i = 1; i < 7; i++) {
    const d = LEVEL_R[i] + 1.1, n = Math.floor((TAU * d) / 11), rise = LEVEL_H[i] - LEVEL_H[i - 1];
    for (let j = 0; j < n; j++) {
      const th = ((j + 0.5) / n) * TAU, f = frame(d, th);
      if (nearStair(th, f.arc, 9) || nearCascade(th, f.arc, 6)) continue;
      kit.place('boxStone', f.x, LEVEL_H[i - 1], f.z, f.ry, 1.7, rise - 0.6, 2.7);
      kit.place('boxMarble', f.x, LEVEL_H[i - 1] + rise - 0.6, f.z, f.ry, 2.1, 0.45, 3.0);
    }
  }

  // --- parapets, lamps, cypresses along every promenade
  for (let i = 1; i < 7; i++) {
    const d = LEVEL_R[i] - RISER - 0.7, y = LEVEL_H[i];
    ring(kit, 'boxMarble', d, y, 1.05, 0.5, 3.4, (th, rr) => nearStair(th, rr, i >= 5 ? 7.5 : 5.8) || nearCascade(th, rr, 4.2),
      (j, th, f) => { if (j % 3 === 0) kit.place('boxMarble', f.x, y, f.z, f.ry, 0.75, 1.45, 0.75); });
    const dl = d - 2.6, n = Math.floor((TAU * dl) / 13);
    for (let j = 0; j < n; j++) {
      const th = (j / n) * TAU, f = frame(dl, th);
      if (nearStair(th, f.arc, 7) || nearCascade(th, f.arc, 6)) continue;
      if (i === 5 && angDist(th, TEMPLE_A) * f.arc < 26) continue;
      if (j % 2 === 0) {
        kit.place('lampPost', f.x, y, f.z);
        kit.place('lampGlow', f.x, y + 4.4, f.z);
        kit.pools.push([f.x - f.nx * 1.5, y + 0.12, f.z - f.nz * 1.5, 13]);
      } else if (i !== 6 || j % 4 === 1) {
        kit.place('cypress', f.x - f.nx * 0.6, y, f.z - f.nz * 0.6, R() * TAU, 0.75 + R() * 0.3, 0.8 + R() * 0.5, 0.75 + R() * 0.3);
      }
    }
  }

  // --- outer city wall with battlements and towers
  const WD = 340, WY = 3, WH = 17;
  const gateSkip = (th, rr) => angDist(th, Math.PI / 2) * rr < 6.5;
  ring(kit, 'boxStone', WD, WY, WH, 3.6, 4.2, gateSkip, (j, th, f) => {
    kit.place('boxStone', f.x + f.nx * 1.3, WY + WH, f.z + f.nz * 1.3, f.ry, 1.9, 1.5, 0.9);
    if (j % 2 === 0) kit.place('boxStone', f.x - f.nx * 1.5, WY + WH, f.z - f.nz * 1.5, f.ry, 4.3, 0.5, 0.5);
  });
  for (let k = 0; k < 24; k++) {
    const th = (k / 24) * TAU + 0.13, f = frame(WD + 1, th);
    if (angDist(th, Math.PI / 2) * f.arc < 24) continue;
    const big = k % 3 === 0, r = big ? 7.2 : 5.6, h = big ? 30 : 24;
    kit.place('cylStone', f.x, WY - 2, f.z, 0, r, h, r);
    kit.place('cylStone', f.x, WY - 2 + h, f.z, 0, r + 0.7, 1.6, r + 0.7);
    kit.place('coneRoof', f.x, WY - 0.4 + h, f.z, 0, r + 1.1, big ? 11 : 8, r + 1.1, big ? ROOF_BLUE[0] : ROOFS[1]);
    kit.place('goldBall', f.x, WY - 0.4 + h + (big ? 11 : 8), f.z, 0, 0.5);
    if (big) {
      kit.place('flagPole', f.x, WY + h + 10.5, f.z, 0, 1, 6, 1);
      kit.place('flag', f.x, WY + h + 15.6, f.z, R() * TAU, 1.5, 1.5, 1, FLAGS[k % FLAGS.length]);
      kit.place('lampGlow', f.x + f.nx * (r + 0.8), WY + h - 5, f.z + f.nz * (r + 0.8), 0, 1.2);
    }
  }
  // sea gate
  {
    const f = frame(WD, Math.PI / 2);
    for (const s of [-1, 1]) {
      const x = f.x + f.tx * s * 11, z = f.z + f.tz * s * 11;
      kit.place('boxStone', x, WY - 2, z, f.ry, 9, 31, 9);
      kit.place('boxStone', x, WY + 29, z, f.ry, 10.4, 1.4, 10.4);
      kit.place('roofPyr', x, WY + 30.4, z, f.ry, 11, 8, 11, ROOF_BLUE[0]);
      kit.place('flagPole', x, WY + 38, z, 0, 1, 6, 1);
      kit.place('flag', x, WY + 43, z, 0.6, 1.6, 1.6, 1, FLAGS[0]);
      kit.place('lampGlow', x + f.nx * 5, WY + 12, z + f.nz * 5, 0, 1.4);
    }
    kit.place('arch', f.x, WY + 7, f.z, f.ry, 1.2, 1.5, 1.2);
    kit.place('boxStone', f.x, WY + 20.5, f.z, f.ry, 14, 4, 4.4);
    stair(kit, WD + 3, Math.PI / 2, LEVEL_H[0], 2.6, 14, 1.75, -6);
  }

  // --- houses
  const rows = [
    [0, [300, 316], true], [1, [250, 265], true], [2, [205, 219], true], [3, [160, 174], true], [4, [121, 134], false], [5, [82], false],
  ];
  let slot = 0;
  for (const [level, ds] of rows) {
    const y = LEVEL_H[level];
    ds.forEach((d, ri) => {
      const outerRow = ri === ds.length - 1;
      let th = R() * 0.1;
      while (th < TAU - 0.01) {
        const f = frame(d, th);
        const stairW = level >= 4 ? 13 : 11;
        const blocked = nearStair(th, f.arc, stairW) || nearCascade(th, f.arc, 9.5) ||
          (level === 5 && angDist(th, TEMPLE_A) * f.arc < 34) ||
          (level === 0 && angDist(th, Math.PI / 2) * f.arc < 15) ||
          (level === 4 && ri === 1 && R() < 0.45);
        if (blocked) { th += 4 / f.arc; continue; }
        slot++;
        let w;
        const r = R();
        if (r < 0.06) { // little square with a tree
          w = 8;
          kit.place(R() < 0.5 ? 'broadleaf' : 'cypress', f.x, y, f.z, R() * TAU, 0.8 + R() * 0.3);
        } else if (ri === 0 && level >= 1 && level <= 4 && slot % 19 === 0) {
          w = civic(kit, R, f, y);
        } else if (level >= 1 && slot % 23 === 7) {
          w = campanile(kit, R, f, y);
        } else {
          const tp = R();
          const type = level === 5 ? (tp < 0.7 ? 'B' : 'A') : tp < 0.12 ? 'C' : tp < 0.55 + (ri === 0 ? 0.15 : 0) ? 'B' : 'A';
          w = house(kit, R, f, y, level, type, { awning: outerRow });
        }
        th += (w + 1.0 + R() * 2.2) / f.arc;
      }
    });
  }

  // --- acropolis gardens: hedged cypress ring + obelisks are added by Landmarks
  for (let k = 0; k < 40; k++) {
    const th = (k / 40) * TAU, f = frame(56, th);
    if (nearStair(th, f.arc, 8)) continue;
    kit.place(k % 2 ? 'cypress' : 'broadleaf', f.x, LEVEL_H[6], f.z, R() * TAU, k % 2 ? 0.9 : 0.6, k % 2 ? 1.1 : 0.6, k % 2 ? 0.9 : 0.6);
  }

  buildCascade(kit);
}

// A stream that falls terrace to terrace from the acropolis down to a basin by the wall.
function buildCascade(kit) {
  const th = CASCADE_A;
  // source basin on the acropolis
  const fs = frame(60, th);
  kit.place('cylMarble', fs.x, LEVEL_H[6], fs.z, 0, 6.5, 0.9, 6.5);
  kit.place('cylPool', fs.x, LEVEL_H[6] + 0.55, fs.z, 0, 5.7, 0.45, 5.7);
  kit.place('cylMarble', fs.x, LEVEL_H[6], fs.z, 0, 1.1, 3.4, 1.1);
  kit.place('goldBall', fs.x, LEVEL_H[6] + 3.9, fs.z, 0, 0.8);
  for (let i = 6; i >= 1; i--) {
    const yT = LEVEL_H[i], yB = LEVEL_H[i - 1];
    const fTop = frame(LEVEL_R[i] - RISER, th), fBot = frame(LEVEL_R[i] + RISER, th);
    const hw = 3.2;
    const p = (f, s, y, o) => [f.x + f.tx * s * hw + f.nx * o, y, f.z + f.tz * s * hw + f.nz * o];
    kit.falls.push({ a: p(fTop, -1, yT + 0.2, 0.3), b: p(fTop, 1, yT + 0.2, 0.3), c: p(fBot, 1, yB + 0.2, 0.9), d: p(fBot, -1, yB + 0.2, 0.9), fade: 0 });
    kit.puffs.push({ x: fBot.x + fBot.nx * 2, y: yB + 2, z: fBot.z + fBot.nz * 2, s: 9, mist: 1 });
    // channel on the upper terrace feeding this fall
    const dA = i === 6 ? 62 : LEVEL_R[i + 1] + RISER + 5.5, dB = LEVEL_R[i] - RISER + 0.4;
    const A = cityXZ(dA, th), B = cityXZ(dB, th);
    kit.beam('boxPool', A[0], A[1], B[0], B[1], yT, 5, 0.22);
    for (const s of [-1, 1]) {
      kit.beam('boxMarble', A[0] + fTop.tx * s * 2.9, A[1] + fTop.tz * s * 2.9, B[0] + fTop.tx * s * 2.9, B[1] + fTop.tz * s * 2.9, yT, 0.7, 0.55);
    }
    // footbridge where the promenade crosses
    const fb = frame(LEVEL_R[i] - RISER - 5, th);
    kit.place('boxMarble', fb.x, yT + 0.35, fb.z, fb.ry, 8, 0.35, 5);
    // plunge pool below
    const fp = frame(LEVEL_R[i] + RISER + 3, th);
    kit.place('cylMarble', fp.x, yB, fp.z, 0, 5.2, 0.7, 5.2);
    kit.place('cylPool', fp.x, yB + 0.4, fp.z, 0, 4.5, 0.42, 4.5);
  }
  // final run to a basin near the wall
  const A = cityXZ(LEVEL_R[1] + RISER + 5.5, th), B = cityXZ(322, th), f = frame(326, th);
  kit.beam('boxPool', A[0], A[1], B[0], B[1], LEVEL_H[0], 5, 0.22);
  kit.place('cylMarble', f.x, LEVEL_H[0], f.z, 0, 8, 0.9, 8);
  kit.place('cylPool', f.x, LEVEL_H[0] + 0.55, f.z, 0, 7.2, 0.45, 7.2);
}
