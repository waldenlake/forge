/**
 * Tests for generateEnvironmentReport (lib/environment-report.ts).
 *
 * Strategy:
 *   - Unit tests use ReportInjections to avoid subprocess calls and real
 *     session files. No mock modules needed — all branches reachable via
 *     parameter injection.
 *   - Integration-style tests use a real tmp directory and verify the full
 *     report structure / type contracts.
 *
 * Design doc: docs/environment-report.md
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import {
  generateEnvironmentReport,
  type EnvironmentReport,
  type ReportInjections,
} from "../src/lib/environment-report.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal injections that suppress all subprocess calls and context reads. */
const SILENT: ReportInjections = {
  env: {},                                             // no platform / terminal vars
  nodeVersion: "22.0.0",                              // meets minimum
  contextResult: { ok: false, reason: "injected" },  // suppress real reader
  toolAvailability: { git: true, gitnexus: true, gstack: "cli" },
};

/** Create a throw-away project directory. */
function makeTmpDir(): string {
  const dir = join(tmpdir(), `forge-env-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Unit tests: ok / issues ─────────────────────────────────────────────────

describe("generateEnvironmentReport — ok flag", () => {
  test("ok=true when all critical tools available and node meets minimum", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, SILENT);
      expect(report.ok).toBe(true);
      expect(report.issues.filter((i) => i.level === "error")).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ok=false when gitnexus is not available", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        toolAvailability: { ...SILENT.toolAvailability, gitnexus: false },
      });
      expect(report.ok).toBe(false);
      const err = report.issues.find((i) => i.tool === "gitnexus" && i.level === "error");
      expect(err).toBeDefined();
      expect(err?.hint).toMatch(/npm install/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ok=false when node version is below 18", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        nodeVersion: "16.20.0",
      });
      expect(report.ok).toBe(false);
      const err = report.issues.find((i) => i.tool === "node" && i.level === "error");
      expect(err).toBeDefined();
      expect(err?.message).toMatch(/below the required minimum/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ok=true even when gstack is none (warning only)", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        toolAvailability: { ...SILENT.toolAvailability, gstack: "none" },
      });
      expect(report.ok).toBe(true);
      const warn = report.issues.find((i) => i.tool === "gstack" && i.level === "warning");
      expect(warn).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ok=true even when context read fails (warning only)", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        contextResult: { ok: false, reason: "no session files" },
      });
      expect(report.ok).toBe(true);
      const warn = report.issues.find((i) => i.tool === "context" && i.level === "warning");
      expect(warn).toBeDefined();
      expect(warn?.message).toMatch(/no session files/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ok=true even when git is unavailable (warning-free, non-critical)", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        toolAvailability: { ...SILENT.toolAvailability, git: false },
      });
      expect(report.ok).toBe(true);
      expect(report.tools.git.available).toBe(false);
      // git absence does NOT add an issue — it surfaces in tools.git only
      expect(report.issues.some((i) => i.tool === "git")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("corrupt config.json produces a config warning but ok stays true", () => {
    const dir = makeTmpDir();
    try {
      mkdirSync(join(dir, ".forge"), { recursive: true });
      writeFileSync(
        join(dir, ".forge", "config.json"),
        JSON.stringify({ memory_file: "AGENTS.md" }), // missing required fields
        "utf8",
      );
      const report = generateEnvironmentReport(dir, {}, SILENT);
      // config corruption is a warning, not an error → ok unaffected
      expect(report.ok).toBe(true);
      const warn = report.issues.find((i) => i.tool === "config");
      expect(warn?.level).toBe("warning");
      expect(warn?.message).toMatch(/failed schema validation/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Unit tests: platform detection ──────────────────────────────────────────

describe("generateEnvironmentReport — platform info", () => {
  test("detects opencode platform from env var", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        env: { OPENCODE_HOME: "/home/user/.opencode" },
      });
      expect(report.platform.name).toBe("opencode");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detects claude-code platform from CLAUDE_PLUGIN_ROOT", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        env: { CLAUDE_PLUGIN_ROOT: "/path/to/plugin" },
      });
      expect(report.platform.name).toBe("claude-code");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("platformOverride takes precedence over env detection", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(
        dir,
        { platformOverride: "opencode" },
        { ...SILENT, env: { CLAUDE_PLUGIN_ROOT: "/path" } },
      );
      expect(report.platform.name).toBe("opencode");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detects tmux terminal capability", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        env: { TMUX: "/tmp/tmux-1000/default" },
      });
      expect(report.platform.terminal).toBe("tmux");
      expect(report.platform.supports_in_place_restart).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detects wt terminal with supports_in_place=false", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        env: { WT_SESSION: "some-guid" },
      });
      expect(report.platform.terminal).toBe("wt");
      expect(report.platform.supports_in_place_restart).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Unit tests: context info ────────────────────────────────────────────────

describe("generateEnvironmentReport — context info", () => {
  test("populates context fields when read succeeds", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        contextResult: {
          ok: true,
          total_context: 50_000,
          model: "claude-sonnet-4-6",
          source: "/fake/session.jsonl",
        },
      });
      expect(report.context.model).toBe("claude-sonnet-4-6");
      expect(report.context.window_size).toBe(200_000);
      expect(report.context.used_tokens).toBe(50_000);
      expect(report.context.usage_pct).toBe(0.25);
      expect(report.context.source).toBe("/fake/session.jsonl");
      expect(report.context.read_error).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("null fields and read_error when context read fails", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        contextResult: { ok: false, reason: "no .jsonl files found" },
      });
      expect(report.context.model).toBeNull();
      expect(report.context.used_tokens).toBeNull();
      expect(report.context.usage_pct).toBeNull();
      expect(report.context.source).toBeNull();
      expect(report.context.read_error).toBe("no .jsonl files found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("resolves 1M window for [1m] model suffix", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        contextResult: {
          ok: true,
          total_context: 100_000,
          model: "claude-opus-4-6[1m]",
          source: "/fake/session.jsonl",
        },
      });
      expect(report.context.window_size).toBe(1_000_000);
      expect(report.context.usage_pct).toBe(0.1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("defaults to 200k window for unknown model", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        contextResult: {
          ok: true,
          total_context: 10_000,
          model: null,
          source: "/fake/session.jsonl",
        },
      });
      expect(report.context.window_size).toBe(200_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Unit tests: gstack three-way availability ───────────────────────────────

describe("generateEnvironmentReport — gstack availability", () => {
  test("gstack cli: available=true, no warning issue", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        toolAvailability: { ...SILENT.toolAvailability, gstack: "cli" },
      });
      expect(report.tools.gstack.availability).toBe("cli");
      expect(report.tools.gstack.available).toBe(true);
      expect(report.issues.some((i) => i.tool === "gstack")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("gstack skill: available=true, warning issue with AI hint", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        toolAvailability: { ...SILENT.toolAvailability, gstack: "skill" },
      });
      expect(report.tools.gstack.availability).toBe("skill");
      expect(report.tools.gstack.available).toBe(true);
      const warn = report.issues.find((i) => i.tool === "gstack");
      expect(warn?.level).toBe("warning");
      expect(warn?.hint).toMatch(/gstack skill/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("gstack none: available=false, warning issue with install hint", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        toolAvailability: { ...SILENT.toolAvailability, gstack: "none" },
      });
      expect(report.tools.gstack.availability).toBe("none");
      expect(report.tools.gstack.available).toBe(false);
      const warn = report.issues.find((i) => i.tool === "gstack");
      expect(warn?.level).toBe("warning");
      expect(warn?.hint).toMatch(/install gstack/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Integration tests: full report structure ────────────────────────────────

describe("generateEnvironmentReport — report structure (integration)", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("report contains all required top-level fields", () => {
    const report = generateEnvironmentReport(dir, {}, SILENT);

    const requiredKeys: Array<keyof EnvironmentReport> = [
      "ok", "generated_at", "forge_cli_version",
      "cwd", "project_type", "memory_file",
      "platform", "context", "tools", "project", "issues",
    ];
    for (const key of requiredKeys) {
      expect(report, `missing key: ${key}`).toHaveProperty(key);
    }
  });

  test("generated_at is a valid ISO timestamp", () => {
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(() => new Date(report.generated_at)).not.toThrow();
    expect(new Date(report.generated_at).getTime()).toBeGreaterThan(0);
  });

  test("cwd matches the provided directory", () => {
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.cwd).toBe(dir);
  });

  test("project_type is 'new' when no .git directory exists", () => {
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.project_type).toBe("new");
  });

  test("project_type is 'existing' when .git directory exists", () => {
    mkdirSync(join(dir, ".git"));
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.project_type).toBe("existing");
  });

  test("tools object contains git, gitnexus, gstack, node keys", () => {
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.tools).toHaveProperty("git");
    expect(report.tools).toHaveProperty("gitnexus");
    expect(report.tools).toHaveProperty("gstack");
    expect(report.tools).toHaveProperty("node");
  });

  test("node tool reflects injected version", () => {
    const report = generateEnvironmentReport(dir, {}, {
      ...SILENT,
      nodeVersion: "20.5.1",
    });
    expect(report.tools.node.version).toBe("20.5.1");
    expect(report.tools.node.meets_minimum).toBe(true);
  });

  test("issues is an array (may be empty)", () => {
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(Array.isArray(report.issues)).toBe(true);
  });

  test("context threshold_pct uses default 0.5 when no config exists", () => {
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.context.threshold_pct).toBe(0.5);
  });

  test("context threshold_pct reads from .forge/config.json when present", () => {
    // Write a schema-valid config with a custom threshold
    const forgeDir = join(dir, ".forge");
    mkdirSync(forgeDir, { recursive: true });
    const config = {
      version: "2.0",
      forge_cli_version: "0.0.0",
      memory_file: "AGENTS.md",
      project_type: "existing",
      test_profiles: {
        default: { framework: "vitest", command: "npm test", working_dir: "." },
      },
      guards: {},
      context_management: { threshold_pct: 0.7 },
    };
    writeFileSync(join(forgeDir, "config.json"), JSON.stringify(config), "utf8");

    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.context.threshold_pct).toBe(0.7);
  });

  test("memory_file detects CLAUDE.md when present", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# Project\n", "utf8");
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.memory_file).toBe("CLAUDE.md");
  });

  test("memory_file falls back to AGENTS.md when no known file exists", () => {
    const report = generateEnvironmentReport(dir, {}, {
      ...SILENT,
      env: {},  // no CLAUDE_PLUGIN_ROOT or GEMINI_CLI
    });
    expect(report.memory_file).toBe("AGENTS.md");
  });

  test("project.build_command is null when no package.json exists", () => {
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.project.build_command).toBeNull();
  });

  test("project.build_command detected from package.json scripts.build", () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { build: "tsc" } }),
      "utf8",
    );
    const report = generateEnvironmentReport(dir, {}, SILENT);
    expect(report.project.build_command).toBe("npm run build");
  });

  test("project.monorepo is false when no monorepo markers exist", () => {
    const report = generateEnvironmentReport(dir, { monorepo: true }, SILENT);
    expect(report.project.monorepo).toBe(false);
    expect(report.project.monorepo_type).toBeNull();
  });
});

// ─── Integration test: multiple errors accumulate ────────────────────────────

describe("generateEnvironmentReport — multiple issues", () => {
  test("accumulates multiple errors independently", () => {
    const dir = makeTmpDir();
    try {
      const report = generateEnvironmentReport(dir, {}, {
        ...SILENT,
        nodeVersion: "16.0.0",
        toolAvailability: { git: true, gitnexus: false, gstack: "none" },
      });
      expect(report.ok).toBe(false);

      const errors = report.issues.filter((i) => i.level === "error");
      const warnings = report.issues.filter((i) => i.level === "warning");

      // node + gitnexus → 2 errors
      expect(errors.some((i) => i.tool === "node")).toBe(true);
      expect(errors.some((i) => i.tool === "gitnexus")).toBe(true);

      // gstack none → 1 warning
      expect(warnings.some((i) => i.tool === "gstack")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
