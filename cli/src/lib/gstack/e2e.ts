import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runShellCommand } from '../runner.js';

export type GstackE2eResult = {
  ok: boolean;
  type: 'e2e';
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  report_path: string | null;
  error?: string;
};

type PlaywrightStats = {
  expected?: number;
  unexpected?: number;
  skipped?: number;
  duration?: number;
};

type PlaywrightReport = {
  suites?: unknown[];
  stats?: PlaywrightStats;
};

export function parsePlaywrightReport(content: string): GstackE2eResult {
  try {
    const report = JSON.parse(content) as PlaywrightReport;
    const stats = report.stats ?? {};
    const passed = stats.expected ?? 0;
    const failed = stats.unexpected ?? 0;
    const skipped = stats.skipped ?? 0;
    const duration = stats.duration ?? 0;

    return {
      ok: failed === 0,
      type: 'e2e',
      passed,
      failed,
      skipped,
      duration_ms: duration,
      report_path: null,
    };
  } catch {
    return {
      ok: false,
      type: 'e2e',
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_ms: 0,
      report_path: null,
      error: 'Failed to parse Playwright report',
    };
  }
}

export function runE2e(cwd: string, configPath?: string): GstackE2eResult {
  const reportDir = join(cwd, '.forge', 'gstack', 'reports');
  const reportFile = join(reportDir, 'e2e-report.json');

  const args = ['npx', 'playwright', 'test', '--reporter=json'];
  if (configPath) args.push(`--config=${configPath}`);

  const command = args.join(' ');
  const result = runShellCommand(cwd, '.', command);

  // Playwright JSON reporter writes to stdout
  if (result.stdout) {
    const parsed = parsePlaywrightReport(result.stdout);
    parsed.report_path = reportFile;
    return parsed;
  }

  // Fallback: check for report file on disk
  if (existsSync(reportFile)) {
    const content = readFileSync(reportFile, 'utf8');
    const parsed = parsePlaywrightReport(content);
    parsed.report_path = reportFile;
    return parsed;
  }

  return {
    ok: false,
    type: 'e2e',
    passed: 0,
    failed: 0,
    skipped: 0,
    duration_ms: result.duration_ms,
    report_path: null,
    error: result.stderr || 'Playwright execution failed',
  };
}
