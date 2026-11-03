import * as THREE from 'three';
import { RAPIER, G, groups } from './physics';
import { buildTerrain, buildBackdrop, mulberry } from './world/terrain';
import { City } from './world/city';
import { Water } from './world/water';
import {
  START, GROUND, SEAWALL, FLOOD_LEVEL, EVAC_BUILDING_ROOF, CLIFF, PARKED_CAR, terrainHeight, RAMP_A, PARK, SHRINE,
} from './world/layout';
import { Player } from './player';
import { CameraRig } from './camera';
import { Input } from './input';
import { AudioSys } from './audio';
import { Npc, NPC_DEFS } from './npc';
import { cloneCharacter, type Assets } from './assets';
import { type Settings, fx } from './settings';
import { newLog, type DecisionLog } from './review';
import { BROADCAST } from './content';
import type { UI } from './ui';

export type Phase = 'title' | 'prologue' | 'quake' | 'evacuate' | 'safe' | 'failed' | 'review';

/** Scenario timings (seconds of real play). Compressed and fictional — see README. */
export const QUAKE = { strongStart: 3, strongEnd: 26, end: 32 };
export const EVAC = { broadcast: 4, foamLine: 66, seaRise: 72, overtop: 80, frontSpeed: 9, recede: 118, returnPrompt: 126 };
export const PROLOGUE_LEN = 14;
const CLOCK_SCALE = 6; // 1 real second = 6 game seconds (shown as 時間短縮)
const WALK = 3.0;
const RUN = 5.6;

export function quakeEnvelope(t: number) {
  if (t < 0) return 0;
  if (t < 3) return 0.12 + (0.13 * t) / 3;
  if (t < 5) return 0.25 + (0.75 * (t - 3)) / 2;
  if (t < QUAKE.strongEnd) return 0.85 + 0.15 * Math.sin(t * 0.9);
  if (t < QUAKE.end) return 0.85 * (1 - (t - QUAKE.strongEnd) / (QUAKE.end - QUAKE.strongEnd));
  return 0;
}

