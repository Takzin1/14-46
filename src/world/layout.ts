// Layout of the fictional town 潮凪町. Y is up, sea is +Z (south), hills are -Z (north).
// All numbers are in meters. Lowland ground level is y = 1.0 (海抜1m in game terms).

export const GROUND = 1.0;
export const PLATEAU = 14.0;
export const SEA_LEVEL = 0.0;

export const TERRAIN = { minX: -130, maxX: 130, minZ: -175, maxZ: 120, cell: 1 };

export const CLIFF = { zBase: -48, zTop: -58 };
export const SEAWALL = { zFront: 61, zBack: 57, top: 4.2 };

/** Route A: the main slope road (坂道) up to the hill park. */
export const RAMP_A = { x: 20, halfWidth: 4, z0: -28, z1: -66 };
/** Route B: narrow stairs (近道) – blocked by a fallen pole after the quake. */
export const RAMP_B = { x: -25, halfWidth: 1.8, z0: -40, z1: -62 };

export const ROADS_NS = [-55, -18, 0, 20, 55];
export const ROADS_EW = [-28, 2, 32, 52];
export const ROAD_HALF = 4;

/** Player start on the shopping street. yaw is the camera yaw (−π/2 = looking east). */
export const START = { x: -7.5, z: 35, yaw: -Math.PI / 2 };

export const EVAC_BUILDING = { x: -36, z: 16, w: 16, d: 11, floors: 5, floorH: 3.2 };
export const EVAC_BUILDING_ROOF = GROUND + EVAC_BUILDING.floors * EVAC_BUILDING.floorH; // 17

export const PARK = { x: 20, z: -82, r: 16 }; // 指定緊急避難場所（架空）潮凪台公園
export const SHRINE = { x: -12, z: -140, r: 9 }; // さらに高い場所（架空）

export const SEAWALL_STAIRS = { x: 2, z0: 49, z1: 56.8 };
export const PARKED_CAR = { x: 28, z: 39 };
export const CAR_JAM_POINT = { x: 20, z: 6 };
export const ALLEY_BLOCK = { x: -25, z: -36 };
export const VENDING = { x: -5.4, z: 36.5 };
export const SHOP_SIGN = { x: -9.5, z: 37 };

/** Final flood level in the simplified tsunami effect (NOT a simulation). */
export const FLOOD_LEVEL = 9.5;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function baseHeight(x: number, z: number): number {
  let h = GROUND;
  // beach towards the sea
  if (z > SEAWALL.zFront) h = GROUND - 0.6 - smoothstep(SEAWALL.zFront, 95, z) * 5.5;
  // cliff + plateau to the north
  if (z < CLIFF.zBase) {
    const t = smoothstep(-CLIFF.zBase, -CLIFF.zTop, -z);
    h = GROUND + t * (PLATEAU - GROUND);
    if (z < CLIFF.zTop) h += (CLIFF.zTop - z) * 0.05;
  }
  // shrine knoll (higher ground)
  const dx = x - SHRINE.x;
  const dz = z - SHRINE.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  h += 11 * (1 - smoothstep(SHRINE.r, SHRINE.r + 26, d));
  // side mountains enclosing the play area
  const side = Math.abs(x);
  if (side > 95) h = Math.max(h, GROUND + (side - 95) * 1.1 * smoothstep(95, 110, side));
  // far north ridge
  if (z < -160) h += (-160 - z) * 1.5;
  return h;
}

function rampHeight(z: number, z0: number, z1: number, h0: number, h1: number) {
  const t = Math.min(1, Math.max(0, (z0 - z) / (z0 - z1)));
  return h0 + (h1 - h0) * t;
}

export function terrainHeight(x: number, z: number): number {
  let h = baseHeight(x, z);
  // Route A embankment road
  {
    const top = baseHeight(RAMP_A.x, RAMP_A.z1);
    const hr = rampHeight(z, RAMP_A.z0, RAMP_A.z1, GROUND, top);
    const m = 1 - smoothstep(RAMP_A.halfWidth, RAMP_A.halfWidth + 1.2, Math.abs(x - RAMP_A.x));
    const along = z <= RAMP_A.z0 + 0.01 && z >= RAMP_A.z1 - 8 ? 1 : 0;
    if (along) h = h + (hr - h) * m;
  }
  // Route B stairs
  {
    const top = baseHeight(RAMP_B.x, RAMP_B.z1);
    const hr = rampHeight(z, RAMP_B.z0, RAMP_B.z1, GROUND, top);
    const m = 1 - smoothstep(RAMP_B.halfWidth, RAMP_B.halfWidth + 0.8, Math.abs(x - RAMP_B.x));
    const along = z <= RAMP_B.z0 + 0.01 && z >= RAMP_B.z1 - 6 ? 1 : 0;
    if (along) h = h + (hr - h) * m;
  }
  return h;
}

export function isOnRoad(x: number, z: number, pad = 0): boolean {
  for (const rx of ROADS_NS) if (Math.abs(x - rx) < ROAD_HALF + pad && z > CLIFF.zBase - 2 && z < SEAWALL.zBack) return true;
  for (const rz of ROADS_EW) if (Math.abs(z - rz) < ROAD_HALF + pad) return true;
  return false;
}
