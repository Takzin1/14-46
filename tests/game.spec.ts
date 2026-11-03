import { test, expect } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { boot, startGame, toEvacuation, drive } from './helpers';

test.describe('ビルドと起動', () => {
  test('ビルド成果物があり、エラーなく起動し、glTFモデルを読み込む', async ({ page }) => {
    expect(existsSync('dist/index.html')).toBe(true);
    expect(readdirSync('dist/models')).toEqual(expect.arrayContaining(['character.glb', 'car.glb']));
    const errors = await boot(page);
    await expect(page.locator('#screen-title')).toBeVisible();
    await expect(page.locator('#screen-title h1')).toContainText('14:46');
    expect(await page.evaluate(() => window.__game.gltf())).toEqual({ character: true, car: true });
    expect(errors).toEqual([]);
  });

  test('内容注意表示を経てゲームが始まり、演出強度の選択が保存される', async ({ page }) => {
    await boot(page);
    await page.click('#btn-start');
    await expect(page.locator('#screen-notice')).toBeVisible();
    await expect(page.locator('#notice-list')).toContainText('津波');
    await expect(page.locator('#fiction-list')).toContainText('架空');
    await expect(page.locator('#disclaimer-list')).toContainText('検証を受けていません');
    await page.selectOption('#notice-intensity', 'reduced');
    await page.click('#btn-notice-ok');
    expect(await page.evaluate(() => window.__game.phase())).toBe('prologue');
    await expect(page.locator('#hud')).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('1446-settings-v1') || '{}'));
    expect(saved.intensity).toBe('reduced');
  });

  test('史実と創作・出典ページに公的資料のURLが並ぶ', async ({ page }) => {
    await boot(page);
    await page.click('[data-open="about"]');
    await expect(page.locator('#about-facts')).toContainText('14時46分');
    const links = await page.locator('#about-sources a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const l of links) expect(l).toMatch(/^https:\/\/www\.(jma\.go\.jp|data\.jma\.go\.jp|bousai\.go\.jp|city\.sendai\.jp)\//);
  });
});

test.describe('操作', () => {
  test('キーボードで移動・走る・身を守る・地図・一時停止', async ({ page }) => {
    await boot(page);
    await startGame(page);
    const p0 = await page.evaluate(() => window.__game.player());
    await page.keyboard.down('w');
    await page.evaluate(() => window.__game.advance(1.5));
    await page.keyboard.up('w');
    const p1 = await page.evaluate(() => window.__game.player());
    const walk = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    expect(walk).toBeGreaterThan(2.5);
    expect(p1.x).toBeGreaterThan(p0.x); // camera looks east at the start, W moves east

    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await page.evaluate(() => window.__game.advance(1.5));
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    const p2 = await page.evaluate(() => window.__game.player());
    expect(Math.hypot(p2.x - p1.x, p2.z - p1.z)).toBeGreaterThan(walk * 1.4);

    await page.keyboard.down('c');
    await page.keyboard.down('w');
    await page.evaluate(() => window.__game.advance(1));
    const p3 = await page.evaluate(() => window.__game.player());
    await page.keyboard.up('w');
    await page.keyboard.up('c');
    expect(p3.crouch).toBeGreaterThan(0.8);
    expect(Math.hypot(p3.x - p2.x, p3.z - p2.z)).toBeLessThan(1.2);

    await page.keyboard.press('m');
    await page.evaluate(() => window.__game.advance(0.1));
    await expect(page.locator('#map')).toBeVisible();
    await page.keyboard.press('m');
    await page.evaluate(() => window.__game.advance(0.1));
    await expect(page.locator('#map')).toBeHidden();

    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__game.advance(0.1));
    await expect(page.locator('#screen-pause')).toBeVisible();
    expect(await page.evaluate(() => window.__game.game.paused)).toBe(true);
    await page.click('#btn-resume');
    expect(await page.evaluate(() => window.__game.game.paused)).toBe(false);
  });

  test('揺れの間に身を守ると記録され、倒れやすい物の近くにいると振り返りに残る', async ({ page }) => {
    await boot(page);
    await startGame(page);
    await page.evaluate(() => { window.__game.startQuake(); window.__game.setVirtual({ protect: true }); window.__game.advance(33); });
    const log = await page.evaluate(() => window.__game.log());
    expect(await page.evaluate(() => window.__game.phase())).toBe('evacuate');
    expect(log.protectTime / log.strongTime).toBeGreaterThan(0.95);
    // start position is between the vending machine and a shop sign (intentionally risky)
    expect(log.hazardClose.length).toBeGreaterThan(0);
  });

  test('声かけ（E）でNPCが避難を始める', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    await page.evaluate(() => { window.__game.teleport(11, 1, 34.2); window.__game.advance(0.2); });
    await expect(page.locator('#prompt')).toContainText('声をかける');
    await page.keyboard.press('e');
    await page.evaluate(() => window.__game.advance(0.2));
    const log = await page.evaluate(() => window.__game.log());
    expect(log.called).toContain('青果店の店主');
    const npc = await page.evaluate(() => window.__game.game.npcs.find((n: { def: { id: string } }) => n.def.id === 'shopkeeper').state);
    expect(npc).toBe('walking');
  });
});

