import { parseVitest } from "./vitest.js";
import { parsePytest } from "./pytest.js";
import { parseCargo } from "./cargo.js";
import type { ParsedCounts, ParsedFailure } from "./types.js";

export type { ParsedCounts, ParsedFailure } from "./types.js";

const PARSERS = [parseVitest, parsePytest, parseCargo];

/**
 * Parses test counts from output, trying each framework parser in order.
 * Returns zero counts if no parser matches.
 */
export function parseTestCounts(output: string): ParsedCounts {
  for (const parser of PARSERS) {
    const counts = parser.counts(output);
    if (counts) return counts;
  }
  return { passed: 0, failed: 0, skipped: 0 };
}

/**
 * Extracts up to 5 failures from output, trying each framework parser.
 * Each failure's error is truncated to 200 chars.
 */
export function parseFailures(output: string): ParsedFailure[] {
  for (const parser of PARSERS) {
    const failures = parser.failures(output);
    if (failures.length > 0) return failures.slice(0, 5);
  }
  return [];
}
