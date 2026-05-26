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

import type { ForgeConfig } from "../src/state/config.js";
import { defaultConfig } from "../src/state/config.js";
import type { ForgeProgress } from "../src/state/progress.js";
import { idleProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-task-guard-"));

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

function writeConfig(cwd: string, config: ForgeConfig = defaultConfig()): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

function executingProgress(
  overrides: Partial<ForgeProgress> = {},
): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "runtime",
    status: "executing",
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 6,
    completed_tasks: 0,
    tasks: [
      { id: 1, title: "Build parser", status: "pending" },
      { id: 2, title: "Wire config", status: "pending" },
      { id: 3, title: "Add state", status: "pending" },
      { id: 4, title: "Expose command", status: "pending" },
      { id: 5, title: "Write docs", status: "pending" },
      { id: 6, title: "Review runtime", status: "pending" },
    ],
    ...overrides,
  };
}

function task(id: number, progress: ForgeProgress): ForgeProgress["tasks"][number] {
  const found = progress.tasks.find((item) => item.id === id);
  expect(found).toBeDefined();
  return found!;
}

function numberedTasks(
  count: number,
  statusFor: (id: number) => ForgeProgress["tasks"][number]["status"],
): ForgeProgress["tasks"] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;

    return {
      id,
      title: `Task ${id}`,
      status: statusFor(id),
    };
  });
}

