import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const CLI_BIN = join(import.meta.dirname, "../dist/index.js");

// ── Shared fixtures ────────────────────────────────────────────────────

const CONFIG = {
  version: "2.0",
  forge_cli_version: "0.2.0",
  memory_file: "AGENTS.md",
  project_type: "existing",
  test_profiles: {
    default: {
      framework: "vitest",
      command: "npx vitest run",
      working_dir: ".",
    },
  },
  guards: {
    "batch-review": {
      enabled: true,
      every_n_tasks: 3,
      actions: ["spec-compliance-review"],
    },
  },
};

function makeProgress(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0",
    feature: "test-feature",
    status: "executing",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    spec_path: "spec.md",
    plan_path: "plan.md",
    total_tasks: 6,
    completed_tasks: 0,
    phase_complete_attempts: 0,
    tasks: [],
    guard_history: [],
    verification: { status: "pending", attempts: 0, last_run: null, report_path: null },
    ...overrides,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function runLoop(cwd: string): { output: Record<string, unknown>; exitCode: number } {
  const result = spawnSync(process.execPath, [CLI_BIN, "run-loop"], {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  return {
    output: JSON.parse(result.stdout.trim()) as Record<string, unknown>,
    exitCode: result.status ?? 0,
  };
}

function setupForge(tmpDir: string, config: object, progress?: object): void {
  const forgeDir = join(tmpDir, ".forge");
  mkdirSync(forgeDir, { recursive: true });
  writeFileSync(join(forgeDir, "config.json"), JSON.stringify(config));
  if (progress) {
    writeFileSync(join(forgeDir, "progress.json"), JSON.stringify(progress));
  }
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("forge run-loop", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "forge-run-loop-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Pass-through (no run-cli to consume) ───────────────────────────

  describe("pass-through (no run-cli consumed)", () => {
    it("uninitialized → wait-human with steps_executed", () => {
      const { output, exitCode } = runLoop(tmpDir);
      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("wait-human");
      expect(output.reason).toContain("not initialized");
      expect(Array.isArray(output.steps_executed)).toBe(true);
      expect((output.steps_executed as unknown[]).length).toBe(1);
    });

    it("planning → invoke-skill forge_planning directly", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "planning" }));
      const { output } = runLoop(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_planning");
      expect((output.steps_executed as unknown[]).length).toBe(1);
    });

    it("executing with pending task → invoke-skill forge_executing", () => {
      setupForge(tmpDir, CONFIG, makeProgress({
        tasks: [{ id: 1, title: "Do stuff", status: "pending" }],
      }));
      const { output } = runLoop(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_executing");
      expect((output.args as Record<string, unknown>).task_id).toBe(1);
    });

    it("verified → invoke-skill forge_done", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "verified" }));
      const { output } = runLoop(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_done");
    });

    it("idle → wait-human", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "idle", feature: null }));
      const { output } = runLoop(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("wait-human");
    });
  });

  // ── run-cli consumption (internal execution) ───────────────────────

  describe("run-cli consumption", () => {
    it("guard:run + guard:record consumed internally, then routes to task", () => {
      // Setup: batch-review due at completed_tasks=3, with inline security-scan
      const configInline = {
        ...CONFIG,
        guards: {
          "security-scan": {
            enabled: true,
            every_n_tasks: 3,
            actions: ["security-audit"],
          },
        },
      };
      const progress = makeProgress({
        total_tasks: 6,
        completed_tasks: 3,
        tasks: [
          { id: 1, title: "a", status: "done" },
          { id: 2, title: "b", status: "done" },
          { id: 3, title: "c", status: "done" },
          { id: 4, title: "d", status: "pending" },
          { id: 5, title: "e", status: "pending" },
          { id: 6, title: "f", status: "pending" },
        ],
      });

      // Need a git repo for security-scan to run
      spawnSync("git", ["init"], { cwd: tmpDir });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tmpDir });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tmpDir });
      writeFileSync(join(tmpDir, "dummy.txt"), "initial");
      spawnSync("git", ["add", "."], { cwd: tmpDir });
      spawnSync("git", ["commit", "-m", "initial"], { cwd: tmpDir });
      setupForge(tmpDir, configInline, progress);
      spawnSync("git", ["add", "."], { cwd: tmpDir });
      spawnSync("git", ["commit", "-m", "add forge"], { cwd: tmpDir });

      const { output } = runLoop(tmpDir);

      // After consuming guard:run + guard:record internally, should route to task
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_executing");
      expect((output.args as Record<string, unknown>).task_id).toBe(4);

      // steps_executed should show the internal commands
      const steps = output.steps_executed as Array<{ command: string; ok: boolean }>;
      expect(steps.length).toBeGreaterThan(2);
      expect(steps.some((s) => s.command.includes("guard:run"))).toBe(true);
      expect(steps.some((s) => s.command.includes("guard:record"))).toBe(true);
    });
  });

  // ── Error propagation ──────────────────────────────────────────────

  describe("error propagation", () => {
    it("error from next-action propagates with steps", () => {
      const forgeDir = join(tmpDir, ".forge");
      mkdirSync(forgeDir, { recursive: true });
      writeFileSync(join(forgeDir, "config.json"), JSON.stringify({ version: "1.0" }));

      const { output, exitCode } = runLoop(tmpDir);
      expect(exitCode).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.error).toContain("config version");
      expect(Array.isArray(output.steps_executed)).toBe(true);
    });

    it("failed task propagates as wait-human", () => {
      setupForge(tmpDir, CONFIG, makeProgress({
        tasks: [
          { id: 1, title: "broken", status: "failed", failure_reason: "oops" },
        ],
      }));

      const { output } = runLoop(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("wait-human");
      expect(output.reason).toContain("task 1 failed");
    });
  });

  // ── Output never contains run-cli action ───────────────────────────

  describe("output contract", () => {
    it("output never has action=run-cli", () => {
      // Various states
      const states = [
        makeProgress({ status: "planning" }),
        makeProgress({ status: "idle", feature: null }),
        makeProgress({ status: "verified" }),
        makeProgress({ tasks: [{ id: 1, title: "x", status: "pending" }] }),
      ];

      for (const progress of states) {
        setupForge(tmpDir, CONFIG, progress);
        const { output } = runLoop(tmpDir);
        if (output.ok && output.action) {
          expect(output.action).not.toBe("run-cli");
        }
        rmSync(join(tmpDir, ".forge"), { recursive: true, force: true });
      }
    });

    it("steps_executed is always an array", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "planning" }));
      const { output } = runLoop(tmpDir);
      expect(Array.isArray(output.steps_executed)).toBe(true);
    });

    it("reminder is present on successful outputs", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "planning" }));
      const { output } = runLoop(tmpDir);
      expect(output.ok).toBe(true);
      expect(typeof output.reminder).toBe("string");
      expect((output.reminder as string).length).toBeGreaterThan(0);
    });
  });
});
