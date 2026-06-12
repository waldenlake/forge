/**
 * Context-state sensing layer — the single source of "what is the current
 * context usage" for the whole CLI.
 *
 * Before this module existed, three call sites (the `context:usage` command,
 * the context-manager checkpoint, and the environment snapshot) each
 * re-implemented: opencode DB path resolution, platform→reader dispatch, and
 * window/usage math. That triplication let thresholds and method logic drift.
 *
 * This module centralises the SENSING half (read usage + size the window +
 * detect terminal). Policy (should we hand off, and how) lives in the
 * context-manager; presentation (JSON advice) lives in the context command.
 *
 * Design doc: docs/environment-report.md (same Sense → Decide → Act split).
 */

import { join } from "node:path";
import { readClaudeUsage } from "./context-readers/claude.js";
import { readOpencodeUsage } from "./context-readers/opencode.js";
import { resolveWindowSize } from "./context-window.js";
import {
  detectPlatform,
  detectTerminalCapability,
  type Platform,
  type TerminalCapability,
} from "./platform-detect.js";

/** A session-restart method the environment can perform. */
export type RestartMethod = "in-place" | "new-window";

export type ContextStateOk = {
  ok: true;
  platform: "opencode" | "claude-code";
  session_id: string;
  model: string | null;
  total_context: number;
  window_size: number;
  /** total_context / window_size (raw, unrounded). */
  usage_pct: number;
  source: string;
  terminal: TerminalCapability;
};

export type ContextStateErr = {
  ok: false;
  platform: Platform;
  /** "unsupported_platform" or a reader-specific failure reason. */
  reason: string;
  terminal: TerminalCapability;
};

export type ContextState = ContextStateOk | ContextStateErr;

export type ReadContextStateOptions = {
  /** Override platform auto-detection (mirrors --platform). */
  platformOverride?: string;
  /** Explicit session id passed to the reader. */
  sessionId?: string;
};

/**
 * Resolve the OpenCode SQLite DB path. Single definition; importers must not
 * re-derive it.
 *
 * OpenCode stores its data under the XDG data home on ALL platforms — including
 * Windows, where it uses `%USERPROFILE%\.local\share\opencode\` (NOT
 * %LOCALAPPDATA%). Honor XDG_DATA_HOME when set.
 */
export function opencodeDbPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const dataHome = process.env.XDG_DATA_HOME ?? join(home, ".local", "share");
  return join(dataHome, "opencode", "opencode.db");
}

/**
 * The best session-restart method the environment natively supports:
 *   - opencode            → in-place (SDK session.new)
 *   - tmux / wezterm      → in-place (send-keys / cli send-text)
 *   - Windows Terminal    → new-window (no in-place send-input)
 *   - bare terminal       → null (no restart possible; only manual /compact)
 *
 * This is CAPABILITY, not user preference. Policy (strategy/fallback) is
 * applied on top of this by the context-manager.
 */
export function envRestartCapability(
  platform: Platform,
  terminal: TerminalCapability,
): RestartMethod | null {
  if (platform === "opencode") return "in-place";
  if (terminal.supports_in_place) return "in-place";
  if (terminal.kind === "wt") return "new-window";
  return null;
}

/**
 * Read the current context state: detect platform + terminal, dispatch to the
 * right reader, size the window from the reported model, compute usage_pct.
 *
 * Returns ok:false (never throws) for unsupported platforms or reader
 * failures, always carrying the detected terminal so callers can still reason
 * about restart capability.
 */
export function readContextState(
  cwd: string,
  opts: ReadContextStateOptions = {},
): ContextState {
  const platform: Platform = opts.platformOverride
    ? (opts.platformOverride as Platform)
    : detectPlatform();
  const terminal = detectTerminalCapability();

  if (platform === "codex" || platform === "unknown") {
    return { ok: false, platform, reason: "unsupported_platform", terminal };
  }

  const result =
    platform === "opencode"
      ? readOpencodeUsage(opencodeDbPath(), cwd, opts.sessionId)
      : readClaudeUsage(cwd, opts.sessionId);

  if (!result.ok) {
    return { ok: false, platform, reason: result.reason, terminal };
  }

  return buildOkState(platform, result, terminal);
}

/**
 * Assemble a ContextStateOk from a successful reader result. Sizes the window
 * from the model id the reader reported.
 */
function buildOkState(
  platform: "opencode" | "claude-code",
  result: { session_id: string; model: string | null; total_context: number; source: string },
  terminal: TerminalCapability,
): ContextStateOk {
  const window_size = resolveWindowSize(result.model);
  return {
    ok: true,
    platform,
    session_id: result.session_id,
    model: result.model,
    total_context: result.total_context,
    window_size,
    usage_pct: result.total_context / window_size,
    source: result.source,
    terminal,
  };
}
