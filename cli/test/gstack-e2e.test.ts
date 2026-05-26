import { describe, expect, it } from 'vitest';
import {
  parsePlaywrightReport,
  type GstackE2eResult,
} from '../src/lib/gstack/e2e.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
