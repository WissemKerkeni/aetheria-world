// Everything that moves: ships, airships, birds, citizens, fireflies, aether motes, rain, clouds.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { M, G, ATMOS_GLSL, cloneMat } from '../core/materials.js';
import { mergeAll } from './kit.js';
import { LEVEL_R, LEVEL_H, RISER, TAU, frame, cityXZ, ISLES } from './heightfield.js';
import { HEART } from './Landmarks.js';

function hullGeo(L, W, D, H) {
  const nu = 18, nv = 6, pos = [], uv = [], idx = [];
  const prof = (u) => {
    const au = Math.abs(u);
    const wf = u < 0 ? Math.pow(Math.max(0, 1 - Math.pow(au, 4)), 0.5) : Math.pow(Math.max(0, 1 - au * au), 0.7);
    return { wf, keel: -D * (1 - 0.5 * au * au * au), deck: H * (1 + 0.45 * Math.pow(au, 2.2) + (u < 0 ? 0.3 * u * u : 0)) };
  };
  for (const s of [-1, 1]) for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * 2 - 1, p = prof(u);
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      pos.push((u * L) / 2, p.keel + (p.deck - p.keel) * v, (s * W) / 2 * p.wf * Math.pow(v, 0.55));
      uv.push((i / nu) * 4, v);
    }
  }
  const row = nv + 1, side = (nu + 1) * row;
  for (let sd = 0; sd < 2; sd++) for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = sd * side + i * row + j, b = a + row, c = a + 1, d = b + 1;
    idx.push(a, b, c, c, b, d);
  }
  const base = pos.length / 3;
  for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * 2 - 1, p = prof(u);
    for (const s of [-1, 1]) { pos.push((u * L) / 2, p.deck - 0.35, (s * W) / 2 * p.wf * 0.97); uv.push((i / nu) * 4, s * 0.5 + 0.5); }
  }
  for (let i = 0; i < nu; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function sailGeo(w, h, bulge, tri = false) {
  const g = new THREE.PlaneGeometry(w, h, 8, 5), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / w + 0.5, v = p.getY(i) / h + 0.5;
    if (tri) p.setX(i, p.getX(i) * (1 - v * 0.85) - (w / 2) * v * 0.85);
    p.setZ(i, Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.9 + 0.15) * bulge);
  }
  g.computeVertexNormals();
  return g;
}

function makeShip(big, flagColor) {
  const grp = new THREE.Group();
  const s = big ? 1 : 0.3, L = 36 * s, W = 9.6 * s, D = 3.2 * s, H = 3.6 * s;
  const wood = [hullGeo(L, W, D, H)], sails = [];
  const masts = big ? [[-10, 26], [1, 31], [11, 23]] : [[0.5, 9]];
  for (const [mx, mh] of masts) {
    wood.push(new THREE.CylinderGeometry(0.16 * (big ? 1.6 : 0.5), 0.26 * (big ? 1.6 : 0.5), mh, 6).translate(mx, H + mh / 2 - 0.5, 0));
    if (big) {
      for (const [yy, w, h] of [[H + mh * 0.3, 13, 9.5], [H + mh * 0.68, 9.5, 7.5]]) {
        wood.push(new THREE.CylinderGeometry(0.14, 0.14, w + 1, 5).rotateX(Math.PI / 2).translate(mx, yy + h / 2, 0));
        sails.push(sailGeo(w, h, 1.8).rotateY(Math.PI / 2).translate(mx + 0.4, yy, 0));
      }
    } else {
      sails.push(sailGeo(3.4, 6.5, 0.5, true).rotateY(0.25).translate(mx + 0.4, H + 4.4, 0));
    }
  }
  if (big) {
    wood.push(new THREE.CylinderGeometry(0.14, 0.2, 11, 5).rotateZ(-Math.PI / 2 + 0.25).translate(L / 2 + 3.4, H + 2.6, 0));
    wood.push(new THREE.BoxGeometry(8, 2.6, W * 0.72).translate(-L / 2 + 5.4, H + 1.9, 0));
    sails.push(sailGeo(8, 9, 0.8, true).rotateY(0.0).translate(L / 2 - 1.5, H + 8, 0));
  }
  const hull = new THREE.Mesh(mergeAll(wood, false), M.wood); hull.castShadow = true; hull.receiveShadow = true;
  const sail = new THREE.Mesh(mergeAll(sails, false), M.sail); sail.castShadow = true;
  grp.add(hull, sail);
  if (big) {
    const top = masts[1];
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5, 10, 3).translate(1.3, 0, 0), cloneMat(M.cloth, { color: new THREE.Color(flagColor) }));
    flag.position.set(top[0], H + top[1] + 0.4, 0); flag.rotation.y = Math.PI; flag.scale.setScalar(1.6);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), M.lampGlow); lamp.position.set(-L / 2 + 1, H + 4.4, 0);
    const lamp2 = lamp.clone(); lamp2.position.set(L / 2 - 2, H + 2.4, 0);
    grp.add(flag, lamp, lamp2);
  } else {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), M.lampGlow); lamp.position.set(-L / 2 + 0.6, H + 1.2, 0); grp.add(lamp);
  }
  return grp;
}

