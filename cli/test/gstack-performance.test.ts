import { describe, expect, test } from 'vitest';
import {
  checkBudgets,
  parseWebVitals,
} from '../src/lib/gstack/performance.js';

describe('parseWebVitals', () => {
  test('extracts all 4 metrics from valid JSON', () => {
    const json = JSON.stringify({
      lcp_ms: 2500,
      fid_ms: 100,
      cls: 0.1,
      ttfb_ms: 600,
    });
    const result = parseWebVitals(json);
    expect(result).toEqual({
      lcp_ms: 2500,
      fid_ms: 100,
      cls: 0.1,
      ttfb_ms: 600,
    });
  });

  test('returns null for invalid JSON', () => {
    expect(parseWebVitals('not json at all')).toBeNull();
    expect(parseWebVitals('')).toBeNull();
    expect(parseWebVitals('{broken')).toBeNull();
  });

  test('returns null when any required field is missing', () => {
    // Only one field present — missing fid_ms, cls, ttfb_ms
    expect(parseWebVitals(JSON.stringify({ lcp_ms: 100 }))).toBeNull();
    // Missing cls and ttfb_ms
    expect(
      parseWebVitals(JSON.stringify({ lcp_ms: 100, fid_ms: 50 })),
    ).toBeNull();
    // All present but one is not a number
    expect(
      parseWebVitals(
        JSON.stringify({ lcp_ms: 100, fid_ms: 50, cls: 'bad', ttfb_ms: 200 }),
      ),
    ).toBeNull();
    // Empty object
    expect(parseWebVitals(JSON.stringify({}))).toBeNull();
  });
});

describe('checkBudgets', () => {
  const vitals = { lcp_ms: 2500, fid_ms: 100, cls: 0.1, ttfb_ms: 600 };

  test('passes when all metrics are within budget', () => {
    const result = checkBudgets(vitals, {
      lcp_ms: 3000,
      fid_ms: 200,
      cls: 0.25,
      ttfb_ms: 800,
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test('fails when metrics exceed budget and returns correct violation keys', () => {
    const result = checkBudgets(vitals, {
      lcp_ms: 2000, // 2500 > 2000 — violation
      fid_ms: 200,  // 100 <= 200 — ok
      cls: 0.05,    // 0.1 > 0.05 — violation
      ttfb_ms: 800, // 600 <= 800 — ok
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toContain('lcp_ms');
    expect(result.violations).toContain('cls');
    expect(result.violations).not.toContain('fid_ms');
    expect(result.violations).not.toContain('ttfb_ms');
    expect(result.violations).toHaveLength(2);
  });

  test('returns ok=true for empty budgets', () => {
    const result = checkBudgets(vitals, {});
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
