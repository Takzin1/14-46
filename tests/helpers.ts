import { expect, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { __game: any }
}

export async function boot(page: Page, capture = true) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(capture ? '/?capture=1' : '/');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90_000 });
  return errors;
}

/** Start the game, skipping the content notice (it is tested separately). */
export async function startGame(page: Page) {
  await page.evaluate(() => { window.__game.ui.hide('title'); window.__game.start(); window.__game.advance(0.1); });
  expect(await page.evaluate(() => window.__game.phase())).toBe('prologue');
}

export async function toEvacuation(page: Page) {
  await startGame(page);
  await page.evaluate(() => { window.__game.skipToEvac(); window.__game.advance(0.3); });
  expect(await page.evaluate(() => window.__game.phase())).toBe('evacuate');
}

/** Run the autopilot along a named route for up to `seconds` (game time, deterministic). */
export async function drive(page: Page, route: string, seconds: number, stopWhen: string[] = ['safe', 'failed', 'review']) {
  await page.evaluate((r) => window.__game.autopilot(window.__game.routes[r]), route);
  for (let t = 0; t < seconds; t += 2) {
    await page.evaluate(() => window.__game.advance(2));
    const ph = await page.evaluate(() => window.__game.phase());
    if (stopWhen.includes(ph)) break;
    if (await page.evaluate(() => window.__game.botDone())) break;
  }
  await page.evaluate(() => window.__game.autopilot(null));
}
