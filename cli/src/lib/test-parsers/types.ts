export type ParsedCounts = {
  passed: number;
  failed: number;
  skipped: number;
};

export type ParsedFailure = {
  test: string;
  error: string;
};

export type FrameworkParser = {
  /** Returns counts if this framework's output is detected, else null */
  counts(output: string): ParsedCounts | null;
  /** Returns failure entries (may be empty) */
  failures(output: string): ParsedFailure[];
};

export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max);
}
