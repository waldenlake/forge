import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

const CLI_BIN = join(import.meta.dirname, "../dist/index.js");

// ── Generators ──────────────────────────────────────────────────────────

const statusArb = fc.constantFrom("idle", "planning", "executing", "execution_complete", "verified");
const taskStatusArb = fc.constantFrom("pending", "in_progress", "done", "failed", "deferred");

const taskArb = (id: number) =>
  fc.record({
    id: fc.constant(id),
    title: fc.string({ minLength: 1, maxLength: 10, unit: "grapheme" }).map((s) => s.replace(/[^a-z]/gi, "x") || "task"),
    status: taskStatusArb,
  });

const tasksArb = fc.integer({ min: 0, max: 6 }).chain((count) =>
  fc.tuple(...Array.from({ length: count }, (_, i) => taskArb(i + 1))),
);

const guardHistoryEntryArb = fc.record({
  id: fc.integer({ min: 1, max: 999 }).map((n) => `guard-${n}`),
  type: fc.constantFrom("batch-review", "security-scan"),
  triggered_at: fc.constant("2026-01-01T00:00:00Z"),
  task_range: fc.option(
    fc.tuple(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 })).map(
      ([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number],
    ),
    { nil: undefined },
  ),
  status: fc.constantFrom("passed", "failed", "skipped"),
});

const progressArb = fc.record({
  version: fc.constant("1.0"),
  feature: fc.option(fc.constant("test-feature"), { nil: null }),
  status: statusArb,
  created_at: fc.constant("2026-01-01T00:00:00Z"),
  updated_at: fc.constant("2026-01-01T00:00:00Z"),
  spec_path: fc.option(fc.constant("spec.md"), { nil: null }),
  plan_path: fc.option(fc.constant("plan.md"), { nil: null }),
  total_tasks: fc.constant(0),
  completed_tasks: fc.constant(0),
  phase_complete_attempts: fc.integer({ min: 0, max: 5 }),
  tasks: tasksArb,
  guard_history: fc.array(guardHistoryEntryArb, { minLength: 0, maxLength: 2 }),
  verification: fc.constant({
    status: "pending" as const,
    attempts: 0,
    last_run: null,
    report_path: null,
  }),
}).map((p) => {
  const doneTasks = p.tasks.filter((t) => t.status === "done").length;
  return {
    ...p,
    total_tasks: p.tasks.length,
    completed_tasks: doneTasks,
  };
});

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

// ── Helpers ──────────────────────────────────────────────────────────────

