/**
 * Environment Snapshot — the single source of truth for environment detection.
 *
 * This is the ACQUISITION layer. It runs every detector exactly once and
 * retains the FULL raw results (complete test_profiles objects, the raw
 * MonorepoDetectResult, the raw ContextReadResult, etc.) without trimming.
 *
 * Two pure projection functions consume a snapshot:
 *   - toEnvironmentReport(snapshot)  → display view  (lib/environment-report.ts)
 *   - snapshotToConfig(snapshot)     → persisted ForgeConfig (this file)
 *
 * Because a snapshot is the only thing that performs IO / subprocess work,
 * callers that need both a config AND a report (i.e. `forge init`) acquire
 * once and project twice — detection never runs twice, and the two outputs
 * are guaranteed consistent.
 *
 * Design doc: docs/environment-report.md
 *
 * Execution order (low → high cost):
 *   1. Env-var reads   — detectPlatform, detectTerminalCapability
 *   2. File-system IO  — detectProjectType, detectMemoryFile, detectTestProfiles,
 *                        detectMonorepoProfiles, detectBuildCommand
 *   3. Subprocess      — detectOptionalTool (git), isGitNexusInstalled, detectGstack
 *   4. Context read    — readClaudeUsage / readOpencodeUsage
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectBuildCommand, type BuildCommand } from "./buildCheck.js";
import { readClaudeUsage } from "./context-readers/claude.js";
import { readOpencodeUsage } from "./context-readers/opencode.js";
import {
  detectMemoryFile,
  detectMonorepoProfiles,
  detectOptionalTool,
  detectProjectType,
  detectTestProfiles,
  type MonorepoDetectResult,
} from "./detect.js";
import { isGitNexusInstalled } from "./gitnexus.js";
import { detectGstack, type GstackAvailability } from "./gstack.js";
import {
  detectPlatform,
  detectTerminalCapability,
  type Platform,
  type TerminalCapability,
} from "./platform-detect.js";
import { FORGE_CLI_VERSION } from "./version.js";
import {
  configPath,
  defaultConfig,
  readConfig,
  type ContextManagementConfig,
  type ForgeConfig,
  type MemoryFile,
  type ProjectType,
  type TestProfile,
} from "../state/config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Normalised result of a context-usage read, independent of which backend
 * (Claude JSONL / OpenCode SQLite) produced it.
 */
export type ContextReadResult =
  | { ok: true; total_context: number; model: string | null; source: string }
  | { ok: false; reason: string };

export type NodeInfo = {
  version: string;
  meets_minimum: boolean;
};

/**
 * The full, untrimmed environment detection result. This is the source of
 * truth; report and config are both projections of it.
 */
export type EnvironmentSnapshot = {
  cwd: string;
  detected_at: string;
  forge_cli_version: string;

  platform: Platform;
  terminal: TerminalCapability;

  project_type: ProjectType;
  memory_file: MemoryFile;

  /** Complete test profile objects (NOT trimmed to names). */
  test_profiles: Record<string, TestProfile>;
  /** Raw monorepo detection result, or null when not scanned / not a monorepo. */
  monorepo: MonorepoDetectResult | null;
  /** Raw auto-detected build command (does not consider config overrides). */
  build_command: BuildCommand | null;

  git: boolean;
  gitnexus: boolean;
  gstack: GstackAvailability;
  node: NodeInfo;

  /** Raw context read result (success or failure with reason). */
  context: ContextReadResult;
  /** Handoff threshold from config, or 0.5 default. */
  threshold_pct: number;
  /**
   * Non-null when a .forge/config.json exists but failed schema validation.
   * Detection still completes (build/threshold fall back to defaults); the
   * report surfaces this as a warning instead of silently swallowing it.
   */
  config_error: string | null;
};

export type DetectOptions = {
  /** Whether to scan workspace dirs for monorepo profiles (extra IO). */
  monorepo?: boolean;
  /** Override auto-detected platform (mirrors --platform CLI flag). */
  platformOverride?: string;
  /** Explicit session ID to pass to the context reader. */
  sessionId?: string;
};

