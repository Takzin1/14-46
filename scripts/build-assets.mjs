// Generates the game's ORIGINAL low-poly 3D assets as binary glTF (.glb).
// All geometry here is authored procedurally for this project (no third-party models).
//   node scripts/build-assets.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal FileReader polyfill so GLTFExporter can run in Node.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/models');
mkdirSync(outDir, { recursive: true });

const mat = (name, color, roughness = 0.8) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  m.name = name;
  return m;
};

function mesh(name, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.position.set(x, y, z);
  return m;
}

function buildCharacter() {
  const skin = mat('Skin', 0xe8bf9a);
  const jacket = mat('Jacket', 0x3a6ea5);
  const pants = mat('Pants', 0x2f3440);
  const hair = mat('Hair', 0x2a211c);
  const shoes = mat('Shoes', 0x8a8f99);
  const bag = mat('Bag', 0x6b4f3a);

  const root = new THREE.Group();
  root.name = 'Character';

  const hips = new THREE.Group();
  hips.name = 'Hips';
  hips.position.set(0, 0.92, 0);
  root.add(hips);

  const torso = mesh('TorsoMesh', new THREE.CapsuleGeometry(0.2, 0.32, 4, 10), jacket, 0, 0.3, 0);
  torso.scale.set(1.05, 1, 0.65);
  hips.add(torso);
  hips.add(mesh('BagMesh', new THREE.BoxGeometry(0.26, 0.3, 0.12), bag, 0, 0.32, 0.17));

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0.66, 0);
  hips.add(head);
  head.add(mesh('HeadMesh', new THREE.SphereGeometry(0.13, 14, 10), skin, 0, 0.1, 0));
  const hairMesh = mesh('HairMesh', new THREE.SphereGeometry(0.138, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.12, 0.01);
  head.add(hairMesh);
  head.add(mesh('NeckMesh', new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), skin, 0, -0.02, 0));

  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'ArmL' : 'ArmR';
    arm.position.set(0.25 * side, 0.55, 0);
    hips.add(arm);
    arm.add(mesh(arm.name + 'Upper', new THREE.CapsuleGeometry(0.055, 0.28, 3, 8), jacket, 0, -0.17, 0));
    arm.add(mesh(arm.name + 'Hand', new THREE.SphereGeometry(0.05, 8, 6), skin, 0, -0.42, 0));

    const leg = new THREE.Group();
    leg.name = side < 0 ? 'LegL' : 'LegR';
    leg.position.set(0.1 * side, 0.02, 0);
    hips.add(leg);
    leg.add(mesh(leg.name + 'Upper', new THREE.CapsuleGeometry(0.075, 0.62, 3, 8), pants, 0, -0.42, 0));
    leg.add(mesh(leg.name + 'Shoe', new THREE.BoxGeometry(0.13, 0.08, 0.26), shoes, 0, -0.88, -0.04));
  }
  return root;
}

function buildCar() {
  const body = mat('CarBody', 0xd9dde3, 0.45);
  const glass = mat('CarGlass', 0x3a4a5a, 0.2);
  const tire = mat('Tire', 0x1d1f22, 0.9);
  const light = mat('CarLight', 0xfff3c4, 0.3);
  const root = new THREE.Group();
  root.name = 'Car';
  // Kei-car-like proportions (original design): length 3.4m, width 1.5m
  root.add(mesh('CarLower', new THREE.BoxGeometry(1.5, 0.7, 3.4), body, 0, 0.6, 0));
  root.add(mesh('CarCabin', new THREE.BoxGeometry(1.38, 0.68, 2.1), body, 0, 1.28, 0.25));
  root.add(mesh('CarWindows', new THREE.BoxGeometry(1.4, 0.48, 2.0), glass, 0, 1.32, 0.25));
  root.add(mesh('CarLightL', new THREE.BoxGeometry(0.3, 0.12, 0.05), light, -0.5, 0.75, -1.71));
  root.add(mesh('CarLightR', new THREE.BoxGeometry(0.3, 0.12, 0.05), light, 0.5, 0.75, -1.71));
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.72, -1.1], [0.72, -1.1], [-0.72, 1.1], [0.72, 1.1]]) {
    root.add(mesh('Wheel', wheelGeo, tire, x, 0.3, z));
  }
  return root;
}

async function exportGlb(object, file) {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(object, { binary: true });
  writeFileSync(resolve(outDir, file), Buffer.from(result));
  console.log('wrote', file, (result.byteLength / 1024).toFixed(1) + ' KiB');
}

await exportGlb(buildCharacter(), 'character.glb');
await exportGlb(buildCar(), 'car.glb');
