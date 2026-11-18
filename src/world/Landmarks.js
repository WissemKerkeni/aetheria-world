// Hero architecture. Static parts go through the Kit; animated parts are real objects.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { M, G } from '../core/materials.js';
import { box, cyl, tf, mat4 } from './kit.js';
import { gableGeometry } from './protos.js';
import { beamMaterial } from './fx.js';
import { LEVEL_H, LEVEL_R, TEMPLE_A, TAU, frame, cityXZ, height, LIGHTHOUSE, FLATS } from './heightfield.js';

const C = (h) => new THREE.Color(h);
export const HEART = new THREE.Vector3(0, 198, 0);

function pantheon(ctx) {
  const { kit, scene, dyn } = ctx, g = kit.group(), Y = LEVEL_H[6];
  g.add('marble', cyl(49, 49, 1, 72)).add('marble', tf(cyl(46, 46, 1, 72), 0, 1, 0)).add('marble', tf(cyl(43, 43, 1, 72), 0, 2, 0));
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * TAU + TAU / 64;
    g.place('column', Math.cos(a) * 39, 3, Math.sin(a) * 39, 0, 1.55, 1.6, 1.55);
  }
  g.add('marble', tf(cyl(30.5, 30.5, 16, 64), 0, 3, 0));
  // doors on the four axes
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 2;
    g.add('dark', tf(box(7, 11, 1.2), Math.cos(a) * 30.3, 3, Math.sin(a) * 30.3, Math.PI / 2 - a));
    g.add('gold', tf(box(8.4, 0.7, 1.6), Math.cos(a) * 30.4, 14, Math.sin(a) * 30.4, Math.PI / 2 - a));
  }
  g.add('marble', tf(cyl(41.5, 41.5, 2.4, 72), 0, 19, 0));
  g.add('gold', tf(cyl(42.2, 42.2, 0.5, 72), 0, 21.4, 0));
  g.add('marble', tf(cyl(42.6, 41.5, 0.9, 72), 0, 21.9, 0));
  g.add('marble', tf(cyl(31.5, 32.5, 6.5, 64), 0, 22.8, 0));
  g.add('gold', tf(cyl(32.4, 32.4, 0.6, 64), 0, 29.3, 0));
  const dome = new THREE.SphereGeometry(31.5, 64, 24, 0, TAU, 0.16, Math.PI / 2 - 0.16).scale(1, 0.82, 1);
  g.add('gold', tf(dome, 0, 29.9, 0));
  // ribs
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    const rib = new THREE.TorusGeometry(31.7, 0.42, 5, 20, Math.PI / 2 - 0.2).scale(1, 0.82, 1);
    g.add('marble', tf(rib, 0, 29.9, 0, -a));
  }
  g.add('marble', tf(new THREE.TorusGeometry(5.2, 0.9, 8, 32).rotateX(Math.PI / 2), 0, 29.9 + 31.5 * 0.82 * Math.cos(0.16), 0));
  const W = g.emit(0, Y, 0);

  // four spires
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4, f = frame(62, a);
    kit.place('boxMarble', f.x, Y, f.z, f.ry, 6.4, 3, 6.4);
    kit.place('obelisk', f.x, Y + 3, f.z, f.ry, 2.5, 44, 2.5);
    kit.place('goldCap', f.x, Y + 47, f.z, f.ry, 1.5, 4, 1.5);
    kit.place('lampGlow', f.x, Y + 52, f.z, 0, 2.4);
  }

  // The Heart: a hovering aether crystal with armillary rings and a sky beam.
  const heart = new THREE.Group(); heart.position.copy(HEART);
  const hm = M.crystal.clone(); hm.onBeforeCompile = M.crystal.onBeforeCompile; hm.customProgramCacheKey = M.crystal.customProgramCacheKey;
  hm.emissiveIntensity = 3;
  const cr = new THREE.Mesh(new THREE.OctahedronGeometry(7, 0).scale(1, 1.75, 1), hm); cr.castShadow = true;
  heart.add(cr);
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(15 + k * 3.4, 0.36, 8, 72), M.gold);
    r.rotation.set(k * 1.1, k * 0.7, 0); r.castShadow = true; heart.add(r); rings.push(r);
  }
  const beamMat = beamMaterial('#59dcff', 0.5, 0.6);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 5.5, 900, 20, 1, true).translate(0, 450 - 40, 0), beamMat);
  beam.userData.noAO = true; heart.add(beam);
  const light = new THREE.PointLight('#58dcff', 0, 420, 1.6); heart.add(light);
  scene.add(heart);
  const state = { pulseT: -1 };
  dyn.push((t, dt) => {
    cr.rotation.y = t * 0.35; cr.position.y = Math.sin(t * 0.8) * 1.6;
    rings[0].rotation.x = t * 0.31; rings[0].rotation.y = t * 0.17;
    rings[1].rotation.x = 1.1 - t * 0.23; rings[1].rotation.z = t * 0.29;
    rings[2].rotation.y = 0.7 + t * 0.19; rings[2].rotation.z = -t * 0.21;
    const night = G.uNight.value;
    let boost = 0;
    if (state.pulseT >= 0) {
      state.pulseT += dt;
      const u = state.pulseT / 7;
      G.uPulse.value.set(u * 1400, Math.max(0, 1 - u) * 2.2);
      boost = Math.max(0, 1 - state.pulseT / 2.5) * 6;
      if (u >= 1) { state.pulseT = -1; G.uPulse.value.set(-1000, 0); }
    }
    hm.emissiveIntensity = 2.2 + night * 2.5 + Math.sin(t * 2.1) * 0.4 + boost;
    beamMat.uniforms.uOpacity.value = 0.08 + night * 0.5 + boost * 0.25;
    light.intensity = night * 650 + boost * 2600;
  });
  return { W, object: heart, pulse() { state.pulseT = 0; } };
}

