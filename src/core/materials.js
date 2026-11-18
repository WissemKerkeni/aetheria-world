// Shared uniforms, atmospheric fog and the material library.
// Every lit material is routed through enhance() so the whole world shares one
// height-fog model, night emissives, wind and the "Heart pulse" light wave.
import * as THREE from 'three';

export const G = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uWind: { value: 1 },
  uSunDirG: { value: new THREE.Vector3(0, 1, 0) },
  uFogColor: { value: new THREE.Color(0.6, 0.7, 0.9) },
  uFogSunColor: { value: new THREE.Color(1, 0.8, 0.6) },
  uFogParams: { value: new THREE.Vector4(0.0005, 0.006, 8, 1) },
  uPulse: { value: new THREE.Vector2(-1000, 0) }, // radius, strength
  uPulseC: { value: new THREE.Vector3(0, 198, 0) },
  uPulseColor: { value: new THREE.Color(0.25, 0.85, 1.0) },
  uLightCol: { value: new THREE.Color(1, 1, 1) }, // for unlit sprites (clouds, water spray, rain)
};

export const ATMOS_GLSL = /* glsl */ `
uniform vec3 uFogColor; uniform vec3 uFogSunColor; uniform vec3 uSunDirG; uniform vec4 uFogParams;
vec3 applyAtmos(vec3 col, vec3 camPos, vec3 wpos) {
  vec3 v = wpos - camPos; float dist = length(v); vec3 d = v / max(dist, 1e-4);
  float b = uFogParams.y; float t = d.y * b;
  float e = clamp(-dist * t, -30.0, 12.0);
  float integ = abs(t) > 1e-5 ? (1.0 - exp(e)) / t : dist;
  float amount = uFogParams.x * exp(-abs(camPos.y) * b) * integ;
  float f = min(1.0 - exp(-amount), uFogParams.w);
  float sunAmt = pow(max(dot(d, uSunDirG), 0.0), uFogParams.z);
  return mix(col, mix(uFogColor, uFogSunColor, sunAmt), f);
}`;

const VERT_PARS = /* glsl */ `
uniform float uTime; uniform float uWind;
varying float vInstRand;
`;
const FRAG_PARS = /* glsl */ `
uniform float uTime; uniform float uNight; uniform vec2 uPulse; uniform vec3 uPulseC; uniform vec3 uPulseColor;
varying float vInstRand;
float gHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
${ATMOS_GLSL}
`;

const WIND = {
  tree: /* glsl */ `
    {
      #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
      #else
      vec3 ip = vec3(0.0);
      #endif
      float sway = sin(uTime * 1.3 + ip.x * 0.07 + ip.z * 0.05) + 0.5 * sin(uTime * 2.9 + ip.x * 0.13 + transformed.y);
      float hh = transformed.y * transformed.y;
      transformed.x += sway * 0.0016 * uWind * hh; transformed.z += sway * 0.0009 * uWind * hh; }`,
  grass: /* glsl */ `
    {
      #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
      #else
      vec3 ip = vec3(0.0);
      #endif
      float gw = sin(uTime * 2.2 + ip.x * 0.35 + ip.z * 0.27) + 0.4 * sin(uTime * 5.1 + ip.x);
      transformed.xz += vec2(gw, gw * 0.6) * 0.16 * uWind * transformed.y; }`,
  flag: /* glsl */ `
    {
      #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
      #else
      vec3 ip = vec3(0.0);
      #endif
      float fw = sin(uTime * 5.0 - transformed.x * 2.4 + ip.x + ip.z);
      transformed.z += fw * 0.16 * transformed.x * (0.5 + 0.5 * uWind);
      transformed.y += cos(uTime * 3.7 - transformed.x * 1.7 + ip.x) * 0.05 * transformed.x; }`,
};

/**
 * opts: { key, triplanar, triNormal, triNormalScale, windows:[cols,rows], nightEmissive,
 *         wind:'tree'|'grass'|'flag', uniforms, vertexPars, vertex, fragmentPars, fragmentColor }
 */
