# Forge v2 Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all Phase 2 stub interfaces as working functionality: Guard scanners (security-scan, dependency-audit, coverage-gate), gstack (Playwright e2e + visual regression + performance), monorepo detection, scenarios template system, and structured logging with status enhancement.

**Architecture:** Each scanner/tool is a focused module in `cli/src/lib/scanners/` or `cli/src/lib/gstack/`. Commands in `cli/src/commands/` route to these modules. All modules output typed results consumed by the command layer. Tests use temp directories and fixture files, mocking external tools where needed.

**Tech Stack:** Node.js 20+, TypeScript, commander, ajv, Vitest, pixelmatch, pngjs, yaml, Playwright (runtime-detected).

---

## File Structure

Create:
- `cli/src/lib/scanners/security.ts`: regex-based security pattern scanner + optional semgrep fallback.
- `cli/src/lib/scanners/dependency.ts`: npm audit wrapper + license checker.
- `cli/src/lib/scanners/coverage.ts`: Istanbul JSON coverage report parser.
- `cli/src/lib/gstack/runner.ts`: gstack unified entry point, type routing.
- `cli/src/lib/gstack/e2e.ts`: Playwright test execution and JSON report parsing.
- `cli/src/lib/gstack/visual.ts`: pixelmatch-based screenshot comparison.
- `cli/src/lib/gstack/performance.ts`: Core Web Vitals collection via Playwright.
- `cli/src/lib/logger.ts`: JSONL structured logger.
- `cli/test/security-scan.test.ts`: security scanner unit tests.
- `cli/test/dependency-audit.test.ts`: dependency audit unit tests.
- `cli/test/coverage-gate.test.ts`: coverage parser unit tests.
- `cli/test/gstack-e2e.test.ts`: gstack e2e execution tests.
- `cli/test/gstack-visual.test.ts`: visual regression tests with fixture PNGs.
- `cli/test/gstack-performance.test.ts`: performance metrics parsing tests.
- `cli/test/monorepo-detect.test.ts`: monorepo workspace detection tests.
- `cli/test/scenarios-template.test.ts`: export/import template tests.
- `cli/test/logger.test.ts`: structured logging tests.
- `cli/test/status-enhanced.test.ts`: guard preview in status output tests.
- `cli/test/fixtures/istanbul-summary.json`: fixture for coverage parsing.
- `cli/test/fixtures/playwright-report.json`: fixture for e2e report parsing.
- `cli/test/fixtures/baseline.png`: small fixture PNG for visual tests.
- `cli/test/fixtures/current-match.png`: identical PNG for passing visual test.
- `cli/test/fixtures/current-diff.png`: different PNG for failing visual test.

Modify:
- `cli/package.json`: add pixelmatch, pngjs, yaml dependencies.
- `cli/src/commands/guard.ts`: replace `guard:run` stub with real dispatcher, replace `guard:coverage-check` stub.
- `cli/src/commands/gstack.ts`: replace stub with real execution logic.
- `cli/src/commands/scenarios.ts`: replace export/import stubs with real implementation.
- `cli/src/commands/status.ts`: add guard preview field when executing.
- `cli/src/lib/detect.ts`: add `detectMonorepoProfiles()` function.
- `cli/src/commands/init.ts`: wire `--monorepo` flag to new detection.
- `cli/src/index.ts`: add global `--log-file` option and logger hook.

Do not modify:
- `docs/Forge-core-philosophy.md`
- `docs/forge-design-spec-phase-2.md`
- Skills files (no changes needed — they already call the CLI commands)
- `cli/src/lib/guard.ts` (trigger calculation unchanged)
- `cli/src/state/` (state modules unchanged)

---

### Task 1: Add New Dependencies And Security Scanner Module

**Files:**
- Modify: `cli/package.json`
- Create: `cli/src/lib/scanners/security.ts`
- Create: `cli/test/security-scan.test.ts`

- [ ] **Step 1: Write the failing security scanner test**

Create `cli/test/security-scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scanFiles, type SecurityScanResult } from '../src/lib/scanners/security.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-sec-'));
}

function writeFile(dir: string, name: string, content: string): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

describe('security scanner', () => {
  it('detects hardcoded password', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'config.ts', `const password = "hunter2";\n`);
    const result = scanFiles([file]);

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: 'HIGH',
      type: 'hardcoded-secret',
      file,
      line: 1,
    });
  });

  it('detects AWS access key pattern', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'aws.ts', `const key = "AKIAIOSFODNN7EXAMPLE";\n`);
    const result = scanFiles([file]);

    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({
      severity: 'CRITICAL',
      type: 'hardcoded-secret',
    });
  });

  it('detects private key header', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'key.pem', `-----BEGIN RSA PRIVATE KEY-----\nstuff\n`);
    const result = scanFiles([file]);

    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({
      severity: 'CRITICAL',
      type: 'hardcoded-secret',
    });
  });

  it('detects eval usage as WARNING', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'exec.js', `const x = eval(userInput);\n`);
    const result = scanFiles([file]);

    expect(result.ok).toBe(true); // WARNING does not make ok=false by default
    expect(result.findings[0]).toMatchObject({
      severity: 'WARNING',
      type: 'code-injection',
    });
  });

  it('returns ok=true for clean files', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'clean.ts', `export function add(a: number, b: number) { return a + b; }\n`);
    const result = scanFiles([file]);

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('respects severity threshold filter', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'mixed.ts', `const password = "secret";\neval(x);\n`);
    const result = scanFiles([file], { severityThreshold: 'HIGH' });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(2); // both reported
    // but only HIGH+ are blocking
  });

  it('skips binary files gracefully', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString());
    const result = scanFiles([file]);

    expect(result.ok).toBe(true);
    expect(result.scanned_files).toBe(0);
  });

  it('reports scanner type as pattern', () => {
    const dir = tempDir();
    const file = writeFile(dir, 'a.ts', `const x = 1;\n`);
    const result = scanFiles([file]);

    expect(result.scanner).toBe('pattern');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- security-scan.test.ts
```

Expected: FAIL because `cli/src/lib/scanners/security.ts` does not exist.

- [ ] **Step 3: Add dependencies to package.json**

Add to `cli/package.json` dependencies:

```json
"pixelmatch": "^6.0.0",
"pngjs": "^7.0.0",
"yaml": "^2.4.0"
```

Add to devDependencies:

```json
"@types/pngjs": "^7.0.0"
```

Run:

```powershell
cd cli
npm install
```

- [ ] **Step 4: Implement security scanner**

Create `cli/src/lib/scanners/security.ts`:

```ts
import { readFileSync } from 'node:fs';

export type Severity = 'CRITICAL' | 'HIGH' | 'WARNING';

export type SecurityFinding = {
  severity: Severity;
  type: string;
  file: string;
  line: number;
  message: string;
  match: string;
};

export type SecurityScanOptions = {
  severityThreshold?: Severity;
};

export type SecurityScanResult = {
  ok: boolean;
  findings: SecurityFinding[];
  scanned_files: number;
  scanner: 'pattern' | 'semgrep';
};

type Rule = {
  id: string;
  type: string;
  severity: Severity;
  pattern: RegExp;
  message: string;
};

const RULES: Rule[] = [
  {
    id: 'aws-key',
    type: 'hardcoded-secret',
    severity: 'CRITICAL',
    pattern: /AKIA[0-9A-Z]{16}/,
    message: 'Potential AWS access key',
  },
  {
    id: 'private-key',
    type: 'hardcoded-secret',
    severity: 'CRITICAL',
    pattern: /-----BEGIN\s+(RSA|EC|DSA)\s+PRIVATE\s+KEY-----/,
    message: 'Private key detected',
  },
  {
    id: 'jwt-secret',
    type: 'hardcoded-secret',
    severity: 'HIGH',
    pattern: /(jwt|JWT)[\w]*[._-]?secret\s*[:=]\s*['"][^'"]{4,}['"]/,
    message: 'Potential hardcoded JWT secret',
  },
  {
    id: 'hardcoded-password',
    type: 'hardcoded-secret',
    severity: 'HIGH',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i,
    message: 'Potential hardcoded password',
  },
  {
    id: 'generic-api-key',
    type: 'hardcoded-secret',
    severity: 'HIGH',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    message: 'Potential hardcoded API key',
  },
  {
    id: 'sql-concat',
    type: 'sql-injection',
    severity: 'WARNING',
    pattern: /["'`](?:SELECT|INSERT|UPDATE|DELETE)\b[^"'`]*["'`]\s*\+/i,
    message: 'Potential SQL injection via string concatenation',
  },
  {
    id: 'eval-usage',
    type: 'code-injection',
    severity: 'WARNING',
    pattern: /\beval\s*\(/,
    message: 'Use of eval() detected',
  },
  {
    id: 'new-function',
    type: 'code-injection',
    severity: 'WARNING',
    pattern: /new\s+Function\s*\(/,
    message: 'Use of new Function() detected',
  },
];

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  WARNING: 1,
};

function isBinaryContent(content: string): boolean {
  return content.slice(0, 512).includes('\0');
}

function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}

function redact(match: string): string {
  if (match.length <= 8) return match;
  return `${match.slice(0, 4)}...${match.slice(-4)}`;
}

export function scanFiles(
  files: string[],
  options: SecurityScanOptions = {},
): SecurityScanResult {
  const threshold = options.severityThreshold ?? 'HIGH';
  const findings: SecurityFinding[] = [];
  let scannedFiles = 0;

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    if (isBinaryContent(content)) continue;
    scannedFiles++;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of RULES) {
        const match = rule.pattern.exec(line);
        if (match) {
          findings.push({
            severity: rule.severity,
            type: rule.type,
            file,
            line: i + 1,
            message: rule.message,
            match: redact(match[0]),
          });
        }
      }
    }
  }

  const blocking = findings.some((f) => meetsThreshold(f.severity, threshold));

  return {
    ok: !blocking,
    findings,
    scanned_files: scannedFiles,
    scanner: 'pattern',
  };
}
```

- [ ] **Step 5: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- security-scan.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/package.json cli/package-lock.json cli/src/lib/scanners/security.ts cli/test/security-scan.test.ts
git commit -m "feat(cli): implement security pattern scanner"
```