describe("task and guard runtime commands", () => {
  test.each([
    ["task:start", "planning", ["task:start", "--id", "1"]],
    ["task:done", "planning", ["task:done", "--id", "1"]],
    [
      "task:fail",
      "planning",
      ["task:fail", "--id", "1", "--reason", "tests failed"],
    ],
    [
      "task:defer",
      "planning",
      ["task:defer", "--id", "1", "--reason", "blocked externally"],
    ],
    ["task:start", "idle", ["task:start", "--id", "1"]],
    ["task:done", "idle", ["task:done", "--id", "1"]],
    [
      "task:fail",
      "idle",
      ["task:fail", "--id", "1", "--reason", "tests failed"],
    ],
    [
      "task:defer",
      "idle",
      ["task:defer", "--id", "1", "--reason", "blocked externally"],
    ],
    ["task:start", "verification_complete", ["task:start", "--id", "1"]],
    ["task:done", "verification_complete", ["task:done", "--id", "1"]],
    [
      "task:fail",
      "verification_complete",
      ["task:fail", "--id", "1", "--reason", "tests failed"],
    ],
    [
      "task:defer",
      "verification_complete",
      ["task:defer", "--id", "1", "--reason", "blocked externally"],
    ],
  ] as const)(
    "%s blocks %s progress without modifying progress",
    (_command, status, args) => {
      withTempProject((cwd) => {
        writeConfig(cwd);
        const originalProgress = executingProgress({ status });
        writeProgress(cwd, originalProgress);

        const result = runForge(cwd, [...args]);

        expect(result.status).toBe(1);
        expect(parseStdout(result)).toEqual({
          ok: false,
          from: status,
          blocked_by: "status is not executing",
        });
        expect(readProgress(cwd)).toEqual(originalProgress);
      });
    },
  );

  test("task:start --id changes pending task to in_progress and sets started_at", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["task:start", "--id", "1"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        task: { id: 1, status: "in_progress" },
      });
      const startedTask = task(1, readProgress(cwd));
      expect(startedTask.status).toBe("in_progress");
      expect(new Date(startedTask.started_at ?? "").toISOString()).toBe(
        startedTask.started_at,
      );
    });
  });

  test("task:done --id records completed_at, recomputes completed_tasks, and skips batch guard at task 1", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        task: { id: 1, status: "done" },
        completed_tasks: 1,
        guard_triggered: false,
        guards: [],
        guard_type: null,
      });
      const progress = readProgress(cwd);
      expect(progress.completed_tasks).toBe(1);
      const completedTask = task(1, progress);
      expect(completedTask.status).toBe("done");
      expect(new Date(completedTask.completed_at ?? "").toISOString()).toBe(
        completedTask.completed_at,
      );
    });
  });

  test("task:done fails without config and does not modify progress", () => {
    withTempProject((cwd) => {
      const originalProgress = executingProgress();
      writeProgress(cwd, originalProgress);

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({ ok: false });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("task:done --id 6 triggers batch-review", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(
        cwd,
        executingProgress({
          completed_tasks: 5,
          tasks: [
            { id: 1, title: "Build parser", status: "done" },
            { id: 2, title: "Wire config", status: "done" },
            { id: 3, title: "Add state", status: "done" },
            { id: 4, title: "Expose command", status: "done" },
            { id: 5, title: "Write docs", status: "done" },
            { id: 6, title: "Review runtime", status: "pending" },
          ],
        }),
      );

      const result = runForge(cwd, ["task:done", "--id", "6"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        completed_tasks: 6,
        guard_triggered: true,
        guard_type: "batch-review",
        guards: [{ type: "batch-review", task_range: [1, 6] }],
      });
    });
  });

  test("task:done triggers batch-review every 6 tasks when every_n_tasks is omitted", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            ...defaultConfig().guards,
            "batch-review": {
              enabled: true,
              actions: ["spec-compliance-review"],
            },
          },
        }),
      );
      writeProgress(
        cwd,
        executingProgress({
          completed_tasks: 5,
          tasks: [
            { id: 1, title: "Build parser", status: "done" },
            { id: 2, title: "Wire config", status: "done" },
            { id: 3, title: "Add state", status: "done" },
            { id: 4, title: "Expose command", status: "done" },
            { id: 5, title: "Write docs", status: "done" },
            { id: 6, title: "Review runtime", status: "pending" },
          ],
        }),
      );

      const result = runForge(cwd, ["task:done", "--id", "6"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        completed_tasks: 6,
        guard_triggered: true,
        guard_type: "batch-review",
        guards: [{ type: "batch-review", task_range: [1, 6] }],
      });
    });
  });

  test("task:done triggers security-scan when enabled and task title or tags contains token", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            ...defaultConfig().guards,
            "security-scan": {
              enabled: true,
              trigger: "keyword",
              keywords: ["token"],
              actions: ["security-audit"],
            },
          },
        }),
      );
      writeProgress(
        cwd,
        executingProgress({
          total_tasks: 2,
          tasks: [
            {
              id: 1,
              title: "Refresh session",
              status: "pending",
              tags: ["TOKEN"],
            },
            { id: 2, title: "Store Token", status: "pending" },
          ],
        }),
      );

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        guard_triggered: true,
        guard_type: "security-scan",
        guards: [{ type: "security-scan" }],
      });
    });
  });

  test("task:done returns simultaneously triggered guards in deterministic order", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            ...defaultConfig().guards,
            "security-scan": {
              enabled: true,
              trigger: "keyword",
              keywords: ["token"],
              actions: ["security-audit"],
            },
            "dependency-audit": {
              enabled: true,
              trigger: "new-dependency",
              actions: ["dependency-check"],
            },
            "performance-budget": {
              enabled: true,
              trigger: "keyword",
              keywords: ["frontend"],
              actions: ["bundle-size-check"],
            },
            "human-review": {
              enabled: true,
              trigger: "manual",
              actions: ["pause-for-human"],
            },
          },
        }),
      );
      writeProgress(
        cwd,
        executingProgress({
          completed_tasks: 5,
          tasks: [
            { id: 1, title: "Task 1", status: "done" },
            { id: 2, title: "Task 2", status: "done" },
            { id: 3, title: "Task 3", status: "done" },
            { id: 4, title: "Task 4", status: "done" },
            { id: 5, title: "Task 5", status: "done" },
            {
              id: 6,
              title: "Token frontend review",
              status: "pending",
              requires_human_review: true,
            },
          ],
        }),
      );

      const result = runForge(cwd, ["task:done", "--id", "6"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result).guards.map((guard: { type: string }) => guard.type))
        .toEqual([
          "security-scan",
          "batch-review",
          "performance-budget",
          "human-review",
        ]);
    });
  });

  test("task:done batch-review task_range starts after the last batch guard", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(
        cwd,
        executingProgress({
          total_tasks: 12,
          completed_tasks: 11,
          guard_history: [
            {
              id: "guard-1",
              type: "batch-review",
              triggered_at: "2026-05-26T00:00:00.000Z",
              task_range: [1, 6],
              status: "passed",
            },
          ],
          tasks: numberedTasks(12, (id) => (id === 12 ? "pending" : "done")),
        }),
      );

      const result = runForge(cwd, ["task:done", "--id", "12"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        guard_triggered: true,
        guards: [{ type: "batch-review", task_range: [7, 12] }],
      });
    });
  });

  test("enabled dependency-audit does not trigger without deterministic keyword basis", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            ...defaultConfig().guards,
            "dependency-audit": {
              enabled: true,
              trigger: "new-dependency",
              actions: ["dependency-check"],
            },
          },
        }),
      );
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        guard_triggered: false,
        guards: [],
        guard_type: null,
      });
    });
  });

  test("task:done triggers performance-budget on title or tag keyword case-insensitively", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            ...defaultConfig().guards,
            "performance-budget": {
              enabled: true,
              trigger: "keyword",
              keywords: ["frontend"],
              actions: ["bundle-size-check"],
            },
          },
        }),
      );
      writeProgress(
        cwd,
        executingProgress({
          tasks: [
            { id: 1, title: "Render shell", status: "pending", tags: ["FRONTEND"] },
          ],
        }),
      );

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        guard_triggered: true,
        guard_type: "performance-budget",
        guards: [{ type: "performance-budget" }],
      });
    });
  });

  test("task:done triggers human-review when requires_human_review is true", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        defaultConfig({
          guards: {
            ...defaultConfig().guards,
            "human-review": {
              enabled: true,
              trigger: "manual",
              actions: ["pause-for-human"],
            },
          },
        }),
      );
      writeProgress(
        cwd,
        executingProgress({
          tasks: [
            {
              id: 1,
              title: "Review migration",
              status: "pending",
              requires_human_review: true,
            },
          ],
        }),
      );

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        guard_triggered: true,
        guard_type: "human-review",
        guards: [{ type: "human-review" }],
      });
    });
  });

  test.each([
    ["task:done", "done", ["task:done", "--id", "1"]],
    ["task:done", "failed", ["task:done", "--id", "1"]],
    ["task:done", "deferred", ["task:done", "--id", "1"]],
    [
      "task:fail",
      "done",
      ["task:fail", "--id", "1", "--reason", "tests failed"],
    ],
    [
      "task:fail",
      "failed",
      ["task:fail", "--id", "1", "--reason", "tests failed"],
    ],
    [
      "task:fail",
      "deferred",
      ["task:fail", "--id", "1", "--reason", "tests failed"],
    ],
    [
      "task:defer",
      "done",
      ["task:defer", "--id", "1", "--reason", "blocked externally"],
    ],
    [
      "task:defer",
      "failed",
      ["task:defer", "--id", "1", "--reason", "blocked externally"],
    ],
    [
      "task:defer",
      "deferred",
      ["task:defer", "--id", "1", "--reason", "blocked externally"],
    ],
  ] as const)(
    "%s rejects %s task status without modifying progress",
    (_command, status, args) => {
      withTempProject((cwd) => {
        writeConfig(cwd);
        const originalProgress = executingProgress({
          tasks: [
            {
              id: 1,
              title: `Already ${status}`,
              status,
              ...(status === "failed" ? { failure_reason: "tests failed" } : {}),
              ...(status === "deferred"
                ? { defer_reason: "blocked externally" }
                : {}),
            },
          ],
        });
        writeProgress(cwd, originalProgress);

        const result = runForge(cwd, [...args]);

        expect(result.status).toBe(1);
        expect(parseStdout(result)).toEqual({
          ok: false,
          error: `task 1 is ${status}, expected pending or in_progress`,
        });
        expect(readProgress(cwd)).toEqual(originalProgress);
      });
    },
  );

  test("guard:record appends guard-1 with task_range from tasks", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, [
        "guard:record",
        "--type",
        "batch-review",
        "--status",
        "passed",
        "--tasks",
        "1,2,3,4,5,6",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        guard: {
          id: "guard-1",
          type: "batch-review",
          task_range: [1, 6],
          status: "passed",
        },
      });
      expect(readProgress(cwd).guard_history).toHaveLength(1);
    });
  });

  test("guard:record rejects unknown task ids without modifying progress", () => {
    withTempProject((cwd) => {
      const originalProgress = executingProgress();
      writeProgress(cwd, originalProgress);

      const result = runForge(cwd, [
        "guard:record",
        "--type",
        "batch-review",
        "--status",
        "passed",
        "--tasks",
        "1,99",
      ]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "unknown task id: 99",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("guard:history returns guard entries", () => {
    withTempProject((cwd) => {
      writeProgress(
        cwd,
        executingProgress({
          guard_history: [
            {
              id: "guard-1",
              type: "batch-review",
              triggered_at: "2026-05-26T00:00:00.000Z",
              task_range: [1, 6],
              status: "passed",
            },
          ],
        }),
      );

      const result = runForge(cwd, ["guard:history"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        guards: [
          {
            id: "guard-1",
            type: "batch-review",
            triggered_at: "2026-05-26T00:00:00.000Z",
            task_range: [1, 6],
            status: "passed",
          },
        ],
      });
    });
  });

  test("unknown task id is rejected without modifying progress", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      const originalProgress = executingProgress();
      writeProgress(cwd, originalProgress);

      const result = runForge(cwd, ["task:start", "--id", "99"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "unknown task id: 99",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);
    });
  });

  test("task:start rejects non-pending except existing in_progress is idempotent", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      const originalProgress = executingProgress({
        tasks: [
          { id: 1, title: "Build parser", status: "done" },
          {
            id: 2,
            title: "Wire config",
            status: "in_progress",
            started_at: "2026-05-26T00:00:00.000Z",
          },
        ],
      });
      writeProgress(cwd, originalProgress);

      const rejected = runForge(cwd, ["task:start", "--id", "1"]);

      expect(rejected.status).toBe(1);
      expect(parseStdout(rejected)).toEqual({
        ok: false,
        error: "task 1 is done, expected pending or in_progress",
      });
      expect(readProgress(cwd)).toEqual(originalProgress);

      const idempotent = runForge(cwd, ["task:start", "--id", "2"]);

      expect(idempotent.status).toBe(0);
      expect(parseStdout(idempotent)).toMatchObject({
        ok: true,
        task: { id: 2, status: "in_progress" },
      });
      expect(task(2, readProgress(cwd)).started_at).toBe(
        "2026-05-26T00:00:00.000Z",
      );
    });
  });

  test("task:fail writes failure_reason", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, [
        "task:fail",
        "--id",
        "1",
        "--reason",
        "tests failed",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        task: { id: 1, status: "failed", failure_reason: "tests failed" },
      });
      expect(task(1, readProgress(cwd)).failure_reason).toBe("tests failed");
    });
  });

  test("task:defer writes defer_reason", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, [
        "task:defer",
        "--id",
        "1",
        "--reason",
        "blocked externally",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        task: { id: 1, status: "deferred", defer_reason: "blocked externally" },
      });
      expect(task(1, readProgress(cwd)).defer_reason).toBe("blocked externally");
    });
  });

});
