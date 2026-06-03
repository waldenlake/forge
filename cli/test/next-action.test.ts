import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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
    "security-scan": {
      enabled: true,
      trigger: "keyword",
      keywords: ["token", "auth"],
      severity_threshold: "HIGH",
      actions: ["security-audit"],
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

function runNextAction(cwd: string): { output: Record<string, unknown>; exitCode: number } {
  const result = spawnSync(process.execPath, [CLI_BIN, "next-action"], {
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

describe("forge next-action", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "forge-next-action-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Boundary/error states ──────────────────────────────────────────

  describe("boundary states", () => {
    it("emits wait-human when config is missing (uninitialized)", () => {
      // No .forge directory at all
      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("wait-human");
      expect(output.reason).toContain("not initialized");
      expect(output.recovery).toContain("forge init");
      expect(output.reminder).toBeTruthy();
    });

    it("emits error with migration_required when config version != 2.0", () => {
      const forgeDir = join(tmpDir, ".forge");
      mkdirSync(forgeDir, { recursive: true });
      writeFileSync(join(forgeDir, "config.json"), JSON.stringify({ version: "1.0" }));

      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.migration_required).toBe(true);
      expect(output.recovery).toContain("forge migrate");
    });

    it("emits error when config.json is corrupt (invalid JSON)", () => {
      const forgeDir = join(tmpDir, ".forge");
      mkdirSync(forgeDir, { recursive: true });
      writeFileSync(join(forgeDir, "config.json"), "not valid json{{{");

      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.error).toContain("config.json invalid");
      expect(output.recovery).toContain("forge reset --backup");
    });

    it("emits error when progress.json is unparseable", () => {
      setupForge(tmpDir, CONFIG);
      writeFileSync(join(tmpDir, ".forge", "progress.json"), "not json{{{");

      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.error).toContain("progress.json invalid");
      expect(output.recovery).toContain("forge reset --backup");
    });

    it("emits error when progress.json has invalid schema", () => {
      setupForge(tmpDir, CONFIG);
      writeFileSync(
        join(tmpDir, ".forge", "progress.json"),
        JSON.stringify({ version: "1.0", status: "verification_complete" }),
      );

      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.error).toContain("progress.json invalid");
    });
  });

  // ── Non-executing phase routing ────────────────────────────────────

  describe("non-executing phase routing", () => {
    it("idle → wait-human", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "idle", feature: null }));
      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("wait-human");
      expect(output.phase).toBe("idle");
      expect(output.reason).toContain("/start");
      expect(output.reminder).toBeTruthy();
    });

    it("planning → invoke-skill forge_planning", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "planning" }));
      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_planning");
      expect(output.phase).toBe("planning");
      expect(output.reminder).toBeTruthy();
    });

    it("execution_complete → invoke-skill forge_verify", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "execution_complete" }));
      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_verify");
      expect(output.phase).toBe("execution_complete");
    });

    it("verified → invoke-skill forge_done", () => {
      setupForge(tmpDir, CONFIG, makeProgress({ status: "verified" }));
      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_done");
      expect(output.phase).toBe("verified");
    });

    it("no progress.json → idle (via idleProgress)", () => {
      setupForge(tmpDir, CONFIG);
      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("wait-human");
      expect(output.phase).toBe("idle");
    });
  });

  // ── Executing-phase priority routing ───────────────────────────────

  describe("executing phase", () => {
    it("priority 1: failed task → wait-human with task:reset recovery", () => {
      const progress = makeProgress({
        completed_tasks: 2,
        tasks: [
          { id: 1, title: "Setup", status: "done" },
          { id: 2, title: "DB", status: "done" },
          { id: 3, title: "API", status: "failed", failure_reason: "compile error" },
          { id: 4, title: "UI", status: "pending" },
        ],
      });
      setupForge(tmpDir, CONFIG, progress);

      const { output, exitCode } = runNextAction(tmpDir);
      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("wait-human");
      expect(output.reason).toContain("task 3 failed");
      expect(output.reason).toContain("compile error");
      expect(output.recovery).toContain("forge task:reset --id 3");
    });

    it("priority 2: inline guard due → run-cli guard:run with record", () => {
      // batch-review triggers at every_n_tasks=3, so completed_tasks=3 triggers it
      const progress = makeProgress({
        completed_tasks: 3,
        tasks: [
          { id: 1, title: "Setup", status: "done" },
          { id: 2, title: "DB", status: "done" },
          { id: 3, title: "API", status: "done" },
          { id: 4, title: "UI", status: "pending" },
        ],
        guard_history: [],
      });
      // Use a config where batch-review is the guard (it's delegated, not inline)
      // Let me use security-scan with batch trigger instead
      const configWithInlineGuard = {
        ...CONFIG,
        guards: {
          "security-scan": {
            enabled: true,
            every_n_tasks: 3,
            actions: ["security-audit"],
          },
        },
      };
      setupForge(tmpDir, configWithInlineGuard, progress);

      const { output } = runNextAction(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("run-cli");
      expect(output.command).toBe("forge guard:run");
      expect((output.args as Record<string, unknown>).type).toBe("security-scan");
      expect(output.record).toBeTruthy();
      const record = output.record as Record<string, unknown>;
      expect(record.command).toBe("forge guard:record");
      expect(output.after).toEqual({ type: "call-next-action" });
    });

    it("priority 2: delegated guard due → invoke-skill forge_executing with record", () => {
      const progress = makeProgress({
        completed_tasks: 3,
        tasks: [
          { id: 1, title: "Setup", status: "done" },
          { id: 2, title: "DB", status: "done" },
          { id: 3, title: "API", status: "done" },
          { id: 4, title: "UI", status: "pending" },
        ],
        guard_history: [],
      });
      // batch-review is delegated (not in INLINE_GUARDS)
      const configWithDelegated = {
        ...CONFIG,
        guards: {
          "batch-review": {
            enabled: true,
            every_n_tasks: 3,
            actions: ["spec-compliance-review"],
          },
        },
      };
      setupForge(tmpDir, configWithDelegated, progress);

      const { output } = runNextAction(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_executing");
      expect((output.args as Record<string, unknown>).guard).toBe("batch-review");
      expect((output.args as Record<string, unknown>).delegated_actions).toEqual(["spec-compliance-review"]);
      expect(output.record).toBeTruthy();
    });

    it("priority 3: in_progress task preferred over pending", () => {
      const progress = makeProgress({
        completed_tasks: 1,
        tasks: [
          { id: 1, title: "Setup", status: "done" },
          { id: 2, title: "In flight", status: "in_progress" },
          { id: 3, title: "Waiting", status: "pending" },
        ],
      });
      setupForge(tmpDir, CONFIG, progress);

      const { output } = runNextAction(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_executing");
      expect((output.args as Record<string, unknown>).task_id).toBe(2);
      expect((output.args as Record<string, unknown>).task_title).toBe("In flight");
    });

    it("priority 3: pending task when no in_progress", () => {
      const progress = makeProgress({
        completed_tasks: 1,
        tasks: [
          { id: 1, title: "Setup", status: "done" },
          { id: 2, title: "Next up", status: "pending" },
          { id: 3, title: "Later", status: "pending" },
        ],
      });
      setupForge(tmpDir, CONFIG, progress);

      const { output } = runNextAction(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_executing");
      expect((output.args as Record<string, unknown>).task_id).toBe(2);
    });

    it("priority 4: all done/deferred → run-cli phase:complete", () => {
      const progress = makeProgress({
        total_tasks: 3,
        completed_tasks: 2,
        tasks: [
          { id: 1, title: "Setup", status: "done" },
          { id: 2, title: "DB", status: "done" },
          { id: 3, title: "API", status: "deferred", defer_reason: "not needed" },
        ],
        guard_history: [],
      });
      // Disable security-scan keyword trigger
      const configNoKeyword = {
        ...CONFIG,
        guards: {
          "batch-review": {
            enabled: true,
            every_n_tasks: 3,
            actions: ["spec-compliance-review"],
          },
        },
      };
      setupForge(tmpDir, configNoKeyword, progress);

      const { output } = runNextAction(tmpDir);
      expect(output.ok).toBe(true);
      expect(output.action).toBe("run-cli");
      expect(output.command).toBe("forge phase:complete");
      expect(output.after).toEqual({ type: "call-next-action" });
    });

    it("failed task takes priority over due guard", () => {
      const progress = makeProgress({
        completed_tasks: 3,
        tasks: [
          { id: 1, title: "Setup", status: "done" },
          { id: 2, title: "DB", status: "done" },
          { id: 3, title: "API", status: "done" },
          { id: 4, title: "UI", status: "failed", failure_reason: "timeout" },
        ],
      });
      const configBatch = {
        ...CONFIG,
        guards: {
          "batch-review": {
            enabled: true,
            every_n_tasks: 3,
            actions: ["spec-compliance-review"],
          },
        },
      };
      setupForge(tmpDir, configBatch, progress);

      const { output } = runNextAction(tmpDir);
      expect(output.action).toBe("wait-human");
      expect(output.reason).toContain("task 4 failed");
    });

    it("due guard takes priority over pending task", () => {
      const progress = makeProgress({
        completed_tasks: 3,
        tasks: [
          { id: 1, title: "Setup", status: "done" },
          { id: 2, title: "DB", status: "done" },
          { id: 3, title: "API", status: "done" },
          { id: 4, title: "UI", status: "pending" },
        ],
      });
      const configBatch = {
        ...CONFIG,
        guards: {
          "batch-review": {
            enabled: true,
            every_n_tasks: 3,
            actions: ["spec-compliance-review"],
          },
        },
      };
      setupForge(tmpDir, configBatch, progress);

      const { output } = runNextAction(tmpDir);
      // Should be a guard action, not a task action
      expect(output.reason).toContain("guard due");
    });
  });

  // ── Reminder presence ──────────────────────────────────────────────

  describe("reminder presence", () => {
    it("all successful outputs carry a non-empty reminder", () => {
      // Test several phases
      const phases: Array<{ status: string; extra?: Record<string, unknown> }> = [
        { status: "idle", extra: { feature: null } },
        { status: "planning" },
        { status: "execution_complete" },
        { status: "verified" },
        { status: "executing", extra: { tasks: [{ id: 1, title: "X", status: "pending" }] } },
      ];

      for (const { status, extra } of phases) {
        const progress = makeProgress({ status, ...extra });
        setupForge(tmpDir, CONFIG, progress);
        const { output } = runNextAction(tmpDir);
        expect(output.ok).toBe(true);
        expect(typeof output.reminder).toBe("string");
        expect((output.reminder as string).length).toBeGreaterThan(0);
        rmSync(join(tmpDir, ".forge"), { recursive: true, force: true });
      }
    });
  });

  // ── No forbidden commands ──────────────────────────────────────────

  describe("no forbidden commands", () => {
    it("never emits run-cli for task:start or task:done", () => {
      // executing with pending tasks
      const progress = makeProgress({
        completed_tasks: 0,
        tasks: [
          { id: 1, title: "First", status: "pending" },
          { id: 2, title: "Second", status: "pending" },
        ],
      });
      setupForge(tmpDir, CONFIG, progress);

      const { output } = runNextAction(tmpDir);
      if (output.action === "run-cli") {
        expect(output.command).not.toContain("task:start");
        expect(output.command).not.toContain("task:done");
      }
      // Tasks should route to invoke-skill, never run-cli
      expect(output.action).toBe("invoke-skill");
      expect(output.skill).toBe("forge_executing");
    });
  });
});
