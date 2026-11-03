import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { TERRAIN, terrainHeight, isOnRoad, SEAWALL, CLIFF, RAMP_A, RAMP_B } from './layout';
import { G, groups } from '../physics';

export function buildTerrain(R: typeof RAPIER, world: RAPIER.World) {
  const { minX, maxX, minZ, maxZ, cell } = TERRAIN;
  const nx = Math.round((maxX - minX) / cell) + 1;
  const nz = Math.round((maxZ - minZ) / cell) + 1;
  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  const heights = new Float32Array(nx * nz);

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = minX + i * cell;
      const z = minZ + j * cell;
      const h = terrainHeight(x, z);
      heights[j * nx + i] = h;
      const k = (j * nx + i) * 3;
      positions[k] = x;
      positions[k + 1] = h;
      positions[k + 2] = z;
    }
  }

  const c = new THREE.Color();
  const asphalt = new THREE.Color(0x5d6168);
  const lot = new THREE.Color(0x9a958a);
  const sand = new THREE.Color(0xcdbb92);
  const grass = new THREE.Color(0x6f8f4e);
  const rock = new THREE.Color(0x7a6b58);
  const stairs = new THREE.Color(0xa7a49c);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = minX + i * cell;
      const z = minZ + j * cell;
      const h = heights[j * nx + i];
      const hx = heights[j * nx + Math.min(nx - 1, i + 1)] - heights[j * nx + Math.max(0, i - 1)];
      const hz = heights[Math.min(nz - 1, j + 1) * nx + i] - heights[Math.max(0, j - 1) * nx + i];
      const slope = Math.sqrt(hx * hx + hz * hz) / (2 * cell);
      const onRampA = Math.abs(x - RAMP_A.x) < RAMP_A.halfWidth && z <= RAMP_A.z0 && z >= RAMP_A.z1 - 6;
      const onRampB = Math.abs(x - RAMP_B.x) < RAMP_B.halfWidth && z <= RAMP_B.z0 && z >= RAMP_B.z1 - 4;
      if (z > SEAWALL.zFront && h < 2.5) c.copy(sand);
      else if (onRampA) c.copy(asphalt);
      else if (onRampB) c.copy(stairs).multiplyScalar((Math.floor(-z * 2.2) % 2) ? 1 : 0.86);
      else if (z > CLIFF.zBase - 1 && h < 1.5 && Math.abs(x) < 96 && isOnRoad(x, z)) c.copy(asphalt);
      else if (z > CLIFF.zBase - 1 && h < 1.5) c.copy(lot);
      else if (slope > 0.7 && z > -64 && z < -44) c.copy(rock);
      else if (slope > 0.5) c.copy(grass).multiplyScalar(0.82);
      else c.copy(grass).offsetHSL(0, 0, (Math.sin(x * 0.3) * Math.cos(z * 0.27)) * 0.03);
      // subtle noise
      const n = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      c.offsetHSL(0, 0, n * 0.015);
      const k = (j * nx + i) * 3;
      colors[k] = c.r;
      colors[k + 1] = c.g;
      colors[k + 2] = c.b;
    }
  }

  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const d = a + nx;
      const e = d + 1;
      indices[p++] = a;
      indices[p++] = d;
      indices[p++] = b;
      indices[p++] = b;
      indices[p++] = d;
      indices[p++] = e;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  const body = world.createRigidBody(R.RigidBodyDesc.fixed());
  const desc = R.ColliderDesc.trimesh(positions, indices).setCollisionGroups(groups(G.STATIC, 0xffff));
  world.createCollider(desc, body);

  return mesh;
}

/** Distant backdrop mountains (visual only). */
export function buildBackdrop() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f7a52, roughness: 1, flatShading: true });
  const rnd = mulberry(7);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * 0.95 + (i / 25) * Math.PI * 0.9 + (rnd() - 0.5) * 0.05;
    const r = 260 + rnd() * 80;
    const h = 40 + rnd() * 50;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(50 + rnd() * 40, h, 7), mat);
    cone.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r * 0.9 - 40);
    group.add(cone);
  }
  return group;
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
