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

import { defaultConfig, type ForgeConfig } from "../src/state/config.js";
import { idleProgress, type ForgeProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-verify-summarize-"));
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

function writeConfig(cwd: string, config: ForgeConfig): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

function writeProgress(cwd: string, progress: ForgeProgress): void {
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    `${JSON.stringify(progress, null, 2)}\n`,
    "utf8",
  );
}

function executionCompleteProgress(): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "verify-summarize",
    status: "execution_complete",
    created_at: "2026-06-04T00:00:00.000Z",
    updated_at: "2026-06-04T00:00:00.000Z",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 1,
    completed_tasks: 1,
    tasks: [{ id: 1, title: "T1", status: "done" }],
  };
}

const passingNodeCmd = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;

function minimalConfig(): ForgeConfig {
  return defaultConfig({
    test_profiles: {
      default: { framework: "custom", command: passingNodeCmd, working_dir: "." },
    },
    gstack_installed: false,
    verify: {
      gstack_basic: { enabled: false },
      security_scan: { enabled: false },
      dependency_audit: { enabled: false },
      e2e: { enabled: false },
      visual_regression: { enabled: false },
      performance: { enabled: false },
    },
  });
}

describe("forge verify --summarize", () => {
  test("writes full report to .forge/reports/verify-<ISO>.json and returns structured summary", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, minimalConfig());
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify", "--summarize"]);
      const output = parseStdout(result);

      expect(result.status).toBe(0);
      expect(output.ok).toBe(true);

      // Summary should contain headline fields, not full results array
      expect(output).toHaveProperty("status");
      expect(output).toHaveProperty("failure_class");
      expect(output).toHaveProperty("attempts");
      expect(output).toHaveProperty("duration_ms");
      expect(output).toHaveProperty("report_path");
      // Counts of step entries by category
      expect(output).toHaveProperty("steps");
      expect(output.steps).toHaveProperty("passed");
      expect(output.steps).toHaveProperty("failed");
      expect(output.steps).toHaveProperty("skipped");

      // Summary should NOT carry the heavy detail
      expect(output).not.toHaveProperty("tests");
      expect(output).not.toHaveProperty("build");
      expect(output).not.toHaveProperty("results");

      // report_path should be in .forge/reports/ and use forward slashes
      expect(output.report_path).toMatch(
        /^\.forge\/reports\/verify-\d{4}-\d{2}-\d{2}T[\dZ\-\.]+\.json$/,
      );

      // The full report file should exist and contain the heavy detail
      const reportPath = join(cwd, output.report_path);
      expect(existsSync(reportPath)).toBe(true);
      const fullReport = JSON.parse(readFileSync(reportPath, "utf8"));
      expect(fullReport).toHaveProperty("results");
      expect(fullReport).toHaveProperty("tests");
      expect(fullReport.results).toBeInstanceOf(Array);
    });
  });

  test("--summarize creates .forge/reports directory if missing", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, minimalConfig());
      writeProgress(cwd, executionCompleteProgress());

      const reportsDir = join(cwd, ".forge", "reports");
      expect(existsSync(reportsDir)).toBe(false);

      const result = runForge(cwd, ["verify", "--summarize"]);
      const output = parseStdout(result);

      expect(result.status).toBe(0);
      expect(existsSync(reportsDir)).toBe(true);
      expect(existsSync(join(cwd, output.report_path))).toBe(true);
    });
  });

  test("without --summarize, behavior unchanged (full report in stdout)", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, minimalConfig());
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify"]);
      const output = parseStdout(result);

      expect(result.status).toBe(0);
      // Existing format: full results array in stdout
      expect(output).toHaveProperty("results");
      expect(output).toHaveProperty("tests");
      expect(output.results).toBeInstanceOf(Array);

      // No new .forge/reports/ directory created in legacy path
      const reportsDir = join(cwd, ".forge", "reports");
      expect(existsSync(reportsDir)).toBe(false);
    });
  });

  test("--summarize on failure: ok=false, failed step counts, report still on disk", () => {
    withTempProject((cwd) => {
      const failingCmd = `${JSON.stringify(process.execPath)} -e "process.exit(1)"`;
      writeConfig(
        cwd,
        defaultConfig({
          test_profiles: {
            default: { framework: "custom", command: failingCmd, working_dir: "." },
          },
          gstack_installed: false,
          verify: {
            gstack_basic: { enabled: false },
            security_scan: { enabled: false },
            dependency_audit: { enabled: false },
            e2e: { enabled: false },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }),
      );
      writeProgress(cwd, executionCompleteProgress());

      const result = runForge(cwd, ["verify", "--summarize"]);
      const output = parseStdout(result);

      expect(result.status).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.status).toBe("failed");
      expect(output.failure_class).toBe("implementation");
      expect(output.steps.failed).toBeGreaterThan(0);

      // Report file still written with full detail
      const reportPath = join(cwd, output.report_path);
      expect(existsSync(reportPath)).toBe(true);
      const fullReport = JSON.parse(readFileSync(reportPath, "utf8"));
      expect(fullReport.ok).toBe(false);
      expect(fullReport.results).toBeInstanceOf(Array);
    });
  });
});