function makeAirship(R) {
  const grp = new THREE.Group();
  const env = new THREE.SphereGeometry(1, 28, 18).rotateZ(Math.PI / 2);
  const p = env.attributes.position, col = new Float32Array(p.count * 3);
  const cream = new THREE.Color('#efe2c4'), red = new THREE.Color(['#a8322d', '#2a559c', '#c8922a'][Math.floor(R() * 3)]), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const taper = x < 0 ? 1 - 0.38 * x * x : 1 - 0.12 * x * x;
    p.setXYZ(i, x * 17, y * 5.4 * taper, z * 5.4 * taper);
    const stripe = Math.floor((Math.atan2(y, z) + Math.PI) / (Math.PI / 6)) % 2;
    c.copy(stripe ? cream : red); if (Math.abs(x) > 0.9) c.copy(red);
    col.set([c.r, c.g, c.b], i * 3);
  }
  env.setAttribute('color', new THREE.BufferAttribute(col, 3)); env.computeVertexNormals();
  const paintAll = (g, cc) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([cc.r, cc.g, cc.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const fins = [0, 1, 2, 3].map((k) => paintAll(new THREE.BoxGeometry(6, 5.2, 0.25).translate(-13.5, 3.6, 0).rotateX((k * Math.PI) / 2 + Math.PI / 4), red));
  const balloon = new THREE.Mesh(mergeAll([env, ...fins], true), M.balloon); balloon.castShadow = true;
  const wood = [hullGeo(11, 3, 1.4, 1.3).translate(0, -8.6, 0)];
  for (const [x, z] of [[-3.5, 1], [3.5, 1], [-3.5, -1], [3.5, -1]]) wood.push(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 4).translate(x, -5.6, z));
  const gond = new THREE.Mesh(mergeAll(wood, false), M.wood); gond.castShadow = true;
  grp.add(balloon, gond);
  for (const x of [-5, 5.2]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), M.lampGlow); l.position.set(x, -7.6, 0); grp.add(l); }
  return grp;
}