function sunTemple(ctx) {
  const { kit } = ctx, g = kit.group(), f = frame(91, TEMPLE_A), L = 40, W = 20;
  for (let k = 0; k < 3; k++) g.add('marble', tf(box(L + 5 - k * 1.6, 0.7, W + 5 - k * 1.6), 0, k * 0.7, 0));
  const y0 = 2.1, ch = 1.1;
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) g.place('column', -L / 2 + 1.4 + i * ((L - 2.8) / 11), y0, s * (W / 2 - 1.3), 0, 1.15, ch, 1.15);
  for (let i = 1; i < 5; i++) for (const s of [-1, 1]) g.place('column', s * (L / 2 - 1.4), y0, -W / 2 + 1.3 + i * ((W - 2.6) / 5), 0, 1.15, ch, 1.15);
  g.add('marble', tf(box(L - 12, 11, W - 8), 0, y0, 0));
  g.add('dark', tf(box(0.6, 7.5, 4), L / 2 - 5.8, y0, 0));
  g.add('marble', tf(box(L, 1.9, W), 0, y0 + 11, 0));
  g.add('gold', tf(box(L + 0.5, 0.35, W + 0.5), 0, y0 + 12.9, 0));
  const roof = gableGeometry().rotateY(Math.PI / 2); // ridge along local x after the next rotate
  roof.rotateY(Math.PI / 2);
  g.add('roofTri', tf(roof, 0, y0 + 13.25, 0, 0, 0, 0, L + 1.6, 5, W + 1.6));
  for (const s of [-1, 1]) g.add('gold', tf(new THREE.SphereGeometry(0.9, 10, 8), s * (L / 2 + 0.6), y0 + 18.6, 0));
  // brazier
  g.add('marble', tf(cyl(1.2, 1.6, 2.4, 12), L / 2 + 7, 0, 0));
  g.add('bronze', tf(cyl(2.2, 1.2, 1, 12), L / 2 + 7, 2.4, 0));
  g.place('lampGlow', L / 2 + 7, 4.2, 0, 0, 3.4);
  g.emit(f.x, LEVEL_H[5], f.z, f.ry);
  return { x: f.x, y: LEVEL_H[5], z: f.z };
}

