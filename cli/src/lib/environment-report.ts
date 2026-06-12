/**
 * Environment Report — display projection of an EnvironmentSnapshot.
 *
 * This is the PROJECTION layer. It performs NO IO: it takes a snapshot
 * (acquired by lib/environment-snapshot.ts) and trims / reshapes it into the
 * report consumed by `forge doctor`, `forge env`, and the tail of `forge init`.
 *
 * `generateEnvironmentReport` is a thin convenience wrapper that acquires a
 * snapshot and projects it in one call — kept for backward compatibility with
 * callers that only need a report.
 *
 * Design doc: docs/environment-report.md
 */

import { resolveWindowSize } from "./context-window.js";
import {
  detectEnvironment,
  type ContextReadResult,
  type DetectOptions,
  type EnvironmentSnapshot,
  type SnapshotInjections,
} from "./environment-snapshot.js";
import { type MonorepoDetectResult } from "./detect.js";
import { type GstackAvailability } from "./gstack.js";
import { type Platform, type TerminalCapability } from "./platform-detect.js";

// ─── Public types ────────────────────────────────────────────────────────────

export type PlatformInfo = {
  name: Platform;
  terminal: TerminalCapability["kind"];
  supports_in_place_restart: boolean;
};

export type ContextInfo = {
  /** Model id from the last assistant message; null when unavailable. */
  model: string | null;
  /** Context window upper bound in tokens (derived from model id). */
  window_size: number;
  /** Tokens used at the moment detection completed; null when unreadable. */
  used_tokens: number | null;
  /** used_tokens / window_size rounded to 3 decimal places; null when used_tokens is null. */
  usage_pct: number | null;
  /** Handoff threshold from config, or 0.5 default. */
  threshold_pct: number;
  /** Path of the file the usage was read from (JSONL or SQLite). */
  source: string | null;
  /** Reason context could not be read; null when read succeeded. */
  read_error: string | null;
};

export type ToolStatus = {
  available: boolean;
  /** When true, unavailability sets ok=false on the report. */
  critical: boolean;
  message?: string;
};

export type GstackToolStatus = ToolStatus & {
  availability: GstackAvailability;
};

export type NodeToolStatus = ToolStatus & {
  version: string;
  meets_minimum: boolean;
};

export type ToolsInfo = {
  git: ToolStatus;
  gitnexus: ToolStatus;
  gstack: GstackToolStatus;
  node: NodeToolStatus;
};

export type ProjectInfo = {
  monorepo: boolean;
  monorepo_type: MonorepoDetectResult["monorepo_type"];
  /** Names of detected test profiles. */
  test_profiles: string[];
  /**
   * Effective build command, e.g. "npm run build".
   * config.build_command takes precedence; otherwise the auto-detected
   * command. This matches what `forge verify` runs.
   */
  build_command: string | null;
};

export type Issue = {
  level: "error" | "warning";
  tool?: string;
  message: string;
  hint?: string;
};

export type EnvironmentReport = {
  ok: boolean;
  generated_at: string;
  forge_cli_version: string;

  cwd: string;
  project_type: "existing" | "new";
  memory_file: "CLAUDE.md" | "AGENTS.md" | "GEMINI.md";

  platform: PlatformInfo;
  context: ContextInfo;
  tools: ToolsInfo;
  project: ProjectInfo;

  /** Aggregated issues. Empty array = no problems. */
  issues: Issue[];
};

// Backward-compat re-exports: callers historically imported these from here.
export type { ContextReadResult } from "./environment-snapshot.js";
/** @deprecated Use DetectOptions from environment-snapshot.js. */
export type ReportOptions = DetectOptions;
/** @deprecated Use SnapshotInjections from environment-snapshot.js. */
export type ReportInjections = SnapshotInjections;

// ─── Projection: snapshot → EnvironmentReport ────────────────────────────────

/**
 * Project a snapshot into the display-oriented EnvironmentReport. Pure
 * function: no IO, no subprocess. All branches are reachable by constructing
 * a snapshot literal, which keeps this fully unit-testable.
 */
