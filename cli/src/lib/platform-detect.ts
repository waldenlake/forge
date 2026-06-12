/**
 * Platform and terminal capability detection for forge context management.
 *
 * Detects:
 * 1. Which AI coding platform is running (OpenCode, Claude Code, Codex, unknown)
 * 2. Which terminal multiplexer (if any) wraps the session, and whether it
 *    supports "in-place" send-input for session restart (chain A).
 *
 * All detection is environment-variable, process-ancestry, or
 * command-presence based — deterministic, no AI self-report. Env vars are
 * tried first; when they are absent (command run outside the host's spawned
 * subprocess tree, or a sanitised shell), detection falls back to walking the
 * real parent-process chain, which cannot be stripped.
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
 * 1. OpenCode worker env markers → "opencode"
 *      OpenCode sets these in every subprocess it spawns (empirically
 *      confirmed on the npm `opencode-ai` build):
 *        OPENCODE=1, OPENCODE_PID, OPENCODE_RUN_ID, OPENCODE_PROCESS_ROLE.
 *      The legacy OPENCODE_HOME / OPENCODE_SESSION_ID are kept as a fallback
 *      for other/older builds but are not set by current OpenCode.
 * 2. CLAUDE_PLUGIN_ROOT non-empty / CLAUDE_CODE_ENTRY → "claude-code"
 * 3. CODEX_CLI / CODEX_HOME → "codex"
 * 4. Otherwise → "unknown"
 *
 * IMPORTANT: only use env vars the HOST sets to mark its own subprocesses.
 * Do NOT key off provider credentials like ANTHROPIC_AUTH_TOKEN or
 * GEMINI_API_KEY — those are user-configured and present regardless of host,
 * so they are false signals for platform identity.
 *
 * An explicit `--platform` CLI flag (if provided by the caller) should
 * override this function entirely.
 */
export function detectPlatform(env?: NodeJS.ProcessEnv): Platform {
  const e = env ?? process.env;

  // OpenCode: worker subprocesses carry OPENCODE_* markers set by the host.
  // OPENCODE_RUN_ID / OPENCODE_PID are unique to OpenCode; OPENCODE === "1"
  // is the explicit flag. OPENCODE_HOME / OPENCODE_SESSION_ID are legacy
  // fallbacks for builds that may set those instead.
  if (
    e.OPENCODE === "1" ||
    e.OPENCODE_RUN_ID ||
    e.OPENCODE_PID ||
    e.OPENCODE_HOME ||
    e.OPENCODE_SESSION_ID
  ) {
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

  // Env vars did not identify the host. They are an unreliable signal: a
  // command typed in a separate pane, or run through a shell tool that
  // sanitises the environment, may not inherit OPENCODE_*/CLAUDE_* at all.
  // Fall back to walking the real process-ancestry chain, which exists
  // regardless of env propagation (this process IS a descendant of the host).
  // Skip the ancestry probe when an explicit env object was passed (unit
  // tests) or FORGE_PLATFORM_PROBE=off is set so integration tests can stay
  // hermetic and avoid expensive OS process-table probes.
  if (env === undefined && e.FORGE_PLATFORM_PROBE !== "off") {
    const byAncestry = detectPlatformByAncestry();
    if (byAncestry !== "unknown") return byAncestry;
  }

  return "unknown";
}

/**
 * Walk the parent-process chain from this process up to the root, matching
 * each ancestor's executable name against known host binaries. Deterministic
 * and independent of environment-variable inheritance.
 *
 * Returns the first host platform found walking upward, or "unknown" if none
 * matches (or the OS probe fails).
 */
export function detectPlatformByAncestry(): Platform {
  const table = readProcessTable();
  if (!table) return "unknown";

  let pid = process.pid;
  // Bound the walk; process trees are shallow and a cycle (shouldn't happen)
  // would otherwise loop forever.
  for (let depth = 0; depth < 32; depth++) {
    const entry = table.get(pid);
    if (!entry) break;
    const platform = platformFromProcessName(entry.name);
    if (platform !== "unknown") return platform;
    if (entry.ppid === pid || entry.ppid === 0) break;
    pid = entry.ppid;
  }
  return "unknown";
}

/**
 * Map an executable/process name to a platform. Case-insensitive substring
 * match against the known host binaries. Extension (.exe) is tolerated.
 */
function platformFromProcessName(name: string): Platform {
  const n = name.toLowerCase();
  if (n.includes("opencode")) return "opencode";
  // "claude" matches claude.exe / claude (Claude Code CLI). Guard against
  // matching unrelated names by requiring the word boundary-ish "claude".
  if (n.includes("claude")) return "claude-code";
  if (n.includes("codex")) return "codex";
  return "unknown";
}

type ProcEntry = { name: string; ppid: number };

/**
 * Build a pid → {name, ppid} table for the whole process list. Returns null
 * if the OS probe fails. One subprocess call; the doctor/context checkpoint
 * runs infrequently so the cost is acceptable.
 */
function readProcessTable(): Map<number, ProcEntry> | null {
  if (process.platform === "win32") {
    return readProcessTableWindows();
  }
  return readProcessTableUnix();
}

/**
 * Windows: use PowerShell CIM to list ProcessId, ParentProcessId, Name as CSV.
 * (wmic is deprecated/removed on newer Windows; CIM is the supported path.)
 */
function readProcessTableWindows(): Map<number, ProcEntry> | null {
  const cmd =
    "Get-CimInstance Win32_Process | " +
    "ForEach-Object { \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)\" }";
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", cmd],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  if (result.status !== 0 || !result.stdout) return null;

  const table = new Map<number, ProcEntry>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const pid = parseInt(parts[0], 10);
    const ppid = parseInt(parts[1], 10);
    const name = parts[2].trim();
    if (Number.isFinite(pid)) {
      table.set(pid, { name, ppid: Number.isFinite(ppid) ? ppid : 0 });
    }
  }
  return table.size > 0 ? table : null;
}

