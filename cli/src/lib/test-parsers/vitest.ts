import type { FrameworkParser, ParsedCounts, ParsedFailure } from "./types.js";
import { truncate } from "./types.js";

/**
 * Vitest / Jest output:
 *   "Tests: 3 passed, 1 failed, 4 total"
 *   "Tests:  1 failed, 2 passed, 3 total"
 *
 * Failure blocks:
 *   ✗ test name
 *     Error: message
 */
export const parseVitest: FrameworkParser = {
  counts(output: string): ParsedCounts | null {
    const match = output.match(/Tests:\s*(.+?)\s*total/i);
    if (!match) return null;

    const parts = match[1];
    const passedMatch = parts.match(/(\d+)\s*passed/i);
    const failedMatch = parts.match(/(\d+)\s*failed/i);
    const skippedMatch = parts.match(/(\d+)\s*(?:skipped|pending|todo)/i);

    return {
      passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
      failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
      skipped: skippedMatch ? parseInt(skippedMatch[1], 10) : 0,
    };
  },

  failures(output: string): ParsedFailure[] {
    const failures: ParsedFailure[] = [];
    const pattern = /[✗×●]\s*(.+)\n\s+(?:Error:\s*|AssertionError:\s*)?(.+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(output)) !== null) {
      if (failures.length >= 5) break;
      failures.push({
        test: match[1].trim(),
        error: truncate(match[2].trim(), 200),
      });
    }
    return failures;
  },
};
