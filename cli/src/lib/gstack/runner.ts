import { runE2e, type GstackE2eResult } from './e2e.js';
import { runVisual, type GstackVisualResult } from './visual.js';

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
      return runVisual(cwd, {
        updateBaseline: options.updateBaseline ?? false,
        compare: options.compare ?? true,
        threshold: options.threshold ?? 1.0,
      });
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
