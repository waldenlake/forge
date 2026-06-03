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

function withTempGitRepo(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-ctg-"));
  try {
    writeFileSync(join(cwd, ".gitconfig"), "", "utf8");
    git(cwd, ["init"]);
    git(cwd, ["config", "user.email", "forge@example.test"]);
    git(cwd, ["config", "user.name", "Forge Test"]);
    git(cwd, ["config", "commit.gpgsign", "false"]);

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
          guards: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    // Stage a file so git commit has something to commit
    writeFileSync(join(cwd, "dummy.txt"), "hello\n", "utf8");
    git(cwd, ["add", "-A"]);

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

function writeLastTest(
  cwd: string,
  opts: { ok: boolean; ageMs?: number },
): void {
  const at = new Date(Date.now() - (opts.ageMs ?? 0)).toISOString();
  writeFileSync(
    join(cwd, ".forge", "last-test.json"),
    JSON.stringify({ ok: opts.ok, at, passed: [], failed: [] }),
    "utf8",
  );
}

describe("commit test freshness gate", () => {
  test("commit proceeds when no last-test.json exists", () => {
    withTempGitRepo((cwd) => {
      // No last-test.json written — commit should still work
      // (need staged changes to actually commit)
      writeFileSync(join(cwd, "x.txt"), "x\n", "utf8");
      spawnSync("git", ["add", "x.txt"], { cwd, env: gitEnv(cwd) });

      const result = runForge(cwd, [
        "commit",
        "--message",
        "test",
        "--tag",
        "forge task-1",
      ]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(true);
    });
  });

  test("commit rejects when last test failed", () => {
    withTempGitRepo((cwd) => {
      writeLastTest(cwd, { ok: false });

      const result = runForge(cwd, [
        "commit",
        "--message",
        "test",
        "--tag",
        "forge task-1",
      ]);

      expect(result.status).toBe(1);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(false);
      expect(payload.error.toLowerCase()).toContain("failed");
    });
  });

  test("commit rejects when test results are stale", () => {
    withTempGitRepo((cwd) => {
      // 10 minutes ago = 600 000 ms (threshold is 5 min)
      writeLastTest(cwd, { ok: true, ageMs: 10 * 60 * 1000 });

      const result = runForge(cwd, [
        "commit",
        "--message",
        "test",
        "--tag",
        "forge task-1",
      ]);

      expect(result.status).toBe(1);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(false);
      expect(payload.error.toLowerCase()).toContain("stale");
    });
  });

  test("commit succeeds when test results are fresh and passing", () => {
    withTempGitRepo((cwd) => {
      writeLastTest(cwd, { ok: true, ageMs: 0 });

      const result = runForge(cwd, [
        "commit",
        "--message",
        "test",
        "--tag",
        "forge task-1",
      ]);

      expect(result.status).toBe(0);
      const payload = parseStdout(result);
      expect(payload.ok).toBe(true);
      expect(payload.message).toBe("test [forge task-1]");
    });
  });
});
