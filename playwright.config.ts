import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression against the playground.
 *
 * Everything else in this repo is verified numerically, which cannot catch a
 * shader that renders black, a sprite that vanishes at a certain DPR, or a
 * transition that looks wrong while measuring correctly. These tests look.
 *
 * Locally this drives the Chrome already on the machine, so there is no browser
 * download. CI installs Playwright's own Chromium instead, because the version
 * has to be pinned for pixel comparisons to mean anything.
 */
const useSystemChrome = !process.env.CI;

export default defineConfig({
  testDir: './visual',
  outputDir: './visual/.results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  expect: {
    toHaveScreenshot: {
      // GPU rasterisation differs slightly between machines and driver versions.
      // This is loose enough to survive that and tight enough to catch a field
      // that renders in the wrong place, the wrong colour, or not at all.
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },

  use: {
    baseURL: 'http://localhost:5180',
    ...devices['Desktop Chrome'],
    viewport: { width: 1000, height: 640 },
    // Pin the pixel ratio: the canvas is sized from devicePixelRatio, and a
    // retina runner would otherwise produce a different image entirely.
    deviceScaleFactor: 1,
    ...(useSystemChrome ? { channel: 'chrome' } : {}),
  },

  webServer: {
    command: 'pnpm playground -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
