// Captures REAL gameplay frames (the actual game engine, driven by scripted input) for the promo videos.
// Output: media/frames/<segment>/0001.jpg … at 1080x1920 (540x960 viewport @2x), 30 fps, deterministic.
//   npm run build && node scripts/capture-video.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const ONLY = process.argv.slice(2); // optional: capture only these segments
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const URL = 'http://localhost:4173/?capture=1';

async function reachable() {
  try { return (await fetch('http://localhost:4173/')).ok; } catch { return false; }
}

let server = null;
if (!(await reachable())) {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await reachable()); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, hasTouch: false });
await page.goto(URL);
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 });
// Video hygiene: hide transient in-game texts (fictional broadcast, prompts) so nothing in the clip
// can be mistaken for a real alert; telops are added in the edit step. The game HUD (clock/objective)
// and the "simplified tsunami" note stay visible.
await page.addStyleTag({ content: '#broadcast,#prompt,#subtitle,#sign-reader,#btn-skip,#touch{display:none!important}' });
await page.evaluate(() => {
  window.__game.setSettings({ intensity: 'standard', quality: 'high', touch: 'off', showFps: false });
  window.__game.ui.hide('title');
});

async function capture(name, seconds, perFrame) {
  const dir = resolve(root, 'media/frames', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(([fps, k]) => { window.__game.advance(1 / fps, fps); }, [FPS, i]);
    if (perFrame) await page.evaluate(perFrame, i);
    await page.screenshot({ path: `${dir}/${String(i + 1).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 30 === 0) process.stdout.write(`${name} ${i}/${n}\n`);
  }
}

// 1) Prologue: walking along the fictional shopping street
if (want('street')) {
await page.evaluate(() => {
  const g = window.__game;
  g.start();
  g.setCamera(-Math.PI / 2 + 0.35, 0.22);
  g.advance(1);
  g.setVirtual({ moveY: 0.55, moveX: 0.0 });
});
await capture('street', 4.5, (i) => window.__game.setCamera(-Math.PI / 2 + 0.35 - i * 0.004, 0.22));
}

// 2) The quake: away from the vending machine and the shop sign, protecting the head
if (want('quake')) {
await page.evaluate(() => {
  const g = window.__game;
  g.game.retry();
  g.advance(0.1);
  g.teleport(-7, 1, 31.4);
  g.game.player.yaw = 0.4;
  g.setVirtual({ moveX: 0, moveY: 0 });
  g.startQuake();
  g.setCamera(Math.PI, 0.2);
  g.advance(4);
  g.setVirtual({ moveX: 0, moveY: 0, protect: true });
  g.advance(4.5);
});
await capture('quake', 8);
}

// 3) The sea looks calm (after the shaking)
if (want('sea')) {
await page.evaluate(() => {
  const g = window.__game;
  g.game.retry();
  g.advance(0.1);
  g.setVirtual(null);
  g.skipToEvac();
  g.setEvacT(14);
  g.teleport(7, 4.2, 59.4);
  g.game.player.yaw = Math.PI;
  g.setCamera(Math.PI - 0.5, 0.12);
  g.advance(0.5);
});
await capture('sea', 5, (i) => window.__game.setCamera(Math.PI - 0.5 + i * 0.0035, 0.12));
}

// 4) Running up the slope road with neighbours
if (want('run') || want('hill')) {
await page.evaluate(() => {
  const g = window.__game;
  g.game.retry();
  g.advance(0.1);
  g.skipToEvac();
  g.advance(0.2);
  g.setVirtual(null);
  g.autopilot(g.routes.hill, true);
  g.setCamera(-Math.PI / 2, 0.3);
  g.advance(9.5);
});
if (want('run')) await capture('run', 9);
else await page.evaluate(() => window.__game.advance(9));
}

// 5) From the hill: the town below and a thin white line far out at sea (simplified effect)
if (want('hill')) {
await page.evaluate(() => {
  const g = window.__game;
  g.autopilot([[20, -70], [19, -76]], true);
  g.advance(10);
  g.autopilot(null);
  g.setEvacT(69);
  g.game.player.yaw = Math.PI;
  g.setCamera(Math.PI + 0.15, 0.32);
  g.advance(0.5);
});
await capture('hill', 6, (i) => window.__game.setCamera(Math.PI + 0.15, 0.32 - i * 0.0006));
}

await browser.close();
if (server) server.kill();
console.log('done');
