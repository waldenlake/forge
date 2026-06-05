/**
 * Tests for the acquisition + config-projection layer
 * (lib/environment-snapshot.ts).
 *
 * Two concerns:
 *   1. detectEnvironment — acquisition. Uses SnapshotInjections + tmp dirs to
 *      avoid subprocess / real session dependency. Verifies the snapshot keeps
 *      FULL data (complete test_profiles objects, raw monorepo result).
 *   2. snapshotToConfig — pure projection. Verifies init's config-derivation
 *      policy (context_management auto-enable, gstack three-way → two booleans,
 *      complete test_profiles passthrough) using snapshot literals.
 *
 * Design doc: docs/environment-report.md
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import {
  detectEnvironment,
  snapshotToConfig,
  type EnvironmentSnapshot,
  type SnapshotInjections,
} from "../src/lib/environment-snapshot.js";
import type { GstackAvailability } from "../src/lib/gstack.js";
import type { Platform } from "../src/lib/platform-detect.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SILENT: SnapshotInjections = {
  env: {},
  nodeVersion: "22.0.0",
  contextResult: { ok: false, reason: "injected" },
  toolAvailability: { git: true, gitnexus: true, gstack: "cli" },
};

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `forge-snap-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Build a minimal valid snapshot literal for projection tests. */
function makeSnapshot(
  overrides: Partial<EnvironmentSnapshot> = {},
): EnvironmentSnapshot {
  return {
    cwd: "/fake/project",
    detected_at: "2026-06-05T00:00:00.000Z",
    forge_cli_version: "0.0.0",
    platform: "unknown",
    terminal: { kind: "bare", supports_in_place: false },
    project_type: "existing",
    memory_file: "AGENTS.md",
    test_profiles: {
      default: { framework: "vitest", command: "npx vitest run", working_dir: "." },
    },
    monorepo: null,
    build_command: null,
    git: true,
    gitnexus: true,
    gstack: "cli",
    node: { version: "22.0.0", meets_minimum: true },
    context: { ok: false, reason: "injected" },
    threshold_pct: 0.5,
    config_error: null,
    ...overrides,
  };
}

// ─── detectEnvironment: acquisition ──────────────────────────────────────────

