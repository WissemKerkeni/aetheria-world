import * as THREE from 'three';
import { buildTextures } from './core/textures.js';
import { buildMaterials, M, G } from './core/materials.js';
import { Kit } from './world/kit.js';
import { registerProtos } from './world/protos.js';
import { registerVegetation, scatterVegetation } from './world/Vegetation.js';
import { buildTerrain } from './world/Terrain.js';
import { Water } from './world/Water.js';
import { buildCity } from './world/City.js';
import { buildLandmarks } from './world/Landmarks.js';
import { buildIsles } from './world/Isles.js';
import { buildLife, addCloudBanks } from './world/Life.js';
import { buildFalls, buildPuffs, buildPools } from './world/fx.js';
import { Environment } from './systems/Environment.js';
import { PostFX } from './systems/PostFX.js';
import { CameraDirector } from './systems/CameraDirector.js';
import { Interaction } from './systems/Interaction.js';
import { HUD } from './ui/HUD.js';

const params = new URLSearchParams(location.search);
const dpr = window.devicePixelRatio || 1;
const QUALITY = {
  low: { pr: Math.min(dpr, 1), refl: false, ao: false, aoScale: 0.5, shadow: 2048, msaa: 2 },
  medium: { pr: Math.min(dpr, 1), refl: true, ao: true, aoScale: 0.5, shadow: 2048, msaa: 2 },
  high: { pr: Math.min(dpr, 1.25), refl: true, ao: true, aoScale: 0.5, shadow: 4096, msaa: 4 },
  ultra: { pr: Math.min(dpr, 2), refl: true, ao: true, aoScale: 1, shadow: 4096, msaa: 4 },
};

const canvas = document.getElementById('scene');
const loader = { el: document.getElementById('loader'), bar: document.getElementById('loader-bar'), label: document.getElementById('loader-label') };
// yield to the browser so the loader can paint (falls back to a timer in background tabs)
const tick = () => new Promise((r) => { const id = setTimeout(r, 80); requestAnimationFrame(() => { clearTimeout(id); setTimeout(r, 0); }); });

