import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

function withTempGitRepo(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-git-"));

  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    writeFileSync(join(cwd, ".gitconfig"), "", "utf8");
    git(cwd, ["init"]);
    git(cwd, ["config", "user.email", "forge@example.test"]);
    git(cwd, ["config", "user.name", "Forge Test"]);
    git(cwd, ["config", "commit.gpgsign", "false"]);
    writeProgress(cwd, idleProgress());
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-audit-"));

  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    writeFileSync(join(cwd, ".gitconfig"), "", "utf8");
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function gitEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(cwd, ".gitconfig"),
  };
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: gitEnv(cwd),
  });

  expect(result.status).toBe(0);
}

function commitFile(cwd: string, path: string, content: string, message: string): void {
  writeFileSync(join(cwd, path), content, "utf8");
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-m", message]);
}

function runForge(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...gitEnv(cwd),
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

function writeLastTest(cwd: string, ok = true): void {
  writeFileSync(
    join(cwd, ".forge", "last-test.json"),
    JSON.stringify({ ok, at: new Date().toISOString(), passed: [], failed: [] }),
    "utf8",
  );
}

function executingProgress(overrides: Partial<ForgeProgress> = {}): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "runtime",
    status: "executing",
    created_at: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 2,
    completed_tasks: 1,
    tasks: [
      {
        id: 1,
        title: "Add git commands",
        status: "done",
        completed_at: "2026-05-26T00:00:00.000Z",
      },
      { id: 2, title: "Add docs", status: "pending" },
    ],
    ...overrides,
  };
}