function buildBirds(scene) {
  const R = mulberry32(606);
  const flocks = [
    { cx: 0, cz: 0, r: 150, h: 235, n: 46, spread: 0.7, white: 0 },
    { cx: 10, cz: 430, r: 120, h: 34, n: 50, spread: 6.3, white: 1 },
    { cx: -100, cz: -620, r: 280, h: 400, n: 34, spread: 0.6, white: 0 },
    { cx: -430, cz: 330, r: 110, h: 300, n: 26, spread: 0.9, white: 0 },
    { cx: 450, cz: 120, r: 160, h: 120, n: 30, spread: 0.8, white: 0 },
  ];
  const N = flocks.reduce((a, f) => a + f.n, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -0.15, 0, 0, 0.55, 0, 0, -0.4, 1, 0, -0.15, 0, 0, -0.4, 0, 0, 0.55], 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0], 1));
  const orbit = new Float32Array(N * 4), param = new Float32Array(N * 4), shade = new Float32Array(N);
  let i = 0;
  for (const f of flocks) {
    const dir = R() < 0.5 ? 1 : -1, ph0 = R() * TAU;
    for (let k = 0; k < f.n; k++, i++) {
      const rr = f.r * (0.75 + R() * 0.5);
      orbit.set([f.cx + (R() - 0.5) * 30, f.cz + (R() - 0.5) * 30, rr, f.h + (R() - 0.5) * 34], i * 4);
      param.set([(dir * (9 + R() * 3)) / rr, ph0 + R() * f.spread, 0.9 + R() * 0.7, 7 + R() * 4], i * 4);
      shade[i] = f.white;
    }
  }
  geo.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4));
  geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(param, 4));
  geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1));
  geo.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...G },
    vertexShader: /* glsl */ `
      attribute float aWing; attribute vec4 aOrbit; attribute vec4 aParam; attribute float aShade;
      uniform float uTime; varying vec3 vWorld; varying float vShade;
      void main() {
        float a = aParam.y + uTime * aParam.x;
        vec3 c = vec3(aOrbit.x + cos(a) * aOrbit.z, aOrbit.w + sin(uTime * 0.4 + aParam.y * 3.0) * 7.0, aOrbit.y + sin(a) * aOrbit.z * 0.8);
        vec3 fwd = normalize(vec3(-sin(a), 0.0, cos(a) * 0.8)) * sign(aParam.x);
        vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
        vec3 p = position * aParam.z * 0.62;
        float flap = sin(uTime * aParam.w + aParam.y * 7.0);
        p.y += aWing * (flap * 0.75 + 0.15) * aParam.z;
        p.x *= 1.0 - aWing * 0.18 * abs(flap);
        vWorld = c + right * p.x + vec3(0.0, 1.0, 0.0) * p.y + fwd * p.z;
        vShade = aShade;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightCol; varying vec3 vWorld; varying float vShade;
      ${ATMOS_GLSL}
      void main() { vec3 col = mix(vec3(0.035, 0.035, 0.045), vec3(0.8), vShade) * (0.25 + uLightCol);
        gl_FragColor = vec4(applyAtmos(col, cameraPosition, vWorld), 1.0); }`,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.userData.noAO = true; m.name = 'birds';
  scene.add(m);
}

