import { describe, expect, it } from 'vitest';
import {
  parseIstanbulSummary,
  checkCoverage,
  type CoverageCheckResult,
} from '../src/lib/scanners/coverage.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = import.meta.dirname;
const fixturePath = resolve(__dirname, 'fixtures/istanbul-summary.json');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-cov-'));
}

describe('coverage gate scanner', () => {
  describe('parseIstanbulSummary', () => {
    it('extracts line coverage percentage from Istanbul summary', () => {
      const content = readFileSync(fixturePath, 'utf8');
      const result = parseIstanbulSummary(content);

      expect(result).toEqual({
        lines: 85,
        statements: 85,
        functions: 90,
        branches: 80,
      });
    });

    it('returns null for invalid JSON', () => {
      expect(parseIstanbulSummary('not json')).toBeNull();
    });

    it('returns null for missing total field', () => {
      expect(parseIstanbulSummary(JSON.stringify({ something: {} }))).toBeNull();
    });
  });

  describe('checkCoverage', () => {
    it('passes when coverage meets targets', () => {
      const dir = tempDir();
      mkdirSync(join(dir, 'coverage'), { recursive: true });
      copyFileSync(fixturePath, join(dir, 'coverage', 'coverage-summary.json'));

      const result = checkCoverage(dir, { unit: 80, integration: 60 });

      expect(result.ok).toBe(true);
      expect(result.coverage.unit).toMatchObject({
        value: 85,
        target: 80,
        ok: true,
      });
    });

    it('fails when coverage is below target', () => {
      const dir = tempDir();
      mkdirSync(join(dir, 'coverage'), { recursive: true });
      writeFileSync(
        join(dir, 'coverage', 'coverage-summary.json'),
        JSON.stringify({
          total: {
            lines: { total: 100, covered: 70, skipped: 0, pct: 70 },
            statements: { total: 100, covered: 70, skipped: 0, pct: 70 },
            functions: { total: 50, covered: 40, skipped: 0, pct: 80 },
            branches: { total: 50, covered: 30, skipped: 0, pct: 60 },
          },
        }),
      );

      const result = checkCoverage(dir, { unit: 80 });

      expect(result.ok).toBe(false);
      expect(result.coverage.unit).toMatchObject({
        value: 70,
        target: 80,
        ok: false,
        gap: 10,
      });
    });

    it('handles missing coverage report', () => {
      const dir = tempDir();
      const result = checkCoverage(dir, { unit: 80 });

      expect(result.ok).toBe(false);
      expect(result.report_path).toBeNull();
      expect(result.format).toBe('unknown');
    });

    it('accepts custom report path', () => {
      const dir = tempDir();
      mkdirSync(join(dir, 'custom'), { recursive: true });
      copyFileSync(fixturePath, join(dir, 'custom', 'report.json'));

      const result = checkCoverage(dir, { unit: 80 }, join(dir, 'custom', 'report.json'));

      expect(result.ok).toBe(true);
      expect(result.report_path).toContain('custom');
    });
  });
});