describe("git, audit, and reset commands", () => {
  test("commit --message --tag stages tracked changes and commits with the forge tag", () => {
    withTempGitRepo((cwd) => {
      writeFileSync(join(cwd, "x.txt"), "x\n", "utf8");
      spawnSync("git", ["add", "x.txt"], { cwd, env: gitEnv(cwd) });
      writeLastTest(cwd);

      const result = runForge(cwd, [
        "commit",
        "--message",
        "Add x",
        "--tag",
        "forge task-1",
      ]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload).toMatchObject({
        ok: true,
        message: "Add x [forge task-1]",
      });
      expect(payload.hash).toMatch(/^[0-9a-f]{7,40}$/);

      const log = spawnSync("git", ["log", "-1", "--pretty=%s"], {
        cwd,
        encoding: "utf8",
        env: gitEnv(cwd),
      });
      expect(log.stdout.trim()).toBe("Add x [forge task-1]");
    });
  });

  test("commit rejects running from a nested Forge root inside a parent git repo", () => {
    withTempGitRepo((cwd) => {
      commitFile(cwd, "initial.txt", "initial\n", "Initial commit");
      mkdirSync(join(cwd, "nested", ".forge"), { recursive: true });
      writeProgress(join(cwd, "nested"), executingProgress());
      writeFileSync(join(cwd, "parent-change.txt"), "parent\n", "utf8");
      writeFileSync(join(cwd, "nested", "nested-change.txt"), "nested\n", "utf8");

      const result = runForge(join(cwd, "nested"), [
        "commit",
        "--message",
        "Add nested",
        "--tag",
        "forge task-1",
      ]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "forge commit must run from git root",
      });

      const log = spawnSync("git", ["log", "-1", "--pretty=%s"], {
        cwd,
        encoding: "utf8",
        env: gitEnv(cwd),
      });
      expect(log.stdout.trim()).toBe("Initial commit");
    });
  });

  test("commit returns nothing to commit when the worktree is clean", () => {
    withTempGitRepo((cwd) => {
      writeLastTest(cwd);
      commitFile(cwd, "initial.txt", "initial\n", "Initial commit");

      const result = runForge(cwd, [
        "commit",
        "--message",
        "Add x",
        "--tag",
        "forge task-1",
      ]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "nothing to commit",
      });
    });
  });

  test("commit:check reports found and missing forge task commits", () => {
    withTempGitRepo((cwd) => {
      commitFile(cwd, "task-1.txt", "done\n", "Add task [forge task-1]");

      const result = runForge(cwd, ["commit:check", "--task-ids", "1,2"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({
        ok: false,
        missing: [2],
        tasks: [
          {
            id: 1,
            status: "found",
            commit: {
              message: "Add task [forge task-1]",
            },
          },
          {
            id: 2,
            status: "missing",
            commit: null,
          },
        ],
      });
    });
  });

  test("audit reports progress state, done task commit status, and inconsistencies", () => {
    withTempGitRepo((cwd) => {
      commitFile(cwd, "task-1.txt", "done\n", "Add task [forge task-1]");
      writeProgress(
        cwd,
        executingProgress({
          total_tasks: 3,
          completed_tasks: 2,
          tasks: [
            { id: 1, title: "Add git commands", status: "done" },
            { id: 2, title: "Add reset command", status: "done" },
            { id: 3, title: "Add docs", status: "pending" },
          ],
          guard_history: [
            {
              id: "guard-1",
              type: "batch-review",
              triggered_at: "2026-05-26T00:00:00.000Z",
              task_range: [1, 2],
              status: "failed",
              notes: "review failed",
            },
          ],
        }),
      );

      const result = runForge(cwd, ["audit"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        progress: {
          status: "executing",
          feature: "runtime",
          total_tasks: 3,
          completed_tasks: 2,
        },
        phase: {
          status: "executing",
          done_tasks: 2,
          total_tasks: 3,
        },
        done_tasks: [
          {
            id: 1,
            title: "Add git commands",
            commit: {
              found: true,
              message: "Add task [forge task-1]",
            },
          },
          {
            id: 2,
            title: "Add reset command",
            commit: {
              found: false,
            },
          },
        ],
        inconsistencies: [
          {
            type: "missing_commit",
            task_id: 2,
          },
          {
            type: "guard_failed",
            guard_id: "guard-1",
          },
        ],
      });
    });
  });

  test("audit succeeds without progress", () => {
    withTempGitRepo((cwd) => {
      rmSync(join(cwd, ".forge", "progress.json"), { force: true });

      const result = runForge(cwd, ["audit"]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        progress: null,
        phase: null,
        done_tasks: [],
        inconsistencies: [],
      });
    });
  });

  test("audit fails clearly when progress exists outside a git repo", () => {
    withTempProject((cwd) => {
      writeProgress(
        cwd,
        executingProgress({
          tasks: [{ id: 1, title: "Done without git", status: "done" }],
        }),
      );

      const result = runForge(cwd, ["audit"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "not a git repository",
      });
    });
  });

  test("reset --backup copies existing progress and writes idle progress", () => {
    withTempGitRepo((cwd) => {
      const progress = executingProgress();
      writeProgress(cwd, progress);
      const originalPath = join(cwd, ".forge", "progress.json");
      const originalCopyPath = join(cwd, ".forge", "progress-original.json");
      copyFileSync(originalPath, originalCopyPath);

      const result = runForge(cwd, ["reset", "--backup"]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload).toMatchObject({
        ok: true,
        status: "idle",
      });
      expect(payload.backup_path).toMatch(
        /^\.forge\/backups\/progress-\d{4}-\d{2}-\d{2}T/,
      );
      expect(existsSync(join(cwd, payload.backup_path))).toBe(true);
      expect(readFileSync(join(cwd, payload.backup_path), "utf8")).toBe(
        readFileSync(originalCopyPath, "utf8"),
      );
      expect(readProgress(cwd)).toMatchObject({
        feature: null,
        status: "idle",
        total_tasks: 0,
        completed_tasks: 0,
        tasks: [],
      });
    });
  });

  test("reset --backup fails without existing Forge progress state", () => {
    withTempProject((cwd) => {
      rmSync(join(cwd, ".forge"), { recursive: true, force: true });

      const result = runForge(cwd, ["reset", "--backup"]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toEqual({
        ok: false,
        error: "forge project state not found",
      });
      expect(existsSync(join(cwd, ".forge", "progress.json"))).toBe(false);
    });
  });

  test("reset --backup archives .forge/reports/ contents and clears the directory", () => {
    withTempGitRepo((cwd) => {
      writeProgress(cwd, executingProgress());

      // Seed some report files
      const reportsDir = join(cwd, ".forge", "reports");
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(
        join(reportsDir, "test-2026-06-04T15-10-22.log"),
        "pytest output line 1\npytest output line 2\n",
        "utf8",
      );
      writeFileSync(
        join(reportsDir, "verify-2026-06-04T16-00-00.json"),
        '{"ok":true,"checks":[]}\n',
        "utf8",
      );

      const result = runForge(cwd, ["reset", "--backup"]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(true);
      expect(payload.status).toBe("idle");

      // The backup must include the seeded reports
      const backupReportsDir = join(
        cwd,
        ".forge",
        "backups",
        payload.reports_backup_dir,
      );
      expect(existsSync(backupReportsDir)).toBe(true);
      expect(
        readFileSync(
          join(backupReportsDir, "test-2026-06-04T15-10-22.log"),
          "utf8",
        ),
      ).toContain("pytest output line 1");
      expect(
        readFileSync(
          join(backupReportsDir, "verify-2026-06-04T16-00-00.json"),
          "utf8",
        ),
      ).toContain('"ok":true');

      // The original reports directory must be removed (or empty)
      const stillExists = existsSync(reportsDir);
      if (stillExists) {
        // If the impl chose to keep the dir, it must be empty
        const remaining = readdirSync(reportsDir);
        expect(remaining.length).toBe(0);
      }
    });
  });

  test("reset --backup is a no-op for reports when .forge/reports/ does not exist", () => {
    withTempGitRepo((cwd) => {
      writeProgress(cwd, executingProgress());

      const result = runForge(cwd, ["reset", "--backup"]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(true);
      // No reports_backup_dir field when no reports exist
      expect(payload.reports_backup_dir).toBeUndefined();
    });
  });
});
