import * as THREE from 'three';
import { enhance } from '../core/materials.js';
import { height, terrainMeshHeight } from './heightfield.js';

export const TERRAIN = { size: 2800, cx: 0, cz: -300, seg: 400 };

export function buildTerrain(scene, T) {
  const { size, cx, cz, seg } = TERRAIN;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainMeshHeight(x, z));
    uv.setXY(i, x / 22, z / 22);
  }
  geo.computeVertexNormals();

  const mat = enhance(
    new THREE.MeshStandardMaterial({ roughness: 0.95, normalMap: T.groundNormal, normalScale: new THREE.Vector2(0.9, 0.9) }),
    {
      key: 'terrain',
      uniforms: { uNoiseTex: { value: T.noise } },
      vertexPars: 'varying vec3 vTerrN;\n',
      vertex: 'vTerrN = normal;\n',
      fragmentPars: 'uniform sampler2D uNoiseTex; varying vec3 vTerrN;\n',
      fragmentColor: /* glsl */ `
        { vec3 wn = normalize(vTerrN);
          float n1 = texture2D(uNoiseTex, gWorldPos.xz * 0.0035).r;
          float n2 = texture2D(uNoiseTex, gWorldPos.xz * 0.027).g;
          float n3 = texture2D(uNoiseTex, gWorldPos.xz * 0.19).r;
          float n4 = texture2D(uNoiseTex, gWorldPos.xz * 0.0011).b;
          float slope = 1.0 - wn.y; float hh = gWorldPos.y;
          vec3 grass = mix(vec3(0.085, 0.17, 0.035), vec3(0.22, 0.27, 0.06), n1);
          grass = mix(grass, vec3(0.34, 0.30, 0.11), smoothstep(0.5, 0.85, n2) * 0.55 * n4 * 1.6);
          grass = mix(grass, vec3(0.05, 0.11, 0.035), smoothstep(0.55, 0.8, n4) * 0.6);
          vec3 rock = mix(vec3(0.13, 0.115, 0.10), vec3(0.33, 0.29, 0.245), n2);
          rock *= 0.8 + 0.4 * n3;
          vec3 c = mix(grass, rock, smoothstep(0.16, 0.34, slope + (n2 - 0.5) * 0.14));
          float alpine = smoothstep(190.0, 290.0, hh + n1 * 70.0);
          c = mix(c, mix(rock, vec3(0.25, 0.23, 0.15), 0.35), alpine * 0.8);
          float snow = smoothstep(300.0, 365.0, hh + n2 * 60.0) * smoothstep(0.62, 0.3, slope);
          c = mix(c, vec3(0.86, 0.9, 0.96), snow);
          vec3 sand = vec3(0.62, 0.52, 0.34) * (0.85 + 0.3 * n2);
          c = mix(c, sand, smoothstep(5.0, 1.8, hh + n2 * 2.5));
          c = mix(c, sand * vec3(0.42, 0.55, 0.55), smoothstep(0.6, -2.5, hh));
          c *= 0.78 + 0.44 * n3;
          diffuseColor.rgb = c;
          roughnessFactorG = mix(0.95, 0.55, snow); }
      `,
    }
  );
  // let snow be slightly glossy
  const obc = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    obc(shader, r);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'float roughnessFactorG = 0.95;\nvoid main() {')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = roughnessFactorG;');
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.castShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);

  // Depth map for the water shader (shoreline foam, shallows).
  const HS = 384, data = new Uint8Array(HS * HS * 4);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const x = cx - size / 2 + ((i + 0.5) / HS) * size, z = cz - size / 2 + ((j + 0.5) / HS) * size;
    const v = Math.max(0, Math.min(1, (height(x, z) + 30) / 40));
    data[(j * HS + i) * 4] = v * 255; data[(j * HS + i) * 4 + 3] = 255;
  }
  const heightTex = new THREE.DataTexture(data, HS, HS, THREE.RGBAFormat);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  return { mesh, heightTex };
}
