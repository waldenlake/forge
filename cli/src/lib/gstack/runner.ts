import { runE2e, type GstackE2eResult } from './e2e.js';

// These will be implemented in Tasks 6 and 7
// For now, define the types and stub functions here
export type GstackVisualResult = {
  ok: boolean;
  type: 'visual';
  regressions: Array<{ component: string; diff_percent: number; baseline: string; current: string; diff: string }>;
  threshold: number;
  screenshots_dir: string;
};

export type GstackPerformanceResult = {
  ok: boolean;
  type: 'performance';
  metrics: { lcp_ms: number; fid_ms: number; cls: number; ttfb_ms: number } | null;
  budgets: Record<string, number>;
  violations: string[];
  error?: string;
};

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
      return {
        ok: false,
        type: 'visual',
        regressions: [],
        threshold: options.threshold ?? 1.0,
        screenshots_dir: '',
      } satisfies GstackVisualResult;
    case 'performance':
      return {
        ok: false,
        type: 'performance',
        metrics: null,
        budgets: {},
        violations: [],
        error: 'Performance module not yet implemented',
      } satisfies GstackPerformanceResult;
  }
}