interface Tile { body: RAPIER.RigidBody; mesh: THREE.Mesh; checked: boolean }

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: RAPIER.World;
  city: City;
  water = new Water();
  player: Player;
  cam: CameraRig;
  input: Input;
  audio = new AudioSys();
  npcs: Npc[] = [];
  sun: THREE.DirectionalLight;
  phase: Phase = 'title';
  paused = false;
  time = 0;
  phaseT = 0;
  quakeT = -1;
  evacT = -1;
  shake = 0;
  log: DecisionLog = newLog();
  timeScale = 1;
  fps = 0;
  private fpsAcc = { frames: 0, time: 0 };
  private tiles: Tile[] = [];
  private tileTimer = 0;
  private quakeEndPos = new THREE.Vector3();
  private flags = new Set<string>();
  private rnd = mulberry(311);
  private stepSound = 0;
  bot: { route: [number, number][]; i: number; run: boolean } | null = null;
  private tileGeo = new THREE.BoxGeometry(0.34, 0.06, 0.28);
  private tileMat = new THREE.MeshStandardMaterial({ color: 0x3c4a5c, roughness: 0.6 });

  constructor(public canvas: HTMLCanvasElement, public assets: Assets, public settings: Settings, public ui: UI) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality === 'high', powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1200);
    this.scene.background = new THREE.Color(0xb9c9d4);
    this.scene.fog = new THREE.Fog(0xb9c9d4, 90, 460);

    const hemi = new THREE.HemisphereLight(0xd6e2ea, 0x7d7464, 1.1);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.1);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -55;
    sc.right = sc.top = 55;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(buildSky());

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.scene.add(buildTerrain(RAPIER, this.world));
    this.scene.add(buildBackdrop());
    this.city = new City(RAPIER, this.world, assets.car);
    this.scene.add(this.city.group);
    this.scene.add(this.water.group);

    const model = cloneCharacter(assets.character);
    this.player = new Player(RAPIER, this.world, model);
    this.scene.add(this.player.object);
    this.cam = new CameraRig(RAPIER, this.world, this.camera, this.player.collider);
    this.input = new Input(canvas);

    for (const def of NPC_DEFS) {
      const n = new Npc(def, cloneCharacter(assets.character, def.jacket, 0x34383f), (x, z) => this.city.walkHeight(x, z));
      this.npcs.push(n);
      this.scene.add(n.object);
    }
    this.applySettings();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.resetWorld();
  }

  applySettings() {
    const s = this.settings;
    const hi = s.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, hi ? 2 : 1));
    this.renderer.shadowMap.enabled = hi;
    this.sun.castShadow = hi;
    this.audio.setVolume(s.volume);
    this.audio.rumbleMul = fx(s).rumble;
    this.water.mode = fx(s).water;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait screens get a wider vertical FOV so the surroundings stay readable.
    this.camera.fov = w / h < 0.8 ? 72 : 60;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ flow
  resetWorld() {
    this.city.resetHazards();
    this.water.reset();
    for (const t of this.tiles) {
      this.world.removeRigidBody(t.body);
      this.scene.remove(t.mesh);
    }
    this.tiles = [];
    for (const n of this.npcs) n.reset();
    this.player.teleport(START.x, terrainHeight(START.x, START.z), START.z, -Math.PI / 2);
    this.cam.yaw = START.yaw;
    this.cam.pitch = 0.3;
    this.quakeT = -1;
    this.evacT = -1;
    this.shake = 0;
    this.flags.clear();
    this.log = newLog();
    this.timeScale = 1;
    this.bot = null;
    this.input.virtual = null;
    this.ui.fade(false);
    this.ui.hideTransient();
  }

  startPrologue() {
    this.resetWorld();
    this.setPhase('prologue');
    this.ui.objective('商店街で買い物の途中です。周りを歩いてみましょう。');
    this.ui.subtitle(`架空の町「潮凪町」。2011年3月11日を思わせる、ある平日の午後。`, 6);
  }

  /** Retry from just before the shaking. */
  retry() {
    this.resetWorld();
    this.setPhase('prologue');
    this.phaseT = PROLOGUE_LEN - 2.5;
    this.ui.objective('もう一度。揺れが始まったら、まず身を守りましょう。');
  }

  setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    this.ui.onPhase(p);
  }

  private event(text: string) {
    this.log.timeline.push({ clock: this.clockText(), text });
  }

  clockText() {
    let s: number;
    if (this.quakeT < 0) s = 14 * 3600 + 45 * 60 + Math.min(55, Math.floor(this.phaseT * 4));
    else s = 14 * 3600 + 46 * 60 + Math.floor(this.quakeT * CLOCK_SCALE);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------------ update
  update(dtReal: number, draw = true) {
    const dt = Math.min(dtReal, 1 / 20) * this.timeScale;
    this.time += dt;
    const f = fx(this.settings);
    const inp = this.input.read();
    if (inp.interact) this.pendingInteract = true;

    if (inp.pause && this.phase !== 'title' && this.phase !== 'review' && this.phase !== 'failed') this.ui.togglePause();
    if (inp.map && this.isPlaying()) this.ui.toggleMap(this.player.position);
    if (this.paused) {
      if (draw) this.render();
      return;
    }
    if (this.isPlaying()) this.phaseT += dt;

    // ---------- phase logic
    if (this.phase === 'prologue' && this.phaseT >= PROLOGUE_LEN) this.startQuake();
    if (this.quakeT >= 0) this.quakeT += dt;
    if (this.phase === 'quake') this.updateQuake(dt);
    if (this.phase === 'evacuate' || this.phase === 'safe') this.updateEvac(dt);

    this.shake = this.phase === 'quake' ? quakeEnvelope(this.quakeT) : 0;

    // ---------- player
    if (this.isPlaying() || this.phase === 'failed') {
      if (this.phase !== 'failed') {
        this.cam.rotate(inp.lookX * 0.0032 * this.settings.sensitivity, inp.lookY * 0.0026 * this.settings.sensitivity * (this.settings.invertY ? -1 : 1));
      }
      const dir = new THREE.Vector2();
      let run = inp.run;
      let protect = inp.protect;
      if (this.bot) {
        const p = this.player.position;
        const wp = this.bot.route[this.bot.i];
        if (wp) {
          const d = new THREE.Vector2(wp[0] - p.x, wp[1] - p.z);
          if (d.length() < 1.2) this.bot.i++;
          else dir.copy(d.normalize());
        }
        run = this.bot.run;
        this.cam.autoFollow = 1;
      } else {
        this.cam.autoFollow = 0;
        const fwd = new THREE.Vector2(-Math.sin(this.cam.yaw), -Math.cos(this.cam.yaw));
        const right = new THREE.Vector2(Math.cos(this.cam.yaw), -Math.sin(this.cam.yaw));
        dir.addScaledVector(fwd, inp.moveY).addScaledVector(right, inp.moveX);
      }
      if (this.phase === 'failed' || this.phase === 'review') { dir.set(0, 0); protect = false; }
      let speed = run ? RUN : WALK;
      const wobble = new THREE.Vector2();
      if (this.shake > 0) {
        speed *= Math.max(0.22, 1 - this.shake * 0.78);
        wobble.set(Math.sin(this.time * 5.3) * this.shake * 0.9, Math.cos(this.time * 4.1) * this.shake * 0.6);
        if (protect) wobble.multiplyScalar(0.1);
      }
      if (this.player.stagger > 0) {
        this.player.stagger -= dt;
        speed *= 0.4;
        wobble.x += Math.sin(this.time * 9) * 0.8;
      }
      this.player.move(dt, dir, speed, protect, wobble);
      if (this.phase === 'quake' && this.quakeT >= QUAKE.strongStart && this.quakeT < QUAKE.strongEnd) {
        this.log.strongTime += dt;
        if (protect) this.log.protectTime += dt;
      }
      if (this.player.speed > 0.5 && this.player.grounded) {
        this.stepSound -= dt * this.player.speed;
        if (this.stepSound < 0) { this.audio.step(); this.stepSound = 1.6; }
      }
    }

    // ---------- physics
    this.world.timestep = Math.max(1 / 240, dt);
    this.world.step();
    this.player.syncVisual();

    // ---------- world animation
    this.city.update(this.time, this.quakeT, this.shake, f.buildingSway, dt);
    for (const n of this.npcs) {
      n.update(dt, this.phase === 'quake' && this.shake > 0.3);
      if (this.water.active && n.object.position.y < FLOOD_LEVEL + 0.5 && n.object.position.z > this.water.frontZ - 30) n.object.visible = false;
    }
    for (const t of this.tiles) {
      const p = t.body.translation();
      const q = t.body.rotation();
      t.mesh.position.set(p.x, p.y, p.z);
      t.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    this.water.update(this.time, this.foamState());

    // ---------- camera
    const pp = this.player.position;
    const focus = new THREE.Vector3(pp.x, pp.y + 1.45 - this.player.rig.crouch * 0.5, pp.z);
    const s = this.shake * f.shake;
    this.cam.shake.set((this.rnd() - 0.5) * s * 0.22, (this.rnd() - 0.5) * s * 0.16, (this.rnd() - 0.5) * s * 0.22);
    this.cam.roll = Math.sin(this.time * 7.3) * s * 0.025;
    this.cam.update(dt, focus, this.player.yaw, this.player.speed > 0.3);
    this.player.object.visible = this.cam.current > 0.9; // avoid clipping through the character
    this.sun.position.set(pp.x - 60, pp.y + 85, pp.z + 45);
    this.sun.target.position.set(pp.x, pp.y, pp.z);

    // ---------- audio & HUD
    const roar = this.water.active ? Math.max(0, 1 - Math.max(0, pp.z - this.water.frontZ) / 120) * 0 + Math.max(0, 1 - Math.abs(pp.z - this.water.frontZ) / 140) : 0;
    this.audio.update(this.shake, this.water.active ? 0.2 : Math.max(0, 1 - Math.abs(pp.z - SEAWALL.zFront) / 90) + 0.15, roar);
    this.ui.vignette(f.flash ? this.shake * 0.9 : 0);
    this.ui.hud({
      clock: this.clockText(),
      shake: this.shake,
      showMeter: this.phase === 'quake',
      flood: this.water.active || this.water.foamLine.visible,
      fps: this.settings.showFps ? this.fps : -1,
    });
    this.updatePrompts();
    if (draw) this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  tickFps(dtReal: number) {
    this.fpsAcc.frames++;
    this.fpsAcc.time += dtReal;
    if (this.fpsAcc.time >= 0.5) {
      this.fps = this.fpsAcc.frames / this.fpsAcc.time;
      this.fpsAcc.frames = 0;
      this.fpsAcc.time = 0;
    }
  }

  isPlaying() {
    return this.phase === 'prologue' || this.phase === 'quake' || this.phase === 'evacuate' || this.phase === 'safe';
  }

  // ------------------------------------------------------------------ quake
  startQuake() {
    this.setPhase('quake');
    this.quakeT = 0;
    this.event('揺れを感じた（ゲーム内の地震発生）');
    this.ui.objective('揺れている！ 倒れやすい物から離れ、頭を守って身をかがめる');
    this.ui.subtitle('揺れ始めた……！　自動販売機・看板・ブロック塀から離れて、頭を守ろう。', 7);
    this.ui.promptHint(this.input.touchMode ? '🛡ボタン長押し：身を守る' : 'C / Space 長押し：身を守る', 8);
  }

  private updateQuake(dt: number) {
    const f = fx(this.settings);
    const p = this.player.position;
    // hazards: check proximity at the moment they fall
    for (const h of this.city.hazards) {
      const key = 'hz-' + h.id;
      if (this.quakeT >= h.time && !this.flags.has(key)) {
        this.flags.add(key);
        if (f.falling === 0) h.duration = 0.01;
        const d = Math.hypot(p.x - h.zone.x, p.z - h.zone.y);
        if (h.id !== 'pole') this.audio.thud(1);
        if (d < h.radius) {
          this.log.hazardClose.push(h.label.replace('倒れた', '').replace('落下した', ''));
          this.player.stagger = 1.2;
          this.event(`${h.label}のすぐ近くにいた（ヒヤリとした）`);
          this.ui.subtitle(`危ない！ すぐ近くで${h.label.replace('倒れた', '').replace('落下した', '')}が${h.id === 'sign' ? '落ちた' : '倒れた'}。`, 3);
        } else if (d < 14 && h.id !== 'pole') {
          this.ui.subtitle(`近くで${h.id === 'sign' ? '看板が落ちた' : '自動販売機が倒れた'}。`, 2.5);
        }
      }
    }
    // roof tiles
    if (this.quakeT > 8 && this.quakeT < 26 && f.falling > 0) {
      this.tileTimer -= dt;
      if (this.tileTimer <= 0) {
        this.tileTimer = (0.45 + this.rnd() * 0.5) / f.falling;
        this.spawnTile(p);
      }
    }
    for (const t of this.tiles) {
      if (t.checked) continue;
      const tp = t.body.translation();
      const v = t.body.linvel();
      if (tp.y < p.y + 0.4) {
        t.checked = true;
        if (Math.hypot(tp.x - p.x, tp.z - p.z) < 1.6 && v.y < -2) {
          this.log.tileNear++;
          const prot = this.player.rig.crouch > 0.6;
          if (prot) this.log.tileNearProtected++;
          else this.player.stagger = 0.8;
          this.audio.thud(0.6);
          this.event(prot ? '瓦が近くに落ちた（頭を守っていた）' : '瓦が近くに落ちた（ヒヤリとした）');
          this.ui.subtitle(prot ? '瓦が近くに落ちた。頭を守っていた。' : 'ヒヤリ！ 瓦が近くに落ちた。建物から離れよう。', 2.5);
        }
      }
    }
    if (this.quakeT >= QUAKE.end) this.endQuake();
  }

  private spawnTile(p: THREE.Vector3) {
    let best: THREE.Vector3 | null = null;
    let bd = 16;
    const cands = this.city.roofEdges.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < bd);
    if (cands.length) best = cands[Math.floor(this.rnd() * cands.length)];
    if (!best) return;
    // Occasionally drop near the player if they stand close to a building (teaches distance from buildings)
    const pos = best.clone();
    pos.x += (this.rnd() - 0.5) * 4;
    const toPlayer = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (toPlayer < 5 && this.rnd() < 0.6) { pos.x = p.x + (this.rnd() - 0.5) * 1.6; pos.z = (pos.z + p.z) / 2; }
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y + 0.2, pos.z).setLinvel((this.rnd() - 0.5) * 2, 0, (this.rnd() - 0.5) * 2).setAngvel({ x: this.rnd() * 6, y: this.rnd() * 6, z: this.rnd() * 6 }));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.17, 0.03, 0.14).setDensity(1800).setCollisionGroups(groups(G.DEBRIS, G.STATIC | G.DEBRIS)), body);
    const mesh = new THREE.Mesh(this.tileGeo, this.tileMat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.tiles.push({ body, mesh, checked: false });
    if (this.tiles.length > 50) {
      const old = this.tiles.shift()!;
      this.world.removeRigidBody(old.body);
      this.scene.remove(old.mesh);
    }
  }

  private endQuake() {
    this.city.settleHazards();
    this.city.showJam();
    this.setPhase('evacuate');
    this.evacT = 0;
    this.quakeEndPos.copy(this.player.position);
    this.event('揺れがおさまった');
    this.ui.objective('揺れがおさまった。すぐに高い場所へ避難する（緑の避難標識・M：地図）');
    this.ui.subtitle('揺れがおさまった。長く強い揺れだった……。', 4);
    for (const n of this.npcs) if (n.def.autoStart) n.start();
  }

  // ------------------------------------------------------------------ evacuation
  private updateEvac(dt: number) {
    this.evacT += dt;
    const p = this.player.position;
    const t = this.evacT;
    if (t >= EVAC.broadcast && !this.flags.has('broadcast')) {
      this.flags.add('broadcast');
      this.audio.ui(520);
      this.ui.broadcast(BROADCAST, 12);
      this.event('町内放送（架空）：大津波警報の発表と避難の呼びかけ');
    }
    if (this.log.evacStartDelay === null && p.distanceTo(this.quakeEndPos) > 12) {
      this.log.evacStartDelay = t;
      this.event('避難を始めた');
    }
    // zones
    if (this.city.inZone('seawall', p) && !this.log.seaVisit) {
      this.log.seaVisit = true;
      this.event('防潮堤に上って海の様子を見に行った');
      this.ui.subtitle('海は静かに見える。波も引いていない。……でも、それは「安全」のしるしではない。', 6);
    }
    if (this.city.inZone('alley', p) && !this.log.alley) {
      this.log.alley = true;
      this.event('近道（路地）に入ったが、倒れた電柱でふさがれていた');
      this.ui.subtitle('倒れた電柱とブロックで通れない！ 別の道を探そう。', 4);
    }
    // safety
    const onRoof = this.city.inZone('evacRoof', p);
    const onHill = this.city.inZone('hill', p);
    if (this.phase === 'evacuate' && (onRoof || onHill)) {
      this.log.destination = onRoof ? 'building' : 'hill';
      this.log.arrivalEvacT = t;
      this.log.margin = EVAC.overtop - t;
      this.event(onRoof ? '津波避難ビルの屋上に到達した' : '高台に到達した');
      this.setPhase('safe');
      this.ui.objective(onRoof ? '屋上に着いた。ここにとどまり、警報が解除されるまで降りない。' : '高台に着いた。「ここなら安心」と思わず、さらに高い場所（潮凪神社）も目指せる。');
      this.ui.subtitle('安全な高さに着いた。でも、ここで終わりではない。', 4);
      this.ui.showSkip(true);
    }
    if (this.phase === 'safe') {
      if (this.city.inZone('shrine', p) && !this.log.higher) {
        this.log.higher = true;
        this.event('さらに高い場所（潮凪神社）へ移動した');
        this.ui.subtitle('さらに高い場所へ来た。', 3);
      }
      if (!onRoof && !onHill && p.y < 12 && !this.log.leftSafe) {
        this.log.leftSafe = true;
        this.event('安全な場所から離れて低い場所へ戻った');
        this.ui.subtitle('低い場所へ戻るのは危険！ 安全な高さへ戻ろう。', 4);
      }
      if (t >= EVAC.returnPrompt && !this.flags.has('return')) {
        this.flags.add('return');
        this.timeScale = 1;
        this.ui.showSkip(false);
        this.ui.choice('水が引いてきた……', '家の様子が気になる。戻って確かめに行きますか？', [
          { label: '戻らない（警報・注意報が解除されるまで待つ）', primary: true, act: () => this.finishReturn('stay') },
          { label: '様子を見に戻る', act: () => this.finishReturn('return') },
        ]);
      }
    }
    // tsunami presentation
    if (t >= EVAC.seaRise) {
      const k = Math.min(1, (t - EVAC.seaRise) / (EVAC.overtop + 4 - EVAC.seaRise));
      this.water.seaLevel = k * k * (FLOOD_LEVEL - 0.5);
      if (!this.flags.has('surge-msg') && this.phase === 'evacuate') {
        this.flags.add('surge-msg');
      }
    }
    if (t >= EVAC.overtop) {
      if (!this.water.active) {
        this.water.active = true;
        this.event('（演出）津波が防潮堤を越えた');
      }
      this.water.frontZ = Math.max(CLIFF.zTop - 4, SEAWALL.zFront - (t - EVAC.overtop) * EVAC.frontSpeed);
      const rise = Math.min(1, (t - EVAC.overtop) / 10);
      let level = GROUND + rise * (FLOOD_LEVEL - GROUND);
      if (t > EVAC.recede) level = Math.max(4.5, FLOOD_LEVEL - (t - EVAC.recede) * 0.25);
      this.water.level = level;
      if (t > EVAC.recede) this.water.seaLevel = Math.max(0.3, this.water.seaLevel - dt * 0.25);
    }
    // failure check (non-graphic: we cut away BEFORE the water reaches the player)
    if (this.phase === 'evacuate' || this.phase === 'safe') {
      const margin = this.water.mode === 'minimal' ? 28 : 12;
      const below = p.y < FLOOD_LEVEL + 0.6;
      const reach = this.water.active && p.z > this.water.frontZ - margin && below;
      const onWallDuringSurge = t > EVAC.seaRise + 3 && p.z > SEAWALL.zBack - 8;
      if (reach || onWallDuringSurge) this.fail();
    }
  }

  private finishReturn(choice: 'stay' | 'return') {
    this.log.returnChoice = choice;
    this.event(choice === 'stay' ? '水が引いても戻らず、安全な場所にとどまった' : '水が引いたので家に戻ろうとした');
    if (choice === 'return') {
      this.ui.subtitle('津波は繰り返し襲ってくる。後の波の方が大きいこともある。', 5);
    } else {
      this.ui.subtitle('警報・注意報が解除されるまで、ここで待とう。', 4);
    }
    setTimeout(() => this.openReview(), 2200);
  }

  private fail() {
    if (this.phase === 'failed') return;
    this.log.failed = true;
    this.event('避難が間に合わなかった');
    this.setPhase('failed');
    this.ui.showSkip(false);
    this.ui.fade(true);
    this.timeScale = 1;
    setTimeout(() => this.ui.showFail(), 1100);
  }

  openReview() {
    this.setPhase('review');
    this.ui.showReview(this.log);
  }

  private foamState() {
    const t = this.evacT;
    if (t < EVAC.foamLine || t > EVAC.overtop + 2) return { visible: false, z: 0 };
    const k = (t - EVAC.foamLine) / (EVAC.overtop - EVAC.foamLine);
    return { visible: true, z: 420 + (SEAWALL.zFront + 6 - 420) * Math.min(1, k) };
  }

  // ------------------------------------------------------------------ interactions
  private updatePrompts() {
    if (!this.isPlaying()) {
      this.ui.prompt(null);
      this.ui.sign(null);
      return;
    }
    const p = this.player.position;
    let prompt: string | null = null;
    let action: (() => void) | null = null;
    // NPCs
    let best: Npc | null = null;
    let bd = 2.8;
    for (const n of this.npcs) {
      if (!n.object.visible) continue;
      const d = n.object.position.distanceTo(p);
      if (d < bd) { bd = d; best = n; }
    }
    if (best) {
      const n = best;
      prompt = `${this.input.touchMode ? '［話す］' : 'E：'}${n.def.name}に声をかける`;
      action = () => this.talk(n);
    } else if (this.phase === 'evacuate' && this.city.inZone('car', p) && !this.log.car) {
      prompt = `${this.input.touchMode ? '［話す］' : 'E：'}車に乗る`;
      action = () => this.carChoice();
    }
    this.ui.prompt(prompt);
    if (action && this.pendingInteract) action();
    this.pendingInteract = false;
    // signs
    let sign: string | null = null;
    let sd = 5;
    for (const s of this.city.signs) {
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (d < sd && Math.abs(s.pos.y - p.y) < 4) { sd = d; sign = s.text; }
    }
    this.ui.sign(sign);
  }
  pendingInteract = false;

  private talk(n: Npc) {
    this.audio.ui(700);
    if (this.phase === 'prologue' || this.phase === 'quake') {
      this.ui.subtitle(`${n.def.name}：${n.def.linesBefore}`, 3);
      return;
    }
    if (n.called || n.state !== 'idle') {
      this.ui.subtitle(`${n.def.name}：${n.def.linesCalled}`, 3);
      return;
    }
    this.ui.subtitle(`${n.def.name}：${n.def.linesIdle}`, 3.2);
    setTimeout(() => {
      this.ui.subtitle(`あなた：「大津波警報が出ています！ 海が静かでも、すぐ高台へ逃げましょう！」`, 3);
      setTimeout(() => this.ui.subtitle(`${n.def.name}：${n.def.linesCalled}`, 3), 2600);
    }, 2600);
    n.called = true;
    n.start();
    if (!this.log.called.includes(n.def.name)) this.log.called.push(n.def.name);
    this.event(`${n.def.name}に避難を呼びかけた`);
  }

  private carChoice() {
    this.paused = true;
    this.ui.choice('車で避難しますか？', '駐車場に自分の車がある。', [
      { label: '徒歩で避難する', primary: true, act: () => { this.paused = false; this.ui.subtitle('車は置いて、歩いて高台へ。', 2.5); this.event('車は使わず徒歩で避難することにした'); this.flags.add('car-declined'); } },
      { label: '車で避難する', act: () => { this.paused = false; this.useCar(); } },
    ]);
  }

  private useCar() {
    this.log.car = true;
    this.event('車で避難しようとした');
    this.ui.fade(true);
    setTimeout(() => {
      this.city.parkedCar.visible = false;
      this.evacT += 30; // stuck in the jam
      this.player.teleport(16.8, GROUND, 9, 0);
      this.cam.yaw = 0;
      this.event('渋滞に巻き込まれて動けなくなり、車を降りた（約30秒経過）');
      this.ui.fade(false);
      this.ui.subtitle('渋滞に巻き込まれて動けない……。車を降りて、歩いて高台へ向かう。', 5);
    }, 900);
  }

  // ------------------------------------------------------------------ test / capture API
  debugApi() {
    return {
      game: this,
      phase: () => this.phase,
      player: () => { const p = this.player.position; return { x: p.x, y: p.y, z: p.z, grounded: this.player.grounded, crouch: this.player.rig.crouch }; },
      teleport: (x: number, y: number, z: number) => this.player.teleport(x, y, z),
      setVirtual: (v: Record<string, unknown> | null) => (this.input.virtual = v),
      camera: () => ({ yaw: this.cam.yaw, pitch: this.cam.pitch, distance: this.cam.distance, current: this.cam.current, hit: this.cam.lastHit, pos: this.camera.position.toArray() }),
      setCamera: (yaw: number, pitch: number) => { this.cam.yaw = yaw; this.cam.pitch = pitch; },
      startQuake: () => this.startQuake(),
      skipToEvac: () => { if (this.phase === 'prologue') this.startQuake(); this.quakeT = QUAKE.end; this.updateQuake(0); },
      setEvacT: (t: number) => { this.evacT = t; },
      evacT: () => this.evacT,
      log: () => JSON.parse(JSON.stringify(this.log)),
      fps: () => this.fps,
      autopilot: (route: [number, number][] | null, run = true) => (this.bot = route ? { route, i: 0, run } : null),
      botDone: () => !this.bot || this.bot.i >= this.bot.route.length,
      routes: ROUTES,
      interact: () => (this.pendingInteract = true),
      water: () => ({ active: this.water.active, frontZ: this.water.frontZ, level: this.water.level, sea: this.water.seaLevel }),
      gltf: () => this.assets.gltfLoaded,
      insideSolid: (x: number, y: number, z: number) => {
        let inside = false;
        this.world.intersectionsWithPoint({ x, y, z }, () => { inside = true; return false; }, undefined, groups(0xffff, G.STATIC));
        return inside;
      },
    };
  }
}