/**
 * Unix: `ps -axo pid=,ppid=,comm=` lists every process. comm is the executable
 * basename, which is what we match against.
 */
function readProcessTableUnix(): Map<number, ProcEntry> | null {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,comm="], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0 || !result.stdout) return null;

  const table = new Map<number, ProcEntry>();
  for (const line of result.stdout.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    const pid = parseInt(m[1], 10);
    const ppid = parseInt(m[2], 10);
    const name = m[3].trim();
    if (Number.isFinite(pid)) {
      table.set(pid, { name, ppid: Number.isFinite(ppid) ? ppid : 0 });
    }
  }
  return table.size > 0 ? table : null;
}

/**
 * Detect terminal multiplexer capability.
 *
 * Priority:
 * 1. $TMUX set → tmux (supports in-place via send-keys)
 * 2. `wezterm` command exists → wezterm (supports in-place via cli send-text)
 * 3. $WT_SESSION set → Windows Terminal (no send-input, microsoft/terminal#9368)
 * 4. Otherwise → bare (no multiplexer)
 *
 * The wezterm command-existence probe is suppressed when:
 *   - `env` is an explicit object (i.e. unit tests pass {} or partial env)
 *   - or env.FORGE_TERMINAL_PROBE === "off" (used by integration tests that
 *     spawn the CLI as a subprocess; the subprocess inherits process.env so
 *     unit-test convention #1 doesn't apply)
 *
 * Both escape hatches prevent false positives on systems that have
 * wezterm.exe on PATH but aren't actually running it.
 */
export function detectTerminalCapability(
  env?: NodeJS.ProcessEnv,
): TerminalCapability {
  const useRealEnv = env === undefined;
  const e = env ?? process.env;

  // tmux: always supports send-keys to current pane
  if (e.TMUX) {
    return { kind: "tmux", supports_in_place: true };
  }

  // WezTerm: check env var first (faster), fall back to command probe.
  if (e.WEZTERM_PANE || e.WEZTERM_EXECUTABLE) {
    return { kind: "wezterm", supports_in_place: true };
  }
  const probeAllowed = useRealEnv && e.FORGE_TERMINAL_PROBE !== "off";
  if (probeAllowed && commandExists("wezterm")) {
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