---

### Task 2: Implement Dependency Audit Scanner

**Files:**
- Create: `cli/src/lib/scanners/dependency.ts`
- Create: `cli/test/dependency-audit.test.ts`

- [ ] **Step 1: Write the failing dependency audit test**

Create `cli/test/dependency-audit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  checkLicenses,
  parseNpmAuditJson,
  extractNewPackagesFromDiff,
  type PackageAuditResult,
} from '../src/lib/scanners/dependency.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-dep-'));
}

describe('dependency audit scanner', () => {
  describe('extractNewPackagesFromDiff', () => {
    it('extracts added dependencies from unified diff', () => {
      const diff = [
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -5,6 +5,8 @@',
        '   "dependencies": {',
        '     "commander": "^12.0.0",',
        '+    "lodash": "^4.17.21",',
        '+    "zod": "^3.22.0",',
        '     "ajv": "^8.17.1"',
        '   }',
      ].join('\n');

      expect(extractNewPackagesFromDiff(diff)).toEqual(['lodash', 'zod']);
    });

    it('returns empty array for no additions', () => {
      const diff = [
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -5,6 +5,6 @@',
        '   "dependencies": {',
        '-    "old-pkg": "^1.0.0",',
        '+    "old-pkg": "^2.0.0",',
        '   }',
      ].join('\n');

      expect(extractNewPackagesFromDiff(diff)).toEqual([]);
    });
  });

  describe('checkLicenses', () => {
    it('passes packages with allowed licenses', () => {
      const dir = tempDir();
      mkdirSync(join(dir, 'node_modules', 'lodash'), { recursive: true });
      writeFileSync(
        join(dir, 'node_modules', 'lodash', 'package.json'),
        JSON.stringify({ name: 'lodash', version: '4.17.21', license: 'MIT' }),
      );

      const result = checkLicenses(dir, ['lodash'], ['MIT', 'Apache-2.0', 'ISC']);
      expect(result).toEqual([
        { name: 'lodash', version: '4.17.21', license: 'MIT', license_ok: true },
      ]);
    });

    it('flags packages with disallowed licenses', () => {
      const dir = tempDir();
      mkdirSync(join(dir, 'node_modules', 'gpl-pkg'), { recursive: true });
      writeFileSync(
        join(dir, 'node_modules', 'gpl-pkg', 'package.json'),
        JSON.stringify({ name: 'gpl-pkg', version: '1.0.0', license: 'GPL-3.0' }),
      );

      const result = checkLicenses(dir, ['gpl-pkg'], ['MIT', 'Apache-2.0']);
      expect(result[0].license_ok).toBe(false);
    });

    it('handles missing package gracefully', () => {
      const dir = tempDir();
      const result = checkLicenses(dir, ['nonexistent'], ['MIT']);
      expect(result[0]).toMatchObject({
        name: 'nonexistent',
        license: null,
        license_ok: false,
      });
    });
  });

  describe('parseNpmAuditJson', () => {
    it('extracts vulnerability counts from npm audit JSON', () => {
      const auditOutput = JSON.stringify({
        vulnerabilities: {
          lodash: {
            name: 'lodash',
            severity: 'high',
            range: '<4.17.21',
            via: [{ title: 'Prototype Pollution', severity: 'high' }],
          },
        },
      });

      const result = parseNpmAuditJson(auditOutput);
      expect(result).toEqual([
        { name: 'lodash', vulnerabilities: 1, highest_severity: 'high' },
      ]);
    });

    it('returns empty for clean audit', () => {
      const auditOutput = JSON.stringify({ vulnerabilities: {} });
      expect(parseNpmAuditJson(auditOutput)).toEqual([]);
    });

    it('handles malformed JSON gracefully', () => {
      expect(parseNpmAuditJson('not json')).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- dependency-audit.test.ts
```

Expected: FAIL because `cli/src/lib/scanners/dependency.ts` does not exist.

- [ ] **Step 3: Implement dependency scanner**

Create `cli/src/lib/scanners/dependency.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runShellCommand } from '../runner.js';

export type PackageLicenseInfo = {
  name: string;
  version?: string;
  license: string | null;
  license_ok: boolean;
};

export type VulnerabilityInfo = {
  name: string;
  vulnerabilities: number;
  highest_severity?: string;
};

export type PackageAuditResult = PackageLicenseInfo & {
  vulnerabilities: number;
  highest_severity?: string;
};

export type DependencyAuditResult = {
  ok: boolean;
  packages: PackageAuditResult[];
  new_packages_detected: string[];
  scanner: 'npm-audit' | 'cargo-audit' | 'pip-audit' | 'manual';
};

export function extractNewPackagesFromDiff(diff: string): string[] {
  const packages: string[] = [];
  const addedLinePattern = /^\+\s*"([^"@][^"]*)":\s*"[^"]+"/;

  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const match = addedLinePattern.exec(line);
    if (match && match[1]) {
      packages.push(match[1]);
    }
  }

  return packages;
}

export function checkLicenses(
  cwd: string,
  packageNames: string[],
  allowlist: string[],
): PackageLicenseInfo[] {
  const normalizedAllowlist = allowlist.map((l) => l.toLowerCase());

  return packageNames.map((name) => {
    const pkgJsonPath = join(cwd, 'node_modules', name, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      return { name, license: null, license_ok: false };
    }

    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
        version?: string;
        license?: string;
      };
      const license = pkg.license ?? null;
      const licenseOk = license !== null && normalizedAllowlist.includes(license.toLowerCase());

      return { name, version: pkg.version, license, license_ok: licenseOk };
    } catch {
      return { name, license: null, license_ok: false };
    }
  });
}

export function parseNpmAuditJson(
  output: string,
): VulnerabilityInfo[] {
  try {
    const parsed = JSON.parse(output) as {
      vulnerabilities?: Record<string, { name: string; severity?: string; via?: unknown[] }>;
    };
    const vulns = parsed.vulnerabilities ?? {};

    return Object.values(vulns).map((v) => ({
      name: v.name,
      vulnerabilities: 1,
      highest_severity: v.severity,
    }));
  } catch {
    return [];
  }
}

export function runDependencyAudit(
  cwd: string,
  newPackages: string[],
  allowlist: string[],
): DependencyAuditResult {
  const licenseResults = checkLicenses(cwd, newPackages, allowlist);

  // Try npm audit
  let vulnResults: VulnerabilityInfo[] = [];
  let scanner: DependencyAuditResult['scanner'] = 'manual';

  if (existsSync(join(cwd, 'package.json'))) {
    const auditResult = runShellCommand(cwd, '.', 'npm audit --json');
    if (auditResult.stdout) {
      vulnResults = parseNpmAuditJson(auditResult.stdout);
      scanner = 'npm-audit';
    }
  }

  const packages: PackageAuditResult[] = newPackages.map((name) => {
    const licenseInfo = licenseResults.find((l) => l.name === name) ?? {
      name,
      license: null,
      license_ok: false,
    };
    const vulnInfo = vulnResults.find((v) => v.name === name);

    return {
      ...licenseInfo,
      vulnerabilities: vulnInfo?.vulnerabilities ?? 0,
      highest_severity: vulnInfo?.highest_severity,
    };
  });

  const hasIssue = packages.some(
    (p) => !p.license_ok || p.vulnerabilities > 0,
  );

  return {
    ok: !hasIssue,
    packages,
    new_packages_detected: newPackages,
    scanner,
  };
}
```

- [ ] **Step 4: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- dependency-audit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add cli/src/lib/scanners/dependency.ts cli/test/dependency-audit.test.ts
git commit -m "feat(cli): implement dependency audit scanner"
```

---

### Task 3: Implement Coverage Gate Scanner

**Files:**
- Create: `cli/src/lib/scanners/coverage.ts`
- Create: `cli/test/coverage-gate.test.ts`
- Create: `cli/test/fixtures/istanbul-summary.json`

- [ ] **Step 1: Write test fixtures and failing test**

Create `cli/test/fixtures/istanbul-summary.json`:

```json
{
  "total": {
    "lines": { "total": 1000, "covered": 850, "skipped": 0, "pct": 85 },
    "statements": { "total": 1200, "covered": 1020, "skipped": 0, "pct": 85 },
    "functions": { "total": 200, "covered": 180, "skipped": 0, "pct": 90 },
    "branches": { "total": 300, "covered": 240, "skipped": 0, "pct": 80 }
  }
}
```

Create `cli/test/coverage-gate.test.ts`:

```ts
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
      expect(result.report_path).toContain('custom/report.json');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- coverage-gate.test.ts
```

Expected: FAIL because `cli/src/lib/scanners/coverage.ts` does not exist.

- [ ] **Step 3: Implement coverage scanner**

Create `cli/src/lib/scanners/coverage.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type CoverageMetric = {
  value: number;
  target: number;
  ok: boolean;
  gap?: number;
};

export type CoverageCheckResult = {
  ok: boolean;
  coverage: {
    unit?: CoverageMetric;
    integration?: CoverageMetric;
  };
  report_path: string | null;
  format: 'istanbul' | 'unknown';
};

export type IstanbulMetrics = {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
};

export type CoverageTargets = {
  unit?: number;
  integration?: number;
};

export function parseIstanbulSummary(content: string): IstanbulMetrics | null {
  try {
    const parsed = JSON.parse(content) as {
      total?: {
        lines?: { pct: number };
        statements?: { pct: number };
        functions?: { pct: number };
        branches?: { pct: number };
      };
    };

    if (!parsed.total) return null;

    return {
      lines: parsed.total.lines?.pct ?? 0,
      statements: parsed.total.statements?.pct ?? 0,
      functions: parsed.total.functions?.pct ?? 0,
      branches: parsed.total.branches?.pct ?? 0,
    };
  } catch {
    return null;
  }
}