export function enhance(mat, opts = {}) {
  const local = { ...(opts.uniforms || {}) };
  if (opts.triplanar) {
    local.uTriScale = { value: opts.triplanar };
    if (opts.triNormal) {
      local.uTriNormal = { value: opts.triNormal };
      local.uTriNormalScale = { value: opts.triNormalScale ?? 1 };
    }
  }
  if (opts.windows) local.uWinGrid = { value: new THREE.Vector2(opts.windows[0], opts.windows[1]) };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G, local);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS + (opts.vertexPars || ''))
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vInstRand = fract(float(gl_InstanceID) * 0.61803398875);\n' +
          (opts.wind ? WIND[opts.wind] : '') + (opts.vertex || '')
      );

    let fs = shader.fragmentShader;
    fs = fs.replace(
      '#include <common>',
      '#include <common>\n' + FRAG_PARS +
        (opts.triplanar ? 'uniform float uTriScale;\n' : '') +
        (opts.triNormal ? 'uniform sampler2D uTriNormal; uniform float uTriNormalScale;\n' : '') +
        (opts.windows ? 'uniform vec2 uWinGrid;\n' : '') +
        (opts.fragmentPars || '')
    );
    fs = fs.replace('void main() {', 'void main() {\n vec3 gWorldPos = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;');
    if (opts.triplanar) {
      fs = fs.replace('#include <map_fragment>', /* glsl */ `
        vec3 gWN = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
        vec3 gBW = pow(abs(gWN), vec3(4.0)); gBW /= (gBW.x + gBW.y + gBW.z);
        vec3 gP = gWorldPos * uTriScale;
        diffuseColor *= texture2D(map, gP.zy) * gBW.x + texture2D(map, gP.xz) * gBW.y + texture2D(map, gP.xy) * gBW.z;
      `);
      if (opts.triNormal) {
        fs = fs.replace('#include <normal_fragment_maps>', /* glsl */ `
          { vec3 tx = texture2D(uTriNormal, gP.zy).xyz * 2.0 - 1.0;
            vec3 ty = texture2D(uTriNormal, gP.xz).xyz * 2.0 - 1.0;
            vec3 tz = texture2D(uTriNormal, gP.xy).xyz * 2.0 - 1.0;
            tx.xy *= uTriNormalScale; ty.xy *= uTriNormalScale; tz.xy *= uTriNormalScale;
            vec3 nX = vec3(tx.xy + gWN.zy, gWN.x);
            vec3 nY = vec3(ty.xy + gWN.xz, gWN.y);
            vec3 nZ = vec3(tz.xy + gWN.xy, gWN.z);
            vec3 wn2 = normalize(nX.zyx * gBW.x + nY.xzy * gBW.y + nZ.xyz * gBW.z);
            normal = normalize((viewMatrix * vec4(wn2, 0.0)).xyz); }
        `);
      }
    }
    fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + (opts.fragmentColor || ''));
    let em = '';
    if (opts.windows) {
      em += /* glsl */ `
        { vec2 cell = floor(vMapUv * uWinGrid);
          float r = gHash(cell + vInstRand * 37.0 + 1.7);
          float on = step(0.3, r) * smoothstep(r * 0.55, r * 0.55 + 0.22, uNight);
          totalEmissiveRadiance *= on * (0.6 + 0.8 * gHash(cell + vInstRand * 11.0)); }`;
    }
    if (opts.nightEmissive) em += '\n totalEmissiveRadiance *= uNight;';
    em += /* glsl */ `
      { float pd = length(gWorldPos - uPulseC) - uPulse.x;
        totalEmissiveRadiance += uPulseColor * exp(-pd * pd * 0.0035) * uPulse.y; }`;
    fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + em);
    fs = fs.replace(
      '#include <tonemapping_fragment>',
      'gl_FragColor.rgb = applyAtmos(gl_FragColor.rgb, cameraPosition, gWorldPos);\n#include <tonemapping_fragment>'
    );
    shader.fragmentShader = fs;
  };
  const key = opts.key || 'base';
  mat.customProgramCacheKey = () => key;
  return mat;
}

export const M = {};

