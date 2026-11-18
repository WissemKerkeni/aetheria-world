// Shared instancing prototypes for architecture.
import * as THREE from 'three';
import { M, enhance } from '../core/materials.js';
import { TAU } from './heightfield.js';

export function gableGeometry() {
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5], E = [-0.5, 1, 0], F = [0.5, 1, 0];
  const tris = [D, C, F, D, F, E, B, A, E, B, E, F, A, D, E, C, B, F];
  const uvs = [0, 0, 0.25, 0, 0.25, 1, 0, 0, 0.25, 1, 0, 1, 0, 0, 0.25, 0, 0.25, 1, 0, 0, 0.25, 1, 0, 1, 0, 0, 0.1, 0, 0.05, 0.3, 0, 0, 0.1, 0, 0.05, 0.3];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

export function archGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-6, 0); s.lineTo(-4, 0); s.lineTo(-4, 3.2);
  s.absarc(0, 3.2, 4, Math.PI, 0, true);
  s.lineTo(4, 0); s.lineTo(6, 0); s.lineTo(6, 9); s.lineTo(-6, 9); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 4, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -2);
}

export function columnGeometry() {
  const pts = [[0.86, 0], [0.86, 0.32], [0.72, 0.42], [0.64, 0.66], [0.56, 0.78], [0.47, 9.05], [0.56, 9.18], [0.6, 9.3], [0.82, 9.6], [0.88, 9.68], [0.88, 10], [0, 10]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 14);
}

export function registerProtos(kit) {
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  kit.proto('boxStone', unit, M.stone);
  kit.proto('boxMarble', unit, M.marble);
  kit.proto('boxPaving', unit, M.paving);
  kit.proto('boxWood', unit, M.wood);
  kit.proto('boxDark', unit, M.dark, { cast: false });
  kit.proto('boxPool', unit, M.pool, { cast: false });
  kit.proto('houseA', unit, M.facadeA);
  kit.proto('houseB', unit, M.facadeB);
  kit.proto('houseC', unit, M.facadeC);
  const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  pyr.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v; });
  kit.proto('roofPyr', pyr, M.roof);
  kit.proto('roofGable', gableGeometry(), M.roof);
  kit.proto('coneRoof', new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, 0.5, 0), M.roof);
  M.domeMat = enhance(new THREE.MeshStandardMaterial({ metalness: 0.45, roughness: 0.34 }), { key: 'plain' });
  kit.proto('dome', new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, Math.PI / 2), M.domeMat);
  kit.proto('cylStone', new THREE.CylinderGeometry(1, 1, 1, 18).translate(0, 0.5, 0), M.stone);
  kit.proto('cylMarble', new THREE.CylinderGeometry(1, 1, 1, 24).translate(0, 0.5, 0), M.marble);
  kit.proto('cylPool', new THREE.CylinderGeometry(1, 1, 1, 24).translate(0, 0.5, 0), M.pool, { cast: false });
  kit.proto('column', columnGeometry(), M.marble);
  kit.proto('arch', archGeometry(), M.stone);
  kit.proto('archMarble', archGeometry(), M.marble);
  kit.proto('obelisk', new THREE.CylinderGeometry(0.42, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), M.marble);
  kit.proto('goldCap', new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), M.gold);
  kit.proto('goldBall', new THREE.SphereGeometry(1, 12, 8), M.gold);
  M.awning = enhance(new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), { key: 'plain' });
  kit.proto('awning', new THREE.BoxGeometry(1, 0.06, 1), M.awning);
  kit.proto('lampPost', new THREE.CylinderGeometry(0.07, 0.13, 4.2, 6).translate(0, 2.1, 0), M.bronze, { cast: false });
  kit.proto('lampGlow', new THREE.SphereGeometry(0.34, 8, 6), M.lampGlow, { cast: false });
  kit.proto('crystal', new THREE.OctahedronGeometry(1, 0).scale(0.55, 1.6, 0.55), M.crystal, { cast: false });
  kit.proto('flagPole', new THREE.CylinderGeometry(0.06, 0.09, 1, 5).translate(0, 0.5, 0), M.bronze, { cast: false });
  kit.proto('flag', new THREE.PlaneGeometry(2.6, 1.5, 10, 3).translate(1.3, 0, 0), M.cloth, { cast: false });
  kit.proto('barrel', new THREE.CylinderGeometry(0.42, 0.42, 1, 10).translate(0, 0.5, 0), M.wood);
}
