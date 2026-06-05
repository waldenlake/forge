/**
 * Context-manager plugin — the pluggable layer that combines context:usage
 * readings with terminal capability detection to make session handoff decisions.
 *
 * This plugin is intentionally stateless: all state is read from
 * progress.json / handoff.md / context:usage output. It can be toggled via
 * `config.context_management.enabled`.
 *
 * When enabled=false (or the config section is absent), all methods are
 * no-ops, ensuring the forge core behaves identically to pre-plugin state.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readClaudeUsage } from "../lib/context-readers/claude.js";
import { readOpencodeUsage } from "../lib/context-readers/opencode.js";
import {
  detectPlatform,
  detectTerminalCapability,
  type Platform,
} from "../lib/platform-detect.js";
import { configPath, readConfig, type ContextManagementConfig } from "../state/config.js";

export type ContextManagerDecision =
  | { action: "continue" }
  | {
      action: "handoff-session";
      method: "in-place" | "new-window";
      reason: string;
    }
  | {
      action: "suggest-compact";
      reason: string;
    };

const DEFAULT_THRESHOLD_PCT = 0.50;
const DEFAULT_WINDOW_SIZE = 200_000;
const DEFAULT_MIN_TASKS_BETWEEN_HANDOFF = 1;

/** Path to the handoff metadata file (tracks last handoff for anti-loop). */
function handoffMetaPath(cwd: string): string {
  return join(cwd, ".forge", "handoff-meta.json");
}

type HandoffMeta = {
  last_handoff_completed_tasks: number;
};

function readHandoffMeta(cwd: string): HandoffMeta | null {
  const metaPath = handoffMetaPath(cwd);
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Record that a handoff was issued at the current completed_tasks count.
 * Called by the run-loop when it acts on a handoff-session decision.
 */
export function recordHandoffEvent(cwd: string, completedTasks: number): void {
  const metaPath = handoffMetaPath(cwd);
  writeFileSync(
    metaPath,
    JSON.stringify({ last_handoff_completed_tasks: completedTasks } satisfies HandoffMeta) + "\n",
    "utf8",
  );
}

/**
 * Check if enough tasks have completed since the last handoff to allow
 * another one. Returns true if a handoff is allowed.
 */
function handoffAllowed(
  cwd: string,
  currentCompletedTasks: number,
  minTasks: number,
): boolean {
  const meta = readHandoffMeta(cwd);
  if (!meta) return true; // No prior handoff recorded
  return currentCompletedTasks >= meta.last_handoff_completed_tasks + minTasks;
}

/**
 * Read the context_management config, returning null if disabled or missing.
 */
export function loadContextManagerConfig(
  cwd: string,
): ContextManagementConfig | null {
  try {
    if (!existsSync(configPath(cwd))) return null;
    const config = readConfig(cwd);
    const cm = config.context_management;
    if (!cm || cm.enabled === false) return null;
    return cm;
  } catch {
    return null;
  }
}

/**
 * Check if the context-manager plugin is enabled for the given project.
 * Returns false if config is missing, malformed, or explicitly disabled.
 */
export function isContextManagerEnabled(cwd: string): boolean {
  return loadContextManagerConfig(cwd) !== null;
}

/**
 * Resolve the OpenCode DB path.
 */
function opencodeDbPath(): string {
  if (process.platform === "win32") {
    const appData = process.env.LOCALAPPDATA ?? join(
      process.env.USERPROFILE ?? "",
      "AppData",
      "Local",
    );
    return join(appData, "opencode", "opencode.db");
  }
  const home = process.env.HOME ?? "";
  return join(home, ".local", "share", "opencode", "opencode.db");
}

/**
 * Evaluate whether a session handoff is needed at this checkpoint.
 * Called inline by next-action after task:done completes.
 *
 * Returns a decision: continue, handoff-session, or suggest-compact.
 * Returns { action: "continue" } if the plugin is disabled, context is
 * below threshold, reading fails, or anti-loop guard fires.
 */
export function evaluateContextCheckpoint(cwd: string): ContextManagerDecision {
  const config = loadContextManagerConfig(cwd);
  if (!config) return { action: "continue" };

  const threshold = config.threshold_pct ?? DEFAULT_THRESHOLD_PCT;
  const minTasks = config.min_tasks_between_handoff ?? DEFAULT_MIN_TASKS_BETWEEN_HANDOFF;
  const platform = detectPlatform();

  // Read context usage
  let totalContext: number;
  if (platform === "opencode") {
    const result = readOpencodeUsage(opencodeDbPath(), cwd);
    if (!result.ok) return { action: "continue" };
    totalContext = result.total_context;
  } else if (platform === "claude-code") {
    const result = readClaudeUsage(cwd);
    if (!result.ok) return { action: "continue" };
    totalContext = result.total_context;
  } else {
    return { action: "continue" };
  }

  const usagePct = totalContext / DEFAULT_WINDOW_SIZE;
  if (usagePct <= threshold) return { action: "continue" };

  // Anti-loop: check if enough tasks completed since last handoff
  // Read completed_tasks from progress.json
  let completedTasks = 0;
  try {
    const { readProgress } = require("../state/progress.js");
    const progress = readProgress(cwd);
    completedTasks = progress.completed_tasks;
  } catch {
    return { action: "continue" };
  }

  if (!handoffAllowed(cwd, completedTasks, minTasks)) {
    return { action: "continue" };
  }

  // Over threshold — determine method
  const terminal = detectTerminalCapability();
  const reason = `context usage ${Math.round(usagePct * 100)}% exceeds threshold ${Math.round(threshold * 100)}%`;

  if (platform === "opencode" || terminal.supports_in_place) {
    return { action: "handoff-session", method: "in-place", reason };
  }
  if (terminal.kind === "wt") {
    return { action: "handoff-session", method: "new-window", reason };
  }

  return { action: "suggest-compact", reason };
}
