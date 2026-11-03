import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface Assets {
  character: THREE.Object3D;
  car: THREE.Object3D;
  gltfLoaded: { character: boolean; car: boolean };
}

const base = import.meta.env.BASE_URL;

async function load(url: string): Promise<THREE.Object3D | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    return gltf.scene;
  } catch (e) {
    console.warn('GLTF load failed', url, e);
    return null;
  }
}

/** Fallback if a GLB fails to load (keeps the game playable). */
function fallbackCharacter() {
  const g = new THREE.Group();
  const hips = new THREE.Group();
  hips.name = 'Hips';
  hips.position.y = 0.92;
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3a6ea5, name: 'Jacket' }));
  m.position.y = -0.1;
  hips.add(m);
  g.add(hips);
  return g;
}

function fallbackCar() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 3.4), new THREE.MeshStandardMaterial({ color: 0xd9dde3, name: 'CarBody' }));
  m.position.y = 0.8;
  g.add(m);
  return g;
}

export async function loadAssets(): Promise<Assets> {
  const [character, car] = await Promise.all([load(`${base}models/character.glb`), load(`${base}models/car.glb`)]);
  return {
    character: character ?? fallbackCharacter(),
    car: car ?? fallbackCar(),
    gltfLoaded: { character: !!character, car: !!car },
  };
}

/** Clone the character with its own Jacket/Pants colors. */
export function cloneCharacter(src: THREE.Object3D, jacket?: number, pants?: number) {
  const c = src.clone(true);
  c.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (jacket !== undefined && mat.name === 'Jacket') {
      mesh.material = mat.clone();
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(jacket);
    }
    if (pants !== undefined && mat.name === 'Pants') {
      mesh.material = mat.clone();
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(pants);
    }
  });
  return c;
}
