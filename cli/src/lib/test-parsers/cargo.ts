import type { FrameworkParser, ParsedCounts, ParsedFailure } from "./types.js";

/**
 * cargo test summary line:
 *   test result: ok. 3 passed; 1 failed; 0 ignored
 */
export const parseCargo: FrameworkParser = {
  counts(output: string): ParsedCounts | null {
    const match = output.match(
      /test result:.*?(\d+)\s*passed.*?(\d+)\s*failed.*?(\d+)\s*ignored/i,
    );
    if (!match) return null;

    return {
      passed: parseInt(match[1], 10),
      failed: parseInt(match[2], 10),
      skipped: parseInt(match[3], 10),
    };
  },

  failures(_output: string): ParsedFailure[] {
    // Cargo failure parsing not yet implemented; full output remains in report.
    return [];
  },
};
