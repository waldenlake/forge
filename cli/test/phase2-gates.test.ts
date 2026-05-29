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

import type { ForgeProgress } from "../src/state/progress.js";
import { idleProgress } from "../src/state/progress.js";
import { defaultConfig } from "../src/state/config.js";
import type { ForgeConfig } from "../src/state/config.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-p2gates-"));
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

function writeConfig(cwd: string, config: ForgeConfig = defaultConfig()): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

function executionCompleteProgress(
  overrides: Partial<ForgeProgress> = {},
): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "gates-test",
    status: "execution_complete",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 1,
    completed_tasks: 1,
    tasks: [{ id: 1, title: "Task 1", status: "done" }],
    ...overrides,
  };
}

describe("Phase 2 gate enforcement", () => {
  describe("forge verify entry gate", () => {
    test("verify blocks when status is not execution_complete", () => {
      withTempProject((cwd) => {
        writeConfig(cwd);
        writeProgress(cwd, {
          ...executionCompleteProgress(),
          status: "executing",
          completed_tasks: 0,
          tasks: [{ id: 1, title: "Task 1", status: "in_progress" }],
        });

        const result = runForge(cwd, ["verify"]);

        expect(result.status).toBe(1);
        expect(parseStdout(result)).toMatchObject({
          ok: false,
          blocked_by: "status is not execution_complete",
          from: "executing",
        });
      });
    });

    test("verify blocks when retry budget exhausted", () => {
      withTempProject((cwd) => {
        writeConfig(cwd);
        writeProgress(
          cwd,
          executionCompleteProgress({
            verification: {
              status: "failed",
              attempts: 3,
              last_run: "2026-06-01T00:00:00.000Z",
              report_path: null,
            },
          }),
        );

        const result = runForge(cwd, ["verify"]);

        expect(result.status).toBe(1);
        expect(parseStdout(result)).toMatchObject({
          ok: false,
          blocked_by: "retry_exhausted",
          attempts: 3,
          retry_limit: 3,
        });
      });
    });

    test("verify passes and includes failure_class in output", () => {
      withTempProject((cwd) => {
        const nodeCmd = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
        writeConfig(cwd, defaultConfig({
          test_profiles: {
            default: { framework: "custom", command: nodeCmd, working_dir: "." },
          },
          verify: {
            gstack_basic: { enabled: false },
            security_scan: { enabled: false },
            dependency_audit: { enabled: false },
            e2e: { enabled: false },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }));
        writeProgress(cwd, executionCompleteProgress());

        const result = runForge(cwd, ["verify"]);

        expect(result.status).toBe(0);
        const output = parseStdout(result);
        expect(output).toMatchObject({
          ok: true,
          status: "passed",
          failure_class: null,
          attempts: 0,
        });
        expect(output.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "tests", ok: true, class: null }),
          ]),
        );
      });
    });

    test("verify failure increments attempts and sets failure_class", () => {
      withTempProject((cwd) => {
        const failCmd = `${JSON.stringify(process.execPath)} -e "process.exit(1)"`;
        writeConfig(cwd, defaultConfig({
          test_profiles: {
            default: { framework: "custom", command: failCmd, working_dir: "." },
          },
          verify: {
            gstack_basic: { enabled: false },
            security_scan: { enabled: false },
            dependency_audit: { enabled: false },
            e2e: { enabled: false },
            visual_regression: { enabled: false },
            performance: { enabled: false },
          },
        }));
        writeProgress(cwd, executionCompleteProgress({
          verification: { status: "pending", attempts: 1, last_run: null, report_path: null },
        }));

        const result = runForge(cwd, ["verify"]);

        expect(result.status).toBe(1);
        const output = parseStdout(result);
        expect(output).toMatchObject({
          ok: false,
          status: "failed",
          failure_class: "implementation",
          attempts: 2,
        });
      });
    });
  });

  describe("phase:complete gate", () => {
    test("phase:complete blocks when phase_complete_attempts >= 3", () => {
      withTempProject((cwd) => {
        writeConfig(cwd);
        writeProgress(cwd, {
          ...idleProgress(),
          feature: "retry",
          status: "executing",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
          spec_path: "docs/spec.md",
          plan_path: "docs/plan.md",
          total_tasks: 1,
          completed_tasks: 1,
          phase_complete_attempts: 3,
          tasks: [{ id: 1, title: "Done task", status: "done" }],
        });

        const result = runForge(cwd, ["phase:complete"]);

        expect(result.status).toBe(1);
        expect(parseStdout(result)).toMatchObject({
          ok: false,
          blocked_by: "retry_exhausted",
          phase_complete_attempts: 3,
          retry_limit: 3,
        });
      });
    });
  });
});
