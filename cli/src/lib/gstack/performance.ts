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
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const { lcp_ms, fid_ms, cls, ttfb_ms } = obj;

    if (
      typeof lcp_ms !== 'number' ||
      typeof fid_ms !== 'number' ||
      typeof cls !== 'number' ||
      typeof ttfb_ms !== 'number'
    ) {
      return null;
    }

    return { lcp_ms, fid_ms, cls, ttfb_ms };
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
    const value = (metrics as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number' && value > limit) {
      violations.push(key);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function runPerformance(cwd: string): GstackPerformanceResult {
  const command = 'npx playwright test --reporter=json --grep=@webvitals';
  const result = runShellCommand(cwd, '.', command);

  if (result.stderr || !result.stdout) {
    return {
      ok: false,
      type: 'performance',
      metrics: null,
      budgets: {},
      violations: [],
      error: result.stderr || 'Playwright execution failed or produced no output',
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
      error: 'Failed to parse Web Vitals from Playwright output',
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