function findCoverageReport(cwd: string): string | null {
  const candidates = [
    join(cwd, 'coverage', 'coverage-summary.json'),
    join(cwd, 'coverage', 'coverage-final.json'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function makeMetric(value: number, target: number): CoverageMetric {
  const ok = value >= target;
  return ok ? { value, target, ok } : { value, target, ok, gap: Math.round((target - value) * 10) / 10 };
}

export function checkCoverage(
  cwd: string,
  targets: CoverageTargets,
  reportPath?: string,
): CoverageCheckResult {
  const resolvedPath = reportPath ?? findCoverageReport(cwd);

  if (!resolvedPath || !existsSync(resolvedPath)) {
    return {
      ok: false,
      coverage: {},
      report_path: null,
      format: 'unknown',
    };
  }

  const content = readFileSync(resolvedPath, 'utf8');
  const metrics = parseIstanbulSummary(content);

  if (!metrics) {
    return {
      ok: false,
      coverage: {},
      report_path: resolvedPath,
      format: 'unknown',
    };
  }

  const coverage: CoverageCheckResult['coverage'] = {};
  let allOk = true;

  if (targets.unit !== undefined) {
    coverage.unit = makeMetric(metrics.lines, targets.unit);
    if (!coverage.unit.ok) allOk = false;
  }

  if (targets.integration !== undefined) {
    coverage.integration = makeMetric(metrics.branches, targets.integration);
    if (!coverage.integration.ok) allOk = false;
  }

  return {
    ok: allOk,
    coverage,
    report_path: resolvedPath,
    format: 'istanbul',
  };
}
```

- [ ] **Step 4: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- coverage-gate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add cli/src/lib/scanners/coverage.ts cli/test/coverage-gate.test.ts cli/test/fixtures/istanbul-summary.json
git commit -m "feat(cli): implement coverage gate scanner"
```

---

### Task 4: Wire Guard Scanners Into CLI Commands

**Files:**
- Modify: `cli/src/commands/guard.ts`
- Create: `cli/test/guard-scanners-cli.test.ts`

- [ ] **Step 1: Write failing CLI integration test**

Create `cli/test/guard-scanners-cli.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(import.meta.dirname, '../dist/index.js');
const fixturesDir = resolve(import.meta.dirname, 'fixtures');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-guard-cli-'));
}

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function setupForge(cwd: string): void {
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  writeFileSync(join(cwd, '.forge', 'config.json'), JSON.stringify({
    version: '2.0', forge_cli_version: '0.2.0',
    memory_file: 'AGENTS.md', test_mode: 'normal',
    project_type: 'existing',
    test_profiles: { default: { framework: 'vitest', command: 'npx vitest run', working_dir: '.' } },
    guards: {
      'batch-review': { enabled: true, every_n_tasks: 6, actions: ['spec-compliance-review'] },
      'security-scan': { enabled: true, trigger: 'keyword', keywords: ['auth'], severity_threshold: 'HIGH', actions: ['security-audit'] },
      'dependency-audit': { enabled: true, trigger: 'new-dependency', actions: ['dependency-check'], license_allowlist: ['MIT', 'Apache-2.0', 'ISC'] },
      'coverage-gate': { enabled: true, trigger: 'phase-complete', actions: ['coverage-check'] },
    },
  }, null, 2));
}

describe('guard scanner CLI commands', () => {
  it('guard:security-scan scans files and reports findings', () => {
    const cwd = tempDir();
    setupForge(cwd);
    writeFileSync(join(cwd, 'secrets.ts'), `const password = "hunter2";\n`);

    const result = run(cwd, ['guard:security-scan', '--files', 'secrets.ts']);
    const output = JSON.parse(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.findings.length).toBeGreaterThan(0);
    expect(output.scanner).toBe('pattern');
  });

  it('guard:security-scan passes on clean files', () => {
    const cwd = tempDir();
    setupForge(cwd);
    writeFileSync(join(cwd, 'clean.ts'), `export const x = 1;\n`);

    const result = run(cwd, ['guard:security-scan', '--files', 'clean.ts']);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.ok).toBe(true);
  });

  it('guard:dependency-audit checks packages', () => {
    const cwd = tempDir();
    setupForge(cwd);
    mkdirSync(join(cwd, 'node_modules', 'lodash'), { recursive: true });
    writeFileSync(join(cwd, 'node_modules', 'lodash', 'package.json'),
      JSON.stringify({ name: 'lodash', version: '4.17.21', license: 'MIT' }));
    writeFileSync(join(cwd, 'package.json'), '{}');

    const result = run(cwd, ['guard:dependency-audit', '--new-packages', 'lodash']);
    const output = JSON.parse(result.stdout);

    expect(output.ok).toBe(true);
    expect(output.packages[0].license_ok).toBe(true);
  });

  it('guard:coverage-check parses Istanbul report', () => {
    const cwd = tempDir();
    setupForge(cwd);
    mkdirSync(join(cwd, 'coverage'), { recursive: true });
    copyFileSync(
      join(fixturesDir, 'istanbul-summary.json'),
      join(cwd, 'coverage', 'coverage-summary.json'),
    );

    const result = run(cwd, ['guard:coverage-check']);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.ok).toBe(true);
    expect(output.coverage.unit.value).toBe(85);
  });

  it('guard:run --type security-scan executes real scan', () => {
    const cwd = tempDir();
    setupForge(cwd);
    writeFileSync(join(cwd, '.forge', 'progress.json'), JSON.stringify({
      version: '1.0', feature: 'auth', status: 'executing',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      spec_path: 'spec.md', plan_path: 'plan.md',
      total_tasks: 2, completed_tasks: 1,
      tasks: [
        { id: 1, title: 'Setup', status: 'done' },
        { id: 2, title: 'Add auth token', status: 'in_progress' },
      ],
      guard_history: [],
      verification: { status: 'pending', test_mode: 'normal', last_run: null },
    }, null, 2));
    writeFileSync(join(cwd, 'auth.ts'), `const jwt_secret = "mysecret";\n`);

    const result = run(cwd, ['guard:run', '--type', 'security-scan', '--task-id', '2']);
    const output = JSON.parse(result.stdout);

    expect(output.ok).toBe(false);
    expect(output.findings).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- guard-scanners-cli.test.ts
```

Expected: FAIL because guard:security-scan and guard:dependency-audit commands don't exist yet.

- [ ] **Step 3: Implement guard scanner commands**

Modify `cli/src/commands/guard.ts` to:
1. Add `guard:security-scan --files <paths>` command that calls `scanFiles()`
2. Add `guard:dependency-audit --new-packages <names>` command that calls `runDependencyAudit()`
3. Replace `guard:coverage-check` stub with real `checkCoverage()` call
4. Replace `guard:run` stub dispatcher to route to real scanners

Key changes to `guard:run`:
```ts
// Replace the existing guard:run action with:
.action((options: GuardRunOptions) => {
  const id = parsePositiveInteger(options.taskId);
  if (id === null) { fail(`invalid task id: ${options.taskId}`); return; }

  const cwd = process.cwd();
  switch (options.type) {
    case 'security-scan': {
      // Get changed files from git or scan all src files
      const files = getTaskFiles(cwd);
      const config = readConfig(cwd);
      const threshold = config.guards['security-scan']?.severity_threshold ?? 'HIGH';
      const result = scanFiles(files, { severityThreshold: threshold as Severity });
      if (!result.ok) process.exitCode = 1;
      writeJson({ ...result, task_id: id });
      break;
    }
    case 'dependency-audit': {
      const config = readConfig(cwd);
      const allowlist = config.guards['dependency-audit']?.license_allowlist ?? ['MIT'];
      const newPkgs = detectNewPackages(cwd);
      const result = runDependencyAudit(cwd, newPkgs, allowlist);
      if (!result.ok) process.exitCode = 1;
      writeJson({ ...result, task_id: id });
      break;
    }
    case 'coverage-gate': {
      const config = readConfig(cwd);
      const targets = { unit: config.test_coverage?.unit ?? 80, integration: config.test_coverage?.integration ?? 60 };
      const result = checkCoverage(cwd, targets);
      if (!result.ok) process.exitCode = 1;
      writeJson({ ...result, task_id: id });
      break;
    }
    default:
      writeJson({ ok: true, delegated: true, type: options.type, message: `${options.type} is handled by skill layer` });
  }
});
```

Add helper to find files for security scan:
```ts
function getTaskFiles(cwd: string): string[] {
  const gitResult = git(cwd, ['diff', '--name-only', 'HEAD~1']);
  if (gitResult.ok) {
    return gitResult.stdout.split('\n').filter(f => f.length > 0).map(f => join(cwd, f));
  }
  // Fallback: scan src/ directory
  return findSourceFiles(cwd);
}
```

- [ ] **Step 4: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- guard-scanners-cli.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all existing tests to verify no regressions**

Run:

```powershell
cd cli
npm test
```

Expected: All tests PASS (phase2-stubs tests may need updating since guard:run no longer returns unsupported).

- [ ] **Step 6: Update phase2-stubs test expectations**

The `guard:run` test in `phase2-stubs.test.ts` expects `unsupported: true`. Update it to expect real scanner output or remove the outdated assertion.

- [ ] **Step 7: Commit**

```powershell
git add cli/src/commands/guard.ts cli/test/guard-scanners-cli.test.ts cli/test/phase2-stubs.test.ts
git commit -m "feat(cli): wire guard scanners into runtime commands"
```

---

### Task 5: Implement gstack E2E Test Runner

**Files:**
- Create: `cli/src/lib/gstack/runner.ts`
- Create: `cli/src/lib/gstack/e2e.ts`
- Create: `cli/test/fixtures/playwright-report.json`
- Create: `cli/test/gstack-e2e.test.ts`

- [ ] **Step 1: Create Playwright report fixture**

Create `cli/test/fixtures/playwright-report.json`:

```json
{
  "suites": [
    {
      "title": "Login",
      "specs": [
        { "title": "logs in with valid credentials", "ok": true, "tests": [{ "status": "passed" }] },
        { "title": "rejects invalid password", "ok": true, "tests": [{ "status": "passed" }] }
      ]
    },
    {
      "title": "Dashboard",
      "specs": [
        { "title": "loads data", "ok": true, "tests": [{ "status": "passed" }] },
        { "title": "handles timeout", "ok": false, "tests": [{ "status": "failed" }] }
      ]
    }
  ],
  "stats": {
    "expected": 3,
    "unexpected": 1,
    "skipped": 0,
    "duration": 8500
  }
}
```

- [ ] **Step 2: Write failing gstack e2e test**

Create `cli/test/gstack-e2e.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- gstack-e2e.test.ts
```

Expected: FAIL because `cli/src/lib/gstack/e2e.ts` does not exist.

- [ ] **Step 4: Implement gstack e2e module**

Create `cli/src/lib/gstack/e2e.ts`:

```ts
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
```

Create `cli/src/lib/gstack/runner.ts`:

```ts
import { runE2e, type GstackE2eResult } from './e2e.js';
import { runVisual, type GstackVisualResult } from './visual.js';
import { runPerformance, type GstackPerformanceResult } from './performance.js';

export type GstackResult = GstackE2eResult | GstackVisualResult | GstackPerformanceResult;

export type GstackOptions = {
  type: 'e2e' | 'visual' | 'performance';
  updateBaseline?: boolean;
  compare?: boolean;
  threshold?: number;
  config?: string;
};

export function runGstack(cwd: string, options: GstackOptions): GstackResult {
  switch (options.type) {
    case 'e2e':
      return runE2e(cwd, options.config);
    case 'visual':
      return runVisual(cwd, {
        updateBaseline: options.updateBaseline ?? false,
        compare: options.compare ?? true,
        threshold: options.threshold ?? 1.0,
      });
    case 'performance':
      return runPerformance(cwd);
  }
}
```

- [ ] **Step 5: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- gstack-e2e.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/lib/gstack/runner.ts cli/src/lib/gstack/e2e.ts cli/test/gstack-e2e.test.ts cli/test/fixtures/playwright-report.json
git commit -m "feat(cli): implement gstack e2e test runner"
```

---

### Task 6: Implement gstack Visual Regression

**Files:**
- Create: `cli/src/lib/gstack/visual.ts`
- Create: `cli/test/gstack-visual.test.ts`
- Create: `cli/test/fixtures/baseline.png`
- Create: `cli/test/fixtures/current-match.png`
- Create: `cli/test/fixtures/current-diff.png`

- [ ] **Step 1: Generate fixture PNG files programmatically in test**

We will generate small 4x4 PNG fixtures in the test setup rather than committing binary files. The test will create matching and differing PNGs using `pngjs`.

- [ ] **Step 2: Write failing visual regression test**

Create `cli/test/gstack-visual.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- gstack-visual.test.ts
```

Expected: FAIL because `cli/src/lib/gstack/visual.ts` does not exist.

- [ ] **Step 4: Implement visual regression module**

Create `cli/src/lib/gstack/visual.ts`:

```ts
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

  mkdirSync(baselines, { recursive: true });
  const files = readdirSync(screenshots).filter((f) => f.endsWith('.png'));

  for (const file of files) {
    const src = readFileSync(join(screenshots, file));
    writeFileSync(join(baselines, file), src);
  }

  return { ok: true, updated: files.length };
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
```

- [ ] **Step 5: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- gstack-visual.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/lib/gstack/visual.ts cli/test/gstack-visual.test.ts
git commit -m "feat(cli): implement gstack visual regression with pixelmatch"
```

---

### Task 7: Implement gstack Performance Metrics And Wire gstack Command

**Files:**
- Create: `cli/src/lib/gstack/performance.ts`
- Create: `cli/test/gstack-performance.test.ts`
- Modify: `cli/src/commands/gstack.ts`

- [ ] **Step 1: Write failing performance test**

Create `cli/test/gstack-performance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  parseWebVitals,
  checkBudgets,
  type GstackPerformanceResult,
} from '../src/lib/gstack/performance.js';

describe('gstack performance', () => {
  describe('parseWebVitals', () => {
    it('extracts metrics from performance entries JSON', () => {
      const entries = JSON.stringify({
        lcp_ms: 1800,
        fid_ms: 50,
        cls: 0.05,
        ttfb_ms: 200,
      });

      const result = parseWebVitals(entries);

      expect(result).toEqual({
        lcp_ms: 1800,
        fid_ms: 50,
        cls: 0.05,
        ttfb_ms: 200,
      });
    });

    it('returns null for invalid JSON', () => {
      expect(parseWebVitals('not json')).toBeNull();
    });

    it('returns null for missing required fields', () => {
      expect(parseWebVitals(JSON.stringify({ lcp_ms: 100 }))).toBeNull();
    });
  });

  describe('checkBudgets', () => {
    it('passes when all metrics are within budget', () => {
      const metrics = { lcp_ms: 1800, fid_ms: 50, cls: 0.05, ttfb_ms: 200 };
      const budgets = { lcp_ms: 2500, fid_ms: 100 };

      const result = checkBudgets(metrics, budgets);

      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('fails when metrics exceed budget', () => {
      const metrics = { lcp_ms: 3000, fid_ms: 150, cls: 0.05, ttfb_ms: 200 };
      const budgets = { lcp_ms: 2500, fid_ms: 100 };

      const result = checkBudgets(metrics, budgets);

      expect(result.ok).toBe(false);
      expect(result.violations).toContain('lcp_ms');
      expect(result.violations).toContain('fid_ms');
    });

    it('handles empty budgets', () => {
      const metrics = { lcp_ms: 9999, fid_ms: 9999, cls: 9, ttfb_ms: 9999 };
      const result = checkBudgets(metrics, {});

      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- gstack-performance.test.ts
```

Expected: FAIL because `cli/src/lib/gstack/performance.ts` does not exist.

- [ ] **Step 3: Implement performance module**

Create `cli/src/lib/gstack/performance.ts`:

```ts
import { runShellCommand } from '../runner.js';

export type WebVitals = {
  lcp_ms: number;
  fid_ms: number;
  cls: number;
  ttfb_ms: number;
};

export type BudgetCheckResult = {
  ok: boolean;
  violations: string[];
};

export type GstackPerformanceResult = {
  ok: boolean;
  type: 'performance';
  metrics: WebVitals | null;
  budgets: Record<string, number>;
  violations: string[];
  error?: string;
};

export function parseWebVitals(content: string): WebVitals | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (
      typeof parsed.lcp_ms !== 'number' ||
      typeof parsed.fid_ms !== 'number' ||
      typeof parsed.cls !== 'number' ||
      typeof parsed.ttfb_ms !== 'number'
    ) {
      return null;
    }

    return {
      lcp_ms: parsed.lcp_ms,
      fid_ms: parsed.fid_ms,
      cls: parsed.cls,
      ttfb_ms: parsed.ttfb_ms,
    };
  } catch {
    return null;
  }
}

export function checkBudgets(
  metrics: WebVitals,
  budgets: Record<string, number>,
): BudgetCheckResult {
  const violations: string[] = [];

  for (const [key, limit] of Object.entries(budgets)) {
    const value = metrics[key as keyof WebVitals];
    if (typeof value === 'number' && value > limit) {
      violations.push(key);
    }
  }

  return { ok: violations.length === 0, violations };
}

export function runPerformance(cwd: string): GstackPerformanceResult {
  // Collect Web Vitals via Playwright script
  const script = `
    const { chromium } = require('playwright');
    (async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(process.env.GSTACK_URL || 'http://localhost:3000');
      const metrics = await page.evaluate(() => {
        return new Promise((resolve) => {
          let lcp = 0, fid = 0, cls = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) lcp = entry.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) fid = entry.processingStart - entry.startTime;
          }).observe({ type: 'first-input', buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value;
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => {
            const ttfb = performance.getEntriesByType('navigation')[0]?.responseStart || 0;
            resolve({ lcp_ms: Math.round(lcp), fid_ms: Math.round(fid), cls: Math.round(cls * 1000) / 1000, ttfb_ms: Math.round(ttfb) });
          }, 5000);
        });
      });
      await browser.close();
      process.stdout.write(JSON.stringify(metrics));
    })();
  `.trim();

  const result = runShellCommand(cwd, '.', `node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);

  if (!result.ok || !result.stdout) {
    return {
      ok: false,
      type: 'performance',
      metrics: null,
      budgets: {},
      violations: [],
      error: result.stderr || 'Performance collection failed. Ensure Playwright is installed and a dev server is running.',
    };
  }

  const metrics = parseWebVitals(result.stdout);
  if (!metrics) {
    return {
      ok: false,
      type: 'performance',
      metrics: null,
      budgets: {},
      violations: [],
      error: 'Failed to parse Web Vitals output',
    };
  }

  return {
    ok: true,
    type: 'performance',
    metrics,
    budgets: {},
    violations: [],
  };
}
```

- [ ] **Step 4: Wire gstack command to real implementation**

Replace `cli/src/commands/gstack.ts` with:

```ts
import type { Command } from 'commander';
import { readConfig } from '../state/config.js';
import { runGstack, type GstackOptions } from '../lib/gstack/runner.js';

