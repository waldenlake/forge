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
import { defaultConfig } from "../src/state/config.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-task-reset-"));
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
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: "", GEMINI_CLI: "" },
  });
}

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function writeProgress(cwd: string, progress: ForgeProgress): void {
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    `${JSON.stringify(progress, null, 2)}\n`,
    "utf8",
  );
}

function readProgress(cwd: string): ForgeProgress {
  return JSON.parse(
    readFileSync(join(cwd, ".forge", "progress.json"), "utf8"),
  ) as ForgeProgress;
}

function writeConfig(cwd: string): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(defaultConfig(), null, 2)}\n`,
    "utf8",
  );
}

function executingProgress(overrides: Partial<ForgeProgress> = {}): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "reset-test",
    status: "executing",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 2,
    completed_tasks: 0,
    tasks: [
      { id: 1, title: "Task one", status: "in_progress", started_at: "2026-06-01T01:00:00.000Z" },
      { id: 2, title: "Task two", status: "pending" },
    ],
    ...overrides,
  };
}

describe("task:reset command", () => {
  test("resets in_progress task to pending and clears started_at", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["task:reset", "--id", "1", "--reason", "interrupted by /bugfix"]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload).toMatchObject({
        ok: true,
        task: {
          id: 1,
          status: "pending",
          reset_reason: "interrupted by /bugfix",
        },
      });
      expect(payload.task.started_at).toBeUndefined();

      const progress = readProgress(cwd);
      const task = progress.tasks.find((t) => t.id === 1)!;
      expect(task.status).toBe("pending");
      expect(task.started_at).toBeUndefined();
      expect(task.reset_reason).toBe("interrupted by /bugfix");
    });
  });

  test("resets pending task to pending and records reason", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["task:reset", "--id", "2", "--reason", "re-plan needed"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        task: { id: 2, status: "pending", reset_reason: "re-plan needed" },
      });
    });
  });

  test("rejects reset on done task", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, executingProgress({
        tasks: [
          { id: 1, title: "Task one", status: "done", completed_at: "2026-06-01T02:00:00.000Z" },
          { id: 2, title: "Task two", status: "pending" },
        ],
      }));

      const result = runForge(cwd, ["task:reset", "--id", "1", "--reason", "try again"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        error: "task 1 is done, expected in_progress or pending",
      });
    });
  });

  test("rejects reset on failed task", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, executingProgress({
        tasks: [
          { id: 1, title: "Task one", status: "failed", failure_reason: "tests broke" },
          { id: 2, title: "Task two", status: "pending" },
        ],
      }));

      const result = runForge(cwd, ["task:reset", "--id", "1", "--reason", "try again"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        error: "task 1 is failed, expected in_progress or pending",
      });
    });
  });

  test("rejects reset outside executing status", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeProgress(cwd, {
        ...executingProgress(),
        status: "planning",
      });

      const result = runForge(cwd, ["task:reset", "--id", "1", "--reason", "nope"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        blocked_by: "status is not executing",
      });
    });
  });
});
