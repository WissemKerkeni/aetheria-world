// Floating islands: grass-topped rock shards with hanging crystals, ruins and falling water.
import * as THREE from 'three';
import { mulberry32, noise, fbm } from '../core/noise.js';
import { ISLES, TAU } from './heightfield.js';
import { cyl, tf } from './kit.js';

export function buildIsles(ctx) {
  const { kit } = ctx;
  ISLES.forEach((isle, n) => {
    const { x, y, z, r, seed } = isle, R = mulberry32(seed * 7 + 1);
    const NR = 16, NS = 52;
    const edge = (th) => r * (0.78 + 0.22 * noise(Math.cos(th) * 1.3 + seed, Math.sin(th) * 1.3 + seed * 2.1));
    const topY = (lx, lz) => {
      const th = Math.atan2(lz, lx), rho = Math.min(1, Math.hypot(lx, lz) / edge(th));
      return r * 0.14 * (1 - rho * rho) + fbm(lx * 0.05 + seed, lz * 0.05, 3) * r * 0.045;
    };
    const depth = (lx, lz, rho) => r * 1.45 * Math.pow(1 - rho, 0.72) * (0.72 + 0.55 * Math.abs(fbm(lx * 0.07 + seed, lz * 0.07 + 3, 3))) + (1 - rho) * r * 0.1;
    const pos = [], col = [], idx = [], V = (NR + 1) * (NS + 1);
    const grassA = new THREE.Color('#3f6a1f'), grassB = new THREE.Color('#8aa23c'), rockA = new THREE.Color('#8b7d6c'), rockB = new THREE.Color('#4d443c'), c = new THREE.Color();
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i <= NR; i++) for (let j = 0; j <= NS; j++) {
      const rho = i / NR, th = (j / NS) * TAU, e = edge(th), lx = Math.cos(th) * rho * e, lz = Math.sin(th) * rho * e;
      const ty = topY(lx, lz);
      if (pass === 0) {
        pos.push(lx, ty, lz);
        c.copy(grassA).lerp(grassB, 0.5 + 0.5 * noise(lx * 0.09, lz * 0.09 + seed)).lerp(rockA, Math.min(1, Math.max(0, (rho - 0.86) * 7)));
      } else {
        pos.push(lx, ty - depth(lx, lz, rho), lz);
        c.copy(rockA).lerp(rockB, Math.min(1, (1 - rho) * 1.2 + 0.25 * noise(lx * 0.2, lz * 0.2)));
      }
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) {
      const A = i * (NS + 1) + j, B = A + NS + 1, Cc = A + 1, D = B + 1;
      idx.push(A, Cc, B, Cc, D, B, V + A, V + B, V + Cc, V + Cc, V + B, V + D);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    kit.addStatic('isle', geo.translate(x, y, z));

    // trees
    const nt = Math.floor(r * 0.55);
    for (let k = 0; k < nt; k++) {
      const a = R() * TAU, rr = Math.sqrt(R()) * r * 0.62, lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
      if (r >= 55 && rr < 13) continue;
      const s = 0.7 + R() * 0.7, t = R();
      kit.place(t < 0.5 ? 'pine' : t < 0.8 ? 'broadleaf' : 'cypress', x + lx, y + topY(lx, lz) - 0.3, z + lz, R() * TAU, s);
    }
    // ruin: a small monopteros with a caged crystal
    if (r >= 55) {
      const by = y + topY(0, 0) - 0.4;
      kit.place('cylMarble', x, by, z, 0, 10.5, 1.2, 10.5);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; kit.place('column', x + Math.cos(a) * 8.2, by + 1.2, z + Math.sin(a) * 8.2, 0, 0.9, 0.9, 0.9); }
      kit.place('cylMarble', x, by + 10.2, z, 0, 9.6, 1.2, 9.6);
      kit.place('dome', x, by + 11.4, z, 0, 8.6, 6.4, 8.6, new THREE.Color('#58b8a4'));
      kit.place('crystal', x, by + 5.2, z, 0.4, 2.2);
      kit.place('lampGlow', x, by + 5.2, z, 0, 2.2);
    }
    // hanging crystals
    for (let k = 0; k < 9; k++) {
      const a = R() * TAU, rho = 0.15 + R() * 0.6, e = edge(a), lx = Math.cos(a) * rho * e, lz = Math.sin(a) * rho * e;
      const s = 1.6 + R() * 3.6;
      kit.place('crystal', x + lx, y + topY(lx, lz) - depth(lx, lz, rho) - s * 0.6, z + lz, R() * 6, s, s, s, undefined, (R() - 0.5) * 0.5);
    }
    // falling water that dissolves into mist
    if (n < 4) {
      const a = [2.2, 0.9, 1.4, 2.6][n], e = edge(a) * 0.985, lx = Math.cos(a) * e, lz = Math.sin(a) * e, tx = -Math.sin(a) * 2.6, tz = Math.cos(a) * 2.6;
      const ty = y + topY(lx, lz) + 0.3, L = 150;
      const ox = Math.cos(a) * 3, oz = Math.sin(a) * 3;
      kit.falls.push({ a: [x + lx - tx, ty, z + lz - tz], b: [x + lx + tx, ty, z + lz + tz], c: [x + lx + tx * 1.6 + ox, ty - L, z + lz + tz * 1.6 + oz], d: [x + lx - tx * 1.6 + ox, ty - L, z + lz - tz * 1.6 + oz], fade: 1 });
      // stream bed on top
      kit.beam('boxPool', x + lx * 0.25, z + lz * 0.25, x + lx, z + lz, y + topY(lx * 0.6, lz * 0.6) - 0.1, 3.4, 0.5);
      kit.puffs.push({ x: x + lx + ox, y: ty - L * 0.8, z: z + lz + oz, s: 46, mist: 0 });
    }
    // cloud skirt
    for (let k = 0; k < 7; k++) {
      const a = R() * TAU, rr = r * (0.5 + R() * 0.9);
      kit.puffs.push({ x: x + Math.cos(a) * rr, y: y - r * (0.5 + R() * 0.9), z: z + Math.sin(a) * rr, s: r * (1.3 + R() * 1.2), mist: 0 });
    }
  });
  const I = ISLES[0];
  return {
    landmark: {
      id: 'isles', name: 'The Skyward Isles', sub: 'Above the bay', pos: new THREE.Vector3(I.x, I.y + 16, I.z), radius: 60,
      desc: 'Seven shards of the old mountain, lifted when the Heart first woke. Their roots are veined with aether crystal; their streams fall for a thousand feet and never reach the sea.',
      view: { p: [I.x - 170, I.y + 60, I.z + 190], t: [I.x, I.y - 10, I.z] },
    },
  };
}
