// DOM overlay: mode switcher, time & weather, landmark list, info card, hints.
const $ = (s) => document.querySelector(s);

const HINTS = {
  cinematic: 'Click or scroll anywhere to take control',
  orbit: '<b>Drag</b> orbit · <b>Right-drag</b> pan · <b>Scroll</b> zoom · <b>Click</b> a landmark',
  walk: '<b>WASD</b> move · <b>Mouse</b> look · <b>Shift</b> run · <b>Space</b> jump · <b>F</b> fly · <b>Esc</b> release',
};

export class HUD {
  constructor(app) {
    this.app = app;
    const { env, director } = app;
    this.clock = $('#clock'); this.slider = $('#time'); this.status = $('#status'); this.hint = $('#hint'); this.toastEl = $('#toast');
    this.info = $('#info'); this.places = $('#places'); this.fps = $('#fps');

    document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => director.setMode(b.dataset.mode)));
    document.querySelectorAll('#weather button').forEach((b) => b.addEventListener('click', () => {
      env.setWeather(b.dataset.w);
      document.querySelectorAll('#weather button').forEach((o) => o.classList.toggle('on', o === b));
    }));
    document.querySelectorAll('.presets button').forEach((b) => b.addEventListener('click', () => app.glideTime(parseFloat(b.dataset.t))));
    this.slider.addEventListener('input', () => { app.timeGlide = null; env.time = parseFloat(this.slider.value); });
    $('#speed').addEventListener('change', (e) => (env.speed = parseFloat(e.target.value)));
    $('#quality').addEventListener('change', (e) => app.setQuality(e.target.value, true));
    $('#btn-full').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
    $('#btn-places').addEventListener('click', () => this.places.classList.toggle('hidden'));
    $('#info-close').addEventListener('click', () => { this.info.classList.add('hidden'); app.interaction.selected = null; });
    $('#info-action').addEventListener('click', () => { const lm = this.current; if (lm?.action) { const r = lm.action.run(); if (typeof r === 'string') this.toast(r); } });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Digit1') director.setMode('cinematic');
      if (e.code === 'Digit2') director.setMode('orbit');
      if (e.code === 'Digit3') director.setMode('walk');
      if (e.code === 'KeyH') document.body.classList.toggle('ui-hidden');
      if (e.code === 'KeyT') app.glideTime((env.time + 6) % 24);
    });
    this.setMode('cinematic');
  }
  buildPlaces(landmarks) {
    const ul = $('#places-list'); ul.innerHTML = '';
    for (const lm of landmarks) {
      const li = document.createElement('li');
      li.innerHTML = `<b>${lm.name}</b><small>${lm.sub}</small>`;
      li.addEventListener('click', () => { this.app.interaction.select(lm); if (innerWidth < 900) this.places.classList.add('hidden'); });
      ul.appendChild(li);
    }
  }
  setMode(mode) {
    document.body.dataset.mode = mode;
    document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    this.hint.innerHTML = HINTS[mode];
    if (mode !== 'orbit') this.info.classList.add('hidden');
  }
  showInfo(lm) {
    this.current = lm;
    $('#info-sub').textContent = lm.sub; $('#info-name').textContent = lm.name; $('#info-desc').textContent = lm.desc;
    const a = $('#info-action');
    if (lm.action) { a.textContent = lm.action.label; a.style.display = ''; } else a.style.display = 'none';
    this.info.classList.remove('hidden');
  }
  toast(msg) {
    this.toastEl.textContent = msg; this.toastEl.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => this.toastEl.classList.remove('show'), 3200);
  }
  update(env, fps) {
    const h = Math.floor(env.time), m = Math.floor((env.time - h) * 60);
    const txt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (txt !== this._clock) { this._clock = txt; this.clock.textContent = txt; this.status.textContent = env.describe(); }
    if (document.activeElement !== this.slider) this.slider.value = env.time.toFixed(2);
    if (fps) this.fps.textContent = fps;
  }
}
