import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Returns an ISO timestamp safe for use in filenames (colons replaced with `-`).
 */
export function safeIsoForFilename(): string {
  return new Date().toISOString().replace(/:/g, "-");
}

/**
 * Writes a report file under <cwd>/.forge/reports/, creating the directory if
 * needed. Returns the relative path with forward slashes (cross-platform).
 *
 * The forward-slash convention matches the spec and lets consumers (skills,
 * hooks, tests) match `report_path` with `/` regardless of host OS.
 */
export function writeReportFile(
  cwd: string,
  filename: string,
  contents: string,
): string {
  const reportsDir = join(cwd, ".forge", "reports");
  mkdirSync(reportsDir, { recursive: true });

  const relativePath = `.forge/reports/${filename}`;
  writeFileSync(join(cwd, relativePath), contents, "utf8");
  return relativePath;
}
