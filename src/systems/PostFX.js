// HDR post chain: MSAA scene → ground-truth AO → bloom → cinematic grade → ACES output.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uVignette: { value: 0.42 }, uSat: { value: 1.08 }, uFlash: { value: 0 }, uFade: { value: 1 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uSat, uFlash, uFade; uniform vec3 uTint; varying vec2 vUv;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * r2 * 0.010).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * r2 * 0.010).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col *= uTint;
      col = mix(col * vec3(0.93, 0.98, 1.08), col * vec3(1.05, 1.0, 0.93), smoothstep(0.0, 0.9, l));
      col *= 1.0 - uVignette * smoothstep(0.08, 0.62, r2);
      col += uFlash * vec3(0.6, 0.65, 0.8);
      col *= 1.0 + (h21(vUv * 913.0 + fract(uTime) * 7.0) - 0.5) * 0.045;
      gl_FragColor = vec4(col * uFade, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));

    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.blendIntensity = 0.95;
    this.gtao.updateGtaoMaterial({ radius: 3.2, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
    // AO may run at reduced resolution (it is blurred and upsampled anyway)
    this.aoScale = 0.5;
    const setSize = this.gtao.setSize.bind(this.gtao);
    this.gtao.setSize = (w, h) => setSize(Math.max(2, Math.round(w * this.aoScale)), Math.max(2, Math.round(h * this.aoScale)));
    // keep unlit / custom-vertex effects out of the AO g-buffer
    this.noAO = [];
    const render = this.gtao.render.bind(this.gtao);
    this.gtao.render = (...args) => {
      const hidden = [];
      for (const o of this.noAO) if (o.visible) { o.visible = false; hidden.push(o); }
      render(...args);
      for (const o of hidden) o.visible = true;
    };
    this.composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.34, 0.75, 1.0);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  collect() {
    this.noAO.length = 0;
    this.scene.traverse((o) => { if (o.userData.noAO || o.isPoints || o.isLine || (o.material && o.material.transparent)) this.noAO.push(o); });
  }
  setSamples(n) {
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== n) { rt.samples = n; rt.dispose(); }
  }
  setSize(w, h, pr) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
  update(t, env, fade) {
    const g = this.grade.uniforms, n = env.night, s = env.sunDir.y;
    g.uTime.value = t; g.uFlash.value = env.flash * 0.25; g.uFade.value = fade;
    const golden = Math.max(0, 1 - Math.abs(s - 0.08) / 0.22) * (1 - env.w.over);
    g.uTint.value.setRGB(1 + golden * 0.06 - n * 0.06, 1 - n * 0.01, 1 - golden * 0.07 + n * 0.1);
    g.uSat.value = 1.08 + golden * 0.08 - env.w.over * 0.18;
    this.bloom.strength = 0.3 + n * 0.32 + golden * 0.1;
    this.bloom.threshold = 1.0 - n * 0.25;
  }
  render() { this.composer.render(); }
}
