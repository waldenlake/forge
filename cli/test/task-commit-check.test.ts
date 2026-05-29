import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
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

function setupExecuting(cwd: string): void {
  mkdirSync(join(cwd, ".forge"), { recursive: true });
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    JSON.stringify(
      {
        version: "1.0",
        feature: "test-feature",
        status: "executing",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        spec_path: "spec.md",
        plan_path: "plan.md",
        total_tasks: 1,
        completed_tasks: 0,
        phase_complete_attempts: 0,
        tasks: [
          {
            id: 1,
            title: "Test task",
            status: "in_progress",
            started_at: "2026-01-01T00:00:00Z",
          },
        ],
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

describe("task:done commit tag validation", () => {
  test("task:done rejects when in git repo but no tagged commit", () => {
    withTempDir("forge-tcc-", (cwd) => {
      writeFileSync(join(cwd, ".gitconfig"), "", "utf8");
      git(cwd, ["init"]);
      git(cwd, ["config", "user.email", "forge@example.test"]);
      git(cwd, ["config", "user.name", "Forge Test"]);
      git(cwd, ["config", "commit.gpgsign", "false"]);
      setupExecuting(cwd);

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(1);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(false);
      expect(payload.error).toContain("[forge task-1]");
    });
  });

  test("task:done succeeds when tagged commit exists", () => {
    withTempDir("forge-tcc-", (cwd) => {
      writeFileSync(join(cwd, ".gitconfig"), "", "utf8");
      git(cwd, ["init"]);
      git(cwd, ["config", "user.email", "forge@example.test"]);
      git(cwd, ["config", "user.name", "Forge Test"]);
      git(cwd, ["config", "commit.gpgsign", "false"]);
      setupExecuting(cwd);

      // Create a file and commit it with the required forge tag
      writeFileSync(join(cwd, "task-1.txt"), "done\n", "utf8");
      git(cwd, ["add", "-A"]);
      git(cwd, ["commit", "-m", "feat: implement test task [forge task-1]"]);

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(true);
      expect(payload.task.id).toBe(1);
      expect(payload.task.status).toBe("done");
    });
  });

  test("task:done succeeds in non-git directory", () => {
    withTempDir("forge-tcc-", (cwd) => {
      // No git init — plain directory
      setupExecuting(cwd);

      const result = runForge(cwd, ["task:done", "--id", "1"]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(true);
      expect(payload.task.id).toBe(1);
      expect(payload.task.status).toBe("done");
    });
  });
});
