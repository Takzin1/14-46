import * as THREE from 'three';
import { CharacterRig } from './player';

export interface NpcDef {
  id: string;
  name: string;
  pos: [number, number];
  yaw: number;
  route: [number, number][];
  autoStart: boolean; // starts evacuating right after the shaking stops
  linesBefore: string; // before the quake
  linesIdle: string; // during evacuation, before being called
  linesCalled: string; // reply when the player calls out
  jacket: number;
  speed: number;
}

export class Npc {
  object = new THREE.Group();
  rig: CharacterRig;
  state: 'idle' | 'walking' | 'arrived' = 'idle';
  called = false;
  private wp = 0;
  private yaw: number;
  private speed = 0;
  constructor(public def: NpcDef, model: THREE.Object3D, private heightAt: (x: number, z: number) => number) {
    this.rig = new CharacterRig(model);
    this.object.add(model);
    this.yaw = def.yaw;
    this.reset();
  }
  reset() {
    this.state = 'idle';
    this.called = false;
    this.wp = 0;
    this.speed = 0;
    this.object.visible = true;
    this.object.position.set(this.def.pos[0], this.heightAt(this.def.pos[0], this.def.pos[1]), this.def.pos[1]);
    this.yaw = this.def.yaw;
    this.object.rotation.y = this.yaw;
  }
  start() {
    if (this.state === 'idle') this.state = 'walking';
  }
  update(dt: number, crouch: boolean) {
    let moving = 0;
    if (this.state === 'walking') {
      const target = this.def.route[this.wp];
      const p = this.object.position;
      const dx = target[0] - p.x;
      const dz = target[1] - p.z;
      const d = Math.hypot(dx, dz);
      this.speed += (this.def.speed - this.speed) * Math.min(1, dt * 3);
      if (d < 0.6) {
        this.wp++;
        if (this.wp >= this.def.route.length) this.state = 'arrived';
      } else {
        const step = Math.min(d, this.speed * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        p.y = this.heightAt(p.x, p.z);
        const target = Math.atan2(-dx, -dz);
        let a = target - this.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        this.yaw += a * Math.min(1, dt * 8);
        moving = this.speed;
      }
    }
    this.object.rotation.y = this.yaw;
    this.rig.animate(dt, moving, crouch);
  }
}

export const NPC_DEFS: NpcDef[] = [
  {
    id: 'shopkeeper',
    name: '青果店の店主',
    pos: [11, 35.6],
    yaw: Math.PI,
    route: [[11, 32], [20, 31], [20, -28], [20, -62], [18, -78]],
    autoStart: false,
    linesBefore: '「いらっしゃい。今日は風が冷たいねえ。」',
    linesIdle: '「すごい揺れだった……店の片付けをしないと。海は静かだし、大丈夫だろう？」',
    linesCalled: '「……そうだな、片付けは後だ。一緒に高台へ行こう！」',
    jacket: 0x7a4a2a,
    speed: 3.2,
  },
  {
    id: 'angler',
    name: '防潮堤の釣り人',
    pos: [14, 59],
    yaw: Math.PI,
    route: [[2, 59], [2, 56.5], [2, 49], [2, 31], [20, 31], [20, -28], [20, -62], [22, -84]],
    autoStart: false,
    linesBefore: '「今日は静かな海だよ。」',
    linesIdle: '「海は静かだよ。波も引いてないし、津波なんて来ないんじゃないか？」',
    linesCalled: '「えっ、大津波警報？ 分かった、すぐ逃げる！」',
    jacket: 0x4a6a3a,
    speed: 3.4,
  },
  {
    id: 'resident1',
    name: '近所の人',
    pos: [-30, 2],
    yaw: 0,
    route: [[-18, 2], [-18, -26], [20, -27], [20, -62], [24, -80]],
    autoStart: true,
    linesBefore: '「こんにちは。」',
    linesIdle: '「強い揺れだった！ 高台へ急ぎましょう！」',
    linesCalled: '「高台へ急ぎましょう！」',
    jacket: 0xa03c3c,
    speed: 3.0,
  },
  {
    id: 'resident2',
    name: '近所の人',
    pos: [36, 14],
    yaw: 0,
    route: [[24, 14], [21, -27], [21, -62], [26, -86]],
    autoStart: true,
    linesBefore: '「こんにちは。」',
    linesIdle: '「揺れが長かった。すぐ高台へ！」',
    linesCalled: '「すぐ高台へ！」',
    jacket: 0x6a5a9a,
    speed: 3.3,
  },
];
