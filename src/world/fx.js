// Small unlit effect materials: light beams, waterfalls, cloud puffs, lamp pools.
import * as THREE from 'three';
import { G, ATMOS_GLSL } from '../core/materials.js';

export function beamMaterial(color, opacity = 1, fadePow = 1.5) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uFadePow: { value: fadePow } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity, uFadePow; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { float rim = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(rim, 2.2) * pow(clamp(vUv.y, 0.0, 1.0), uFadePow) * uOpacity;
        gl_FragColor = vec4(uColor * a, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

export function buildFalls(scene, falls) {
  if (!falls.length) return null;
  const pos = [], uv = [], uv2 = [];
  for (const f of falls) {
    const len = Math.hypot(f.a[0] - f.d[0], f.a[1] - f.d[1], f.a[2] - f.d[2]);
    const N = Math.max(1, Math.ceil(len / 12));
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N;
      const L = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      const a = L(f.a, f.d, t0), b = L(f.b, f.c, t0), c = L(f.b, f.c, t1), d = L(f.a, f.d, t1);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      const v0 = (t0 * len) / 7, v1 = (t1 * len) / 7;
      uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
      const f0 = f.fade ? t0 : 0, f1 = f.fade ? t1 : 0;
      uv2.push(f0, f.fade ? 1 : 0, f0, 0, f1, 0, f0, 0, f1, 0, f1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFade', new THREE.Float32BufferAttribute(uv2, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...G },
    vertexShader: /* glsl */ `
      attribute vec2 aFade; varying vec2 vUv; varying float vFade; varying vec3 vWorld;
      void main() { vUv = uv; vFade = aFade.x; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uLightCol; varying vec2 vUv; varying float vFade; varying vec3 vWorld;
      ${ATMOS_GLSL}
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float n = vn(vec2(vUv.x * 16.0, vUv.y * 2.4 - uTime * 2.6)) * 0.6 + vn(vec2(vUv.x * 5.0 + 3.0, vUv.y * 1.1 - uTime * 1.7)) * 0.6;
        float streak = smoothstep(0.35, 0.9, n);
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float a = (0.5 + 0.5 * streak) * edge * (1.0 - smoothstep(0.35, 1.0, vFade));
        vec3 col = mix(vec3(0.5, 0.74, 0.86), vec3(1.0), streak) * uLightCol * 0.95;
        col = applyAtmos(col, cameraPosition, vWorld);
        gl_FragColor = vec4(col, a); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.noAO = true; mesh.name = 'falls';
  scene.add(mesh);
  return mesh;
}

// Camera-facing soft sprites (clouds, mist), one draw call.
export function buildPuffs(scene, puffs, tex) {
  const n = puffs.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const a = new Float32Array(n * 4), b = new Float32Array(n * 3);
  puffs.forEach((p, i) => { a.set([p.x, p.y, p.z, p.s], i * 4); b.set([Math.random() * 6.28, p.mist ? 1 : 0, 0.5 + Math.random() * 0.5], i * 3); });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(b, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...G, uTex: { value: tex }, uCloudCol: { value: new THREE.Color(1, 1, 1) }, uCloudShade: { value: new THREE.Color(0.6, 0.65, 0.75) } },
    vertexShader: /* glsl */ `
      attribute vec4 aPos; attribute vec3 aSeed; uniform float uTime;
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vSeed;
      void main() {
        vUv = uv; vSeed = aSeed;
        vec3 c = aPos.xyz; c.x += sin(uTime * 0.03 + aSeed.x) * 6.0 * (1.0 - aSeed.y); c.y += sin(uTime * 0.6 + aSeed.x * 3.0) * 0.8 * aSeed.y;
        float rot = aSeed.x + uTime * 0.01; float cs = cos(rot), sn = sin(rot);
        vec2 q = vec2(position.x * cs - position.y * sn, position.x * sn + position.y * cs) * aPos.w;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vWorld = c + right * q.x + up * q.y * (0.62 + 0.38 * aSeed.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform vec3 uCloudCol, uCloudShade; varying vec2 vUv; varying vec3 vWorld; varying vec3 vSeed;
      ${ATMOS_GLSL}
      void main() {
        float a = texture2D(uTex, vUv).a;
        float dist = length(vWorld - cameraPosition);
        a *= smoothstep(6.0, 60.0, dist) * mix(0.46, 0.34, vSeed.y) * vSeed.z;
        if (a < 0.004) discard;
        vec3 col = mix(uCloudShade, uCloudCol, smoothstep(0.1, 0.9, vUv.y));
        col = applyAtmos(col, cameraPosition, vWorld);
        gl_FragColor = vec4(col, a); }`,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.userData.noAO = true; mesh.name = 'puffs'; mesh.renderOrder = 5;
  scene.add(mesh);
  return mesh;
}

// Warm pools of light under street lamps (night only).
export function buildPools(scene, pools) {
  const n = pools.length;
  const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const a = new Float32Array(n * 4);
  pools.forEach((p, i) => a.set(p, i * 4));
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(a, 4));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: G.uNight },
    vertexShader: /* glsl */ `attribute vec4 aPos; varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4(aPos.xyz + position * aPos.w, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uNight; varying vec2 vUv;
      void main() { float r = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 2.2) * uNight;
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * a * 0.55, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.userData.noAO = true; mesh.name = 'pools'; mesh.layers.set(1);
  scene.add(mesh);
  return mesh;
}
