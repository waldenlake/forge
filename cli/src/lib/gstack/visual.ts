import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export type VisualRegression = {
  component: string;
  diff_percent: number;
  baseline: string;
  current: string;
  diff: string;
};

export type GstackVisualResult = {
  ok: boolean;
  type: 'visual';
  regressions: VisualRegression[];
  threshold: number;
  screenshots_dir: string;
};

export type VisualOptions = {
  updateBaseline?: boolean;
  compare?: boolean;
  threshold: number;
};

function baselinesDir(cwd: string): string {
  return join(cwd, '.forge', 'gstack', 'baselines');
}

function screenshotsDir(cwd: string): string {
  return join(cwd, '.forge', 'gstack', 'screenshots');
}

function diffsDir(cwd: string): string {
  return join(cwd, '.forge', 'gstack', 'diffs');
}

export function compareScreenshots(
  cwd: string,
  options: { threshold: number },
): GstackVisualResult {
  const baselines = baselinesDir(cwd);
  const screenshots = screenshotsDir(cwd);
  const diffs = diffsDir(cwd);

  if (!existsSync(baselines) || !existsSync(screenshots)) {
    return {
      ok: true,
      type: 'visual',
      regressions: [],
      threshold: options.threshold,
      screenshots_dir: screenshots,
    };
  }

  const baselineFiles = readdirSync(baselines).filter((f) => f.endsWith('.png'));
  const regressions: VisualRegression[] = [];

  for (const file of baselineFiles) {
    const baselinePath = join(baselines, file);
    const currentPath = join(screenshots, file);

    if (!existsSync(currentPath)) continue;

    const baselineImg = PNG.sync.read(readFileSync(baselinePath));
    const currentImg = PNG.sync.read(readFileSync(currentPath));

    const { width, height } = baselineImg;
    if (currentImg.width !== width || currentImg.height !== height) {
      regressions.push({
        component: basename(file, '.png'),
        diff_percent: 100,
        baseline: baselinePath,
        current: currentPath,
        diff: '',
      });
      continue;
    }

    const diffImg = new PNG({ width, height });
    const numDiffPixels = pixelmatch(
      baselineImg.data,
      currentImg.data,
      diffImg.data,
      width,
      height,
      { threshold: 0.1 },
    );

    const totalPixels = width * height;
    const diffPercent = (numDiffPixels / totalPixels) * 100;

    if (diffPercent > options.threshold) {
      mkdirSync(diffs, { recursive: true });
      const diffPath = join(diffs, `${basename(file, '.png')}-diff.png`);
      writeFileSync(diffPath, PNG.sync.write(diffImg));

      regressions.push({
        component: basename(file, '.png'),
        diff_percent: Math.round(diffPercent * 100) / 100,
        baseline: baselinePath,
        current: currentPath,
        diff: diffPath,
      });
    }
  }

  return {
    ok: regressions.length === 0,
    type: 'visual',
    regressions,
    threshold: options.threshold,
    screenshots_dir: screenshots,
  };
}

export function updateBaselines(cwd: string): { ok: boolean; updated: number } {
  const screenshots = screenshotsDir(cwd);
  const baselines = baselinesDir(cwd);

  if (!existsSync(screenshots)) {
    return { ok: false, updated: 0 };
  }

  try {
    mkdirSync(baselines, { recursive: true });
    const files = readdirSync(screenshots).filter((f) => f.endsWith('.png'));

    for (const file of files) {
      const src = readFileSync(join(screenshots, file));
      writeFileSync(join(baselines, file), src);
    }

    return { ok: true, updated: files.length };
  } catch {
    return { ok: false, updated: 0 };
  }
}

export function runVisual(
  cwd: string,
  options: VisualOptions,
): GstackVisualResult {
  if (options.updateBaseline) {
    updateBaselines(cwd);
    return {
      ok: true,
      type: 'visual',
      regressions: [],
      threshold: options.threshold,
      screenshots_dir: screenshotsDir(cwd),
    };
  }

  return compareScreenshots(cwd, { threshold: options.threshold });
}
