import { describe, expect, it, vi } from 'vitest';
import {
  parsePlaywrightReport,
  runE2e,
  type GstackE2eResult,
} from '../src/lib/gstack/e2e.js';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../src/lib/runner.js', () => ({
  runShellCommand: vi.fn(() => ({
    ok: false,
    command: '',
    cwd: '',
    status: 127,
    stdout: '',
    stderr: 'npx: command not found',
    duration_ms: 0,
  })),
}));

const fixturePath = resolve(import.meta.dirname, 'fixtures/playwright-report.json');

describe('gstack e2e runner', () => {
  describe('parsePlaywrightReport', () => {
    it('extracts pass/fail counts from Playwright JSON report', () => {
      const content = readFileSync(fixturePath, 'utf8');
      const result = parsePlaywrightReport(content);

      expect(result).toMatchObject({
        ok: false,
        passed: 3,
        failed: 1,
        skipped: 0,
        duration_ms: 8500,
      });
    });

    it('returns ok=true when all tests pass', () => {
      const report = JSON.stringify({
        suites: [],
        stats: { expected: 5, unexpected: 0, skipped: 0, duration: 3000 },
      });
      const result = parsePlaywrightReport(report);

      expect(result.ok).toBe(true);
      expect(result.passed).toBe(5);
      expect(result.failed).toBe(0);
    });

    it('handles malformed JSON', () => {
      const result = parsePlaywrightReport('not json');

      expect(result.ok).toBe(false);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(0);
    });
  });
});

const tempDir = () => mkdtempSync(join(tmpdir(), 'forge-e2e-'));

describe('runE2e', () => {
  it('returns error result when Playwright is not available', () => {
    const dir = tempDir();
    const result = runE2e(dir);

    // Since Playwright is not installed in test environment, expect failure
    expect(result.type).toBe('e2e');
    expect(result.ok).toBe(false);
    expect(result.report_path).toBeNull();
    expect(result.error).toBeDefined();
  });
});
