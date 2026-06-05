import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectOptionalTool } from "./detect.js";

export type GstackResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number;
};

/**
 * Where gstack ships as an AI skill pack — a SKILL.md plus helper scripts
 * under ~/.claude/skills/gstack/. The pack drives the AI agent (Claude Code,
 * OpenCode) and is NOT a standalone CLI: there is no top-level `gstack`
 * binary, only `gstack-*` helper scripts under bin/. Forge's verify phase
 * spawns `gstack test --contract` etc., so the skill pack alone does NOT
 * make those verify steps runnable — the AI must invoke the skill manually.
 *
 * We surface this distinction so init / doctor / verify can give honest
 * messages instead of "missing" when the pack is installed.
 */
export type GstackAvailability = "cli" | "skill" | "none";

function gstackSkillPackPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return join(home, ".claude", "skills", "gstack", "SKILL.md");
}

/**
 * Detect how gstack is installed on this machine.
 *
 *   - "cli":   the `gstack` command resolves on PATH (verify can drive it).
 *   - "skill": the AI-skill pack lives at ~/.claude/skills/gstack/SKILL.md
 *              (CLI verify steps must be skipped; the AI must run them).
 *   - "none":  neither is present.
 *
 * "cli" wins when both are present — it is strictly more capable.
 */
export function detectGstack(): GstackAvailability {
  if (detectOptionalTool("gstack")) return "cli";
  if (existsSync(gstackSkillPackPath())) return "skill";
  return "none";
}

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
    shell: true,
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

/**
 * Returns true if gstack is available **as a CLI** on PATH.
 *
 * Skill-pack installs (~/.claude/skills/gstack/) return false here because
 * they cannot be driven by the verify subprocess pipeline — use
 * `detectGstack()` when you need to distinguish skill-pack from absent.
 */
export function isGstackInstalled(): boolean {
  return detectOptionalTool("gstack");
}

function runGstack(cwd: string, args: string[]): GstackResult {
  const result = spawnSync("gstack", args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    shell: true,
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