function amphitheatre(ctx) {
  const { kit } = ctx, F = FLATS[0], a = 66, b = 52, N = 34, Y = F.h;
  for (let tier = 0; tier < 3; tier++) {
    for (let k = 0; k < N; k++) {
      const p = (k / N) * TAU, p2 = ((k + 1) / N) * TAU;
      const x1 = F.x + Math.cos(p) * a, z1 = F.z + Math.sin(p) * b, x2 = F.x + Math.cos(p2) * a, z2 = F.z + Math.sin(p2) * b;
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, len = Math.hypot(x2 - x1, z2 - z1);
      const nx = (z2 - z1) / len, nz = -(x2 - x1) / len;
      kit.place('arch', mx, Y + tier * 9.4, mz, Math.atan2(nx, nz), (len / 12) * 1.03, 1, 1.1);
      if (tier === 2) kit.place('boxStone', mx, Y + 28.2, mz, Math.atan2(nx, nz), len * 1.03, 4.2, 3.4);
    }
  }
  // seating bowl
  const pts = [];
  for (let s = 0; s <= 14; s++) { const r = 0.44 + (s / 14) * 0.5; pts.push(new THREE.Vector2(r, 1 + s * 1.75)); pts.push(new THREE.Vector2(r + 0.5 / 14, 1 + s * 1.75)); }
  pts.push(new THREE.Vector2(0.985, 26)); pts.push(new THREE.Vector2(0.985, 0));
  const bowl = new THREE.LatheGeometry(pts, 64).scale(a, 1, b);
  bowl.computeVertexNormals();
  const m = M.stone.clone(); m.onBeforeCompile = M.stone.onBeforeCompile; m.customProgramCacheKey = M.stone.customProgramCacheKey; m.side = THREE.DoubleSide;
  M.stoneDS = m;
  kit.addStatic('stoneDS', tf(bowl, F.x, Y, F.z));
  kit.addStatic('sand', tf(cyl(0.45, 0.45, 1.2, 48).scale(a, 1, b), F.x, Y, F.z));
  // approach road + flags
  for (let k = 0; k < 8; k++) {
    const p = (k / 8) * TAU, x = F.x + Math.cos(p) * (a + 0.5), z = F.z + Math.sin(p) * (b + 0.5);
    kit.place('flagPole', x, Y + 32, z, 0, 1, 7, 1);
    kit.place('flag', x, Y + 37.6, z, p, 1.6, 1.6, 1, C(k % 2 ? '#b3262b' : '#e2a92d'));
  }
  return { x: F.x, y: Y, z: F.z };
}

function aqueduct(ctx) {
  const { kit } = ctx, th = -Math.PI / 2 - 0.22, TOP = 75.5;
  const f0 = frame(LEVEL_R[4] + 1, th);
  const dirx = f0.nx, dirz = f0.nz, ry = Math.atan2(dirx, dirz) + Math.PI / 2; // arch local x along the run
  const span = 12;
  let k = 0, last = [f0.x, f0.z];
  for (; k < 60; k++) {
    const cx = f0.x + dirx * (k + 0.5) * span, cz = f0.z + dirz * (k + 0.5) * span;
    const px = f0.x + dirx * k * span, pz = f0.z + dirz * k * span;
    const g = Math.min(height(px, pz), height(cx, cz));
    if (g > TOP - 4 && k > 3) break;
    kit.place('arch', cx, TOP - 10.5, cz, ry, 1, 1, 1.15);
    for (let yy = TOP - 30; yy > g + 12; yy -= 19.5) kit.place('arch', cx, yy, cz, ry, 1, 1, 1.05);
    const gp = height(px, pz) - 2;
    if (TOP - 10.5 > gp) kit.place('boxStone', px, gp, pz, ry, 4.1, TOP - 10.5 - gp, 5);
    last = [cx + dirx * span / 2, cz + dirz * span / 2];
  }
  const len = Math.hypot(last[0] - f0.x, last[1] - f0.z);
  kit.beam('boxStone', f0.x - dirx * 4, f0.z - dirz * 4, last[0], last[1], TOP - 1.5, 6, 1.5);
  kit.beam('boxPool', f0.x - dirx * 4, f0.z - dirz * 4, last[0], last[1], TOP, 3.4, 0.22);
  for (const s of [-1, 1]) {
    const ox = dirz * s * 2.5, oz = -dirx * s * 2.5;
    kit.beam('boxStone', f0.x - dirx * 4 + ox, f0.z - dirz * 4 + oz, last[0] + ox, last[1] + oz, TOP, 0.9, 0.9);
  }
  // spout into a basin on terrace 4
  const fb = frame(LEVEL_R[4] - 9, th);
  kit.place('cylMarble', fb.x, LEVEL_H[4], fb.z, 0, 7, 0.9, 7);
  kit.place('cylPool', fb.x, LEVEL_H[4] + 0.55, fb.z, 0, 6.2, 0.45, 6.2);
  const e = [f0.x - dirx * 4.2, f0.z - dirz * 4.2];
  const tx = dirz, tz = -dirx;
  kit.falls.push({ a: [e[0] - tx * 1.5, TOP + 0.1, e[1] - tz * 1.5], b: [e[0] + tx * 1.5, TOP + 0.1, e[1] + tz * 1.5],
    c: [fb.x + tx * 1.5, LEVEL_H[4] + 0.6, fb.z + tz * 1.5], d: [fb.x - tx * 1.5, LEVEL_H[4] + 0.6, fb.z - tz * 1.5], fade: 0 });
  const mid = [f0.x + dirx * len * 0.5, f0.z + dirz * len * 0.5];
  return { x: mid[0], y: TOP, z: mid[1], dirx, dirz };
}