type GstackCommandOptions = {
  type: string;
  updateBaseline?: boolean;
  compare?: boolean;
  threshold?: string;
  config?: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function registerGstackCommand(program: Command): void {
  program
    .command('test:gstack')
    .requiredOption('--type <type>', 'gstack test type (e2e|visual|performance)')
    .option('--update-baseline', 'update visual baselines')
    .option('--compare', 'compare against baselines')
    .option('--threshold <pct>', 'visual diff threshold percentage')
    .option('--config <path>', 'Playwright config path')
    .action((options: GstackCommandOptions) => {
      const cwd = process.cwd();
      const config = readConfig(cwd);

      if (config.gstack_installed !== true) {
        process.exitCode = 1;
        writeJson({
          ok: false,
          unavailable: true,
          type: options.type,
          message: 'gstack is not installed or not enabled in config.json',
        });
        return;
      }

      const gstackOptions: GstackOptions = {
        type: options.type as 'e2e' | 'visual' | 'performance',
        updateBaseline: options.updateBaseline,
        compare: options.compare,
        threshold: options.threshold ? parseFloat(options.threshold) : undefined,
        config: options.config,
      };

      const result = runGstack(cwd, gstackOptions);
      if (!result.ok) process.exitCode = 1;
      writeJson(result);
    });
}
```

- [ ] **Step 5: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- gstack-performance.test.ts gstack-e2e.test.ts gstack-visual.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update phase2-stubs test for gstack**

Update `cli/test/phase2-stubs.test.ts` — the test that checks `unsupported: true` when gstack is enabled needs to verify real output now. Change:
```ts
test('test:gstack returns unsupported when gstack is enabled but not implemented', ...)
```
to expect a real result (will fail due to no Playwright, so check for an error message instead of `unsupported`).

- [ ] **Step 7: Commit**

```powershell
git add cli/src/lib/gstack/performance.ts cli/src/commands/gstack.ts cli/test/gstack-performance.test.ts cli/test/phase2-stubs.test.ts
git commit -m "feat(cli): implement gstack performance and wire command"
```

---

### Task 8: Implement Monorepo Detection

**Files:**
- Modify: `cli/src/lib/detect.ts`
- Modify: `cli/src/commands/init.ts`
- Create: `cli/test/monorepo-detect.test.ts`

- [ ] **Step 1: Write failing monorepo detection test**

Create `cli/test/monorepo-detect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { detectMonorepoProfiles, type MonorepoDetectResult } from '../src/lib/detect.js';

const cli = resolve(import.meta.dirname, '../dist/index.js');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-mono-'));
}

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

