import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import type { ForgeConfig } from "../src/state/config.js";
import { defaultConfig } from "../src/state/config.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-test-summarize-"));

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

let scriptCounter = 0;

/**
 * Writes a node script to disk in cwd/.forge/scripts/ and returns a command
 * that runs it. Writing to disk avoids the Windows cmd.exe quote/backslash
 * escape nightmare that breaks `node -e "..."` invocations.
 */
function nodeScriptCommand(cwd: string, script: string): string {
  const scriptsDir = join(cwd, ".forge", "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  scriptCounter += 1;
  const scriptPath = join(scriptsDir, `s${scriptCounter}.cjs`);
  writeFileSync(scriptPath, script, "utf8");
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)}`;
}

function writeConfig(cwd: string, config: ForgeConfig): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

function configWithProfiles(
  profiles: ForgeConfig["test_profiles"],
): ForgeConfig {
  return defaultConfig({ test_profiles: profiles });
}

/** Produces a command that writes stdout and exits with given code */
function testCommand(cwd: string, stdout: string, exitCode = 0): string {
  return nodeScriptCommand(
    cwd,
    `process.stdout.write(${JSON.stringify(stdout)}); process.exit(${exitCode});`,
  );
}

/** Produces a command that writes stdout and stderr, then exits */
function testCommandWithStderr(
  cwd: string,
  stdout: string,
  stderr: string,
  exitCode = 0,
): string {
  return nodeScriptCommand(
    cwd,
    `process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(stderr)}); process.exit(${exitCode});`,
  );
}

describe("forge test --summarize", () => {
  test("writes full output to .forge/reports/test-<ISO>.log and returns JSON summary", () => {
    withTempProject((cwd) => {
      const fakeOutput = "PASS src/app.test.ts\nTests: 3 passed, 3 total\n";
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: testCommand(cwd, fakeOutput),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--summarize"]);
      const output = parseStdout(result);

      // Should succeed
      expect(result.status).toBe(0);
      expect(output.ok).toBe(true);

      // Should have summary fields
      expect(output).toHaveProperty("passed");
      expect(output).toHaveProperty("failed");
      expect(output).toHaveProperty("skipped");
      expect(output).toHaveProperty("duration_ms");
      expect(output).toHaveProperty("failures");
      expect(output).toHaveProperty("report_path");

      // report_path should point to a file in .forge/reports/
      expect(output.report_path).toMatch(/^\.forge\/reports\/test-.+\.log$/);

      // The log file should exist and contain full stdout
      const logPath = join(cwd, output.report_path);
      expect(existsSync(logPath)).toBe(true);
      const logContent = readFileSync(logPath, "utf8");
      expect(logContent).toContain(fakeOutput);
    });
  });

  test("log file contains both stdout and stderr", () => {
    withTempProject((cwd) => {
      const stdout = "Test output line\n";
      const stderr = "Warning: something\n";
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: testCommandWithStderr(cwd, stdout, stderr),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--summarize"]);
      const output = parseStdout(result);

      expect(result.status).toBe(0);

      const logContent = readFileSync(join(cwd, output.report_path), "utf8");
      expect(logContent).toContain(stdout);
      expect(logContent).toContain(stderr);
    });
  });

  test("returns failures array with error truncated to 200 chars", () => {
    withTempProject((cwd) => {
      const longError = "E".repeat(300);
      const failOutput = `FAIL src/broken.test.ts\n  ✗ should work\n    Error: ${longError}\nTests: 1 failed, 1 total\n`;
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: testCommand(cwd, failOutput, 1),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--summarize"]);
      const output = parseStdout(result);

      expect(result.status).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.failures).toBeInstanceOf(Array);
      expect(output.failures.length).toBeGreaterThan(0);
      expect(output.failures.length).toBeLessThanOrEqual(5);

      // Each failure error should be ≤ 200 chars
      for (const failure of output.failures) {
        expect(failure.error.length).toBeLessThanOrEqual(200);
      }
    });
  });

  test("failures array is capped at 5 items", () => {
    withTempProject((cwd) => {
      // Simulate output with many failures
      const lines = Array.from({ length: 10 }, (_, i) =>
        `FAIL src/test${i}.test.ts\n  ✗ test case ${i}\n    Error: failure ${i}\n`,
      ).join("");
      const failOutput = `${lines}Tests: 10 failed, 10 total\n`;
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: testCommand(cwd, failOutput, 1),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--summarize"]);
      const output = parseStdout(result);

      expect(result.status).toBe(1);
      expect(output.failures.length).toBeLessThanOrEqual(5);
    });
  });

  test("--summarize with --all-profiles aggregates across profiles", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          unit: {
            framework: "vitest",
            command: testCommand(cwd, "Tests: 5 passed, 5 total\n"),
            working_dir: ".",
          },
          e2e: {
            framework: "vitest",
            command: testCommand(cwd, "Tests: 1 failed, 2 passed, 3 total\n", 1),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--all-profiles", "--summarize"]);
      const output = parseStdout(result);

      expect(result.status).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.report_path).toMatch(/^\.forge\/reports\/test-.+\.log$/);

      // Log should exist
      const logPath = join(cwd, output.report_path);
      expect(existsSync(logPath)).toBe(true);
    });
  });

  test("--summarize creates .forge/reports directory if it does not exist", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: testCommand(cwd, "Tests: 1 passed, 1 total\n"),
            working_dir: ".",
          },
        }),
      );

      // Ensure reports dir does NOT exist yet
      const reportsDir = join(cwd, ".forge", "reports");
      expect(existsSync(reportsDir)).toBe(false);

      const result = runForge(cwd, ["test", "--summarize"]);
      const output = parseStdout(result);

      expect(result.status).toBe(0);
      expect(existsSync(reportsDir)).toBe(true);
      expect(existsSync(join(cwd, output.report_path))).toBe(true);
    });
  });

  test("without --summarize, behavior unchanged (no report file, full profiles in output)", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: testCommand(cwd, "Tests: 1 passed, 1 total\n"),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test"]);
      const output = parseStdout(result);

      expect(result.status).toBe(0);
      // Original format: has profiles array, no report_path
      expect(output).toHaveProperty("profiles");
      expect(output).not.toHaveProperty("report_path");

      // No reports dir created
      const reportsDir = join(cwd, ".forge", "reports");
      expect(existsSync(reportsDir)).toBe(false);
    });
  });

  test("report filename contains ISO timestamp", () => {
    withTempProject((cwd) => {
      writeConfig(
        cwd,
        configWithProfiles({
          default: {
            framework: "vitest",
            command: testCommand(cwd, "Tests: 1 passed, 1 total\n"),
            working_dir: ".",
          },
        }),
      );

      const result = runForge(cwd, ["test", "--summarize"]);
      const output = parseStdout(result);

      // ISO format: test-2026-06-04T12:00:00.000Z.log (colons replaced for FS safety)
      expect(output.report_path).toMatch(
        /^\.forge\/reports\/test-\d{4}-\d{2}-\d{2}T[\dZ\-\.]+\.log$/,
      );
    });
  });
});