function lighthouse(ctx) {
  const { kit, scene, dyn } = ctx, g = kit.group(), R = mulberry32(5);
  g.add('stone', cyl(15, 17, 5, 32));
  g.add('stone', tf(box(13, 12, 13), 0, 5, 0));
  g.add('marble', tf(box(14.4, 1, 14.4), 0, 17, 0));
  g.add('marble', tf(cyl(4.4, 6, 30, 8), 0, 18, 0, Math.PI / 8));
  g.add('marble', tf(cyl(6, 5, 1.2, 8), 0, 48, 0, Math.PI / 8));
  g.add('stone', tf(cyl(3.3, 3.8, 8, 16), 0, 49.2, 0));
  g.add('marble', tf(cyl(5, 4.2, 0.9, 16), 0, 57.2, 0));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; g.add('bronze', tf(cyl(0.16, 0.16, 5, 5), Math.cos(a) * 2.9, 58.1, Math.sin(a) * 2.9)); }
  g.add('glassWarm', tf(cyl(2.3, 2.3, 4.6, 12), 0, 58.3, 0));
  g.add('copper', tf(new THREE.ConeGeometry(4.4, 4.6, 16).translate(0, 2.3, 0), 0, 63.1, 0));
  g.add('gold', tf(new THREE.SphereGeometry(0.7, 10, 8), 0, 68.2, 0));
  g.add('dark', tf(box(2.6, 4.6, 0.4), 0, 5, 6.6));
  const y = Math.max(height(LIGHTHOUSE.x, LIGHTHOUSE.z), 1) - 1.5;
  g.emit(LIGHTHOUSE.x, y, LIGHTHOUSE.z, 0.4);
  for (let k = 0; k < 14; k++) {
    const a = R() * TAU, r = 16 + R() * 9;
    kit.place('rock', LIGHTHOUSE.x + Math.cos(a) * r, -1 + R() * 2, LIGHTHOUSE.z + Math.sin(a) * r, R() * 6, 2 + R() * 3, 1.5 + R() * 2.5, 2 + R() * 3);
  }
  const lamp = new THREE.Group(); lamp.position.set(LIGHTHOUSE.x, y + 60.6, LIGHTHOUSE.z);
  const mat = beamMaterial('#ffd99a', 0, 1.3);
  const cone = new THREE.ConeGeometry(26, 520, 24, 1, true).translate(0, -260, 0).rotateX(-Math.PI / 2);
  const b1 = new THREE.Mesh(cone, mat), b2 = new THREE.Mesh(cone, mat); b2.rotation.y = Math.PI;
  b1.userData.noAO = b2.userData.noAO = true;
  lamp.add(b1, b2); lamp.rotation.z = 0.02;
  scene.add(lamp);
  const st = { on: true };
  dyn.push((t) => { lamp.rotation.y = t * 0.35; mat.uniforms.uOpacity.value = st.on ? G.uNight.value * 0.55 : 0; lamp.visible = mat.uniforms.uOpacity.value > 0.003; });
  return { x: LIGHTHOUSE.x, y: y + 40, z: LIGHTHOUSE.z, toggle() { st.on = !st.on; return st.on; } };
}