/** Reference routes (for tests, autopilot and video capture). */
export const ROUTES = {
  hill: [[-7, 32.5], [-2, 32], [19.5, 31], [20, 0.5], [20, -27], [20, -62], [20, -76]] as [number, number][],
  hillWalkAroundJam: [[-2, 32], [16.6, 30], [16.6, -5], [19.6, -12], [20, -27], [20, -62], [20, -76]] as [number, number][],
  building: [[-8, 32.5], [-24.9, 30], [-25, 21], [-25, 13], [-27, 13], [-27, 21], [-25, 21], [-25, 13], [-27, 13], [-27, 21], [-25, 21], [-25, 13], [-34, 13.5]] as [number, number][],
  seawall: [[-7, 32.5], [-2, 32.5], [1, 40], [2, 48.5], [2, 57.5], [8, 59]] as [number, number][],
  shrine: [[20, -76], [PARK.x, PARK.z], [SHRINE.x, SHRINE.z + 18], [SHRINE.x, SHRINE.z + 7]] as [number, number][],
  alley: [[-8, 32.5], [-18, 31], [-18, -27], [-25, -30], [-25, -36]] as [number, number][],
  car: [[-7, 32.5], [10, 32], [PARKED_CAR.x - 1, PARKED_CAR.z - 1.8]] as [number, number][],
};
void EVAC_BUILDING_ROOF;
void RAMP_A;

function buildSky() {
  const geo = new THREE.SphereGeometry(1000, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(0x7f9db5) }, bottom: { value: new THREE.Color(0xc9d6de) } },
    vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float vY; void main(){ float k = smoothstep(-0.05, 0.5, vY); gl_FragColor = vec4(mix(bottom, top, k), 1.0); }',
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  m.onBeforeRender = (_r, _s, cam) => m.position.copy(cam.position);
  return m;
}
