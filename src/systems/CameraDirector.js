// Three ways to see the world: a looping cinematic tour, free orbit, and first-person walking / flying.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { height, cityXZ, frame, LEVEL_H, ISLES } from '../world/heightfield.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const ease = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);

function line(p0, p1, l0, l1, dur, fov = 46, e = (u) => u) {
  const a = V(p0), b = V(p1), c = V(l0), d = V(l1);
  return { dur, fov, fn: (u, p, l) => { const k = e(u); p.lerpVectors(a, b, k); l.lerpVectors(c, d, k); p.y = Math.max(p.y, height(p.x, p.z) + 14); } };
}
function arc(center, r0, r1, y0, y1, a0, a1, look, dur, fov = 46) {
  const c = V(center), lk = V(look);
  return { dur, fov, fn: (u, p, l) => { const a = a0 + (a1 - a0) * u, r = r0 + (r1 - r0) * u; p.set(c.x + Math.cos(a) * r, y0 + (y1 - y0) * u, c.z + Math.sin(a) * r); l.copy(lk); } };
}
function promenade(level, d, a0, a1, dur) {
  return { dur, fov: 58, fn: (u, p, l) => {
    const a = a0 + (a1 - a0) * u, [x, z] = cityXZ(d, a), [x2, z2] = cityXZ(d + 3, a + 0.4);
    p.set(x, LEVEL_H[level] + 2.4, z); l.set(x2, LEVEL_H[level] + 5.2, z2);
  } };
}

