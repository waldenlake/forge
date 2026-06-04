import type { FrameworkParser, ParsedCounts, ParsedFailure } from "./types.js";

/**
 * pytest summary line:
 *   ====== 3 passed, 1 failed, 2 skipped in 1.23s ======
 */
export const parsePytest: FrameworkParser = {
  counts(output: string): ParsedCounts | null {
    const match = output.match(/=+\s*([\d\w\s,]+)\s*in\s+[\d.]+s?\s*=+/);
    if (!match) return null;

    const parts = match[1];
    const passedMatch = parts.match(/(\d+)\s*passed/i);
    const failedMatch = parts.match(/(\d+)\s*failed/i);
    const skippedMatch = parts.match(/(\d+)\s*skipped/i);

    if (!passedMatch && !failedMatch && !skippedMatch) return null;

    return {
      passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
      failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
      skipped: skippedMatch ? parseInt(skippedMatch[1], 10) : 0,
    };
  },

  failures(_output: string): ParsedFailure[] {
    // Pytest failure parsing not yet implemented; full output remains in report.
    return [];
  },
};
