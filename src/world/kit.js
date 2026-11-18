// Kit: collects instanced placements and static geometry from all world modules,
// then emits the minimum number of draw calls (one InstancedMesh per prototype,
// one merged mesh per material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);

export function mat4(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
export function tf(geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  geo.applyMatrix4(mat4(x, y, z, ry, sx, sy, sz, rx, rz));
  return geo;
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
export const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(0, h / 2, 0);

function normalize(geo, keepColor) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) {
    if (k === 'position' || k === 'normal' || k === 'uv' || (keepColor && k === 'color')) continue;
    g.deleteAttribute(k);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
export function mergeAll(list, keepColor = true) {
  return mergeGeometries(list.map((g) => normalize(g, keepColor)));
}

export class Kit {
  constructor() {
    this.protos = new Map();
    this.statics = new Map();
    this.falls = [];   // waterfall quads
    this.puffs = [];   // cloud / mist sprites
    this.pools = [];   // lamp light pools
    this.pickers = []; // misc
  }
  proto(name, geometry, material, opts = {}) {
    this.protos.set(name, { geometry, material, opts, mats: [], colors: [], colored: false });
  }
  add(name, matrix, color) {
    const p = this.protos.get(name);
    if (!p) throw new Error('Unknown proto ' + name);
    p.mats.push(matrix);
    p.colors.push(color || WHITE);
    if (color) p.colored = true;
  }
  place(name, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, color, rx = 0, rz = 0) {
    this.add(name, mat4(x, y, z, ry, sx, sy, sz, rx, rz), color);
  }
  // Oriented box between two ground points (local z along the segment).
  beam(name, x1, z1, x2, z2, y, w, h, color) {
    const dx = x2 - x1, dz = z2 - z1;
    this.place(name, (x1 + x2) / 2, y, (z1 + z2) / 2, Math.atan2(dx, dz), w, h, Math.hypot(dx, dz), color);
  }
  addStatic(matKey, geo) {
    if (!this.statics.has(matKey)) this.statics.set(matKey, []);
    this.statics.get(matKey).push(normalize(geo, matKey === 'isle' || matKey === 'balloon'));
  }
  // A local-space group that is emitted to the world with one transform.
  group() {
    const kit = this, st = [], inst = [];
    return {
      add(matKey, geo) { st.push([matKey, geo]); return this; },
      inst(name, matrix, color) { inst.push([name, matrix, color]); return this; },
      place(name, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, color, rx = 0) { inst.push([name, mat4(x, y, z, ry, sx, sy, sz, rx), color]); return this; },
      emit(x, y, z, ry = 0, s = 1) {
        const W = mat4(x, y, z, ry, s);
        for (const [k, g] of st) { g.applyMatrix4(W); kit.addStatic(k, g); }
        for (const [n, m, c] of inst) kit.add(n, m.clone().premultiply(W), c);
        return W;
      },
    };
  }
  build(scene, M) {
    const out = {};
    for (const [name, p] of this.protos) {
      if (!p.mats.length) continue;
      const mesh = new THREE.InstancedMesh(p.geometry, p.material, p.mats.length);
      for (let i = 0; i < p.mats.length; i++) {
        mesh.setMatrixAt(i, p.mats[i]);
        if (p.colored) mesh.setColorAt(i, p.colors[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = p.opts.cast !== false;
      mesh.receiveShadow = p.opts.receive !== false;
      if (p.opts.layer) mesh.layers.set(p.opts.layer);
      if (p.opts.noAO) mesh.userData.noAO = true;
      mesh.name = 'inst:' + name;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      out[name] = mesh;
    }
    for (const [key, list] of this.statics) {
      const geo = mergeGeometries(list);
      if (!geo) { console.warn('merge failed for', key); continue; }
      const mesh = new THREE.Mesh(geo, M[key]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = 'static:' + key;
      scene.add(mesh);
      out['static:' + key] = mesh;
    }
    return out;
  }
}
