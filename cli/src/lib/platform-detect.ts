/**
 * Platform and terminal capability detection for forge context management.
 *
 * Detects:
 * 1. Which AI coding platform is running (OpenCode, Claude Code, Codex, unknown)
 * 2. Which terminal multiplexer (if any) wraps the session, and whether it
 *    supports "in-place" send-input for session restart (chain A).
 *
 * All detection is environment-variable or command-presence based —
 * deterministic, no AI self-report.
 */

import { spawnSync } from "node:child_process";

export type Platform = "opencode" | "claude-code" | "codex" | "unknown";

export type TerminalKind = "tmux" | "wezterm" | "wt" | "bare";

export type TerminalCapability = {
  kind: TerminalKind;
  /** Whether the terminal supports in-place session restart (send-keys / SDK). */
  supports_in_place: boolean;
};

/**
 * Environment variable priority for platform detection (checked in order):
 *
 * 1. OPENCODE_* env vars or presence of opencode plugin root → "opencode"
 * 2. CLAUDE_PLUGIN_ROOT non-empty → "claude-code"
 * 3. CODEX_CLI env var → "codex"
 * 4. Otherwise → "unknown"
 *
 * An explicit `--platform` CLI flag (if provided by the caller) should
 * override this function entirely.
 */
export function detectPlatform(env?: NodeJS.ProcessEnv): Platform {
  const e = env ?? process.env;

  // OpenCode: sets OPENCODE_HOME or the plugin runs inside .config/opencode/
  if (e.OPENCODE_HOME || e.OPENCODE_SESSION_ID) {
    return "opencode";
  }

  // Claude Code: sets CLAUDE_PLUGIN_ROOT when running as a plugin, or
  // presence of CLAUDE_CODE_ENTRY indicates the process is inside Claude Code.
  if (e.CLAUDE_PLUGIN_ROOT && e.CLAUDE_PLUGIN_ROOT.length > 0) {
    return "claude-code";
  }
  if (e.CLAUDE_CODE_ENTRY) {
    return "claude-code";
  }

  // Codex CLI
  if (e.CODEX_CLI || e.CODEX_HOME) {
    return "codex";
  }

  return "unknown";
}

/**
 * Detect terminal multiplexer capability.
 *
 * Priority:
 * 1. $TMUX set → tmux (supports in-place via send-keys)
 * 2. `wezterm` command exists → wezterm (supports in-place via cli send-text)
 * 3. $WT_SESSION set → Windows Terminal (no send-input, microsoft/terminal#9368)
 * 4. Otherwise → bare (no multiplexer)
 */
export function detectTerminalCapability(
  env?: NodeJS.ProcessEnv,
): TerminalCapability {
  const e = env ?? process.env;

  // tmux: always supports send-keys to current pane
  if (e.TMUX) {
    return { kind: "tmux", supports_in_place: true };
  }

  // WezTerm: check env var first (faster), fall back to command probe
  if (e.WEZTERM_PANE || e.WEZTERM_EXECUTABLE) {
    return { kind: "wezterm", supports_in_place: true };
  }
  if (commandExists("wezterm")) {
    return { kind: "wezterm", supports_in_place: true };
  }

  // Windows Terminal: $WT_SESSION exists but send-input is not supported
  if (e.WT_SESSION) {
    return { kind: "wt", supports_in_place: false };
  }

  return { kind: "bare", supports_in_place: false };
}

/**
 * Check if a command exists on PATH (cross-platform).
 */
function commandExists(cmd: string): boolean {
  const which = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(which, [cmd], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result.status === 0;
}
