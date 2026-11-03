import * as THREE from 'three';
import { terrainHeight, SEAWALL, FLOOD_LEVEL, GROUND } from './layout';

/**
 * Simplified, NON-SCIENTIFIC tsunami visual.
 * - The sea stays calm (no drawback) until the scenario starts the surge.
 * - A flood front then advances inland at a constant speed and the water rises to FLOOD_LEVEL.
 * This is purely a game presentation and must not be read as an inundation simulation.
 */
export class Water {
  group = new THREE.Group();
  sea: THREE.Mesh;
  flood: THREE.Mesh;
  foamLine: THREE.Mesh;
  private seaUniforms = { uTime: { value: 0 }, uAmp: { value: 1 } };
  private floodGeo: THREE.BufferGeometry;
  private floodGround: Float32Array;
  private nx: number;
  private nz: number;
  /** state */
  seaLevel = 0;
  frontZ = 999; // flood front position (water exists for z > frontZ)
  level = GROUND; // current flood level behind the front
  active = false;
  mode: 'full' | 'reduced' | 'minimal' = 'full';

  constructor() {
    // --- sea
    const g = new THREE.PlaneGeometry(1400, 800, 140, 80);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 60 + 400);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f6f86, roughness: 0.35, metalness: 0.05, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.seaUniforms.uTime;
      sh.uniforms.uAmp = this.seaUniforms.uAmp;
      sh.vertexShader =
        'uniform float uTime;\nuniform float uAmp;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 wpos = modelMatrix * vec4(position, 1.0);
           float w = sin(wpos.x * 0.06 + uTime * 0.7) * 0.22 + sin(wpos.z * 0.09 + uTime * 1.1) * 0.16 + sin((wpos.x + wpos.z) * 0.17 + uTime * 1.6) * 0.06;
           transformed.y += w * uAmp;`,
        );
    };
    this.sea = new THREE.Mesh(g, mat);
    this.sea.receiveShadow = true;
    this.sea.name = 'sea';
    this.group.add(this.sea);

    // --- distant white line (the approaching surge, shown shortly before arrival)
    const fl = new THREE.Mesh(new THREE.BoxGeometry(1400, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.6 }));
    fl.visible = false;
    this.foamLine = fl;
    this.group.add(fl);

    // --- flood surface over the lowland
    const minX = -100, maxX = 100, minZ = -62, maxZ = SEAWALL.zFront + 2;
    const cell = 2;
    this.nx = Math.round((maxX - minX) / cell) + 1;
    this.nz = Math.round((maxZ - minZ) / cell) + 1;
    const fg = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, this.nx - 1, this.nz - 1);
    fg.rotateX(-Math.PI / 2);
    fg.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const pos = fg.attributes.position as THREE.BufferAttribute;
    this.floodGround = new Float32Array(pos.count);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      this.floodGround[i] = terrainHeight(pos.getX(i), pos.getZ(i));
      pos.setY(i, this.floodGround[i] - 3);
    }
    fg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.floodGeo = fg;
    const fmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true, transparent: true, opacity: 0.93 });
    this.flood = new THREE.Mesh(fg, fmat);
    this.flood.visible = false;
    this.flood.name = 'flood';
    this.flood.frustumCulled = false;
    this.group.add(this.flood);
  }

  reset() {
    this.seaLevel = 0;
    this.frontZ = 999;
    this.level = GROUND;
    this.active = false;
    this.flood.visible = false;
    this.foamLine.visible = false;
    this.seaUniforms.uAmp.value = 1;
  }

  /** Water surface height at (x,z) or -Infinity if dry. */
  waterAt(x: number, z: number) {
    if (!this.active || z < this.frontZ) return -Infinity;
    const lv = GROUND + (this.level - GROUND) * Math.min(1, (z - this.frontZ) / 18 + 0.2);
    return lv > terrainHeight(x, z) + 0.02 ? lv : -Infinity;
  }

  update(t: number, foam: { visible: boolean; z: number }) {
    this.seaUniforms.uTime.value = t;
    this.sea.position.y = this.seaLevel;
    this.foamLine.visible = foam.visible && this.mode !== 'minimal';
    this.foamLine.position.set(0, this.seaLevel + 0.4, foam.z);
    if (!this.active) return;
    this.flood.visible = true;
    const pos = this.floodGeo.attributes.position as THREE.BufferAttribute;
    const col = this.floodGeo.attributes.color as THREE.BufferAttribute;
    const base = new THREE.Color(this.mode === 'minimal' ? 0x5a86a8 : 0x4f6670);
    const foamC = new THREE.Color(0xd9e2e4);
    const c = new THREE.Color();
    const waveAmp = this.mode === 'full' ? 0.25 : 0.08;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const gnd = this.floodGround[i];
      let y = gnd - 3;
      if (z >= this.frontZ - 1) {
        const lv = GROUND + (this.level - GROUND) * Math.min(1, Math.max(0, (z - this.frontZ) / 18 + 0.2));
        if (lv > gnd + 0.02) y = lv + Math.sin(x * 0.3 + t * 2) * Math.cos(z * 0.25 + t * 1.7) * waveAmp;
        const edge = Math.max(0, 1 - (z - this.frontZ) / 8);
        c.copy(base).lerp(foamC, this.mode === 'full' ? edge * 0.8 : edge * 0.3);
      } else c.copy(base);
      pos.setY(i, y);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}

export { FLOOD_LEVEL };