describe('monorepo detection', () => {
  it('detects pnpm workspace and generates profiles', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    mkdirSync(join(cwd, 'packages', 'frontend'), { recursive: true });
    writeFileSync(join(cwd, 'packages', 'frontend', 'package.json'), JSON.stringify({
      name: 'frontend',
      devDependencies: { vitest: '^2.0.0' },
      scripts: { test: 'vitest run' },
    }));
    mkdirSync(join(cwd, 'packages', 'backend'), { recursive: true });
    writeFileSync(join(cwd, 'packages', 'backend', 'package.json'), JSON.stringify({
      name: 'backend',
      scripts: { test: 'jest' },
      devDependencies: { jest: '^29.0.0' },
    }));

    const result = detectMonorepoProfiles(cwd);

    expect(result.monorepo).toBe(true);
    expect(result.monorepo_type).toBe('pnpm');
    expect(result.detected_profiles).toHaveLength(2);
    expect(result.detected_profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'frontend', framework: 'vitest' }),
        expect.objectContaining({ name: 'backend', framework: 'jest' }),
      ]),
    );
  });

  it('detects npm workspaces from package.json', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    mkdirSync(join(cwd, 'packages', 'lib'), { recursive: true });
    writeFileSync(join(cwd, 'packages', 'lib', 'package.json'), JSON.stringify({
      name: 'lib',
      scripts: { test: 'npm test' },
    }));

    const result = detectMonorepoProfiles(cwd);

    expect(result.monorepo).toBe(true);
    expect(result.monorepo_type).toBe('yarn');
    expect(result.detected_profiles.length).toBeGreaterThanOrEqual(1);
  });

  it('detects turbo.json', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'turbo.json'), JSON.stringify({ pipeline: {} }));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      workspaces: ['apps/*'],
    }));
    mkdirSync(join(cwd, 'apps', 'web'), { recursive: true });
    writeFileSync(join(cwd, 'apps', 'web', 'package.json'), JSON.stringify({
      name: 'web',
      devDependencies: { vitest: '^2.0.0' },
    }));

    const result = detectMonorepoProfiles(cwd);

    expect(result.monorepo).toBe(true);
    expect(result.monorepo_type).toBe('turbo');
  });

  it('detects nx.json', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'nx.json'), JSON.stringify({}));
    mkdirSync(join(cwd, 'packages', 'api'), { recursive: true });
    writeFileSync(join(cwd, 'packages', 'api', 'package.json'), JSON.stringify({
      name: 'api',
      scripts: { test: 'jest' },
      devDependencies: { jest: '^29.0.0' },
    }));

    const result = detectMonorepoProfiles(cwd);

    expect(result.monorepo).toBe(true);
    expect(result.monorepo_type).toBe('nx');
  });

  it('returns monorepo=false for non-monorepo', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'app' }));

    const result = detectMonorepoProfiles(cwd);

    expect(result.monorepo).toBe(false);
    expect(result.detected_profiles).toHaveLength(0);
  });

  it('init --monorepo generates multiple test profiles', () => {
    const cwd = tempDir();
    // Copy schemas for init validation
    const schemasDir = resolve(import.meta.dirname, '../../schemas');
    mkdirSync(join(cwd, 'schemas'), { recursive: true });
    const { readdirSync, copyFileSync } = require('node:fs');
    for (const f of readdirSync(schemasDir)) {
      copyFileSync(join(schemasDir, f), join(cwd, 'schemas', f));
    }

    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    mkdirSync(join(cwd, 'packages', 'ui'), { recursive: true });
    writeFileSync(join(cwd, 'packages', 'ui', 'package.json'), JSON.stringify({
      devDependencies: { vitest: '^2.0.0' },
    }));

    const result = run(cwd, ['init', '--auto-detect', '--monorepo']);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.ok).toBe(true);
    expect(output.monorepo).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- monorepo-detect.test.ts
```

Expected: FAIL because `detectMonorepoProfiles` does not exist.

- [ ] **Step 3: Implement monorepo detection in detect.ts**

Add to `cli/src/lib/detect.ts`:

```ts
import { parse as parseYaml } from 'yaml';

export type MonorepoDetectResult = {
  monorepo: boolean;
  monorepo_type: 'pnpm' | 'lerna' | 'nx' | 'turbo' | 'yarn' | null;
  detected_profiles: Array<{
    name: string;
    framework: string;
    working_dir: string;
    command: string;
    coverage_command?: string;
  }>;
};

function resolveGlobs(cwd: string, patterns: string[]): string[] {
  const dirs: string[] = [];
  for (const pattern of patterns) {
    const base = pattern.replace(/\/?\*.*$/, '');
    const parentDir = join(cwd, base);
    if (!existsSync(parentDir)) continue;
    try {
      const entries = readdirSync(parentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(join(parentDir, entry.name));
        }
      }
    } catch { /* skip unreadable dirs */ }
  }
  return dirs;
}

function detectSubdirProfile(dir: string): { framework: string; command: string; coverage_command?: string } | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

    if (deps.vitest) return { framework: 'vitest', command: 'npx vitest run', coverage_command: 'npx vitest run --coverage' };
    if (deps.jest) return { framework: 'jest', command: 'npx jest' };
    if (pkg.scripts?.test) return { framework: frameworkFromScript(pkg.scripts.test), command: 'npm test' };
  } catch { /* skip */ }

  // Check for non-JS projects
  if (existsSync(join(dir, 'go.mod'))) return { framework: 'go', command: 'go test ./...' };
  if (existsSync(join(dir, 'Cargo.toml'))) return { framework: 'cargo', command: 'cargo test' };
  if (existsSync(join(dir, 'pyproject.toml'))) return { framework: 'pytest', command: 'pytest' };

  return null;
}

