import { existsSync, readFileSync } from "node:fs";
import { configPath } from "./config.js";
import type { ForgeProgress } from "./progress.js";
import { idleProgress, progressPath, readProgress } from "./progress.js";

export function readRawConfigVersion(cwd: string): string | null {
  const raw = JSON.parse(readFileSync(configPath(cwd), "utf8")) as {
    version?: unknown;
  };

  return typeof raw.version === "string" ? raw.version : null;
}

export function readProgressLoose(cwd: string):
  | { ok: true; progress: ForgeProgress }
  | { ok: false; error: string; raw_status: string | null } {
  if (!existsSync(progressPath(cwd))) {
    return { ok: true, progress: idleProgress() };
  }

  // First read raw JSON to capture pre-validation status; this lets us tell
  // the user what stale state they are sitting on (e.g. "verification_complete"
  // from a pre-Phase-1 progress.json) without blowing up on schema validation.
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(progressPath(cwd), "utf8"));
  } catch (e) {
    return { ok: false, error: `progress.json parse error: ${(e as Error).message}`, raw_status: null };
  }

  const rawStatus =
    raw && typeof raw === "object" && typeof (raw as { status?: unknown }).status === "string"
      ? ((raw as { status: string }).status)
      : null;

  try {
    return { ok: true, progress: readProgress(cwd) };
  } catch (e) {
    return { ok: false, error: (e as Error).message, raw_status: rawStatus };
  }
}
