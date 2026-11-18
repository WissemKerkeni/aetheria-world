// Landmark picking: projected markers, hover highlight ring, click-to-focus with an info card.
import * as THREE from 'three';
import { beamMaterial } from '../world/fx.js';

export class Interaction {
  constructor(camera, dom, scene, landmarks, director, hud) {
    this.camera = camera; this.dom = dom; this.landmarks = landmarks; this.director = director; this.hud = hud;
    this.hover = null; this.selected = null;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this._v = new THREE.Vector3(); this._s = new THREE.Sphere();
    this.container = document.getElementById('markers');
    for (const lm of landmarks) {
      const el = document.createElement('button');
      el.className = 'marker'; el.innerHTML = `<i></i><span>${lm.name}</span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); this.select(lm); });
      this.container.appendChild(el); lm.el = el;
    }
    // selection halo: a soft column of light at the hovered landmark
    this.halo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0), beamMaterial('#ffd98a', 0.0, 1.4));
    this.halo.userData.noAO = true; this.halo.visible = false; this.halo.rotation.x = Math.PI; scene.add(this.halo);

    let down = null;
    dom.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    dom.addEventListener('pointermove', (e) => { this.px = e.clientX; this.py = e.clientY; this.dirty = true; });
    dom.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      if (director.mode !== 'orbit' || director.tween) return;
      const lm = this.pick(e.clientX, e.clientY);
      if (lm) this.select(lm);
    });
  }
  pick(x, y) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    let best = null, bd = Infinity;
    for (const lm of this.landmarks) {
      const c = lm.follow ? lm.follow.position : lm.pos;
      this._s.set(c, lm.radius);
      const hit = this.ray.ray.intersectSphere(this._s, this._v);
      if (hit) { const d = hit.distanceTo(this.camera.position); if (d < bd) { bd = d; best = lm; } }
    }
    return best;
  }
  select(lm) {
    this.selected = lm;
    this.director.focus(lm);
    this.hud.showInfo(lm);
  }
  update(dt, t) {
    const orbit = this.director.mode === 'orbit';
    this.container.style.opacity = orbit ? 1 : 0;
    this.container.style.pointerEvents = orbit ? '' : 'none';
    if (orbit && this.dirty && !this.director.tween) {
      this.dirty = false;
      const lm = this.pick(this.px, this.py);
      if (lm !== this.hover) { this.hover = lm; this.dom.style.cursor = lm ? 'pointer' : ''; }
    }
    if (!orbit) this.hover = null;
    const w = this.dom.clientWidth, h = this.dom.clientHeight;
    for (const lm of this.landmarks) {
      const c = lm.follow ? lm.follow.position : lm.pos;
      this._v.copy(c); this._v.y += lm.radius * 0.55;
      const dist = this._v.distanceTo(this.camera.position);
      this._v.project(this.camera);
      const vis = this._v.z < 1 && Math.abs(this._v.x) < 1.05 && Math.abs(this._v.y) < 1.05 && dist > lm.radius * 1.2;
      lm.el.style.display = vis ? '' : 'none';
      if (vis) {
        lm.el.style.transform = `translate(${((this._v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this._v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
        lm.el.classList.toggle('hot', lm === this.hover || lm === this.selected);
      }
    }
    const hl = this.hover;
    const m = this.halo.material.uniforms.uOpacity;
    m.value += ((hl ? 0.22 : 0) - m.value) * Math.min(1, dt * 6);
    this.halo.visible = m.value > 0.004;
    if (hl) {
      const c = hl.follow ? hl.follow.position : hl.pos;
      this.halo.position.set(c.x, c.y + hl.radius * 2.4, c.z);
      this.halo.scale.set(hl.radius * (0.9 + 0.05 * Math.sin(t * 3)), hl.radius * 3.6, hl.radius * (0.9 + 0.05 * Math.sin(t * 3)));
    }
  }
}
