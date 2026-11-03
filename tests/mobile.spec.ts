import { test, expect } from '@playwright/test';
import { boot, startGame } from './helpers';

test('スマートフォン：タッチUIが表示され、スティックで移動・ボタンで身を守る・視点ドラッグ', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await expect(page.locator('#touch')).toBeVisible();
  await expect(page.locator('#joy')).toBeVisible();
  await expect(page.locator('#btn-protect')).toBeVisible();
  const vp = page.viewportSize()!;
  expect(vp.height).toBeGreaterThan(vp.width); // portrait
  const cdp = await page.context().newCDPSession(page);
  const joy = (await page.locator('#joy').boundingBox())!;
  const cx = joy.x + joy.width / 2, cy = joy.y + joy.height / 2;
  const p0 = await page.evaluate(() => window.__game.player());
  // push the stick fully forward
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - 60, id: 1 }] });
  await page.evaluate(() => window.__game.advance(1.5));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const p1 = await page.evaluate(() => window.__game.player());
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(3);

  // drag on the right half rotates the camera
  const yaw0 = (await page.evaluate(() => window.__game.camera())).yaw;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vp.width * 0.75, y: vp.height * 0.4, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: vp.width * 0.75 + 80, y: vp.height * 0.4, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.evaluate(() => window.__game.advance(0.1));
  const yaw1 = (await page.evaluate(() => window.__game.camera())).yaw;
  expect(Math.abs(yaw1 - yaw0)).toBeGreaterThan(0.1);

  // hold the protect button
  const pb = (await page.locator('#btn-protect').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pb.x + pb.width / 2, y: pb.y + pb.height / 2, id: 3 }] });
  await page.evaluate(() => window.__game.advance(1));
  expect((await page.evaluate(() => window.__game.player())).crouch).toBeGreaterThan(0.8);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // map button
  await page.locator('#btn-map').tap();
  await page.evaluate(() => window.__game.advance(0.1));
  await expect(page.locator('#map')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-map.png' });
  await page.locator('#map [data-close="map"]').tap();
  await page.evaluate(() => window.__game.advance(0.5));
  await page.screenshot({ path: 'test-results/mobile-play.png' });
});

test('スマートフォン：メニューとレビュー画面が縦画面に収まる', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#screen-title .panel')).toBeVisible();
  const box = (await page.locator('#screen-title .panel').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBeLessThanOrEqual(vp.width);
  await startGame(page);
  await page.evaluate(() => { window.__game.skipToEvac(); window.__game.game.openReview(); });
  await expect(page.locator('#screen-review')).toBeVisible();
  const rb = (await page.locator('#screen-review .panel').boundingBox())!;
  expect(rb.width).toBeLessThanOrEqual(vp.width);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
