import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Collision group bits. */
export const G = {
  STATIC: 0x0001, // visible world geometry (blocks the camera)
  INVIS: 0x0002, // invisible walls / rails (do not block the camera)
  PLAYER: 0x0004,
  DEBRIS: 0x0008,
};

export function groups(membership: number, filter: number) {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

let ready: Promise<void> | null = null;
export function initPhysics() {
  if (!ready) ready = RAPIER.init();
  return ready;
}
