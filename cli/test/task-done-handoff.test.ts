import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempDir(prefix: string, run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), prefix));
  try {
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

const baseConfig = {
  version: "2.0",
  forge_cli_version: "0.2.0",
  memory_file: "AGENTS.md",
  project_type: "existing",
  test_profiles: {
    default: {
      framework: "vitest",
      command: "echo pass",
      working_dir: ".",
    },
  },
  guards: {
    "batch-review": {
      enabled: true,
      every_n_tasks: 6,
      actions: ["spec-compliance-review"],
    },
  },
};

function setupExecuting(cwd: string, opts: { tasks: any[]; completed_tasks?: number }): void {
  mkdirSync(join(cwd, ".forge"), { recursive: true });
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    JSON.stringify(baseConfig, null, 2),
    "utf8",
  );
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    JSON.stringify(
      {
        version: "1.0",
        feature: "handoff-feature",
        status: "executing",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        spec_path: "spec.md",
        plan_path: "plan.md",
        total_tasks: opts.tasks.length,
        completed_tasks: opts.completed_tasks ?? 0,
        phase_complete_attempts: 0,
        tasks: opts.tasks,
        guard_history: [],
        verification: {
          status: "pending",
          attempts: 0,
          last_run: null,
          report_path: null,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("task:done updates handoff.md", () => {
  test("after task:done, handoff.md reflects last_task=just-finished and next_task=next-pending", () => {
    withTempDir("forge-task-done-handoff-", (cwd) => {
      // Non-git directory keeps the test simple — task:done does not require
      // a tagged commit when not in a git repo.
      setupExecuting(cwd, {
        tasks: [
          {
            id: 1,
            title: "First task",
            status: "in_progress",
            started_at: "2026-01-01T00:00:00Z",
          },
          {
            id: 2,
            title: "Second task pending",
            status: "pending",
            tags: ["S001"],
          },
          { id: 3, title: "Third task pending", status: "pending" },
        ],
        completed_tasks: 0,
      });

      const result = runForge(cwd, ["task:done", "--id", "1"]);
      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(true);

      // handoff.md must exist after task:done success
      const handoffPath = join(cwd, ".forge", "handoff.md");
      expect(existsSync(handoffPath)).toBe(true);

      const handoff = readFileSync(handoffPath, "utf8");
      // Last task line reflects task 1 we just finished
      expect(handoff).toMatch(/Last task:\s*1\s*—\s*First task/);
      // Next task block points at the lowest-id pending task: task 2
      expect(handoff).toMatch(/Next task:[\s\S]*id:\s*2/);
      expect(handoff).toContain("Second task pending");
      expect(handoff).toMatch(/scenarios:\s*S001/);
      // Tasks ratio reflects the bumped completed_tasks
      expect(handoff).toMatch(/Tasks:\s+1\/3/);
    });
  });

  test("after the final task completes, next_task is —", () => {
    withTempDir("forge-task-done-handoff-", (cwd) => {
      setupExecuting(cwd, {
        tasks: [
          {
            id: 1,
            title: "Only task",
            status: "in_progress",
            started_at: "2026-01-01T00:00:00Z",
          },
        ],
        completed_tasks: 0,
      });

      const result = runForge(cwd, ["task:done", "--id", "1"]);
      expect(result.status).toBe(0);

      const handoff = readFileSync(
        join(cwd, ".forge", "handoff.md"),
        "utf8",
      );
      expect(handoff).toMatch(/Last task:\s*1\s*—\s*Only task/);
      expect(handoff).toMatch(/Next task:\s+—/);
    });
  });

  test("handoff.md is fully rewritten on every task:done (no stale content)", () => {
    withTempDir("forge-task-done-handoff-", (cwd) => {
      setupExecuting(cwd, {
        tasks: [
          {
            id: 1,
            title: "First task",
            status: "in_progress",
            started_at: "2026-01-01T00:00:00Z",
          },
          { id: 2, title: "Second task", status: "pending" },
        ],
        completed_tasks: 0,
      });

      // Pre-seed handoff.md with stale junk
      const handoffPath = join(cwd, ".forge", "handoff.md");
      writeFileSync(handoffPath, "STALE LEFTOVER\n", "utf8");

      runForge(cwd, ["task:done", "--id", "1"]);
      const handoff = readFileSync(handoffPath, "utf8");
      expect(handoff).not.toContain("STALE LEFTOVER");
      expect(handoff).toContain("# Forge Handoff");
    });
  });

  test("task:done JSON output is unchanged (handoff is a side effect, not a field)", () => {
    withTempDir("forge-task-done-handoff-", (cwd) => {
      setupExecuting(cwd, {
        tasks: [
          {
            id: 1,
            title: "T1",
            status: "in_progress",
            started_at: "2026-01-01T00:00:00Z",
          },
          { id: 2, title: "T2", status: "pending" },
        ],
      });

      const result = runForge(cwd, ["task:done", "--id", "1"]);
      const payload = parseStdout(result);
      // Existing fields preserved
      expect(payload.ok).toBe(true);
      expect(payload.task.id).toBe(1);
      expect(payload.task.status).toBe("done");
      expect(payload.completed_tasks).toBe(1);
      expect(payload).toHaveProperty("guard_triggered");
    });
  });
});