export function toEnvironmentReport(
  snapshot: EnvironmentSnapshot,
): EnvironmentReport {
  const ctx = snapshot.context;
  const model = ctx.ok ? ctx.model : null;
  const windowSize = resolveWindowSize(model);
  const usedTokens = ctx.ok ? ctx.total_context : null;
  const usagePct =
    usedTokens !== null
      ? Math.round((usedTokens / windowSize) * 1000) / 1000
      : null;

  const tools: ToolsInfo = {
    git: {
      available: snapshot.git,
      critical: false,
      ...(!snapshot.git ? { message: "git not found on PATH" } : {}),
    },
    gitnexus: {
      available: snapshot.gitnexus,
      critical: true,
      ...(!snapshot.gitnexus ? { message: "gitnexus not installed" } : {}),
    },
    gstack: {
      available: snapshot.gstack !== "none",
      critical: false,
      availability: snapshot.gstack,
      ...(snapshot.gstack === "skill"
        ? { message: "skill pack only, CLI not on PATH" }
        : snapshot.gstack === "none"
          ? { message: "not installed" }
          : {}),
    },
    node: {
      available: true,
      critical: true,
      version: snapshot.node.version,
      meets_minimum: snapshot.node.meets_minimum,
      ...(!snapshot.node.meets_minimum
        ? {
            message: `Node.js ${snapshot.node.version} is below the required minimum (18)`,
          }
        : {}),
    },
  };

  const issues = buildIssues(snapshot);
  const ok = !issues.some((i) => i.level === "error");

  return {
    ok,
    generated_at: snapshot.detected_at,
    forge_cli_version: snapshot.forge_cli_version,

    cwd: snapshot.cwd,
    project_type: snapshot.project_type,
    memory_file: snapshot.memory_file,

    platform: {
      name: snapshot.platform,
      terminal: snapshot.terminal.kind,
      supports_in_place_restart: snapshot.terminal.supports_in_place,
    },

    context: {
      model,
      window_size: windowSize,
      used_tokens: usedTokens,
      usage_pct: usagePct,
      threshold_pct: snapshot.threshold_pct,
      source: ctx.ok ? ctx.source : null,
      read_error: ctx.ok ? null : ctx.reason,
    },

    tools,

    project: {
      monorepo: snapshot.monorepo?.monorepo ?? false,
      monorepo_type: snapshot.monorepo?.monorepo_type ?? null,
      test_profiles: Object.keys(snapshot.test_profiles),
      build_command: snapshot.build_command?.command ?? null,
    },

    issues,
  };
}

/**
 * Derive the diagnostic issue list from a snapshot.
 * Errors (node below minimum, gitnexus missing) drive ok=false.
 * Warnings (gstack degraded, context read failure) are informational.
 */
function buildIssues(snapshot: EnvironmentSnapshot): Issue[] {
  const issues: Issue[] = [];

  if (!snapshot.node.meets_minimum) {
    issues.push({
      level: "error",
      tool: "node",
      message: `Node.js ${snapshot.node.version} is below the required minimum (18)`,
      hint: "upgrade Node.js to v18 or newer",
    });
  }
  if (!snapshot.gitnexus) {
    issues.push({
      level: "error",
      tool: "gitnexus",
      message: "gitnexus not installed",
      hint: "npm install -g gitnexus",
    });
  }
  if (snapshot.gstack === "skill") {
    issues.push({
      level: "warning",
      tool: "gstack",
      message: "gstack found as AI skill pack only (no CLI binary on PATH)",
      hint: "have your AI agent run gstack checks via the gstack skill",
    });
  } else if (snapshot.gstack === "none") {
    issues.push({
      level: "warning",
      tool: "gstack",
      message:
        "gstack not found — verify steps that require gstack will be skipped",
      hint: "install gstack CLI for full verify coverage",
    });
  }
  if (!snapshot.context.ok) {
    issues.push({
      level: "warning",
      tool: "context",
      message: `context usage unavailable: ${snapshot.context.reason}`,
    });
  }
  if (snapshot.config_error !== null) {
    issues.push({
      level: "warning",
      tool: "config",
      message: `config.json exists but failed schema validation: ${snapshot.config_error}`,
      hint: "run `forge migrate` or fix .forge/config.json",
    });
  }

  return issues;
}

