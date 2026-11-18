import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 uZenith, uHorizon, uSunDir, uMoonDir, uSunColor, uSunGlow, uCloudLight, uCloudDark;
uniform float uTime, uCoverage, uStars, uFlash, uAurora;
uniform vec2 uCloudOff;
varying vec3 vDir;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = mat2(1.62, 1.21, -1.21, 1.62) * p + vec2(17.1, 9.2); a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, 1.0 - pow(1.0 - h, 3.4));
  col = mix(col, uHorizon * 0.6, smoothstep(0.0, -0.3, d.y));
  float sd = max(dot(d, uSunDir), 0.0);
  float hz = 1.0 - h;
  col += uSunGlow * (pow(sd, 5.0) * 0.26 * hz * hz + pow(sd, 40.0) * 0.32 + pow(sd, 500.0) * 1.3);

  if (uStars > 0.01 && d.y > -0.05) {
    vec3 p = d * 190.0; vec3 ip = floor(p); vec3 fp = fract(p) - 0.5;
    float r = hash31(ip);
    float st = step(0.984, r) * smoothstep(0.42, 0.04, length(fp));
    float tw = 0.65 + 0.35 * sin(uTime * 2.4 + r * 640.0);
    vec3 tint = mix(vec3(1.0, 0.82, 0.65), vec3(0.72, 0.85, 1.2), fract(r * 91.7));
    col += tint * st * tw * uStars * (0.5 + 3.5 * fract(r * 77.0));
    float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.45, -0.82))) * 3.4, 2.0));
    col += vec3(0.07, 0.085, 0.15) * band * (0.4 + fbm(d.xz * 7.0 + d.y * 5.0)) * uStars * 0.6;
  }
  if (uAurora > 0.01) {
    float ax = atan(d.x, -d.z);
    float curt = pow(vnoise(vec2(ax * 5.0 + uTime * 0.04, uTime * 0.02)), 2.0);
    float ray = 0.55 + 0.45 * sin(ax * 46.0 + vnoise(vec2(ax * 9.0, uTime * 0.25)) * 7.0);
    float m = smoothstep(0.06, 0.2, d.y) * smoothstep(0.72, 0.22, d.y) * smoothstep(0.25, -0.5, d.z);
    col += mix(vec3(0.05, 0.9, 0.45), vec3(0.45, 0.2, 0.9), smoothstep(0.25, 0.65, d.y)) * curt * ray * m * uAurora * 0.55;
  }
  float md = max(dot(d, uMoonDir), 0.0);
  float moon = smoothstep(0.99952, 0.99972, md);
  col += vec3(0.95, 0.97, 1.0) * moon * 2.4 * (0.72 + 0.28 * vnoise(d.xy * 260.0 + d.z * 90.0));
  col += vec3(0.2, 0.27, 0.42) * (pow(md, 120.0) * 0.5 + pow(md, 12.0) * 0.06) * (0.3 + uStars);
  col += uSunColor * smoothstep(0.99972, 0.9999, sd) * 34.0 * step(-0.01, d.y);

  if (d.y > 0.004) {
    vec2 cp = d.xz / (d.y + 0.1);
    vec2 q = mat2(0.86, 0.5, -0.5, 0.86) * cp * 0.85 + uCloudOff;
    float d1 = fbm(q);
    float d2 = fbm(q * 2.6 + vec2(4.2, 1.7) + uTime * 0.004);
    float base = d1 * 0.68 + d2 * 0.32;
    float th = mix(0.9, 0.3, uCoverage);
    float dens = smoothstep(th, th + 0.24, base);
    float lit = clamp((base - fbm(q + uSunDir.xz * 0.22)) * 2.4 + 0.55, 0.0, 1.0);
    vec3 cl = mix(uCloudDark, uCloudLight, lit * (1.0 - dens * 0.5));
    cl += uSunGlow * pow(sd, 9.0) * 0.55 * (1.0 - dens * 0.8);
    cl += uFlash * vec3(0.8, 0.86, 1.0) * 2.2 * d1;
    float fade = smoothstep(0.004, 0.17, d.y);
    col = mix(col, cl, dens * fade);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunColor: { value: new THREE.Color() }, uSunGlow: { value: new THREE.Color() },
      uCloudLight: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      uTime: { value: 0 }, uCoverage: { value: 0.4 }, uStars: { value: 0 }, uFlash: { value: 0 }, uAurora: { value: 0 },
      uCloudOff: { value: new THREE.Vector2() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: true,
    });
    const geo = new THREE.SphereGeometry(10, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.userData.noAO = true;
    this.mesh.name = 'sky';
    // separate tiny scene for image-based lighting capture
    this.envScene = new THREE.Scene();
    const m2 = new THREE.Mesh(geo, this.material); m2.frustumCulled = false;
    this.envScene.add(m2);
  }
}
