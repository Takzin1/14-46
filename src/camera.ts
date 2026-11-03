import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { G, groups } from './physics';
import { terrainHeight } from './world/layout';

/** Third-person orbit camera with collision against visible world geometry. */
export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  distance = 5.2;
  current = 5.2;
  /** last collision result (for tests/debug) */
  lastHit = false;
  shake = new THREE.Vector3();
  roll = 0;
  autoFollow = 0; // 0..1 strength of auto-rotating behind the player
  private target = new THREE.Vector3();
  private R: typeof RAPIER;

  constructor(R: typeof RAPIER, private world: RAPIER.World, public camera: THREE.PerspectiveCamera, private exclude: RAPIER.Collider) {
    this.R = R;
  }

  rotate(dx: number, dy: number) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy, -0.35, 1.2);
  }

  update(dt: number, focus: THREE.Vector3, playerYaw: number, moving: boolean) {
    if (this.autoFollow > 0 && moving) {
      let d = playerYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 2.2 * this.autoFollow);
    }
    this.target.lerp(focus, this.target.lengthSq() === 0 ? 1 : Math.min(1, dt * 14));
    if (this.target.distanceToSquared(focus) > 25) this.target.copy(focus);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const allowed = this.castDistance(this.target, dir, this.distance);
    this.lastHit = allowed < this.distance - 0.01;
    // pull in instantly, ease out smoothly
    if (allowed < this.current) this.current = allowed;
    else this.current += (allowed - this.current) * Math.min(1, dt * 3);
    const pos = this.target.clone().addScaledVector(dir, this.current);
    const ground = terrainHeight(pos.x, pos.z) + 0.35;
    if (pos.y < ground) pos.y = ground;
    this.camera.position.copy(pos).add(this.shake);
    this.camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.camera.lookAt(this.target);
  }

  /** Cast several rays (center + offsets approximating the near plane) and return the free distance. */
  castDistance(from: THREE.Vector3, dir: THREE.Vector3, max: number) {
    const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    let best = max;
    const offs: [number, number][] = [[0, 0], [0.22, 0.14], [-0.22, 0.14], [0.22, -0.14], [-0.22, -0.14]];
    const filter = groups(0xffff, G.STATIC);
    for (const [a, b] of offs) {
      const o = from.clone().addScaledVector(right, a).addScaledVector(up, b);
      const ray = new this.R.Ray(o, dir);
      const hit = this.world.castRay(ray, max, true, this.R.QueryFilterFlags.EXCLUDE_SENSORS, filter, this.exclude);
      if (hit) best = Math.min(best, Math.max(0.5, hit.timeOfImpact - 0.25));
    }
    return best;
  }
}