function harbor(ctx) {
  const { kit } = ctx, R = mulberry32(77), QY = 2.6;
  kit.place('boxStone', 0, -12, 356, 0, 336, 12 + QY - 0.3, 24);
  kit.place('boxPaving', 0, QY - 0.3, 356, 0, 337, 0.3, 24.6);
  // bollards + lamps along the quay edge
  for (let x = -160; x <= 160; x += 10) {
    kit.place('cylStone', x, QY, 367, 0, 0.45, 1.0, 0.45);
    if (x % 20 === 0) { kit.place('lampPost', x + 3, QY, 366.5); kit.place('lampGlow', x + 3, QY + 4.4, 366.5); kit.pools.push([x + 3, QY + 0.1, 365, 13]); }
  }
  // warehouses
  const fr = (x, z) => ({ x, z, nx: 0, nz: 1, tx: -1, tz: 0, ry: 0 });
  for (let x = -156; x < 160;) {
    const w = 10 + R() * 5;
    if (Math.abs(x + w / 2) > 13) {
      const f = fr(x + w / 2, 350), h = 7 + R() * 3, d = 9;
      kit.place('houseB', f.x, QY - 0.3, f.z, 0, w, h, d, C(['#f1e2c6', '#e9d3b0', '#f4ece0', '#e6c9a8'][Math.floor(R() * 4)]));
      kit.place('roofGable', f.x, QY - 0.3 + h, f.z, 0, w * 1.1, 3.6, d * 1.14, C(['#b5502f', '#c8603a', '#a84a30'][Math.floor(R() * 3)]));
      if (R() < 0.6) kit.place('awning', f.x, QY + 2.9, f.z + d / 2 + 0.8, 0, w * 0.6, 1, 1.8, C(['#b3312d', '#2c5aa0', '#e0a52e', '#efe6cf'][Math.floor(R() * 4)]), 0.32);
    }
    x += w + 1 + R() * 2;
  }
  // cargo
  for (let k = 0; k < 90; k++) {
    const x = -160 + R() * 320, z = 359 + R() * 6;
    if (Math.abs(x) < 9) continue;
    if (R() < 0.5) kit.place('barrel', x, QY, z, R() * 6, 1, 1.1, 1);
    else { const s = 0.9 + R() * 0.8; kit.place('boxWood', x, QY, z, R() * 6, s, s, s); if (R() < 0.3) kit.place('boxWood', x, QY + s, z, R() * 6, s * 0.8, s * 0.8, s * 0.8); }
  }
  // piers
  const piers = [-125, -52, 52, 125];
  for (const x of piers) {
    kit.place('boxWood', x, 1.5, 398, 0, 6.5, 0.45, 60);
    for (let z = 372; z <= 428; z += 8) for (const s of [-1, 1]) {
      kit.place('barrel', x + s * 3.1, -6, z, 0, 0.75, 9.4, 0.75);
      if (z % 16 === 4) { kit.place('lampGlow', x + s * 3.1, 3.7, z, 0, 0.6); }
    }
  }
  // breakwaters
  kit.beam('boxStone', 168, 356, LIGHTHOUSE.x - 6, LIGHTHOUSE.z - 9, -14, 9, 16.6);
  kit.beam('boxPaving', 168, 356, LIGHTHOUSE.x - 6, LIGHTHOUSE.z - 9, 2.6, 7.4, 0.25);
  kit.beam('boxStone', -168, 356, -238, 452, -14, 9, 16.6);
  kit.beam('boxPaving', -168, 356, -238, 452, 2.6, 7.4, 0.25);
  kit.place('cylStone', -240, -12, 456, 0, 7, 15, 7);
  kit.place('cylStone', -240, 3, 456, 0, 3, 11, 3);
  kit.place('coneRoof', -240, 15.5, 456, 0, 3.8, 4.5, 3.8, C('#2c5cab'));
  kit.place('lampGlow', -240, 14, 456, 0, 2.6, 2.2, 2.6);
  return { piers };
}

function windmills(ctx) {
  const { kit, scene, dyn } = ctx, out = [];
  const sail = M.sail;
  for (const [x, z] of [[-520, 90], [-600, -10], [-470, 190], [640, 190]]) {
    const y = height(x, z) - 0.5;
    kit.place('cylStone', x, y, z, 0, 4.6, 2, 4.6);
    kit.addStatic('marble', tf(cyl(3, 4.2, 13, 16), x, y + 2, z));
    kit.place('coneRoof', x, y + 15, z, 0, 3.9, 4.6, 3.9, C('#a84a30'));
    const hub = new THREE.Group();
    const ang = Math.atan2(-x, 300 - z); // face roughly toward the city / sea breeze
    hub.position.set(x + Math.sin(ang) * 3.9, y + 14, z + Math.cos(ang) * 3.9); hub.rotation.y = ang;
    const rot = new THREE.Group(); hub.add(rot);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 11, 0.28).translate(0, 5.5, 0), M.wood);
      const sl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 8.4).translate(1.3, 6.4, 0), sail);
      const gk = new THREE.Group(); gk.add(arm, sl); gk.rotation.z = (k / 4) * TAU; rot.add(gk);
      arm.castShadow = sl.castShadow = true;
    }
    scene.add(hub);
    const sp = 0.5 + Math.random() * 0.3;
    dyn.push((t) => { rot.rotation.z = t * sp * (0.4 + 0.6 * G.uWind.value); });
    out.push({ x, y: y + 14, z });
  }
  return out;
}

