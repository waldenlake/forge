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
import {
  envRestartCapability,
  readContextState,
  type ContextStateOk,
  type RestartMethod,
} from "../lib/context-state.js";
import {
  configPath,
  readConfig,
  type ContextManagementConfig,
  type ContextManagementStrategy,
} from "../state/config.js";
import { progressPath, readProgress } from "../state/progress.js";

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
const DEFAULT_MIN_TASKS_BETWEEN_HANDOFF = 1;
const HANDOFF_SIGNAL_TTL_MS = 30_000;

/** Path to the handoff metadata file (tracks last handoff for anti-loop). */
function handoffMetaPath(cwd: string): string {
  return join(cwd, ".forge", "handoff-meta.json");
}

/**
 * Path to the per-project handoff signal file. The platform hook scripts
 * (.forge/hooks/context-manager-*.sh, .opencode/plugins/forge.js) poll for
 * this file at agent-idle time and execute the restart sequence when it
 * appears. Written by `evaluateContextCheckpoint` when a handoff is decided.
 */
function handoffSignalPath(cwd: string): string {
  return join(cwd, ".forge", "handoff-signal.json");
}

function writeHandoffSignal(
  cwd: string,
  decision: { action: "handoff-session"; method: "in-place" | "new-window"; reason: string },
): void {
  const payload = {
    action: decision.action,
    method: decision.method,
    reason: decision.reason,
    written_at: new Date().toISOString(),
    ttl_ms: HANDOFF_SIGNAL_TTL_MS,
  };
  try {
    writeFileSync(handoffSignalPath(cwd), JSON.stringify(payload) + "\n", "utf8");
  } catch {
    // Non-fatal: hook scripts will simply not fire, falling back to the
    // suggest-compact path effectively when the LLM surfaces the action.
  }
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

function resolveSingleStrategy(
  strategy: ContextManagementStrategy,
  capability: RestartMethod | null,
): RestartMethod | "compact" | null {
  if (strategy === "off") return null;
  if (strategy === "prompt-compact") return "compact";
  if (strategy === "in-place-restart") return capability;
  if (strategy === "new-window" && capability === "new-window") return "new-window";
  return null;
}

export function resolveHandoffMethod(
  strategy: ContextManagementStrategy,
  fallback: ContextManagementStrategy,
  capability: RestartMethod | null,
): RestartMethod | "compact" {
  return (
    resolveSingleStrategy(strategy, capability) ??
    resolveSingleStrategy(fallback, capability) ??
    "compact"
  );
}

export function decideHandoff(
  state: ContextStateOk,
  config: ContextManagementConfig,
  threshold: number,
): ContextManagerDecision {
  if (config.enabled === false || config.strategy === "off") {
    return { action: "continue" };
  }

  if (state.usage_pct <= threshold) {
    return { action: "continue" };
  }

  const reason = `context usage ${Math.round(state.usage_pct * 100)}% exceeds threshold ${Math.round(threshold * 100)}%`;
  const method = resolveHandoffMethod(
    config.strategy ?? "in-place-restart",
    config.fallback ?? "prompt-compact",
    envRestartCapability(state.platform, state.terminal),
  );

  if (method === "compact") {
    return { action: "suggest-compact", reason };
  }

  return { action: "handoff-session", method, reason };
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
  const state = readContextState(cwd);
  if (!state.ok) return { action: "continue" };
  if (state.usage_pct <= threshold) return { action: "continue" };

  // Anti-loop: check if enough tasks completed since last handoff.
  // progress.json may be absent during early flow phases — treat that as
  // "no handoff needed" rather than failing.
  if (!existsSync(progressPath(cwd))) return { action: "continue" };

  let completedTasks = 0;
  try {
    completedTasks = readProgress(cwd).completed_tasks;
  } catch {
    return { action: "continue" };
  }

  if (!handoffAllowed(cwd, completedTasks, minTasks)) {
    return { action: "continue" };
  }

  const decision = decideHandoff(state, config, threshold);

  // Side effects on handoff: write signal file (for platform hooks) and
  // record the handoff event (for anti-loop counting on the next checkpoint).
  if (decision.action === "handoff-session") {
    writeHandoffSignal(cwd, decision);
    recordHandoffEvent(cwd, completedTasks);
  }

  return decision;
}