function setupAndRun(
  tmpDir: string,
  progress: Record<string, unknown>,
): { output: Record<string, unknown>; exitCode: number } {
  const forgeDir = join(tmpDir, ".forge");
  mkdirSync(forgeDir, { recursive: true });
  writeFileSync(join(forgeDir, "config.json"), JSON.stringify(CONFIG));
  writeFileSync(join(forgeDir, "progress.json"), JSON.stringify(progress));

  const result = spawnSync(process.execPath, [CLI_BIN, "next-action"], {
    cwd: tmpDir,
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

// ── Property Tests ──────────────────────────────────────────────────────

describe("next-action property tests", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), "forge-prop-"));
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  // P1: READ-ONLY — next-action never mutates .forge/*.json
  it("Property 1: READ-ONLY — files unchanged after invocation", () => {
    fc.assert(
      fc.property(progressArb, (progress) => {
        const tmpDir = mkdtempSync(join(tmpBase, "p1-"));
        const forgeDir = join(tmpDir, ".forge");
        mkdirSync(forgeDir, { recursive: true });

        const configContent = JSON.stringify(CONFIG);
        const progressContent = JSON.stringify(progress);
        writeFileSync(join(forgeDir, "config.json"), configContent);
        writeFileSync(join(forgeDir, "progress.json"), progressContent);

        spawnSync(process.execPath, [CLI_BIN, "next-action"], {
          cwd: tmpDir,
          encoding: "utf8",
        });

        const configAfter = readFileSync(join(forgeDir, "config.json"), "utf8");
        const progressAfter = readFileSync(join(forgeDir, "progress.json"), "utf8");

        expect(configAfter).toBe(configContent);
        expect(progressAfter).toBe(progressContent);
      }),
      { numRuns: 15 },
    );
  }, 30_000);

  // P2: TOTALITY — every reachable state produces a well-formed output
  it("Property 2: TOTALITY — always returns well-formed output", () => {
    fc.assert(
      fc.property(progressArb, (progress) => {
        const tmpDir = mkdtempSync(join(tmpBase, "p2-"));
        const { output } = setupAndRun(tmpDir, progress);

        expect(output).toHaveProperty("ok");

        if (output.ok === true) {
          expect(output).toHaveProperty("action");
          expect(["run-cli", "invoke-skill", "wait-human"]).toContain(output.action);
          expect(output).toHaveProperty("reminder");
        } else {
          expect(output).toHaveProperty("error");
          expect(typeof output.error).toBe("string");
        }
      }),
      { numRuns: 20 },
    );
  }, 30_000);

  // P3: GUARD-IDEMPOTENCY — recorded guard is not re-recommended
  it("Property 3: GUARD-IDEMPOTENCY — guard not recommended after record", () => {
    const progressWithGuardDue = {
      version: "1.0",
      feature: "test",
      status: "executing",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      spec_path: "spec.md",
      plan_path: "plan.md",
      total_tasks: 6,
      completed_tasks: 3,
      phase_complete_attempts: 0,
      tasks: [
        { id: 1, title: "setup", status: "done" },
        { id: 2, title: "database", status: "done" },
        { id: 3, title: "api", status: "done" },
        { id: 4, title: "ui", status: "pending" },
        { id: 5, title: "tests", status: "pending" },
        { id: 6, title: "review", status: "pending" },
      ],
      guard_history: [],
      verification: { status: "pending", attempts: 0, last_run: null, report_path: null },
    };

    // First call: guard should be recommended
    const tmpDir1 = mkdtempSync(join(tmpBase, "p3a-"));
    const { output: out1 } = setupAndRun(tmpDir1, progressWithGuardDue);
    expect(out1.ok).toBe(true);
    expect(out1.reason).toContain("guard due");

    // Second call with guard:record entry → guard should NOT be recommended
    const progressWithGuardRecorded = {
      ...progressWithGuardDue,
      guard_history: [
        {
          id: "guard-1",
          type: "batch-review",
          triggered_at: "2026-01-01T00:00:00Z",
          task_range: [1, 3],
          status: "passed",
        },
      ],
    };

    const tmpDir2 = mkdtempSync(join(tmpBase, "p3b-"));
    const { output: out2 } = setupAndRun(tmpDir2, progressWithGuardRecorded);
    expect(out2.ok).toBe(true);
    // Should route to task, not guard
    if (out2.action !== "wait-human") {
      expect(out2.reason).not.toContain("batch-review guard due");
    }

    // Two consecutive calls with no record → same output
    const tmpDir3 = mkdtempSync(join(tmpBase, "p3c-"));
    const { output: call1 } = setupAndRun(tmpDir3, progressWithGuardDue);
    const result2 = spawnSync(process.execPath, [CLI_BIN, "next-action"], {
      cwd: tmpDir3,
      encoding: "utf8",
    });
    const call2 = JSON.parse(result2.stdout!.trim());
    expect(call1).toEqual(call2);
  }, 30_000);

  // P4: REMINDER-PRESENCE — every ok:true output has non-empty reminder
  it("Property 4: REMINDER-PRESENCE — non-empty reminder on success", () => {
    fc.assert(
      fc.property(progressArb, (progress) => {
        const tmpDir = mkdtempSync(join(tmpBase, "p4-"));
        const { output } = setupAndRun(tmpDir, progress);

        if (output.ok === true) {
          expect(typeof output.reminder).toBe("string");
          expect((output.reminder as string).length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 20 },
    );
  }, 30_000);

  // P5: NO-FORBIDDEN-COMMAND — no run-cli for task:start or task:done
  it("Property 5: NO-FORBIDDEN-COMMAND — never emits task:start or task:done", () => {
    fc.assert(
      fc.property(progressArb, (progress) => {
        const tmpDir = mkdtempSync(join(tmpBase, "p5-"));
        const { output } = setupAndRun(tmpDir, progress);

        if (output.ok === true && output.action === "run-cli") {
          const cmd = output.command as string;
          expect(cmd).not.toContain("task:start");
          expect(cmd).not.toContain("task:done");
        }
      }),
      { numRuns: 20 },
    );
  }, 30_000);
});