// ─── Human-readable formatting ───────────────────────────────────────────────

/** Compact token count, e.g. 8420 → "8.4k", 200000 → "200k". */
function fmtTokens(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Status glyph for a tool: ✓ ok, ✗ critical-missing, ⚠ degraded/optional-missing. */
function toolGlyph(status: ToolStatus, degraded = false): string {
  if (status.available && !degraded) return "✓";
  if (!status.available && status.critical) return "✗";
  return "⚠";
}

/**
 * Render an EnvironmentReport as a concise, human-readable summary. Shows the
 * key facts only: location, platform, model, context budget, tool
 * availability, and any issues — not the full JSON payload.
 */
export function formatEnvironmentReport(report: EnvironmentReport): string {
  const lines: string[] = [];
  const c = report.context;

  lines.push(`forge env · ${report.ok ? "ok" : "issues found"}`);
  lines.push(`  cwd        ${report.cwd}`);
  lines.push(
    `  platform   ${report.platform.name} · ${report.platform.terminal}` +
      (report.platform.supports_in_place_restart ? " · in-place restart" : ""),
  );
  lines.push(`  model      ${c.model ?? "(unknown)"}`);

  if (c.used_tokens !== null && c.usage_pct !== null) {
    lines.push(
      `  context    ${fmtTokens(c.used_tokens)} / ${fmtTokens(c.window_size)} ` +
        `(${Math.round(c.usage_pct * 100)}%) · threshold ${Math.round(c.threshold_pct * 100)}%`,
    );
  } else {
    lines.push(
      `  context    unavailable — ${c.read_error ?? "unknown"} ` +
        `(window ${fmtTokens(c.window_size)}, threshold ${Math.round(c.threshold_pct * 100)}%)`,
    );
  }

  // Tools
  const t = report.tools;
  lines.push("");
  lines.push("  tools");
  lines.push(`    ${toolGlyph(t.node)} node       ${t.node.version}`);
  lines.push(`    ${toolGlyph(t.git)} git`);
  lines.push(`    ${toolGlyph(t.gitnexus)} gitnexus`);
  lines.push(
    `    ${toolGlyph(t.gstack, t.gstack.availability === "skill")} gstack     ${t.gstack.availability}`,
  );

  // Project
  const p = report.project;
  const profiles = p.test_profiles.length ? p.test_profiles.join(", ") : "none";
  lines.push("");
  lines.push(
    `  project    ${report.project_type} · profiles: ${profiles} · build: ${p.build_command ?? "none"}` +
      (p.monorepo ? ` · monorepo: ${p.monorepo_type}` : ""),
  );

  // Issues
  if (report.issues.length > 0) {
    lines.push("");
    for (const issue of report.issues) {
      const glyph = issue.level === "error" ? "✗" : "⚠";
      const tool = issue.tool ? `${issue.tool}: ` : "";
      lines.push(`  ${glyph} ${tool}${issue.message}`);
      if (issue.hint) lines.push(`      → ${issue.hint}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ─── Convenience wrapper ─────────────────────────────────────────────────────

/**
 * Acquire a snapshot and project it into a report in one call.
 *
 * Use this when you ONLY need a report (doctor, env). When you also need a
 * config (init), call detectEnvironment() once and project with both
 * toEnvironmentReport() and snapshotToConfig() to avoid double detection.
 *
 * @param cwd     - Absolute project root directory.
 * @param opts    - Optional tuning (monorepo scan, platform override, session).
 * @param inject  - Test-only dependency injections; never pass in production.
 */
export function generateEnvironmentReport(
  cwd: string,
  opts: DetectOptions = {},
  inject: SnapshotInjections = {},
): EnvironmentReport {
  return toEnvironmentReport(detectEnvironment(cwd, opts, inject));
}
