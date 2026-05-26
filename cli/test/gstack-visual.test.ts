import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
  compareScreenshots,
  type GstackVisualResult,
} from '../src/lib/gstack/visual.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-visual-'));
}

function createPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe('gstack visual regression', () => {
  it('reports ok=true when screenshots match baseline', () => {
    const cwd = tempDir();
    const baselinesDir = join(cwd, '.forge', 'gstack', 'baselines');
    const screenshotsDir = join(cwd, '.forge', 'gstack', 'screenshots');
    mkdirSync(baselinesDir, { recursive: true });
    mkdirSync(screenshotsDir, { recursive: true });

    const redPng = createPng(10, 10, 255, 0, 0);
    writeFileSync(join(baselinesDir, 'login.png'), redPng);
    writeFileSync(join(screenshotsDir, 'login.png'), redPng);

    const result = compareScreenshots(cwd, { threshold: 1.0 });

    expect(result.ok).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });

  it('reports regression when screenshots differ', () => {
    const cwd = tempDir();
    const baselinesDir = join(cwd, '.forge', 'gstack', 'baselines');
    const screenshotsDir = join(cwd, '.forge', 'gstack', 'screenshots');
    const diffsDir = join(cwd, '.forge', 'gstack', 'diffs');
    mkdirSync(baselinesDir, { recursive: true });
    mkdirSync(screenshotsDir, { recursive: true });
    mkdirSync(diffsDir, { recursive: true });

    const redPng = createPng(10, 10, 255, 0, 0);
    const bluePng = createPng(10, 10, 0, 0, 255);
    writeFileSync(join(baselinesDir, 'page.png'), redPng);
    writeFileSync(join(screenshotsDir, 'page.png'), bluePng);

    const result = compareScreenshots(cwd, { threshold: 1.0 });

    expect(result.ok).toBe(false);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]).toMatchObject({
      component: 'page',
      baseline: join(baselinesDir, 'page.png'),
      current: join(screenshotsDir, 'page.png'),
    });
    expect(result.regressions[0].diff_percent).toBeGreaterThan(1.0);
  });

  it('skips comparison when no baselines exist', () => {
    const cwd = tempDir();
    const result = compareScreenshots(cwd, { threshold: 1.0 });

    expect(result.ok).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });

  it('respects custom threshold', () => {
    const cwd = tempDir();
    const baselinesDir = join(cwd, '.forge', 'gstack', 'baselines');
    const screenshotsDir = join(cwd, '.forge', 'gstack', 'screenshots');
    mkdirSync(baselinesDir, { recursive: true });
    mkdirSync(screenshotsDir, { recursive: true });

    // Create almost identical PNGs (1 pixel different out of 100)
    const base = new PNG({ width: 10, height: 10 });
    const current = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 400; i += 4) {
      base.data[i] = 255; base.data[i+1] = 0; base.data[i+2] = 0; base.data[i+3] = 255;
      current.data[i] = 255; current.data[i+1] = 0; current.data[i+2] = 0; current.data[i+3] = 255;
    }
    // Change one pixel
    current.data[0] = 0; current.data[2] = 255;

    writeFileSync(join(baselinesDir, 'small.png'), PNG.sync.write(base));
    writeFileSync(join(screenshotsDir, 'small.png'), PNG.sync.write(current));

    // With high threshold, should pass
    const passResult = compareScreenshots(cwd, { threshold: 5.0 });
    expect(passResult.ok).toBe(true);

    // With zero threshold, should fail
    const failResult = compareScreenshots(cwd, { threshold: 0.0 });
    expect(failResult.ok).toBe(false);
  });
});
