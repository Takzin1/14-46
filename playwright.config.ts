import { defineConfig, devices } from '@playwright/test';

// WebGL in headless Chromium uses SwiftShader (software rendering). FPS numbers measured
// here are therefore far below what a real GPU achieves; see README for details.
const launchOptions = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] };

export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', testMatch: /(game|video)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, launchOptions } },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'], launchOptions } },
  ],
});
