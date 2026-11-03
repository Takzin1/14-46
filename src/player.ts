import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { G, groups } from './physics';

export const PLAYER_RADIUS = 0.3;
export const PLAYER_HALF = 0.55; // capsule half height (total height 1.7m)

/** Procedural limb animation for the original GLB character (nodes: Hips, Head, ArmL/R, LegL/R). */
export class CharacterRig {
  root: THREE.Object3D;
  private hips?: THREE.Object3D;
  private head?: THREE.Object3D;
  private armL?: THREE.Object3D;
  private armR?: THREE.Object3D;
  private legL?: THREE.Object3D;
  private legR?: THREE.Object3D;
  private hipsY = 0.92;
  private phase = 0;
  crouch = 0; // 0..1 protect pose
  constructor(model: THREE.Object3D) {
    this.root = model;
    this.hips = model.getObjectByName('Hips');
    this.head = model.getObjectByName('Head');
    this.armL = model.getObjectByName('ArmL');
    this.armR = model.getObjectByName('ArmR');
    this.legL = model.getObjectByName('LegL');
    this.legR = model.getObjectByName('LegR');
    if (this.hips) this.hipsY = this.hips.position.y;
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }
  animate(dt: number, speed: number, protect: boolean, wobble = 0) {
    this.phase += dt * (2 + speed * 2.3);
    this.crouch += ((protect ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    const s = Math.min(1, speed / 3);
    const sw = Math.sin(this.phase) * 0.75 * s * (1 - this.crouch);
    const c = this.crouch;
    if (this.legL && this.legR) {
      // protect pose: squat (legs shortened), lean forward, hands over the head
      this.legL.rotation.x = sw + c * 0.6;
      this.legR.rotation.x = -sw + c * 0.6;
      this.legL.scale.y = this.legR.scale.y = 1 - c * 0.45;
    }
    if (this.armL && this.armR) {
      this.armL.rotation.x = -sw * 0.8 * (1 - c) + c * -2.3;
      this.armR.rotation.x = sw * 0.8 * (1 - c) + c * -2.3;
      this.armL.rotation.z = c * 0.85;
      this.armR.rotation.z = -c * 0.85;
    }
    if (this.hips) {
      this.hips.position.y = this.hipsY - c * 0.42 + Math.abs(Math.cos(this.phase)) * 0.04 * s;
      this.hips.rotation.x = -0.12 * s * (1 - c) - c * 0.6;
      this.hips.rotation.z = wobble;
    }
    if (this.head) this.head.rotation.x = -c * 0.35;
  }
}

export class Player {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  rig: CharacterRig;
  object = new THREE.Group();
  velY = 0;
  yaw = 0; // facing
  speed = 0;
  grounded = true;
  stagger = 0; // seconds of stumble
  private R: typeof RAPIER;

  constructor(R: typeof RAPIER, world: RAPIER.World, model: THREE.Object3D) {
    this.R = R;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 3, 0));
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(PLAYER_HALF, PLAYER_RADIUS).setCollisionGroups(groups(G.PLAYER, G.STATIC | G.INVIS)),
      this.body,
    );
    this.controller = world.createCharacterController(0.04);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((44 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    this.controller.enableAutostep(0.35, 0.2, false);
    this.controller.enableSnapToGround(0.4);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.rig = new CharacterRig(model);
    this.object.add(model);
  }

  /** Feet position. */
  get position() {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y - PLAYER_HALF - PLAYER_RADIUS, t.z);
  }

  teleport(x: number, feetY: number, z: number, yaw?: number) {
    this.body.setTranslation({ x, y: feetY + PLAYER_HALF + PLAYER_RADIUS + 0.05, z }, true);
    this.body.setNextKinematicTranslation({ x, y: feetY + PLAYER_HALF + PLAYER_RADIUS + 0.05, z });
    this.velY = 0;
    if (yaw !== undefined) this.yaw = yaw;
    this.syncVisual();
  }

  /**
   * @param dir desired horizontal direction (world, length 0..1)
   * @param maxSpeed m/s
   */
  move(dt: number, dir: THREE.Vector2, maxSpeed: number, protect: boolean, wobble: THREE.Vector2) {
    const want = protect ? 0 : maxSpeed * Math.min(1, dir.length());
    this.speed += (want - this.speed) * Math.min(1, dt * 8);
    let vx = 0, vz = 0;
    if (dir.lengthSq() > 1e-4) {
      const n = dir.clone().normalize();
      vx = n.x * this.speed;
      vz = n.y * this.speed;
      const target = Math.atan2(-n.x, -n.y);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    } else {
      this.speed *= Math.max(0, 1 - dt * 10);
    }
    vx += wobble.x;
    vz += wobble.y;
    this.velY = this.grounded ? -1 : Math.max(this.velY - 22 * dt, -30);
    const desired = { x: vx * dt, y: this.velY * dt, z: vz * dt };
    this.controller.computeColliderMovement(this.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS, groups(G.PLAYER, G.STATIC | G.INVIS));
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    const actual = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
    this.rig.animate(dt, Math.min(actual, this.speed + 0.5), protect, wobble.x * 0.08);
  }

  syncVisual() {
    const t = this.body.nextTranslation ? this.body.nextTranslation() : this.body.translation();
    this.object.position.set(t.x, t.y - PLAYER_HALF - PLAYER_RADIUS, t.z);
    this.object.rotation.y = this.yaw;
  }
}