test.describe('カメラ衝突判定', () => {
  test('壁の向こうにカメラが入らず、手前に寄る', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    // open street: no collision
    await page.evaluate(() => { window.__game.teleport(0, 1, 32); window.__game.setCamera(-Math.PI / 2, 0.3); window.__game.advance(1); });
    let cam = await page.evaluate(() => window.__game.camera());
    expect(cam.hit).toBe(false);
    expect(cam.current).toBeGreaterThan(5);
    // back against the evacuation building (south face at z=21.5) with the camera pointing into it
    await page.evaluate(() => { window.__game.teleport(-36, 1, 23.2); window.__game.setCamera(Math.PI, 0.25); window.__game.advance(0.5); });
    cam = await page.evaluate(() => window.__game.camera());
    expect(cam.hit).toBe(true);
    expect(cam.current).toBeLessThan(2.2);
    expect(cam.pos[2]).toBeGreaterThan(21.5);
    expect(await page.evaluate(([x, y, z]) => window.__game.insideSolid(x, y, z), cam.pos)).toBe(false);
    // house row: sweep yaw around and make sure the camera is never inside solid geometry
    for (let i = 0; i < 12; i++) {
      const inside = await page.evaluate((k) => {
        const g = window.__game;
        g.setCamera((k / 12) * Math.PI * 2, 0.2);
        g.advance(0.3);
        const c = g.camera();
        return g.insideSolid(c.pos[0], c.pos[1], c.pos[2]);
      }, i);
      expect(inside).toBe(false);
    }
  });
});