/**
 * Test-only injection points. Production code never passes this argument.
 * Allows full branch coverage without a real Claude Code / OpenCode session.
 */
export type SnapshotInjections = {
  /** Override process.env for platform / terminal detection. */
  env?: NodeJS.ProcessEnv;
  /** Override process.versions.node for Node version check. */
  nodeVersion?: string;
  /**
   * Override the context read result entirely.
   * Pass { ok: false, reason: "..." } to simulate read failure.
   */
  contextResult?: ContextReadResult;
  /** Override individual tool availability probes. */
  toolAvailability?: {
    git?: boolean;
    gitnexus?: boolean;
    gstack?: GstackAvailability;
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD_PCT = 0.5;

/** Resolve the OpenCode DB path for the current OS. */
function opencodeDbPath(): string {
  if (process.platform === "win32") {
    const appData =
      process.env.LOCALAPPDATA ??
      join(process.env.USERPROFILE ?? "", "AppData", "Local");
    return join(appData, "opencode", "opencode.db");
  }
  const home = process.env.HOME ?? "";
  return join(home, ".local", "share", "opencode", "opencode.db");
}

/**
 * Read context usage from the appropriate backend for the given platform.
 * Returns a normalised ContextReadResult regardless of which reader is used.
 */
function readContextUsage(
  platform: Platform,
  cwd: string,
  sessionId?: string,
): ContextReadResult {
  if (platform === "claude-code") {
    return readClaudeUsage(cwd, sessionId);
  }
  if (platform === "opencode") {
    return readOpencodeUsage(opencodeDbPath(), cwd, sessionId);
  }
  return { ok: false, reason: `unsupported_platform: ${platform}` };
}

/**
 * Read the existing .forge/config.json with full schema validation.
 *
 * Returns the effective config plus a validation error string. A missing
 * config is NOT an error (init runs before config exists) — it yields
 * { config: undefined, error: null }. A present-but-invalid config yields
 * { config: undefined, error } so the report can warn instead of silently
 * falling back to defaults.
 *
 * This is the SINGLE entry point for reading existing config in detection —
 * no raw JSON parsing that bypasses the schema.
 */
function tryReadConfig(cwd: string): {
  config: ForgeConfig | undefined;
  error: string | null;
} {
  if (!existsSync(configPath(cwd))) {
    return { config: undefined, error: null };
  }
  try {
    return { config: readConfig(cwd), error: null };
  } catch (e) {
    return { config: undefined, error: (e as Error).message };
  }
}

/**
 * Merge monorepo workspace profiles into the test_profiles map when present.
 * Falls back to the single-project profiles otherwise.
 */
function resolveTestProfiles(
  cwd: string,
  monorepo: MonorepoDetectResult | null,
): Record<string, TestProfile> {
  if (monorepo?.monorepo && monorepo.detected_profiles.length > 0) {
    return Object.fromEntries(
      monorepo.detected_profiles.map((p) => [
        p.name,
        {
          framework: p.framework,
          command: p.command,
          working_dir: p.working_dir,
          ...(p.coverage_command ? { coverage_command: p.coverage_command } : {}),
        },
      ]),
    );
  }
  return detectTestProfiles(cwd);
}

// ─── Acquisition ─────────────────────────────────────────────────────────────

/**
 * Acquire a full environment snapshot. This is the ONLY function that runs
 * detectors (including subprocess probes and context reads). Run it once;
 * project the result into a report and/or config as needed.
 *
 * @param cwd     - Absolute project root directory.
 * @param opts    - Optional tuning (monorepo scan, platform override, session).
 * @param inject  - Test-only dependency injections; never pass in production.
 */
export function detectEnvironment(
  cwd: string,
  opts: DetectOptions = {},
  inject: SnapshotInjections = {},
): EnvironmentSnapshot {
  // ── 1. Env-var detection (no IO) ──────────────────────────────────────────
  const platform: Platform = opts.platformOverride
    ? (opts.platformOverride as Platform)
    : detectPlatform(inject.env);
  const terminal = detectTerminalCapability(inject.env);

  // ── 2. File-system detection ──────────────────────────────────────────────
  const projectType = detectProjectType(cwd);
  const memoryFile = detectMemoryFile(cwd);
  const monorepo = opts.monorepo ? detectMonorepoProfiles(cwd) : null;
  const testProfiles = resolveTestProfiles(cwd, monorepo);

  // Read the existing config once, with schema validation. This is the single
  // source of "effective" config in detection (build override + threshold).
  const { config: existingConfig, error: configError } = tryReadConfig(cwd);

  // Build command, EFFECTIVE: config.build_command wins (detectBuildCommand
  // applies that override), else auto-detected. Reuse the monorepo scan when
  // we have one (--monorepo mode) so build and test share a single workspace
  // scan; otherwise pass undefined to let buildCheck do its own authoritative
  // scan, preserving "build always probes monorepo" without a static table.
  const buildCmd = detectBuildCommand(cwd, existingConfig, monorepo ?? undefined);

  // ── 3. External tool probes (may spawn subprocess) ────────────────────────
  const git =
    inject.toolAvailability?.git !== undefined
      ? inject.toolAvailability.git
      : detectOptionalTool("git");
  const gitnexus =
    inject.toolAvailability?.gitnexus !== undefined
      ? inject.toolAvailability.gitnexus
      : isGitNexusInstalled();
  const gstack: GstackAvailability =
    inject.toolAvailability?.gstack !== undefined
      ? inject.toolAvailability.gstack
      : detectGstack();

  const rawNodeVersion = inject.nodeVersion ?? process.versions.node;
  const nodeMajor = parseInt(rawNodeVersion.split(".")[0] ?? "0", 10);

  // ── 4. Context read (most expensive, done last) ───────────────────────────
  const context: ContextReadResult =
    inject.contextResult !== undefined
      ? inject.contextResult
      : readContextUsage(platform, cwd, opts.sessionId);

  return {
    cwd,
    detected_at: new Date().toISOString(),
    forge_cli_version: FORGE_CLI_VERSION,

    platform,
    terminal,

    project_type: projectType,
    memory_file: memoryFile,

    test_profiles: testProfiles,
    monorepo,
    build_command: buildCmd,

    git,
    gitnexus,
    gstack,
    node: { version: rawNodeVersion, meets_minimum: nodeMajor >= 18 },

    context,
    threshold_pct:
      existingConfig?.context_management?.threshold_pct ?? DEFAULT_THRESHOLD_PCT,
    config_error: configError,
  };
}

// ─── Projection: snapshot → ForgeConfig ──────────────────────────────────────

/**
 * Project a snapshot into a ForgeConfig. Pure function (no IO).
 *
 * Encapsulates init's config-derivation policy:
 *   - context_management is auto-enabled only on platforms whose context
 *     occupancy can be read (opencode / claude-code); omitted otherwise so it
 *     stays opt-in via `forge config:context --enable`.
 *   - gstack three-way availability collapses to the two boolean config flags
 *     (gstack_installed = cli; gstack_skill_available = skill).
 */
export function snapshotToConfig(snapshot: EnvironmentSnapshot): ForgeConfig {
  const autoEnableContext =
    snapshot.platform === "opencode" || snapshot.platform === "claude-code";

  const contextManagement: ContextManagementConfig | undefined = autoEnableContext
    ? {
        enabled: true,
        threshold_pct: 0.5,
        strategy: "in-place-restart",
        fallback: "prompt-compact",
        min_tasks_between_handoff: 1,
      }
    : undefined;

  return defaultConfig({
    memory_file: snapshot.memory_file,
    project_type: snapshot.project_type,
    test_profiles: snapshot.test_profiles,
    gstack_installed: snapshot.gstack === "cli",
    gstack_skill_available: snapshot.gstack === "skill",
    ...(contextManagement ? { context_management: contextManagement } : {}),
  });
}