export function buildMaterials(T) {
  const std = (p) => new THREE.MeshStandardMaterial(p);

  M.stone = enhance(std({ map: T.masonry.map, color: '#efe6d6', roughness: 0.93 }), { key: 'stone', triplanar: 1 / 8, triNormal: T.masonry.normal, triNormalScale: 1.2 });
  M.marble = enhance(std({ map: T.marble.map, color: '#ffffff', roughness: 0.5 }), { key: 'marble', triplanar: 1 / 10, triNormal: T.marble.normal, triNormalScale: 0.6 });
  M.paving = enhance(std({ map: T.paving.map, color: '#eadfcd', roughness: 0.88 }), { key: 'paving', triplanar: 1 / 5.5, triNormal: T.paving.normal, triNormalScale: 0.55 });
  M.rock = enhance(std({ map: T.rock.map, color: '#a39a8e', roughness: 0.96 }), { key: 'rock', triplanar: 1 / 16, triNormal: T.rock.normal, triNormalScale: 1.4 });
  M.isle = enhance(std({ map: T.rock.map, vertexColors: true, roughness: 0.95 }), { key: 'isle', triplanar: 1 / 14, triNormal: T.rock.normal, triNormalScale: 1.4 });
  M.roofTri = enhance(std({ map: T.roof.map, color: '#c9643c', roughness: 0.8 }), { key: 'roofTri', triplanar: 1 / 4, triNormal: T.roof.normal, triNormalScale: 0.8 });
  M.sand = enhance(std({ color: '#d9c59a', roughness: 1 }), { key: 'plain' });
  M.gold = enhance(std({ color: '#ffc65c', metalness: 1, roughness: 0.3 }), { key: 'plain' });
  M.copper = enhance(std({ color: '#56b3a0', metalness: 0.55, roughness: 0.45 }), { key: 'plain' });
  M.bronze = enhance(std({ color: '#3b3027', metalness: 0.7, roughness: 0.5 }), { key: 'plain' });
  M.dark = enhance(std({ color: '#17120f', roughness: 1 }), { key: 'plain' });
  M.wood = enhance(std({ map: T.wood, roughness: 0.85, side: THREE.DoubleSide }), { key: 'plainMap' });
  M.sail = enhance(std({ color: '#f4ecd9', roughness: 0.92, side: THREE.DoubleSide }), { key: 'plain' });
  M.balloon = enhance(std({ color: '#e9dcc0', roughness: 0.7, vertexColors: true }), { key: 'plainVC' });
  M.pool = enhance(std({ color: '#2b88a8', roughness: 0.06, metalness: 0.3, emissive: '#06222e' }), { key: 'plain' });
  M.crystal = enhance(std({ color: '#9ff5ff', emissive: '#3ee0ff', emissiveIntensity: 2.6, roughness: 0.15, metalness: 0.1, flatShading: true }), { key: 'flat' });
  M.lampGlow = enhance(std({ color: '#fff3d6', emissive: '#ffad4d', emissiveIntensity: 9, roughness: 0.4 }), { key: 'nightE', nightEmissive: true });
  M.glassWarm = enhance(std({ color: '#ffe9bd', emissive: '#ffb04a', emissiveIntensity: 12, roughness: 0.3 }), { key: 'nightE', nightEmissive: true });

  const facade = (t, grid) => enhance(std({ map: t.map, emissiveMap: t.emissive, emissive: '#ffffff', emissiveIntensity: 2.4, roughness: 0.9 }), { key: 'win', windows: grid });
  M.facadeA = facade(T.facadeA, [3, 2]);
  M.facadeB = facade(T.facadeB, [4, 3]);
  M.facadeC = facade(T.facadeC, [2, 5]);
  M.roof = enhance(std({ map: T.roof.map, normalMap: T.roof.normal, roughness: 0.82 }), { key: 'plainMapN' });
  M.roof.normalScale.set(0.9, 0.9);
  T.roof.map.repeat.set(4, 1.5); T.roof.normal.repeat.set(4, 1.5);

  M.foliage = enhance(std({ vertexColors: true, roughness: 0.92 }), { key: 'tree', wind: 'tree' });
  M.grass = enhance(std({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), { key: 'grass', wind: 'grass' });
  M.flower = enhance(std({ roughness: 1, side: THREE.DoubleSide }), { key: 'grassPlain', wind: 'grass' });
  M.cloth = enhance(std({ roughness: 0.9, side: THREE.DoubleSide }), { key: 'flag', wind: 'flag' });
  M.citizen = enhance(std({ roughness: 0.9 }), { key: 'plain' });
  return M;
}

// Clone an enhanced material (three does not copy onBeforeCompile).
export function cloneMat(m, props = {}) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  Object.assign(c, props);
  return c;
}
