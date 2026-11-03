import { initPhysics } from './physics';
import { loadAssets } from './assets';
import { loadSettings, saveSettings } from './settings';
import { UI } from './ui';
import { Game, EVAC } from './game';

async function boot() {
  const settings = loadSettings();
  const ui = new UI(settings);
  const params = new URLSearchParams(location.search);
  const capture = params.has('capture');
  ui.setLoading('物理エンジンを準備中…');
  await initPhysics();
  ui.setLoading('3Dモデル（glTF）を読み込み中…');
  const assets = await loadAssets();
  ui.setLoading('町を作っています…');
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const game = new Game(canvas, assets, settings, ui);

  const isTouch = () => settings.touch === 'on' || (settings.touch === 'auto' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window));
  const applyTouch = () => {
    const t = isTouch();
    ui.setTouch(t);
    game.input.touchMode = t;
  };
  game.input.bindTouch(document.querySelector('#touch')!);
  applyTouch();

  ui.onSettings = (s) => {
    saveSettings(s);
    game.applySettings();
    applyTouch();
  };
  ui.onStart = () => {
    game.audio.ensure();
    game.startPrologue();
  };
  ui.onRetry = () => {
    game.audio.ensure();
    game.paused = false;
    game.retry();
  };
  ui.onRestart = () => {
    game.paused = false;
    game.startPrologue();
  };
  ui.onTitle = () => {
    game.paused = false;
    game.resetWorld();
    game.setPhase('title');
  };
  ui.onPauseChange = (p) => {
    game.paused = p;
    if (p && document.pointerLockElement) document.exitPointerLock();
  };
  ui.onReviewRequest = () => game.openReview();
  ui.onSkip = () => {
    game.timeScale = game.timeScale > 1 ? 1 : 4;
    if (game.evacT < EVAC.overtop - 5) game.evacT = EVAC.overtop - 5;
  };
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game.isPlaying() && !game.paused && !capture) {
      /* leaving pointer lock does not pause automatically: Esc opens the pause menu */
    }
  });

  ui.doneLoading();
  game.setPhase('title');

  (window as unknown as { __game: unknown }).__game = {
    ...game.debugApi(),
    ui,
    /** Deterministic stepping for tests / video capture. */
    advance: (seconds: number, fps = 30) => {
      const n = Math.max(1, Math.round(seconds * fps));
      for (let i = 0; i < n; i++) {
        game.update(1 / fps, i === n - 1);
        ui.tick(1 / fps);
      }
    },
    start: () => { ui.noticeAccepted = true; ui.onStart(); },
    setSettings: (patch: Record<string, unknown>) => { Object.assign(settings, patch); ui.syncSettingsForm(); ui.onSettings(settings); },
  };

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.tickFps(dt);
    if (!capture) {
      game.update(dt);
      ui.tick(dt * game.timeScale);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.body.dataset.ready = '1';
}

boot().catch((e) => {
  console.error(e);
  const el = document.querySelector('#loading-text');
  if (el) el.textContent = '起動に失敗しました：' + (e?.message ?? e) + '（WebGL対応ブラウザでお試しください）';
});