describe("detectEnvironment — acquisition", () => {
  test("keeps COMPLETE test_profiles objects, not just names", () => {
    const dir = makeTmpDir();
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }),
        "utf8",
      );
      const snap = detectEnvironment(dir, {}, SILENT);
      // The whole point of the snapshot layer: full objects survive.
      expect(snap.test_profiles.default).toMatchObject({
        framework: "vitest",
        command: "npx vitest run",
        working_dir: ".",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("platformOverride wins over env detection", () => {
    const dir = makeTmpDir();
    try {
      const snap = detectEnvironment(
        dir,
        { platformOverride: "opencode" },
        { ...SILENT, env: { CLAUDE_PLUGIN_ROOT: "/x" } },
      );
      expect(snap.platform).toBe("opencode");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("node version injection drives meets_minimum", () => {
    const dir = makeTmpDir();
    try {
      const snap = detectEnvironment(dir, {}, { ...SILENT, nodeVersion: "16.0.0" });
      expect(snap.node.version).toBe("16.0.0");
      expect(snap.node.meets_minimum).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("tool availability injection is reflected verbatim", () => {
    const dir = makeTmpDir();
    try {
      const snap = detectEnvironment(dir, {}, {
        ...SILENT,
        toolAvailability: { git: false, gitnexus: false, gstack: "skill" },
      });
      expect(snap.git).toBe(false);
      expect(snap.gitnexus).toBe(false);
      expect(snap.gstack).toBe("skill");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detected_at is a valid ISO timestamp", () => {
    const dir = makeTmpDir();
    try {
      const snap = detectEnvironment(dir, {}, SILENT);
      expect(new Date(snap.detected_at).getTime()).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("context read failure is preserved as raw result", () => {
    const dir = makeTmpDir();
    try {
      const snap = detectEnvironment(dir, {}, {
        ...SILENT,
        contextResult: { ok: false, reason: "no session" },
      });
      expect(snap.context).toEqual({ ok: false, reason: "no session" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── detectEnvironment: effective config (build override / threshold) ────────

describe("detectEnvironment — effective config", () => {
  /** Write a schema-valid config with optional overrides. */
  function writeConfig(dir: string, extra: Record<string, unknown>): void {
    mkdirSync(join(dir, ".forge"), { recursive: true });
    writeFileSync(
      join(dir, ".forge", "config.json"),
      JSON.stringify({
        version: "2.0",
        forge_cli_version: "0.0.0",
        memory_file: "AGENTS.md",
        project_type: "existing",
        test_profiles: {
          default: { framework: "vitest", command: "npm test", working_dir: "." },
        },
        guards: {},
        ...extra,
      }),
      "utf8",
    );
  }

  test("build_command reflects config.build_command override (effective)", () => {
    const dir = makeTmpDir();
    try {
      // package.json would auto-detect "npm run build", but config overrides.
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ scripts: { build: "vite build" } }),
        "utf8",
      );
      writeConfig(dir, {
        build_command: { command: "make release", working_dir: "build" },
      });

      const snap = detectEnvironment(dir, {}, SILENT);
      expect(snap.build_command).toEqual({
        command: "make release",
        working_dir: "build",
      });
      expect(snap.config_error).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("threshold_pct comes from validated config", () => {
    const dir = makeTmpDir();
    try {
      writeConfig(dir, { context_management: { threshold_pct: 0.7 } });
      const snap = detectEnvironment(dir, {}, SILENT);
      expect(snap.threshold_pct).toBe(0.7);
      expect(snap.config_error).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("corrupt config → threshold falls back to 0.5 AND config_error is set", () => {
    const dir = makeTmpDir();
    try {
      mkdirSync(join(dir, ".forge"), { recursive: true });
      // Missing required fields (version/guards/...) → schema validation fails.
      writeFileSync(
        join(dir, ".forge", "config.json"),
        JSON.stringify({ memory_file: "AGENTS.md" }),
        "utf8",
      );

      const snap = detectEnvironment(dir, {}, SILENT);
      expect(snap.threshold_pct).toBe(0.5);
      expect(snap.config_error).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("out-of-range threshold in config is rejected by schema (config_error set)", () => {
    const dir = makeTmpDir();
    try {
      // threshold_pct: 5 violates schema maximum:1 → whole config invalid.
      writeConfig(dir, { context_management: { threshold_pct: 5 } });
      const snap = detectEnvironment(dir, {}, SILENT);
      // Invalid config is not trusted → threshold falls back, error surfaced.
      expect(snap.threshold_pct).toBe(0.5);
      expect(snap.config_error).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no config file → no error, build auto-detected", () => {
    const dir = makeTmpDir();
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ scripts: { build: "tsc" } }),
        "utf8",
      );
      const snap = detectEnvironment(dir, {}, SILENT);
      expect(snap.config_error).toBeNull();
      expect(snap.build_command).toEqual({
        command: "npm run build",
        working_dir: ".",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── snapshotToConfig: projection ────────────────────────────────────────────

describe("snapshotToConfig — context_management auto-enable", () => {
  test("auto-enables on opencode", () => {
    const config = snapshotToConfig(makeSnapshot({ platform: "opencode" }));
    expect(config.context_management).toBeDefined();
    expect(config.context_management?.enabled).toBe(true);
    expect(config.context_management?.threshold_pct).toBe(0.5);
    expect(config.context_management?.strategy).toBe("in-place-restart");
  });

  test("auto-enables on claude-code", () => {
    const config = snapshotToConfig(makeSnapshot({ platform: "claude-code" }));
    expect(config.context_management?.enabled).toBe(true);
  });

  test("does NOT auto-enable on codex (unsupported reader)", () => {
    const config = snapshotToConfig(makeSnapshot({ platform: "codex" }));
    expect(config.context_management).toBeUndefined();
  });

  test("does NOT auto-enable on unknown platform", () => {
    const config = snapshotToConfig(makeSnapshot({ platform: "unknown" }));
    expect(config.context_management).toBeUndefined();
  });
});

describe("snapshotToConfig — gstack three-way → two booleans", () => {
  const cases: Array<[GstackAvailability, boolean, boolean]> = [
    ["cli", true, false],
    ["skill", false, true],
    ["none", false, false],
  ];
  for (const [availability, installed, skill] of cases) {
    test(`gstack=${availability} → installed=${installed}, skill=${skill}`, () => {
      const config = snapshotToConfig(makeSnapshot({ gstack: availability }));
      expect(config.gstack_installed).toBe(installed);
      // gstack_skill_available is only present when true (omitted otherwise).
      expect(config.gstack_skill_available ?? false).toBe(skill);
    });
  }
});

describe("snapshotToConfig — passthrough fields", () => {
  test("complete test_profiles object is passed through, not flattened", () => {
    const profiles = {
      api: { framework: "pytest", command: "pytest", working_dir: "api" },
      web: {
        framework: "vitest",
        command: "npx vitest run",
        working_dir: "web",
        coverage_command: "npx vitest run --coverage",
      },
    };
    const config = snapshotToConfig(makeSnapshot({ test_profiles: profiles }));
    expect(config.test_profiles).toEqual(profiles);
  });

  test("memory_file and project_type are carried into config", () => {
    const config = snapshotToConfig(
      makeSnapshot({ memory_file: "CLAUDE.md", project_type: "new" }),
    );
    expect(config.memory_file).toBe("CLAUDE.md");
    expect(config.project_type).toBe("new");
  });

  test("produces a schema-valid v2 config shape", () => {
    const config = snapshotToConfig(makeSnapshot());
    expect(config.version).toBe("2.0");
    expect(config.guards).toBeDefined();
    expect(config.verify).toBeDefined();
  });
});

// ─── Consistency: report and config come from one snapshot ───────────────────

describe("snapshot is the single source of truth", () => {
  test("config.test_profiles names match report.project.test_profiles", async () => {
    const { toEnvironmentReport } = await import(
      "../src/lib/environment-report.js"
    );
    const dir = makeTmpDir();
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ devDependencies: { jest: "^29.0.0" } }),
        "utf8",
      );
      const snap = detectEnvironment(dir, {}, SILENT);
      const config = snapshotToConfig(snap);
      const report = toEnvironmentReport(snap);

      // Same snapshot → report names are exactly the config profile keys.
      expect(report.project.test_profiles.sort()).toEqual(
        Object.keys(config.test_profiles).sort(),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