export function detectMonorepoProfiles(cwd: string): MonorepoDetectResult {
  let monorepoType: MonorepoDetectResult['monorepo_type'] = null;
  let workspaceDirs: string[] = [];

  // Check for monorepo indicators
  if (existsSync(join(cwd, 'pnpm-workspace.yaml'))) {
    monorepoType = 'pnpm';
    try {
      const content = readFileSync(join(cwd, 'pnpm-workspace.yaml'), 'utf8');
      const parsed = parseYaml(content) as { packages?: string[] };
      workspaceDirs = resolveGlobs(cwd, parsed.packages ?? []);
    } catch { /* fallback to scanning */ }
  } else if (existsSync(join(cwd, 'turbo.json'))) {
    monorepoType = 'turbo';
  } else if (existsSync(join(cwd, 'nx.json'))) {
    monorepoType = 'nx';
  } else if (existsSync(join(cwd, 'lerna.json'))) {
    monorepoType = 'lerna';
    try {
      const lerna = JSON.parse(readFileSync(join(cwd, 'lerna.json'), 'utf8')) as { packages?: string[] };
      workspaceDirs = resolveGlobs(cwd, lerna.packages ?? ['packages/*']);
    } catch { /* fallback */ }
  }

  // If no pnpm/lerna packages found, check package.json workspaces
  if (workspaceDirs.length === 0) {
    const pkgPath = join(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { workspaces?: string[] | { packages?: string[] } };
        const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages ?? [];
        if (patterns.length > 0) {
          if (!monorepoType) monorepoType = 'yarn';
          workspaceDirs = resolveGlobs(cwd, patterns);
        }
      } catch { /* skip */ }
    }
  }

  // If still no workspace dirs but we detected a monorepo type, scan common dirs
  if (monorepoType && workspaceDirs.length === 0) {
    for (const dir of ['packages', 'apps', 'libs', 'modules']) {
      const fullDir = join(cwd, dir);
      if (existsSync(fullDir)) {
        try {
          const entries = readdirSync(fullDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) workspaceDirs.push(join(fullDir, entry.name));
          }
        } catch { /* skip */ }
      }
    }
  }

  if (!monorepoType) {
    return { monorepo: false, monorepo_type: null, detected_profiles: [] };
  }

  // Detect profiles for each workspace directory
  const profiles: MonorepoDetectResult['detected_profiles'] = [];
  for (const dir of workspaceDirs) {
    const profile = detectSubdirProfile(dir);
    if (profile) {
      const name = basename(dir);
      const relativePath = relative(cwd, dir).replace(/\\/g, '/');
      profiles.push({
        name,
        framework: profile.framework,
        working_dir: relativePath.endsWith('/') ? relativePath : `${relativePath}/`,
        command: profile.command,
        coverage_command: profile.coverage_command,
      });
    }
  }

  return { monorepo: true, monorepo_type: monorepoType, detected_profiles: profiles };
}
```

Add imports at the top of `detect.ts`:
```ts
import { basename, relative } from 'node:path';
import { readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
```

- [ ] **Step 4: Wire --monorepo flag into init command**

Modify `cli/src/commands/init.ts` to accept `--monorepo` option. When present:
1. Call `detectMonorepoProfiles(cwd)`
2. If monorepo detected, use detected profiles as `test_profiles` in config
3. Output `monorepo: true` and `detected_profiles` in JSON result

- [ ] **Step 5: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- monorepo-detect.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/lib/detect.ts cli/src/commands/init.ts cli/test/monorepo-detect.test.ts
git commit -m "feat(cli): implement monorepo workspace detection"
```

---

### Task 9: Implement Scenarios Template Export And Import

**Files:**
- Modify: `cli/src/commands/scenarios.ts`
- Create: `cli/test/scenarios-template.test.ts`

- [ ] **Step 1: Write failing scenarios template test**

Create `cli/test/scenarios-template.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(import.meta.dirname, '../dist/index.js');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-scenarios-'));
}

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function setupForge(cwd: string): void {
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  writeFileSync(join(cwd, '.forge', 'config.json'), JSON.stringify({
    version: '2.0', forge_cli_version: '0.2.0',
    memory_file: 'AGENTS.md', test_mode: 'normal',
    project_type: 'existing',
    test_profiles: { default: { framework: 'vitest', command: 'npx vitest run', working_dir: '.' } },
    guards: { 'batch-review': { enabled: true, every_n_tasks: 6, actions: ['spec-compliance-review'] } },
  }, null, 2));
  writeFileSync(join(cwd, '.forge', 'progress.json'), JSON.stringify({
    version: '1.0', feature: 'user-auth', status: 'planning',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    spec_path: 'spec.md', plan_path: null,
    total_tasks: 0, completed_tasks: 0, tasks: [],
    guard_history: [],
    verification: { status: 'pending', test_mode: 'normal', last_run: null },
  }, null, 2));
}

describe('scenarios template system', () => {
  describe('scenarios:export', () => {
    it('exports scenarios to template file', () => {
      const cwd = tempDir();
      setupForge(cwd);
      writeFileSync(join(cwd, '.forge', 'scenarios.json'), JSON.stringify({
        scenarios: [
          { id: 'S001', title: 'Login success', priority: 'P0' },
          { id: 'S002', title: 'Login failure', priority: 'P1' },
        ],
      }));

      const result = run(cwd, ['scenarios:export', '--feature', 'user-auth', '--template', 'auth-scenarios']);
      const output = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.template).toBe('auth-scenarios');
      expect(output.scenarios_count).toBe(2);

      const templatePath = join(cwd, '.forge', 'templates', 'auth-scenarios.json');
      expect(existsSync(templatePath)).toBe(true);

      const template = JSON.parse(readFileSync(templatePath, 'utf8'));
      expect(template.version).toBe('1.0');
      expect(template.template).toBe('auth-scenarios');
      expect(template.scenarios).toHaveLength(2);
    });

    it('fails when scenarios.json does not exist', () => {
      const cwd = tempDir();
      setupForge(cwd);

      const result = run(cwd, ['scenarios:export', '--feature', 'x', '--template', 'y']);
      const output = JSON.parse(result.stdout);

      expect(result.status).toBe(1);
      expect(output.ok).toBe(false);
    });
  });

  describe('scenarios:import', () => {
    it('imports template into current scenarios', () => {
      const cwd = tempDir();
      setupForge(cwd);
      mkdirSync(join(cwd, '.forge', 'templates'), { recursive: true });
      writeFileSync(join(cwd, '.forge', 'templates', 'auth.json'), JSON.stringify({
        version: '1.0',
        template: 'auth',
        description: 'Auth scenarios',
        scenarios: [
          { id: 'T001', title: 'Authenticated user', type: 'given-template' },
        ],
      }));
      writeFileSync(join(cwd, '.forge', 'scenarios.json'), JSON.stringify({
        scenarios: [{ id: 'S001', title: 'Existing scenario', priority: 'P0' }],
      }));

      const result = run(cwd, ['scenarios:import', '--template', 'auth']);
      const output = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.imported).toBe(1);

      const scenarios = JSON.parse(readFileSync(join(cwd, '.forge', 'scenarios.json'), 'utf8'));
      expect(scenarios.scenarios).toHaveLength(2);
    });

    it('skips duplicate scenario IDs', () => {
      const cwd = tempDir();
      setupForge(cwd);
      mkdirSync(join(cwd, '.forge', 'templates'), { recursive: true });
      writeFileSync(join(cwd, '.forge', 'templates', 'dup.json'), JSON.stringify({
        version: '1.0', template: 'dup', description: 'test',
        scenarios: [{ id: 'S001', title: 'Duplicate' }],
      }));
      writeFileSync(join(cwd, '.forge', 'scenarios.json'), JSON.stringify({
        scenarios: [{ id: 'S001', title: 'Original', priority: 'P0' }],
      }));

      const result = run(cwd, ['scenarios:import', '--template', 'dup']);
      const output = JSON.parse(result.stdout);

      expect(output.ok).toBe(true);
      expect(output.imported).toBe(0);
      expect(output.skipped_duplicates).toBe(1);
    });

    it('marks imported as given-template with --as-given', () => {
      const cwd = tempDir();
      setupForge(cwd);
      mkdirSync(join(cwd, '.forge', 'templates'), { recursive: true });
      writeFileSync(join(cwd, '.forge', 'templates', 'precond.json'), JSON.stringify({
        version: '1.0', template: 'precond', description: 'Preconditions',
        scenarios: [{ id: 'P001', title: 'User logged in' }],
      }));
      writeFileSync(join(cwd, '.forge', 'scenarios.json'), JSON.stringify({ scenarios: [] }));

      const result = run(cwd, ['scenarios:import', '--template', 'precond', '--as-given']);
      const output = JSON.parse(result.stdout);

      expect(output.ok).toBe(true);
      const scenarios = JSON.parse(readFileSync(join(cwd, '.forge', 'scenarios.json'), 'utf8'));
      expect(scenarios.scenarios[0].type).toBe('given-template');
    });

    it('creates scenarios.json if it does not exist', () => {
      const cwd = tempDir();
      setupForge(cwd);
      mkdirSync(join(cwd, '.forge', 'templates'), { recursive: true });
      writeFileSync(join(cwd, '.forge', 'templates', 'new.json'), JSON.stringify({
        version: '1.0', template: 'new', description: 'New',
        scenarios: [{ id: 'N001', title: 'New scenario' }],
      }));

      const result = run(cwd, ['scenarios:import', '--template', 'new']);
      const output = JSON.parse(result.stdout);

      expect(output.ok).toBe(true);
      expect(output.imported).toBe(1);
      expect(existsSync(join(cwd, '.forge', 'scenarios.json'))).toBe(true);
    });

    it('fails when template does not exist', () => {
      const cwd = tempDir();
      setupForge(cwd);

      const result = run(cwd, ['scenarios:import', '--template', 'nonexistent']);
      const output = JSON.parse(result.stdout);

      expect(result.status).toBe(1);
      expect(output.ok).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- scenarios-template.test.ts
```

Expected: FAIL because scenarios:export/import still return `unsupported`.

- [ ] **Step 3: Implement scenarios export and import**

Replace the export/import stubs in `cli/src/commands/scenarios.ts`:

```ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { readProgress } from '../state/progress.js';

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

function safeFeatureSlug(feature: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(feature);
}

type ExportOptions = { feature: string; template: string };
type ImportOptions = { template: string; asGiven?: boolean };

export function registerScenariosCommand(program: Command): void {
  program
    .command('scenarios:export')
    .requiredOption('--feature <slug>', 'feature slug')
    .requiredOption('--template <name>', 'template name')
    .action((options: ExportOptions) => {
      const cwd = process.cwd();
      const scenariosPath = join(cwd, '.forge', 'scenarios.json');

      if (!existsSync(scenariosPath)) {
        fail('.forge/scenarios.json does not exist');
        return;
      }

      if (!safeFeatureSlug(options.template)) {
        fail('template name must be a safe slug');
        return;
      }

      const scenarios = JSON.parse(readFileSync(scenariosPath, 'utf8')) as { scenarios?: unknown[] };
      const template = {
        version: '1.0',
        template: options.template,
        description: `Exported from feature: ${options.feature}`,
        exported_at: new Date().toISOString(),
        scenarios: scenarios.scenarios ?? [],
      };

      const templatesDir = join(cwd, '.forge', 'templates');
      mkdirSync(templatesDir, { recursive: true });
      const templatePath = join(templatesDir, `${options.template}.json`);
      writeFileSync(templatePath, JSON.stringify(template, null, 2) + '\n', 'utf8');

      writeJson({
        ok: true,
        template: options.template,
        path: `.forge/templates/${options.template}.json`,
        scenarios_count: (scenarios.scenarios ?? []).length,
      });
    });

  program
    .command('scenarios:import')
    .requiredOption('--template <name>', 'template name')
    .option('--as-given', 'mark imported scenarios as given-template type')
    .action((options: ImportOptions) => {
      const cwd = process.cwd();
      const templatePath = join(cwd, '.forge', 'templates', `${options.template}.json`);

      if (!existsSync(templatePath)) {
        fail(`template not found: ${options.template}`);
        return;
      }

      const template = JSON.parse(readFileSync(templatePath, 'utf8')) as {
        scenarios?: Array<Record<string, unknown>>;
      };
      const templateScenarios = template.scenarios ?? [];

      // Load or create current scenarios
      const scenariosPath = join(cwd, '.forge', 'scenarios.json');
      let current: { scenarios: Array<Record<string, unknown>> };
      if (existsSync(scenariosPath)) {
        current = JSON.parse(readFileSync(scenariosPath, 'utf8')) as typeof current;
      } else {
        current = { scenarios: [] };
      }

      const existingIds = new Set(current.scenarios.map((s) => s.id));
      let imported = 0;
      let skippedDuplicates = 0;

      for (const scenario of templateScenarios) {
        if (scenario.id && existingIds.has(scenario.id)) {
          skippedDuplicates++;
          continue;
        }
        const toAdd = options.asGiven ? { ...scenario, type: 'given-template' } : { ...scenario };
        current.scenarios.push(toAdd);
        imported++;
      }

      mkdirSync(join(cwd, '.forge'), { recursive: true });
      writeFileSync(scenariosPath, JSON.stringify(current, null, 2) + '\n', 'utf8');

      writeJson({
        ok: true,
        imported,
        skipped_duplicates: skippedDuplicates,
        template: options.template,
      });
    });

  program.command('scenarios:archive').action(() => {
    const cwd = process.cwd();
    const progress = readProgress(cwd);
    if (!progress.feature) {
      fail('progress.feature is required to archive scenarios');
      return;
    }

    if (!safeFeatureSlug(progress.feature)) {
      fail('progress.feature must be a safe feature slug');
      return;
    }

    const sourcePath = join(cwd, '.forge', 'scenarios.json');
    if (!existsSync(sourcePath)) {
      fail('.forge/scenarios.json does not exist');
      return;
    }

    const archiveDir = join(cwd, '.forge', 'specs');
    const archivePath = `.forge/specs/${progress.feature}-scenarios.json`;
    mkdirSync(archiveDir, { recursive: true });
    copyFileSync(sourcePath, join(cwd, archivePath));

    writeJson({ ok: true, archived_to: archivePath });
  });
}
```

- [ ] **Step 4: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- scenarios-template.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update phase2-stubs test for scenarios**

Update `cli/test/phase2-stubs.test.ts` — remove or update the tests that expect `unsupported: true` for `scenarios:export` and `scenarios:import` since they now have real implementations requiring `--feature`/`--template` args.

- [ ] **Step 6: Verify all tests pass**

Run:

```powershell
cd cli
npm test
```

Expected: All PASS.

- [ ] **Step 7: Commit**

```powershell
git add cli/src/commands/scenarios.ts cli/test/scenarios-template.test.ts cli/test/phase2-stubs.test.ts
git commit -m "feat(cli): implement scenarios template export and import"
```

---

### Task 10: Implement Structured Logger And Global --log-file

**Files:**
- Create: `cli/src/lib/logger.ts`
- Create: `cli/test/logger.test.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Write failing logger test**

Create `cli/test/logger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(import.meta.dirname, '../dist/index.js');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-logger-'));
}

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

