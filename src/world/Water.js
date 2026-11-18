// Ocean: planar reflection (half-res, oblique clipped) + analytic sky fallback,
// animated normals, fresnel, sun glitter, depth-based shallows and shore foam.
import * as THREE from 'three';
import { G, ATMOS_GLSL } from '../core/materials.js';
import { TERRAIN } from './Terrain.js';

const VERT = /* glsl */ `
varying vec3 vWorld; varying vec4 vClip;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vClip = projectionMatrix * viewMatrix * w;
  gl_Position = vClip;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uRefl, uHeightTex, uNormalTex;
uniform float uUseRefl, uTime, uWind;
uniform vec4 uRect;
uniform vec3 uZenith, uHorizon, uLightDir, uLightColor, uDeep, uShallow, uSunGlow;
uniform vec3 uLightCol;
varying vec3 vWorld; varying vec4 vClip;
${ATMOS_GLSL}
void main() {
  vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  vec2 uv = vWorld.xz; float t = uTime;
  vec2 n1 = texture2D(uNormalTex, uv * 0.0065 + t * vec2(0.006, 0.004)).xy - 0.5;
  vec2 n2 = texture2D(uNormalTex, uv * 0.028 + t * vec2(-0.016, 0.012)).xy - 0.5;
  vec2 n3 = texture2D(uNormalTex, uv * 0.11 + t * vec2(0.03, -0.045)).xy - 0.5;
  vec2 n4 = texture2D(uNormalTex, uv * 0.43 + t * vec2(-0.07, 0.06)).xy - 0.5;
  float nearF = 1.0 - smoothstep(60.0, 700.0, dist);
  float farF = 1.0 - smoothstep(400.0, 5000.0, dist);
  vec2 nxy = n1 * 1.5 + n2 * 1.0 * (0.35 + 0.65 * farF) + (n3 * 0.6 + n4 * 0.35) * nearF;
  float amp = (0.6 + 0.35 * uWind) * (0.55 + 0.45 * farF);
  vec3 N = normalize(vec3(nxy.x * amp, 1.0, nxy.y * amp));

  vec2 huv = (vWorld.xz - uRect.xy) / uRect.zw;
  float hgt = -30.0;
  if (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) hgt = texture2D(uHeightTex, huv).r * 40.0 - 30.0;
  float depth = max(-hgt, 0.0);

  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uZenith, 1.0 - pow(1.0 - clamp(R.y, 0.0, 1.0), 3.4));
  float sdR = max(dot(R, uSunDirG), 0.0);
  sky += uSunGlow * (pow(sdR, 5.0) * 0.2 + pow(sdR, 40.0) * 0.3);
  vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5; suv.y = 1.0 - suv.y;
  suv += vec2(N.x * 0.05, N.z * 0.11) * (0.5 + 0.5 * nearF);
  vec3 refl = texture2D(uRefl, clamp(suv, 0.002, 0.998)).rgb;
  vec3 reflCol = mix(sky, refl, uUseRefl);

  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 11.0, depth));
  // cheap subsurface glow on wave faces toward the light
  body += uShallow * 0.25 * pow(max(dot(V, -uLightDir), 0.0), 3.0) * max(N.x * uLightDir.x + N.z * uLightDir.z, 0.0);
  vec3 col = mix(body, reflCol, fres);

  float sp = max(dot(reflect(-V, N), uLightDir), 0.0);
  col += uLightColor * (pow(sp, 900.0) * 9.0 + pow(sp, 90.0) * 0.35);

  float fn = texture2D(uNormalTex, uv * 0.09 + t * vec2(0.02, 0.01)).b + n3.x;
  float foam = smoothstep(1.5, 0.0, depth + fn * 1.2 - 0.25 * sin(t * 0.9 + uv.x * 0.05 + uv.y * 0.04));
  foam += smoothstep(0.82, 1.0, 0.5 + n2.x + n3.y * 0.6) * 0.14 * nearF * uWind;
  col = mix(col, uLightCol * 0.85, clamp(foam, 0.0, 1.0) * 0.85 * step(hgt, 0.3));

  col = applyAtmos(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  constructor(T, heightTex) {
    this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 });
    this.uniforms = {
      ...G,
      uRefl: { value: this.rt.texture }, uHeightTex: { value: heightTex }, uNormalTex: { value: T.waterNormal },
      uUseRefl: { value: 1 },
      uRect: { value: new THREE.Vector4(TERRAIN.cx - TERRAIN.size / 2, TERRAIN.cz - TERRAIN.size / 2, TERRAIN.size, TERRAIN.size) },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunGlow: { value: new THREE.Color() },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLightColor: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG });
    const geo = new THREE.PlaneGeometry(18000, 18000, 1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.enabled = true;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(0);
    this._plane = new THREE.Plane(); this._q = new THREE.Vector4(); this._clip = new THREE.Vector4();
    this._dir = new THREE.Vector3();
  }
  setSize(w, h) { this.rt.setSize(Math.max(2, Math.floor(w / 2)), Math.max(2, Math.floor(h / 2))); }

  renderReflection(renderer, scene, camera) {
    this.uniforms.uUseRefl.value = this.enabled ? 1 : 0;
    if (!this.enabled) return;
    const rc = this.cam;
    rc.fov = camera.fov; rc.aspect = camera.aspect; rc.near = camera.near; rc.far = camera.far;
    rc.updateProjectionMatrix();
    camera.getWorldDirection(this._dir);
    const p = camera.position;
    rc.position.set(p.x, -p.y, p.z);
    rc.up.set(0, 1, 0);
    rc.lookAt(p.x + this._dir.x * 100, -(p.y + this._dir.y * 100), p.z + this._dir.z * 100);
    rc.updateMatrixWorld();
    rc.matrixWorldInverse.copy(rc.matrixWorld).invert();
    // oblique near plane at the water surface
    const plane = this._plane.set(new THREE.Vector3(0, 1, 0), 0.4).applyMatrix4(rc.matrixWorldInverse);
    const clip = this._clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rc.projectionMatrix, q = this._q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0; pm.elements[14] = clip.w;

    this.mesh.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, rc);
    renderer.setRenderTarget(prev);
    this.mesh.visible = true;
  }
}