async function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 1, 9000);
  camera.layers.enable(1);
  camera.position.set(40, 520, 1650);

  const app = { renderer, scene, camera, quality: QUALITY[params.get('q')] ? params.get('q') : 'high', dyn: [], timeGlide: null };
  const ctx = { scene, dyn: app.dyn, quality: app.quality, kit: new Kit() };
  const kit = ctx.kit;
  const steps = [
    ['Quarrying marble', () => { app.T = buildTextures(); buildMaterials(app.T); registerProtos(kit); registerVegetation(kit); }],
    ['Raising the mountains', () => { app.terrain = buildTerrain(scene, app.T); }],
    ['Laying terraces and streets', () => buildCity(kit)],
    ['Building temples and aqueducts', () => { app.lm = buildLandmarks(ctx); }],
    ['Lifting the skyward isles', () => { app.isles = buildIsles(ctx); addCloudBanks(kit); }],
    ['Planting forests and meadows', () => scatterVegetation(kit, app.quality)],
    ['Assembling the city', () => { app.meshes = kit.build(scene, M); }],
    ['Filling the harbor and the sky', () => {
      app.life = buildLife(ctx, app.lm.harbor);
      app.falls = buildFalls(scene, kit.falls);
      app.puffs = buildPuffs(scene, kit.puffs, app.T.puff);
      app.pools = buildPools(scene, kit.pools);
    }],
    ['Lighting the sun', () => {
      app.env = new Environment(renderer, scene);
      app.water = new Water(app.T, app.terrain.heightTex); scene.add(app.water.mesh);
      app.env.water = app.water; app.env.puffs = app.puffs; app.env.rain = app.life.rain;
      if (params.get('t')) app.env.time = parseFloat(params.get('t'));
      app.post = new PostFX(renderer, scene, camera);
      app.post.collect();
    }],
  ];
  for (let i = 0; i < steps.length; i++) {
    loader.label.textContent = steps[i][0] + '…';
    loader.bar.style.transform = `scaleX(${(i + 0.4) / (steps.length + 1)})`;
    await tick();
    steps[i][1]();
  }

  const { env, post, water } = app;
  const hudHooks = {};
  const director = (app.director = new CameraDirector(camera, canvas, {
    onMode: (m) => hudHooks.mode && hudHooks.mode(m),
    onFly: (f) => app.hud.toast(f ? 'Flight enabled — Space / C to rise and sink' : 'Back on foot'),
  }));

  // landmarks (static + moving)
  const landmarks = [...app.lm.list, app.isles.landmark];
  for (const a of app.life.airships) landmarks.push({ id: a.name, name: a.name, sub: 'In flight above the bay', pos: a.object.position, radius: 20, follow: a.object,
    desc: 'A silk-and-cedar skyship on its circuit between the isles. Select it to fly alongside; right-click to let it go.' });
  for (const v of app.life.vessels) landmarks.push({ id: v.name, name: v.name, sub: 'Under sail', pos: v.object.position, radius: 22, follow: v.object,
    desc: 'A three-masted galleon beating around the headland with the evening wind.' });
  const hud = (app.hud = new HUD(app));
  hudHooks.mode = (m) => hud.setMode(m);
  hud.buildPlaces(landmarks);
  const interaction = (app.interaction = new Interaction(camera, canvas, scene, landmarks, director, hud));
  post.collect();

  app.setQuality = (name, announce) => {
    const q = QUALITY[name]; app.quality = name;
    water.enabled = q.refl; post.gtao.enabled = q.ao; post.aoScale = q.aoScale; post.setSamples(q.msaa); env.setShadowQuality(q.shadow);
    document.getElementById('quality').value = name;
    resize();
    if (announce) hud.toast(`Quality: ${name}`);
  };
  app.glideTime = (target) => { const d = ((target - env.time) % 24 + 24) % 24; app.timeGlide = { from: env.time, delta: d, t: 0 }; };

  function resize() {
    const w = innerWidth, h = innerHeight, pr = QUALITY[app.quality].pr;
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.setSize(w, h, pr);
    water.setSize(w * pr, h * pr);
    app.life.motes.uniforms.uScale.value = h * pr * 0.55;
  }
  window.addEventListener('resize', resize);
  app.setQuality(app.quality, false);

  loader.label.textContent = 'Opening the sea gate…';
  loader.bar.style.transform = 'scaleX(0.96)';
  await tick();
  env.update(0.016, 0, camera, director.look, 800);
  try { renderer.compile(scene, camera); } catch (e) { console.warn(e); }
  await tick();

  const clock = new THREE.Clock();
  let t = 0, frames = 0, acc = 0, slow = 0, started = false;
  const focus = new THREE.Vector3();
  function step(dt) {
    t += dt;
    if (app.timeGlide) {
      const g = app.timeGlide; g.t = Math.min(1, g.t + dt / 3.5);
      const k = g.t * g.t * (3 - 2 * g.t);
      env.time = (g.from + g.delta * k) % 24;
      if (g.t >= 1) app.timeGlide = null;
    }
    director.update(dt, t);
    focus.copy(director.mode === 'walk' ? camera.position : director.look);
    if (director.mode !== 'walk' && camera.position.distanceTo(focus) > 1200) focus.lerp(camera.position, 0.3);
    env.update(app.timeGlide ? 0 : dt, t, camera, focus, director.viewDist);
    for (const fn of app.dyn) fn(t, dt);
    interaction.update(dt, t);
    water.renderReflection(renderer, scene, camera);
    renderer.shadowMap.needsUpdate = true;
    post.update(t, env, director.fade);
    post.render();
  }
  app.step = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) step(dt); };
  function frame() {
    requestAnimationFrame(frame);
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05);
    step(dt);

    frames++; acc += raw;
    let fpsText = null;
    if (acc >= 1.5) {
      const fps = frames / acc; fpsText = `${fps.toFixed(0)} fps`;
      if (started && !document.hidden && document.hasFocus() && params.get('auto') !== '0' && t > 8) {
        slow = fps < 24 ? slow + 1 : 0;
        if (slow >= 3 && app.quality !== 'low') { app.setQuality({ ultra: 'high', high: 'medium', medium: 'low' }[app.quality], false); hud.toast('Quality lowered to keep things smooth'); slow = 0; }
      }
      frames = 0; acc = 0;
    }
    hud.update(env, fpsText);
    if (!started) {
      started = true;
      loader.el.classList.add('done'); document.body.classList.add('started');
      setTimeout(() => loader.el.remove(), 1800);
    }
  }
  window.__app = app;
  frame();
}

boot().catch((err) => {
  console.error(err);
  loader.label.textContent = 'Something went wrong: ' + (err && err.message ? err.message : err);
  loader.el.classList.add('error');
});