describe('structured logger', () => {
  it('--log-file writes JSONL log for a command', () => {
    const cwd = tempDir();
    const logFile = join(cwd, 'forge.log');

    run(cwd, ['--log-file', logFile, '--version-json']);

    expect(existsSync(logFile)).toBe(true);
    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.ts).toBeDefined();
    expect(entry.cmd).toBeDefined();
    expect(entry.event).toBe('start');
  });

  it('log file contains both start and result entries', () => {
    const cwd = tempDir();
    const logFile = join(cwd, 'cmd.log');

    run(cwd, ['--log-file', logFile, '--version-json']);

    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    const events = lines.map((l) => JSON.parse(l).event);

    expect(events).toContain('start');
    expect(events).toContain('result');
  });

  it('appends to existing log file', () => {
    const cwd = tempDir();
    const logFile = join(cwd, 'multi.log');

    run(cwd, ['--log-file', logFile, '--version-json']);
    run(cwd, ['--log-file', logFile, '--version-json']);

    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(4); // 2 commands × 2 entries each
  });

  it('works without --log-file (no file created)', () => {
    const cwd = tempDir();
    run(cwd, ['--version-json']);

    // No log file should be created in cwd
    expect(existsSync(join(cwd, 'forge.log'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- logger.test.ts
```

Expected: FAIL because `--log-file` is not handled.

- [ ] **Step 3: Implement logger module**

Create `cli/src/lib/logger.ts`:

```ts
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogEntry = {
  ts: string;
  cmd: string;
  event: 'start' | 'result' | 'error';
  [key: string]: unknown;
};

export class ForgeLogger {
  private logFile: string | null;

  constructor(logFile: string | null) {
    this.logFile = logFile;
    if (logFile) {
      mkdirSync(dirname(logFile), { recursive: true });
    }
  }

  log(entry: Omit<LogEntry, 'ts'>): void {
    if (!this.logFile) return;

    const fullEntry: LogEntry = {
      ts: new Date().toISOString(),
      ...entry,
    };

    appendFileSync(this.logFile, JSON.stringify(fullEntry) + '\n', 'utf8');
  }

  get enabled(): boolean {
    return this.logFile !== null;
  }
}

let globalLogger: ForgeLogger | null = null;

export function initLogger(logFile: string | null): ForgeLogger {
  globalLogger = new ForgeLogger(logFile);
  return globalLogger;
}

export function getLogger(): ForgeLogger {
  return globalLogger ?? new ForgeLogger(null);
}
```

- [ ] **Step 4: Wire --log-file into cli/src/index.ts**

Add to `cli/src/index.ts` before command registration:

```ts
import { initLogger, getLogger } from './lib/logger.js';

// Add global option
program.option('--log-file <path>', 'write structured JSONL log to file');

// Add preAction hook after all commands are registered
program.hook('preAction', (thisCommand) => {
  const opts = program.opts<{ logFile?: string }>();
  const logger = initLogger(opts.logFile ?? null);
  const cmdName = thisCommand.name();
  logger.log({ cmd: cmdName, event: 'start', args: thisCommand.args });
});

// Add postAction hook
program.hook('postAction', (thisCommand) => {
  const logger = getLogger();
  logger.log({ cmd: thisCommand.name(), event: 'result', exitCode: process.exitCode ?? 0 });
});
```

- [ ] **Step 5: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- logger.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/lib/logger.ts cli/src/index.ts cli/test/logger.test.ts
git commit -m "feat(cli): add structured JSONL logger with --log-file"
```

---

### Task 11: Enhance forge status With Guard Preview

**Files:**
- Modify: `cli/src/commands/status.ts`
- Create: `cli/test/status-enhanced.test.ts`

- [ ] **Step 1: Write failing status enhancement test**

Create `cli/test/status-enhanced.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(import.meta.dirname, '../dist/index.js');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-status-'));
}

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function setupExecuting(cwd: string, overrides: Record<string, unknown> = {}): void {
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  writeFileSync(join(cwd, '.forge', 'config.json'), JSON.stringify({
    version: '2.0', forge_cli_version: '0.2.0',
    memory_file: 'AGENTS.md', test_mode: 'normal',
    project_type: 'existing',
    test_profiles: { default: { framework: 'vitest', command: 'npx vitest run', working_dir: '.' } },
    guards: {
      'batch-review': { enabled: true, every_n_tasks: 3, actions: ['spec-compliance-review'] },
      'security-scan': { enabled: true, trigger: 'keyword', keywords: ['token', 'auth'], severity_threshold: 'HIGH', actions: ['security-audit'] },
    },
  }, null, 2));
  writeFileSync(join(cwd, '.forge', 'progress.json'), JSON.stringify({
    version: '1.0',
    feature: 'user-auth',
    status: 'executing',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    spec_path: 'spec.md',
    plan_path: 'plan.md',
    total_tasks: 6,
    completed_tasks: 2,
    tasks: [
      { id: 1, title: 'Setup project', status: 'done' },
      { id: 2, title: 'Add database', status: 'done' },
      { id: 3, title: 'Add token refresh', status: 'pending' },
      { id: 4, title: 'Add UI', status: 'pending' },
      { id: 5, title: 'Add tests', status: 'pending' },
      { id: 6, title: 'Final review', status: 'pending' },
    ],
    guard_history: [],
    verification: { status: 'pending', test_mode: 'normal', last_run: null },
    ...overrides,
  }, null, 2));
}

describe('enhanced forge status', () => {
  it('includes guard preview when status is executing', () => {
    const cwd = tempDir();
    setupExecuting(cwd);

    const result = run(cwd, ['status']);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.guard).toBeDefined();
    expect(output.guard.next_guard_type).toBeDefined();
    expect(output.guard.tasks_until_guard).toBeGreaterThanOrEqual(0);
  });

  it('predicts security-scan for next task with keyword match', () => {
    const cwd = tempDir();
    setupExecuting(cwd);

    const result = run(cwd, ['status']);
    const output = JSON.parse(result.stdout);

    expect(output.guard.preview.security_scan_will_trigger).toBe(true);
    expect(output.guard.preview.reason).toContain('token');
  });

  it('predicts batch-review countdown', () => {
    const cwd = tempDir();
    setupExecuting(cwd);

    const result = run(cwd, ['status']);
    const output = JSON.parse(result.stdout);

    // every_n_tasks=3, completed=2, so batch-review at task 3 (1 away)
    expect(output.guard.tasks_until_guard).toBe(1);
    expect(output.guard.due_at_task).toBe(3);
  });

  it('omits guard field when status is idle', () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, '.forge'), { recursive: true });
    writeFileSync(join(cwd, '.forge', 'config.json'), JSON.stringify({
      version: '2.0', forge_cli_version: '0.2.0',
      memory_file: 'AGENTS.md', test_mode: 'normal',
      project_type: 'existing',
      test_profiles: { default: { framework: 'vitest', command: 'npx vitest run', working_dir: '.' } },
      guards: { 'batch-review': { enabled: true, every_n_tasks: 6, actions: ['spec-compliance-review'] } },
    }, null, 2));
    writeFileSync(join(cwd, '.forge', 'progress.json'), JSON.stringify({
      version: '1.0', feature: null, status: 'idle',
      created_at: null, updated_at: '2026-01-01T00:00:00Z',
      spec_path: null, plan_path: null,
      total_tasks: 0, completed_tasks: 0, tasks: [],
      guard_history: [],
      verification: { status: 'pending', test_mode: 'normal', last_run: null },
    }, null, 2));

    const result = run(cwd, ['status']);
    const output = JSON.parse(result.stdout);

    expect(output.guard).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd cli
npm run build
npm test -- status-enhanced.test.ts
```

Expected: FAIL because `guard` field is not present in status output.

- [ ] **Step 3: Enhance status command**

Modify `cli/src/commands/status.ts` to add guard preview calculation when status is `executing`:

```ts
// After the existing status output logic, add:
import { triggeredGuards } from '../lib/guard.js';

// Inside the status action, after building the base output:
if (progress.status === 'executing' && progress.tasks.length > 0) {
  const config = readConfig(cwd);
  const nextTask = progress.tasks.find((t) => t.status === 'pending');

  if (nextTask) {
    // Calculate batch-review countdown
    const batchReview = config.guards['batch-review'];
    const every = batchReview?.every_n_tasks ?? 6;
    const tasksUntilBatch = every - (progress.completed_tasks % every);
    const dueAtTask = progress.completed_tasks + tasksUntilBatch;

    // Preview what guards would trigger for next task
    const previewProgress = {
      ...progress,
      completed_tasks: progress.completed_tasks + 1,
    };
    const previewTask = { ...nextTask, status: 'done' as const };
    const guards = triggeredGuards(config, previewProgress, previewTask);

    // Check security-scan keyword match
    const securityGuard = config.guards['security-scan'];
    const securityWillTrigger = securityGuard?.enabled === true &&
      securityGuard.keywords?.some((kw: string) =>
        nextTask.title.toLowerCase().includes(kw.toLowerCase())
      ) ?? false;

    const matchedKeyword = securityGuard?.keywords?.find((kw: string) =>
      nextTask.title.toLowerCase().includes(kw.toLowerCase())
    );

    output.guard = {
      due_at_task: dueAtTask,
      tasks_until_guard: tasksUntilBatch,
      next_guard_type: guards.length > 0 ? guards[0].type : 'batch-review',
      preview: {
        security_scan_will_trigger: securityWillTrigger,
        ...(matchedKeyword ? { reason: `next task title contains '${matchedKeyword}'` } : {}),
      },
    };
  }
}
```

- [ ] **Step 4: Build and verify tests pass**

Run:

```powershell
cd cli
npm run build
npm test -- status-enhanced.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests for regression check**

Run:

```powershell
cd cli
npm test
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```powershell
git add cli/src/commands/status.ts cli/test/status-enhanced.test.ts
git commit -m "feat(cli): enhance forge status with guard preview"
```

---

### Task 12: Final Integration Test And Cleanup

**Files:**
- Modify: `cli/test/phase2-stubs.test.ts`
- Create: `cli/test/round2-integration.test.ts`

- [ ] **Step 1: Write integration test covering full guard workflow**

Create `cli/test/round2-integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(import.meta.dirname, '../dist/index.js');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-r2-int-'));
}

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function setupProject(cwd: string): void {
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  mkdirSync(join(cwd, 'schemas'), { recursive: true });

  // Copy schemas
  const schemasDir = resolve(import.meta.dirname, '../../schemas');
  for (const f of ['config.schema.json', 'progress.schema.json', 'scenarios.schema.json']) {
    const src = join(schemasDir, f);
    const dst = join(cwd, 'schemas', f);
    try { writeFileSync(dst, readFileSync(src)); } catch { /* skip */ }
  }

  writeFileSync(join(cwd, '.forge', 'config.json'), JSON.stringify({
    version: '2.0', forge_cli_version: '0.2.0',
    memory_file: 'AGENTS.md', test_mode: 'normal',
    project_type: 'existing',
    test_profiles: { default: { framework: 'vitest', command: 'echo "tests pass"', working_dir: '.' } },
    test_coverage: { unit: 80, integration: 60 },
    guards: {
      'batch-review': { enabled: true, every_n_tasks: 3, actions: ['spec-compliance-review'] },
      'security-scan': { enabled: true, trigger: 'keyword', keywords: ['auth', 'token'], severity_threshold: 'HIGH', actions: ['security-audit'] },
      'dependency-audit': { enabled: true, trigger: 'new-dependency', actions: ['dependency-check'], license_allowlist: ['MIT', 'Apache-2.0', 'ISC'] },
      'coverage-gate': { enabled: true, trigger: 'phase-complete', actions: ['coverage-check'] },
    },
  }, null, 2));
  writeFileSync(join(cwd, '.forge', 'progress.json'), JSON.stringify({
    version: '1.0', feature: 'auth-module', status: 'executing',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    spec_path: 'spec.md', plan_path: 'plan.md',
    total_tasks: 3, completed_tasks: 2,
    tasks: [
      { id: 1, title: 'Setup', status: 'done' },
      { id: 2, title: 'Add database', status: 'done' },
      { id: 3, title: 'Add auth token endpoint', status: 'in_progress' },
    ],
    guard_history: [],
    verification: { status: 'pending', test_mode: 'normal', last_run: null },
  }, null, 2));
}

describe('round 2 integration', () => {
  it('full guard workflow: preview → security-scan → record', () => {
    const cwd = tempDir();
    setupProject(cwd);
    writeFileSync(join(cwd, 'auth.ts'), `const jwt_secret = "my-secret-key";\n`);

    // 1. Preview shows security-scan will trigger
    const preview = run(cwd, ['guard:preview', '--next-task-id', '3', '--next-task-title', 'Add auth token endpoint']);
    const previewOut = JSON.parse(preview.stdout);
    expect(previewOut.guard_triggered).toBe(true);
    expect(previewOut.guards.some((g: any) => g.type === 'security-scan')).toBe(true);

    // 2. Run security scan
    const scan = run(cwd, ['guard:security-scan', '--files', 'auth.ts']);
    const scanOut = JSON.parse(scan.stdout);
    expect(scanOut.ok).toBe(false);
    expect(scanOut.findings.length).toBeGreaterThan(0);

    // 3. Record guard result
    const record = run(cwd, ['guard:record', '--type', 'security-scan', '--status', 'failed', '--tasks', '3', '--notes', 'Found hardcoded secret']);
    const recordOut = JSON.parse(record.stdout);
    expect(recordOut.ok).toBe(true);

    // 4. Verify guard history was written
    const history = run(cwd, ['guard:history']);
    const historyOut = JSON.parse(history.stdout);
    expect(historyOut.guards).toHaveLength(1);
    expect(historyOut.guards[0].type).toBe('security-scan');
    expect(historyOut.guards[0].status).toBe('failed');
  });

  it('coverage-gate checks real Istanbul report', () => {
    const cwd = tempDir();
    setupProject(cwd);
    mkdirSync(join(cwd, 'coverage'), { recursive: true });
    writeFileSync(join(cwd, 'coverage', 'coverage-summary.json'), JSON.stringify({
      total: {
        lines: { total: 100, covered: 90, skipped: 0, pct: 90 },
        statements: { total: 100, covered: 90, skipped: 0, pct: 90 },
        functions: { total: 50, covered: 45, skipped: 0, pct: 90 },
        branches: { total: 50, covered: 40, skipped: 0, pct: 80 },
      },
    }));

    const result = run(cwd, ['guard:coverage-check']);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.ok).toBe(true);
    expect(output.coverage.unit.value).toBe(90);
    expect(output.coverage.unit.target).toBe(80);
  });

  it('scenarios export/import round-trip', () => {
    const cwd = tempDir();
    setupProject(cwd);
    writeFileSync(join(cwd, '.forge', 'scenarios.json'), JSON.stringify({
      scenarios: [
        { id: 'S001', title: 'User can login', priority: 'P0' },
        { id: 'S002', title: 'User gets error on bad password', priority: 'P1' },
      ],
    }));

    // Export
    const exportResult = run(cwd, ['scenarios:export', '--feature', 'auth-module', '--template', 'auth-base']);
    expect(JSON.parse(exportResult.stdout).ok).toBe(true);

    // Clear current scenarios
    writeFileSync(join(cwd, '.forge', 'scenarios.json'), JSON.stringify({ scenarios: [] }));

    // Import
    const importResult = run(cwd, ['scenarios:import', '--template', 'auth-base']);
    const importOut = JSON.parse(importResult.stdout);
    expect(importOut.ok).toBe(true);
    expect(importOut.imported).toBe(2);

    // Verify
    const scenarios = JSON.parse(readFileSync(join(cwd, '.forge', 'scenarios.json'), 'utf8'));
    expect(scenarios.scenarios).toHaveLength(2);
  });

  it('status shows guard preview with countdown', () => {
    const cwd = tempDir();
    setupProject(cwd);

    const result = run(cwd, ['status']);
    const output = JSON.parse(result.stdout);

    expect(output.guard).toBeDefined();
    expect(output.guard.preview.security_scan_will_trigger).toBe(true);
  });
});
```

- [ ] **Step 2: Remove outdated phase2-stubs assertions**

In `cli/test/phase2-stubs.test.ts`, update or remove tests that checked for `unsupported: true` on:
- `guard:run --type security-scan` (now executes real scan)
- `guard:coverage-check` (now parses real reports)
- `scenarios:export` / `scenarios:import` (now require proper args)
- `test:gstack` when gstack enabled (now attempts real execution)

Keep tests that verify proper error handling (e.g., gstack unavailable when not installed).

- [ ] **Step 3: Build and run full test suite**

Run:

```powershell
cd cli
npm run build
npm test
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```powershell
git add cli/test/round2-integration.test.ts cli/test/phase2-stubs.test.ts
git commit -m "test: add round 2 integration tests and update stubs"
```

- [ ] **Step 5: Final verification commit**

```powershell
git add -A
git status
git commit -m "feat: complete forge v2 round 2 implementation" --allow-empty
```

---

## Summary

| Task | Module | Key Deliverable |
|------|--------|----------------|
| 1 | Guard: security-scan | Pattern-based secret/vuln scanner |
| 2 | Guard: dependency-audit | npm audit + license checker |
| 3 | Guard: coverage-gate | Istanbul JSON parser + threshold check |
| 4 | Guard CLI wiring | guard:run dispatcher + new commands |
| 5 | gstack: e2e | Playwright report parser + runner |
| 6 | gstack: visual | pixelmatch screenshot comparison |
| 7 | gstack: performance | Web Vitals collection + budget check |
| 8 | Monorepo | Workspace detection + multi-profile init |
| 9 | Scenarios | Template export/import system |
| 10 | Logger | JSONL structured logging + --log-file |
| 11 | Status | Guard preview with countdown |
| 12 | Integration | Full workflow tests + cleanup |
