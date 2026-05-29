import { spawnSync } from "node:child_process";
import { detectOptionalTool } from "./detect.js";

export type GitNexusResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number;
};

/**
 * Returns the installed gitnexus version string, or null if not found.
 */
export function gitNexusVersion(): string | null {
  if (!detectOptionalTool("gitnexus")) {
    return null;
  }

  const result = spawnSync("gitnexus", ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

/**
 * Returns true if gitnexus is available on PATH.
 */
export function isGitNexusInstalled(): boolean {
  return detectOptionalTool("gitnexus");
}

/**
 * Run `gitnexus index` (full baseline) in the given directory.
 */
export function gitNexusBaseline(cwd: string): GitNexusResult {
  return runGitNexus(cwd, ["index"]);
}

/**
 * Run `gitnexus index --update` (incremental) in the given directory.
 */
export function gitNexusUpdate(cwd: string): GitNexusResult {
  return runGitNexus(cwd, ["index", "--update"]);
}

function runGitNexus(cwd: string, args: string[]): GitNexusResult {
  const result = spawnSync("gitnexus", args, {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
  });

  const status = result.status ?? 1;
  return {
    ok: status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr || result.error?.message || "",
    status,
  };
}
