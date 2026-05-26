import { describe, expect, it } from 'vitest';
import { extractNewPackagesFromDiff, checkLicenses, parseNpmAuditJson } from '../src/lib/scanners/dependency.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tempDir() { return mkdtempSync(join(tmpdir(), 'forge-dep-')); }

describe('dependency audit scanner', () => {
  describe('extractNewPackagesFromDiff', () => {
    it('extracts added dependencies from unified diff', () => {
      const diff = '--- a/package.json\n+++ b/package.json\n@@ -5,6 +5,8 @@\n   "dependencies": {\n     "commander": "^12.0.0",\n+    "lodash": "^4.17.21",\n+    "zod": "^3.22.0",\n     "ajv": "^8.17.1"\n   }';
      expect(extractNewPackagesFromDiff(diff)).toEqual(['lodash', 'zod']);
    });
    it('returns empty for version-only changes', () => {
      const diff = '--- a/package.json\n+++ b/package.json\n@@ -5,6 +5,6 @@\n-    "old-pkg": "^1.0.0",\n+    "old-pkg": "^2.0.0",';
      expect(extractNewPackagesFromDiff(diff)).toEqual([]);
    });
  });

  describe('checkLicenses', () => {
    it('passes packages with allowed licenses', () => {
      const dir = tempDir();
      mkdirSync(join(dir, 'node_modules', 'lodash'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'lodash', 'package.json'), JSON.stringify({ name: 'lodash', version: '4.17.21', license: 'MIT' }));
      const result = checkLicenses(dir, ['lodash'], ['MIT', 'Apache-2.0']);
      expect(result).toEqual([{ name: 'lodash', version: '4.17.21', license: 'MIT', license_ok: true }]);
    });
    it('flags disallowed licenses', () => {
      const dir = tempDir();
      mkdirSync(join(dir, 'node_modules', 'gpl-pkg'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'gpl-pkg', 'package.json'), JSON.stringify({ name: 'gpl-pkg', version: '1.0.0', license: 'GPL-3.0' }));
      expect(checkLicenses(dir, ['gpl-pkg'], ['MIT'])[0].license_ok).toBe(false);
    });
    it('handles missing package', () => {
      const dir = tempDir();
      expect(checkLicenses(dir, ['nonexistent'], ['MIT'])[0]).toMatchObject({ name: 'nonexistent', license: null, license_ok: false });
    });
  });

  describe('parseNpmAuditJson', () => {
    it('extracts vulnerabilities', () => {
      const out = JSON.stringify({ vulnerabilities: { lodash: { name: 'lodash', severity: 'high' } } });
      expect(parseNpmAuditJson(out)).toEqual([{ name: 'lodash', vulnerabilities: 1, highest_severity: 'high' }]);
    });
    it('returns empty for clean audit', () => {
      expect(parseNpmAuditJson(JSON.stringify({ vulnerabilities: {} }))).toEqual([]);
    });
    it('handles malformed JSON', () => {
      expect(parseNpmAuditJson('not json')).toEqual([]);
    });
  });
});
