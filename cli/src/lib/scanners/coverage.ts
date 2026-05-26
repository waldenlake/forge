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