test.describe('ステージ到達と避難判定', () => {
  test('坂道ルートで高台に到達 → さらに高い場所へ → 戻らない選択 → 振り返り', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    await drive(page, 'hill', 60);
    expect(await page.evaluate(() => window.__game.phase())).toBe('safe');
    let log = await page.evaluate(() => window.__game.log());
    expect(log.destination).toBe('hill');
    expect(log.margin).toBeGreaterThan(20);
    await drive(page, 'shrine', 60, []);
    log = await page.evaluate(() => window.__game.log());
    expect(log.higher).toBe(true);
    // wait through the (simplified) tsunami presentation until the "return?" prompt
    for (let i = 0; i < 40 && (await page.locator('#screen-choice').isHidden()); i++) await page.evaluate(() => window.__game.advance(4));
    await expect(page.locator('#screen-choice')).toBeVisible();
    expect(await page.evaluate(() => window.__game.water().active)).toBe(true);
    expect(await page.evaluate(() => window.__game.phase())).toBe('safe');
    await page.locator('#choice-buttons button', { hasText: '戻らない' }).click();
    await expect(page.locator('#screen-review')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#review-items')).toContainText('水が引いても戻らなかった');
    await expect(page.locator('#review-items')).toContainText('さらに高い場所');
    await expect(page.locator('#review-outcome')).toContainText('安全な高さに到達');
    // no score is shown
    await expect(page.locator('#screen-review')).not.toContainText('スコア');
    await expect(page.locator('#screen-review')).not.toContainText('点数');
  });

  test('津波避難ビルの外階段から屋上へ到達できる', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    await drive(page, 'building', 60);
    expect(await page.evaluate(() => window.__game.phase())).toBe('safe');
    const log = await page.evaluate(() => window.__game.log());
    expect(log.destination).toBe('building');
    expect((await page.evaluate(() => window.__game.player())).y).toBeGreaterThan(16);
  });

  test('海を見に行くと間に合わず、水が届く前に非グラフィックな結果画面へ切り替わる', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    await drive(page, 'seawall', 40, ['failed']);
    let log = await page.evaluate(() => window.__game.log());
    expect(log.seaVisit).toBe(true);
    // the sea looks calm while the player is there (no drawback, no wave yet)
    expect(await page.evaluate(() => window.__game.water().sea)).toBe(0);
    for (let i = 0; i < 120 && (await page.evaluate(() => window.__game.phase())) !== 'failed'; i++) await page.evaluate(() => window.__game.advance(1));
    expect(await page.evaluate(() => window.__game.phase())).toBe('failed');
    const w = await page.evaluate(() => window.__game.water());
    const p = await page.evaluate(() => window.__game.player());
    // cut away before the flood front reaches the player
    expect(w.active === false || w.frontZ > p.z).toBe(true);
    await expect(page.locator('#screen-fail')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#fade')).toHaveCSS('opacity', '1');
    await page.click('#btn-fail-review');
    await expect(page.locator('#review-items')).toContainText('海の様子を見に行った');
    log = await page.evaluate(() => window.__game.log());
    expect(log.failed).toBe(true);
  });

  test('揺れの後すぐに避難しないと失敗する（見てから走っても間に合わない）', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    // wait in town until the water is visible at the seawall, then run the correct route
    await page.evaluate(() => window.__game.advance(80));
    expect(await page.evaluate(() => window.__game.water().active)).toBe(true);
    await drive(page, 'hill', 60, ['failed', 'safe']);
    expect(await page.evaluate(() => window.__game.phase())).toBe('failed');
  });

  test('車を選ぶと渋滞で時間を失い、記録される', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    await drive(page, 'car', 30, []);
    await expect(page.locator('#prompt')).toContainText('車に乗る');
    const t0 = await page.evaluate(() => window.__game.evacT());
    await page.keyboard.press('e');
    await page.evaluate(() => window.__game.advance(0.1));
    await expect(page.locator('#screen-choice')).toBeVisible();
    await page.locator('#choice-buttons button', { hasText: '車で避難する' }).click();
    await page.waitForTimeout(1300);
    await page.evaluate(() => window.__game.advance(0.1));
    const log = await page.evaluate(() => window.__game.log());
    expect(log.car).toBe(true);
    expect(await page.evaluate(() => window.__game.evacT())).toBeGreaterThan(t0 + 29);
    const jam = await page.evaluate(() => window.__game.game.city.jamCars.every((c: { visible: boolean }) => c.visible));
    expect(jam).toBe(true);
    // walking around the jam still works
    await drive(page, 'hillWalkAroundJam', 60);
    expect(['safe', 'failed']).toContain(await page.evaluate(() => window.__game.phase()));
  });

  test('近道は倒れた電柱でふさがれている', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    await drive(page, 'alley', 30, []);
    const log = await page.evaluate(() => window.__game.log());
    expect(log.alley).toBe(true);
    expect((await page.evaluate(() => window.__game.player())).z).toBeGreaterThan(-37.5);
  });

  test('再挑戦で揺れの直前から始まり、倒れた物が元に戻る', async ({ page }) => {
    await boot(page);
    await toEvacuation(page);
    await page.evaluate(() => window.__game.game.openReview());
    await expect(page.locator('#screen-review')).toBeVisible();
    await page.click('#btn-retry');
    expect(await page.evaluate(() => window.__game.phase())).toBe('prologue');
    expect(await page.evaluate(() => window.__game.game.city.hazards.every((h: { fallen: boolean }) => !h.fallen))).toBe(true);
    await page.evaluate(() => window.__game.advance(3));
    expect(await page.evaluate(() => window.__game.phase())).toBe('quake');
  });

  test('演出強度「最小」ではカメラの揺れがなくなる', async ({ page }) => {
    await boot(page);
    await startGame(page);
    await page.evaluate(() => window.__game.setSettings({ intensity: 'minimal' }));
    await page.evaluate(() => { window.__game.startQuake(); window.__game.advance(10); });
    const s = await page.evaluate(() => window.__game.game.cam.shake.length());
    expect(s).toBe(0);
    await expect(page.locator('#shake-meter')).toBeVisible();
  });
});

test.describe('性能', () => {
  test('FPS計測：rAFのフレームレートと、描画完了まで同期した1フレームの実コスト', async ({ page }, info) => {
    // 1) real-time loop rate (requestAnimationFrame)
    await boot(page, false);
    await page.evaluate(() => { window.__game.ui.hide('title'); window.__game.start(); });
    await page.waitForTimeout(6000);
    const rafFps = await page.evaluate(() => window.__game.fps());
    // 2) synchronous per-frame cost (update + render + readPixels flush) for each quality setting
    const cost = async (quality: string) => {
      await page.evaluate((q) => window.__game.setSettings({ quality: q }), quality);
      return page.evaluate(() => {
        const g = window.__game;
        const gl = g.game.renderer.getContext();
        const px = new Uint8Array(4);
        const run = (n: number) => {
          const t0 = performance.now();
          for (let i = 0; i < n; i++) { g.game.update(1 / 30, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
          return (performance.now() - t0) / n;
        };
        run(5);
        return run(20);
      });
    };
    const high = await cost('high');
    const low = await cost('low');
    const msg = `headless Chromium + SwiftShader (CPU), 1280x720: rAF=${rafFps.toFixed(1)}fps, frame cost high=${high.toFixed(0)}ms (${(1000 / high).toFixed(1)}fps) low=${low.toFixed(0)}ms (${(1000 / low).toFixed(1)}fps)`;
    info.annotations.push({ type: 'fps', description: msg });
    console.log(msg);
    expect(rafFps).toBeGreaterThan(3);
    expect(low).toBeLessThan(high); // the low preset must actually be lighter
  });
});
