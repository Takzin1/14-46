import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { G, groups } from '../physics';
import {
  GROUND, ROADS_NS, ROADS_EW, ROAD_HALF, CLIFF, SEAWALL, SEAWALL_STAIRS, EVAC_BUILDING, EVAC_BUILDING_ROOF,
  PARK, SHRINE, RAMP_A, RAMP_B, PARKED_CAR, VENDING, SHOP_SIGN, ALLEY_BLOCK, terrainHeight,
} from './layout';
import { evacSignTexture, plainSignTexture, elevationSignTexture, windowsTexture, houseWallTexture } from './signs';
import { mulberry } from './terrain';

export interface Hazard {
  id: 'vending' | 'sign' | 'pole';
  label: string;
  pivot: THREE.Object3D;
  from: THREE.Quaternion;
  to: THREE.Quaternion;
  time: number; // quake time when it falls
  duration: number;
  zone: THREE.Vector2; // xz center of the danger zone
  radius: number;
  fallen: boolean;
  blocker?: { center: THREE.Vector3; half: THREE.Vector3 };
}

export interface SignInfo {
  pos: THREE.Vector3;
  text: string;
}

export interface Zone {
  id: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

interface HouseInst {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  phase: number;
}

export class City {
  group = new THREE.Group();
  hazards: Hazard[] = [];
  signs: SignInfo[] = [];
  zones: Zone[] = [];
  /** Roof edges (world positions) for falling roof-tile spawn. */
  roofEdges: THREE.Vector3[] = [];
  jamCars: THREE.Object3D[] = [];
  parkedCar!: THREE.Object3D;
  boats: THREE.Object3D[] = [];
  private houses: HouseInst[] = [];
  private houseBody!: THREE.InstancedMesh;
  private houseRoof!: THREE.InstancedMesh;
  private swayers: { obj: THREE.Object3D; base: THREE.Quaternion; phase: number; amp: number }[] = [];
  private wires: { line: THREE.Line; a: THREE.Vector3; b: THREE.Vector3; phase: number }[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private R: typeof RAPIER;
  private world: RAPIER.World;
  private fixed: RAPIER.RigidBody;
  private carTemplate: THREE.Object3D;
  private lastCollider: RAPIER.Collider | null = null;
  private dynamicColliders: RAPIER.Collider[] = [];

  constructor(R: typeof RAPIER, world: RAPIER.World, carTemplate: THREE.Object3D) {
    this.R = R;
    this.world = world;
    this.carTemplate = carTemplate;
    this.fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
    this.group.name = 'city';
    this.buildRoadMarkings();
    this.buildHouses();
    this.buildShops();
    this.buildEvacBuilding();
    this.buildSeawall();
    this.buildAlley();
    this.buildPolesAndWires();
    this.buildHill();
    this.buildSigns();
    this.buildCars();
    this.buildBoats();
    this.buildZones();
  }

  // ---------------------------------------------------------------- helpers
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, mat: THREE.Material | null, opts: { q?: THREE.Quaternion; group?: number; shadow?: boolean } = {}) {
    const membership = opts.group ?? G.STATIC;
    const d = this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setCollisionGroups(groups(membership, 0xffff));
    if (opts.q) d.setRotation({ x: opts.q.x, y: opts.q.y, z: opts.q.z, w: opts.q.w });
    this.lastCollider = this.world.createCollider(d, this.fixed);
    if (mat) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat);
      m.position.set(cx, cy, cz);
      if (opts.q) m.quaternion.copy(opts.q);
      m.castShadow = opts.shadow ?? true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    }
    return null;
  }

  /** Sloped flight of stairs/ramp from point a to point b (top surface passes through both). */
  ramp(a: THREE.Vector3, b: THREE.Vector3, halfWidth: number, mat: THREE.Material, group = G.STATIC) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    d.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    let n = new THREE.Vector3(0, -d.z, d.y);
    if (n.y < 0) n.multiplyScalar(-1);
    const t = 0.15;
    const c = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).addScaledVector(n, -t);
    this.box(c.x, c.y, c.z, halfWidth, t, len / 2 + 0.05, mat, { q, group });
  }

  private addSway(obj: THREE.Object3D, amp = 1) {
    this.swayers.push({ obj, base: obj.quaternion.clone(), phase: Math.random() * 6.28, amp });
  }

  // ---------------------------------------------------------------- build
  private buildRoadMarkings() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xe9e6dc });
    const geo = new THREE.PlaneGeometry(0.15, 2.4);
    geo.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, mat, 600);
    let n = 0;
    const m = new THREE.Matrix4();
    for (const rx of ROADS_NS) {
      for (let z = CLIFF.zBase + 2; z < SEAWALL.zBack - 6; z += 6) {
        if (ROADS_EW.some((rz) => Math.abs(z - rz) < ROAD_HALF + 1)) continue;
        m.makeTranslation(rx, GROUND + 0.03, z);
        inst.setMatrixAt(n++, m);
      }
    }
    for (const rz of ROADS_EW) {
      for (let x = -94; x < 94; x += 6) {
        if (ROADS_NS.some((rx) => Math.abs(x - rx) < ROAD_HALF + 1)) continue;
        m.makeRotationY(Math.PI / 2).setPosition(x, GROUND + 0.03, rz);
        inst.setMatrixAt(n++, m);
      }
    }
    for (let z = RAMP_A.z0 - 3; z > RAMP_A.z1; z -= 6) {
      m.makeTranslation(RAMP_A.x, terrainHeight(RAMP_A.x, z) + 0.04, z);
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    this.group.add(inst);
  }

  private blockedForHouse(x0: number, z0: number, x1: number, z1: number) {
    const rects: [number, number, number, number][] = [
      [-30, -52, -20, -26], // alley
      [EVAC_BUILDING.x - EVAC_BUILDING.w / 2 - 2, EVAC_BUILDING.z - EVAC_BUILDING.d / 2 - 2, -22, EVAC_BUILDING.z + EVAC_BUILDING.d / 2 + 2], // evac bldg
      [-16, 20, 16, 46], // shops (built separately)
      [22, 20, 50, 46], // shops/parking east
    ];
    for (const [a, b, c, d] of rects) if (x1 > a && x0 < c && z1 > b && z0 < d) return true;
    for (const rx of ROADS_NS) if (x1 > rx - ROAD_HALF - 0.6 && x0 < rx + ROAD_HALF + 0.6) return true;
    for (const rz of ROADS_EW) if (z1 > rz - ROAD_HALF - 0.6 && z0 < rz + ROAD_HALF + 0.6) return true;
    return false;
  }

  private buildHouses() {
    const rnd = mulberry(1146);
    const xBlocks: [number, number][] = [[-95, -59], [-51, -22], [-14, -4], [4, 16], [24, 51], [59, 95]];
    const zBlocks: [number, number][] = [[-46, -32], [-24, -2], [6, 28], [36, 50]];
    for (const [bx0, bx1] of xBlocks) {
      for (const [bz0, bz1] of zBlocks) {
        for (let x = bx0 + 0.5; x + 6 <= bx1; x += 10.5) {
          for (let z = bz0 + 0.5; z + 6 <= bz1; z += 9.5) {
            const w = 6 + rnd() * 2.6;
            const d = 6 + rnd() * 2.2;
            const cx = Math.min(x + w / 2 + rnd() * 0.8, bx1 - w / 2);
            const cz = Math.min(z + d / 2 + rnd() * 0.6, bz1 - d / 2);
            if (this.blockedForHouse(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2)) continue;
            if (rnd() < 0.08) continue; // empty lot
            this.houses.push({ x: cx, z: cz, w, d, h: 4.8 + rnd() * 1.6, phase: rnd() * 6.28 });
          }
        }
      }
    }
    const n = this.houses.length;
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    bodyGeo.translate(0, 0.5, 0);
    const wallTex = houseWallTexture();
    const bodyMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    this.houseBody = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    // gable roof prism (unit), ridge along x
    const roofGeo = new THREE.BufferGeometry();
    const v = [
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0, // north slope
      -0.5, 1, 0, 0.5, 1, 0, 0.5, 0, 0.5, -0.5, 0, 0.5, // south slope
      -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5, // west gable
      0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0, // east gable
    ];
    roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    roofGeo.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12]);
    roofGeo.computeVertexNormals();
    const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true });
    this.houseRoof = new THREE.InstancedMesh(roofGeo, roofMat, n);
    this.houseBody.castShadow = this.houseRoof.castShadow = true;
    this.houseBody.receiveShadow = this.houseRoof.receiveShadow = true;
    const roofColors = [0x3c4a5c, 0x5a3b33, 0x2f3d3a, 0x6b6e73, 0x7a4a2a];
    const wallColors = [0xf1ebe0, 0xe4ddd0, 0xd8d2c4, 0xece6da, 0xcfc8ba];
    const col = new THREE.Color();
    this.houses.forEach((h, i) => {
      this.box(h.x, GROUND + h.h / 2, h.z, h.w / 2, h.h / 2, h.d / 2, null);
      this.houseBody.setColorAt(i, col.setHex(wallColors[i % wallColors.length]));
      this.houseRoof.setColorAt(i, col.setHex(roofColors[(i * 7) % roofColors.length]));
      this.roofEdges.push(new THREE.Vector3(h.x, GROUND + h.h, h.z + h.d / 2 + 0.3));
      this.roofEdges.push(new THREE.Vector3(h.x, GROUND + h.h, h.z - h.d / 2 - 0.3));
    });
    this.updateHouses(0, 0);
    this.group.add(this.houseBody, this.houseRoof);
  }

  private updateHouses(t: number, amp: number) {
    this.houses.forEach((h, i) => {
      const a = amp * 0.012;
      this.tmpE.set(Math.sin(t * 6.3 + h.phase) * a, 0, Math.cos(t * 5.1 + h.phase) * a);
      this.tmpQ.setFromEuler(this.tmpE);
      this.tmpM.compose(new THREE.Vector3(h.x, GROUND, h.z), this.tmpQ, new THREE.Vector3(h.w, h.h, h.d));
      this.houseBody.setMatrixAt(i, this.tmpM);
      const top = new THREE.Vector3(0, h.h, 0).applyQuaternion(this.tmpQ);
      this.tmpM.compose(new THREE.Vector3(h.x + top.x, GROUND + top.y, h.z + top.z), this.tmpQ, new THREE.Vector3(h.w + 0.7, 1.7, h.d + 0.7));
      this.houseRoof.setMatrixAt(i, this.tmpM);
    });
    this.houseBody.instanceMatrix.needsUpdate = true;
    this.houseRoof.instanceMatrix.needsUpdate = true;
  }

  private buildShops() {
    const names = ['潮凪商店', 'なぎさ食堂', '浜風書店', 'しおさい薬局', '港町青果', 'かもめ理容', '凪 喫茶'];
    const colors = [0xc9b79c, 0xb9c4c9, 0xd4c3a3, 0xc2c9b4, 0xd8cfc0, 0xbfb3a6, 0xc8beae];
    const awningColors = [0x2e6e8e, 0xa04030, 0x3c7a4c, 0x8a6a2a, 0x5a4a8a, 0x2e6e8e, 0x7a3c3c];
    const shops: { x: number; z: number; w: number; d: number; face: 1 | -1 }[] = [
      { x: -9, z: 40.5, w: 8.5, d: 7, face: -1 },
      { x: 10, z: 40.5, w: 9, d: 7, face: -1 },
      { x: 42, z: 40.5, w: 12, d: 7, face: -1 },
      { x: -9, z: 23.5, w: 9, d: 7, face: 1 },
      { x: 10, z: 23.5, w: 9, d: 7, face: 1 },
      { x: 30, z: 23.5, w: 10, d: 7, face: 1 },
      { x: 43, z: 23.5, w: 10, d: 7, face: 1 },
    ];
    shops.forEach((s, i) => {
      const h = 5.6;
      const tex = windowsTexture(2, 3, '#' + new THREE.Color(colors[i]).getHexString());
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const body = this.box(s.x, GROUND + h / 2, s.z, s.w / 2, h / 2, s.d / 2, mat)!;
      this.addSway(body, 0.6);
      const frontZ = s.z + (s.d / 2) * s.face;
      // awning
      const aw = new THREE.Mesh(new THREE.BoxGeometry(s.w - 0.4, 0.12, 1.4), new THREE.MeshStandardMaterial({ color: awningColors[i], roughness: 0.8 }));
      aw.position.set(s.x, GROUND + 2.7, frontZ + 0.7 * s.face);
      aw.rotation.x = 0.18 * -s.face;
      aw.castShadow = true;
      this.group.add(aw);
      // signboard
      if (!(s.x === SHOP_SIGN.x + 0.5 && s.face === -1)) {
        const st = plainSignTexture([names[i]], '#f7f3ea', '#2b2b2b', 512, 128);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.7, 1.1), new THREE.MeshStandardMaterial({ map: st }));
        sign.position.set(s.x, GROUND + 3.9, frontZ + 0.03 * s.face);
        if (s.face < 0) sign.rotation.y = Math.PI;
        this.group.add(sign);
      }
      this.roofEdges.push(new THREE.Vector3(s.x - s.w / 4, GROUND + h, frontZ + 0.4 * s.face));
      this.roofEdges.push(new THREE.Vector3(s.x + s.w / 4, GROUND + h, frontZ + 0.4 * s.face));
    });

    // --- Hazard: projecting shop signboard (falls at t=15)
    {
      const pivot = new THREE.Group();
      pivot.position.set(SHOP_SIGN.x, GROUND + 4.6, SHOP_SIGN.z - 0.8);
      const st = plainSignTexture(['潮凪商店'], '#fff7e0', '#7a2a18', 512, 128);
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 0.12), [
        new THREE.MeshStandardMaterial({ color: 0xddd }), new THREE.MeshStandardMaterial({ color: 0xddd }),
        new THREE.MeshStandardMaterial({ color: 0xddd }), new THREE.MeshStandardMaterial({ color: 0xddd }),
        new THREE.MeshStandardMaterial({ map: st }), new THREE.MeshStandardMaterial({ map: st }),
      ]);
      board.position.set(0, -0.5, -0.1);
      board.castShadow = true;
      pivot.add(board);
      this.group.add(pivot);
      const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.45, 0.2, 0.15));
      // the board drops: we animate the pivot down as well (handled in update via 'drop')
      pivot.userData.drop = GROUND + 0.2;
      pivot.userData.baseY = pivot.position.y;
      this.hazards.push({ id: 'sign', label: '落下した看板', pivot, from: pivot.quaternion.clone(), to, time: 15, duration: 0.7, zone: new THREE.Vector2(SHOP_SIGN.x, SHOP_SIGN.z - 1.3), radius: 2.4, fallen: false });
    }
    // --- Hazard: vending machine (tips over at t=12)
    {
      const pivot = new THREE.Group();
      pivot.position.set(VENDING.x, GROUND, VENDING.z - 0.45);
      const vm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.85, 0.8), [
        new THREE.MeshStandardMaterial({ color: 0xd8dde2 }), new THREE.MeshStandardMaterial({ color: 0xd8dde2 }),
        new THREE.MeshStandardMaterial({ color: 0xd8dde2 }), new THREE.MeshStandardMaterial({ color: 0xd8dde2 }),
        new THREE.MeshStandardMaterial({ color: 0xd8dde2 }), new THREE.MeshStandardMaterial({ map: plainSignTexture(['飲料'], '#2d6fb5', '#ffffff', 128, 192) }),
      ]);
      vm.position.set(0, 0.925, 0.4);
      vm.castShadow = true;
      pivot.add(vm);
      this.group.add(pivot);
      const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.05, 0, 0));
      this.hazards.push({ id: 'vending', label: '倒れた自動販売機', pivot, from: pivot.quaternion.clone(), to, time: 12, duration: 1.1, zone: new THREE.Vector2(VENDING.x, VENDING.z - 1.4), radius: 2.0, fallen: false, blocker: { center: new THREE.Vector3(VENDING.x, GROUND + 0.4, VENDING.z - 1.4), half: new THREE.Vector3(0.55, 0.4, 0.92) } });
    }
  }

  private buildEvacBuilding() {
    const B = EVAC_BUILDING;
    const h = B.floors * B.floorH;
    const tex = windowsTexture(B.floors, 6, '#e3e0d8');
    const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const top = new THREE.MeshStandardMaterial({ color: 0x9ea3a6, roughness: 0.95 });
    const mats = [side, side, top, top, side, side];
    const geo = new THREE.BoxGeometry(B.w, h, B.d);
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(B.x, GROUND + h / 2, B.z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    this.box(B.x, GROUND + h / 2, B.z, B.w / 2, h / 2, B.d / 2, null);
    // roof parapet (opening on the east side where the stairs arrive, z∈[12,14])
    const conc = new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.9 });
    const R = EVAC_BUILDING_ROOF;
    const x0 = B.x - B.w / 2, x1 = B.x + B.w / 2, z0 = B.z - B.d / 2, z1 = B.z + B.d / 2;
    this.box(B.x, R + 0.55, z0 + 0.1, B.w / 2, 0.55, 0.1, conc);
    this.box(B.x, R + 0.55, z1 - 0.1, B.w / 2, 0.55, 0.1, conc);
    this.box(x0 + 0.1, R + 0.55, B.z, 0.1, 0.55, B.d / 2, conc);
    // east parapet split around the stair opening
    this.box(x1 - 0.1, R + 0.55, (z0 + 12) / 2, 0.1, 0.55, (12 - z0) / 2, conc);
    this.box(x1 - 0.1, R + 0.55, (14 + z1) / 2, 0.1, 0.55, (z1 - 14) / 2, conc);
    // roof sign
    const rs = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({ map: plainSignTexture(['津波避難ビル　潮凪町民センター'], '#1f7a4a', '#ffffff', 1024, 160) }));
    rs.position.set(B.x, GROUND + h - 1.5, z1 + 0.02);
    this.group.add(rs);

    // --- external switchback stairs (x∈[-28,-24], z∈[12,22])
    const stairMat = new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: 0.9 });
    const lane1 = -25, lane2 = -27;
    let y = GROUND;
    for (let f = 0; f < B.floors; f++) {
      const up = y + B.floorH;
      if (f % 2 === 0) {
        // stairs don't block the camera (G.INVIS) so the view stays usable in the stairwell
        this.ramp(new THREE.Vector3(lane1, y, 20), new THREE.Vector3(lane1, up, 14), 1, stairMat, G.INVIS);
        this.box(-26, up - 0.15, 13, 2, 0.15, 1, stairMat, { group: G.INVIS });
      } else {
        this.ramp(new THREE.Vector3(lane2, y, 14), new THREE.Vector3(lane2, up, 20), 1, stairMat, G.INVIS);
        this.box(-26, up - 0.15, 21, 2, 0.15, 1, stairMat, { group: G.INVIS });
      }
      y = up;
    }
    // walls & rails
    this.box(-26, (GROUND + R + 1.1) / 2, 17, 0.1, (R + 1.1 - GROUND) / 2, 3, conc); // center wall
    this.box(-26, (GROUND + R + 1.1) / 2, 11.9, 2, (R + 1.1 - GROUND) / 2, 0.1, conc); // north wall
    this.box(-23.85, (GROUND + 1.4 + R + 1.2) / 2 - 0.2, 17, 0.1, (R + 1.2 - GROUND) / 2, 5, null, { group: G.INVIS }); // outer rail
    this.box(-26, (GROUND + 3.8 + R + 1.2) / 2 + 0.6, 22.1, 2, (R + 1.2 - GROUND - 3.8) / 2, 0.1, null, { group: G.INVIS }); // south rail above entrance
    // visual rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0x4f6a5a, roughness: 0.6 });
    for (let f = 0; f <= B.floors; f++) {
      const ly = GROUND + f * B.floorH;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 10), railMat);
      rail.position.set(-23.9, ly + 1.1, 17);
      this.group.add(rail);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x4f6a5a, transparent: true, opacity: 0.25 }));
      rail2.position.set(-23.9, ly + 0.55, 17);
      if (f > 0) this.group.add(rail2);
    }
    for (let z = 12; z <= 22; z += 2.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, R + 1.2 - GROUND, 0.1), railMat);
      post.position.set(-23.9, (GROUND + R + 1.2) / 2, z);
      this.group.add(post);
    }
  }

  private buildSeawall() {
    const conc = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.95 });
    const S = SEAWALL;
    this.box(0, S.top / 2 - 0.5, (S.zBack + S.zFront) / 2, 110, S.top / 2 + 0.5, (S.zFront - S.zBack) / 2, conc);
    // stairs up to the seawall top (coastal road side)
    this.ramp(new THREE.Vector3(SEAWALL_STAIRS.x, GROUND, SEAWALL_STAIRS.z0), new THREE.Vector3(SEAWALL_STAIRS.x, S.top, SEAWALL_STAIRS.z1), 1.5, conc);
    this.box(SEAWALL_STAIRS.x, S.top - 0.15, S.zBack - 0.1, 1.5, 0.15, 0.3, conc);
    // sea-side rail (invisible collider + visual)
    this.box(0, S.top + 0.6, S.zFront + 0.15, 110, 0.6, 0.1, null, { group: G.INVIS });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(220, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x6d7a80 }));
    rail.position.set(0, S.top + 1.0, S.zFront - 0.05);
    this.group.add(rail);
    // wave-dissipating blocks (simple, original)
    const tetra = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1.1), new THREE.MeshStandardMaterial({ color: 0x9a978f, flatShading: true }), 90);
    const rnd = mulberry(9);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 90; i++) {
      const x = -95 + (i / 89) * 190;
      m.compose(new THREE.Vector3(x, -0.2 + rnd() * 0.4, S.zFront + 9 + rnd() * 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)), new THREE.Vector3(1, 1, 1));
      tetra.setMatrixAt(i, m);
    }
    this.group.add(tetra);
  }

  private buildAlley() {
    const block = new THREE.MeshStandardMaterial({ color: 0xa9a59b, roughness: 1 });
    // block walls lining the alley
    for (const x of [-27.6, -22.4]) {
      this.box(x, GROUND + 0.8, -35.5, 0.1, 0.8, 3.5, block);
    }
    // --- Hazard: utility pole falls across the alley at t=18 (blocks the shortcut)
    const pivot = new THREE.Group();
    pivot.position.set(-21.6, GROUND, ALLEY_BLOCK.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 9, 8), new THREE.MeshStandardMaterial({ color: 0x8c8a84 }));
    pole.position.y = 4.5;
    pole.castShadow = true;
    pivot.add(pole);
    this.group.add(pivot);
    const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, Math.PI / 2 - 0.18));
    this.hazards.push({ id: 'pole', label: '倒れた電柱', pivot, from: pivot.quaternion.clone(), to, time: 18, duration: 1.4, zone: new THREE.Vector2(-25, ALLEY_BLOCK.z), radius: 3, fallen: false, blocker: { center: new THREE.Vector3(-25, GROUND + 1.0, ALLEY_BLOCK.z), half: new THREE.Vector3(2.6, 1.0, 0.7) } });
    // rubble that appears with the pole (a broken block wall section)
    const rubble = new THREE.Group();
    rubble.visible = false;
    const rnd = mulberry(3);
    for (let i = 0; i < 14; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.4 + rnd() * 0.3, 0.2, 0.4), block);
      r.position.set(-25 + (rnd() - 0.5) * 4.5, GROUND + 0.1 + rnd() * 0.5, ALLEY_BLOCK.z + (rnd() - 0.5) * 1.8);
      r.rotation.set(rnd(), rnd(), rnd());
      rubble.add(r);
    }
    rubble.name = 'alleyRubble';
    this.group.add(rubble);
    pivot.userData.rubble = rubble;
  }

  private buildPolesAndWires() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8c8a84 });
    const pts: THREE.Vector3[] = [];
    for (let x = -50; x <= 52; x += 17) pts.push(new THREE.Vector3(x, GROUND, 28.3));
    const posts: THREE.Vector3[] = [];
    for (const p of pts) {
      if (ROADS_NS.some((rx) => Math.abs(p.x - rx) < ROAD_HALF + 0.5)) p.x += 5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 8.5, 6), poleMat);
      pole.position.set(p.x, GROUND + 4.25, p.z);
      pole.castShadow = true;
      this.group.add(pole);
      this.addSway(pole, 1.6);
      this.box(p.x, GROUND + 2, p.z, 0.17, 2, 0.17, null);
      posts.push(new THREE.Vector3(p.x, GROUND + 8, p.z));
    }
    const wmat = new THREE.LineBasicMaterial({ color: 0x222222 });
    for (let i = 0; i < posts.length - 1; i++) {
      const g = new THREE.BufferGeometry().setFromPoints(new Array(9).fill(0).map(() => new THREE.Vector3()));
      const line = new THREE.Line(g, wmat);
      this.group.add(line);
      this.wires.push({ line, a: posts[i], b: posts[i + 1], phase: i });
    }
    this.updateWires(0, 0);
  }

  private updateWires(t: number, amp: number) {
    for (const w of this.wires) {
      const pos = w.line.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < 9; k++) {
        const s = k / 8;
        const sag = Math.sin(s * Math.PI);
        const x = w.a.x + (w.b.x - w.a.x) * s;
        const y = w.a.y + (w.b.y - w.a.y) * s - sag * 0.6 + sag * Math.sin(t * 4 + w.phase) * amp * 0.5;
        const z = w.a.z + (w.b.z - w.a.z) * s + sag * Math.cos(t * 3.3 + w.phase) * amp * 0.6;
        pos.setXYZ(k, x, y, z);
      }
      pos.needsUpdate = true;
    }
  }

  private buildHill() {
    // guard fence along the cliff top (openings at the slope road and the stairs)
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a3 });
    const zf = CLIFF.zTop - 1.2;
    const segs: [number, number][] = [[-95, RAMP_B.x - 2.4], [RAMP_B.x + 2.4, RAMP_A.x - 5.4], [RAMP_A.x + 5.4, 95]];
    for (const [a, b] of segs) {
      const cx = (a + b) / 2;
      const y = terrainHeight(cx, zf);
      this.box(cx, y + 0.6, zf, (b - a) / 2, 0.8, 0.08, null, { group: G.INVIS });
      for (let x = a; x <= b; x += 3) {
        const yy = terrainHeight(x, zf);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), fenceMat);
        post.position.set(x, yy + 0.55, zf);
        this.group.add(post);
        if (x + 3 <= b) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.06), fenceMat);
          r.position.set(x + 1.5, (yy + terrainHeight(x + 3, zf)) / 2 + 1.05, zf);
          this.group.add(r);
        }
      }
    }
    // trees
    const rnd = mulberry(77);
    const n = 260;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x5b4535 }), n);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5, 7), new THREE.MeshStandardMaterial({ color: 0x3d5f3a, flatShading: true }), n);
    crown.castShadow = true;
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < 2000 && k < n; i++) {
      const x = -105 + rnd() * 210;
      const z = -170 + rnd() * 110;
      if (z > CLIFF.zTop - 3) continue;
      if (Math.hypot(x - PARK.x, z - PARK.z) < PARK.r + 4) continue;
      if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < SHRINE.r + 3) continue;
      if (Math.abs(x - RAMP_A.x) < 7 && z > PARK.z) continue;
      if (Math.abs(x - RAMP_B.x) < 4 && z > -75) continue;
      // path from park to shrine
      if (pathDist(x, z) < 4) continue;
      const y = terrainHeight(x, z);
      const s = 0.8 + rnd() * 0.6;
      m.compose(new THREE.Vector3(x, y + 1.1 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      trunk.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(x, y + (2.2 + 2.5) * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      crown.setMatrixAt(k, m);
      k++;
    }
    trunk.count = crown.count = k;
    this.group.add(trunk, crown);
    // park benches & shelter
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a4a });
    for (let i = 0; i < 4; i++) {
      const bx = PARK.x - 9 + i * 6;
      const bz = PARK.z - 9;
      const y = terrainHeight(bx, bz);
      this.box(bx, y + 0.25, bz, 0.9, 0.25, 0.3, wood);
    }
    const sy = terrainHeight(PARK.x + 10, PARK.z + 2);
    this.box(PARK.x + 10, sy + 2.6, PARK.z + 2, 3, 0.12, 2.2, new THREE.MeshStandardMaterial({ color: 0x4a6a7a }));
    for (const [dx, dz] of [[-2.8, -2], [2.8, -2], [-2.8, 2], [2.8, 2]]) this.box(PARK.x + 10 + dx, sy + 1.3, PARK.z + 2 + dz, 0.08, 1.3, 0.08, wood);
    // shrine (torii + small hall)
    const red = new THREE.MeshStandardMaterial({ color: 0xb83a2a });
    const tz = SHRINE.z + 13;
    const ty = terrainHeight(SHRINE.x, tz);
    for (const dx of [-1.8, 1.8]) this.box(SHRINE.x + dx, ty + 2, tz, 0.15, 2, 0.15, red);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 0.35), red);
    beam.position.set(SHRINE.x, ty + 4.1, tz);
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 0.25), red);
    beam2.position.set(SHRINE.x, ty + 3.5, tz);
    this.group.add(beam, beam2);
    const hy = terrainHeight(SHRINE.x, SHRINE.z - 3);
    this.box(SHRINE.x, hy + 1.6, SHRINE.z - 3, 2.5, 1.6, 2, new THREE.MeshStandardMaterial({ color: 0x8a6448 }));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0x3b3b3b, flatShading: true }));
    roof.position.set(SHRINE.x, hy + 4.0, SHRINE.z - 3);
    roof.rotation.y = Math.PI / 4;
    this.group.add(roof);
  }

  private addSignPost(x: number, z: number, rotY: number, tex: THREE.Texture, w: number, h: number, text: string, poleH = 2.4) {
    const y = terrainHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, poleH + h, 6), new THREE.MeshStandardMaterial({ color: 0x8f9499 }));
    pole.position.set(x, y + (poleH + h) / 2, z);
    this.group.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    board.position.set(x, y + poleH + h / 2 - 0.1, z);
    board.rotation.y = rotY;
    board.translateZ(0.07);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x8f9499, roughness: 0.5 }));
    back.rotation.y = Math.PI;
    back.position.z = -0.01;
    board.add(back);
    this.group.add(board);
    this.signs.push({ pos: new THREE.Vector3(x, y + 1.5, z), text });
    return board;
  }

  private buildSigns() {
    // Evacuation guidance (original simplified designs; fictional names and distances)
    this.addSignPost(-3, 29.2, 0, evacSignTexture('area', '潮凪台公園', '→', '約140m'), 2.0, 1.0, '津波避難場所「潮凪台公園」→ 東へ。坂道を上って約140m');
    this.addSignPost(-14.5, 29.2, 0, evacSignTexture('building', '潮凪町民センター', '←', '約20m'), 2.0, 1.0, '津波避難ビル「潮凪町民センター」← 外階段から屋上へ');
    this.addSignPost(24.6, 28.6, -Math.PI / 2, evacSignTexture('area', '潮凪台公園', '↑', '約120m'), 2.0, 1.0, '津波避難場所「潮凪台公園」↑ この道を北へ');
    this.addSignPost(24.6, -1.6, -Math.PI / 2, evacSignTexture('area', '潮凪台公園', '↑', '約90m'), 2.0, 1.0, '津波避難場所「潮凪台公園」↑ 北の坂道へ');
    this.addSignPost(25.2, -25.5, 0, evacSignTexture('area', '潮凪台公園', '↑', '坂の上'), 2.0, 1.0, '津波避難場所「潮凪台公園」↑ この坂道を上る');
    this.addSignPost(-23.5, 22.8, 0, evacSignTexture('building', '潮凪町民センター', '↑', '外階段'), 2.0, 1.0, '津波避難ビル「潮凪町民センター」この外階段から屋上（5階建て）へ');
    // Shortcut sign – NOT an evacuation route sign
    this.addSignPost(-21, -31, 0, plainSignTexture(['近道', '高台へ（階段）'], '#f4f1e8', '#333', 384, 192), 1.4, 0.7, '「近道 高台へ（階段）」— 避難経路の標識ではありません');
    // Park / shrine
    this.addSignPost(PARK.x - 5, PARK.z + 10, 0, plainSignTexture(['潮凪台公園', '指定緊急避難場所（架空）', '海抜 約15m'], '#1f7a4a', '#fff', 512, 256), 2.2, 1.1, '潮凪台公園（ゲーム内の指定緊急避難場所）海抜 約15m');
    this.addSignPost(PARK.x - 12, PARK.z - 6, Math.PI / 2, plainSignTexture(['より高い場所へ', '潮凪神社（架空）→'], '#f4f1e8', '#333', 384, 192), 1.4, 0.7, 'より高い場所へ：潮凪神社 →（北西）');
    // Elevation markers (海抜表示)
    const elev: [number, number, string][] = [[-1.6, 29.4, '1'], [16.4, -20, '1'], [16.2, -48, '8'], [PARK.x + 6, PARK.z + 12, '15'], [SHRINE.x + 3, SHRINE.z + 6, '28']];
    for (const [x, z, m] of elev) {
      const y = terrainHeight(x, z);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.8), new THREE.MeshStandardMaterial({ map: elevationSignTexture(m), side: THREE.DoubleSide }));
      p.position.set(x, y + 1.8, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x8f9499 }));
      post.position.set(x, y + 1.1, z - 0.05);
      this.group.add(p, post);
      this.signs.push({ pos: new THREE.Vector3(x, y + 1.5, z), text: `海抜 ${m}m（ゲーム内の値）` });
    }
  }

  private buildCars() {
    this.parkedCar = this.carTemplate.clone(true);
    this.parkedCar.position.set(PARKED_CAR.x, GROUND, PARKED_CAR.z);
    this.parkedCar.rotation.y = Math.PI / 2;
    this.parkedCar.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = true), (o.receiveShadow = true))));
    this.group.add(this.parkedCar);
    this.box(PARKED_CAR.x, GROUND + 0.8, PARKED_CAR.z, 1.7, 0.8, 0.75, null);
    // parking lot surface
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ color: 0x6a6e74 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(PARKED_CAR.x, GROUND + 0.02, PARKED_CAR.z + 1);
    this.group.add(lot);
    // traffic-jam cars (hidden until the evacuation starts)
    const colors = [0xd9dde3, 0x2c3e66, 0x9a2b2b, 0x3a3a3a, 0xe8e2cf, 0x5c6b5a, 0xd9dde3, 0x2c3e66];
    for (let i = 0; i < 8; i++) {
      const car = this.carTemplate.clone(true);
      const lane = i % 2 === 0 ? 18.2 : 21.8;
      const z = -4 + Math.floor(i / 2) * 5.5 + (i % 2) * 1.5;
      car.position.set(lane, GROUND, z);
      car.rotation.y = 0;
      car.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh && (mm.material as THREE.MeshStandardMaterial).name === 'CarBody') {
          mm.material = (mm.material as THREE.MeshStandardMaterial).clone();
          (mm.material as THREE.MeshStandardMaterial).color.setHex(colors[i]);
        }
        if (mm.isMesh) mm.castShadow = true;
      });
      car.visible = false;
      car.userData.collider = { x: lane, z };
      this.group.add(car);
      this.jamCars.push(car);
    }
  }

  showJam() {
    for (const car of this.jamCars) {
      if (car.visible) continue;
      car.visible = true;
      const { x, z } = car.userData.collider;
      this.box(x, GROUND + 0.8, z, 0.75, 0.8, 1.7, null);
      this.dynamicColliders.push(this.lastCollider!);
    }
  }

  private buildBoats() {
    const hull = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, flatShading: true });
    const cabin = new THREE.MeshStandardMaterial({ color: 0x3a6ea5 });
    for (const [x, z] of [[-40, 120], [30, 150], [70, 110], [-80, 170]]) {
      const b = new THREE.Group();
      const h = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 7), hull);
      h.position.y = 0.3;
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 2), cabin);
      c.position.set(0, 1.3, 1);
      b.add(h, c);
      b.position.set(x, 0, z);
      b.rotation.y = x * 0.03;
      this.group.add(b);
      this.boats.push(b);
    }
  }

  private buildZones() {
    const z = (id: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      this.zones.push({ id, min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) });
    z('seawall', -110, SEAWALL.top - 0.6, SEAWALL.zBack - 0.5, 110, SEAWALL.top + 3, SEAWALL.zFront + 1);
    z('alley', -27.5, 0, -40, -22.5, 5, -32);
    z('evacRoof', EVAC_BUILDING.x - EVAC_BUILDING.w / 2, EVAC_BUILDING_ROOF - 0.5, EVAC_BUILDING.z - EVAC_BUILDING.d / 2, -24, EVAC_BUILDING_ROOF + 4, EVAC_BUILDING.z + EVAC_BUILDING.d / 2);
    z('park', PARK.x - PARK.r - 20, 12.5, PARK.z - PARK.r - 6, PARK.x + PARK.r + 30, 40, CLIFF.zTop - 4);
    z('hill', -110, 12.5, -300, 110, 60, CLIFF.zTop - 4);
    z('shrine', SHRINE.x - SHRINE.r - 2, 22, SHRINE.z - SHRINE.r - 2, SHRINE.x + SHRINE.r + 2, 60, SHRINE.z + SHRINE.r + 2);
    z('car', PARKED_CAR.x - 3, 0, PARKED_CAR.z - 4, PARKED_CAR.x + 3, 4, PARKED_CAR.z + 2.6);
  }

  inZone(id: string, p: THREE.Vector3) {
    const zn = this.zones.find((q) => q.id === id);
    if (!zn) return false;
    return p.x >= zn.min.x && p.x <= zn.max.x && p.y >= zn.min.y && p.y <= zn.max.y && p.z >= zn.min.z && p.z <= zn.max.z;
  }

  /** Walkable surface height for NPCs (terrain + seawall + its stairs). */
  walkHeight(x: number, z: number) {
    let h = terrainHeight(x, z);
    if (z >= SEAWALL.zBack && z <= SEAWALL.zFront) h = Math.max(h, SEAWALL.top);
    if (Math.abs(x - SEAWALL_STAIRS.x) < 1.5 && z >= SEAWALL_STAIRS.z0 && z < SEAWALL.zBack) {
      const t = (z - SEAWALL_STAIRS.z0) / (SEAWALL_STAIRS.z1 - SEAWALL_STAIRS.z0);
      h = Math.max(h, GROUND + Math.min(1, t) * (SEAWALL.top - GROUND));
    }
    return h;
  }

  // ---------------------------------------------------------------- per frame
  update(t: number, quakeT: number, shake: number, swayMul: number, dt: number) {
    const amp = shake * swayMul;
    this.updateHouses(t, amp);
    this.updateWires(t, Math.max(amp, 0.02));
    for (const s of this.swayers) {
      this.tmpE.set(Math.sin(t * 7 + s.phase) * amp * 0.02 * s.amp, 0, Math.cos(t * 6 + s.phase) * amp * 0.02 * s.amp);
      s.obj.quaternion.copy(s.base).multiply(this.tmpQ.setFromEuler(this.tmpE));
    }
    for (const b of this.boats) {
      b.position.y = Math.sin(t * 0.8 + b.position.x) * 0.15;
      b.rotation.z = Math.sin(t * 0.6 + b.position.z) * 0.04;
    }
    for (const h of this.hazards) {
      if (quakeT < h.time) {
        // jitter before falling
        if (quakeT > 0 && h.id !== 'pole') {
          this.tmpE.set(Math.sin(t * 19) * 0.03 * amp, 0, Math.cos(t * 17) * 0.03 * amp);
          h.pivot.quaternion.copy(h.from).multiply(this.tmpQ.setFromEuler(this.tmpE));
        }
        continue;
      }
      const k = Math.min(1, (quakeT - h.time) / h.duration);
      const e = k * k; // accelerate like a fall
      h.pivot.quaternion.slerpQuaternions(h.from, h.to, e);
      if (h.pivot.userData.drop !== undefined) {
        h.pivot.position.y = h.pivot.userData.baseY + (h.pivot.userData.drop - h.pivot.userData.baseY) * e;
      }
      if (k >= 1 && !h.fallen) {
        h.fallen = true;
        this.addBlocker(h);
      }
    }
    void dt;
  }

  /** Immediately put all hazards into their fallen state (used when retrying/skipping). */
  settleHazards() {
    for (const h of this.hazards) {
      h.pivot.quaternion.copy(h.to);
      if (h.pivot.userData.drop !== undefined) h.pivot.position.y = h.pivot.userData.drop;
      if (!h.fallen) {
        h.fallen = true;
        this.addBlocker(h);
      }
    }
  }

  private addBlocker(h: Hazard) {
    if (h.blocker) {
      this.box(h.blocker.center.x, h.blocker.center.y, h.blocker.center.z, h.blocker.half.x, h.blocker.half.y, h.blocker.half.z, null);
      this.dynamicColliders.push(this.lastCollider!);
    }
    if (h.pivot.userData.rubble) h.pivot.userData.rubble.visible = true;
  }

  /** Restore the pre-quake state (for retries). */
  resetHazards() {
    for (const c of this.dynamicColliders) this.world.removeCollider(c, false);
    this.dynamicColliders = [];
    for (const h of this.hazards) {
      h.fallen = false;
      h.duration = h.id === 'vending' ? 1.1 : h.id === 'sign' ? 0.7 : 1.4;
      h.pivot.quaternion.copy(h.from);
      if (h.pivot.userData.baseY !== undefined) h.pivot.position.y = h.pivot.userData.baseY;
      if (h.pivot.userData.rubble) h.pivot.userData.rubble.visible = false;
    }
    for (const car of this.jamCars) car.visible = false;
    this.parkedCar.visible = true;
  }
}

function pathDist(x: number, z: number) {
  // straight path from the park towards the shrine
  const ax = PARK.x, az = PARK.z, bx = SHRINE.x, bz = SHRINE.z + 12;
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}
