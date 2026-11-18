# Aetheria — City of the Skyward Sea

A fully procedural real-time 3D world built with native Three.js (no external assets).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
```

## Controls

| Mode | Input |
| --- | --- |
| Cinematic (`1`) | Looping tour. Click or scroll to take control. |
| Orbit (`2`) | Drag to orbit, right-drag to pan, scroll to zoom, click a landmark marker. |
| Walk (`3`) | `WASD` move, mouse look (click to capture), `Shift` run, `Space` jump, `F` fly, `Esc` release. |

`H` hides the interface, `T` advances time by six hours. URL options: `?q=low|medium|high|ultra`, `?t=17.5` (start hour), `?auto=0` (disable adaptive quality).

## Layout

```
src/
  core/      noise, procedural textures, material library + shared atmosphere shader
  world/     heightfield, terrain, sky, ocean, city generator, landmarks, isles, vegetation, life, effects
  systems/   environment (day/night, weather, lighting), post-processing, cameras, interaction
  ui/        HUD
```
