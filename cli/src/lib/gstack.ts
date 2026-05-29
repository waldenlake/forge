import { spawnSync } from "node:child_process";
import { detectOptionalTool } from "./detect.js";

export type GstackResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number;
};

/**
 * Returns the installed gstack version string, or null if not found.
 */
export function gstackVersion(): string | null {
  if (!detectOptionalTool("gstack")) {
    return null;
  }

  const result = spawnSync("gstack", ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

/**
 * Returns true if gstack is available on PATH.
 */
export function isGstackInstalled(): boolean {
  return detectOptionalTool("gstack");
}

function runGstack(cwd: string, args: string[]): GstackResult {
  const result = spawnSync("gstack", args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
  });

  const status = result.status ?? 1;
  return {
    ok: status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr || result.error?.message || "",
    status,
  };
}

/** Contract tests — verify interface correctness. */
export function gstackContract(cwd: string): GstackResult {
  return runGstack(cwd, ["test", "--contract"]);
}

/** Smoke tests — basic functional validation. */
export function gstackSmoke(cwd: string): GstackResult {
  return runGstack(cwd, ["test", "--smoke"]);
}

/** End-to-end tests (requires full gstack setup). */
export function gstackE2E(cwd: string): GstackResult {
  return runGstack(cwd, ["test", "--e2e"]);
}

/** Visual regression tests (requires full gstack setup). */
export function gstackVisual(cwd: string): GstackResult {
  return runGstack(cwd, ["test", "--visual"]);
}

/** Performance regression tests (requires full gstack setup). */
export function gstackPerformance(cwd: string): GstackResult {
  return runGstack(cwd, ["test", "--performance"]);
}
