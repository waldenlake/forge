import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import type { ForgeProgress } from "../src/state/progress.js";
import { idleProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-phase-"));

  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runForge(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: "",
      GEMINI_CLI: "",
    },
  });
}

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function readProgress(cwd: string): ForgeProgress {
  return JSON.parse(
    readFileSync(join(cwd, ".forge", "progress.json"), "utf8"),
  ) as ForgeProgress;
}

function writeProgress(cwd: string, progress: ForgeProgress): void {
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    `${JSON.stringify(progress, null, 2)}\n`,
    "utf8",
  );
}

function planningProgress(overrides: Partial<ForgeProgress> = {}): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "auth",
    status: "planning",
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
    spec_path: "docs/spec.md",
    ...overrides,
  };
}

function executingProgress(
  overrides: Partial<ForgeProgress> = {},
): ForgeProgress {
  return {
    ...planningProgress(),
    status: "executing",
    plan_path: "docs/plan.md",
    total_tasks: 2,
    completed_tasks: 0,
    tasks: [
      { id: 1, title: "Build parser", status: "pending" },
      { id: 2, title: "Wire command", status: "done" },
    ],
    ...overrides,
  };
}

function writeScenarios(cwd: string, priority: "P0" | "P1" | "P2"): void {
  writeFileSync(
    join(cwd, ".forge", "scenarios.json"),
    `${JSON.stringify(
      {
        version: "1.0",
        feature: "auth",
        source: "docs/spec.md",
        generated_at: "2026-05-26T00:00:00.000Z",
        scenarios: [
          {
            id: "S001",
            title: "User signs in",
            given: "a registered user",
            when: "valid credentials are submitted",
            then: [
              {
                assertion: "the user is authenticated",
                type: "state-change",
              },
            ],
            testTypes: ["functional"],
            priority,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

describe("phase transition commands", () => {
  test("feature:start writes complete planning progress", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, [
        "feature:start",
        "--feature",
        "auth",
        "--spec",
        "docs/spec.md",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        feature: "auth",
        status: "planning",
        spec_path: "docs/spec.md",
      });

      const progress = readProgress(cwd);
      expect(progress).toMatchObject({
        version: "1.0",
        feature: "auth",
        status: "planning",
        spec_path: "docs/spec.md",
        plan_path: null,
        total_tasks: 0,
        completed_tasks: 0,
        tasks: [],
        guard_history: [],
        verification: {
          status: "pending",
          test_mode: "normal",
          last_run: null,
          report_path: null,
        },
      });
      expect(new Date(progress.created_at ?? "").toISOString()).toBe(
        progress.created_at,
      );
      expect(new Date(progress.updated_at).toISOString()).toBe(
        progress.updated_at,
      );
    });
  });

  test("feature:start rejects active progress without modifying progress", () => {
    withTempProject((cwd) => {
      const originalProgress = executingProgress({
        guard_history: [
          {
            id: "guard-1",
            type: "batch-review",
            triggered_at: "2026-05-26T00:00:00.000Z",
            status: "passed",
          },
        ],
        verification: {
          status: "in_progress",
          test_mode: "enhanced",
          last_run: "2026-05-26T00:00:00.000Z",
          report_path: "reports/current.json",
        },
      });
      writeProgress(cwd, originalProgress);

      const result = runForge(cwd, [
        "feature:start",
        "--feature",
        "new",
        "--spec",
        "docs/new.md",
      ]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        blocked_by: "active feature in progress",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("plan:register extracts markdown tasks into pending progress tasks", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, planningProgress());
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(
        join(cwd, "docs", "plan.md"),
        [
          "# Plan",
          "",
          "### Task 1: Add feature command",
          "Details",
          "### Task 2: Add phase command",
        ].join("\n"),
        "utf8",
      );

      const result = runForge(cwd, [
        "plan:register",
        "--plan",
        "docs/plan.md",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        plan_path: "docs/plan.md",
        tasks_extracted: 2,
        tasks: [
          { id: 1, title: "Add feature command", status: "pending" },
          { id: 2, title: "Add phase command", status: "pending" },
        ],
      });

      expect(readProgress(cwd)).toMatchObject({
        status: "planning",
        plan_path: "docs/plan.md",
        total_tasks: 2,
        completed_tasks: 0,
        tasks: [
          { id: 1, title: "Add feature command", status: "pending" },
          { id: 2, title: "Add phase command", status: "pending" },
        ],
      });
    });
  });

  test("plan:register rejects non-planning progress without modifying progress", () => {
    withTempProject((cwd) => {
      const originalProgress = executingProgress();
      writeProgress(cwd, originalProgress);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(
        join(cwd, "docs", "plan.md"),
        "### Task 1: Should not register\n",
        "utf8",
      );

      const result = runForge(cwd, [
        "plan:register",
        "--plan",
        "docs/plan.md",
      ]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        from: "executing",
        blocked_by: "status is not planning",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("plan:register rejects markdown without task headings without modifying progress", () => {
    withTempProject((cwd) => {
      const originalProgress = planningProgress({
        plan_path: "docs/original-plan.md",
        total_tasks: 1,
        completed_tasks: 0,
        tasks: [{ id: 1, title: "Keep existing task", status: "pending" }],
      });
      writeProgress(cwd, originalProgress);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(
        join(cwd, "docs", "plan.md"),
        ["# Plan", "", "## Task 1: Wrong heading depth"].join("\n"),
        "utf8",
      );

      const result = runForge(cwd, [
        "plan:register",
        "--plan",
        "docs/plan.md",
      ]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "no tasks found",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("phase:advance blocks non-planning progress without modifying progress", () => {
    withTempProject((cwd) => {
      const originalProgress = executingProgress();
      writeProgress(cwd, originalProgress);

      const result = runForge(cwd, ["phase:advance"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        from: "executing",
        blocked_by: "status is not planning",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("phase:advance blocks planning progress when scenarios are missing", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, planningProgress());

      const result = runForge(cwd, ["phase:advance"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        from: "planning",
        blocked_by: "scenarios.json not found",
      });
      expect(readProgress(cwd).status).toBe("planning");
    });
  });

  test("phase:advance blocks scenarios without P0 coverage", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, planningProgress());
      writeScenarios(cwd, "P1");

      const result = runForge(cwd, ["phase:advance"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        from: "planning",
        blocked_by: "no P0 scenario found",
      });
      expect(readProgress(cwd).status).toBe("planning");
    });
  });

  test("phase:advance moves planning progress with P0 scenarios to executing", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, planningProgress());
      writeScenarios(cwd, "P0");

      const result = runForge(cwd, ["phase:advance"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        from: "planning",
        to: "executing",
        checks: {
          scenarios: true,
          p0_scenario: true,
          spec_path: true,
        },
      });
      expect(readProgress(cwd)).toMatchObject({
        feature: "auth",
        status: "executing",
        spec_path: "docs/spec.md",
        verification: {
          status: "pending",
          test_mode: "normal",
          last_run: null,
          report_path: null,
        },
      });
    });
  });

  test("phase:complete blocks non-executing progress without modifying progress", () => {
    withTempProject((cwd) => {
      const originalProgress = planningProgress();
      writeProgress(cwd, originalProgress);

      const result = runForge(cwd, ["phase:complete"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        from: "planning",
        blocked_by: "status is not executing",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("phase:complete blocks when any task is not done or deferred", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["phase:complete"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        from: "executing",
        blocked_by: "tasks not finished",
      });
      expect(readProgress(cwd).status).toBe("executing");
    });
  });

  test("phase:complete moves executing progress with finished tasks to verification_complete", () => {
    withTempProject((cwd) => {
      writeProgress(
        cwd,
        executingProgress({
          completed_tasks: 2,
          tasks: [
            { id: 1, title: "Build parser", status: "done" },
            { id: 2, title: "Wire command", status: "deferred" },
          ],
        }),
      );

      const result = runForge(cwd, ["phase:complete"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        from: "executing",
        to: "verification_complete",
      });
      expect(readProgress(cwd)).toMatchObject({
        status: "verification_complete",
        verification: {
          status: "pending",
          test_mode: "normal",
          last_run: null,
          report_path: null,
        },
      });
    });
  });

  test("phase:finish blocks passed verification outside verification_complete without modifying progress", () => {
    withTempProject((cwd) => {
      const originalProgress = executingProgress({
        verification: {
          status: "passed",
          test_mode: "normal",
          last_run: "2026-05-26T00:00:00.000Z",
          report_path: "reports/verification.json",
        },
      });
      writeProgress(cwd, originalProgress);

      const result = runForge(cwd, ["phase:finish"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        from: "executing",
        blocked_by: "status is not verification_complete",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("phase:finish blocks when verification has not passed", () => {
    withTempProject((cwd) => {
      writeProgress(
        cwd,
        executingProgress({
          status: "verification_complete",
          verification: {
            status: "failed",
            test_mode: "normal",
            last_run: "2026-05-26T00:00:00.000Z",
            report_path: null,
          },
        }),
      );

      const result = runForge(cwd, ["phase:finish"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        from: "verification_complete",
        blocked_by: "verification not passed",
      });
      expect(readProgress(cwd).status).toBe("verification_complete");
    });
  });

  test("phase:finish resets passed verification progress to idle", () => {
    withTempProject((cwd) => {
      writeProgress(
        cwd,
        executingProgress({
          status: "verification_complete",
          completed_tasks: 2,
          tasks: [
            { id: 1, title: "Build parser", status: "done" },
            { id: 2, title: "Wire command", status: "done" },
          ],
          verification: {
            status: "passed",
            test_mode: "normal",
            last_run: "2026-05-26T00:00:00.000Z",
            report_path: "reports/verification.json",
          },
        }),
      );

      const result = runForge(cwd, ["phase:finish"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        from: "verification_complete",
        to: "idle",
      });
      expect(readProgress(cwd)).toMatchObject({
        feature: null,
        status: "idle",
        created_at: null,
        spec_path: null,
        plan_path: null,
        total_tasks: 0,
        completed_tasks: 0,
        tasks: [],
        verification: {
          status: "pending",
          test_mode: "normal",
          last_run: null,
          report_path: null,
        },
      });
    });
  });
});