function buildCitizens(scene, dyn, count) {
  const R = mulberry32(808);
  const body = new THREE.LatheGeometry([[0.3, 0], [0.27, 0.45], [0.2, 0.95], [0.24, 1.22], [0.2, 1.4], [0.07, 1.48], [0, 1.48]].map(([r, y]) => new THREE.Vector2(r, y)), 9);
  const head = new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.63, 0);
  const mesh = new THREE.InstancedMesh(mergeAll([body, head], false), M.citizen, count);
  const robes = ['#f3ead8', '#b3262b', '#1f4fa3', '#e2a92d', '#2e7d6b', '#7a4a9a', '#d98a5a', '#ffffff', '#58768f'].map((h) => new THREE.Color(h));
  const people = [], cream = new THREE.Color('#e9dfc8');
  for (let i = 0; i < count; i++) {
    const lvl = Math.floor(R() * 7);
    const d = lvl === 0 ? 326 + R() * 6 : LEVEL_R[lvl] - RISER - 3.2 - R() * 3.5;
    const v = (0.7 + R() * 0.8) * (R() < 0.5 ? 1 : -1);
    people.push({ lvl, d, th: R() * TAU, v, h: 0.88 + R() * 0.25 });
    mesh.setColorAt(i, robes[Math.floor(R() * robes.length)].clone().lerp(cream, 0.25 + R() * 0.45));
  }
  mesh.castShadow = true; mesh.layers.set(1); mesh.frustumCulled = false; mesh.name = 'citizens';
  scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  dyn.push((t, dt) => {
    for (let i = 0; i < count; i++) {
      const c = people[i], f = frame(c.d, c.th);
      c.th += (c.v * dt) / f.arc;
      q.setFromAxisAngle(up, Math.atan2(f.tx * c.v, f.tz * c.v));
      p.set(f.x, LEVEL_H[c.lvl] + Math.abs(Math.sin(t * 6 + i)) * 0.05, f.z);
      m4.compose(p, q, s.set(c.h, c.h, c.h));
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function buildMotes(scene) {
  const R = mulberry32(909), N = 900, pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  let i = 0;
  // fireflies in the terraces and meadows
  for (; i < 620; i++) {
    const lvl = 1 + Math.floor(R() * 6), d = LEVEL_R[lvl] - RISER - 2 - R() * 8, [x, z] = cityXZ(d, R() * TAU);
    pos.set([x, LEVEL_H[lvl] + 0.6 + R() * 3.5, z], i * 3); seed.set([R(), 0, 2.0 + R() * 1.5], i * 3);
  }
  // aether motes spiralling around the Heart and the isles
  for (; i < N; i++) {
    const src = R() < 0.6 ? HEART : new THREE.Vector3(ISLES[i % ISLES.length].x, ISLES[i % ISLES.length].y - 20, ISLES[i % ISLES.length].z);
    const rr = 6 + R() * 34, a = R() * TAU;
    pos.set([src.x + Math.cos(a) * rr, src.y - 30 + R() * 80, src.z + Math.sin(a) * rr], i * 3); seed.set([R(), 1, 4 + R() * 5], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: G.uTime, uNight: G.uNight, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute vec3 aSeed; uniform float uTime, uNight, uScale; varying float vA; varying float vKind;
      void main() {
        vec3 p = position; float s = aSeed.x * 60.0;
        if (aSeed.y < 0.5) { p += vec3(sin(uTime * 0.7 + s), sin(uTime * 0.9 + s * 2.0) * 0.6, cos(uTime * 0.6 + s * 3.0)) * 1.6;
          vA = uNight * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.6 + s * 5.0), 3.0)); }
        else { float a = uTime * 0.25 + s; p.xz += vec2(cos(a), sin(a)) * 3.0; p.y += mod(uTime * 3.0 + s * 9.0, 60.0) - 20.0;
          vA = (0.25 + 0.75 * uNight) * (0.5 + 0.5 * sin(uTime * 1.7 + s * 4.0)); }
        vKind = aSeed.y;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(aSeed.z * uScale / -mv.z, 1.0, 22.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vKind;
      void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 2.0) * vA;
        vec3 col = mix(vec3(1.0, 0.9, 0.35), vec3(0.35, 0.9, 1.0), vKind) * 2.6;
        gl_FragColor = vec4(col * a, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.layers.set(1); pts.name = 'motes';
  scene.add(pts);
  return mat;
}

function buildRain(scene) {
  const N = 9000, pos = new Float32Array(N * 6), end = new Float32Array(N * 2), R = mulberry32(111);
  for (let i = 0; i < N; i++) {
    const x = R() * 240, y = R() * 140, z = R() * 240;
    pos.set([x, y, z, x, y, z], i * 6); end.set([0, 1], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const uniforms = { uTime: G.uTime, uRain: { value: 0 }, uLightCol: G.uLightCol, uWind: G.uWind };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aEnd; uniform float uTime, uWind; varying float vA;
      void main() {
        vec3 b = position; float sp = 95.0 + fract(b.x * 7.31) * 40.0;
        vec3 vel = vec3(uWind * 9.0, -sp, uWind * 4.0);
        vec3 p = b + vel * uTime;
        p = mod(p - cameraPosition + vec3(120.0, 50.0, 120.0), vec3(240.0, 140.0, 240.0)) - vec3(120.0, 50.0, 120.0) + cameraPosition;
        p += normalize(vel) * aEnd * 2.2;
        vA = 1.0 - aEnd * 0.6;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uRain; uniform vec3 uLightCol; varying float vA;
      void main() { gl_FragColor = vec4((vec3(0.55, 0.62, 0.72) + uLightCol * 0.25), 0.34 * uRain * vA); }`,
    transparent: true, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false; lines.layers.set(1); lines.visible = false; lines.name = 'rain';
  scene.add(lines);
  return { lines, uniforms };
}

export function addCloudBanks(kit) {
  const R = mulberry32(1212);
  for (let k = 0; k < 46; k++) {
    const a = R() * TAU, rr = 1700 + R() * 2600, cx = Math.cos(a) * rr, cz = Math.sin(a) * rr, cy = 240 + R() * 520, s = 280 + R() * 420;
    for (let j = 0; j < 5; j++) kit.puffs.push({ x: cx + (R() - 0.5) * s * 1.8, y: cy + (R() - 0.3) * s * 0.35, z: cz + (R() - 0.5) * s * 1.8, s: s * (0.7 + R() * 0.7), mist: 0 });
  }
  // mountain-top wreaths
  for (let k = 0; k < 14; k++) {
    const x = -900 + R() * 1800, z = -1300 + R() * 520;
    kit.puffs.push({ x, y: 380 + R() * 160, z, s: 170 + R() * 180, mist: 0 });
  }
}

export function buildLife(ctx, harbor) {
  const { scene, dyn, quality } = ctx, R = mulberry32(4711);
  const vessels = [];
  // moored ships
  const docks = [[-52 - 9.5, 404, Math.PI / 2, true, '#b3262b'], [52 + 9.5, 400, -Math.PI / 2, true, '#1f4fa3'], [125 + 5, 392, Math.PI / 2, false], [-125 - 5, 396, -Math.PI / 2, false], [-125 + 5, 414, Math.PI / 2, false], [125 - 5.2, 416, -Math.PI / 2, false]];
  for (const [x, z, ry, big, fc] of docks) {
    const s = makeShip(big, fc); s.position.set(x, 0, z); s.rotation.y = ry; scene.add(s);
    const ph = R() * 6;
    dyn.push((t) => { s.position.y = Math.sin(t * 0.9 + ph) * 0.14 + (big ? 0.4 : 0.1); s.rotation.z = Math.sin(t * 0.7 + ph) * 0.022; s.rotation.x = Math.sin(t * 0.55 + ph * 2) * 0.012; });
  }
  // ships under sail
  const routes = [
    { cx: 30, cz: 690, rx: 470, rz: 170, sp: 0.011, ph: 0.4, big: true, fc: '#e2a92d', name: 'The Meridian' },
    { cx: -80, cz: 640, rx: 330, rz: 110, sp: -0.014, ph: 2.4, big: true, fc: '#b3262b' },
    { cx: 60, cz: 520, rx: 150, rz: 60, sp: 0.03, ph: 1.0, big: false }, { cx: -40, cz: 500, rx: 110, rz: 40, sp: -0.036, ph: 4.0, big: false },
    { cx: 350, cz: 620, rx: 90, rz: 60, sp: 0.04, ph: 5.2, big: false }, { cx: -380, cz: 600, rx: 120, rz: 60, sp: 0.03, ph: 3.1, big: false },
  ];
  for (const r of routes) {
    const s = makeShip(r.big, r.fc); scene.add(s);
    dyn.push((t) => {
      const a = r.ph + t * r.sp, sg = Math.sign(r.sp);
      const hx = -Math.sin(a) * r.rx * sg, hz = Math.cos(a) * r.rz * sg;
      s.position.set(r.cx + Math.cos(a) * r.rx, Math.sin(t * 0.8 + r.ph) * 0.3 + (r.big ? 0.4 : 0.1), r.cz + Math.sin(a) * r.rz);
      s.rotation.set(Math.sin(t * 0.6 + r.ph) * 0.03, Math.atan2(-hz, hx), Math.sin(t * 0.75 + r.ph) * 0.03 + 0.05, 'YXZ');
    });
    if (r.name) vessels.push({ name: r.name, object: s });
  }
  // airships
  const airRoutes = [
    { cx: 0, cz: 40, rx: 540, rz: 430, y: 220, sp: 0.02, ph: 1.9, name: 'Skyship Halcyon' },
    { cx: -180, cz: 260, rx: 400, rz: 300, y: 150, sp: -0.027, ph: 0.3, name: 'Skyship Corvina' },
    { cx: 260, cz: -280, rx: 640, rz: 500, y: 340, sp: 0.015, ph: 4.2, name: 'Skyship Aurel' },
  ];
  const airships = [];
  for (const r of airRoutes) {
    const s = makeAirship(R); scene.add(s);
    dyn.push((t) => {
      const a = r.ph + t * r.sp, sg = Math.sign(r.sp);
      const hx = -Math.sin(a) * r.rx * sg, hz = Math.cos(a) * r.rz * sg;
      s.position.set(r.cx + Math.cos(a) * r.rx, r.y + Math.sin(t * 0.3 + r.ph) * 5, r.cz + Math.sin(a) * r.rz);
      s.rotation.set(-0.1 * sg, Math.atan2(-hz, hx), Math.sin(t * 0.4 + r.ph) * 0.03, 'YXZ');
    });
    airships.push({ name: r.name, object: s });
  }
  buildBirds(scene);
  buildCitizens(scene, dyn, quality === 'low' ? 220 : 520);
  const motes = buildMotes(scene);
  const rain = buildRain(scene);
  return { vessels, airships, rain, motes };
}
