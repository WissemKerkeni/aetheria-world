// Day/night cycle, weather and all lighting state. One update() drives the sun,
// moon, sky dome, fog, ocean colours, image-based lighting and shadow framing.
import * as THREE from 'three';
import { G } from '../core/materials.js';
import { Sky } from '../world/Sky.js';

const st = (arr) => arr.map(([s, c]) => [s, new THREE.Color().setRGB(c[0], c[1], c[2])]);
function sample(stops, s, out) {
  if (s <= stops[0][0]) return out.copy(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (s <= stops[i][0]) return out.copy(stops[i - 1][1]).lerp(stops[i][1], (s - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return out.copy(stops[stops.length - 1][1]);
}
const SUN = st([[-0.1, [1, 0.3, 0.12]], [0.0, [1, 0.4, 0.16]], [0.1, [1, 0.58, 0.3]], [0.28, [1, 0.82, 0.62]], [0.6, [1, 0.95, 0.88]]]);
const ZEN = st([[-0.3, [0.003, 0.006, 0.018]], [-0.1, [0.018, 0.03, 0.09]], [0.0, [0.06, 0.11, 0.3]], [0.15, [0.085, 0.2, 0.52]], [0.5, [0.07, 0.21, 0.62]]]);
const HOR = st([[-0.3, [0.01, 0.017, 0.04]], [-0.12, [0.07, 0.055, 0.1]], [-0.03, [0.5, 0.22, 0.14]], [0.05, [0.9, 0.47, 0.22]], [0.2, [0.72, 0.62, 0.52]], [0.5, [0.46, 0.63, 0.86]]]);

export const WEATHER = {
  clear: { label: 'Clear', cover: 0.4, fog: 0.00036, sun: 1, over: 0, rain: 0, wind: 1 },
  mist: { label: 'Sea mist', cover: 0.56, fog: 0.0024, sun: 0.62, over: 0.42, rain: 0, wind: 0.45 },
  storm: { label: 'Storm', cover: 1.0, fog: 0.0013, sun: 0.14, over: 0.92, rain: 1, wind: 2.6 },
};
const sm = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.time = 17.2; this.speed = 0.02; this.weather = 'clear';
    this.w = { ...WEATHER.clear };
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3(); this.lightDir = new THREE.Vector3();
    this.night = 0; this.flash = 0; this._flashT = 3;
    this.sky = new Sky(); scene.add(this.sky.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 3600;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this._envRT = null; this._envClock = 0; this._envKey = -99;
    this.shadowSize = 0;
    this.c = { sun: new THREE.Color(), zen: new THREE.Color(), hor: new THREE.Color(), tmp: new THREE.Color(), glow: new THREE.Color(), light: new THREE.Color() };
    this.water = null; this.puffs = null; this.rain = null;
  }
  setWeather(name) { this.weather = name; }
  setShadowQuality(size) {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  update(dt, t, camera, focus, viewDist) {
    const c = this.c;
    // --- time & weather interpolation
    const target = WEATHER[this.weather], k = 1 - Math.exp(-dt * 0.55);
    for (const key of ['cover', 'fog', 'sun', 'over', 'rain', 'wind']) this.w[key] += (target[key] - this.w[key]) * k;
    const w = this.w;
    this.time = (this.time + dt * this.speed * (1 + 2.2 * this.night) + 24) % 24;

    // --- celestial geometry
    const a = ((this.time - 6) / 24) * Math.PI * 2, tilt = 0.6;
    this.sunDir.set(Math.cos(a), Math.sin(a) * Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
    const am = a + Math.PI + 0.45;
    this.moonDir.set(Math.cos(am), Math.sin(am) * Math.cos(0.42), Math.sin(am) * Math.sin(0.42) + 0.25).normalize();
    const s = this.sunDir.y;
    const night = (this.night = sm(0.06, -0.14, s));
    const dayF = sm(-0.08, 0.18, s);

    // --- palette
    sample(SUN, s, c.sun); sample(ZEN, s, c.zen); sample(HOR, s, c.hor);
    const grayZ = (c.zen.r + c.zen.g + c.zen.b) / 3 * 1.15, grayH = (c.hor.r + c.hor.g + c.hor.b) / 3 * 0.8;
    c.zen.lerp(c.tmp.setRGB(grayZ * 0.85, grayZ * 0.92, grayZ), w.over);
    c.hor.lerp(c.tmp.setRGB(grayH * 0.95, grayH, grayH * 1.05), w.over);
    const gloom = 1 - 0.62 * w.rain;
    c.zen.multiplyScalar(gloom); c.hor.multiplyScalar(gloom);

    // --- lightning
    if (w.rain > 0.5) {
      this._flashT -= dt;
      if (this._flashT < 0) { this.flash = 1; this._flashT = 2.5 + Math.random() * 7; }
    }
    this.flash *= Math.exp(-dt * 7);
    const fl = this.flash * (0.6 + 0.4 * Math.sin(t * 60));

    // --- main light (sun by day, moon by night)
    const sunI = sm(-0.04, 0.1, s) * 4.4 * w.sun;
    const moonI = sm(0.0, -0.12, s) * sm(-0.06, 0.12, this.moonDir.y) * 0.5 * (0.35 + 0.65 * w.sun);
    const useSun = sunI >= moonI;
    this.lightDir.copy(useSun ? this.sunDir : this.moonDir);
    c.light.copy(useSun ? c.sun : c.tmp.setRGB(0.55, 0.68, 1.0));
    this.sun.color.copy(c.light); this.sun.intensity = Math.max(sunI, moonI);
    // shadow frustum follows the point of interest; texel-snapped to limit shimmer
    const size = viewDist < 90 ? 150 : viewDist < 330 ? 320 : viewDist < 800 ? 560 : 950;
    if (size !== this.shadowSize) {
      this.shadowSize = size; const sc = this.sun.shadow.camera;
      sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.updateProjectionMatrix();
      this.sun.shadow.normalBias = 0.25 + size * 0.0012;
    }
    const q = size / 64;
    const fx = Math.round(focus.x / q) * q, fy = Math.round(focus.y / q) * q, fz = Math.round(focus.z / q) * q;
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx + this.lightDir.x * 1700, fy + this.lightDir.y * 1700, fz + this.lightDir.z * 1700);
    this.sun.target.updateMatrixWorld();

    // --- ambient
    this.hemi.color.setRGB(c.zen.r * 1.0 + c.hor.r * 0.55 + 0.016 * night, c.zen.g * 1.0 + c.hor.g * 0.55 + 0.028 * night, c.zen.b * 1.0 + c.hor.b * 0.55 + 0.06 * night);
    this.hemi.groundColor.setRGB(c.hor.r * 0.3 + 0.05 * dayF, c.hor.g * 0.27 + 0.045 * dayF, c.hor.b * 0.22 + 0.035 * dayF + 0.01 * night);
    this.hemi.intensity = 0.62 + night * 0.9 + fl * 5 + w.over * 0.55 - w.rain * 0.2;
    this.renderer.toneMappingExposure = 0.8 + night * 0.62 + w.over * 0.16 * dayF;

    // --- sky dome
    const U = this.sky.uniforms;
    U.uZenith.value.copy(c.zen); U.uHorizon.value.copy(c.hor);
    U.uSunDir.value.copy(this.sunDir); U.uMoonDir.value.copy(this.moonDir);
    U.uSunColor.value.copy(c.sun).multiplyScalar(sm(-0.03, 0.02, s) * (1 - w.over));
    c.glow.copy(c.sun).multiplyScalar(sm(-0.22, 0.04, s) * (1.5 - 0.8 * sm(0.1, 0.5, s)) * (1 - w.over * 0.85));
    U.uSunGlow.value.copy(c.glow);
    U.uTime.value = t; U.uCoverage.value = w.cover; U.uFlash.value = fl;
    U.uStars.value = night * (1 - w.over);
    U.uAurora.value = sm(0.6, 1.0, night) * (1 - w.over) * (0.55 + 0.45 * Math.sin(t * 0.05));
    U.uCloudOff.value.set(t * 0.006 * (0.4 + w.wind), t * 0.0025 * (0.4 + w.wind));
    const cb = dayF * (1.25 - w.over * 0.5 - w.rain * 0.5) + night * 0.05;
    U.uCloudLight.value.setRGB((0.55 + 0.45 * c.sun.r) * cb + c.hor.r * 0.25, (0.55 + 0.45 * c.sun.g) * cb + c.hor.g * 0.25, (0.55 + 0.45 * c.sun.b) * cb + c.hor.b * 0.25 + night * 0.02);
    const dk = 0.75 - w.over * 0.3;
    U.uCloudDark.value.setRGB((c.zen.r * 0.55 + c.hor.r * 0.45) * dk + 0.004, (c.zen.g * 0.55 + c.hor.g * 0.45) * dk + 0.006, (c.zen.b * 0.55 + c.hor.b * 0.45) * dk + 0.012);

    // --- shared uniforms
    G.uTime.value = t; G.uNight.value = night; G.uWind.value = w.wind;
    G.uSunDirG.value.copy(this.sunDir);
    G.uFogColor.value.setRGB(c.hor.r * 0.8 + c.zen.r * 0.2, c.hor.g * 0.8 + c.zen.g * 0.2, c.hor.b * 0.8 + c.zen.b * 0.2);
    G.uFogSunColor.value.copy(G.uFogColor.value).lerp(c.glow, 0.55).add(c.tmp.copy(c.glow).multiplyScalar(0.25));
    G.uFogParams.value.set(w.fog, 0.0055 - w.over * 0.002, 7, 1);
    G.uLightCol.value.setRGB(
      c.light.r * this.sun.intensity * 0.3 + this.hemi.color.r * 0.75 + fl,
      c.light.g * this.sun.intensity * 0.3 + this.hemi.color.g * 0.75 + fl,
      c.light.b * this.sun.intensity * 0.3 + this.hemi.color.b * 0.75 + fl);

    // --- ocean
    if (this.water) {
      const W = this.water.uniforms;
      W.uZenith.value.copy(c.zen); W.uHorizon.value.copy(c.hor); W.uSunGlow.value.copy(c.glow);
      W.uLightDir.value.copy(this.lightDir);
      W.uLightColor.value.copy(c.light).multiplyScalar(this.sun.intensity * (useSun ? 1 : 2.2));
      const lum = 0.05 + dayF * (1 - w.over * 0.6) + night * 0.02;
      W.uDeep.value.setRGB(0.006 * lum + c.zen.r * 0.12, 0.05 * lum + c.zen.g * 0.14, 0.085 * lum + c.zen.b * 0.14);
      W.uShallow.value.setRGB(0.04 * lum + c.hor.r * 0.04, 0.3 * lum + c.hor.g * 0.05, 0.3 * lum + c.hor.b * 0.05);
    }
    if (this.puffs) {
      const P = this.puffs.material.uniforms;
      P.uCloudCol.value.copy(U.uCloudLight.value); P.uCloudShade.value.copy(U.uCloudDark.value).lerp(U.uCloudLight.value, 0.25);
    }
    if (this.rain) { this.rain.uniforms.uRain.value = w.rain; this.rain.lines.visible = w.rain > 0.02; }

    // --- image-based lighting, refreshed when the sky has visibly changed
    this._envClock -= dt;
    const key = this.time * 12 + w.over * 40 + Math.round(fl * 2);
    if (this._envClock <= 0 && Math.abs(key - this._envKey) > 0.6) {
      this._envClock = 0.35; this._envKey = key;
      const rt = this.pmrem.fromScene(this.sky.envScene, 0, 0.1, 100);
      if (this._envRT) this._envRT.dispose();
      this._envRT = rt; this.scene.environment = rt.texture;
    }
    this.scene.environmentIntensity = 0.42;
  }

  describe() {
    const t = this.time;
    const part = t < 5 ? 'Deep night' : t < 7 ? 'Dawn' : t < 11 ? 'Morning' : t < 15 ? 'Midday' : t < 17.2 ? 'Afternoon' : t < 18.6 ? 'Golden hour' : t < 20 ? 'Dusk' : 'Night';
    return `${part} · ${WEATHER[this.weather].label}`;
  }
}