export class CameraDirector {
  constructor(camera, dom, hooks = {}) {
    this.camera = camera; this.dom = dom; this.hooks = hooks;
    this.mode = 'cinematic';
    this.controls = new OrbitControls(camera, dom);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.06, minDistance: 12, maxDistance: 2600, maxPolarAngle: Math.PI * 0.497, zoomSpeed: 0.9, rotateSpeed: 0.55, panSpeed: 0.9, screenSpacePanning: false });
    this.controls.target.set(0, 95, 0);
    this.controls.enabled = false;
    this.fade = 0; // 0 = black, 1 = visible (applied in the grade pass)
    this.look = new THREE.Vector3(0, 90, 0);
    this.viewDist = 600;
    this.tween = null; this.follow = null; this._followLast = new THREE.Vector3();
    this.keys = {}; this.yaw = 0; this.pitch = 0; this.fly = false; this.vy = 0; this.dragging = false;
    this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');

    const I = ISLES[0];
    this.shots = [
      line([40, 520, 1650], [-60, 150, 800], [0, 150, 0], [0, 92, 0], 17, 44, easeOut),
      line([-380, 9, 690], [-150, 15, 480], [20, 60, 120], [40, 78, 0], 13, 50),
      arc([0, 0, 0], 250, 205, 165, 205, 1.1, 2.3, [0, 140, 0], 15, 46),
      promenade(3, 181.8, 1.02, 1.5, 15),
      line([I.x - 150, I.y + 55, I.z + 150], [I.x - 60, I.y + 30, I.z + 190], [I.x, I.y - 5, I.z], [80, 110, 0], 13, 50),
      line([-420, 150, -520], [-250, 118, -300], [-80, 70, -330], [0, 110, 0], 13, 48),
      arc([255, 0, 478], 150, 120, 26, 60, 0.4, 1.5, [255, 40, 478], 12, 48),
      line([760, 150, 250], [600, 92, 190], [500, 30, 40], [380, 45, 20], 12, 46),
      arc([0, 0, 0], 760, 620, 300, 110, 2.6, 1.75, [0, 85, 0], 16, 40),
    ];
    this.shot = 0; this.shotT = 0;

    dom.addEventListener('pointerdown', (e) => {
      if (this.mode === 'cinematic') { this.setMode('orbit'); return; }
      if (this.mode === 'walk') { this.dragging = true; if (e.pointerType === 'mouse' && dom.requestPointerLock) { try { const r = dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* fall back to drag-look */ } } }
      if (this.follow && e.button === 2) this.follow = null;
    });
    window.addEventListener('pointerup', () => (this.dragging = false));
    dom.addEventListener('wheel', () => { if (this.mode === 'cinematic') this.setMode('orbit'); }, { passive: true });
    window.addEventListener('mousemove', (e) => {
      if (this.mode !== 'walk') return;
      if (document.pointerLockElement === dom || this.dragging) {
        this.yaw -= e.movementX * 0.0022; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0022));
      }
    });
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; if (this.mode === 'walk' && e.code === 'KeyF') { this.fly = !this.fly; hooks.onFly && hooks.onFly(this.fly); } if (this.mode === 'walk' && e.code === 'Space') e.preventDefault(); });
    window.addEventListener('keyup', (e) => (this.keys[e.code] = false));
    window.addEventListener('blur', () => (this.keys = {}));
  }

  setMode(mode) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode; this.follow = null; this.tween = null;
    if (document.pointerLockElement) document.exitPointerLock();
    const cam = this.camera;
    if (mode === 'cinematic') {
      this.controls.enabled = false; this.shotT = 0; this.fadeHold = 0.01;
    } else if (mode === 'orbit') {
      // keep looking where we were looking
      const dir = cam.getWorldDirection(new THREE.Vector3());
      let t;
      if (prev === 'cinematic') t = this.look.clone();
      else t = cam.position.clone().addScaledVector(dir, 120);
      const dist = Math.min(cam.position.distanceTo(t), 900);
      t.copy(cam.position).addScaledVector(dir, Math.max(dist, 40));
      t.y = Math.max(t.y, Math.max(height(t.x, t.z), 0) + 2);
      this.controls.target.copy(t);
      this.setFov(46);
      this.controls.enabled = true; this.controls.update();
    } else if (mode === 'walk') {
      this.controls.enabled = false; this.fly = false;
      let t = this.controls.target, x = t.x, z = t.z;
      if (Math.hypot(x, z) < 75 || Math.hypot(x, z) > 1200 || height(x, z) < 1) { const f = frame(98, Math.PI / 2 - 0.12); x = f.x; z = f.z; this.yaw = Math.atan2(-f.nx, -f.nz) + 0.5; }
      else this.yaw = Math.atan2(cam.position.x - x, cam.position.z - z) + Math.PI;
      this.pitch = -0.02;
      const dest = new THREE.Vector3(x, Math.max(height(x, z), 0.4) + 1.75, z);
      const lk = dest.clone().add(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(30));
      this.flyTo(dest.toArray(), lk.toArray(), 2.4, () => { this.walkReady = true; });
      this.walkReady = false; this.setFov(64);
    }
    this.hooks.onMode && this.hooks.onMode(mode);
  }
  setFov(f) { this._fovTarget = f; }

  flyTo(p, t, dur = 2.4, done) {
    const cam = this.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const l0 = this.mode === 'orbit' ? this.controls.target.clone() : cam.position.clone().addScaledVector(dir, 150);
    this.tween = { p0: cam.position.clone(), l0, p1: V(p), l1: V(t), t: 0, dur, done };
    this.controls.enabled = false; this.follow = null;
  }
  focus(lm) {
    if (this.mode !== 'orbit') { this.setMode('orbit'); }
    if (lm.follow) {
      const o = lm.follow.position, back = new THREE.Vector3(1, 0, 0).applyQuaternion(lm.follow.quaternion);
      this.flyTo([o.x - back.x * 70 + 20, o.y + 26, o.z - back.z * 70 + 20], o.toArray(), 2.6, () => { this.follow = lm.follow; this._followLast.copy(lm.follow.position); });
    } else this.flyTo(lm.view.p, lm.view.t, 2.6);
  }

  update(dt, t) {
    const cam = this.camera;
    if (this._fovTarget && Math.abs(cam.fov - this._fovTarget) > 0.05) { cam.fov += (this._fovTarget - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }

    if (this.tween) {
      const tw = this.tween; tw.t += dt / tw.dur;
      const k = ease(Math.min(tw.t, 1));
      cam.position.lerpVectors(tw.p0, tw.p1, k);
      // lift the path a little so long moves arc over the city
      cam.position.y += Math.sin(k * Math.PI) * Math.min(120, tw.p0.distanceTo(tw.p1) * 0.12);
      this.look.lerpVectors(tw.l0, tw.l1, k);
      cam.lookAt(this.look);
      if (tw.t >= 1) {
        this.tween = null;
        if (this.mode === 'orbit') { this.controls.target.copy(tw.l1); this.controls.enabled = true; this.controls.update(); }
        tw.done && tw.done();
      }
      this.fade = Math.min(1, this.fade + dt * 2);
    } else if (this.mode === 'cinematic') {
      const s = this.shots[this.shot];
      this.shotT += dt;
      const u = Math.min(this.shotT / s.dur, 1);
      s.fn(u, this._p, this._l);
      cam.position.copy(this._p); this.look.copy(this._l); cam.lookAt(this._l);
      this.setFov(s.fov);
      const F = 0.9, intro = this.shot === 0 && !this._introDone;
      const fin = Math.min(1, this.shotT / (intro ? 2.6 : F)), fout = Math.min(1, (s.dur - this.shotT) / F);
      this.fade = ease(Math.max(0, Math.min(fin, fout)));
      if (this.shotT >= s.dur) { this._introDone = true; this.shot = (this.shot + 1) % this.shots.length; if (this.shot === 0) this.shot = 1; this.shotT = 0; }
    } else if (this.mode === 'orbit') {
      if (this.follow) {
        const d = this._p.copy(this.follow.position).sub(this._followLast);
        cam.position.add(d); this.controls.target.copy(this.follow.position); this._followLast.copy(this.follow.position);
      }
      this.controls.update();
      const g = Math.max(height(cam.position.x, cam.position.z), 0) + 2.5;
      if (cam.position.y < g) cam.position.y = g;
      this.look.copy(this.controls.target);
      this.fade = Math.min(1, this.fade + dt * 2);
    } else if (this.mode === 'walk') {
      const K = this.keys, sp = (this.fly ? 46 : 5.2) * (K.ShiftLeft || K.ShiftRight ? 2.8 : 1);
      const f = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), r = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const n = Math.hypot(f, r) || 1;
      cam.position.x += ((-sy * f + cy * r) / n) * sp * dt;
      cam.position.z += ((-cy * f - sy * r) / n) * sp * dt;
      const ground = Math.max(height(cam.position.x, cam.position.z), 0.3) + 1.75;
      if (this.fly) {
        cam.position.y += ((K.Space ? 1 : 0) - (K.KeyC || K.ControlLeft ? 1 : 0) + f * Math.sin(this.pitch)) * sp * dt;
        if (cam.position.y < ground) cam.position.y = ground;
      } else {
        if (K.Space && cam.position.y - ground < 0.05) this.vy = 5.5;
        this.vy -= 16 * dt; cam.position.y += this.vy * dt;
        if (cam.position.y < ground) { cam.position.y += (ground - cam.position.y) * Math.min(1, dt * 12); if (cam.position.y < ground - 0.6) cam.position.y = ground - 0.6; this.vy = Math.max(this.vy, 0); }
        else if (cam.position.y - ground > 2.5 && this.vy <= 0) { /* stepping off a terrace: fall */ }
        // gentle head bob
        if (f || r) cam.position.y += Math.sin(t * (sp > 6 ? 13 : 9)) * 0.012;
      }
      this._e.set(this.pitch, this.yaw, 0); cam.quaternion.setFromEuler(this._e);
      this.look.copy(cam.position).add(this._p.set(-sy, 0, -cy).multiplyScalar(40));
      this.fade = Math.min(1, this.fade + dt * 2);
    }
    this.viewDist = this.mode === 'walk' && !this.fly ? 40 : cam.position.distanceTo(this.look);
    cam.near = this.mode === 'walk' ? 0.25 : Math.min(2.5, Math.max(0.6, this.viewDist * 0.004));
    cam.updateProjectionMatrix();
  }
}