export function buildLandmarks(ctx) {
  const heart = pantheon(ctx);
  const temple = sunTemple(ctx);
  const amph = amphitheatre(ctx);
  const aq = aqueduct(ctx);
  const lh = lighthouse(ctx);
  const hb = harbor(ctx);
  const mills = windmills(ctx);
  const Y6 = LEVEL_H[6];
  const list = [
    { id: 'heart', name: 'The Aether Heart', sub: 'Acropolis · Pantheon of Tides', pos: HEART.clone(), radius: 26,
      desc: 'A shard of condensed sky hangs above the gilded oculus, turning inside three bronze meridians. Its light keeps the islands aloft — and every lamp in the city answers when it sings.',
      view: { p: [150, 190, 210], t: [0, 150, 0] }, action: { label: 'Awaken the Heart', run: () => heart.pulse() } },
    { id: 'pantheon', name: 'Pantheon of Tides', sub: 'Acropolis', pos: new THREE.Vector3(0, Y6 + 32, 0), radius: 44,
      desc: 'Thirty-two columns ring a rotunda crowned by a gold dome. Four spires mark the cardinal winds; at dusk their lanterns are the first lights sailors see.',
      view: { p: [-120, 150, 150], t: [0, 128, 0] } },
    { id: 'temple', name: 'Temple of the Sun', sub: 'Fifth Terrace', pos: new THREE.Vector3(temple.x, temple.y + 14, temple.z), radius: 24,
      desc: 'A marble peripteros facing the open sea. Its brazier is lit each evening the moment the sun touches the water.',
      view: { p: [temple.x * 1.9 - 30, temple.y + 32, temple.z * 1.9 + 20], t: [temple.x, temple.y + 8, temple.z] } },
    { id: 'cascade', name: 'The Grand Cascade', sub: 'Terraces I – VI', pos: new THREE.Vector3(...((p) => [p[0], 62, p[1]])(cityXZ(190, Math.PI / 2 - Math.PI / 8))), radius: 22,
      desc: 'Aqueduct water spills from the acropolis and falls terrace to terrace through six plunge pools before resting in the basin by the sea wall.',
      view: { p: [205, 78, 345], t: [70, 60, 150] } },
    { id: 'harbor', name: 'Harbor of Lanterns', sub: 'Sea Gate', pos: new THREE.Vector3(0, 12, 372), radius: 40,
      desc: 'Galleons, fishing skiffs and grain barges crowd four timber piers. Twin breakwaters shelter the bay; the sea gate has never been closed.',
      view: { p: [-150, 26, 470], t: [0, 30, 300] } },
    { id: 'lighthouse', name: 'The Pharos', sub: 'Eastern Breakwater', pos: new THREE.Vector3(lh.x, lh.y, lh.z), radius: 26,
      desc: 'An octagonal tower of white limestone. After dark its twin beams sweep the bay once every eighteen seconds.',
      view: { p: [lh.x + 120, 60, lh.z + 110], t: [lh.x, 40, lh.z] }, action: { label: 'Toggle the beacon', run: () => (lh.toggle() ? 'Beacon lit — visible after dusk' : 'Beacon darkened') } },
    { id: 'amph', name: 'Amphitheatre of Winds', sub: 'Eastern Plain', pos: new THREE.Vector3(amph.x, amph.y + 30, amph.z), radius: 50,
      desc: 'Three tiers of arcades seat twenty thousand. The oval was laid out so the evening breeze carries an actor’s whisper to the highest row.',
      view: { p: [amph.x + 130, 95, amph.z + 150], t: [amph.x, 22, amph.z] } },
    { id: 'aqueduct', name: 'Aqueduct of the North', sub: 'Mountain Road', pos: new THREE.Vector3(aq.x, aq.y + 6, aq.z), radius: 36,
      desc: 'Snowmelt crosses the valley on tiered arches and enters the city at the fourth terrace, feeding every fountain and the Grand Cascade.',
      view: { p: [aq.x - 210, 120, aq.z + 40], t: [aq.x, 55, aq.z] } },
    { id: 'mills', name: 'The Windmills', sub: 'Western Hills', pos: new THREE.Vector3(mills[0].x, mills[0].y + 6, mills[0].z), radius: 22,
      desc: 'Cloth-sailed mills grind the terraces’ grain. Their speed follows the weather — watch them in a storm.',
      view: { p: [mills[0].x - 60, mills[0].y + 22, mills[0].z + 90], t: [mills[0].x, mills[0].y, mills[0].z] } },
  ];
  return { list, heart, lighthouse: lh, harbor: hb, aqueduct: aq };
}
